# ═══════════════════════════════════════════════════════════════════════════════
# SMART AMS - CURRICULUM & ENROLLMENT MANAGEMENT SYSTEM
# Auto-enroll students in subjects based on curriculum table
# ═══════════════════════════════════════════════════════════════════════════════

# ═══════════════════════════════════════════════════════════════════════════════
# BULK ENROLLMENT FUNCTIONS (60 students per class/section)
# ═══════════════════════════════════════════════════════════════════════════════

def bulk_enroll_students(sb, students_list, department, program, semester, academic_year="2025-26"):
    """
    Bulk enroll multiple students in curriculum.
    Automatically creates sections and assigns batches (60 per section).
    
    Args:
        sb: Supabase client
        students_list: List of dicts with keys: {student_id, roll_no, section_name}
                      Example: [
                        {"student_id": "uuid1", "roll_no": "CSE001", "section_name": "A"},
                        {"student_id": "uuid2", "roll_no": "CSE002", "section_name": "A"},
                      ]
        department: Department code (CSE, ECE, etc)
        program: Program name
        semester: Semester number
        academic_year: Academic year string
    
    Returns:
        dict: {"success": bool, "enrolled": int, "failed": int, "message": str}
    """
    try:
        enrolled_count = 0
        failed_count = 0
        
        print(f"[BULK_ENROLL] Starting bulk enrollment of {len(students_list)} students")
        print(f"[BULK_ENROLL] Department: {department}, Semester: {semester}")
        
        for student_data in students_list:
            student_id = student_data.get("student_id")
            roll_no = student_data.get("roll_no")
            section_name = student_data.get("section_name", "A")
            
            if not student_id or not roll_no:
                print(f"[BULK_ENROLL] ❌ Missing student_id or roll_no: {student_data}")
                failed_count += 1
                continue
            
            # Call the auto-enroll function for each student
            success = auto_enroll_student(
                sb, 
                student_id, 
                roll_no, 
                department, 
                program, 
                semester, 
                section_name, 
                academic_year
            )
            
            if success:
                enrolled_count += 1
            else:
                failed_count += 1
        
        result_msg = f"Enrolled: {enrolled_count}, Failed: {failed_count}"
        print(f"[BULK_ENROLL] ✅ {result_msg}")
        
        return {
            "success": True,
            "enrolled": enrolled_count,
            "failed": failed_count,
            "total": len(students_list),
            "message": result_msg
        }
        
    except Exception as e:
        print(f"[BULK_ENROLL] ❌ Error: {e}")
        return {
            "success": False,
            "error": str(e),
            "message": "Bulk enrollment failed"
        }


def get_section_wise_student_count(sb, department, semester, academic_year="2025-26"):
    """
    Get current student count per section.
    Helps determine which section to add new students to (max 60 per section).
    
    Args:
        sb: Supabase client
        department: Department code
        semester: Semester number
        academic_year: Academic year
    
    Returns:
        dict: {"section_name": count, ...}
    """
    try:
        enrollments = sb.table("enrollments") \
            .select("section_name") \
            .eq("department", department) \
            .eq("semester", semester) \
            .eq("academic_year", academic_year) \
            .eq("status", "active") \
            .execute()
        
        section_counts = {}
        for enroll in (enrollments.data or []):
            section = enroll.get("section_name", "A")
            section_counts[section] = section_counts.get(section, 0) + 1
        
        return section_counts
        
    except Exception as e:
        print(f"[SECTION_COUNT] Error: {e}")
        return {}


