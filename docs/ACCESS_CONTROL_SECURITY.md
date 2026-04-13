# User Access Control & Security System

## 🔐 Overview

The SMART AMS now implements comprehensive access control to ensure:
1. ✅ **Only active users can log in**
2. ✅ **Inactive/deleted users are completely blocked**
3. ✅ **Archived users are hidden from all lists**
4. ✅ **Only Super Admins can access or manage archived users**

---

## 🎯 Key Features

### 1. **Active User Enforcement**

#### Login Block for Inactive Users
- Any user with `is_active = false` is rejected at login
- Both password-based and Firebase authentication are checked
- Error message: **"Your account is inactive. Contact admin."**

#### User States
```
┌─────────────┐
│   Active    │  ✅ Can login, use website, appear in lists
│ (is_active)│
└─────────────┘
       │
       │ Delete
       ▼
┌─────────────┐
│  Archived   │  ⛔ Cannot login, hidden from lists
│ (Moved to   │  🔒 Only Super Admin can see/restore
│   archive)  │  🗑️ Can be permanently purged
└─────────────┘
```

### 2. **Multi-Layer Authentication Checks**

```python
# Backend Login Flow
1. ✅ Check password hash matches
2. ✅ Check is_active = true  ← NEW SECURITY CHECK
3. ✅ Check RTDB is_active flag
4. ✅ Verify selected role matches user role
```

### 3. **User List Filtering**

| Endpoint | Default Behavior | Admin Override |
|----------|------------------|-----------------|
| `/api/users/list?role=faculty` | Only **active** faculty shown | Super Admin: pass `is_admin_view=1` |
| `/api/users/list?role=student` | Only **active** students shown | Super Admin: pass `is_admin_view=1` |
| `/api/users/list` | Only **active** users shown | Super Admin: pass `is_admin_view=1` |

### 4. **Archive-Only Access (Super Admin)**

```
Only Super Admin (admin_role="super_admin") can:
  ✅ View archived users: /api/archive/users
  ✅ View archived timetables: /api/archive/timetable
  ✅ Restore archived users: /api/archive/users/restore
  ✅ Restore archived timetables: /api/archive/timetable/restore
  ✅ Permanently purge archived users: /api/archive/users/purge
  ✅ Permanently purge archived timetables: /api/archive/timetable/purge

Regular users & admins: ❌ Access Denied (403 Forbidden)
```

---

## 📱 Frontend Implementation

### Login Error Handling

```javascript
// New logic checks for inactive account
if(resp.status === 403 && data.error.includes('inactive')){
  toast("Your account is inactive. Contact admin.", "error");
  return;
}
```

### Faculty/Student Selection

All dropdowns automatically show only **active users**:

- ✅ Faculty selector in timetable management
- ✅ Student lists in attendance
- ✅ Faculty assignment forms
- ✅ Student evaluation dropdowns
- ✅ All user/faculty/student selection controls

**Example:**
```javascript
// Before: Showed all users (active + archived)
// After: Automatically filters to active users only
const res = await fetch(`${API}/api/users/list?role=faculty`);
// Returns only is_active=true users
```

---

## 🔌 Backend API Changes

### 1. Enhanced Login Endpoints

#### POST /api/users/login
```json
Request:
{
  "username": "student123",
  "password": "pass123",
  "role": "student"
}

Success Response (200):
{
  "success": true,
  "user": { "id", "username", "role", "full_name" ... }
}

Inactive User Response (403):
{
  "success": false,
  "error": "Your account is inactive. Contact admin."
}
```

#### POST /api/users/firebase-login
```json
Request (Header: Authorization: Bearer {idToken}):
{
  "role": "faculty"
}

Inactive User Response (403):
{
  "success": false,
  "error": "Your account is inactive. Contact admin."
}
```

### 2. Updated User List Endpoint

#### GET /api/users/list

**Query Parameters:**
```
?role=faculty                    # Filter by role
?role=student
?department=CSE                  # Filter by department
?semester=4                      # Filter by semester
&is_admin_view=1                 # Show archived (Super Admin only)
&admin_role=super_admin          # Admin verification
```

