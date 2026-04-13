"""
Compliance & Audit Trail APIs
Handles GDPR, FERPA, COPPA, and comprehensive audit logging
"""

from flask import jsonify, request
from datetime import datetime, timedelta
import uuid
import json
import hashlib

# Global Supabase instance - will be set during setup
_audit_sb = None

# ══════════════════════════════════════════════════════════════════════
# Helper function for audit logging throughout the application
# ══════════════════════════════════════════════════════════════════════

def log_audit_event(user_id, action, resource_type, details=None, ip_address=None, user_agent=None):
    """
    Log an audit event to the system.
    
    Args:
        user_id: ID of user performing action
        action: Action performed (e.g., "Login", "Attendance Marked", "User Created")
        resource_type: Type of resource affected (e.g., "Attendance", "User Management", "Financial")
        details: Additional details as dict or string
        ip_address: IP address of request
        user_agent: User agent string
    """
    global _audit_sb
    
    try:
        if not _audit_sb:
            return False
        
        audit_entry = {
            "audit_id": str(uuid.uuid4()),
            "user_id": user_id,
            "action": action,
            "resource_type": resource_type,
            "details": details if details else {},
            "ip_address": ip_address or "unknown",
            "user_agent": user_agent or "unknown",
            "timestamp": datetime.utcnow().isoformat(),
            "status": "completed"
        }
        
        result = _audit_sb.table("audit_logs").insert(audit_entry).execute()
        return True
    except Exception as e:
        print(f"[AUDIT] Error logging event: {e}")
        return False

