# Backend Deployment Instructions

## Overview
The backend has been updated with enhanced attendance filtering and a new faculty-specific endpoint. These changes need to be deployed to Cloud Run to enable full functionality.

## Changes Made to Backend

### 1. Enhanced `/api/attendance` Endpoint
**File:** `backend/backend.py` (lines 1477-1492)

**Additions:**
- `section` filter parameter - Filter by student section
- `department` filter parameter - Filter by department  
- `faculty_id` filter parameter - Filter by faculty member

**Usage:**
```
GET /api/attendance?date=2026-03-17&section=A&department=CSE&batch=2024
GET /api/attendance?faculty_id=FAC123&date=TODAY
```

### 2. New `/api/attendance/faculty-subject` Endpoint
**File:** `backend/backend.py` (lines 1495-1520)

**Purpose:**
- Automatically fetches attendance records for only the courses taught by a specific faculty member
- Deduplicates records by (roll_no, date, timestamp)
- Returns records sorted by timestamp (newest first)

**Usage:**
```
GET /api/attendance/faculty-subject?faculty_id=FAC123
```

**Response:**
```json
{
  "success": true,
  "records": [
    {
      "roll_no": "ST001",
      "name": "John Doe",
      "subject_name": "Data Structures",
      "date": "2026-03-17",
      "timestamp": "2026-03-17T10:30:00",
      "face_verified": true,
      "location_verified": true,
      "status": "present"
    }
  ]
}
```

## Deployment Steps

### Option 1: Using Docker (Recommended)

#### Prerequisites:
- Docker Desktop installed on your Mac
- gcloud CLI (already installed ✓)
- Active Firebase/GCP authentication

#### Steps:
```bash
cd /Users/loki/Desktop/SMART_AMS_PROJECT

# Run the deployment script
bash deploy_docker.sh

# When prompted:
# 1. Login with your GCP account (if needed)
# 2. Confirm project: smart-ams-project-faa5f
# 3. Wait for build (~5-10 minutes)
# 4. Confirm Cloud Run service update
```

**Installation:**
- Get Docker Desktop from: https://docs.docker.com/desktop/install/mac-install/
- Install Homebrew version: `brew install docker` (requires Docker Desktop running separately)

### Option 2: Using Cloud Build (No Local Docker Required)

If you don't want to install Docker Desktop locally:

```bash
cd /Users/loki/Desktop/SMART_AMS_PROJECT

# Deploy directly via Cloud Build
gcloud run deploy smartams-backend \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars SUPABASE_URL=$SUPABASE_URL,SUPABASE_KEY=$SUPABASE_KEY \
  --memory 512Mi
```

**Note:** You'll need to set the environment variables:
```bash
export SUPABASE_URL="your-supabase-url"
export SUPABASE_KEY="your-supabase-key"
```

### Option 3: Manual Updates (Quick Fix)

If you only need to test the new endpoints without Docker:

1. The new endpoints in `backend.py` follow the same pattern as existing endpoints
2. Existing Supabase integrations will work immediately
3. Deploy when Docker becomes available

## Verification

### Test the New Faculty Endpoint

After deployment, test with:

```bash
curl -X GET "https://smartams-backend-76160313029.us-central1.run.app/api/attendance/faculty-subject?faculty_id=FAC001" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Test Enhanced Filters

```bash
# Test section filter
curl -X GET "https://smartams-backend-76160313029.us-central1.run.app/api/attendance?section=A&date=2026-03-17" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Test department filter
curl -X GET "https://smartams-backend-76160313029.us-central1.run.app/api/attendance?department=CSE" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Frontend Integration

The frontend has been updated to use these new endpoints:

### For Faculty:
```javascript
const data = await AttendanceManager.loadFacultySubjectAttendance();
console.log(data.today);  // Today's attendance
console.log(data.all);    // All records
```

### For Admin:
```javascript
const records = await AttendanceManager.loadAdminAttendanceFiltered({
  date: '2026-03-17',
  section: 'A',
  department: 'CSE',
  batch: '2024'
});
```

## Rollback Plan

If issues occur:

```bash
# View deployment history
gcloud run revisions list --service=smartams-backend --region=us-central1

# Deploy previous version
gcloud run deploy smartams-backend \
  --image gcr.io/smart-ams-project-faa5f/smartams-backend:previous
```

## Status

- ✅ Frontend: Updated and deployed to Firebase Hosting
- ✅ Backend code: Updated with new endpoints in `backend.py`
- ⏳ Backend deployment: **NEEDS DOCKER** to push to Cloud Run

---

**Next Steps:**
1. Install Docker Desktop (if not already installed)
2. Run `bash deploy_docker.sh`
3. Test the new endpoints in production
4. Verify faculty and admin attendance views work with new filters
