# Timetable Archive System Guide

## Overview

The **Timetable Archive System** provides a soft-delete mechanism for timetable entries. Instead of permanently deleting timetable entries, they are moved to an archive table where they can be restored or permanently deleted upon confirmation.

---

## 🎯 Key Features

### 1. **Soft-Delete (Archive)**
- When timetable entries are deleted, they're moved to the `timetable_archive` table
- Entries are not immediately removed from the system
- Deletion timestamp is recorded for audit trail
- Original entry ID is preserved in the archive

### 2. **Restore from Archive**
- Archived entries can be restored back to the active timetable
- Restored entries get a new ID in the active timetable
- Original timestamp and metadata are preserved
- Restored entry appears in the normal timetable schedule

### 3. **Permanent Purge**
- Archived entries can be permanently deleted (cannot be restored)
- Requires user confirmation via warning dialog
- Provides irreversible deletion option for cleanup

### 4. **Audit Trail**
- `deleted_at` - Timestamp of when entry was archived
- `deletion_reason` - Reason for deletion (e.g., "Admin deletion", "Faculty timetable archival")
- `original_id` - Reference to the original entry ID

---

## 📊 Database Schema

### timetable_archive Table

```sql
CREATE TABLE timetable_archive (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    original_id           UUID,              -- Reference to original entry
    faculty_id            TEXT,
    faculty_name          TEXT,
    faculty_username      TEXT,
    batch                 TEXT,
    session_type          TEXT,
    subject               TEXT,
    day_of_week           TEXT,
    hour_number           INT,
    start_time            TIME,
    end_time              TIME,
    room_number           TEXT,
    academic_year         TEXT,
    semester              INT,
    mode                  TEXT,
    created_at            TIMESTAMPTZ,
    updated_at            TIMESTAMPTZ,
    deleted_at            TIMESTAMPTZ DEFAULT now(),
    deletion_reason       TEXT DEFAULT ''
);
```

---

## 🔄 How It Works

### Archive Flow (Soft Delete)

```
User deletes timetable entry
         ↓
Entry fetched from timetable table
         ↓
Entry copied to timetable_archive with deleted_at timestamp
         ↓
Entry removed from timetable, RTDB, and Firestore
         ↓
Confirmation message: "Entry archived (can be restored)"
```

### Restore Flow

```
User views Archive tab
         ↓
Selects "Restore" on archived entry
         ↓
Confirmation dialog: "Restore entry?"
         ↓
Entry copied back to timetable with new ID
         ↓
Entry removed from timetable_archive
         ↓
Entry synced to RTDB and Firestore
         ↓
Success: "Timetable entry restored successfully!"
```

### Permanent Delete Flow

```
User views Archive tab
         ↓
Selects "Delete" (purge) on archived entry
         ↓
Warning dialog: "Permanently delete? This cannot be undone!"
         ↓
Entry permanently removed from timetable_archive
         ↓
Success: "Archive entry permanently deleted"
```

---

## 🌐 REST API Endpoints

### 1. Get Archived Timetable Entries

**Endpoint:** `GET /api/archive/timetable`

**Query Parameters:**
- `limit` (int, default: 100) - Number of records to fetch
- `offset` (int, default: 0) - Pagination offset

**Response:**
```json
{
  "success": true,
  "archived_timetable": [
    {
      "id": "uuid",
      "original_id": "uuid",
      "faculty_name": "Dr. John Doe",
      "subject": "Data Structures",
      "batch": "CSE-A",
      "day_of_week": "Monday",
      "start_time": "09:00:00",
      "end_time": "10:00:00",
      "room_number": "Lab-1",
      "deleted_at": "2024-01-15T10:30:00Z"
    }
  ],
  "total": 42,
  "limit": 100,
  "offset": 0
}
```

### 2. Restore Archived Entry

**Endpoint:** `POST /api/archive/timetable/restore`

**Request Body:**
```json
{
  "archive_id": "uuid"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Timetable entry restored successfully!",
  "new_id": "new-uuid"
}
```

### 3. Permanently Delete Archived Entry

**Endpoint:** `DELETE /api/archive/timetable/purge`

**Request Body:**
```json
{
  "archive_id": "uuid"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Archived timetable entry purged permanently"
}
```

---

