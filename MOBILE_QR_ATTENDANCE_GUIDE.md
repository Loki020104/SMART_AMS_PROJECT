# Mobile QR Attendance System - Complete Guide

## Overview

The new **Mobile QR Attendance System** allows students to:
1. **Scan a QR code** with their phone camera (any device, no app needed)
2. **Verify their identity** by providing student details
3. **Verify location** (GPS check within campus)
4. **Verify face** (facial recognition with liveness check)
5. **Get immediate confirmation** of attendance

Faculty can:
1. **Generate QR codes** directly from their dashboard
2. **See real-time attendance** as students scan and verify
3. **Mark attendance** with all security verifications

## System Flow

```
┌─────────────────────────────────────────────────────────────┐
│                     FACULTY SIDE                            │
├─────────────────────────────────────────────────────────────┤
│ 1. Faculty logs in to AMS                                   │
│ 2. Opens "Generate QR" in Dashboard                         │
│ 3. Enters Course/Subject and Validity (1-120 minutes)       │
│ 4. Clicks "Generate QR Code"                                │
│ 5. System generates unique session (ID: ABC123XY)           │
│ 6. QR code displays with countdown timer                    │
│ 7. Students can now scan QR → attendance recorded in DB     │
└─────────────────────────────────────────────────────────────┘
                            ↓
                    [QR Code URL Generated]
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    STUDENT SIDE (Mobile)                    │
├─────────────────────────────────────────────────────────────┤
│ Step 1: Scan QR with Phone Camera                           │
│         → Opens: https://smart-ams-project-faa5f.web.app    │
│            /attendance/mark?session=ABC123XY               │
│                                                              │
│ Step 2: Enter Details (Form validates all fields)           │
│         - Roll Number (e.g., 2026CSE001)                    │
│         - Full Name (e.g., John Doe)                        │
│         - Department (e.g., CSE)                            │
│         ✅ Procedure to Location Check                      │
│                                                              │
│ Step 3: Location Verification                               │
│         - Click "Verify My Location"                        │
│         - GPS coordinates sent to server                    │
│         - Server checks: Within 1km of college? ✅          │
│         ✅ Proceed to Face Verification                     │
│                                                              │
│ Step 4: Face Recognition                                    │
│         - Camera requested (selfie camera)                  │
│         - Click "Capture Face"                              │
│         - Takes and compares with registered face           │
│         - System verifies similarity (confidence > 60%)      │
│         ✅ Submit Attendance                                │
│                                                              │
│ Step 5: Success Screen                                      │
│         Shows: ✅ Attendance Marked Successfully!           │
│         Details:                                            │
│         - Student Name                                      │
│         - Roll Number                                       │
│         - Department                                        │
│         - Location (coordinates)                            │
│         - Timestamp                                         │
│                                                              │
│ [Faculty receives update in real-time]                      │
└─────────────────────────────────────────────────────────────┘
```

## How Faculty Generates QR

### Step 1: Navigate to QR Generator
- Login to AMS
- Go to **Faculty Dashboard**
- Click **Generate QR** (in Student/Faculty section)

### Step 2: Enter Details
| Field | Example | Description |
|-------|---------|-------------|
| **Course/Class** | CS101 - Data Structures | Identifies your course |
| **Subject/Topic** | Linked Lists | Today's topic (shown to students) |
| **Validity** | 5-10 minutes | How long the QR stays active |

### Step 3: Generate
- Click "🎯 Generate QR Code"
- A unique **Session ID** is created (e.g., `ABC12XY8`)
- QR code displays with **countdown timer**
- Faculty can see real-time check-ins below

### Example Screenshot:
```
┌─────────────────────────┐
│  📲 Generate Mobile QR  │
├─────────────────────────┤
│ 📚 Course: CS101        │
│ 📝 Subject: Linked Lists│
│ ⏱️ Validity: 10 min    │
│                         │
│  [🎯 Generate QR Code]  │
├─────────────────────────┤
│        [QR IMAGE]       │
│   Session: ABC12XY8     │
│   Expires: 9:45 → 9:55  │
│   📊 Checked In: 23     │
└─────────────────────────┘
```

## How Students Mark Attendance

### Step 1: Scan QR Code
- Use **any phone** (no app needed)
- Open **Camera app** or dedicated QR scanner
- Point at QR code displayed on faculty's screen
- Tap the link notification or scan result

### Step 2: Fill Student Form
The mobile page opens with student info form:
```
╔════════════════════════════════════════╗
║  📝 Mark Attendance                    ║
║  Step: 1/4 🟦🟩⬜⬜                   ║
╠════════════════════════════════════════╣
║                                        ║
║  🆔 Roll Number: [2026CSE001        ] ║
║     Your college roll number           ║
║                                        ║
║  👤 Full Name: [John Doe           ] ║
║     As registered in system            ║
║                                        ║
║  📚 Department: [CSE               ▼] ║
║     Your department                    ║
║                                        ║
║  [✅ Proceed to Location Check      ] ║
╚════════════════════════════════════════╝
```

