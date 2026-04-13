# 🚀 Step-by-Step: Import 2000 Users into SmartAMS

## Problem Analysis

Your bulk import failed because:
- ✗ CSV column order didn't match backend expectations
- ✗ Titles (Mr., Ms., Dr.) were being sent as usernames
- ✗ Emails were sometimes in wrong column positions
- ✗ No explicit `role` column provided

## ✅ Solution: Updated Import System

The backend has been **upgraded** to:
- Auto-detect and map column name variations
- Extract usernames from emails automatically
- Sanitize titles from names
- Provide better error messages
- Handle flexible CSV formats

---

## 📋 Step 1: Prepare Your Data

### Check Your CSV Format

Your data should have these columns (minimum):

| Column | What It Is | Example |
|--------|-----------|---------|
| `full_name` * | Person's name | "John Smith"  |
| `email` * | Email address | "john@puc.edu.in" |
| `role` * | student \| faculty \| admin | "student" |
| `department` * | Department name | "Computer Science" |
| `roll_no` | For students | "CS001" |
| `semester` | 1-8 (students only) | "1" |
| `employee_id` | For faculty | "FAC001" |
| `designation` | For faculty | "Assistant Professor" |

\* = Required fields

### Fix Your Current CSV

**Option A: Use the Python Converter (Recommended)**

```bash
cd /Users/loki/Desktop/SMART_AMS_PROJECT

# 1. Convert your CSV to JSON
python3 csv_import_converter.py your_data.csv

# This creates: your_data.json

# 2. Validate the output
python3 csv_import_converter.py your_data.json --validate

# 3. Review the sample record shown
```

**Option B: Manual CSV Cleanup**

1. Open your CSV in Excel
2. Delete columns with titles (Mr., Ms., Dr., Prof.)
3. Create/rename columns to match the schema above
4. Save as UTF-8 CSV
5. Test with first 10 rows before importing all 2000

---

## 🔧 Step 2: Choose Import Method

### Method 1: From Command Line (Fastest for 2000 users)

```bash
# Install Python requests if not installed
pip install requests

# Run import
python3 << 'EOF'
import requests
import json

# Read your JSON file
with open('your_data.json', 'r') as f:
    data = json.load(f)

# Send to backend
url = "https://smartams-backend-ts3a5sewfq-uc.a.run.app/api/users/bulk-import"
response = requests.post(url, json=data, timeout=300)

result = response.json()

# Show results
print(f"✅ Created: {result['created']} users")
print(f"❌ Failed: {result['failed']} users")

if result.get('errors'):
    print(f"\n⚠️  First 10 Errors:")
    for err in result['errors'][:10]:
        print(f"  - {err['username']}: {err['error']}")

# Save errors to file
if result.get('errors'):
    with open('import_errors.json', 'w') as f:
        json.dump(result['errors'], f, indent=2)
    print(f"\n💾 All errors saved to: import_errors.json")
EOF
```

### Method 2: Using cURL

```bash
curl -X POST https://smartams-backend-ts3a5sewfq-uc.a.run.app/api/users/bulk-import \
  -H "Content-Type: application/json" \
  -d @your_data.json

# Output example:
# {"success":true,"created":1950,"failed":50,"errors":[...]}
```

### Method 3: Through SmartAMS Admin Panel (Coming Soon)

[Will add frontend bulk import UI]

---

## 📊 Step 3: Monitor Import

**During Import:**
- Wait for the API response (may take 30-60 seconds for 2000 users)
- Do NOT close the terminal

**After Import:**
- Check the results: How many created vs. failed?
- Review error list
- Fix failed records and re-import

---

## 🔍 Step 4: Fix Failures

**If you get "Invalid role" errors:**
- Add/fix the `role` column
- Use ONLY: "student", "faculty", or "admin"
- Re-convert and re-import

**If you get "Already exists" errors:**
- Some users are already in the database
- These are safe to ignore
- Count: `created + already_exists = total_attempts`

**If you get "Missing valid username" errors:**
- Ensure `full_name`, `email`, `roll_no`, or `employee_id` are provided
- At least ONE must be non-empty
- Fix in CSV and re-import

---