## 💻 Frontend UI

### Archive Tab (📦 Archive)

Located in **Timetable Manager** alongside other tabs:
- 📅 Grid
- 📤 Upload Excel
- 👨‍💼 Workload
- ⚠️ Conflicts
- 📋 Assignments
- ✏️ Manual Edit
- 🗑️ Delete Timetable
- ⚡ Auto-Generate
- **📦 Archive** ← New Tab

### Archive Tab Features

#### 1. **Refresh Button**
```html
<button onclick="ttLoadArchiveTab()">🔄 Refresh Archive</button>
```
Reloads the list of archived entries from the server.

#### 2. **Archive Table**
Displays all archived entries with columns:
- **Faculty** - Faculty member name
- **Subject** - Subject/Course name
- **Batch** - Student batch/group
- **Day** - Day of week
- **Time** - Class time (HH:MM - HH:MM)
- **Room** - Room/Lab number
- **Deleted** - Date entry was archived
- **Actions** - Restore/Delete buttons

#### 3. **Action Buttons**

**Restore Button (↩️)**
```javascript
onclick="ttRestoreArchiveEntry('${archive_id}','${subject}')"
```
- Restores archived entry back to active timetable
- Shows confirmation dialog
- Displays success/error toast message

**Delete Button (🗑️)**
```javascript
onclick="ttPurgeArchiveEntry('${archive_id}','${subject}')"
```
- Permanently deletes archived entry (irreversible!)
- Shows warning dialog with confirmation
- Displays success/error toast message

### User Confirmations

#### Restore Confirmation
```
Restore timetable entry for "Data Structures"? 
It will be added back to the active schedule.
```

#### Permanent Delete Warning
```
⚠️ Permanently delete "Data Structures" from archive? 
This cannot be undone!
```

---

## 🔙 Backend Functions

### Python Backend (backend.py)

#### 1. Delete Single Timetable Entry
```python
@app.route("/api/timetable/<entry_id>", methods=["DELETE"])
def delete_timetable_entry(entry_id):
    # Archives entry to timetable_archive table
    # Then removes from timetable, RTDB, Firestore
```

#### 2. Delete All Timetable Entries
```python
@app.route("/api/timetable/delete-all", methods=["DELETE"])
def delete_all_timetable():
    # Archives all entries (soft-delete)
    # Removes from activ table and RTDB
```

#### 3. Delete by Faculty
```python
@app.route("/api/timetable/delete-by-faculty", methods=["DELETE"])
def delete_timetable_by_faculty():
    # Archives all entries for specific faculty
    # Body: {faculty_username or faculty_id}
```

#### 4. Bulk Delete
```python
@app.route("/api/timetable/delete-bulk", methods=["DELETE"])
def delete_timetable_bulk():
    # Archives multiple entries
    # Body: {ids: [...]}
```

---

## ✅ Testing Checklist

### Basic Operations
- [ ] **Create Timetable Entry**
  - Add a new timetable slot
  - Verify it appears in the grid

- [ ] **Delete Entry (Archive)**
  - Click delete on an entry
  - Entry disappears from grid
  - Archive count increases

- [ ] **View Archive**
  - Click "Archive" tab in Timetable Manager
  - Verify deleted entry appears in list
  - Verify deletion date is shown

- [ ] **Restore Entry**
  - Click "Restore" on archived entry
  - Confirm dialog appears
  - Entry reappears in active timetable
  - Entry removed from archive list

- [ ] **Permanent Delete**
  - Click "Delete" on archived entry
  - Warning dialog appears with irreversibility message
  - Entry permanently removed from archive
  - Cannot be restored afterward

### Bulk Operations
- [ ] **Delete All Timetable**
  - All entries archived (not deleted)
  - Can restore them from archive

- [ ] **Delete by Faculty**
  - Only that faculty's entries archived
  - Other faculty entries unaffected

- [ ] **Bulk Delete**
  - Multiple entries archived together
  - Deletion reason recorded

### UI Verification
- [ ] Archive tab button displays with purple color
- [ ] Refresh button works properly
- [ ] Table displays correctly with all columns
- [ ] Toast notifications appear for actions
- [ ] Confirmation dialogs show warnings appropriately
- [ ] Pagination works for large archives

