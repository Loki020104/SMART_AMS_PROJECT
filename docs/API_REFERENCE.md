# 📡 API Reference Guide

Complete SmartAMS REST API documentation with all endpoints, parameters, and response formats.

**Base URL:** 
- Development: `http://localhost:6001`
- Production: `https://smartams-backend-76160313029.us-central1.run.app`

---

## 📋 Table of Contents

- [Health Check](#health-check)
- [Authentication](#authentication)
- [Users](#users)
- [Attendance](#attendance)
- [QR Attendance](#qr-attendance)
- [Enrollment](#enrollment)
- [Timetable](#timetable)
- [System Configuration](#system-configuration)
- [Face Recognition](#face-recognition)

---

## Health Check

### GET `/health`

Check backend server status.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2026-03-17T10:30:00Z",
  "version": "1.0.0"
}
```

**Status Code:** `200 OK`

---

## Authentication

### POST `/api/users/login`

Login with username and password.

**Request:**
```json
{
  "username": "admin",
  "password": "Admin@123",
  "role": "admin"
}
```

**Response (Success):**
```json
{
  "token": "firebase-auth-token-string",
  "user": {
    "id": "user-uuid",
    "username": "admin",
    "full_name": "Administrator",
    "role": "admin",
    "email": "admin@example.com"
  },
  "success": true
}
```

**Response (Failure):**
```json
{
  "success": false,
  "error": "Invalid credentials"
}
```

**Status Codes:**
- `200 OK` — Login successful
- `401 Unauthorized` — Invalid credentials
- `400 Bad Request` — Missing parameters

---

### POST `/api/users/firebase-login`

Login using Firebase/Google OAuth token.

**Headers:**
```
Authorization: Bearer firebase-id-token
Content-Type: application/json
```

**Request:**
```json
{
  "role": "student"
}
```

**Response:**
```json
{
  "token": "session-token",
  "user": { ... },
  "success": true,
  "message": "User synced to Supabase database"
}
```

---

### POST `/api/users/register`

Create new user account.

**Request:**
```json
{
  "username": "newuser",
  "password": "Password@123",
  "email": "user@example.com",
  "full_name": "New User",
  "role": "student",
  "department": "CSE",
  "semester": 1
}
```

**Response:**
```json
{
  "success": true,
  "user_id": "uuid",
  "message": "User registered successfully"
}
```

**Validation Rules:**
- Password: min 8 chars, 1 uppercase, 1 digit, 1 special char
- Email: valid format
- Username: 4-20 chars, alphanumeric + underscore
- Role: must be `student`, `faculty`, or `admin`

---

### GET `/api/users/profile`

Get current user profile (requires authentication).

**Headers:**
```
Authorization: Bearer token
```

**Response:**
```json
{
  "success": true,
  "user": {
    "id": "user-uuid",
    "username": "student001",
    "full_name": "John Doe",
    "email": "john@example.com",
    "role": "student",
    "roll_no": "20261cse0001",
    "department": "CSE",
    "semester": 1,
    "is_active": true,
    "created_at": "2026-01-15T10:00:00Z"
  }
}
```

---

### POST `/api/users/logout`

End user session.

**Headers:**
```
Authorization: Bearer token
```

**Response:**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

## Users

### POST `/api/users/add`

Create user (admin only).

**Headers:**
```
Authorization: Bearer admin-token
Content-Type: application/json
```

**Request:**
```json
{
  "username": "20261cse0001",
  "password": "TempPass@123",
  "full_name": "Student Name",
  "email": "student@example.com",
  "role": "student",
  "department": "CSE",
  "semester": 1,
  "section": "A"
}
```

**Response:**
```json
{
  "success": true,
  "user_id": "uuid",
  "roll_no": "20261cse0001",
  "message": "User created and auto-enrolled"
}
```

---

### GET `/api/users/list`

List all users (admin only).

**Parameters:**
```
?role=student        (optional: filter by role)
&department=CSE      (optional: filter by department)
&is_active=true      (optional: filter by status)
```

**Response:**
```json
{
  "success": true,
  "users": [
    {
      "id": "uuid",
      "username": "student001",
      "full_name": "John Doe",
      "role": "student",
      "department": "CSE",
      "is_active": true,
      "created_at": "2026-01-15T10:00:00Z"
    }
  ],
  "total": 156
}
```

---

## Attendance

### GET `/api/attendance`

Get attendance records with filtering.

**Parameters:**
```
?date=2026-03-17              (filter by date)
&roll_no=20261cse0001         (filter by student)
&batch=2024                   (filter by batch)
&section=A                    (filter by section)
&department=CSE               (filter by department)
&subject=Data%20Structures    (filter by subject)
&faculty_id=fac-uuid          (filter by faculty teaching)
```

**Response:**
```json
{
  "success": true,
  "records": [
    {
      "id": "uuid",
      "roll_no": "20261cse0001",
      "name": "John Doe",
      "subject_name": "Data Structures",
      "date": "2026-03-17",
      "timestamp": "2026-03-17T10:30:00Z",
      "status": "present",
      "method": "qr",
      "face_verified": true,
      "face_confidence": 0.92,
      "location_verified": true,
      "latitude": 28.5355,
      "longitude": 77.3910
    }
  ],
  "total": 45
}
```

---

### GET `/api/attendance/faculty-subject`

Get attendance for only faculty's subject students.

**Parameters:**
```
?faculty_id=fac-uuid    (required)
```

**Response:**
```json
{
  "success": true,
  "records": [
    {
      "roll_no": "20261cse0001",
      "name": "John Doe",
      "subject_name": "Data Structures",
      "date": "2026-03-17",
      "timestamp": "2026-03-17T10:30:00Z",
      "status": "present",
      "method": "qr",
      "face_verified": true,
      "location_verified": true
    }
  ],
  "total": 52
}
```

---

### GET `/api/attendance/summary`

Get attendance statistics.

**Parameters:**
```
?date=2026-03-17
&section=A
&department=CSE
```

**Response:**
```json
{
  "success": true,
  "summary": {
    "total_records": 150,
    "present": 135,
    "absent": 15,
    "late": 0,
    "face_verified": 120,
    "location_verified": 110,
    "average_attendance_percent": 90.0
  }
}
```

---

## QR Attendance

### POST `/api/qr/mark-attendance`

Mark attendance after QR scan (student).

**Headers:**
```
Authorization: Bearer student-token
Content-Type: application/json
```

**Request:**
```json
{
  "qr_data": "encrypted-qr-payload",
  "student_id": "user-uuid",
  "roll_no": "20261cse0001",
  "student_name": "John Doe",
  "face_image_base64": "data:image/jpeg;base64,/9j/4AAQSkZJRg...",
  "latitude": 28.5355,
  "longitude": 77.3910,
  "device_fingerprint": "device-id-string",
  "timestamp": "2026-03-17T10:30:00Z"
}
```

**Response:**
```json
{
  "success": true,
  "attendance_id": "uuid",
  "message": "Attendance marked successfully",
  "details": {
    "verified": true,
    "face_verified": true,
    "face_confidence": 0.92,
    "location_verified": true,
    "subject": "Data Structures",
    "timestamp": "2026-03-17T10:30:00Z"
  }
}
```

**Status Codes:**
- `200 OK` — Marked successfully
- `400 Bad Request` — Invalid QR data or expired
- `403 Forbidden` — QR not for this student
- `409 Conflict` — Already marked attendance

---

### POST `/api/qr/generate`

Generate QR code session (faculty).

**Headers:**
```
Authorization: Bearer faculty-token
Content-Type: application/json
```

**Request:**
```json
{
  "subject_code": "CS101",
  "subject_name": "Data Structures",
  "section": "CSE-A",
  "expires_in_minutes": 30
}
```

**Response:**
```json
{
  "success": true,
  "session_id": "uuid",
  "qr_code": "data:image/png;base64,iVBORw0KGgoAAAA...",
  "qr_code_text": "SMARTAMS|CS101|uuid|2026-03-17T11:00:00Z",
  "expires_at": "2026-03-17T11:00:00Z",
  "hmac_signature": "signed-data"
}
```

---

### POST `/api/qr/validate`

Validate QR token (not usually called directly).

**Request:**
```json
{
  "qr_data": "encrypted-payload",
  "device_fingerprint": "device-id"
}
```

**Response:**
```json
{
  "success": true,
  "valid": true,
  "subject": "Data Structures",
  "section": "CSE-A",
  "expires_at": "2026-03-17T11:00:00Z",
  "requires_face_verification": true
}
```

---

## Enrollment

### GET `/api/curriculum`

Get curriculum for department and semester.

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
      "credits": 4,
      "prerequisites": ["CS100"]
    },
    {
      "subject_code": "CS110",
      "subject_name": "CSE Lab",
      "subject_type": "lab",
      "credits": 2,
      "prerequisites": []
    }
  ],
  "total": 8
}
```

---

### GET `/api/enrollments/student/:roll_no`

Get student's current enrollments.

**Response:**
```json
{
  "success": true,
  "enrollments": [
    {
      "id": "enrollment-uuid",
      "subject_code": "CS101",
      "subject_name": "Data Structures",
      "section_name": "CSE-A",
      "batch_name": "Batch1",
      "enrollment_type": "core",
      "status": "active",
      "enrolled_date": "2026-01-15T10:00:00Z"
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

---

### GET `/api/enrollments/subject/:code`

Get all students in a subject.

**Parameters:**
```
?section=A
&batch=Batch1
```

**Response:**
```json
{
  "success": true,
  "subject_code": "CS101",
  "subject_name": "Data Structures",
  "section_name": "CSE-A",
  "students": [
    {
      "roll_no": "20261cse0001",
      "full_name": "John Doe",
      "batch_name": "Batch1",
      "enrollment_status": "active"
    }
  ],
  "total": 25
}
```

---

### POST `/api/enrollments/enroll`

Manually enroll student in subject.

**Headers:**
```
Authorization: Bearer admin-or-faculty-token
```

**Request:**
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

---

### POST `/api/enrollments/drop`

Drop enrollment.

**Request:**
```json
{
  "enrollment_id": "uuid"
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

## Timetable

### GET `/api/timetable/student/:roll_no`

Get student's timetable.

**Parameters:**
```
?day=Monday        (optional: filter by day)
&shift=1           (optional: filter by shift)
```

**Response:**
```json
{
  "success": true,
  "timetable": [
    {
      "id": "uuid",
      "day": "Monday",
      "shift_number": 1,
      "time_slot": "09:00-10:00",
      "subject_code": "CS101",
      "subject_name": "Data Structures",
      "room_number": "LAB-01",
      "faculty_name": "Dr. Jane Smith",
      "batch_name": "Batch1"
    }
  ],
  "shifts": [
    {
      "shift_number": 1,
      "start_time": "09:00",
      "end_time": "13:00",
      "breaks": [
        {
          "break_name": "Tea Break",
          "start_time": "10:30",
          "end_time": "10:40"
        }
      ]
    }
  ]
}
```

---

### GET `/api/timetable/faculty/:faculty_id`

Get faculty's timetable (all their classes).

**Response:**
```json
{
  "success": true,
  "timetable": [
    {
      "day": "Monday",
      "shift_number": 1,
      "time_slot": "09:00-10:00",
      "subject_code": "CS101",
      "section": "CSE-A",
      "batch_name": "Batch1",
      "room_number": "LAB-01",
      "student_count": 30
    }
  ]
}
```

---

### GET `/api/timetable/config`

Get shift configuration and break timings.

**Response:**
```json
{
  "success": true,
  "shifts": [
    {
      "shift_number": 1,
      "shift_name": "Morning Shift",
      "classes_start_hour": 9,
      "classes_start_minute": 0,
      "classes_end_hour": 13,
      "classes_end_minute": 0
    },
    {
      "shift_number": 2,
      "shift_name": "Afternoon Shift",
      "classes_start_hour": 14,
      "classes_start_minute": 0,
      "classes_end_hour": 18,
      "classes_end_minute": 0
    }
  ],
  "breaks": [
    {
      "break_name": "Tea Break",
      "break_type": "tea",
      "hour_start": 10,
      "minute_start": 30,
      "hour_end": 10,
      "minute_end": 40,
      "duration_minutes": 10,
      "applies_to_shift_1": true,
      "applies_to_shift_2": true
    }
  ]
}
```

---

### POST `/api/timetable/generate`

Trigger automatic timetable generation.

**Headers:**
```
Authorization: Bearer admin-token
```

**Request:**
```json
{
  "academic_year": "2025-26",
  "algorithm": "genetic",
  "population_size": 100,
  "generations": 50,
  "constraints": {
    "min_gap_between_classes": 0,
    "max_consecutive_classes": 2,
    "preferred_room_for_faculty": {}
  }
}
```

**Response:**
```json
{
  "success": true,
  "generation_id": "uuid",
  "status": "in_progress",
  "estimated_time_seconds": 180,
  "message": "Timetable generation started"
}
```

---

## System Configuration

### GET `/api/system-config`

Get system configuration settings.

**Response:**
```json
{
  "success": true,
  "config": {
    "institution_name": "PUC",
    "face_recognition_enabled": true,
    "qr_attendance_enabled": true,
    "face_verification_required": true,
    "geolocation_required": false,
    "face_confidence_threshold": 0.6,
    "session_timeout_minutes": 60
  }
}
```

---

### POST `/api/system-config`

Update system configuration (admin only).

**Headers:**
```
Authorization: Bearer admin-token
```

**Request:**
```json
{
  "face_recognition_enabled": true,
  "qr_attendance_enabled": true,
  "face_confidence_threshold": 0.65,
  "session_timeout_minutes": 120
}
```

**Response:**
```json
{
  "success": true,
  "message": "Configuration updated",
  "updated_fields": ["face_confidence_threshold", "session_timeout_minutes"]
}
```

---

### GET `/api/config/face-recognition`

Get face recognition global toggle.

**Response:**
```json
{
  "success": true,
  "face_recognition_enabled": true,
  "face_verification_required": true,
  "face_confidence_threshold": 0.6,
  "liveness_detection_enabled": true
}
```

---

### POST `/api/config/face-recognition`

Toggle face recognition (admin only).

**Request:**
```json
{
  "enabled": true,
  "face_verification_required": true,
  "face_confidence_threshold": 0.65,
  "liveness_detection_enabled": true
}
```

**Response:**
```json
{
  "success": true,
  "message": "Face recognition configuration updated"
}
```

---

## Face Recognition

### POST `/api/register-face`

Register student face (requires face image).

**Headers:**
```
Authorization: Bearer token
Content-Type: multipart/form-data
```

**Form Data:**
```
face_image: <image file>
roll_no: 20261cse0001
quality_score: 0.85 (optional)
```

**Response:**
```json
{
  "success": true,
  "face_id": "uuid",
  "quality_score": 0.87,
  "encoding_stored": true,
  "message": "Face registered successfully"
}
```

---

### POST `/api/verify-face`

Verify student face against registered encoding.

**Headers:**
```
Authorization: Bearer token
Content-Type: application/json
```

**Request:**
```json
{
  "roll_no": "20261cse0001",
  "face_image_base64": "data:image/jpeg;base64,/9j/4AAQSkZJRg...",
  "require_liveness": true
}
```

**Response:**
```json
{
  "success": true,
  "verified": true,
  "confidence": 0.92,
  "liveness_detected": true,
  "message": "Face verification successful"
}
```

---

### GET `/api/registered-students`

Get list of students with registered faces.

**Response:**
```json
{
  "success": true,
  "students": [
    {
      "roll_no": "20261cse0001",
      "full_name": "John Doe",
      "face_quality_score": 0.87,
      "registered_date": "2026-01-15T10:00:00Z"
    }
  ],
  "total": 156
}
```

---

## Error Codes

| Code | Meaning |
|------|---------|
| `200` | Success |
| `201` | Created |
| `400` | Bad Request — Invalid parameters |
| `401` | Unauthorized — Login required |
| `403` | Forbidden — Permission denied |
| `404` | Not Found — Resource doesn't exist |
| `409` | Conflict — Already exists or duplicate |
| `422` | Unprocessable — Validation failed |
| `500` | Server Error |
| `503` | Service Unavailable |

**Error Response Format:**
```json
{
  "success": false,
  "error": "Description of error",
  "code": "ERROR_CODE",
  "details": {}
}
```

---

## Authentication Header

All protected endpoints require:

```
Authorization: Bearer <JWT_TOKEN>
```

Obtain token from `/api/users/login` or `/api/users/firebase-login`.

---

## Rate Limiting

- 100 requests per minute per IP
- 1000 requests per hour per token

Exceeding limits returns `429 Too Many Requests`.

---

## Pagination

List endpoints support pagination:

```
?page=1&limit=50
```

**Response:**
```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "current_page": 1,
    "total_pages": 10,
    "total_records": 500,
    "page_size": 50
  }
}
```

---

**Last Updated:** March 17, 2026  
**API Version:** 1.0.0  
**Status:** Production Ready ✅
