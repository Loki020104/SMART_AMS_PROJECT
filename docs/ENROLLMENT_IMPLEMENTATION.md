# ═══════════════════════════════════════════════════════════════════════════════
# SMART AMS - CURRICULUM & ENROLLMENT IMPLEMENTATION GUIDE
# Complete step-by-step setup instructions
# ═══════════════════════════════════════════════════════════════════════════════

## 📋 COMPLETE IMPLEMENTATION CHECKLIST

### Step 1: Setup Database Tables ✅
Location: curriculum_setup.sql
- [ ] Open Supabase console: https://app.supabase.com
- [ ] Navigate to SQL Editor
- [ ] Copy all SQL from `curriculum_setup.sql`
- [ ] Paste into editor and run
- [ ] Verify 4 new tables created: curriculum, sections, batches, enrollments
- [ ] Verify seed data inserted (CSE, ECE subjects and sections)

### Step 2: Add Enrollment Functions to Backend
Location: backend/backend.py

**2A. Import enrollment module (at top of file):**
```python
from enrollment_system import auto_enroll_student, register_enrollment_endpoints
```

**2B. Register endpoints (in main app setup, after CORS):**
```python
# After: CORS(app, resources={r"/api/*": {"origins": "*"}}, supports_credentials=True)
register_enrollment_endpoints(app, sb)
```

**2C. Call auto-enroll when student is created (in add_user endpoint):**

Find this section in add_user() function:
```python
result = sb.table("users").insert(user_payload).execute()
new_id = result.data[0]["id"] if result.data else None
```

Add right after:
```python
# Auto-enroll student in subjects for their semester
if new_id and user_payload.get("role") == "student":
    try:
        auto_enroll_student(
            sb=sb,
            student_id=new_id,
            roll_no=user_payload.get("roll_no", ""),
            department=user_payload.get("department", ""),
            program=user_payload.get("program", user_payload.get("department", "")),
            semester=int(user_payload.get("semester", 1)),
            section_name=(user_payload.get("section", "A").split("-")[-1] if user_payload.get("section") else "A"),
            academic_year="2025-26"
        )
    except Exception as e:
        print(f"[ENROLL] Warning: Auto-enrollment failed for {user_payload.get('roll_no')}: {e}")
```

### Step 3: Update Frontend to Load Student Subjects
Location: frontend/app.js

Add this function in the student dashboard section:
```javascript
async function loadStudentSubjects() {
    const roll = AMS.profile?.roll_no;
    if (!roll) return;
    
    try {
        const resp = await fetch(`${window.AMS_CONFIG.API_URL}/api/enrollments/student/${roll}`);
        const data = await resp.json();
        
        if (data.success) {
            AMS.studentEnrollments = data.enrollments;
            AMS.enrollmentSummary = data.summary;
            renderSubjectCards(data.enrollments);
        }
    } catch (err) {
        console.error('[Enrollments] Error loading subjects:', err.message);
    }
}

function renderSubjectCards(enrollments) {
    const container = document.getElementById('subjectList') || document.getElementById('coursesContainer');
    if (!container) return;
    
    const core    = enrollments.filter(e => e.enrollment_type === 'core');
    const labs    = enrollments.filter(e => e.enrollment_type === 'lab');
    const elective = enrollments.filter(e => e.enrollment_type === 'elective');

    let html = '';
    
    if (core.length > 0) {
        html += `<div class="subject-group">
            <h4 style="color: #1f6feb; font-weight: 600; margin-top: 20px;">Core Subjects (${core.length})</h4>
            <div class="subject-grid">`;
        for (const e of core) {
            html += `<div class="subject-card" style="padding: 12px; border-left: 4px solid #1f6feb;">
                <div style="font-weight: 600; color: #1f6feb;">${e.subject_code}</div>
                <div style="font-size: 14px; margin: 4px 0;">${e.subject_name}</div>
                <div style="font-size: 12px; color: #666;">Section ${e.section_name}</div>
            </div>`;
        }
        html += `</div></div>`;
    }
    
    if (labs.length > 0) {
        html += `<div class="subject-group">
            <h4 style="color: #28a745; font-weight: 600; margin-top: 20px;">Laboratory (${labs.length})</h4>
            <div class="subject-grid">`;
        for (const e of labs) {
            html += `<div class="subject-card" style="padding: 12px; border-left: 4px solid #28a745;">
                <div style="font-weight: 600; color: #28a745;">${e.subject_code}</div>
                <div style="font-size: 14px; margin: 4px 0;">${e.subject_name}</div>
                <div style="font-size: 12px; color: #666; margin-top: 6px; background: #e8f5e9; padding: 4px 8px; border-radius: 4px;">
                    📍 ${e.batch_name || 'TBD'}
                </div>
            </div>`;
        }
        html += `</div></div>`;
    }
    
    if (elective.length > 0) {
        html += `<div class="subject-group">
            <h4 style="color: #6c757d; font-weight: 600; margin-top: 20px;">Electives (${elective.length})</h4>
            <div class="subject-grid">`;
        for (const e of elective) {
            html += `<div class="subject-card" style="padding: 12px; border-left: 4px solid #6c757d;">
                <div style="font-weight: 600; color: #6c757d;">${e.subject_code}</div>
                <div style="font-size: 14px; margin: 4px 0;">${e.subject_name}</div>
                <div style="font-size: 12px; color: #999;">Elective</div>
            </div>`;
        }
        html += `</div></div>`;
    }
    
    container.innerHTML = html;
}
```

