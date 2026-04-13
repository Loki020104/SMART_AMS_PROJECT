"""
Analytics & Reporting APIs
Handles attendance analytics, academic performance, predictive analysis, and dashboards
"""

from flask import jsonify, request
from datetime import datetime, timedelta
import uuid


def setup_analytics_apis(app, sb, config):
    """Register all analytics & reporting API endpoints"""
    
    # ══════════════════════════════════════════════════════════════
    # ATTENDANCE ANALYTICS
    # ══════════════════════════════════════════════════════════════
    
    @app.route("/api/analytics/attendance/summary", methods=["GET"])
    def get_attendance_summary():
        """Get attendance summary statistics"""
        try:
            if not sb:
                return jsonify(success=True, summary={})
            
            period = request.args.get("period", "month")  # week, month, semester
            department = request.args.get("department")
            batch = request.args.get("batch")
            
            # Calculate date range
            if period == "week":
                start_date = (datetime.utcnow() - timedelta(days=7)).isoformat()
            elif period == "month":
                start_date = (datetime.utcnow() - timedelta(days=30)).isoformat()
            else:  # semester
                start_date = (datetime.utcnow() - timedelta(days=120)).isoformat()
            
            # Get attendance records
            q = sb.table("attendance").select("*").gte("marked_at", start_date)
            
            if department:
                q = q.eq("department", department)
            if batch:
                q = q.eq("batch", batch)
            
            records = q.execute().data or []
            
            # Calculate statistics
            total = len(records)
            present = sum(1 for r in records if r.get("status") == "present")
            absent = sum(1 for r in records if r.get("status") == "absent")
            leave = sum(1 for r in records if r.get("status") == "leave")
            
            percentage = (present / max(total, 1)) * 100 if total > 0 else 0
            
            return jsonify(
                success=True,
                summary={
                    "period": period,
                    "total_records": total,
                    "present": present,
                    "absent": absent,
                    "leave": leave,
                    "percentage": round(percentage, 2),
                }
            )
        except Exception as e:
            return jsonify(success=False, error=str(e)), 500
    
    
    @app.route("/api/analytics/attendance/student/<roll_no>", methods=["GET"])
    def get_student_attendance_analytics(roll_no):
        """Get detailed attendance analytics for a student"""
        try:
            if not sb:
                return jsonify(success=True, analytics={})
            
            semester = request.args.get("semester")
            year = request.args.get("year")
            
            q = sb.table("attendance").select("*").eq("roll_no", roll_no)
            if semester:
                q = q.eq("semester", int(semester))
            if year:
                q = q.eq("academic_year", year)
            
            records = q.order("marked_at", desc=True).execute().data or []
            
            # Group by subject
            by_subject = {}
            for r in records:
                subject = r.get("subject") or "Unknown"
                if subject not in by_subject:
                    by_subject[subject] = {"total": 0, "present": 0, "absent": 0, "leave": 0}
                
                by_subject[subject]["total"] += 1
                if r.get("status") == "present":
                    by_subject[subject]["present"] += 1
                elif r.get("status") == "absent":
                    by_subject[subject]["absent"] += 1
                elif r.get("status") == "leave":
                    by_subject[subject]["leave"] += 1
            
            # Calculate percentages
            for subject in by_subject:
                total = by_subject[subject]["total"]
                by_subject[subject]["percentage"] = (by_subject[subject]["present"] / max(total, 1)) * 100
            
            return jsonify(success=True, analytics={"by_subject": by_subject, "total_records": len(records)})
        except Exception as e:
            return jsonify(success=False, error=str(e)), 500
    
    
    @app.route("/api/analytics/attendance/trends", methods=["GET"])
    def get_attendance_trends():
        """Get attendance trends over time"""
        try:
            if not sb:
                return jsonify(success=True, trends={})
            
            days = int(request.args.get("days", 30))
            department = request.args.get("department")
            
            start_date = (datetime.utcnow() - timedelta(days=days)).isoformat()
            
            q = sb.table("attendance").select("*").gte("marked_at", start_date)
            if department:
                q = q.eq("department", department)
            
            records = q.execute().data or []
            
            # Group by date
            by_date = {}
            for r in records:
                date = r.get("marked_at", "").split("T")[0]
                if date not in by_date:
                    by_date[date] = {"total": 0, "present": 0, "percentage": 0}
                
                by_date[date]["total"] += 1
                if r.get("status") == "present":
                    by_date[date]["present"] += 1
            
            # Calculate percentages
            for date in by_date:
                total = by_date[date]["total"]
                by_date[date]["percentage"] = (by_date[date]["present"] / max(total, 1)) * 100
            
            return jsonify(success=True, trends=by_date)
        except Exception as e:
            return jsonify(success=False, error=str(e)), 500
    
    
    # ══════════════════════════════════════════════════════════════
    # ACADEMIC PERFORMANCE ANALYTICS
    # ══════════════════════════════════════════════════════════════
    
    @app.route("/api/analytics/performance/student/<roll_no>", methods=["GET"])
    def get_student_performance(roll_no):
        """Get student's academic performance metrics"""
        try:
            if not sb:
                return jsonify(success=True, performance={})
            
            # Get grades
            grades = sb.table("exam_results").select("*").eq("roll_no", roll_no).execute().data or []
            
            # Calculate GPA and statistics
            cgpa = 0
            gpa_sem = {}
            for grade in grades:
                semester = grade.get("semester", "unknown")
                marks = float(grade.get("marks", 0))
                
                if semester not in gpa_sem:
                    gpa_sem[semester] = {"total": 0, "count": 0, "marks": []}
                
                gpa_sem[semester]["total"] += marks
                gpa_sem[semester]["count"] += 1
                gpa_sem[semester]["marks"].append(marks)
            
            # Calculate averages
            for sem in gpa_sem:
                if gpa_sem[sem]["count"] > 0:
                    gpa_sem[sem]["average"] = gpa_sem[sem]["total"] / gpa_sem[sem]["count"]
            
            overall_avg = sum(s.get("average", 0) for s in gpa_sem.values()) / max(len(gpa_sem), 1)
            
            # Get attendance impact
            attendance = sb.table("attendance").select("*").eq("roll_no", roll_no).execute().data or []
            attendance_pct = (sum(1 for a in attendance if a.get("status") == "present") / max(len(attendance), 1)) * 100 if attendance else 0
            
            return jsonify(
                success=True,
                performance={
                    "cgpa": round(overall_avg, 2),
                    "attendance_percentage": round(attendance_pct, 2),
                    "by_semester": gpa_sem,
                    "total_grades": len(grades),
                    "grade_distribution": get_grade_distribution(grades),
                }
            )
        except Exception as e:
            return jsonify(success=False, error=str(e)), 500
    
    
    @app.route("/api/analytics/performance/class", methods=["GET"])
    def get_class_performance():
        """Get class-wide performance analytics"""
        try:
            if not sb:
                return jsonify(success=True, performance={})
            
            department = request.args.get("department")
            batch = request.args.get("batch")
            semester = request.args.get("semester")
            
            q = sb.table("exam_results").select("*")
            if department:
                q = q.eq("department", department)
            if batch:
                q = q.eq("batch", batch)
            if semester:
                q = q.eq("semester", int(semester))
            
            results = q.execute().data or []
            
            if not results:
                return jsonify(success=True, performance={})
            
            marks = [float(r.get("marks", 0)) for r in results]
            
            return jsonify(
                success=True,
                performance={
                    "total_students": len(set(r.get("roll_no") for r in results)),
                    "average_marks": round(sum(marks) / max(len(marks), 1), 2),
                    "highest_marks": max(marks) if marks else 0,
                    "lowest_marks": min(marks) if marks else 0,
                    "class_gpa": round(sum(marks) / max(len(marks), 1) * 0.1, 2),  # Simplified GPA
                    "pass_rate": round(sum(1 for m in marks if m >= 40) / max(len(marks), 1) * 100, 2),
                }
            )
        except Exception as e:
            return jsonify(success=False, error=str(e)), 500
    
    
    # ══════════════════════════════════════════════════════════════
    # PREDICTIVE ANALYTICS
    # ══════════════════════════════════════════════════════════════
    
    @app.route("/api/analytics/predict/dropout-risk", methods=["GET"])
    def predict_dropout_risk():
        """Predict students at risk of dropping out"""
        try:
            if not sb:
                return jsonify(success=True, at_risk=[])
            
            threshold = float(request.args.get("threshold", 0.6))  # 0-1 scale
            
            # Get all active students
            students = sb.table("users").select("id,roll_no,full_name").eq("role", "student").execute().data or []
            
            at_risk = []
            for student in students:
                risk_score = calculate_dropout_risk(student["roll_no"], sb, config)
                
                if risk_score >= threshold:
                    at_risk.append({
                        "roll_no": student["roll_no"],
                        "name": student.get("full_name"),
                        "risk_score": round(risk_score, 2),
                        "risk_level": "high" if risk_score >= 0.8 else "medium" if risk_score >= 0.6 else "low",
                        "factors": get_risk_factors(student["roll_no"], sb),
                    })
            
            return jsonify(success=True, at_risk=sorted(at_risk, key=lambda x: x["risk_score"], reverse=True))
        except Exception as e:
            return jsonify(success=False, error=str(e)), 500
    
    
    @app.route("/api/analytics/predict/performance/<roll_no>", methods=["GET"])
    def predict_performance(roll_no):
        """Predict student's likely academic performance"""
        try:
            # Get historical data
            if not sb:
                return jsonify(success=True, prediction={})
            
            grades = sb.table("exam_results").select("marks").eq("roll_no", roll_no).execute().data or []
            attendance = sb.table("attendance").select("*").eq("roll_no", roll_no).execute().data or []
            
            if not grades:
                return jsonify(success=False, error="Insufficient data for prediction"), 400
            
            marks = [float(g.get("marks", 0)) for g in grades]
            avg_marks = sum(marks) / len(marks)
            attendance_pct = (sum(1 for a in attendance if a.get("status") == "present") / max(len(attendance), 1)) * 100 if attendance else 0
            
            # Simple linear prediction
            predicted_marks = avg_marks * 0.8  # Conservative estimate
            confidence = min(0.95, len(grades) / 10.0)  # Increase confidence with more data
            
            return jsonify(
                success=True,
                prediction={
                    "predicted_marks": round(predicted_marks, 2),
                    "confidence": round(confidence, 2),
                    "attendance_impact": round(attendance_pct * 0.1, 2),
                    "likely_grade": get_letter_grade(predicted_marks),
                    "recommendation": "On track" if predicted_marks >= 60 else "Needs improvement",
                }
            )
        except Exception as e:
            return jsonify(success=False, error=str(e)), 500
    
    
    # ══════════════════════════════════════════════════════════════
    # INSTITUTIONAL DASHBOARDS
    # ══════════════════════════════════════════════════════════════
    
    @app.route("/api/analytics/dashboard/institutional", methods=["GET"])
    def get_institutional_dashboard():
        """Get institution-wide dashboard metrics"""
        try:
            if not sb:
                return jsonify(success=True, dashboard={})
            
            # Total students
            students = sb.table("users").select("id").eq("role", "student").execute().data or []
            
            # Total faculty
            faculty = sb.table("users").select("id").eq("role", "faculty").execute().data or []
            
            # Current attendance
            today = datetime.utcnow().isoformat()[:10]
            today_attendance = sb.table("attendance").select("*").gte("marked_at", today).execute().data or []
            today_present = sum(1 for a in today_attendance if a.get("status") == "present")
            
            # Active courses
            courses = sb.table("courses").select("id").execute().data or []
            
            return jsonify(
                success=True,
                dashboard={
                    "total_students": len(students),
                    "total_faculty": len(faculty),
                    "active_courses": len(courses),
                    "today_attendance": {
                        "total": len(today_attendance),
                        "present": today_present,
                        "percentage": (today_present / max(len(today_attendance), 1)) * 100 if today_attendance else 0,
                    },
                    "generated_at": datetime.utcnow().isoformat(),
                }
            )
        except Exception as e:
            return jsonify(success=False, error=str(e)), 500
    
    
    @app.route("/api/analytics/dashboard/departmental", methods=["GET"])
    def get_departmental_dashboard():
        """Get department-level dashboard metrics"""
        try:
            if not sb:
                return jsonify(success=True, dashboard={})
            
            department = request.args.get("department")
            if not department:
                return jsonify(success=False, error="Department required"), 400
            
            # Students in department
            students = sb.table("users").select("id").eq("role", "student").eq("department", department).execute().data or []
            
            # Average performance
            results = sb.table("exam_results").select("marks").eq("department", department).execute().data or []
            avg_performance = sum(float(r.get("marks", 0)) for r in results) / max(len(results), 1)
            
            # Attendance
            attendance = sb.table("attendance").select("*").eq("department", department).execute().data or []
            avg_attendance = (sum(1 for a in attendance if a.get("status") == "present") / max(len(attendance), 1)) * 100 if attendance else 0
            
            return jsonify(
                success=True,
                dashboard={
                    "department": department,
                    "total_students": len(students),
                    "average_performance": round(avg_performance, 2),
                    "average_attendance": round(avg_attendance, 2),
                    "generated_at": datetime.utcnow().isoformat(),
                }
            )
        except Exception as e:
            return jsonify(success=False, error=str(e)), 500


