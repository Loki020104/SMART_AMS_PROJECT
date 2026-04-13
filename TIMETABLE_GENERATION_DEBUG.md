# Timetable Generation v2 - Debug Guide

## Recent Fixes Applied

### 1. **Enhanced Error Handling** ✅
- Added detailed logging at each stage of timetable generation
- Improved exception handling with stack traces
- Validation of data before processing
- Better fallback strategies

### 2. **Data Validation** ✅
- Strips whitespace from all string inputs
- Validates required fields before processing
- Skips malformed assignments gracefully
- Ensures room list contains valid entries

### 3. **Edge Case Handling** ✅
- Handles missing faculty with fallback to assignment faculty
- Handles empty room lists with default room IDs
- Validates period lookups with `.get()` for safety
- Tracks component counts for stats

## Troubleshooting the 500 Error

### Step 1: Check Backend Logs
```bash
# If running locally
tail -f backend_logs.txt

# Check for these patterns:
# [Timetable v2] Starting generation for 2025-26 sem 1
# [Timetable] Starting generation with constraint satisfaction
# [Timetable] Error in generate_timetable_v2
```

### Step 2: Verify Database Setup
The endpoint loads from these Supabase tables:
- `break_schedule` - Can fail gracefully (not required)
- `faculty_assignments` - **REQUIRED** - Must have at least 1 record
- `subjects` - Optional (used for reference, not required)
- `room_capacity` - **REQUIRED** - Must have at least 1 room

**Check query:**
```sql
-- Faculty assignments (required)
SELECT COUNT(*) FROM faculty_assignments 
WHERE academic_year='2025-26' AND semester=1 AND is_active=true;

-- Rooms (required)
SELECT COUNT(*) FROM room_capacity 
WHERE academic_year='2025-26' AND is_available=true;
```

### Step 3: Validate Assignment Structure
Each assignment must have ALL these fields:
- `section` (e.g., "A", "B", "CSE-1") ✓
- `year` (numeric: 1, 2, 3, 4) ✓
- `subject_code` (e.g., "CS101") ✓
- `subject_name` (e.g., "Data Structures") ✓
- `faculty_username` (e.g., "prof_sharma") ✓

**Query to check:**
```sql
SELECT * FROM faculty_assignments 
WHERE academic_year='2025-26' AND semester=1 
LIMIT 1;

-- Look for NULL values in required columns
```

### Step 4: Test the Endpoint
```bash
curl -X POST http://localhost:5000/api/timetable/generate-v2 \
  -H "Content-Type: application/json" \
  -d '{
    "academic_year": "2025-26",
    "semester": 1,
    "algorithm": "simulated_annealing"
  }'
```

Expected response on success:
```json
{
  "success": true,
  "message": "Timetable generated successfully",
  "slots_count": 150,
  "slots": [...]
}
```

### Step 5: Check Response Codes

| Code | Issue | Solution |
|------|-------|----------|
| 400 | No faculty assignments found | Insert test data into `faculty_assignments` |
| 400 | No rooms configured | Insert rooms into `room_capacity` |
| 400 | Invalid field data | Check assignment fields are not NULL/empty |
| 500 | Internal server error | Check backend logs for exception stack |

## Common Issues & Fixes

### ❌ "No valid section-year-subject mappings found"
**Cause:** All assignments have missing required fields
**Fix:** Verify database has complete assignment records

### ❌ "No valid rooms available"
**Cause:** Room list is empty after filtering
**Fix:** Check `room_capacity` table has `room_number` field populated

### ❌ "No valid faculty members found"
**Cause:** Faculty usernames are empty/null
**Fix:** Populate `faculty_members` table with valid usernames

## Log Output Explanation

```
[Timetable v2] Starting generation for 2025-26 sem 1
  → Generation initiated with these parameters

[Timetable v2] Loaded 45 faculty assignments
  → Successfully fetched assignments from database

[Timetable v2] Loaded 10 rooms
  → Successfully fetched available rooms

[Timetable] Prepared: 12 section-years, 10 rooms, 8 faculty
  → Data structure ready for scheduling

[Timetable] Generated 150 slots for 60 subjects in 12 section-years
  → FINAL SUCCESS: 150 timetable slots created
```

## Next Steps if Still Failing

1. **Enable debug mode** in backend
   ```python
   app.config['DEBUG'] = True
   ```

2. **Add request logging** to see what data is being received
   ```python
   logger.info(f"[Timetable v2] Received request: {d}")
   ```

3. **Test with minimal data** - Just 1 faculty, 1 room, 1 assignment

4. **Check Supabase connection** - Verify `sb` object is initialized

## Files Modified

- `/backend/backend.py` - Enhanced `/api/timetable/generate-v2` endpoint with comprehensive error handling and logging

## Testing Checklist

- [ ] Verify `faculty_assignments` table has data
- [ ] Verify `room_capacity` table has data  
- [ ] Check all required fields are populated (no NULLs)
- [ ] Test endpoint with sample request
- [ ] Monitor backend logs during generation
- [ ] Verify timetable slot data in response
