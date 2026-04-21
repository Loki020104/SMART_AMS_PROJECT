"""
Pydantic Schemas for Bulk Import/Delete Operations
Validates and serializes bulk operation requests and responses
"""

from typing import List, Optional, Literal
from datetime import datetime


class UserImportSchema:
    """Schema for individual user import"""
    
    def __init__(self, role: str, full_name: str, username: str, email: str, 
                 password: str, department: str, program: str,
                 section: Optional[str] = None, roll_no: Optional[str] = None,
                 employee_id: Optional[str] = None, designation: Optional[str] = None,
                 subjects: Optional[str] = None, semester: Optional[str] = None):
        self.role = role.lower()
        self.full_name = full_name.upper()
        self.username = username.strip()
        self.email = email.lower().strip()
        self.password = password
        self.department = department.upper()
        self.program = program.upper()
        self.section = (section or "").strip().upper()
        self.roll_no = (roll_no or "").strip().upper()
        self.employee_id = (employee_id or "").strip()
        self.designation = (designation or "").strip().upper()
        self.subjects = (subjects or "").strip()
        self.semester = (semester or "").strip()

    def to_dict(self) -> dict:
        return {
            "role": self.role,
            "full_name": self.full_name,
            "username": self.username,
            "email": self.email,
            "password": self.password,
            "department": self.department,
            "program": self.program,
            "section": self.section,
            "roll_no": self.roll_no,
            "employee_id": self.employee_id,
            "designation": self.designation,
            "subjects": self.subjects,
            "semester": self.semester,
        }

    @staticmethod
    def from_dict(data: dict) -> 'UserImportSchema':
        """Create schema from dictionary"""
        return UserImportSchema(**data)


class TimetableSlotSchema:
    """Schema for timetable slot import"""
    
    def __init__(self, slot_id: str, department: str, program: str, 
                 semester: str, class_name: str, day: str,
                 start_time: str, end_time: str, duration_hours: Optional[float] = None,
                 slot_type: str = "theory", course: Optional[str] = None,
                 faculty_id: Optional[str] = None, faculty_name: Optional[str] = None,
                 room: Optional[str] = None):
        self.slot_id = slot_id.strip()
        self.department = department.upper()
        self.program = program.upper()
        self.semester = semester.strip()
        self.class_name = class_name.strip()
        self.day = day.upper()
        self.start_time = start_time.strip()
        self.end_time = end_time.strip()
        self.duration_hours = duration_hours or 1.0
        self.slot_type = slot_type.lower()
        self.course = (course or "").strip()
        self.faculty_id = (faculty_id or "").strip()
        self.faculty_name = (faculty_name or "").strip()
        self.room = (room or "").strip()

    def to_dict(self) -> dict:
        return {
            "slot_id": self.slot_id,
            "department": self.department,
            "program": self.program,
            "semester": self.semester,
            "class_name": self.class_name,
            "day": self.day,
            "start_time": self.start_time,
            "end_time": self.end_time,
            "duration_hours": self.duration_hours,
            "slot_type": self.slot_type,
            "course": self.course,
            "faculty_id": self.faculty_id,
            "faculty_name": self.faculty_name,
            "room": self.room,
        }

    @staticmethod
    def from_dict(data: dict) -> 'TimetableSlotSchema':
        """Create schema from dictionary"""
        return TimetableSlotSchema(**data)


class BulkImportRequest:
    """Request schema for bulk import"""
    
    def __init__(self, users: List[dict], chunk_size: int = 300):
        self.users = users
        self.chunk_size = chunk_size
        self.timestamp = datetime.now()

    def validate_users(self) -> tuple[bool, Optional[str]]:
        """Validate request has users"""
        if not self.users:
            return False, "No users provided"
        if len(self.users) > 5000:
            return False, f"Too many users. Maximum 5000 per request, got {len(self.users)}"
        return True, None

    def to_dict(self) -> dict:
        return {
            "users": self.users,
            "chunk_size": self.chunk_size,
            "timestamp": self.timestamp.isoformat(),
        }


