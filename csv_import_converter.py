#!/usr/bin/env python3
"""
CSV Import Converter - Fix and validate bulk import CSV files for SmartAMS

Usage:
    python csv_import_converter.py input.csv output.json
"""

import csv
import json
import sys
import re
from pathlib import Path


def clean_text(text):
    """Remove titles and clean text"""
    if not text:
        return ""
    text = text.strip()
    # Remove common title prefixes
    titles = ["Dr.", "Mr.", "Mrs.", "Ms.", "Prof.", "Dr", "Mr", "Mrs", "Ms", "Prof"]
    for title in titles:
        if text.startswith(title):
            text = text[len(title):].strip()
    return text


def extract_email(text):
    """Extract email from text"""
    if not text:
        return ""
    match = re.search(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', str(text))
    return match.group(0) if match else ""


def extract_username_from_email(email):
    """Get username part from email"""
    if "@" in email:
        return email.split("@")[0]
    return ""


def convert_csv_to_json(input_file, output_file=None):
    """
    Convert CSV to JSON format suitable for bulk import
    
    Detects CSV structure and maps columns intelligently
    """
    
    if output_file is None:
        output_file = Path(input_file).stem + ".json"
    
    # Read CSV
    users = []
    with open(input_file, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        if not reader.fieldnames:
            print("❌ Error: CSV file is empty or malformed")
            return False
        
        print(f"📖 Detected columns: {', '.join(reader.fieldnames)}")
        
        for idx, row in enumerate(reader, 1):
            # Clean and extract values
            user = {}
            
            # Try to find full_name
            for col in ['full_name', 'name', 'employee_name', 'faculty_name', 'student_name']:
                if col in row and row[col]:
                    user['full_name'] = clean_text(row[col])
                    break
            
            # Try to find email
            for col in ['email', 'email_id', 'email_address', 'mail', 'e_mail']:
                if col in row and row[col]:
                    email = row[col].strip()
                    if "@" in email:
                        user['email'] = email
                        break
            
            # Try to find role
            for col in ['role', 'user_role', 'account_type', 'type']:
                if col in row and row[col]:
                    user['role'] = row[col].strip().lower()
                    break
            
            # Try to find department
            for col in ['department', 'dept', 'faculty_department', 'deptartment']:
                if col in row and row[col]:
                    user['department'] = row[col].strip()
                    break
            
            # Try to find roll_no (students)
            for col in ['roll_no', 'roll_number', 'student_id', 'reg_no', 'enrollment_id']:
                if col in row and row[col]:
                    val = row[col].strip()
                    if val:
                        user['roll_no'] = val
                        break
            
            # Try to find employee_id (faculty)
            for col in ['employee_id', 'emp_id', 'faculty_id', 'empid']:
                if col in row and row[col]:
                    val = row[col].strip()
                    if val:
                        user['employee_id'] = val
                        break
            
            # Try to find semester
            for col in ['semester', 'sem', 'year', 'level']:
                if col in row and row[col]:
                    try:
                        user['semester'] = str(int(row[col]))
                        break
                    except:
                        pass
            
            # Try to find program
            for col in ['program', 'course', 'degree', 'program_name', 'degree_name']:
                if col in row and row[col]:
                    user['program'] = row[col].strip()
                    break
            
            # Try to find section
            for col in ['section', 'batch', 'class', 'division', 'group']:
                if col in row and row[col]:
                    user['section'] = row[col].strip()
                    break
            
            # Try to find designation
            for col in ['designation', 'position', 'title_role', 'job_title', 'title']:
                if col in row and row[col]:
                    user['designation'] = row[col].strip()
                    break
            
            # Try to find subjects
            for col in ['subjects', 'courses', 'papers', 'specialization']:
                if col in row and row[col]:
                    user['subjects'] = row[col].strip()
                    break
            
            # Auto-detect role if not provided
            if 'role' not in user:
                if 'employee_id' in user or 'designation' in user:
                    user['role'] = 'faculty'
                elif 'roll_no' in user or 'semester' in user:
                    user['role'] = 'student'
                else:
                    user['role'] = 'student'  # default
            
            # Validate required fields
            errors = []
            if not user.get('full_name'):
                errors.append("Missing full_name")
            if not user.get('email'):
                errors.append("Missing email")
            if not user.get('department'):
                errors.append("Missing department")
            
            if errors:
                print(f"⚠️  Row {idx} - Skipping: {', '.join(errors)}")
                continue
            
            users.append(user)
    
    # Write JSON
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump({"users": users}, f, indent=2, ensure_ascii=False)
    
    print(f"\n✅ Conversion complete!")
    print(f"📊 Converted {len(users)} users")
    print(f"💾 Output: {output_file}")
    
    # Show sample
    if users:
        print(f"\n📦 Sample record:")
        print(json.dumps(users[0], indent=2))
    
    return True


def validate_json_users(json_file):
    """Validate JSON file before import"""
    with open(json_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    users = data.get('users', [])
    print(f"\n✅ Validation Report")
    print(f"📊 Total users: {len(users)}")
    
    by_role = {}
    missing_fields = {'full_name': 0, 'email': 0, 'department': 0, 'role': 0}
    
    for idx, user in enumerate(users):
        role = user.get('role', 'unknown')
        by_role[role] = by_role.get(role, 0) + 1
        
        for field in missing_fields:
            if not user.get(field):
                missing_fields[field] += 1
    
    print(f"📋 By Role:")
    for role, count in by_role.items():
        print(f"   - {role}: {count}")
    
    print(f"⚠️  Missing Fields:")
    for field, count in missing_fields.items():
        if count > 0:
            print(f"   - {field}: {count} records missing")
    
    return len(users) > 0 and all(v == 0 for v in missing_fields.values())


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python csv_import_converter.py input.csv [output.json]")
        print("\nExamples:")
        print("  python csv_import_converter.py users.csv")
        print("  python csv_import_converter.py users.csv users-ready.json")
        print("  python csv_import_converter.py users.csv && python csv_import_converter.py users.json --validate")
        sys.exit(1)
    
    input_file = sys.argv[1]
    output_file = sys.argv[2] if len(sys.argv) > 2 else None
    
    # Determine action based on file type
    if input_file.endswith('.json') and '--validate' in sys.argv:
        validate_json_users(input_file)
    elif input_file.endswith('.csv'):
        convert_csv_to_json(input_file, output_file)
    else:
        print(f"❌ Unknown file type: {input_file}")
        sys.exit(1)
