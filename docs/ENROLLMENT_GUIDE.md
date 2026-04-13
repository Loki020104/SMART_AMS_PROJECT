# 📚 Enrollment System Guide

> Complete curriculum and enrollment management system for SmartAMS. Automatically enrolls students in subjects, manages sections, assigns lab batches, and integrates with the platform.

**Setup Time:** 20-30 minutes | **Status:** Production-Ready ✅

---

## 📋 Table of Contents

- [Overview](#overview)
- [5-Step Quick Setup](#5-step-quick-setup)
- [Database Schema](#database-schema)
- [Backend Implementation](#backend-implementation)
- [Frontend Integration](#frontend-integration)
- [Testing](#testing)
- [API Reference](#api-reference)

---

## Overview

### What It Does

| Feature | Details |
|---------|---------|
| **Auto-Enrollment** | Students automatically enroll in courses matching their department and semester |
| **Section Management** | Sections auto-created (CSE-A, CSE-B, etc.) with defined capacity |
| **Batch Assignment** | Lab batches auto-assigned: Batch1 (1-30), Batch2 (31-60) |
| **Enrollment Tracking** | Track enrollment status (active, dropped, completed) |
| **API Access** | Query student enrollments, curriculum, subject students |

### How It Works

```
Student Created
  ↓
auto_enroll_student() triggered
  ↓
Reads curriculum for SSN department + semester
  ↓
Creates/finds section (CSE-A, CSE-B, etc.)
  ↓
Enrolls in all core + lab + elective subjects
  ↓
Assigns batch based on student count
  ↓
Enrollment complete → Student sees subjects in dashboard
```

---

## 5-Step Quick Setup

### Step 1: Database Setup (3 minutes)

**Location:** `curriculum_setup.sql`

1. Open Supabase SQL Editor
2. Copy entire `curriculum_setup.sql` file
3. Paste and execute
4. ✅ 4 new tables created: `curriculum`, `sections`, `batches`, `enrollments`
5. ✅ Seed data inserted (CSE & ECE curriculum)

**What Gets Created:**
- `curriculum` table (4 fields: dept, semester, subject, type)
- `sections` table (CSE-A, CSE-B groupings)
- `batches` table (Lab batch divisions)
- `enrollments` table (student → subject junction)
- 12 performance indexes
- Pre-created curriculum for CSE & ECE

### Step 2: Backend Setup (5 minutes)

**Location:** `backend/backend.py`

**Step 2A:** Import enrollment module (at top of file):
```python
from enrollment_system import auto_enroll_student, register_enrollment_endpoints
```

**Step 2B:** Register endpoints (after CORS setup):
```python
# After CORS configuration:
register_enrollment_endpoints(app, sb)
```

**Step 2C:** Add auto-enroll call (in `add_user()` function):

Find where user is inserted, then add:
```python
result = sb.table("users").insert(user_payload).execute()
new_id = result.data[0]["id"] if result.data else None

# Auto-enroll student RIGHT HERE:
if new_id and user_payload.get("role") == "student":
    try:
        auto_enroll_student(
            sb=sb,
            student_id=new_id,
            roll_no=user_payload.get("roll_no", ""),
            department=user_payload.get("department", ""),
            program=user_payload.get("department", ""),
            semester=int(user_payload.get("semester", 1)),
            section_name="A",  # or parse from section field
            academic_year="2025-26"
        )
    except Exception as e:
        print(f"[ENROLL] Auto-enrollment warning: {e}")
```

### Step 3: Frontend Setup (5 minutes)

**Location:** `frontend/app.js`

**Add this function in student dashboard section:**

```javascript
async function loadStudentSubjects() {
    const roll = AMS.profile?.roll_no;
    if (!roll) return;
    
    try {
        const resp = await fetch(
            `${window.AMS_CONFIG.API_URL}/api/enrollments/student/${roll}`
        );
        const data = await resp.json();
        
        if (data.success) {
            AMS.studentEnrollments = data.enrollments;
            renderSubjectCards(data.enrollments);
        }
    } catch (err) {
        console.error('[Enrollment] Error:', err);
    }
}

function renderSubjectCards(enrollments) {
    if (!enrollments) return;
    
    const container = document.getElementById('coursesContainer');
    if (!container) return;
    
    const core = enrollments.filter(e => e.enrollment_type === 'core');
    const labs = enrollments.filter(e => e.enrollment_type === 'lab');
    const elective = enrollments.filter(e => e.enrollment_type === 'elective');

    let html = '';
    
    // Core subjects
    if (core.length > 0) {
        html += `<h4 style="color: #1f6feb; margin-top: 20px;">Core Subjects (${core.length})</h4>`;
        for (const e of core) {
            html += `<div class="card" style="margin: 8px 0; border-left: 4px solid #1f6feb; padding: 12px;">
                <strong>${e.subject_code}</strong> - ${e.subject_name}
                <div style="font-size: 12px; color: #666; margin-top: 4px;">Section: ${e.section_name}</div>
            </div>`;
        }
    }
    
    // Lab subjects
    if (labs.length > 0) {
        html += `<h4 style="color: #28a745; margin-top: 20px;">Laboratory (${labs.length})</h4>`;
        for (const e of labs) {
            html += `<div class="card" style="margin: 8px 0; border-left: 4px solid #28a745; padding: 12px;">
                <strong>${e.subject_code}</strong> - ${e.subject_name}
                <div style="font-size: 12px; color: #666; margin-top: 4px;">
                    Batch: ${e.batch_name || 'TBD'}
                </div>
            </div>`;
        }
    }
    
    // Electives
    if (elective.length > 0) {
        html += `<h4 style="color: #6c757d; margin-top: 20px;">Electives (${elective.length})</h4>`;
        for (const e of elective) {
            html += `<div class="card" style="margin: 8px 0; border-left: 4px solid #6c757d; padding: 12px;">
                <strong>${e.subject_code}</strong> - ${e.subject_name}
            </div>`;
        }
    }
    
    container.innerHTML = html;
}
```

**Call it when loading student dashboard:**
```javascript
// In student dashboard init:
if (AMS.role === 'student') {
    loadStudentSubjects();
}
```

### Step 4: Testing (3 minutes)

**Test API:**
```bash
# 1. Check curriculum loaded
curl http://localhost:6001/api/curriculum?department=CSE&semester=1

# 2. Create test student (triggers auto-enroll)
curl -X POST http://localhost:6001/api/users/add \
  -H "Content-Type: application/json" \
  -d '{
    "username":"TEST001",
    "password":"test123",
    "role":"student",
    "full_name":"Test Student",
    "email":"test@example.com",
    "department":"CSE",
    "semester":1
  }'

# 3. Check student enrollments
curl http://localhost:6001/api/enrollments/student/TEST001

# 4. Check subject students
curl http://localhost:6001/api/enrollments/subject/CS101?section=A
```

**Test UI:**
1. Create test student via admin panel
2. Login as that student
3. View "Courses" tab
4. ✅ Should see 6-8 enrolled subjects

### Step 5: Deploy (1 minute)

```bash
# Restart backend
pkill -f backend.py
python backend/backend.py &

# Reload browser
```

---

## Database Schema

### Table: `curriculum`
```sql
id (UUID)
department (text)           - CSE, ECE, MECH, etc.
semester (integer)          - 1-8
subject_code (text)         - CS101, CS102, etc.
subject_name (text)         - Data Structures, etc.
subject_type (enum)         - core | lab | elective
credits (integer)           - 4, 2, 3, etc.
prerequisites (text[])      - Required subjects
created_at (timestamp)
```

### Table: `sections`
```sql
id (UUID)
section_name (text)         - CSE-A, CSE-B, ECE-A, etc.
department (text)
academic_year (text)        - 2025-26
capacity (integer)          - 30 or 60
current_count (integer)     - auto-updated
created_at (timestamp)
```

### Table: `batches`
```sql
id (UUID)
section_id (UUID) FK       → sections.id
batch_name (text)          - Batch1, Batch2
student_count (integer)
created_at (timestamp)
```

### Table: `enrollments`
```sql
id (UUID)
student_id (UUID) FK        → users.id
roll_no (text)
subject_code (text)
subject_name (text)
section_name (text)         - CSE-A, CSE-B, etc.
batch_name (text)           - Batch1, Batch2 (labs only)
enrollment_type (enum)      - core | lab | elective
status (enum)               - active | dropped | completed
academic_year (text)        - 2025-26
enrolled_date (timestamp)
```

---

## Backend Implementation

### File: `backend/enrollment_system.py`

**Key Functions:**

```python
def auto_enroll_student(
    sb, student_id, roll_no, department, 
    program, semester, section_name, academic_year
)
```
- Reads curriculum for student's dept/semester
- Creates/finds section (CSE-A, CSE-B, etc.)
- Assigns batch based on student count
- Inserts enrollments for all core + lab + elective subjects
- Prevents duplicate enrollments
- Returns: `{"status": "success", "enrolled": 6}`

```python
def register_enrollment_endpoints(app, sb)
```
- Registers 5 endpoints on the Flask app:
  - `GET /api/curriculum`
  - `GET /api/enrollments/student/<roll_no>`
  - `GET /api/enrollments/subject/<code>`
  - `POST /api/enrollments/enroll`
  - `POST /api/enrollments/drop`

---

## Frontend Integration

### Display Student Courses

When student logs in, fetch and display their enrollments:

```javascript
// Load on dashboard init
async function initStudentDashboard() {
    loadStudentSubjects();  // Loads enrollments from API
    renderSubjectCards(AMS.studentEnrollments);
}
```

### Manage Enrollments (Optional Advanced Feature)

```javascript
// Drop a subject
async function dropSubject(enrollmentId) {
    const resp = await fetch(
        `${API_URL}/api/enrollments/drop`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enrollment_id: enrollmentId })
        }
    );
    return resp.json();
}

// Add elective subject
async function addElective(subjectCode) {
    const resp = await fetch(
        `${API_URL}/api/enrollments/enroll`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                roll_no: AMS.profile.roll_no,
                subject_code: subjectCode,
                enrollment_type: 'elective'
            })
        }
    );
    return resp.json();
}
```

---

## Testing

### API Tests

```bash
# Test 1: Get curriculum
curl -s "http://localhost:6001/api/curriculum?department=CSE&semester=1" | jq

# Test 2: Get student enrollments
curl -s "http://localhost:6001/api/enrollments/student/20261cse0001" | jq

# Test 3: Get subject students
curl -s "http://localhost:6001/api/enrollments/subject/CS101?section=A" | jq

# Test 4: Drop enrollment
curl -X POST http://localhost:6001/api/enrollments/drop \
  -H "Content-Type: application/json" \
  -d '{"enrollment_id":"uuid-here"}'
```

### UI Tests

**Enrollment Display:**
1. Login as student
2. Open "Courses" or "Dashboard"
3. ✅ Should see grouped subjects (Core, Labs, Electives)
4. ✅ Should show section and batch information
5. ✅ Should update if subjects dropped

**Admin Test:**
1. Login as admin
2. Create student via "Add User"
3. ✅ Student auto-enrolled instantly
4. ✅ Can see enrollments via API

---

## API Reference

### GET `/api/curriculum`

Get curriculum for department/semester.

**Parameters:**
```
?department=CSE
&semester=1
```

**Response:**
```json
{
  "success": true,
  "curriculum": [
    {
      "subject_code": "CS101",
      "subject_name": "Data Structures",
      "subject_type": "core",
      "credits": 4
    },
    {
      "subject_code": "CS110",
      "subject_name": "CSE Lab",
      "subject_type": "lab",
      "credits": 2
    }
  ]
}
```

### GET `/api/enrollments/student/:roll_no`

Get all enrollments for a student.

**Response:**
```json
{
  "success": true,
  "enrollments": [
    {
      "id": "uuid",
      "subject_code": "CS101",
      "subject_name": "Data Structures",
      "section_name": "CSE-A",
      "batch_name": "Batch1",
      "enrollment_type": "core",
      "status": "active"
    }
  ],
  "summary": {
    "total": 8,
    "core": 5,
    "lab": 2,
    "elective": 1
  }
}
```

### GET `/api/enrollments/subject/:code`

Get all students enrolled in a subject.

**Parameters:**
```
?section=A&batch=Batch1
```

**Response:**
```json
{
  "success": true,
  "subject_code": "CS101",
  "section_name": "CSE-A",
  "students": [
    {
      "roll_no": "20261cse0001",
      "full_name": "John Doe",
      "batch_name": "Batch1"
    }
  ],
  "total": 25
}
```

### POST `/api/enrollments/enroll`

Manually enroll student in subject.

**Body:**
```json
{
  "roll_no": "20261cse0001",
  "subject_code": "CS105",
  "enrollment_type": "elective"
}
```

**Response:**
```json
{
  "success": true,
  "enrollment_id": "uuid",
  "message": "Enrolled in CS105"
}
```

### POST `/api/enrollments/drop`

Drop enrollment.

**Body:**
```json
{
  "enrollment_id": "uuid-of-enrollment"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Enrollment dropped"
}
```

---

## Customization

### Change Curriculum

Edit `curriculum_setup.sql` before running:

```sql
INSERT INTO curriculum (department, semester, subject_code, subject_name, subject_type, credits)
VALUES ('YOUR_DEPT', 1, 'YOUR_CODE', 'Your Subject', 'core', 4);
```

### Change Batch Sizes

In `backend/enrollment_system.py`, find:

```python
BATCH_1_CAPACITY = 30  # ← change this
BATCH_2_CAPACITY = 60  # ← change this
```

### Change Section Names

In `backend/enrollment_system.py`, modify:

```python
section_name = f"{department.upper()}-{batch_letter}"  # Format: CSE-A, CSE-B
```

---

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| "Table already exists" | Schema run twice | Drop tables first: `DROP TABLE enrollments, curriculum, sections, batches;` |
| Auto-enroll not triggering | Function not called | Verify `auto_enroll_student()` call is in `add_user()` |
| Enrollments not showing | API not registered | Check `register_enrollment_endpoints(app, sb)` is called |
| Wrong subjects enrolled | Curriculum incomplete | Check `curriculum_setup.sql` was fully executed |
| Batch count incorrect | Section capacity wrong | Verify `capacity` field in `sections` table |

---

## Performance Tips

- Enrollment queries use indexes on `(student_id, status)` and `(subject_code, section_name)`
- Pre-load curriculum on backend startup to avoid repeated queries
- Cache student enrollments in frontend sessionStorage if fetched frequently
- Batch enroll multiple students at once via bulk import

---

**Last Updated:** March 17, 2026  
**Status:** Production Ready ✅