def auto_enroll_student(sb, student_id, roll_no, department, program, semester, section_name, academic_year="2025-26"):
    """
    Auto-enroll a student in all core subjects for their dept/semester
    and assign them to a batch for lab subjects.
    
    Args:
        sb: Supabase client
        student_id: UUID of student in users table
        roll_no: Roll number (for batch assignment and reference)
        department: Department code (e.g., 'CSE', 'ECE')
        program: Program name (e.g., 'CSE', 'AIML')
        semester: Current semester (1-8)
        section_name: Section letter (A, B, C)
        academic_year: Academic year string (default: 2025-26)
    
    Returns:
        bool: True if enrollment successful, False otherwise
    """
    try:
        if not sb:
            print(f"[ENROLL] ❌ Supabase not configured")
            return False

        # 1. Get all core subjects for this dept/semester
        print(f"[ENROLL] 📚 Fetching curriculum for {department} Semester {semester}")
        subjects_result = sb.table("curriculum") \
            .select("*") \
            .eq("department", department) \
            .eq("semester", semester) \
            .execute()
        
        subjects = subjects_result.data if subjects_result.data else []
        
        if not subjects:
            print(f"[ENROLL] ⚠️  No curriculum found for {department} semester {semester}")
            return False

        print(f"[ENROLL] Found {len(subjects)} subjects for {department} sem {semester}")

        # 2. Find or create section
        print(f"[ENROLL] 🏛️  Looking up section {department}-{section_name}")
        section_result = sb.table("sections") \
            .select("id") \
            .eq("department", department) \
            .eq("semester", semester) \
            .eq("section_name", section_name) \
            .eq("academic_year", academic_year) \
            .execute()

        section_id = None
        if section_result.data:
            section_id = section_result.data[0]["id"]
            print(f"[ENROLL] Found section: {section_id}")
        else:
            # Create new section
            print(f"[ENROLL] Creating new section {department}-{section_name}")
            try:
                year_num = int(semester / 2 + 0.5)  # semester 1-2 → year 1, 3-4 → year 2, etc.
            except:
                year_num = 1
            
            new_section = sb.table("sections").insert({
                "department": department,
                "program": program,
                "semester": semester,
                "year": year_num,
                "section_name": section_name,
                "academic_year": academic_year,
                "max_strength": 60
            }).execute()
            
            if new_section.data:
                section_id = new_section.data[0]["id"]
                print(f"[ENROLL] ✅ Created section: {section_id}")
            else:
                print(f"[ENROLL] ❌ Failed to create section")
                return False

        # 3. Determine batch for lab subjects based on student count
        # Count how many students already in this section
        existing_enrollments = sb.table("enrollments") \
            .select("student_id") \
            .eq("section_id", section_id) \
            .execute()
        
        student_position = len(existing_enrollments.data) + 1 if existing_enrollments.data else 1
        batch_assignment = "Batch1" if student_position <= 30 else "Batch2"
        
        print(f"[ENROLL] 👥 Student position {student_position} → {batch_assignment}")

        # 4. Create enrollment rows for each subject
        enrollments_to_create = []
        for subject in subjects:
            # Check if already enrolled (prevent duplicates)
            existing_enroll = sb.table("enrollments") \
                .select("id") \
                .eq("student_id", student_id) \
                .eq("subject_code", subject["subject_code"]) \
                .eq("academic_year", academic_year) \
                .execute()
            
            if existing_enroll.data:
                print(f"[ENROLL] ⏭️  Skipping {subject['subject_code']} (already enrolled)")
                continue

            enrollment_row = {
                "student_id": student_id,
                "roll_no": roll_no,
                "subject_code": subject["subject_code"],
                "subject_name": subject["subject_name"],
                "section_id": section_id,
                "section_name": section_name,
                "batch_name": batch_assignment if subject["subject_type"] == "lab" else None,
                "department": department,
                "program": program,
                "semester": semester,
                "academic_year": academic_year,
                "enrollment_type": subject["subject_type"],  # core, lab, elective, etc.
                "status": "active"
            }
            
            enrollments_to_create.append(enrollment_row)
            print(f"[ENROLL] ✓ Queued enrollment: {subject['subject_code']} ({subject['subject_type']})")

        # 5. Bulk insert all enrollments
        if enrollments_to_create:
            try:
                result = sb.table("enrollments").insert(enrollments_to_create).execute()
                count = len(result.data) if result.data else len(enrollments_to_create)
                print(f"[ENROLL] ✅ Enrolled student {roll_no} in {count} subjects")
                return True
            except Exception as e:
                print(f"[ENROLL] ❌ Insert error: {e}")
                return False
        else:
            print(f"[ENROLL] ⚠️  No new enrollments to create")
            return False

    except Exception as e:
        print(f"[ENROLL] ❌ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        return False


# ═══════════════════════════════════════════════════════════════════════════════
# ENROLLMENT API ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

def register_enrollment_endpoints(app, sb):
    """Register all enrollment-related API endpoints with Flask app."""
    
    @app.route("/api/enrollments/student/<roll_no>", methods=["GET"])
    def get_student_enrollments(roll_no):
        """Get all enrolled subjects for a student (by roll number)."""
        try:
            if not sb:
                return {"success": False, "error": "Supabase not configured"}, 500
            
            result = sb.table("enrollments") \
                .select("*") \
                .eq("roll_no", roll_no) \
                .eq("status", "active") \
                .execute()
            
            enrollments = result.data if result.data else []
            
            # Group by type for frontend display
            core = [e for e in enrollments if e.get("enrollment_type") == "core"]
            labs = [e for e in enrollments if e.get("enrollment_type") == "lab"]
            electives = [e for e in enrollments if e.get("enrollment_type") == "elective"]
            
            return {
                "success": True,
                "enrollments": enrollments,
                "summary": {
                    "total": len(enrollments),
                    "core": len(core),
                    "labs": len(labs),
                    "electives": len(electives)
                }
            }, 200
            
        except Exception as e:
            print(f"[API] Error fetching enrollments for {roll_no}: {e}")
            return {"success": False, "error": str(e)}, 500

    @app.route("/api/enrollments/subject/<subject_code>", methods=["GET"])
    def get_subject_students(subject_code):
        """Get list of enrolled students for a subject (for attendance marking).
        Returns students grouped by section/batch if faculty is marking attendance."""
        try:
            if not sb:
                return {"success": False, "error": "Supabase not configured"}, 500
            
            from flask import request
            
            section = request.args.get("section")
            batch = request.args.get("batch")
            group_by = request.args.get("group_by", "section")  # section or batch
            
            q = sb.table("enrollments") \
                .select("*") \
                .eq("subject_code", subject_code) \
                .eq("status", "active") \
                .order("section_name, batch_name, roll_no")
            
            if section:
                q = q.eq("section_name", section)
            if batch:
                q = q.eq("batch_name", batch)
            
            result = q.execute()
            students = result.data if result.data else []
            
            # Group students by section and batch for faculty view
            grouped_students = {}
            if group_by == "section":
                for student in students:
                    sec = student.get("section_name", "A")
                    batch_name = student.get("batch_name", "All")
                    
                    if sec not in grouped_students:
                        grouped_students[sec] = {}
                    if batch_name not in grouped_students[sec]:
                        grouped_students[sec][batch_name] = []
                    
                    grouped_students[sec][batch_name].append(student)
            
            return {
                "success": True,
                "subject_code": subject_code,
                "section_filter": section,
                "batch_filter": batch,
                "students": students,
                "grouped_students": grouped_students,
                "total_students": len(students),
                "summary": {
                    "total": len(students),
                    "by_section": {sec: sum(len(b) for b in batches.values()) 
                                   for sec, batches in grouped_students.items()}
                }
            }, 200
            
        except Exception as e:
            print(f"[API] Error fetching subject students: {e}")
            return {"success": False, "error": str(e)}, 500

    @app.route("/api/enrollments/elective", methods=["POST"])
    def enroll_elective():
        """Enroll student in an elective subject (seat-limited)."""
        try:
            from flask import request
            
            if not sb:
                return {"success": False, "error": "Supabase not configured"}, 500
            
            data = request.json or {}
            required_fields = ["student_id", "roll_no", "subject_code", "subject_name", "department", "semester"]
            
            if not all(data.get(f) for f in required_fields):
                return {"success": False, "error": f"Missing required fields: {', '.join(required_fields)}"}, 400
            
            # Check seat availability
            max_seats = int(data.get("max_seats", 60))
            existing = sb.table("enrollments") \
                .select("id") \
                .eq("subject_code", data["subject_code"]) \
                .eq("academic_year", data.get("academic_year", "2025-26")) \
                .eq("status", "active") \
                .execute()
            
            if existing.data and len(existing.data) >= max_seats:
                return {
                    "success": False,
                    "error": f"Elective {data['subject_code']} is full ({max_seats} seats)"
                }, 400
            
            # Create enrollment
            enrollment_payload = {
                "student_id": data["student_id"],
                "roll_no": data["roll_no"],
                "subject_code": data["subject_code"],
                "subject_name": data["subject_name"],
                "section_name": data.get("section", "A"),
                "department": data["department"],
                "semester": int(data["semester"]),
                "academic_year": data.get("academic_year", "2025-26"),
                "enrollment_type": "elective",
                "status": "active"
            }
            
            result = sb.table("enrollments").insert(enrollment_payload).execute()
            
            if result.data:
                return {
                    "success": True,
                    "enrollment": result.data[0],
                    "message": f"Enrolled in {data['subject_name']}"
                }, 201
            else:
                return {"success": False, "error": "Enrollment creation failed"}, 500
                
        except Exception as e:
            print(f"[API] Elective enrollment error: {e}")
            return {"success": False, "error": str(e)}, 500

    @app.route("/api/timetable/student/<roll_no>", methods=["GET"])
    def get_student_timetable(roll_no):
        """Get personalized timetable for a student based on their enrollments."""
        try:
            if not sb:
                return {"success": True, "timetable": []}, 200
            
            # Get student's enrollments
            enrollments = sb.table("enrollments") \
                .select("subject_code, section_name, batch_name, department") \
                .eq("roll_no", roll_no) \
                .eq("status", "active") \
                .execute()
            
            if not enrollments.data:
                return {
                    "success": True,
                    "timetable": [],
                    "message": "No enrollments found for this student"
                }, 200
            
            # Get student's section info
            student = sb.table("users") \
                .select("department,section,year,semester") \
                .eq("roll_no", roll_no) \
                .execute()
            
            if not student.data:
                return {"success": False, "error": "Student not found"}, 404
            
            student_info = student.data[0]
            dept = student_info.get("department", "")
            section = (student_info.get("section") or "A").split("-")[-1]  # "CSE-A" → "A"
            
            # Fetch timetable for this student's section
            timetable = sb.table("timetable") \
                .select("*") \
                .eq("department", dept) \
                .eq("section", section) \
                .execute()
            
            tt_entries = timetable.data if timetable.data else []
            
            # Filter timetable to only show classes the student is enrolled in
            enrolled_subjects = {e["subject_code"] for e in enrollments.data}
            filtered_timetable = [
                t for t in tt_entries 
                if any(subj in t.get("subject_name", "").upper() or 
                       t.get("subject_code", "").upper() in enrolled_subjects 
                       for subj in enrolled_subjects)
            ]
            
            return {
                "success": True,
                "timetable": filtered_timetable,
                "enrollments": enrollments.data,
                "student_section": section,
                "total_classes": len(filtered_timetable),
                "enrolled_subjects": len(enrollments.data)
            }, 200
            
        except Exception as e:
            print(f"[API] Error fetching student timetable: {e}")
            return {"success": False, "error": str(e)}, 500

    @app.route("/api/enrollments/bulk", methods=["POST"])
    def bulk_enroll_endpoint():
        """Bulk enroll students (60 per section).
        
        Request body:
        {
            "students": [
                {"student_id": "uuid", "roll_no": "CSE001", "section_name": "A"},
                {"student_id": "uuid", "roll_no": "CSE002", "section_name": "A"},
                ...
            ],
            "department": "CSE",
            "program": "CSE",
            "semester": 1,
            "academic_year": "2025-26"
        }
        """
        try:
            from flask import request
            
            if not sb:
                return {"success": False, "error": "Supabase not configured"}, 500
            
            data = request.json or {}
            students_list = data.get("students", [])
            department = data.get("department")
            program = data.get("program")
            semester = data.get("semester")
            academic_year = data.get("academic_year", "2025-26")
            
            if not all([students_list, department, program, semester]):
                return {
                    "success": False,
                    "error": "Missing required fields: students, department, program, semester"
                }, 400
            
            # Call bulk enrollment function
            result = bulk_enroll_students(sb, students_list, department, program, semester, academic_year)
            
            status_code = 200 if result.get("success") else 400
            return result, status_code
            
        except Exception as e:
            print(f"[API] Bulk enrollment error: {e}")
            return {"success": False, "error": str(e)}, 500

    @app.route("/api/enrollments/section-counts", methods=["GET"])
    def get_section_counts():
        """Get student count per section.
        
        Query parameters:
        ?department=CSE&semester=1&year=2025-26
        """
        try:
            from flask import request
            
            if not sb:
                return {"success": False, "error": "Supabase not configured"}, 500
            
            department = request.args.get("department")
            semester = request.args.get("semester", type=int)
            academic_year = request.args.get("year", "2025-26")
            
            if not department or semester is None:
                return {
                    "success": False,
                    "error": "Missing parameters: department, semester"
                }, 400
            
            # Get section-wise counts
            counts = get_section_wise_student_count(sb, department, semester, academic_year)
            
            # Calculate which sections need more students (< 60)
            has_space = {}
            for section, count in counts.items():
                has_space[section] = 60 - count
            
            return {
                "success": True,
                "department": department,
                "semester": semester,
                "academic_year": academic_year,
                "section_counts": counts,
                "available_seats": has_space,
                "total_students": sum(counts.values())
            }, 200
            
        except Exception as e:
            print(f"[API] Section counts error: {e}")
            return {"success": False, "error": str(e)}, 500

    @app.route("/api/faculty/subject-students/<subject_code>", methods=["GET"])
    def faculty_get_subject_students(subject_code):
        """Faculty endpoint: Get all students in a subject, grouped by section.
        
        Query parameters:
        ?section=A        (optional: filter by section)
        ?batch=Batch1     (optional: filter by batch)
        """
        try:
            from flask import request
            
            if not sb:
                return {"success": False, "error": "Supabase not configured"}, 500
            
            section_filter = request.args.get("section")
            batch_filter = request.args.get("batch")
            
            # Get students in this subject
            q = sb.table("enrollments") \
                .select("*") \
                .eq("subject_code", subject_code) \
                .eq("status", "active") \
                .order("section_name, batch_name, roll_no")
            
            if section_filter:
                q = q.eq("section_name", section_filter)
            
            result = q.execute()
            students = result.data if result.data else []
            
            # Group by section and batch
            grouped = {}
            for student in students:
                sec = student.get("section_name", "A")
                batch = student.get("batch_name", "All")
                
                if sec not in grouped:
                    grouped[sec] = {}
                if batch not in grouped[sec]:
                    grouped[sec][batch] = []
                
                grouped[sec][batch].append({
                    "roll_no": student.get("roll_no"),
                    "student_id": student.get("student_id"),
                    "section": sec,
                    "batch": batch,
                    "enrollment_status": student.get("status")
                })
            
            # Calculate summary
            summary_by_section = {}
            for sec, batches in grouped.items():
                total_in_section = sum(len(students_list) for students_list in batches.values())
                summary_by_section[sec] = {
                    "total": total_in_section,
                    "batches": {batch: len(students_list) for batch, students_list in batches.items()}
                }
            
            return {
                "success": True,
                "subject_code": subject_code,
                "total_students": len(students),
                "grouped_by_section": grouped,
                "summary": summary_by_section,
                "section_filter": section_filter,
                "batch_filter": batch_filter
            }, 200
            
        except Exception as e:
            print(f"[API] Faculty subject students error: {e}")
            return {"success": False, "error": str(e)}, 500

    print("[ENROLLMENT] ✅ All enrollment API endpoints registered")


# ═══════════════════════════════════════════════════════════════════════════════
if __name__ == "__main__":
    print("Enrollment system helper module loaded")
