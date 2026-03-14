"""
Shift-Based Timetable System with Break Management
Implements 2-shift system with break/lunch timings for crowd management
"""

import logging
from datetime import datetime, time
from typing import Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# ═══════════════════════════════════════════════════════════════════════════════
# SHIFT-BASED TIMETABLE FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════════════


def get_student_timetable_with_breaks(sb, roll_no: str, academic_year: str = "2025-26"):
    """
    Get complete student timetable with breaks and lunch timings
    
    Args:
        sb: Supabase client
        roll_no: Student roll number
        academic_year: Academic year (e.g., "2025-26")
    
    Returns:
        Dict with:
        - success: bool
        - timetable: [{day, shift, classes[], breaks[]}]
        - breaks_summary: {tea_break, lunch_break, etc}
        - shift_info: {shift_1_hours, shift_2_hours}
    """
    try:
        # Step 1: Get student's enrollments to find their section
        enrollments = sb.table("enrollments") \
            .select("section_id, batch_name") \
            .eq("roll_no", roll_no) \
            .eq("academic_year", academic_year) \
            .limit(1) \
            .execute()
        
        if not enrollments.data:
            logger.error(f"[TIMETABLE] No enrollments found for {roll_no}")
            return {"success": False, "error": "Student not enrolled"}
        
        section_id = enrollments.data[0].get("section_id")
        student_batch = enrollments.data[0].get("batch_name")
        
        # Step 2: Get student's enrolled subjects
        student_subjects = sb.table("enrollments") \
            .select("subject_code") \
            .eq("roll_no", roll_no) \
            .eq("academic_year", academic_year) \
            .execute()
        
        subject_codes = [s["subject_code"] for s in student_subjects.data]
        
        # Step 3: Get all timetable entries for their section
        timetable = sb.table("timetable") \
            .select("*") \
            .eq("section_id", section_id) \
            .eq("academic_year", academic_year) \
            .order("day_of_week,shift_number,hour_start") \
            .execute()
        
        # Step 4: Filter to only enrolled subjects (or all if batch is None)
        student_classes = []
        for entry in timetable.data:
            if entry["subject_code"] in subject_codes:
                # Check batch - if entry has batch_name, must match student
                if entry.get("batch_name"):
                    if entry["batch_name"] == student_batch:
                        student_classes.append(entry)
                else:
                    # No batch specified = for all students
                    student_classes.append(entry)
        
        # Step 5: Get breaks for all shifts
        breaks = sb.table("break_timings") \
            .select("*") \
            .eq("academic_year", academic_year) \
            .order("hour_start") \
            .execute()
        
        # Step 6: Get shift configuration
        shift_config = sb.table("shift_config") \
            .select("*") \
            .eq("academic_year", academic_year) \
            .order("shift_number") \
            .execute()
        
        # Step 7: Organize by day and shift
        timetable_organized = _organize_timetable_by_day(
            student_classes, 
            breaks.data, 
            shift_config.data
        )
        
        logger.info(f"[TIMETABLE] Generated for {roll_no}: {len(student_classes)} classes, {len(breaks.data)} break times")
        
        return {
            "success": True,
            "roll_no": roll_no,
            "timetable": timetable_organized,
            "breaks_summary": _summarize_breaks(breaks.data),
            "shift_info": _summarize_shift_config(shift_config.data),
            "batch": student_batch,
            "total_classes": len(student_classes)
        }
        
    except Exception as e:
        logger.error(f"[TIMETABLE] Error getting timetable for {roll_no}: {str(e)}")
        return {"success": False, "error": str(e)}