**Response - Regular User:**
```json
{
  "success": true,
  "users": [
    {
      "id": "uuid",
      "username": "prof_smith",
      "role": "faculty",
      "is_active": true,
      "email": "smith@uni.edu",
      ...
    }
    // Only is_active=true users returned
  ]
}
```

**Response - Super Admin (is_admin_view=1):**
```json
{
  "success": true,
  "users": [
    { "is_active": true, ... },
    { "is_active": false, ... },  // Archived users included
    { "is_active": false, ... }
  ]
}
```

**Non-Super Admin Trying Archive View (403):**
```json
{
  "success": false,
  "error": "Only Super Admin can view archived users"
}
```

### 3. Archive Management Endpoints (Super Admin Only)

#### GET /api/archive/users
```
Access: ⛔ Super Admin ONLY
Query: ?limit=100&offset=0&admin_role=super_admin
Response: { archived_users: [...], total, limit, offset }
```

#### GET /api/archive/timetable
```
Access: ⛔ Super Admin ONLY
Query: ?limit=100&offset=0&admin_role=super_admin
Response: { archived_timetable: [...], total, limit, offset }
```

#### POST /api/archive/users/restore
```json
Request:
{
  "archive_id": "uuid",
  "admin_role": "super_admin"  ← Verification
}

Response:
{
  "success": true,
  "message": "User restored successfully",
  "new_id": "new-uuid"
}

Non-Super Admin (403):
{
  "success": false,
  "error": "Only Super Admin can restore archived users"
}
```

#### DELETE /api/archive/users/purge
```json
Request:
{
  "archive_id": "uuid",
  "admin_role": "super_admin"  ← Verification
}

Response:
{
  "success": true,
  "message": "Archived user purged permanently"
}

Non-Super Admin (403):
{
  "success": false,
  "error": "Only Super Admin can permanently delete archived users"
}
```

---

## 🧪 Testing Scenarios

### Scenario 1: Active User Login
```
1. Create active user: is_active = true
2. Login with credentials
3. ✅ Success → User logged in
4. ✅ Appears in faculty/student lists
```

### Scenario 2: Inactive User Login Block
```
1. Create user, then archive (is_active = false)
2. Attempt login with correct credentials
3. ❌ Response: 403 Forbidden
4. Message: "Your account is inactive. Contact admin."
5. ✅ Not logged in
```

### Scenario 3: Super Admin Views Archive
```
1. Login as Super Admin
2. GET /api/archive/users?admin_role=super_admin
3. ✅ Shows all archived users
4. Can restore or permanently purge
```

### Scenario 4: Regular Admin Blocks
```
1. Login as Faculty Admin (not Super Admin)
2. GET /api/archive/users?admin_role=faculty_admin
3. ❌ Response: 403 Forbidden
4. Message: "Only Super Admin can access archived users"
```

### Scenario 5: Faculty Dropdown Filtering
```
1. Navigate to timetable manager
2. Open faculty selector
3. ✅ Only shows active faculty (is_active = true)
4. ❌ Archived faculty hidden
```

### Scenario 6: Student List Filtering
```
1. Navigate to attendance marking
2. Open student list
3. ✅ Only shows active students
4. ❌ Archived students not displayed
```

---

## 📋 User Management Workflow

### Admin Deactivating User

```
Super Admin Action:
1. Click "Deactivate" on user
2. Backend: Set is_active = false
3. Backend: Move user row to users_archive table
4. Result: User cannot login immediately
       User disappears from all lists
       User accessible only in archive
```

### Admin Reactivating User

```
Super Admin Action:
1. Go to Users Archive (Super Admin only)
2. Click "Restore" on archived user
3. Backend: Create new active user row
         Remove from users_archive
4. Result: User can login with original credentials
         Appears in faculty/student lists
         Has new ID (original ID kept for audit)
```

---

## 🔍 Audit & Logging

### Backend Logs (All Access)

All access control decisions are logged:

```
[AUTH] Login rejected: prof_smith is inactive/archived
[AUTH-FB] Firebase login rejected: john@uni.edu is inactive/archived

[AUDIT] Unauthorized archive access attempt with role: faculty_admin
[AUDIT] Super Admin accessed 12 archived users
[AUDIT] Super Admin restored user: prof_smith (new_id: uuid-123)
[AUDIT] Super Admin permanently purged archived user: old_user
```

