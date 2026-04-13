"""
Analytics APIs - Role-based analytics endpoints
Handles class-wise, subject-wise, student-wise, and faculty performance analytics
"""

from datetime import datetime, timedelta
import json
from role_based_access_control import (
    get_user_scope, get_accessible_students, get_accessible_classes,
    require_minimum_role, PERMISSIONS
)

# ── Analytics Query Functions ──

def get_class_wise_analytics(sb, user, class_id=None, date_from=None, date_to=None):
    """Get class-wise attendance analytics"""
    if not sb:
        return []
    
    # Get accessible classes for this user
    accessible_classes = get_accessible_classes(user, sb) if user else []
    if not accessible_classes:
        return []
    
    class_ids = [c.get('id') for c in accessible_classes]
    if class_id and class_id not in class_ids:
        return []  # User can't access this class
    
    if class_id:
        class_ids = [class_id]
    
    try:
        # Fetch attendance records for these classes
        all_records = []
        for cid in class_ids:
            result = sb.table("attendance").select("*").eq("class_id", cid).execute()
            all_records.extend(result.data or [])
        
        # Filter by date range
        if date_from:
            date_from_obj = datetime.fromisoformat(date_from)
            all_records = [r for r in all_records 
                          if datetime.fromisoformat(r.get('date', '')).date() >= date_from_obj.date()]
        if date_to:
            date_to_obj = datetime.fromisoformat(date_to)
            all_records = [r for r in all_records 
                          if datetime.fromisoformat(r.get('date', '')).date() <= date_to_obj.date()]
        
        # Aggregate by class
        class_stats = {}
        for record in all_records:
            class_id = record.get('class_id')
            if class_id not in class_stats:
                class_stats[class_id] = {
                    'class_id': class_id,
                    'total_students': 0,
                    'present': 0,
                    'absent': 0,
                    'verified': 0,
                    'unverified': 0,
                    'total_records': 0,
                }
            
            class_stats[class_id]['total_records'] += 1
            if record.get('present'):
                class_stats[class_id]['present'] += 1
            else:
                class_stats[class_id]['absent'] += 1
            
            if record.get('verified'):
                class_stats[class_id]['verified'] += 1
            else:
                class_stats[class_id]['unverified'] += 1
        
        # Calculate percentages
        result_list = []
        for cid, stats in class_stats.items():
            total = stats['total_records']
            stats['attendance_percentage'] = (stats['present'] / total * 100) if total > 0 else 0
            stats['verification_percentage'] = (stats['verified'] / total * 100) if total > 0 else 0
            result_list.append(stats)
        
        return result_list
    
    except Exception as e:
        print(f"[ANALYTICS] Error in class_wise: {e}")
        return []


def get_subject_wise_analytics(sb, user, subject_id=None, date_from=None, date_to=None):
    """Get subject-wise attendance analytics"""
    if not sb:
        return []
    
    try:
        # Get all subjects accessible to this user
        all_attendance = sb.table("attendance").select("*").execute()
        records = all_attendance.data or []
        
        # Filter by accessible classes
        accessible_classes = get_accessible_classes(user, sb)
        accessible_class_ids = [c.get('id') for c in accessible_classes]
        records = [r for r in records if r.get('class_id') in accessible_class_ids]
        
        # Filter by date range
        if date_from:
            date_from_obj = datetime.fromisoformat(date_from)
            records = [r for r in records 
                      if datetime.fromisoformat(r.get('date', '')).date() >= date_from_obj.date()]
        if date_to:
            date_to_obj = datetime.fromisoformat(date_to)
            records = [r for r in records 
                      if datetime.fromisoformat(r.get('date', '')).date() <= date_to_obj.date()]
        
        # Aggregate by subject
        subject_stats = {}
        for record in records:
            subj_id = record.get('subject_id')
            if not subj_id:
                continue
            
            if subj_id not in subject_stats:
                subject_stats[subj_id] = {
                    'subject_id': subj_id,
                    'total_records': 0,
                    'present': 0,
                    'absent': 0,
                    'verified': 0,
                    'unverified': 0,
                }
            
            subject_stats[subj_id]['total_records'] += 1
            if record.get('present'):
                subject_stats[subj_id]['present'] += 1
            else:
                subject_stats[subj_id]['absent'] += 1
            
            if record.get('verified'):
                subject_stats[subj_id]['verified'] += 1
            else:
                subject_stats[subj_id]['unverified'] += 1
        
        # Calculate percentages
        result_list = []
        for subj_id, stats in subject_stats.items():
            total = stats['total_records']
            stats['attendance_percentage'] = (stats['present'] / total * 100) if total > 0 else 0
            stats['verification_percentage'] = (stats['verified'] / total * 100) if total > 0 else 0
            result_list.append(stats)
        
        return result_list
    
    except Exception as e:
        print(f"[ANALYTICS] Error in subject_wise: {e}")
        return []