def get_faculty_timetable_with_breaks(sb, faculty_id: str, academic_year: str = "2025-26"):
    """
    Get complete faculty timetable with all their classes and break times
    
    Args:
        sb: Supabase client
        faculty_id: Faculty ID
        academic_year: Academic year
    
    Returns:
        Dict with faculty's classes organized by day/shift + breaks
    """
    try:
        # Get all classes assigned to this faculty
        timetable = sb.table("timetable") \
            .select("*") \
            .eq("faculty_id", faculty_id) \
            .eq("academic_year", academic_year) \
            .order("day_of_week,shift_number,hour_start") \
            .execute()
        
        if not timetable.data:
            logger.warning(f"[TIMETABLE] No classes found for faculty {faculty_id}")
            return {"success": True, "timetable": {}, "message": "No classes assigned"}
        
        # Get breaks
        breaks = sb.table("break_timings") \
            .select("*") \
            .eq("academic_year", academic_year) \
            .execute()
        
        # Get shift config
        shift_config = sb.table("shift_config") \
            .select("*") \
            .eq("academic_year", academic_year) \
            .execute()
        
        # Organize
        timetable_organized = _organize_timetable_by_day(
            timetable.data,
            breaks.data,
            shift_config.data
        )
        
        logger.info(f"[TIMETABLE] Faculty {faculty_id}: {len(timetable.data)} classes")
        
        return {
            "success": True,
            "faculty_id": faculty_id,
            "timetable": timetable_organized,
            "breaks_summary": _summarize_breaks(breaks.data),
            "shift_info": _summarize_shift_config(shift_config.data),
            "total_classes": len(timetable.data)
        }
        
    except Exception as e:
        logger.error(f"[TIMETABLE] Error getting faculty timetable: {str(e)}")
        return {"success": False, "error": str(e)}


def get_break_timings(sb, shift_number: Optional[int] = None, academic_year: str = "2025-26"):
    """
    Get break/lunch timings for institution
    
    Args:
        sb: Supabase client
        shift_number: 1 or 2 (optional, returns both if None)
        academic_year: Academic year
    
    Returns:
        List of breaks with full details
    """
    try:
        query = sb.table("break_timings") \
            .select("*") \
            .eq("academic_year", academic_year)
        
        if shift_number == 1:
            query = query.eq("applies_to_shift_1", True)
        elif shift_number == 2:
            query = query.eq("applies_to_shift_2", True)
        
        breaks = query.order("hour_start").execute()
        
        # Transform to time strings
        formatted = []
        for b in breaks.data:
            formatted.append({
                "id": b["id"],
                "break_name": b["break_name"],
                "break_type": b["break_type"],
                "time_start": f"{b['hour_start']:02d}:{b['minute_start']:02d}",
                "time_end": f"{b['hour_end']:02d}:{b['minute_end']:02d}",
                "duration_minutes": b["duration_minutes"],
                "applicable_to": b["applicable_to"],
                "shift_1": b.get("applies_to_shift_1", False),
                "shift_2": b.get("applies_to_shift_2", False)
            })
        
        logger.info(f"[TIMETABLE] Retrieved {len(formatted)} break timings for shift={shift_number}")
        
        return {
            "success": True,
            "breaks": formatted,
            "count": len(formatted)
        }
        
    except Exception as e:
        logger.error(f"[TIMETABLE] Error getting break timings: {str(e)}")
        return {"success": False, "error": str(e)}


def get_shift_configuration(sb, academic_year: str = "2025-26"):
    """
    Get shift configuration (start/end times)
    
    Args:
        sb: Supabase client
        academic_year: Academic year
    
    Returns:
        List of shifts with hours
    """
    try:
        shifts = sb.table("shift_config") \
            .select("*") \
            .eq("academic_year", academic_year) \
            .order("shift_number") \
            .execute()
        
        formatted = []
        for s in shifts.data:
            formatted.append({
                "shift_number": s["shift_number"],
                "shift_name": s["shift_name"],
                "time_start": f"{s['classes_start_hour']:02d}:{s['classes_start_minute']:02d}",
                "time_end": f"{s['classes_end_hour']:02d}:{s['classes_end_minute']:02d}",
                "description": s.get("description", "")
            })
        
        logger.info(f"[TIMETABLE] Retrieved {len(formatted)} shift configs")
        
        return {
            "success": True,
            "shifts": formatted,
            "count": len(formatted)
        }
        
    except Exception as e:
        logger.error(f"[TIMETABLE] Error getting shift config: {str(e)}")
        return {"success": False, "error": str(e)}


# ═══════════════════════════════════════════════════════════════════════════════
# HELPER FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════════════