Call this function when student dashboard loads:
```javascript
// In your student dashboard initialization (after login):
if (AMS.role === 'student') {
    loadStudentSubjects();
}
```

### Step 4: Update Attendance Marking
Location: backend/backend.py - in attendance marking endpoint

Replace hardcoded student list with:
```python
# OLD CODE (don't use):
# students = sb.table("users").select("roll_no, full_name").eq("department", dept).execute()

# NEW CODE (use this):
enrolled_students = sb.table("enrollments") \
    .select("roll_no, student_id, batch_name") \
    .eq("subject_code", subject_code) \
    .eq("section_name", section) \
    .eq("status", "active") \
    .execute()

students = enrolled_students.data if enrolled_students.data else []
```

### Step 5: Test the Complete Flow

#### 5A. Manual Test via API
```bash
# Get current datetime (will need for testing)
DATE=$(date +%Y-%m-%d)

# Test 1: Check curriculum was seeded
curl -s "http://localhost:6001/api/curriculum?department=CSE&semester=1" 

# Test 2: Create a test student (triggers auto-enroll)
curl -X POST http://localhost:6001/api/users/add \
  -H "Content-Type: application/json" \
  -d '{
    "username":"TEST001",
    "password":"test123",
    "role":"student",
    "full_name":"Test Student Enrollment",
    "email":"test@enrollment.com",
    "department":"CSE",
    "semester":1,
    "section":"A"
  }'

# Test 3: Check student enrollments (use roll_no returned from Test 2)
curl -s "http://localhost:6001/api/enrollments/student/TEST001"

# Test 4: Check student timetable
curl -s "http://localhost:6001/api/timetable/student/TEST001"

# Test 5: Check subject student list
curl -s "http://localhost:6001/api/enrollments/subject/CS101?section=A"
```

#### 5B. Frontend Test
1. Login as admin
2. Create new student with department CSE, semester 1, section A
3. Check that student auto-enrolls in 6 subjects (4 core + 2 labs)
4. Login as that student
5. Go to dashboard
6. Verify all subjects appear with correct types and batch assignments
7. Click "My Timetable" - should show filtered schedule for their section

### Step 6: Curriculum Customization

Add more subjects for your institution:
```sql
-- Example: Add CSE Semester 5 subjects
INSERT INTO curriculum (department, program, semester, year, subject_code, subject_name, subject_type, credits, hours_per_week)
VALUES
('CSE','CSE',5,3,'CS501','Compiler Design','core',4,4),
('CSE','CSE',5,3,'CS502','Web Development','elective',3,3),
('CSE','CSE',5,3,'CS503','Mobile App Dev','elective',3,3),
('CSE','CSE',5,3,'CS501L','Compiler Lab','lab',2,2);

-- Add sections for Semester 5
INSERT INTO sections (department, program, year, semester, section_name, academic_year)
VALUES ('CSE','CSE',3,5,'A','2025-26'),
       ('CSE','CSE',3,5,'B','2025-26');
```

### Step 7: Admin Features