def setup_compliance_apis(app, sb, config):
    """Register all compliance & audit API endpoints"""
    global _audit_sb
    _audit_sb = sb
    
    # ══════════════════════════════════════════════════════════════
    # AUDIT LOGGING
    # ══════════════════════════════════════════════════════════════
    
    @app.route("/api/audit/log", methods=["POST"])
    def create_audit_log():
        """Create an audit log entry"""
        try:
            if not sb:
                return jsonify(success=True, message="Audit disabled")
            
            d = request.json or {}
            
            audit_entry = {
                "audit_id": str(uuid.uuid4()),
                "user_id": d.get("user_id"),
                "action": d.get("action"),
                "resource_type": d.get("resource_type"),
                "resource_id": d.get("resource_id"),
                "changes": d.get("changes", {}),  # JSON of what changed
                "status": d.get("status", "success"),  # success, failure
                "ip_address": d.get("ip_address"),
                "user_agent": d.get("user_agent"),
                "timestamp": datetime.utcnow().isoformat(),
            }
            
            result = sb.table("audit_logs").insert(audit_entry).execute()
            return jsonify(success=True, audit_id=audit_entry["audit_id"])
        except Exception as e:
            return jsonify(success=False, error=str(e)), 500
    
    
    @app.route("/api/audit/logs", methods=["GET"])
    def get_audit_logs():
        """Retrieve audit logs with filtering"""
        try:
            if not sb:
                return jsonify(success=True, logs=[])
            
            user_id = request.args.get("user_id")
            resource_type = request.args.get("resource_type")
            start_date = request.args.get("start_date")
            end_date = request.args.get("end_date")
            limit = int(request.args.get("limit", 100))
            
            q = sb.table("audit_logs").select("*").order("timestamp", desc=True)
            
            if user_id:
                q = q.eq("user_id", user_id)
            if resource_type:
                q = q.eq("resource_type", resource_type)
            if start_date:
                q = q.gte("timestamp", start_date)
            if end_date:
                q = q.lte("timestamp", end_date)
            
            result = q.range(0, limit).execute()
            return jsonify(success=True, logs=result.data or [])
        except Exception as e:
            return jsonify(success=False, error=str(e)), 500
    
    
    # ══════════════════════════════════════════════════════════════
    # USER CONSENT MANAGEMENT
    # ══════════════════════════════════════════════════════════════
    
    @app.route("/api/consent/record", methods=["POST"])
    def record_user_consent():
        """Record user consent for data collection/processing"""
        try:
            if not sb:
                return jsonify(success=False, error="Database not available"), 500
            
            d = request.json or {}
            
            consent = {
                "consent_id": str(uuid.uuid4()),
                "user_id": d.get("user_id"),
                "consent_type": d.get("consent_type"),  # data_collection, marketing, analytics, etc.
                "version": d.get("version", "1.0"),
                "agreed": d.get("agreed", False),
                "ip_address": d.get("ip_address"),
                "user_agent": d.get("user_agent"),
                "timestamp": datetime.utcnow().isoformat(),
                "expires_at": d.get("expires_at"),  # Optional expiration
            }
            
            result = sb.table("user_consents").insert(consent).execute()
            return jsonify(success=True, consent_id=consent["consent_id"])
        except Exception as e:
            return jsonify(success=False, error=str(e)), 500
    
    
    @app.route("/api/consent/<user_id>", methods=["GET"])
    def get_user_consent(user_id):
        """Get user's consent records"""
        try:
            if not sb:
                return jsonify(success=True, consents=[])
            
            result = sb.table("user_consents").select("*").eq("user_id", user_id).order("timestamp", desc=True).execute()
            return jsonify(success=True, consents=result.data or [])
        except Exception as e:
            return jsonify(success=False, error=str(e)), 500
    
    
    # ══════════════════════════════════════════════════════════════
    # GDPR - DATA EXPORT
    # ══════════════════════════════════════════════════════════════
    
    @app.route("/api/compliance/gdpr/export-request", methods=["POST"])
    def request_gdpr_data_export():
        """Request personal data export (GDPR Right to Portability)"""
        try:
            if not sb:
                return jsonify(success=False, error="Database not available"), 500
            
            d = request.json or {}
            user_id = d.get("user_id")
            
            export_request = {
                "export_id": str(uuid.uuid4()),
                "user_id": user_id,
                "requested_at": datetime.utcnow().isoformat(),
                "status": "pending",  # pending, processing, completed
                "completion_date": None,
                "download_url": None,
            }
            
            result = sb.table("gdpr_export_requests").insert(export_request).execute()
            
            # Trigger async data collection
            # In production, this would queue a background job
            
            return jsonify(success=True, export_id=export_request["export_id"], message="Export request submitted")
        except Exception as e:
            return jsonify(success=False, error=str(e)), 500
    
    
    @app.route("/api/compliance/gdpr/export/<export_id>", methods=["GET"])
    def get_gdpr_export_status(export_id):
        """Get status of GDPR data export"""
        try:
            if not sb:
                return jsonify(success=False, error="Database not available"), 500
            
            result = sb.table("gdpr_export_requests").select("*").eq("export_id", export_id).execute()
            if result.data:
                return jsonify(success=True, export=result.data[0])
            return jsonify(success=False, error="Export not found"), 404
        except Exception as e:
            return jsonify(success=False, error=str(e)), 500
    
    
    # ══════════════════════════════════════════════════════════════
    # GDPR - DATA DELETION
    # ══════════════════════════════════════════════════════════════
    
    @app.route("/api/compliance/gdpr/deletion-request", methods=["POST"])
    def request_gdpr_data_deletion():
        """Request personal data deletion (GDPR Right to Erasure)"""
        try:
            if not sb:
                return jsonify(success=False, error="Database not available"), 500
            
            d = request.json or {}
            user_id = d.get("user_id")
            reason = d.get("reason", "user_requested")
            
            deletion_request = {
                "deletion_id": str(uuid.uuid4()),
                "user_id": user_id,
                "reason": reason,
                "requested_at": datetime.utcnow().isoformat(),
                "status": "pending",  # pending, approved, denied, completed
                "reviewed_by": None,
                "reviewed_at": None,
            }
            
            result = sb.table("gdpr_deletion_requests").insert(deletion_request).execute()
            
            return jsonify(success=True, deletion_id=deletion_request["deletion_id"], message="Deletion request submitted")
        except Exception as e:
            return jsonify(success=False, error=str(e)), 500
    
    
    @app.route("/api/compliance/gdpr/deletion/<deletion_id>/approve", methods=["POST"])
    def approve_gdpr_deletion(deletion_id):
        """Approve a GDPR deletion request"""
        try:
            if not sb:
                return jsonify(success=False, error="Database not available"), 500
            
            d = request.json or {}
            
            # Get deletion request
            req = sb.table("gdpr_deletion_requests").select("*").eq("deletion_id", deletion_id).execute()
            if not req.data:
                return jsonify(success=False, error="Deletion request not found"), 404
            
            user_id = req.data[0]["user_id"]
            
            # Mark for deletion
            deletion_date = (datetime.utcnow() + timedelta(days=int(config.get("compliance.gdpr_grace_period_days", 0)))).isoformat()
            
            sb.table("gdpr_deletion_requests").update({
                "status": "approved",
                "reviewed_by": d.get("reviewed_by"),
                "reviewed_at": datetime.utcnow().isoformat(),
                "scheduled_deletion": deletion_date,
            }).eq("deletion_id", deletion_id).execute()
            
            return jsonify(success=True, message="Deletion request approved", scheduled_deletion=deletion_date)
        except Exception as e:
            return jsonify(success=False, error=str(e)), 500
    
    
    # ══════════════════════════════════════════════════════════════
    # FERPA - EDUCATION RECORDS
    # ══════════════════════════════════════════════════════════════
    
    @app.route("/api/compliance/ferpa/record-access", methods=["POST"])
    def log_education_record_access():
        """Log access to student education records (FERPA)"""
        try:
            if not sb:
                return jsonify(success=True, message="FERPA logging disabled")
            
            d = request.json or {}
            
            access_log = {
                "access_id": str(uuid.uuid4()),
                "student_id": d.get("student_id"),
                "accessor_id": d.get("accessor_id"),
                "accessor_role": d.get("accessor_role"),  # faculty, admin, parent, etc.
                "record_type": d.get("record_type"),  # grades, health, disciplinary, etc.
                "purpose": d.get("purpose"),
                "timestamp": datetime.utcnow().isoformat(),
                "ip_address": d.get("ip_address"),
            }
            
            result = sb.table("ferpa_access_logs").insert(access_log).execute()
            return jsonify(success=True, access_id=access_log["access_id"])
        except Exception as e:
            return jsonify(success=False, error=str(e)), 500
    
    
    @app.route("/api/compliance/ferpa/access-log/<student_id>", methods=["GET"])
    def get_education_record_access_log(student_id):
        """Get access log for a student's education records"""
        try:
            if not sb:
                return jsonify(success=True, logs=[])
            
            result = sb.table("ferpa_access_logs").select("*").eq("student_id", student_id).order("timestamp", desc=True).execute()
            return jsonify(success=True, logs=result.data or [])
        except Exception as e:
            return jsonify(success=False, error=str(e)), 500
    
    
    # ══════════════════════════════════════════════════════════════
    # COPPA - CHILDREN'S PRIVACY
    # ══════════════════════════════════════════════════════════════
    
    @app.route("/api/compliance/coppa/verify-age", methods=["POST"])
    def verify_user_age():
        """Verify user age for COPPA compliance"""
        try:
            if not sb:
                return jsonify(success=False, error="Database not available"), 500
            
            d = request.json or {}
            user_id = d.get("user_id")
            date_of_birth = d.get("date_of_birth")
            
            # Calculate age
            dob = datetime.fromisoformat(date_of_birth.replace('Z', '+00:00'))
            age = (datetime.utcnow() - dob).days // 365
            
            is_adult = age >= 13  # COPPA threshold
            requires_parental_consent = age < 13
            
            # Log verification
            if sb:
                sb.table("coppa_verifications").insert({
                    "verification_id": str(uuid.uuid4()),
                    "user_id": user_id,
                    "age": age,
                    "is_adult": is_adult,
                    "requires_parental_consent": requires_parental_consent,
                    "verified_at": datetime.utcnow().isoformat(),
                }).execute()
            
            return jsonify(
                success=True,
                age=age,
                is_adult=is_adult,
                requires_parental_consent=requires_parental_consent
            )
        except Exception as e:
            return jsonify(success=False, error=str(e)), 500
    
    
    @app.route("/api/compliance/coppa/parental-consent", methods=["POST"])
    def record_parental_consent():
        """Record parental consent for child account"""
        try:
            if not sb:
                return jsonify(success=False, error="Database not available"), 500
            
            d = request.json or {}
            
            consent = {
                "consent_id": str(uuid.uuid4()),
                "child_id": d.get("child_id"),
                "parent_email": d.get("parent_email"),
                "parent_name": d.get("parent_name"),
                "consent_text": d.get("consent_text"),
                "verification_method": d.get("verification_method"),  # email, form, etc.
                "verified_at": d.get("verified_at"),
                "created_at": datetime.utcnow().isoformat(),
            }
            
            result = sb.table("parental_consents").insert(consent).execute()
            return jsonify(success=True, consent_id=consent["consent_id"])
        except Exception as e:
            return jsonify(success=False, error=str(e)), 500
    
    
    # ══════════════════════════════════════════════════════════════
    # COMPLIANCE REPORTS
    # ══════════════════════════════════════════════════════════════
    
    @app.route("/api/compliance/report", methods=["GET"])
    def generate_compliance_report():
        """Generate compliance report"""
        try:
            if not sb:
                return jsonify(success=False, error="Database not available"), 500
            
            report_type = request.args.get("type", "summary")  # summary, gdpr, ferpa, coppa
            start_date = request.args.get("start_date")
            end_date = request.args.get("end_date")
            
            report = {
                "report_id": str(uuid.uuid4()),
                "type": report_type,
                "period": {"start": start_date, "end": end_date},
                "generated_at": datetime.utcnow().isoformat(),
                "sections": {}
            }
            
            if report_type in ["summary", "gdpr"]:
                # GDPR metrics
                export_reqs = sb.table("gdpr_export_requests").select("status").execute().data or []
                deletion_reqs = sb.table("gdpr_deletion_requests").select("status").execute().data or []
                
                report["sections"]["gdpr"] = {
                    "export_requests": len(export_reqs),
                    "completion_rate": str(sum(1 for r in export_reqs if r.get("status") == "completed") / max(len(export_reqs), 1) * 100),
                    "deletion_requests": len(deletion_reqs),
                }
            
            if report_type in ["summary", "ferpa"]:
                # FERPA metrics
                access_logs = sb.table("ferpa_access_logs").select("accessor_role").execute().data or []
                
                report["sections"]["ferpa"] = {
                    "total_accesses": len(access_logs),
                    "by_role": {}
                }
                for log in access_logs:
                    role = log.get("accessor_role", "unknown")
                    report["sections"]["ferpa"]["by_role"][role] = report["sections"]["ferpa"]["by_role"].get(role, 0) + 1
            
            if report_type in ["summary", "coppa"]:
                # COPPA metrics
                verifications = sb.table("coppa_verifications").select("*").execute().data or []
                
                report["sections"]["coppa"] = {
                    "total_verifications": len(verifications),
                    "minors_requiring_consent": sum(1 for v in verifications if v.get("requires_parental_consent")),
                }
            
            return jsonify(success=True, report=report)
        except Exception as e:
            return jsonify(success=False, error=str(e)), 500
    
    
    # ══════════════════════════════════════════════════════════════
    # DATA MINIMIZATION & RETENTION
    # ══════════════════════════════════════════════════════════════
    
    @app.route("/api/compliance/retention-policy", methods=["GET"])
    def get_retention_policies():
        """Get data retention policies"""
        try:
            policies = {
                "audit_logs": config.get("compliance.audit_retention_days", 365),
                "attendance_records": config.get("compliance.attendance_retention_days", 2555),  # 7 years
                "email_logs": config.get("compliance.email_retention_days", 365),
                "access_logs": config.get("compliance.access_retention_days", 365),
                "temp_uploads": config.get("compliance.temp_file_retention_days", 7),
            }
            return jsonify(success=True, policies=policies)
        except Exception as e:
            return jsonify(success=False, error=str(e)), 500
    
    
    @app.route("/api/compliance/cleanup", methods=["POST"])
    def trigger_data_cleanup():
        """Trigger cleanup of expired data based on retention policies"""
        try:
            if not sb:
                return jsonify(success=True, message="Cleanup disabled")
            
            cleanup_results = {}
            
            # Clean audit logs
            audit_retention = config.get("compliance.audit_retention_days", 365)
            cutoff_date = (datetime.utcnow() - timedelta(days=audit_retention)).isoformat()
            # Delete logic would go here
            cleanup_results["audit_logs_deleted"] = 0
            
            # Clean temp files
            # Clean expired consents
            # Clean access logs beyond retention period
            
            return jsonify(success=True, cleanup_results=cleanup_results)
        except Exception as e:
            return jsonify(success=False, error=str(e)), 500
