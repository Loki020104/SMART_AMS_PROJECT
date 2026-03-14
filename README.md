# SmartAMS — Academic Management System

> A full-stack Academic Management System with role-based authentication, face recognition attendance, QR attendance, Firebase Google login, and Supabase as the primary database.

---

## Table of Contents

- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Quick Start](#quick-start)
- [Deployment Guide](#deployment-guide)
- [Authentication](#authentication)
- [Environment Variables](#environment-variables)
- [Database Schema](#database-schema)
- [API Endpoints](#api-endpoints)
- [Features](#features)
- [Firebase Setup](#firebase-setup)
- [Supabase Setup](#supabase-setup)
- [Session Persistence](#session-persistence--critical-fix)
- [Troubleshooting](#troubleshooting)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | HTML5, Vanilla JS (SPA), Express.js static server |
| Backend API | Python Flask (port 6001) |
| Database | Supabase (PostgreSQL) |
| Auth | Firebase Auth (Email/Password + Google OAuth) |
| Face Recognition | dlib + OpenCV |
| QR Attendance | jsQR + HMAC signing |
| Hosting | Firebase Hosting (frontend) + Google Cloud Run (backend) |

---

## Project Structure

```
SMART_AMS_PROJECT/
├── frontend/                           ← Firebase hosting source
│   ├── index.html                      (Single-page app)
│   ├── app.js                          (Full SPA logic, session persistence fix)
│   ├── api-config.js                   (Firebase & API configuration)
│   ├── qr_client.js                    (QR attendance client logic)
│   ├── timetable_generator.js
│   └── timetable_shifts.js
├── backend/                            ← Python Flask API
│   ├── backend.py                      (Flask REST API)
│   ├── enrollment_system.py            (Bulk enrollment system)
│   ├── database.py                     (Supabase connection)
│   ├── auth_service.py                 (Firebase Admin token verification)
│   ├── face_recognition_with_liveness.py
│   ├── face_registration_handler.py
│   ├── face_auth_routes.py             (Face auth Flask routes)
│   ├── qr_security.py                  (QR HMAC signing + encryption)
│   ├── requirements.txt                (Python dependencies)
│   └── __pycache__/
├── firebase/                           ← Firebase rules
│   ├── firestore.rules
│   ├── database.rules.json
│   ├── storage.rules
│   └── firestore.indexes.json
├── database/
│   └── schema.sql                      ← Consolidated database schema
├── docs/                               ← Technical documentation
├── build/dlib/                         ← Pre-compiled dlib wheel
├── .env                                ← Environment variables (git ignored)
├── .gitignore                          (Updated for security)
├── firebase.json                       ← Firebase deployment config
├── .firebaserc                         ← Firebase project reference
├── server.js                           ← Local development server
├── package.json                        ← Node.js dependencies
└── serviceAccountKey.json              ← Firebase admin key
```

---

## Quick Start

### Prerequisites
- Python 3.10+, Node.js 18+
- Supabase project (see [Supabase Setup](#supabase-setup))
- Firebase project (see [Firebase Setup](#firebase-setup))

### 1. Python dependencies
```bash
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# If dlib fails via pip, use the pre-compiled build:
cd build/dlib && pip install -e . && cd ../..
```

### 2. Node.js dependencies
```bash
npm install
```

### 3. Create `.env` file
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-supabase-anon-key

FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_API_KEY=your-firebase-api-key

SECRET_KEY=change-this-in-production
QR_ENCRYPTION_KEY=your-fernet-key
QR_HMAC_SECRET=your-hmac-secret

FACE_THRESHOLD=0.6
LIVENESS_DETECTION=True
FLASK_DEBUG=True

# University abbreviation used in faculty Employee ID generation (format: PUC-CSE-2026-001)
# Change this to your institution's short name (e.g. MIT, VIT, SRM)
UNI_ABBR=PUC
```

> **To change the university name in Employee IDs:**
> - **Backend** — [backend/backend.py](backend/backend.py): `uni_abbr = os.environ.get('UNI_ABBR', 'PUC')`  
>   Change `'PUC'` to your abbreviation, **or** set `UNI_ABBR=YourAbbr` in your `.env` file.
> - **Frontend** — [frontend/app.js](frontend/app.js): `const uniAbbr = window._UNI_ABBR || 'PUC';`  
>   Change `'PUC'` to your abbreviation here.

---

## 🔢 Username & Roll Number Format

### Student Roll Number

Auto-generated when a student is created. Format:

```
{YEAR}{SEMESTER}{DEPT}{SEQUENCE}
```

| Part | Example | Description |
|------|---------|-------------|
| `YEAR` | `2026` | 4-digit admission year |
| `SEMESTER` | `1` | Semester number (1–8) |
| `DEPT` | `cse` | Department code, lowercase, alphanumeric only |
| `SEQUENCE` | `0001` | 4-digit auto-increment per dept+year+sem |

**Example:** `20261cse0001` → Year 2026, Sem 1, CSE, first student

> The student's **username = roll number** (e.g. login with `20261cse0001`).

**To change the format**, edit `generate_roll_number()` in [backend/backend.py](backend/backend.py):
```python
roll_prefix = f"{year}{semester}{dept_clean}"   # ← change this line
return f"{roll_prefix}{count+1:04d}"            # ← change padding/suffix here
```

**For face photo filenames** (mass upload), name the file as the roll number:
```
20261cse0001.jpg   → linked to that student's account
20261cse0002.png   → linked to that student's account
photo1.jpg         → roll number auto-generated from the selected dept/year/sem
```

---

### Faculty Employee ID

Auto-generated when a faculty member is created. Format:

```
{UNI_ABBR}-{DEPT}-{YEAR}-{SEQUENCE}
```

| Part | Example | Description |
|------|---------|-------------|
| `UNI_ABBR` | `PUC` | University abbreviation (set via `UNI_ABBR` env var) |
| `DEPT` | `CSE` | Department code, uppercase |
| `YEAR` | `2026` | Current calendar year |
| `SEQUENCE` | `001` | 3-digit auto-increment per dept |

**Example:** `PUC-CSE-2026-001`

> Faculty **username = employee_id** (e.g. login with `PUC-CSE-2026-001`).

**To change the format**, edit `_generate_faculty_emp_id()` in [backend/backend.py](backend/backend.py):
```python
uni_abbr = os.environ.get('UNI_ABBR', 'PUC')   # ← change default here or via .env
prefix = f"{uni_abbr}-{dept}-{year}-"           # ← change separator/order here
return f"{prefix}{seq:03d}"                     # ← change padding here
```

---

### 4. Start servers

**Terminal 1 — Backend:**
```bash
source .venv/bin/activate
python backend/backend.py
# Flask starts on http://localhost:6001
```

**Terminal 2 — Frontend:**
```bash
npm start
# Node.js starts on http://localhost:3000
```

### 5. Open
```
http://localhost:3000
```

---

## Deployment Guide

### 🚀 Quick Deploy (5 minutes)

#### Prerequisites Checklist
- [ ] Node.js installed (`node -v` → v14+)
- [ ] Firebase CLI installed (`firebase --version` → v12+)
- [ ] Git configured (`git config user.name`)
- [ ] `.env` file created with API keys
- [ ] Python backend ready on Cloud Run
- [ ] Supabase database configured

#### Step 1: Local Testing
```bash
cd /Users/loki/Desktop/SMART_AMS_PROJECT
npm install
```

#### Step 2: Create `.env` File
```bash
cat > .env << 'EOF'
FLASK_PORT=6001
API_URL=http://localhost:6001
DEBUG=true
EOF
```

#### Step 3: Start Local Server
```bash
npm start
# or
node server.js
```

Expected output:
```
Server running on http://localhost:3000
✓ /vendor (node_modules served)
✓ /api (proxying to Flask on :6001)
```

#### Step 4: Test in Browser
Navigate to: `http://localhost:3000`

**Test Checklist:**
- [ ] Login page loads
- [ ] Student login works
- [ ] Faculty login works  
- [ ] Admin login works
- [ ] **CRITICAL**: Refresh page after login → Should STAY LOGGED IN ✅
- [ ] QR attendance works
- [ ] Bulk enrollment form visible (admin)
- [ ] Faculty subject students view works

#### Step 5: Deploy to Firebase Hosting
```bash
# Login to Firebase
firebase login

# Set default project
firebase use smart-ams-project-faa5f

# Deploy everything
firebase deploy
```

Expected output:
```
✔ Deploy complete!

Project Console: https://console.firebase.google.com/project/smart-ams-project-faa5f
Hosting URL: https://smart-ams-project-faa5f.web.app
```

---

### 📊 Verify Deployment

#### A. Visit Your Live App
```
https://smart-ams-project-faa5f.web.app
```

#### B. Test Login Persistence (CRITICAL)
1. Login with student/faculty/admin account
2. Press `F5` (refresh page)
3. **Expected**: Stay logged in ✅

#### C. Check Firestore Session Storage
```
Firebase Console > Firestore:
Collections > sessions
```
You should see documents like: `student_roll_001`, `faculty_emp_123`

#### D. Test API Connection
Open Browser DevTools (F12) → Console:
```javascript
fetch(window.AMS_CONFIG.API_URL + '/api/health')
  .then(r => r.json())
  .then(d => console.log('Backend:', d))
  .catch(e => console.error('Backend unavailable:', e))
```

---

### 🔗 Connect Python Backend

#### A. Deploy Backend to Cloud Run
```bash
gcloud run deploy smartams-backend \
  --source ./backend \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated
```

**Note the URL**, e.g.: `https://smartams-backend-abc123def.us-central1.run.app`

#### B. Update Frontend API Config
Edit: `frontend/api-config.js`
```javascript
window.AMS_CONFIG = {
  API_URL: 'https://smartams-backend-abc123def.us-central1.run.app',  // ← Your Cloud Run URL
  // ... rest of config
};
```

#### C. Re-deploy Frontend
```bash
firebase deploy --only hosting
```

#### D. Test Backend Connection
```javascript
// In browser console at your Firebase hosting URL
fetch(API_URL + '/api/health')
  .then(r => r.json())
  .then(d => console.log('✅ Backend online:', d))
```

---

### 🔧 Complete Firebase Deployment Guide

#### Pre-Deployment Checklist
1. **Local Testing** ✅
   ```bash
   npm install
   node server.js
   # Open http://localhost:3000
   # Test login persistence: login → refresh → should stay logged in
   ```

2. **Environment Configuration**
   Create `.env` file in root (DO NOT COMMIT):
   ```
   FLASK_PORT=6001
   SUPABASE_URL=https://qovojskhkmppktwaozpa.supabase.co
   SUPABASE_KEY=<your_supabase_key>
   FIREBASE_PROJECT=smart-ams-project-faa5f
   ```

3. **Firebase Configuration Check**
   ```bash
   firebase --version
   firebase login
   firebase use smart-ams-project-faa5f
   firebase projects:list
   ```

4. **Update API Configuration**
   Edit `frontend/api-config.js` if needed:
   ```javascript
   API_URL: window.location.hostname === 'localhost' 
     ? 'http://localhost:6001'
     : 'https://smartams-backend-[PROJECT_ID].us-central1.run.app'
   ```

#### Deployment Steps

##### Step 1: Deploy Frontend to Firebase Hosting
```bash
firebase deploy --only hosting
```

Output:
```
✔ Deploy complete!
Hosting URL: https://smart-ams-project-faa5f.web.app
```

##### Step 2: Deploy Firestore Rules
```bash
firebase deploy --only firestore:rules
```

##### Step 3: Deploy Realtime Database Rules
```bash
firebase deploy --only database
```

##### Step 4: Deploy Storage Rules
```bash
firebase deploy --only storage
```

##### Step 5: Deploy Cloud Functions (if using)
```bash
firebase deploy --only functions
```

##### Deploy Everything at Once
```bash
firebase deploy
```

---

### 📱 Share Your App

Your live application is available at:

```
🌐 https://smart-ams-project-faa5f.web.app

📊 Dashboard: https://smart-ams-project-faa5f.web.app (after login)
👥 Admin: https://smart-ams-project-faa5f.web.app#a-bulk-enroll
```

---

## Session Persistence — CRITICAL FIX

### Problem
When you refresh the page, it goes back to the login screen ❌

### Root Cause
Session was stored only in Firestore, which could timeout or fail

### Solution
Added **localStorage as primary storage** with Firestore as backup:
1. User logs in → Session saved to localStorage (INSTANT)
2. Session also synced to Firestore (background)
3. On page refresh:
   - localStorage checked FIRST (instant restore) ⚡
   - If missing, tries Firestore (backup)
   - If both fail, shows login

### Implementation
**File Modified**: `frontend/app.js` → `AmsDB` class (lines ~27-179)
- `get()` method: Now checks localStorage FIRST before Firestore
- `set()` method: Saves to localStorage immediately, async syncs to Firestore
- `remove()` method: Clears from both localStorage and Firestore

### Test It
```
1. Login to the app
2. Press F5 (refresh page)
3. You should STAY LOGGED IN! ✅
```

---

## Authentication

SmartAMS uses a two-layer auth system:

```
Browser
  ├── Username/Password  →  POST /api/users/login  (validates against Supabase)
  └── Google Sign-In     →  Firebase Auth popup
                               →  POST /api/users/firebase-login
                                     →  user synced into Supabase automatically
```

### Role-Based Access

| Role | Tab | Modules |
|------|-----|---------|
| `student` | 👨‍🎓 Student | Attendance, Fees, Exams, Timetable, etc. |
| `faculty` | 👩‍🏫 Faculty | Mark Attendance, Courses, Assessments, Reports |
| `admin` | 🛡️ Admin | User Management, System Config, Audit Logs |

If the selected role tab does not match the user's actual role in Supabase, login is denied.

### Current Users in Supabase

| Username | Role | Full Name |
|----------|------|-----------|
| `20261cse0001` | student | Loki |
| `20261cse0002` | student | Aravindhi |
| `testfaculty` | faculty | Test Faculty |
| `Loknath` | admin | Cheemala Loknath |
| `admin` | admin | Administrator |

> Passwords are SHA-256 hashed. To reset: update `password_hash` in Supabase with `hashlib.sha256(b"newpass").hexdigest()`.

### Session Behaviour
- Successful login saves session to `localStorage` as `ams_session`
- Page reload restores the session — no re-login required
- Logout clears `localStorage` and shows the login screen
- Pressing **Enter/Return** in any login field triggers Sign In

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Supabase project REST URL |
| `SUPABASE_KEY` | Supabase anon/public key |
| `FIREBASE_PROJECT_ID` | Firebase project ID |
| `FIREBASE_API_KEY` | Firebase web API key |
| `SECRET_KEY` | Flask session secret |
| `QR_ENCRYPTION_KEY` | Fernet key for QR payload encryption |
| `QR_HMAC_SECRET` | HMAC secret for QR signature verification |
| `FACE_THRESHOLD` | dlib match threshold (default `0.6`) |
| `LIVENESS_DETECTION` | Eye-blink liveness check: `True`/`False` |
| `FLASK_DEBUG` | Flask debug mode: `True`/`False` |

---

## Database Schema

All tables live in Supabase (PostgreSQL).

### `users`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | Primary key |
| `username` | text | Login username |
| `full_name` | text | Display name |
| `email` | text | Email address |
| `role` | text | `student` / `faculty` / `admin` |
| `password_hash` | text | SHA-256 hashed password |
| `firebase_uid` | text | Set on first Google login |
| `roll_no` | text | Students only |
| `employee_id` | text | Faculty/Admin only |
| `is_active` | boolean | Account enabled flag |

### `face_encodings`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | Primary key |
| `user_id` | UUID | FK → users.id |
| `roll_no` | text | Student roll number |
| `encoding_data` | text | Base64 dlib 128-d vector |
| `quality_score` | float | 0–100 |
| `is_primary` | boolean | Primary encoding flag |

### `attendance`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | Primary key |
| `student_id` | UUID | FK → users.id |
| `course_id` | text | Course identifier |
| `status` | text | `present` / `absent` / `late` |
| `method` | text | `face_recognition` / `qr` / `manual` |
| `marked_date` | date | Attendance date |
| `latitude` | float | GPS latitude |
| `longitude` | float | GPS longitude |

### `qr_sessions`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | Primary key |
| `session_code` | text | Unique session code |
| `faculty_id` | UUID | FK → users.id |
| `course_id` | text | Course identifier |
| `expires_at` | timestamp | QR expiry time |
| `is_active` | boolean | Session active flag |
| `qr_code_data` | text | HMAC-signed QR payload |

---

## API Endpoints

### Health
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Returns `{status, supabase, time}` |

### Authentication
| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| POST | `/api/users/login` | `{username, password, role}` | Username + password login |
| POST | `/api/users/firebase-login` | Bearer token + `{role}` | Firebase/Google login |
| POST | `/api/users/register` | `{username, password, email, full_name, role}` | Register user |

### Users
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/users/list` | List all users (admin) |
| POST | `/api/users/add` | Add user (admin) |

### Face Recognition
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/register` | Register face encoding |
| POST | `/api/verify` | Verify face + mark attendance |
| POST | `/api/users/register-face` | Register face for existing user |
| GET | `/api/registered-students` | Students with face registered |

### Attendance
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/attendance` | Fetch attendance records |
| POST | `/api/mark-qr-attendance` | Mark via QR scan |

### QR Sessions
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/qr/generate` | Generate QR session |
| POST | `/api/qr/validate` | Validate QR token |
| POST | `/api/qr/mark-attendance` | Mark attendance from QR |
| POST | `/api/qr/device-fingerprint` | Register device fingerprint |

### System Config
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/api/config/face-recognition` | Toggle face recognition |
| GET/POST | `/api/system-config` | Read/write system settings |

---

## Features

### Student Portal
Dashboard, calendar, timetable, CBCS, online class, digital library, performance analytics, attendance history, fee management, exam registration (sem/supplementary/revaluation/grace), course and exit surveys, grievance, leave, placement, notice board, messages, push notifications.

### Faculty Portal
Timetable, working hours, course/batch management, OBE + lesson planner, attendance marking (Face Recognition / QR Code / Manual), assessments, assignments, question papers, mark computation, course file, custom reports, work log, appraisal.

### Admin Portal
User creation and management, face registration, face recognition global toggle, system configuration, audit logs, global reports, timetable management, committee management.

### Face Recognition Attendance
```
1. Faculty enables face recognition for the session
2. Student opens camera widget on their device
3. dlib HOG detector locates the face
4. 128-dimensional face encoding extracted with ResNet model
5. Encoding compared against stored encodings (threshold: 0.6)
6. Eye Aspect Ratio (EAR) liveness check prevents photo spoofing
7. Match  → attendance marked PRESENT with confidence score
8. No match → attempt counter incremented; lockout after max attempts
```

### QR Code Attendance
```
1. Faculty generates a time-limited, HMAC-signed QR session
2. QR code displayed on faculty screen
3. Students scan with phone camera
4. Server validates: expiry + HMAC signature
5. Optional face verification step after scan
6. Attendance marked with device fingerprint + GPS location
7. Duplicate scan prevention via device fingerprint
```

---

## Firebase Setup

1. Open [Firebase Console](https://console.firebase.google.com) → your project
2. **Authentication → Sign-in method** → Enable **Google** and **Email/Password**
3. **Authentication → Settings → Authorized domains** → add `localhost` and production domain
4. **Project Settings → General** → copy `apiKey`, `authDomain`, `projectId`, `appId` into `api-config.js`
5. **Project Settings → Service accounts** → Generate private key → save as `serviceAccountKey.json` (used by Flask for token verification)

When a Firebase Google user signs in for the first time, `sync_firebase_user_to_supabase()` in `backend.py` creates their row in Supabase automatically with the selected role.

---

## Supabase Setup

1. Open [Supabase](https://supabase.com) → your project
2. **Settings → API** → copy `Project URL` and `anon/public key` → paste into `.env`
3. **SQL Editor** → run `schema.sql` to create all tables and indexes
4. Configure Row Level Security policies as needed for production

The backend uses a lightweight HTTP REST wrapper instead of `supabase-py` to avoid Python version compatibility issues with `httpx`.

---

## Deployment

### Firebase Hosting (Frontend)
```bash
npm install -g firebase-tools
firebase login
firebase deploy --only hosting
```
Frontend URL: `https://smart-ams-project-faa5f.web.app`

### Google Cloud Run (Backend)
```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID

gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/smartams-backend
gcloud run deploy smartams-backend \
  --image gcr.io/YOUR_PROJECT_ID/smartams-backend \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars "SUPABASE_URL=...,SUPABASE_KEY=...,FIREBASE_PROJECT_ID=..."
```

Or use the included script:
```bash
chmod +x deploy.sh && ./deploy.sh
```

`api-config.js` auto-selects the API URL:
- `localhost` → `http://localhost:6001`
- Production → `https://smartams-backend-76160313029.us-central1.run.app`

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| "Supabase not configured. Login disabled." | `.env` not loaded | Ensure `load_dotenv()` is first in `backend.py` and `.env` exists |
| Sign In button does nothing | Backend not running | `source .venv/bin/activate && python backend.py` |
| "Invalid password" | Hash mismatch | Update `password_hash`: `hashlib.sha256(b"pass").hexdigest()` |
| "This account is not a student account" | Wrong role tab | Select the correct role tab before signing in |
| Face recognition unavailable | dlib models missing | `cd build/dlib && pip install -e .` then restart backend |
| "Firebase not initialized" | Firebase CDN blocked | Check network; scripts load from `gstatic.com` |
| "Popup closed by user" | Browser blocked popup | Allow popups for `localhost:3000` |
| Browser shows stale UI | Cached old `app.js` | Hard refresh: Cmd+Shift+R (Mac) / Ctrl+Shift+R (Windows) |
| Port 6001 in use | Old backend running | `lsof -iTCP:6001 -sTCP:LISTEN | awk 'NR>1{print $2}' | xargs kill -9` |