class BulkImportResult:
    """Response schema for bulk import"""
    
    def __init__(self, total: int, inserted: int, skipped: int, 
                 failed: int, errors: List[dict]):
        self.total = total
        self.inserted = inserted
        self.skipped = skipped
        self.failed = failed
        self.errors = errors
        self.timestamp = datetime.now()

    def to_dict(self) -> dict:
        return {
            "total": self.total,
            "inserted": self.inserted,
            "skipped": self.skipped,
            "failed": self.failed,
            "errors": self.errors,
            "timestamp": self.timestamp.isoformat(),
            "success_rate": f"{(self.inserted / self.total * 100):.1f}%" if self.total > 0 else "0%",
        }

    def to_json(self) -> dict:
        """Convert to JSON-serializable dict"""
        return self.to_dict()


class BulkDeleteRequest:
    """Request schema for bulk delete"""
    
    def __init__(self, usernames: Optional[List[str]] = None,
                 department: Optional[str] = None,
                 role: Optional[str] = None,
                 confirm: bool = False):
        self.usernames = usernames or []
        self.department = department
        self.role = role
        self.confirm = confirm
        self.timestamp = datetime.now()

    def validate(self) -> tuple[bool, Optional[str]]:
        """Validate delete request"""
        if not self.confirm:
            return False, "Confirm flag must be True for delete operations"
        
        if not self.usernames and not self.department and not self.role:
            return False, "Provide either usernames list, department, or role"
        
        return True, None

    def to_dict(self) -> dict:
        return {
            "usernames": self.usernames,
            "department": self.department,
            "role": self.role,
            "confirm": self.confirm,
        }


class BulkDeleteResult:
    """Response schema for bulk delete"""
    
    def __init__(self, deleted: int, errors: List[dict] = None, 
                 message: str = ""):
        self.deleted = deleted
        self.errors = errors or []
        self.message = message or f"{deleted} users deleted successfully"
        self.timestamp = datetime.now()

    def to_dict(self) -> dict:
        return {
            "deleted": self.deleted,
            "errors": self.errors,
            "message": self.message,
            "timestamp": self.timestamp.isoformat(),
        }

    def to_json(self) -> dict:
        """Convert to JSON-serializable dict"""
        return self.to_dict()


class BulkImportCSVRequest:
    """Request schema for CSV file import"""
    
    def __init__(self, file_content: str, file_name: str, 
                 import_type: Literal["users", "timetable"] = "users"):
        self.file_content = file_content
        self.file_name = file_name
        self.import_type = import_type
        self.timestamp = datetime.now()

    def validate(self) -> tuple[bool, Optional[str]]:
        """Validate CSV import request"""
        if not self.file_name.endswith(".csv"):
            return False, "Only CSV files are accepted"
        
        if not self.file_content:
            return False, "File content is empty"
        
        if self.import_type not in ["users", "timetable"]:
            return False, f"Invalid import type: {self.import_type}"
        
        return True, None


class BulkOperationStats:
    """Statistics for bulk operations"""
    
    def __init__(self, operation_type: str, total_records: int,
                 success_count: int, failure_count: int,
                 duration_seconds: float, records_per_second: float):
        self.operation_type = operation_type
        self.total_records = total_records
        self.success_count = success_count
        self.failure_count = failure_count
        self.duration_seconds = duration_seconds
        self.records_per_second = records_per_second
        self.success_rate = (success_count / total_records * 100) if total_records > 0 else 0
        self.timestamp = datetime.now()

    def to_dict(self) -> dict:
        return {
            "operation_type": self.operation_type,
            "total_records": self.total_records,
            "success_count": self.success_count,
            "failure_count": self.failure_count,
            "success_rate": f"{self.success_rate:.1f}%",
            "duration_seconds": round(self.duration_seconds, 2),
            "records_per_second": round(self.records_per_second, 2),
            "timestamp": self.timestamp.isoformat(),
        }
