"""
RBAC Analytics API Routes - Add these to backend.py
Handles all role-based analytics endpoints
"""

from flask import request, jsonify
from role_based_access_control import (
    require_role, require_minimum_role, get_user_scope, 
    get_accessible_students, get_accessible_classes, has_permission
)
from analytics_rbac import (
    get_class_wise_analytics, get_subject_wise_analytics, get_student_wise_analytics,
    get_faculty_performance_analytics, get_at_risk_students,
    get_daily_report, get_weekly_report, get_monthly_report, get_compliance_report
)


# ── CLASS-WISE ANALYTICS ──
def register_rbac_analytics_routes(app, sb=None):
    """Register all RBAC analytics routes with Flask app"""
    
    @app.route("/api/analytics-rbac/class-wise", methods=["GET"])
    def analytics_class_wise():
        """Get class-wise attendance analytics"""
        try:
            user = request.user if hasattr(request, 'user') else None
            if not user:
                return jsonify(success=False, error="Unauthorized"), 401
            
            class_id = request.args.get('class_id')
            date_from = request.args.get('date_from')
            date_to = request.args.get('date_to')
            
            analytics = get_class_wise_analytics(sb, user, class_id, date_from, date_to)
            
            return jsonify(
                success=True,
                analytics_type="class_wise",
                data=analytics,
                count=len(analytics)
            )
        
        except Exception as e:
            return jsonify(success=False, error=str(e)), 500
    
    
    @app.route("/api/analytics-rbac/subject-wise", methods=["GET"])
    def analytics_subject_wise():
        """Get subject-wise attendance analytics"""
        try:
            user = request.user if hasattr(request, 'user') else None
            if not user:
                return jsonify(success=False, error="Unauthorized"), 401
            
            subject_id = request.args.get('subject_id')
            date_from = request.args.get('date_from')
            date_to = request.args.get('date_to')
            
            analytics = get_subject_wise_analytics(sb, user, subject_id, date_from, date_to)
            
            return jsonify(
                success=True,
                analytics_type="subject_wise",
                data=analytics,
                count=len(analytics)
            )
        
        except Exception as e:
            return jsonify(success=False, error=str(e)), 500
    
    
    @app.route("/api/analytics-rbac/student-wise", methods=["GET"])
    def analytics_student_wise():
        """Get student-wise attendance trends"""
        try:
            user = request.user if hasattr(request, 'user') else None
            if not user:
                return jsonify(success=False, error="Unauthorized"), 401
            
            student_roll = request.args.get('roll_no')
            days = int(request.args.get('days', 30))
            
            analytics = get_student_wise_analytics(sb, user, student_roll, days)
            
            return jsonify(
                success=True,
                analytics_type="student_wise",
                data=analytics,
                count=len(analytics)
            )
        
        except Exception as e:
            return jsonify(success=False, error=str(e)), 500
    
    
    @app.route("/api/analytics-rbac/faculty-performance", methods=["GET"])
    def analytics_faculty_performance():
        """Get faculty performance metrics"""
        try:
            user = request.user if hasattr(request, 'user') else None
            if not user:
                return jsonify(success=False, error="Unauthorized"), 401
            
            # Check permission
            user_role = user.get('role', 'student').lower()
            if not has_permission(user_role, 'view_all_analytics'):
                # Faculty can only view their own metrics
                if user_role != 'faculty':
                    return jsonify(success=False, error="Permission denied"), 403
            
            faculty_id = request.args.get('faculty_id')
            
            analytics = get_faculty_performance_analytics(sb, user, faculty_id)
            
            return jsonify(
                success=True,
                analytics_type="faculty_performance",
                data=analytics,
                count=len(analytics)
            )
        
        except Exception as e:
            return jsonify(success=False, error=str(e)), 500
    
    
    @app.route("/api/analytics-rbac/at-risk-students", methods=["GET"])
    def analytics_at_risk_students():
        """Get students with low attendance (at-risk)"""
        try:
            user = request.user if hasattr(request, 'user') else None
            if not user:
                return jsonify(success=False, error="Unauthorized"), 401
            
            threshold = float(request.args.get('threshold', 75))
            
            analytics = get_at_risk_students(sb, user, threshold)
            
            return jsonify(
                success=True,
                analytics_type="at_risk_students",
                threshold=threshold,
                data=analytics,
                count=len(analytics)
            )
        
        except Exception as e:
            return jsonify(success=False, error=str(e)), 500
    
    
    @app.route("/api/analytics-rbac/daily-report", methods=["GET"])
    def analytics_daily_report():
        """Get daily attendance report"""
        try:
            user = request.user if hasattr(request, 'user') else None
            if not user:
                return jsonify(success=False, error="Unauthorized"), 401
            
            date = request.args.get('date')
            
            report = get_daily_report(sb, user, date)
            
            return jsonify(
                success=True,
                report_type="daily",
                data=report
            )
        
        except Exception as e:
            return jsonify(success=False, error=str(e)), 500
    
    
    @app.route("/api/analytics-rbac/weekly-report", methods=["GET"])
    def analytics_weekly_report():
        """Get weekly attendance report"""
        try:
            user = request.user if hasattr(request, 'user') else None
            if not user:
                return jsonify(success=False, error="Unauthorized"), 401
            
            weeks_back = int(request.args.get('weeks', 4))
            
            report = get_weekly_report(sb, user, weeks_back)
            
            return jsonify(
                success=True,
                report_type="weekly",
                data=report,
                count=len(report)
            )
        
        except Exception as e:
            return jsonify(success=False, error=str(e)), 500
    
    
    @app.route("/api/analytics-rbac/monthly-report", methods=["GET"])
    def analytics_monthly_report():
        """Get monthly attendance report"""
        try:
            user = request.user if hasattr(request, 'user') else None
            if not user:
                return jsonify(success=False, error="Unauthorized"), 401
            
            months_back = int(request.args.get('months', 3))
            
            report = get_monthly_report(sb, user, months_back)
            
            return jsonify(
                success=True,
                report_type="monthly",
                data=report,
                count=len(report)
            )
        
        except Exception as e:
            return jsonify(success=False, error=str(e)), 500
    
    
    @app.route("/api/analytics-rbac/compliance-report", methods=["GET"])
    def analytics_compliance_report():
        """Get compliance report (students meeting attendance requirements)"""
        try:
            user = request.user if hasattr(request, 'user') else None
            if not user:
                return jsonify(success=False, error="Unauthorized"), 401
            
            min_attendance = float(request.args.get('min_attendance', 75))
            
            report = get_compliance_report(sb, user, min_attendance)
            
            return jsonify(
                success=True,
                report_type="compliance",
                data=report
            )
        
        except Exception as e:
            return jsonify(success=False, error=str(e)), 500
    
    
    @app.route("/api/analytics-rbac/dashboard-summary", methods=["GET"])
    def analytics_dashboard_summary():
        """Get summary data for dashboard (all metrics)"""
        try:
            user = request.user if hasattr(request, 'user') else None
            if not user:
                return jsonify(success=False, error="Unauthorized"), 401
            
            user_role = user.get('role', 'student').lower()
            
            # Get all accessible data
            class_data = get_class_wise_analytics(sb, user) if has_permission(user_role, 'view_all_analytics') else []
            student_data = get_student_wise_analytics(sb, user)
            at_risk_data = get_at_risk_students(sb, user)
            daily = get_daily_report(sb, user)
            faculty_data = get_faculty_performance_analytics(sb, user) if user_role in ['admin', 'dean', 'hod'] else []
            
            # Calculate quick stats
            total_students = len(student_data)
            at_risk_count = len(at_risk_data)
            total_attendance_percentage = (sum(s.get('attendance_percentage', 0) for s in student_data) / total_students) if total_students > 0 else 0
            
            summary = {
                'user_role': user_role,
                'total_students': total_students,
                'at_risk_count': at_risk_count,
                'total_attendance_percentage': round(total_attendance_percentage, 2),
                'daily_marked': daily.get('total_marked', 0),
                'faculty_count': len(faculty_data),
                'class_count': len(class_data),
                'verification_rate': daily.get('verification_percentage', 0),
            }
            
            return jsonify(
                success=True,
                dashboard_summary=summary,
                class_data=class_data[:10] if class_data else [],  # Top 10
                at_risk_students=at_risk_data[:10] if at_risk_data else [],  # Top 10
                faculty_data=faculty_data[:5] if faculty_data else [],  # Top 5
            )
        
        except Exception as e:
            return jsonify(success=False, error=str(e)), 500
    
    
    @app.route("/api/analytics-rbac/export-report", methods=["POST"])
    def analytics_export_report():
        """Export analytics report in requested format"""
        try:
            user = request.user if hasattr(request, 'user') else None
            if not user:
                return jsonify(success=False, error="Unauthorized"), 401
            
            report_type = request.json.get('report_type', 'summary')  # summary, detailed, compliance
            export_format = request.json.get('format', 'json')  # json, csv, pdf
            
            # Generate report based on type
            if report_type == 'summary':
                data = {
                    'class_wise': get_class_wise_analytics(sb, user),
                    'student_wise': get_student_wise_analytics(sb, user),
                    'faculty_performance': get_faculty_performance_analytics(sb, user),
                }
            elif report_type == 'compliance':
                data = get_compliance_report(sb, user)
            elif report_type == 'detailed':
                data = {
                    'daily': get_daily_report(sb, user),
                    'weekly': get_weekly_report(sb, user),
                    'monthly': get_monthly_report(sb, user),
                    'at_risk': get_at_risk_students(sb, user),
                }
            else:
                data = {}
            
            # Return based on format (add actual export logic if needed)
            if export_format == 'json':
                return jsonify(success=True, report_type=report_type, data=data)
            else:
                return jsonify(success=True, message=f"Export {export_format} not yet implemented"), 200
        
        except Exception as e:
            return jsonify(success=False, error=str(e)), 500
    
    
    print("[RBAC] ✓ All analytics RBAC routes registered")


# Instructions for integration in backend.py:
# 1. Add imports at the top:
#    from role_based_access_control import apply_rbac_middleware
#    from analytics_rbac_routes import register_rbac_analytics_routes
#
# 2. After app initialization, before run():
#    apply_rbac_middleware(app)
#    register_rbac_analytics_routes(app, sb=sb)
#
# 3. Update your authentication middleware to set request.user
#    Example:
#    @app.before_request
#    def load_user_context():
#        # Extract from Firebase token, session, or header
#        token = request.headers.get('Authorization', '')
#        if token.startswith('Bearer '):
#            # Verify and decode token
#            request.user = decoded_token_claims
