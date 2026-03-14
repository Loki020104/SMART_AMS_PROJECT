# 🕐 SMART AMS SHIFT-BASED TIMETABLE SYSTEM
## With Break Management & Crowd Control (2 Shifts)

---

## 📌 WHAT THIS DOES

Your timetable system now includes:

### ✅ 2-Shift Schedule
- **Shift 1 (Morning):** 9:00 AM - 1:00 PM
- **Shift 2 (Afternoon):** 2:00 PM - 6:00 PM

### ✅ Break Management
- **Tea Break:** 10 minutes (per shift)
- **Lunch Break:** 45 minutes (all students & faculty)
- Smart break display in timetable

### ✅ Batch-Based Labs
- **Batch1:** Students 1-30 (e.g., 2:00-4:00 PM)
- **Batch2:** Students 31-60 (e.g., 4:00-6:00 PM)
- Same lab, different times

### ✅ Visual Timetable
- Day-by-day tabs (Mon-Fri)
- Separate shift sections
- Color-coded by class type
- Breaks highlighted specially

### ✅ Complete API
- Student timetable endpoint
- Faculty timetable endpoint
- Break timings endpoint
- Shift configuration endpoint

---

## 🗂️ FILES CREATED

```
├── timetable_shifts_schema.sql         ← Database schema
├── backend/timetable_shifts.py         ← Python backend module
├── frontend/timetable_shifts.js        ← Frontend component
├── TIMETABLE_SHIFTS_GUIDE.md           ← Detailed guide
├── TIMETABLE_SHIFTS_QUICKSTART.md      ← 15-minute setup
└── README_TIMETABLE_SHIFTS.md          ← This file!
```

### File Descriptions

#### 1. **timetable_shifts_schema.sql** (400 lines)
**Database schema with 3 new tables:**

```sql
-- timetable (enhanced with shift_number)
-- break_timings (tea break, lunch, etc)
-- shift_config (shift start/end times)
```

**Includes:**
- Proper indexes for performance
- Seed data (2 shifts + breaks + sample timetable)
- Comments explaining each table

#### 2. **backend/timetable_shifts.py** (400 lines)
**Python module with 4 main functions:**

- `get_student_timetable_with_breaks()` - Student's personalized timetable + breaks
- `get_faculty_timetable_with_breaks()` - Faculty's all classes + breaks
- `get_break_timings()` - All breaks (with optional shift filter)
- `get_shift_configuration()` - Shift start/end times
- `register_timetable_shift_endpoints()` - Flask endpoint registration

#### 3. **frontend/timetable_shifts.js** (500 lines)
**JavaScript component with rendering functions:**

- `loadStudentTimetableWithBreaks()` - Fetch and render
- `renderTimetableWithBreaks()` - Main timetable display
- `renderClassSlot()` - Individual class styling
- `renderBreakSlot()` - Break/lunch styling
- `displayBreaksInfo()` - Break summary cards
- `displayShiftInfo()` - Shift info cards
- Complete CSS included in comments

#### 4. **TIMETABLE_SHIFTS_GUIDE.md** (600 lines)
**Detailed implementation guide:**

- Complete step-by-step integration
- Customization options
- Troubleshooting section
- Example scenarios
- Next features (optional)

#### 5. **TIMETABLE_SHIFTS_QUICKSTART.md** (300 lines)
**Fast 15-minute setup guide:**

- 4-step implementation
- 15 minutes total
- Copy-paste API endpoints
- Frontend test checklist
- Visual ASCII timetable examples

---

## 🚀 QUICK START

### For the Impatient (15 minutes)

1. **Database:** Copy-paste `timetable_shifts_schema.sql` → Supabase SQL Editor → Execute
2. **Backend:** Add 2 lines to `backend/backend.py`
3. **Frontend:** Add container + link JS file + 1 function call + CSS
4. **Test:** Run API tests + UI test

👉 **See: TIMETABLE_SHIFTS_QUICKSTART.md**

### For the Thorough (30 minutes)

Follow the detailed integration guide with all options and customizations.

👉 **See: TIMETABLE_SHIFTS_GUIDE.md**

---

## 📊 DATABASE SCHEMA

### Table: `timetable` (Enhanced)
```
id, academic_year, section_id, section_name, batch_name,
day_of_week, shift_number ← KEY FIELD, hour_start, minute_start,
hour_end, minute_end, subject_code, subject_name, subject_type,
room_number, faculty_id, faculty_name, created_at, updated_at
```

### Table: `break_timings` (New)
```
id, academic_year, break_name, break_type,
hour_start, minute_start, hour_end, minute_end, duration_minutes,
applicable_to (students|faculty|both),
applies_to_shift_1, applies_to_shift_2,
description, created_at, updated_at
```

