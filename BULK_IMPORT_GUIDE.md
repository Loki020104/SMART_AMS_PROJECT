# Bulk User Import Guide

## Required Fields

| Field | Required | Format | Examples |
|-------|----------|--------|----------|
| **full_name** | ✅ Yes | Text | "John Smith", "Dr. Jane Doe" |
| **email** | ✅ Yes | email@domain.com | "john.smith@puc.edu.in" |
| **role** | ✅ Yes | student \| faculty \| admin | "student" or "faculty" |
| **department** | ✅ Yes | Text | "Computer Science", "Engineering" |
| username | Optional | Text (auto-generated if empty) | "jsmith", "emp001" |
| roll_no | For students | Alphanumeric | "CS001", "B003" |
| employee_id | For faculty | Alphanumeric | "FAC001", auto-generated if empty |
| program | Optional | Text | "B.Tech", "M.Tech", "B.Sc" |
| section | Optional | Text | "A", "B", "Batch-1" |
| semester | For students | 1-8 | "1", "3", "6" |
| designation | For faculty | Text | "Assistant Professor", "HOD" |
| subjects | Optional | Comma-separated | "Math, Physics, Chemistry" |
| password | Optional | ASCII text | Auto-generated as `username@123` if empty |

## 📋 CSV Format

### For Students:
```csv
full_name,email,role,department,program,section,roll_no,semester
"John Smith","john.smith@puc.edu.in","student","Computer Science","B.Tech","A","CS001","1"
"Jane Doe","jane.doe@puc.edu.in","student","Computer Science","B.Tech","A","CS002","1"
```

### For Faculty:
```csv
full_name,email,role,department,designation,employee_id
"Dr. Rajesh Kumar","rajesh.kumar@puc.edu.in","faculty","Computer Science","Assistant Professor","FAC001"
"Prof. Anita Singh","anita.singh@puc.edu.in","faculty","Computer Science","HOD",""
```

### Mixed (Students + Faculty):
```csv
full_name,email,role,department,roll_no,semester,employee_id,designation
"John Smith","john.smith@puc.edu.in","student","CS","CS001","1","",""
"Dr. Rajesh Kumar","rajesh.kumar@puc.edu.in","faculty","CS","","","FAC001","Assistant Professor"
```

## ✅ Column Name Variations (Auto-Detected)

The system accepts these alternative column names:

| Primary | Variations |
|---------|-----------|
| full_name | name, employee_name, faculty_name, student_name |
| email | email_id, email_address |
| username | user_id, login_id |
| roll_no | roll_number, student_id, reg_no |
| employee_id | emp_id, faculty_id |
| department | dept, faculty_department |
| program | course, degree |
| section | batch, class |
| designation | position, title_role |
| role | user_role, account_type |
| semester | sem, year |
| subjects | courses, papers |

## 📥 How to Import

### Via API (cURL):
```bash
curl -X POST https://smart-ams-project-ts3a5sewfq-uc.a.run.app/api/users/bulk-import \
  -H "Content-Type: application/json" \
  -d @users.json
```

### JSON Format (users.json):
```json
{
  "users": [
    {
      "full_name": "John Smith",
      "email": "john.smith@puc.edu.in",
      "role": "student",
      "department": "Computer Science",
      "program": "B.Tech",
      "roll_no": "CS001",
      "semester": "1"
    },
    {
      "full_name": "Dr. Rajesh Kumar",
      "email": "rajesh.kumar@puc.edu.in",
      "role": "faculty",
      "department": "Computer Science",
      "employee_id": "FAC001",
      "designation": "Assistant Professor"
    }
  ]
}
```

### Via Python:
```python
import csv
import json
import requests

# Read CSV
users = []
with open('users.csv', 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    users = list(reader)

# Send to backend
url = "https://smart-ams-project-ts3a5sewfq-uc.a.run.app/api/users/bulk-import"
response = requests.post(url, json={"users": users})
result = response.json()

print(f"Created: {result['created']}")
print(f"Failed: {result['failed']}")
if result['errors']:
    print("\nFirst 10 errors:")
    for err in result['errors'][:10]:
        print(f"  {err['username']}: {err['error']}")
```

## ⚠️ Common Issues

### ❌ "Invalid data" Errors
**Problem:** Usernames are titles (Mr., Ms., Dr.), emails, or empty  
**Solution:** Ensure `full_name` column has actual names, not titles. Titles are auto-stripped.

### ❌ "Missing valid username"
**Problem:** No username, roll_no, employee_id, or email provided  
**Solution:** Provide at least ONE of these columns

### ❌ "Already exists"
**Problem:** User with same username already in database  
**Solution:** Check for duplicates or use unique usernames

### ❌ All records fail with role errors
**Problem:** No `role` column or invalid values  
**Solution:** Add `role` column with values: "student", "faculty", or "admin"

## 🎯 Quick Checklist

- [ ] CSV has `full_name` (not just titles)
- [ ] CSV has `email` (real email addresses)
- [ ] CSV has `role` (student, faculty, or admin)
- [ ] CSV has `department`
- [ ] Students have `roll_no` and `semester`
- [ ] Faculty have `employee_id` or `designation`
- [ ] No duplicate usernames in database
- [ ] All required fields are non-empty
- [ ] File encoding is UTF-8
- [ ] No special characters that break JSON (use quotes for values with commas)

## 📊 Expected Response

```json
{
  "success": true,
  "created": 1950,
  "failed": 50,
  "errors": [
    {
      "username": "john.smith@puc.edu.in",
      "error": "Already exists"
    },
    {
      "username": "row_15",
      "error": "Missing valid username..."
    }
  ]
}
```

## 🚀 Next Steps

1. Prepare your CSV with correct format
2. Test with 10 records first
3. If successful, import full batch of 2000
4. Check error list for any failures
5. Fix failed records and re-import