# ══════════════════════════════════════════════════════════════
# HELPER FUNCTIONS
# ══════════════════════════════════════════════════════════════

def get_grade_distribution(grades):
    """Calculate grade distribution"""
    distribution = {"A": 0, "B": 0, "C": 0, "D": 0, "F": 0}
    for grade in grades:
        marks = float(grade.get("marks", 0))
        if marks >= 90:
            distribution["A"] += 1
        elif marks >= 80:
            distribution["B"] += 1
        elif marks >= 70:
            distribution["C"] += 1
        elif marks >= 60:
            distribution["D"] += 1
        else:
            distribution["F"] += 1
    return distribution


def calculate_dropout_risk(roll_no, sb, config):
    """Calculate dropout risk score (0-1)"""
    try:
        factors = []
        
        # Low attendance factor
        attendance = sb.table("attendance").select("*").eq("roll_no", roll_no).execute().data or []
        if attendance:
            present_pct = sum(1 for a in attendance if a.get("status") == "present") / len(attendance)
            if present_pct < 0.75:
                factors.append(1.0 - present_pct)  # High risk if low attendance
        
        # Poor grades factor
        grades = sb.table("exam_results").select("marks").eq("roll_no", roll_no).execute().data or []
        if grades:
            avg = sum(float(g.get("marks", 0)) for g in grades) / len(grades)
            if avg < 40:
                factors.append(0.8)  # High risk if failing
            elif avg < 50:
                factors.append(0.5)  # Medium risk
        
        # No engagement factor
        if not attendance and not grades:
            factors.append(0.9)  # Very high risk if no data
        
        # Calculate composite score
        if not factors:
            return 0.0
        
        return min(1.0, sum(factors) / len(factors))
    except:
        return 0.0


def get_risk_factors(roll_no, sb):
    """Identify specific risk factors for a student"""
    factors = []
    
    try:
        attendance = sb.table("attendance").select("*").eq("roll_no", roll_no).execute().data or []
        if attendance:
            present_pct = sum(1 for a in attendance if a.get("status") == "present") / len(attendance)
            if present_pct < 0.75:
                factors.append(f"Low attendance: {present_pct*100:.1f}%")
        
        grades = sb.table("exam_results").select("marks").eq("roll_no", roll_no).execute().data or []
        if grades:
            avg = sum(float(g.get("marks", 0)) for g in grades) / len(grades)
            if avg < 50:
                factors.append(f"Poor academic performance: {avg:.1f}%")
    except:
        pass
    
    return factors


def get_letter_grade(marks):
    """Convert marks to letter grade"""
    if marks >= 90:
        return "A"
    elif marks >= 80:
        return "B"
    elif marks >= 70:
        return "C"
    elif marks >= 60:
        return "D"
    else:
        return "F"