### Table: `shift_config` (New)
```
id, academic_year, shift_number,
shift_name, classes_start_hour, classes_start_minute,
classes_end_hour, classes_end_minute,
description, created_at
```

---

## 📡 API ENDPOINTS

All endpoints automatically registered by `register_timetable_shift_endpoints(app, sb)`:

### 1. GET `/api/timetable/student/<roll_no>`
**Returns:** Student's personalized timetable with breaks

**Query Parameters:**
- `year` (optional): Academic year (default: "2025-26")

**Response:**
```json
{
  "success": true,
  "roll_no": "CSE001",
  "total_classes": 18,
  "batch": "Batch1",
  "timetable": {
    "Monday": {
      "shift_1": {
        "time_range": "09:00 - 13:00",
        "classes": [...],
        "breaks": [...]
      },
      "shift_2": { ... }
    },
    ...
  },
  "breaks_summary": { ... },
  "shift_info": { ... }
}
```

### 2. GET `/api/timetable/faculty/<faculty_id>`
**Returns:** All classes assigned to faculty + breaks

### 3. GET `/api/break-timings`
**Returns:** All break timings for institution

**Query Parameters:**
- `shift` (optional): 1 or 2 (filter by shift)
- `year` (optional): Academic year

**Response:**
```json
{
  "success": true,
  "breaks": [
    {
      "id": "...",
      "break_name": "Tea Break",
      "break_type": "break",
      "time_start": "10:00",
      "time_end": "10:10",
      "duration_minutes": 10,
      "applicable_to": "both",
      "shift_1": true,
      "shift_2": false
    },
    ...
  ],
  "count": 4
}
```

### 4. GET `/api/shift-config`
**Returns:** Shift configuration (start/end times)

**Query Parameters:**
- `year` (optional): Academic year

**Response:**
```json
{
  "success": true,
  "shifts": [
    {
      "shift_number": 1,
      "shift_name": "Morning Shift",
      "time_start": "09:00",
      "time_end": "13:00",
      "description": "Morning classes"
    },
    ...
  ],
  "count": 2
}
```

---

## 🎨 FRONTEND INTEGRATION

### Required HTML
```html
<div id="student-timetable-section">
  <div id="timetable-container"></div>
  <div id="breaks-info-container"></div>
  <div id="shift-info-container"></div>
</div>
```

### Required JavaScript
```javascript
// Load on dashboard init
if (AMS.profile?.roll_no) {
  loadStudentTimetableWithBreaks();
}
```

### Required CSS
Copy from `timetable_shifts.js` comment section:
- Timetable styling
- Class slot colors
- Break styling (tea vs lunch)
- Info cards
- Responsive layout

---

## 🎯 HOW IT PREVENTS CROWDING

### Problem
- 60 students in one lab = dangerous
- Equipment shortages
- Poor learning experience

### Solution: Shift-Based Batching

```
Lab Class (CS101L) - 60 students in section

Option 1: Same time, different rooms
├─ Batch1: 14:00-16:00 in Lab-1 (30 students)
└─ Batch2: 14:00-16:00 in Lab-2 (30 students)

Option 2: Different times, same room
├─ Batch1: 14:00-16:00 in Lab-1 (30 students)
└─ Batch2: 16:00-18:00 in Lab-1 (30 students)
```

**Result:** Safe class sizes, no overcrowding ✅

---

## ⚙️ CUSTOMIZATION

### Change Break Times
```sql
UPDATE break_timings 
SET hour_start = 10, minute_start = 45
WHERE break_name = 'Tea Break';
```

### Add New Break
```sql
INSERT INTO break_timings 
(academic_year, break_name, break_type, hour_start, minute_start, ...)
VALUES ('2025-26', 'Assembly', 'assembly', 8, 0, ...);
```

### Change Shift Hours
```sql
UPDATE shift_config 
SET classes_end_hour = 14
WHERE shift_number = 1;
```

---

## 📋 INTEGRATION CHECKLIST

- [ ] **Database** (3 min): Run SQL in Supabase
- [ ] **Backend** (4 min): Update `backend.py`
- [ ] **Frontend** (5 min): Update `index.html` and `app.js`
- [ ] **Styling** (2 min): Add CSS
- [ ] **Testing** (3 min): Run API tests
- [ ] **UI Test** (2 min): Check timetable display
- [ ] **Verification**: Confirm all features work

**Total Time: ~20 minutes**

---

## ✅ WHAT YOU GET

### For Students
✅ Beautiful day-by-day timetable  
✅ Shift information clearly shown  
✅ Breaks highlighted (tea + lunch)  
✅ Batch assignment for labs  
✅ Only their classes appear (others hidden)  