def get_student_wise_analytics(sb, user, student_roll_no=None, days=30):
    """Get student-wise attendance trends"""
    if not sb:
        return []
    
    try:
        # Get accessible students
        accessible_students = get_accessible_students(user, sb)
        accessible_rolls = [s.get('roll_no') for s in accessible_students if s.get('roll_no')]
        
        if not accessible_rolls:
            return []
        
        # Fetch attendance records
        all_records = sb.table("attendance").select("*").execute()
        records = all_records.data or []
        
        # Filter by accessible students
        records = [r for r in records if r.get('roll_no') in accessible_rolls]
        
        # Filter by specific student if provided
        if student_roll_no and student_roll_no in accessible_rolls:
            records = [r for r in records if r.get('roll_no') == student_roll_no]
        
        # Filter by date range (last N days)
        cutoff_date = (datetime.utcnow() - timedelta(days=days)).date()
        records = [r for r in records 
                  if datetime.fromisoformat(r.get('date', '')).date() >= cutoff_date]
        
        # Aggregate by student
        student_stats = {}
        for record in records:
            roll = record.get('roll_no')
            if roll not in student_stats:
                student_stats[roll] = {
                    'roll_no': roll,
                    'student_name': record.get('name', 'Unknown'),
                    'total_days': 0,
                    'present': 0,
                    'absent': 0,
                    'verified': 0,
                    'unverified': 0,
                    'latest_date': None,
                }
            
            student_stats[roll]['total_days'] += 1
            if record.get('present'):
                student_stats[roll]['present'] += 1
            else:
                student_stats[roll]['absent'] += 1
            
            if record.get('verified'):
                student_stats[roll]['verified'] += 1
            else:
                student_stats[roll]['unverified'] += 1
            
            # Track latest attendance
            rec_date = record.get('date')
            if rec_date:
                if not student_stats[roll]['latest_date'] or rec_date > student_stats[roll]['latest_date']:
                    student_stats[roll]['latest_date'] = rec_date
        
        # Calculate percentages and risk levels
        result_list = []
        for roll, stats in student_stats.items():
            total = stats['total_days']
            stats['attendance_percentage'] = (stats['present'] / total * 100) if total > 0 else 0
            stats['verification_percentage'] = (stats['verified'] / total * 100) if total > 0 else 0
            
            # Risk scoring: students with <75% attendance are at risk
            if stats['attendance_percentage'] < 75:
                stats['risk_level'] = 'High'
            elif stats['attendance_percentage'] < 85:
                stats['risk_level'] = 'Medium'
            else:
                stats['risk_level'] = 'Low'
            
            result_list.append(stats)
        
        # Sort by attendance percentage (ascending = highest risk first)
        result_list.sort(key=lambda x: x['attendance_percentage'])
        
        return result_list
    
    except Exception as e:
        print(f"[ANALYTICS] Error in student_wise: {e}")
        return []