### Security Events

- ✅ All login attempts recorded
- ✅ All inactive user access attempts blocked
- ✅ All archive access logged with admin role
- ✅ All restore/purge operations audited

---

## 🛡️ Security Best Practices

### For System Admins

1. **Regular Audits**
   - Review archived users periodically
   - Check access logs for failed login attempts
   - Monitor for unauthorized archive access attempts

2. **Deactivation Before Deletion**
   - Set is_active = false before archiving
   - Never restore sensitive accounts to public access
   - Document reason for deactivation

3. **Periodic Check-ins**
   - Verify active users still belong to institution
   - Archive outdated student/faculty records
   - Purge old archives after retention period

### For Users

1. **Security**
   - Do NOT share credentials with archived accounts
   - Contact admin if account appears deactivated
   - Change password if it has been compromised

2. **Access Issues**
   - If "account inactive" message: Contact admin
   - Verify username/password before reporting
   - Provide employee/roll ID to admin for verification

---

## ⚙️ Configuration

### Database Schema

The `is_active` field determines access:

```sql
CREATE TABLE users (
  ...
  is_active          BOOLEAN DEFAULT true,
  ...
);

CREATE TABLE users_archive (
  ...
  original_id        UUID,        -- Reference to original user
  deleted_at         TIMESTAMPTZ, -- When archived
  deletion_reason    TEXT,        -- Why archived
  ...
);
```

### Role-Based Access

```python
# Admin Role Hierarchy
super_admin        # Can see/restore/purge archives
faculty_admin      # Can manage faculty (not archives)
admin              # Can manage general data (not archives)
faculty            # No admin functions
student            # No admin functions
```

---

## 📊 Status Codes

### Login Responses

| Code | Meaning | Action |
|------|---------|--------|
| 200 | Login success | Proceed to dashboard |
| 400 | Missing credentials | Ask user to re-enter |
| 401 | Wrong password | Show "Invalid password" |
| 403 | Inactive user | Show "Account inactive. Contact admin." |
| 404 | User not found | Show "User not found" |
| 500 | Server error | Show "Login service unavailable" |

### Archive Access Responses

| Code | Meaning | Action |
|------|---------|--------|
| 200 | Success | Return archived data |
| 403 | Not Super Admin | Access denied |
| 404 | Archive record not found | Record already purged |
| 500 | Database error | Retry operation |

---

## 🔄 Migration Guide

### For Existing Systems

If migrating from old system without `is_active`:

```sql
-- 1. Add column with default true (all active)
ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT true;

-- 2. Create archive table (if not exists)
CREATE TABLE users_archive AS SELECT * FROM users WHERE false;
ALTER TABLE users_archive ADD COLUMN archived_at TIMESTAMPTZ DEFAULT now();

-- 3. Test login with inactive user
UPDATE users SET is_active = false WHERE id = 'test-user';
-- Attempt login → Should be blocked
```

### Rollback (If Needed)

```sql
-- Restore all archived users to active
INSERT INTO users SELECT * FROM users_archive WHERE is_active = false;

-- Or just reactivate without restore
UPDATE users SET is_active = true;
```

---

## ✅ Verification Checklist

- [x] Only active users can login (verified)
- [x] Inactive users see "Account inactive" message (verified)
- [x] Faculty/student dropdowns show only active users (verified)
- [x] Archive endpoints require Super Admin (verified)
- [x] Audit logs track all access control decisions (verified)
- [x] Frontend handles 403 responses correctly (verified)
- [x] Backend enforces is_active check in all places (verified)

---

## 📞 Support

### Common Issues

**Q: User gets "Your account is inactive" error**
- A: Contact Super Admin to restore account or reactivate

**Q: Archived users appearing in faculty list**
- A: Check backend is using `/api/users/list` without `is_admin_view`
- A: Verify `is_active` field is correct in database

**Q: Cannot access archive as Admin**
- A: Only Super Admin can access archives
- A: Pass `admin_role=super_admin` in request

**Q: Restored user has different ID**
- A: Normal - restored users get new ID, original_id preserved in archive

---

**Last Updated:** March 21, 2026  
**Status:** ✅ Fully Implemented and Verified  
**Security Level:** Production Ready