**View All Enrollments:**
```python
@app.route("/api/enrollments", methods=["GET"])
def get_all_enrollments():
    if not sb:
        return jsonify(success=False, error="Supabase not configured"), 500
    try:
        q = sb.table("enrollments").select("*")
        if request.args.get("subject_code"):
            q = q.eq("subject_code", request.args["subject_code"])
        if request.args.get("section"):
            q = q.eq("section_name", request.args["section"])
        if request.args.get("academic_year"):
            q = q.eq("academic_year", request.args["academic_year"])
        result = q.execute()
        return jsonify(success=True, enrollments=result.data or [], count=len(result.data or []))
    except Exception as e:
        return jsonify(success=False, error=str(e)), 500
```

**Enroll Student Manually (Admin):**
```python
@app.route("/api/enrollments/manual", methods=["POST"])
def manual_enroll():
    if not sb:
        return jsonify(success=False, error="Supabase not configured"), 500
    try:
        from enrollment_system import auto_enroll_student
        data = request.json or {}
        success = auto_enroll_student(
            sb=sb,
            student_id=data.get("student_id"),
            roll_no=data.get("roll_no"),
            department=data.get("department"),
            program=data.get("program"),
            semester=int(data.get("semester", 1)),
            section_name=data.get("section_name", "A"),
            academic_year=data.get("academic_year", "2025-26")
        )
        if success:
            return jsonify(success=True, message="Student enrolled successfully")
        else:
            return jsonify(success=False, error="Enrollment failed"), 500
    except Exception as e:
        return jsonify(success=False, error=str(e)), 500
```

---

## 📊 DATABASE SCHEMA REFERENCE

### curriculum table
```
id              UUID (PK)
department      TEXT (CSE, ECE, EEE...)
program         TEXT (CSE, AIML...)
semester        INTEGER (1-8)
year            INTEGER (1-4)
subject_code    TEXT (CS101, EC201...)
subject_name    TEXT (Programming Fundamentals...)
subject_type    TEXT (core, elective, lab, tutorial)
credits         INTEGER (default 3)
hours_per_week  INTEGER (default 3)
prerequisite_code TEXT (optional)
created_at      TIMESTAMPTZ
UNIQUE(department, semester, subject_code)
```

### sections table
```
id              UUID (PK)
department      TEXT
program         TEXT
year            INTEGER
semester        INTEGER
section_name    TEXT (A, B, C)
academic_year   TEXT (2025-26)
max_strength    INTEGER (default 60)
created_at      TIMESTAMPTZ
UNIQUE(department, semester, section_name, academic_year)
```

### enrollments table
```
id              UUID (PK)
student_id      UUID (FK → users.id)
roll_no         TEXT
subject_code    TEXT (FK → curriculum.subject_code)
subject_name    TEXT
section_id      UUID (FK → sections.id)
section_name    TEXT (A, B, C)
batch_name      TEXT (Batch1, Batch2 for labs)
department      TEXT
program         TEXT
semester        INTEGER
academic_year   TEXT
enrollment_type TEXT (core, elective, arrear, bridge)
status          TEXT (active, dropped, completed, failed)
created_at      TIMESTAMPTZ
UNIQUE(student_id, subject_code, academic_year)
```

---

## 🚀 EXPECTED FLOW

```
Admin Creates Student
    ↓
Triggers auto_enroll_student()
    ↓
Reads curriculum for dept/semester
    ↓
Creates/finds section
    ↓
Assigns batch based on student count
    ↓
Inserts enrollment rows for all core+lab subjects
    ↓
Student logs in
    ↓
Frontend calls /api/enrollments/student/{roll_no}
    ↓
Displays subjects grouped by type (core/lab/elective)
    ↓
Faculty marks attendance using /api/enrollments/subject/{code}
    ↓
Only enrolled students appear in list
```

---

## 🔧 TROUBLESHOOTING

**Issue: "No curriculum found for CSE sem 1"**
- Solution: Run curriculum_setup.sql to seed data
- Check: `SELECT * FROM curriculum WHERE department='CSE'`

**Issue: Student not auto-enrolled after creation**
- Solution: Check backend logs for [ENROLL] messages
- Verify: Try manual enroll via `/api/enrollments/manual` endpoint

**Issue: Student sees blank subject list**
- Solution: Verify enrollments exist: `SELECT * FROM enrollments WHERE roll_no='XX123'`
- Check: Frontend calling correct API endpoint with roll_no

**Issue: Timetable shows no classes**
- Solution: Verify timetable entries exist for department/section
- Check: `/api/timetable?department=CSE&section=A`

---

END OF IMPLEMENTATION GUIDE