def _organize_timetable_by_day(classes: List[Dict], breaks: List[Dict], shifts: List[Dict]) -> Dict:
    """
    Organize timetable by day with breaks inserted
    
    Structure:
    {
      "Monday": {
        "shift_1": {
          "classes": [...],
          "breaks": [...]
        },
        "shift_2": { ... }
      },
      ...
    }
    """
    days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
    result = {}
    
    for day in days:
        result[day] = {
            "shift_1": {"classes": [], "breaks": [], "time_range": ""},
            "shift_2": {"classes": [], "breaks": [], "time_range": ""}
        }
    
    # Add classes grouped by day and shift
    for cls in classes:
        day = cls.get("day_of_week", "Monday")
        shift = cls.get("shift_number", 1)
        
        class_entry = {
            "subject_code": cls.get("subject_code"),
            "subject_name": cls.get("subject_name"),
            "time_start": f"{cls['hour_start']:02d}:{cls['minute_start']:02d}",
            "time_end": f"{cls['hour_end']:02d}:{cls['minute_end']:02d}",
            "room": cls.get("room_number"),
            "faculty": cls.get("faculty_name"),
            "batch": cls.get("batch_name"),
            "type": cls.get("subject_type", "core")
        }
        
        if day in result:
            if shift == 1:
                result[day]["shift_1"]["classes"].append(class_entry)
            elif shift == 2:
                result[day]["shift_2"]["classes"].append(class_entry)
    
    # Add breaks grouped by shift
    for brk in breaks:
        applies_shift_1 = brk.get("applies_to_shift_1", False)
        applies_shift_2 = brk.get("applies_to_shift_2", False)
        
        break_entry = {
            "break_name": brk.get("break_name"),
            "break_type": brk.get("break_type"),
            "time_start": f"{brk['hour_start']:02d}:{brk['minute_start']:02d}",
            "time_end": f"{brk['hour_end']:02d}:{brk['minute_end']:02d}",
            "duration_minutes": brk.get("duration_minutes", 45),
            "description": brk.get("description", "")
        }
        
        # Add to appropriate shifts (breaks appear on all days)
        for day in days:
            if applies_shift_1 and day in result:
                result[day]["shift_1"]["breaks"].append(break_entry)
            if applies_shift_2 and day in result:
                result[day]["shift_2"]["breaks"].append(break_entry)
    
    # Add shift time ranges
    for day in days:
        for shift_num in [1, 2]:
            shift_key = f"shift_{shift_num}"
            for shift_config in shifts:
                if shift_config["shift_number"] == shift_num:
                    start = f"{shift_config['classes_start_hour']:02d}:{shift_config['classes_start_minute']:02d}"
                    end = f"{shift_config['classes_end_hour']:02d}:{shift_config['classes_end_minute']:02d}"
                    result[day][shift_key]["time_range"] = f"{start} - {end}"
                    result[day][shift_key]["shift_name"] = shift_config.get("shift_name", "")
    
    return result


def _summarize_breaks(breaks: List[Dict]) -> Dict:
    """Create a summary of all breaks"""
    summary = {
        "tea_break": None,
        "lunch_break": None,
        "other_breaks": []
    }
    
    for brk in breaks:
        brk_type = brk.get("break_type", "").lower()
        
        if brk_type == "lunch":
            summary["lunch_break"] = {
                "name": brk.get("break_name"),
                "duration": brk.get("duration_minutes", 45),
                "shift_1": brk.get("applies_to_shift_1", False),
                "shift_2": brk.get("applies_to_shift_2", False)
            }
        elif brk_type == "break":
            summary["tea_break"] = {
                "name": brk.get("break_name"),
                "duration": brk.get("duration_minutes", 10),
                "shift_1": brk.get("applies_to_shift_1", False),
                "shift_2": brk.get("applies_to_shift_2", False)
            }
        else:
            summary["other_breaks"].append({
                "name": brk.get("break_name"),
                "type": brk_type,
                "duration": brk.get("duration_minutes")
            })
    
    return summary