## 📝 Example: Convert and Import

```bash
cd /Users/loki/Desktop/SMART_AMS_PROJECT

# Step 1: Prepare your CSV file
# Make sure it has: full_name, email, role, department, and role-specific fields

# Step 2: Convert to JSON
python3 csv_import_converter.py users.csv users_ready.json

# You should see:
# ✅ Conversion complete!
# 📊 Converted 2000 users
# 💾 Output: users_ready.json

# Step 3: Validate
python3 csv_import_converter.py users_ready.json --validate

# You should see:
# ✅ Validation Report
# 📊 Total users: 2000
# 📋 By Role:
#    - student: 1500
#    - faculty: 500

# Step 4: Import
python3 << 'EOF'
import requests
import json

with open('users_ready.json', 'r') as f:
    data = json.load(f)

url = "https://smartams-backend-ts3a5sewfq-uc.a.run.app/api/users/bulk-import"
response = requests.post(url, json=data, timeout=300)
result = response.json()

print(f"✅ Created: {result['created']}")
print(f"❌ Failed: {result['failed']}")

# Save report
with open('import_report.json', 'w') as f:
    json.dump(result, f, indent=2)
print("📊 Full report saved to: import_report.json")
EOF
```

---

## 🎯 Sample CSV Formats

### For Students
```csv
full_name,email,role,department,program,section,roll_no,semester
"Arun Kumar","arun.kumar@puc.edu.in","student","Computer Science","B.Tech","A","CS001","1"
"Bhavana Singh","bhavana.singh@puc.edu.in","student","Computer Science","B.Tech","A","CS002","1"
"Chitra Desai","chitra.desai@puc.edu.in","student","Computer Science","B.Tech","B","CS003","2"
```

### For Faculty
```csv
full_name,email,role,department,designation,employee_id
"Dr. Rajesh Kumar","rajesh.kumar@puc.edu.in","faculty","Computer Science","Assistant Professor","FAC001"
"Prof. Anita Singh","anita.singh@puc.edu.in","faculty","Computer Science","HOD","FAC002"
```

### Mixed
```csv
full_name,email,role,department,roll_no,semester,employee_id,designation
"Arun Kumar","arun.kumar@puc.edu.in","student","CS","CS001","1","",""
"Dr. Rajesh","rajesh.kumar@puc.edu.in","faculty","CS","","","FAC001","Assistant Professor"
```

---

## ✅ Success Checklist

- [ ] Your CSV has headers: full_name, email, role, department
- [ ] Student rows have: roll_no, semester
- [ ] Faculty rows have: employee_id OR designation
- [ ] No duplicate usernames in file
- [ ] Role values are exactly: "student", "faculty", or "admin"
- [ ] Converted JSON using csv_import_converter.py
- [ ] Validation report shows no missing fields
- [ ] Ran import via Python/cURL
- [ ] Checked import_report.json for results
- [ ] Created users can now login with username@123 (default password)

---

## 🚨 Troubleshooting

### Problem: "No module named requests"
```bash
pip install requests
```

### Problem: All users fail with same error
Check `import_errors.json`:
```bash
cat import_errors.json | head -20
```

### Problem: Import times out
- Reduce batch size: Import in 500-user chunks
- Or wait longer (can take 60+ seconds for 2000)

### Problem: Need to reset and try again
```bash
# Backup failed records
cp import_errors.json import_errors_backup.json

# Fix your CSV and re-import
python3 csv_import_converter.py fixed_data.csv fixed_data.json
# Then run import again
```

---

## 📞 Need Help?

1. Check **BULK_IMPORT_GUIDE.md** for detailed field requirements
2. Review **sample_import_students.csv** for format example
3. Check **import_report.json** for specific error details
4. Run validation: `python3 csv_import_converter.py data.json --validate`

---

## 📈 Expected Results after fix

```json
{
  "success": true,
  "created": 1900-2000,
  "failed": 0-100,
  "errors": []  // or very few "already exists" errors
}
```

✨ **Once import is successful, all 2000 users can login with:**
- Username: their roll_no (for students) or auto-generated emp_id (for faculty)
- Password: `username@123` (default - should be changed on login)