def get_faculty_performance_analytics(sb, user, faculty_id=None):
    """Get faculty performance metrics"""
    if not sb:
        return []
    
    try:
        # Only allow admin/dean/hod to view all faculty
        user_role = user.get('role', 'student').lower()
        if user_role == 'faculty' and not faculty_id:
            # Faculty can only see their own metrics
            faculty_id = user.get('id')
        elif user_role == 'student':
            # Students can't view faculty metrics
            return []
        
        # Get faculty members
        if faculty_id:
            result = sb.table("users").select("*").eq("id", faculty_id).eq("role", "faculty").execute()
            faculty_list = result.data or [] if result.data else []
        else:
            result = sb.table("users").select("*").eq("role", "faculty").execute()
            faculty_list = result.data or []
            
            # Filter by accessible scope
            if user_role == 'dean':
                faculty_list = [f for f in faculty_list if f.get('school_id') == user.get('school_id')]
            elif user_role == 'hod':
                faculty_list = [f for f in faculty_list if f.get('department_id') == user.get('department_id')]
        
        # Get their attendance records as "markers"
        faculty_stats = []
        for faculty in faculty_list:
            fac_id = faculty.get('id')
            
            # Count sessions conducted
            sessions = sb.table("attendance").select("*").eq("faculty_id", fac_id).execute()
            session_list = sessions.data or []
            
            total_records = len(session_list)
            present_count = sum(1 for r in session_list if r.get('present'))
            verified_count = sum(1 for r in session_list if r.get('verified'))
            
            # Get unique students taught
            unique_students = len(set(r.get('roll_no') for r in session_list if r.get('roll_no')))
            
            faculty_stats.append({
                'faculty_id': fac_id,
                'faculty_name': faculty.get('full_name', 'Unknown'),
                'department': faculty.get('department_id'),
                'assigned_classes': faculty.get('assigned_classes', []),
                'total_sessions': total_records,
                'attendance_marked': present_count,
                'verification_rate': (verified_count / total_records * 100) if total_records > 0 else 0,
                'unique_students': unique_students,
                'avg_class_size': (unique_students / total_records) if total_records > 0 else 0,
                'efficiency_score': min(100, (verified_count / total_records * 100) if total_records > 0 else 0),
            })
        
        return faculty_stats
    
    except Exception as e:
        print(f"[ANALYTICS] Error in faculty_performance: {e}")
        return []


def get_at_risk_students(sb, user, threshold=75):
    """Get students below attendance threshold (at-risk)"""
    if not sb:
        return []
    
    try:
        # Get all student analytics
        student_analytics = get_student_wise_analytics(sb, user)
        
        # Filter for at-risk students (below threshold)
        at_risk = [s for s in student_analytics if s['attendance_percentage'] < threshold]
        
        # Sort by attendance percentage (lowest first)
        at_risk.sort(key=lambda x: x['attendance_percentage'])
        
        return at_risk
    
    except Exception as e:
        print(f"[ANALYTICS] Error in at_risk_students: {e}")
        return []


def get_daily_report(sb, user, date=None):
    """Get daily attendance report"""
    if not sb:
        return {}
    
    if not date:
        date = datetime.utcnow().date().isoformat()
    
    try:
        # Get attendance for this date
        all_records = sb.table("attendance").select("*").eq("date", date).execute()
        records = all_records.data or []
        
        # Filter by accessible classes
        accessible_classes = get_accessible_classes(user, sb)
        accessible_class_ids = [c.get('id') for c in accessible_classes]
        records = [r for r in records if r.get('class_id') in accessible_class_ids]
        
        # Calculate daily stats
        total = len(records)
        present = sum(1 for r in records if r.get('present'))
        absent = total - present
        verified = sum(1 for r in records if r.get('verified'))
        unverified = total - verified
        
        return {
            'date': date,
            'total_marked': total,
            'present': present,
            'absent': absent,
            'present_percentage': (present / total * 100) if total > 0 else 0,
            'verified': verified,
            'unverified': unverified,
            'verification_percentage': (verified / total * 100) if total > 0 else 0,
        }
    
    except Exception as e:
        print(f"[ANALYTICS] Error in daily_report: {e}")
        return {}


