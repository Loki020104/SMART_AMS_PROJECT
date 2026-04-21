"""
Enhanced Bulk Import/Delete Routes for Flask Backend
Integrates the advanced bulk operations with production endpoints
To integrate with backend.py, add these routes to your app
"""

from flask import request, jsonify
import logging
import time
from typing import Optional
from functools import wraps

from bulk_operations_enhanced import (
    bulk_import_users_sync,
    bulk_import_timetable,
    bulk_delete_users,
    parse_csv_users,
    parse_csv_timetable,
)
from schemas_bulk_operations import (
    BulkImportRequest,
    BulkImportResult,
    BulkDeleteRequest,
    BulkDeleteResult,
    BulkImportCSVRequest,
    BulkOperationStats,
)

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────
# INTEGRATION WITH EXISTING BACKEND
# ─────────────────────────────────────────────────────────────────
# To use these in backend.py, add to imports:
#     from bulk_routes_enhanced import register_bulk_routes
# Then in your app setup, call:
#     register_bulk_routes(app, db)
# ─────────────────────────────────────────────────────────────────


def require_auth(f):
    """Decorator to require authentication"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        auth_header = request.headers.get('Authorization')
        if not auth_header:
            return jsonify({"error": "Missing authorization"}), 401
        # Add your auth validation logic here
        return f(*args, **kwargs)
    return decorated_function


def timer(f):
    """Decorator to measure endpoint execution time"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        start = time.time()
        result = f(*args, **kwargs)
        duration = time.time() - start
        logger.info(f"{f.__name__} took {duration:.2f}s")
        return result
    return decorated_function