### For Faculty
✅ All teaching assignments visible  
✅ Batch information for lab classes  
✅ Break times for planning  
✅ Shift configuration reference  

### For Admin
✅ Full API access to timetable data  
✅ Easy break time customization  
✅ Shift configuration for institution  
✅ Batch auto-assignment for labs  

### For Developers
✅ Clean, documented code  
✅ 4 main endpoints + helpers  
✅ Ready-to-use frontend components  
✅ Production-ready error handling  

---

## 🛠️ TROUBLESHOOTING

### Timetable Not Showing
**Check:**
- HTML containers exist
- JS file is linked
- `loadStudentTimetableWithBreaks()` is called
- Browser console for errors

### Breaks Not Showing
**Check:**
- SQL executed successfully
- `break_timings` table has data:
  ```sql
  SELECT COUNT(*) FROM break_timings;  -- Should be 4+
  ```

### Wrong Data Appearing
**Check:**
- Student has correct `roll_no`
- Enrollments exist:
  ```sql
  SELECT * FROM enrollments WHERE roll_no = 'CSE001';
  ```
- Batch assignments correct

### API Endpoint Returns Error
**Check:**
- Backend running: `ps aux | grep backend.py`
- Correct URL in JavaScript
- API response for errors: `curl -i http://localhost:6001/api/shift-config`

---

## 📚 DOCUMENTATION

| Document | Purpose | Length |
|----------|---------|--------|
| **TIMETABLE_SHIFTS_QUICKSTART.md** | Fast 15-min setup | 300 lines |
| **TIMETABLE_SHIFTS_GUIDE.md** | Detailed integration | 600 lines |
| **timetable_shifts_schema.sql** | Database schema | 400 lines |
| **backend/timetable_shifts.py** | Backend code | 400 lines |
| **frontend/timetable_shifts.js** | Frontend code | 500 lines |

---

## 🚀 NEXT FEATURES (Optional Future)

1. **Timetable Conflict Detection**
   - Warn if faculty double-booked
   - Alert if student has 2 classes at same time

2. **Room Occupancy Tracking**
   - Prevent double-booking
   - Show available rooms

3. **Faculty Availability**
   - Let faculty set unavailable times
   - Auto-check when creating timetable

4. **Break Validation**
   - Ensure no classes during breaks
   - Auto-alert admin if conflict

5. **Student Timetable Preferences**
   - Let students prefer morning/afternoon
   - Respect preferences when auto-enrolling

---

## 📞 SUPPORT

**Question?** Check these in order:
1. TIMETABLE_SHIFTS_QUICKSTART.md (for fast setup)
2. TIMETABLE_SHIFTS_GUIDE.md (for detailed info)
3. Troubleshooting section above
4. Code comments in .py and .js files

---

## ✨ YOUR SYSTEM NOW HAS

✅ **Shift-Based Scheduling** - 2 shifts built-in  
✅ **Break Management** - Tea (10 min) + Lunch (45 min)  
✅ **Batch Automation** - Labs auto-divided  
✅ **Visual Timetable** - Beautiful UI  
✅ **API Endpoints** - 4 complete endpoints  
✅ **Production Ready** - Error handling, logging, docs  

**Status: 🚀 READY TO DEPLOY**

---

## 📅 EXAMPLE SCHEDULE

```
STUDENT'S MONDAY TIMETABLE (CSE001, Batch1)

08:30
  ║
09:00 ╔════════════════════════════╗
  ║    CS101: Programming         ║
  ║    Room A101 | Dr. Smith      ║
10:00 ╠════════════════════════════╣
  ║    ☕ TEA BREAK (10 min)       ║
  ║    10:00 - 10:10               ║
10:10 ╠════════════════════════════╣
  ║    CS102: Mathematics I        ║
  ║    Room A102 | Dr. Sharma     ║
11:10 ╠════════════════════════════╣
  ║    Break (20 min)              ║
11:30 ╠════════════════════════════╣
  ║    🍽️ LUNCH BREAK (45 min)    ║
  ║    11:30 - 12:15 UNIVERSAL    ║
12:15 ╠════════════════════════════╣
  ║    CS103: Digital Logic        ║
  ║    Room A103 | Dr. Kumar      ║
13:00 ╚════════════════════════════╝
  ║
14:00 ╔════════════════════════════╗
  ║    CS101L: Programming Lab     ║
  ║    Lab-1 | Mr. Patel          ║
  ║    Batch1 Assigned             ║
16:00 ╚════════════════════════════╝
```

---

*Last Updated: 14 March 2026*  
*Version: 1.0 - Production Ready*  
*Status: ✅ Complete & Documented*