def get_weekly_report(sb, user, weeks_back=4):
    """Get weekly attendance report"""
    if not sb:
        return []
    
    try:
        # Get attendance records for last N weeks
        start_date = (datetime.utcnow() - timedelta(weeks=weeks_back)).date()
        all_records = sb.table("attendance").select("*").execute()
        records = all_records.data or []
        
        # Filter by date and accessible classes
        accessible_classes = get_accessible_classes(user, sb)
        accessible_class_ids = [c.get('id') for c in accessible_classes]
        records = [r for r in records 
                  if r.get('class_id') in accessible_class_ids and
                     datetime.fromisoformat(r.get('date', '')).date() >= start_date]
        
        # Aggregate by week
        weekly_stats = {}
        for record in records:
            date_obj = datetime.fromisoformat(record.get('date', '')).date()
            week_start = date_obj - timedelta(days=date_obj.weekday())
            week_key = week_start.isoformat()
            
            if week_key not in weekly_stats:
                weekly_stats[week_key] = {
                    'week_start': week_key,
                    'total': 0,
                    'present': 0,
                    'absent': 0,
                    'verified': 0,
                }
            
            weekly_stats[week_key]['total'] += 1
            if record.get('present'):
                weekly_stats[week_key]['present'] += 1
            else:
                weekly_stats[week_key]['absent'] += 1
            if record.get('verified'):
                weekly_stats[week_key]['verified'] += 1
        
        # Calculate percentages
        result_list = []
        for week_key in sorted(weekly_stats.keys()):
            stats = weekly_stats[week_key]
            total = stats['total']
            stats['attendance_percentage'] = (stats['present'] / total * 100) if total > 0 else 0
            stats['verification_percentage'] = (stats['verified'] / total * 100) if total > 0 else 0
            result_list.append(stats)
        
        return result_list
    
    except Exception as e:
        print(f"[ANALYTICS] Error in weekly_report: {e}")
        return []


def get_monthly_report(sb, user, months_back=3):
    """Get monthly attendance report"""
    if not sb:
        return []
    
    try:
        # Get attendance records for last N months
        start_date = (datetime.utcnow() - timedelta(days=30 * months_back)).date()
        all_records = sb.table("attendance").select("*").execute()
        records = all_records.data or []
        
        # Filter by date and accessible classes
        accessible_classes = get_accessible_classes(user, sb)
        accessible_class_ids = [c.get('id') for c in accessible_classes]
        records = [r for r in records 
                  if r.get('class_id') in accessible_class_ids and
                     datetime.fromisoformat(r.get('date', '')).date() >= start_date]
        
        # Aggregate by month
        monthly_stats = {}
        for record in records:
            date_obj = datetime.fromisoformat(record.get('date', '')).date()
            month_key = f"{date_obj.year}-{date_obj.month:02d}"
            
            if month_key not in monthly_stats:
                monthly_stats[month_key] = {
                    'month': month_key,
                    'total': 0,
                    'present': 0,
                    'absent': 0,
                    'verified': 0,
                }
            
            monthly_stats[month_key]['total'] += 1
            if record.get('present'):
                monthly_stats[month_key]['present'] += 1
            else:
                monthly_stats[month_key]['absent'] += 1
            if record.get('verified'):
                monthly_stats[month_key]['verified'] += 1
        
        # Calculate percentages
        result_list = []
        for month_key in sorted(monthly_stats.keys()):
            stats = monthly_stats[month_key]
            total = stats['total']
            stats['attendance_percentage'] = (stats['present'] / total * 100) if total > 0 else 0
            stats['verification_percentage'] = (stats['verified'] / total * 100) if total > 0 else 0
            result_list.append(stats)
        
        return result_list
    
    except Exception as e:
        print(f"[ANALYTICS] Error in monthly_report: {e}")
        return []


def get_compliance_report(sb, user, min_attendance=75):
    """Get compliance report (students meeting/not meeting attendance requirements)"""
    if not sb:
        return {'compliant': [], 'non_compliant': []}
    
    try:
        # Get student analytics
        student_analytics = get_student_wise_analytics(sb, user)
        
        compliant = [s for s in student_analytics if s['attendance_percentage'] >= min_attendance]
        non_compliant = [s for s in student_analytics if s['attendance_percentage'] < min_attendance]
        
        return {
            'compliance_threshold': min_attendance,
            'total_students': len(student_analytics),
            'compliant_count': len(compliant),
            'non_compliant_count': len(non_compliant),
            'compliance_percentage': (len(compliant) / len(student_analytics) * 100) if student_analytics else 0,
            'compliant_students': compliant,
            'non_compliant_students': non_compliant,
        }
    
    except Exception as e:
        print(f"[ANALYTICS] Error in compliance_report: {e}")
        return {'compliant': [], 'non_compliant': []}