class BulkRoutesEnhanced:
    """Enhanced bulk import/delete routes"""
    
    def __init__(self, app, db):
        self.app = app
        self.db = db
        self._register_routes()

    def _register_routes(self):
        """Register all bulk operation routes"""
        
        # Bulk import users (JSON)
        @self.app.route("/api/v2/users/bulk-import", methods=["POST"])
        @require_auth
        @timer
        def bulk_import_users_v2():
            """
            Bulk import users from JSON payload
            
            Request body:
            {
                "users": [
                    {
                        "role": "student",
                        "full_name": "John Doe",
                        "username": "john_doe",
                        "email": "john@example.com",
                        "password": "pass123",
                        "department": "CSE",
                        "program": "B.Tech",
                        "roll_no": "201901001",
                        "semester": "1"
                    },
                    ...
                ],
                "chunk_size": 300
            }
            """
            try:
                data = request.get_json()
                
                if not data or "users" not in data:
                    return jsonify({"error": "Missing 'users' in request body"}), 400
                
                # Create request object
                import_req = BulkImportRequest(
                    users=data.get("users", []),
                    chunk_size=data.get("chunk_size", 300)
                )
                
                # Validate
                is_valid, error_msg = import_req.validate_users()
                if not is_valid:
                    return jsonify({"error": error_msg}), 400
                
                # Execute bulk import
                start_time = time.time()
                result_dict = bulk_import_users_sync(self.db, import_req.users)
                duration = time.time() - start_time
                
                # Create response
                result = BulkImportResult(
                    total=result_dict.get("total", 0),
                    inserted=result_dict.get("inserted", 0),
                    skipped=result_dict.get("skipped", 0),
                    failed=result_dict.get("failed", 0),
                    errors=result_dict.get("errors", [])
                )
                
                # Add statistics
                response_data = result.to_dict()
                response_data["duration_seconds"] = round(duration, 2)
                response_data["records_per_second"] = round((result.inserted / duration) if duration > 0 else 0, 2)
                
                logger.info(f"[API] Bulk import completed: {result.inserted}/{result.total} success")
                return jsonify(response_data), 200
            
            except Exception as e:
                logger.error(f"[API] Bulk import error: {str(e)}")
                return jsonify({"error": str(e), "type": type(e).__name__}), 500

        # Bulk import users (CSV)
        @self.app.route("/api/v2/users/bulk-import/csv", methods=["POST"])
        @require_auth
        @timer
        def bulk_import_users_csv_v2():
            """
            Bulk import users from CSV file
            
            Accepts multipart/form-data with:
                - file: CSV file with columns:
                  role, full_name, username, email, password, department, program, 
                  [optional] section, roll_no, semester, employee_id, designation, subjects
            """
            try:
                if "file" not in request.files:
                    return jsonify({"error": "No file provided"}), 400
                
                file = request.files["file"]
                
                if not file.filename.endswith(".csv"):
                    return jsonify({"error": "Only CSV files accepted"}), 400
                
                # Read and parse CSV
                file_content = file.read().decode("utf-8")
                users, parse_errors = parse_csv_users(file_content)
                
                if parse_errors:
                    return jsonify({
                        "error": "CSV parsing failed",
                        "details": parse_errors
                    }), 400
                
                # Execute bulk import
                start_time = time.time()
                result_dict = bulk_import_users_sync(self.db, users)
                duration = time.time() - start_time
                
                # Response
                result = BulkImportResult(
                    total=result_dict.get("total", 0),
                    inserted=result_dict.get("inserted", 0),
                    skipped=result_dict.get("skipped", 0),
                    failed=result_dict.get("failed", 0),
                    errors=result_dict.get("errors", [])
                )
                
                response_data = result.to_dict()
                response_data["duration_seconds"] = round(duration, 2)
                response_data["source"] = f"CSV: {file.filename}"
                
                logger.info(f"[API] CSV bulk import: {result.inserted}/{result.total} success from {file.filename}")
                return jsonify(response_data), 200
            
            except Exception as e:
                logger.error(f"[API] CSV bulk import error: {str(e)}")
                return jsonify({"error": str(e)}), 500

        # Bulk import timetable
        @self.app.route("/api/v2/timetable/bulk-import", methods=["POST"])
        @require_auth
        @timer
        def bulk_import_timetable_v2():
            """
            Bulk import timetable slots from JSON
            
            Request body:
            {
                "slots": [
                    {
                        "slot_id": "CSE-L1-B-MON-09",
                        "department": "CSE",
                        "program": "B.Tech",
                        "semester": "1",
                        "class_name": "B",
                        "day": "MON",
                        "start_time": "09:00",
                        "end_time": "11:00",
                        "duration_hours": 2,
                        "slot_type": "lab",
                        "course": "Data Structures",
                        "faculty_id": "cse001",
                        "faculty_name": "Dr. Smith",
                        "room": "LAB-01"
                    },
                    ...
                ]
            }
            """
            try:
                data = request.get_json()
                
                if not data or "slots" not in data:
                    return jsonify({"error": "Missing 'slots' in request body"}), 400
                
                slots = data.get("slots", [])
                
                # Execute bulk import
                start_time = time.time()
                result_dict = bulk_import_timetable(self.db, slots)
                duration = time.time() - start_time
                
                # Response
                result = BulkImportResult(
                    total=result_dict.get("total", 0),
                    inserted=result_dict.get("inserted", 0),
                    skipped=0,
                    failed=result_dict.get("failed", 0),
                    errors=result_dict.get("errors", [])
                )
                
                response_data = result.to_dict()
                response_data["duration_seconds"] = round(duration, 2)
                response_data["operation"] = "timetable_import"
                
                logger.info(f"[API] Timetable import: {result.inserted}/{result.total} slots")
                return jsonify(response_data), 200
            
            except Exception as e:
                logger.error(f"[API] Timetable import error: {str(e)}")
                return jsonify({"error": str(e)}), 500

        # Bulk import timetable (CSV)
        @self.app.route("/api/v2/timetable/bulk-import/csv", methods=["POST"])
        @require_auth
        @timer
        def bulk_import_timetable_csv_v2():
            """
            Bulk import timetable from CSV file
            
            CSV columns:
                slot_id, department, program, semester, class_name, day,
                start_time, end_time, duration_hours, slot_type, course,
                faculty_id, faculty_name, room
            """
            try:
                if "file" not in request.files:
                    return jsonify({"error": "No file provided"}), 400
                
                file = request.files["file"]
                
                if not file.filename.endswith(".csv"):
                    return jsonify({"error": "Only CSV files accepted"}), 400
                
                # Read and parse CSV
                file_content = file.read().decode("utf-8")
                slots, parse_errors = parse_csv_timetable(file_content)
                
                if parse_errors:
                    return jsonify({
                        "error": "CSV parsing failed",
                        "details": parse_errors
                    }), 400
                
                # Execute bulk import
                start_time = time.time()
                result_dict = bulk_import_timetable(self.db, slots)
                duration = time.time() - start_time
                
                # Response
                result = BulkImportResult(
                    total=result_dict.get("total", 0),
                    inserted=result_dict.get("inserted", 0),
                    skipped=0,
                    failed=result_dict.get("failed", 0),
                    errors=result_dict.get("errors", [])
                )
                
                response_data = result.to_dict()
                response_data["duration_seconds"] = round(duration, 2)
                response_data["source"] = f"CSV: {file.filename}"
                response_data["operation"] = "timetable_import"
                
                logger.info(f"[API] CSV timetable import: {result.inserted} slots from {file.filename}")
                return jsonify(response_data), 200
            
            except Exception as e:
                logger.error(f"[API] CSV timetable import error: {str(e)}")
                return jsonify({"error": str(e)}), 500

        # Bulk delete users
        @self.app.route("/api/v2/users/bulk-delete", methods=["POST"])
        @require_auth
        @timer
        def bulk_delete_users_v2():
            """
            Bulk delete users by username list or filter
            
            Request body (delete specific users):
            {
                "usernames": ["user1", "user2", "user3"],
                "confirm": true
            }
            
            Or delete by department:
            {
                "department": "CSE",
                "confirm": true
            }
            
            Or delete by role:
            {
                "role": "student",
                "confirm": true
            }
            """
            try:
                data = request.get_json()
                
                # Create delete request
                delete_req = BulkDeleteRequest(
                    usernames=data.get("usernames"),
                    department=data.get("department"),
                    role=data.get("role"),
                    confirm=data.get("confirm", False)
                )
                
                # Validate
                is_valid, error_msg = delete_req.validate()
                if not is_valid:
                    return jsonify({"error": error_msg}), 400
                
                # Execute bulk delete
                start_time = time.time()
                result_dict = bulk_delete_users(
                    self.db,
                    usernames=delete_req.usernames,
                    department=delete_req.department,
                    role=delete_req.role
                )
                duration = time.time() - start_time
                
                # Response
                result = BulkDeleteResult(
                    deleted=result_dict.get("deleted", 0),
                    errors=result_dict.get("errors", []),
                    message=result_dict.get("message", "")
                )
                
                response_data = result.to_dict()
                response_data["duration_seconds"] = round(duration, 2)
                
                logger.info(f"[API] Bulk delete: {result.deleted} users removed in {duration:.2f}s")
                return jsonify(response_data), 200
            
            except Exception as e:
                logger.error(f"[API] Bulk delete error: {str(e)}")
                return jsonify({"error": str(e)}), 500

        # Health check endpoint
        @self.app.route("/api/v2/health", methods=["GET"])
        def health_check_v2():
            """Health check endpoint for bulk operations"""
            return jsonify({
                "status": "ok",
                "module": "bulk_operations_enhanced",
                "version": "2.0.0"
            }), 200


def register_bulk_routes(app, db):
    """
    Register enhanced bulk operation routes with Flask app
    
    Usage in backend.py:
        from bulk_routes_enhanced import register_bulk_routes
        register_bulk_routes(app, db)
    """
    BulkRoutesEnhanced(app, db)
    logger.info("Enhanced bulk operation routes registered")