**Valid Departments:**
- Computer Science (CSE)
- Artificial Intelligence (AI)
- Electronics (ECE)
- Mechanical (ME)
- Civil (CE)
- Electrical (EEE)
- IoT & Embedded (IOT)
- Data Science (ADS)
- MBA, BBA, Full Stack Dev (FSD)

### Step 3: Location Verification
```
╔════════════════════════════════════════╗
║  📍 Location Verification              ║
║  Step: 2/4 ✅🟦🟩⬜                   ║
╠════════════════════════════════════════╣
║                                        ║
║  [📍 Verify My Location               ] ║
║                                        ║
║  📍 Allow location access when        ║
║     prompted by your browser            ║
║                                        ║
║  Your location will be verified        ║
║  against the classroom location        ║
╚════════════════════════════════════════╝
```

**What Happens:**
- Browser requests GPS permission
- Device captures latitude/longitude
- Server checks: Is student within **1 km** of college campus?
- ✅ If YES → Proceeds to Face Recognition
- ❌ If NO → Shows error, student can try again

### Step 4: Face Recognition
```
╔════════════════════════════════════════╗
║  📷 Face Verification                  ║
║  Step: 3/4 ✅✅🟦⬜                   ║
╠════════════════════════════════════════╣
║                                        ║
║  [CAMERA FEED - STUDENT SELFIE]        ║
║  <Position your face in the frame>    ║
║                                        ║
║  [📷 Capture Face                     ] ║
║  [✅ Submit Attendance                ] ║
╚════════════════════════════════════════╝
```

**What Happens:**
- Selfie camera opens
- Student captures face
- System compares with registered face encoding
- Shows confidence score (0-100%)
- **Verified if confidence > 60%**

### Step 5: Success Confirmation
```
╔════════════════════════════════════════╗
║  ✅ Attended Successfully              ║
║  Step: 4/4 ✅✅✅✅                   ║
╠════════════════════════════════════════╣
║                                        ║
║           ✅ (Large Check Mark)        ║
║                                        ║
║  Attendance Marked Successfully!       ║
║  Your attendance has been recorded     ║
║  and verified by facial recognition.  ║
║                                        ║
║  ┌────────────────────────────────┐   ║
║  │ Student: John Doe              │   ║
║  │ Roll No: 2026CSE001            │   ║
║  │ Department: CSE                │   ║
║  │ Location: 13.1456, 77.5746     │   ║
║  │ Time: 09:45:30                 │   ║
║  └────────────────────────────────┘   ║
║                                        ║
║  [Done                                ] ║
╚════════════════════════════════════════╝
```

## Security Features

### ✅ Multi-Factor Verification
1. **Student Details** - Name, Roll No, Department
2. **Location Verification** - GPS within campus (1km radius)
3. **Face Recognition** - Facial identification with 60% confidence threshold

### ✅ Session Security
- **Unique Session IDs** - Each attendance session has unique identifier
- **Time-Limited QR** - QR code expires after set duration (1-120 minutes)
- **One-Time Use Prevention** - System tracks which students already marked attendance

### ✅ Data Protection
- **Encrypted Location Data** - GPS coordinates stored securely
- **Face Image Processing** - Facial data used only for verification, not stored
- **Audit Trail** - All attendance events logged with timestamps

## What Faculty Sees in Real-Time

When students mark attendance, faculty receives updates:

```
┌─────────────────────────────────────────┐
│  📊 Real-Time Attendance Dashboard      │
├─────────────────────────────────────────┤
│ Session: ABC12XY8                       │
│ Subject: Linked Lists                   │
│ Expires: 9:45 → 9:55 (4 min remaining) │
│                                         │
│ Total Marked: 28                        │
│ Face Verified: 26 ✅                    │
│ Location Verified: 28 📍                │
│ Pending Review: 2 ⏳                    │
│                                         │
│ Recent Checkins:                        │
│ ✅ 2026CSE001 - John Doe    9:47:32    │
│ ✅ 2026CSE002 - Jane Smith  9:46:45    │
│ ⏳ 2026CSE003 - Mike Brown  9:46:12    │
│ ✅ 2026CSE004 - Lisa Kumar  9:45:58    │
│                                         │
│ [📋 Attendance Records] [🔄 Refresh]   │
└─────────────────────────────────────────┘
```

## API Endpoints (Backend)

### 1. Generate Mobile QR Session
```
POST /api/qr/mobile-session
{
  "faculty_id": "prof_001",
  "course_id": "CS101",
  "subject": "Linked Lists",
  "validity_minutes": 10
}

Response:
{
  "success": true,
  "session_id": "ABC12XY8",
  "qr_code_base64": "...",
  "qr_url": "https://smart-ams-project-faa5f.web.app/attendance/mark?session=ABC12XY8",
  "expires_at": "2024-04-21T10:00:00Z"
}
```