def _summarize_shift_config(shifts: List[Dict]) -> Dict:
    """Create a summary of shift configuration"""
    summary = {}
    
    for shift in shifts:
        shift_num = shift.get("shift_number")
        summary[f"shift_{shift_num}"] = {
            "name": shift.get("shift_name"),
            "starts": f"{shift['classes_start_hour']:02d}:{shift['classes_start_minute']:02d}",
            "ends": f"{shift['classes_end_hour']:02d}:{shift['classes_end_minute']:02d}"
        }
    
    return summary


def register_timetable_shift_endpoints(app, sb):
    """
    Register all timetable shift API endpoints
    
    Endpoints:
    - GET /api/timetable/student/<roll_no>
    - GET /api/timetable/faculty/<faculty_id>
    - GET /api/break-timings
    - GET /api/shift-config
    """
    
    @app.route("/api/timetable/student/<roll_no>", methods=["GET"])
    def get_student_timetable_endpoint(roll_no):
        """Get student timetable with breaks"""
        academic_year = request.args.get("year", "2025-26")
        result = get_student_timetable_with_breaks(sb, roll_no, academic_year)
        return jsonify(result), 200 if result.get("success") else 404
    
    @app.route("/api/timetable/faculty/<faculty_id>", methods=["GET"])
    def get_faculty_timetable_endpoint(faculty_id):
        """Get faculty timetable with breaks"""
        academic_year = request.args.get("year", "2025-26")
        result = get_faculty_timetable_with_breaks(sb, faculty_id, academic_year)
        return jsonify(result), 200 if result.get("success") else 404
    
    @app.route("/api/break-timings", methods=["GET"])
    def get_breaks_endpoint():
        """Get break timings"""
        shift = request.args.get("shift", type=int, default=None)
        year = request.args.get("year", "2025-26")
        result = get_break_timings(sb, shift, year)
        return jsonify(result), 200 if result.get("success") else 500
    
    @app.route("/api/shift-config", methods=["GET"])
    def get_shifts_endpoint():
        """Get shift configuration"""
        year = request.args.get("year", "2025-26")
        result = get_shift_configuration(sb, year)
        return jsonify(result), 200 if result.get("success") else 500
    
    logger.info("[TIMETABLE] Registered shift-based timetable endpoints")


# ═══════════════════════════════════════════════════════════════════════════════
# EXAMPLE USAGE
# ═══════════════════════════════════════════════════════════════════════════════

"""
# In your backend.py:

from timetable_shifts import register_timetable_shift_endpoints

# After setting up CORS and other middleware:
register_timetable_shift_endpoints(app, sb)

# Now your API endpoints are available:

# Get student's personalized timetable with breaks
GET /api/timetable/student/CSE001

Response:
{
  "success": true,
  "roll_no": "CSE001",
  "timetable": {
    "Monday": {
      "shift_1": {
        "time_range": "09:00 - 13:00",
        "shift_name": "Morning Shift",
        "classes": [
          {
            "subject_code": "CS101",
            "subject_name": "Programming Fundamentals",
            "time_start": "09:00",
            "time_end": "10:00",
            "room": "A101",
            "faculty": "Dr. Smith",
            "batch": null,
            "type": "core"
          }
        ],
        "breaks": [
          {
            "break_name": "Tea Break",
            "break_type": "break",
            "time_start": "10:00",
            "time_end": "10:10",
            "duration_minutes": 10,
            "description": "Morning tea break"
          },
          {
            "break_name": "Lunch Break",
            "break_type": "lunch",
            "time_start": "11:30",
            "time_end": "12:15",
            "duration_minutes": 45,
            "description": ""
          }
        ]
      },
      "shift_2": { ... }
    },
    ...
  },
  "breaks_summary": {
    "tea_break": {
      "name": "Tea Break",
      "duration": 10,
      "shift_1": true,
      "shift_2": false
    },
    "lunch_break": {
      "name": "Lunch Break",
      "duration": 45,
      "shift_1": true,
      "shift_2": true
    }
  },
  "shift_info": {
    "shift_1": {
      "name": "Morning Shift",
      "starts": "09:00",
      "ends": "13:00"
    },
    "shift_2": {
      "name": "Afternoon Shift",
      "starts": "14:00",
      "ends": "18:00"
    }
  }
}
"""
