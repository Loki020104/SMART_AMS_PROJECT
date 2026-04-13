# 🎯 SmartAMS Bulk Import - Quick Reference

## The Problem
Your CSV had 2000 users but import failed with "Invalid data" errors because:
- Column order didn't match expectations  
- Titles (Mr., Ms., Dr.) were in username field
- Missing explicit `role` column

## The Solution ✅
Backend upgraded to:
- ✅ Auto-detect column name variations
- ✅ Extract usernames from emails
- ✅ Sanitize titles automatically
- ✅ Better error messages

---

## 🚀 Quick Start (5 minutes)

### 1. Prepare CSV
```csv
full_name,email,role,department,roll_no,semester
"John Smith","john@puc.edu.in","student","CS","CS001","1"
```

### 2. Convert to JSON
```bash
python3 csv_import_converter.py your_data.csv
```

### 3. Validate
```bash
python3 csv_import_converter.py your_data.json --validate
```

### 4. Import
```bash
python3 << 'EOF'
import requests, json
with open('your_data.json') as f:
    data = json.load(f)
url = "https://smartams-backend-ts3a5sewfq-uc.a.run.app/api/users/bulk-import"
result = requests.post(url, json=data, timeout=300).json()
print(f"Created: {result['created']}, Failed: {result['failed']}")
EOF
```

---

## Required Columns

| For Students | For Faculty | Both |
|---|---|---|
| roll_no | employee_id | full_name |
| semester | designation | email |
| | | department |
| | | role |

---

## Common Errors & Fixes

| Error | Cause | Fix |
|-------|-------|-----|
| "Invalid role" | role not "student"/"faculty" | Fix role column |
| "Already exists" | Duplicate username | Safe to ignore |
| "Missing valid username" | No username/email/roll_no | Add one of these |
| "Invalid data" | Empty full_name/email | Fill required fields |

---

## Column Name Variations (Auto-Detected)

```
full_name = name, employee_name
email = email_id, email_address  
role = user_role, account_type
roll_no = roll_number, student_id
employee_id = emp_id, faculty_id
department = dept
```

---

## Files Provided

📄 **IMPORT_2000_USERS_GUIDE.md** - Step-by-step full guide  
📄 **BULK_IMPORT_GUIDE.md** - Field requirements & formats  
🐍 **csv_import_converter.py** - Convert CSV → JSON  
🧪 **test_bulk_import.py** - Test endpoint  
📊 **sample_import_students.csv** - Student CSV template  
📊 **sample_import_faculty.csv** - Faculty CSV template  

---

## Expected Results

```json
{
  "success": true,
  "created": 1900-2000,
  "failed": 0-100,
  "errors": [...]
}
```

✨ Users can now login with:
- Username: roll_no or emp_id  
- Password: username@123

---

**Ready to import? Start with:**
```bash
python3 IMPORT_2000_USERS_GUIDE.md
```

Or just use the converter:
```bash
python3 csv_import_converter.py your_file.csv
```