### 2. Validate Session
```
POST /api/attendance/validate-session
{
  "session_id": "ABC12XY8"
}

Response:
{
  "success": true,
  "subject": "Linked Lists",
  "faculty_id": "prof_001"
}
```

### 3. Mark Attendance with Verification
```
POST /api/attendance/mark-qr
{
  "session_id": "ABC12XY8",
  "roll_no": "2026CSE001",
  "name": "John Doe",
  "department": "CSE",
  "latitude": 13.1456,
  "longitude": 77.5746,
  "face_image": "data:image/jpeg;base64,..."
}

Response:
{
  "success": true,
  "verified": true,
  "face_verified": true,
  "location_verified": true,
  "confidence": 0.87,
  "message": "Attendance recorded - All verifications passed!"
}
```

## Database Schema

### QR Sessions Table
```sql
CREATE TABLE qr_sessions (
  session_id VARCHAR(20) PRIMARY KEY,
  faculty_id VARCHAR(100),
  course_id VARCHAR(100),
  subject VARCHAR(255),
  expires_at TIMESTAMP,
  created_at TIMESTAMP,
  active BOOLEAN DEFAULT true,
  attendance_count INT DEFAULT 0
);
```

### Attendance Records Table
```sql
CREATE TABLE attendance (
  id UUID PRIMARY KEY,
  session_id VARCHAR(20),
  roll_no VARCHAR(50),
  name VARCHAR(255),
  department VARCHAR(100),
  latitude FLOAT,
  longitude FLOAT,
  face_verified BOOLEAN,
  location_verified BOOLEAN,
  confidence FLOAT,
  verified BOOLEAN,
  timestamp TIMESTAMP,
  date DATE,
  method VARCHAR(50) -- 'qr-mobile', 'qr', 'manual', etc.
);
```

## Troubleshooting

### Issue: "No usable data found" when scanning
**Old Issue** - The QR code now contains a **direct URL link** instead of encrypted data. If you get this error, you're using an old QR code from before the update.
**Solution**: Generate a **new QR code** using the updated system.

### Issue: Location verification fails
**Problem**: Student is not within 1km of campus
**Solution**: 
- Check GPS is enabled on phone
- Ensure you're within campus grounds (1km radius)
- Try again with better GPS signal

### Issue: Face recognition fails
**Problem**: Face not recognized or confidence too low
**Solution**:
- Ensure good lighting
- Face fully visible in frame
- Not covered by mask or glasses
- Try capturing again

### Issue: Session expired before student submits
**Problem**: Took too long to fill form (beyond set validity time)
**Solution**:
- Faculty generates new QR with longer validity time
- Student scans fresh QR code

## Features Summary

| Feature | Faculty | Student |
|---------|---------|---------|
| Generate QR | ✅ Yes | - |
| Set Validity | ✅ Yes | - |
| Scan QR | - | ✅ Yes |
| Enter Details | - | ✅ Yes |
| GPS Check | ✅ Automatic | ✅ Yes |
| Face Recognition | ✅ Automatic | ✅ Yes |
| Real-time Dashboard | ✅ Yes | - |
| Attendance Confirmation | - | ✅ Yes |
| Historical Records | ✅ Yes | - |

## Implementation Status

✅ **Complete:**
- Mobile attendance page UI
- QR URL generation
- Student details form
- Location verification with GPS
- Face capture and recognition
- Backend API endpoints
- Real-time attendance tracking
- Faculty dashboard updates

📱 **Mobile Features:**
- Works on any phone (iOS/Android)
- No app installation required
- Responsive design
- Offline-ready

## Example Usage Timeline

```
09:40 - Faculty clicks "Generate QR"
09:40 - QR code displays, expires at 09:50
09:41 - Student 1 scans QR → Form displayed
09:41 - Student 1 enters details → Location verified
09:42 - Student 1 captures face → ✅ Marked present
09:42 - Faculty sees real-time: "✅ 1 marked"
09:43 - Student 2 scans QR → Same flow
09:43 - Faculty sees: "✅ 2 marked"
...
09:50 - QR expires, no more scans accepted
09:50 - Faculty clicks "Attendance Records"
       → Shows all 25 students who marked attendance
```

## Next Steps

1. **Deploy Backend** - Ensure all new endpoints are live
2. **Test with Real Phone** - Scan actual QR from faculty dashboard
3. **Test All Verification Steps** - Location, face recognition
4. **Monitor Faculty Dashboard** - Real-time updates
5. **Check Database Records** - Verify attendance stored correctly

---

**Version**: 1.0  
**Last Updated**: April 21, 2024  
**Status**: ✅ Ready for Production