### Data Integrity
- [ ] Archived entry metadata preserved (subject, faculty, etc.)
- [ ] Restored entry gets new ID
- [ ] deleted_at timestamp accurate
- [ ] Original ID reference maintained
- [ ] RTDB and Firestore stay in sync

---

## 🚀 Usage Examples

### Scenario 1: Mistake Entry Deletion

```
1. Create timetable entry: Math Class, Monday 10 AM
2. Realize mistake: Wrong faculty assigned
3. Delete entry → Goes to archive
4. View Archive tab
5. Click "Restore" on Math Class
6. Math Class reappears in timetable
7. Edit faculty and save
```

### Scenario 2: Semester End Cleanup

```
1. Semester ends, need to clean up
2. View "Delete Timetable" tab
3. Click "Delete All"
4. All entries moved to archive (soft-delete)
5. Archive shows all archived entries
6. Can restore any if needed
7. After verification, purge archive entries
```

### Scenario 3: Faculty Resignation

```
1. Faculty resigns
2. View Timetable Manager
3. Delete by Faculty: "prof_smith"
4. All of Prof. Smith's classes archived
5. Archive shows: "Faculty timetable archival" reason
6. Other faculty classes unaffected
7. If rehired, can restore from archive
```

---

## 🔒 Data Safety

### Archived entries are protected by:
1. **Soft-delete mechanism** - Not immediately destroyed
2. **Timestamp recording** - Track when/why deleted
3. **Restore capability** - Can undo deletions
4. **Double confirmation** - Requires two confirmations for permanent delete
5. **Audit trail** - Original ID and reason recorded

### Best Practices:
- ✅ Always review archive before permanent purge
- ✅ Archive entries for at least one semester before purging
- ✅ Document deletion reasons for compliance
- ✅ Regular backup ensures recovery even after purge
- ✅ Use bulk operations for semester transitions

---

## 📝 API Error Handling

### Common Errors

| Code | Error | Solution |
|------|-------|----------|
| 400 | `archive_id is required` | Ensure archive_id is provided in request body |
| 404 | `Archive record not found` | Verify archive_id exists in archive table |
| 500 | `Supabase not configured` | Check database connection in backend |
| 500 | `Failed to restore timetable entry` | Check database permissions |

### Example Error Response
```json
{
  "success": false,
  "error": "Archive record not found"
}
```

---

## 🔧 Configuration

### Backend Configuration (backend.py)
```python
# Archive operations use these tables:
"timetable"          # Active timetable
"timetable_archive"  # Archived entries

# All deletes are soft-deletes:
# 1. Copy to archive with deleted_at timestamp
# 2. Remove from active table
# 3. Sync removal to RTDB and Firestore
```

### Frontend Configuration (app.js)
```javascript
// Archive endpoint
API_ENDPOINT = `${window.AMS_CONFIG.API_URL}/api/archive/timetable`

// Archive tab identification
TAB_NAME = 'archive'

// Archive styling
BTN_COLOR = 'btn-purple'
ICON = '📦'
```

---

## 📞 Support

For issues with the Archive System:

1. **Check Database Connection**
   - Verify Supabase is connected
   - Check `timetable_archive` table exists

2. **Review Logs**
   - Backend logs show archive operations
   - Frontend console shows API responses

3. **Verify Permissions**
   - Ensure user can access archive operations
   - Check database row-level security

4. **Clear Cache**
   - Hard refresh frontend (Cmd+Shift+R)
   - Reload page and retry

---

## 🎓 Learning Resources

### Related Topics
- [Timetable Generation Guide](TIMETABLE_GENERATION_GUIDE.md)
- [Backend Deployment Guide](BACKEND_DEPLOYMENT_GUIDE.md)
- [API Reference](API_REFERENCE.md)

### Key Functions
- `ttRenderArchiveTab()` - Displays archive UI
- `ttLoadArchiveTab()` - Fetches archived entries
- `ttRestoreArchiveEntry()` - Restores entry
- `ttPurgeArchiveEntry()` - Permanently deletes entry
- `delete_timetable_entry()` - Backend delete (archives)
- `restore_archived_timetable()` - Backend restore

---

**Last Updated:** 2024  
**Status:** ✅ Production Ready  
**Archive System Version:** 1.0
