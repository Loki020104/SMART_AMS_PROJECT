#!/usr/bin/env python3
import csv
from datetime import datetime, timedelta

# Departments and programs
DEPARTMENTS = {
    'CSE': {'name': 'COMPUTER SCIENCE & ENGINEERING', 'abbr': 'CSE'},
    'AIM': {'name': 'ARTIFICIAL INTELLIGENCE & ML', 'abbr': 'AIM'},
    'ECE': {'name': 'ELECTRONICS & COMMUNICATION', 'abbr': 'ECE'},
    'EEE': {'name': 'ELECTRICAL & ELECTRONICS', 'abbr': 'EEE'},
    'IOT': {'name': 'INTERNET OF THINGS', 'abbr': 'IOT'},
    'BDA': {'name': 'BIG DATA ANALYTICS', 'abbr': 'BDA'},
    'ADS': {'name': 'ADVANCED DATA SCIENCE', 'abbr': 'ADS'},
    'CBS': {'name': 'CYBER SECURITY', 'abbr': 'CBS'},
}

# Courses for each department
COURSES = {
    'CSE': ['DATA STRUCTURES', 'DBMS', 'WEB DEVELOPMENT', 'ALGORITHMS', 'OOP CONCEPTS', 'NETWORKS'],
    'AIM': ['MACHINE LEARNING', 'DEEP LEARNING', 'NLP', 'COMPUTER VISION', 'AI ETHICS', 'DATA MINING'],
    'ECE': ['CIRCUIT THEORY', 'SIGNALS & SYSTEMS', 'DIGITAL ELECTRONICS', 'MICROPROCESSORS', 'SIGNAL PROCESSING', 'COMMUNICATIONS'],
    'EEE': ['POWER SYSTEMS', 'ELECTRICAL MACHINES', 'POWER ELECTRONICS', 'CONTROL SYSTEMS', 'HIGH VOLTAGE', 'GRID SYSTEMS'],
    'IOT': ['EMBEDDED SYSTEMS', 'WIRELESS PROTOCOLS', 'SENSOR NETWORKS', 'EDGE COMPUTING', 'IoT SECURITY', 'CLOUD INTEGRATION'],
    'BDA': ['BIG DATA HADOOP', 'SPARK ANALYTICS', 'DATA WAREHOUSING', 'ETL PROCESSES', 'STREAM PROCESSING', 'VISUALIZATION'],
    'ADS': ['STATISTICAL ANALYSIS', 'PREDICTIVE MODELING', 'TIME SERIES', 'BAYESIAN METHODS', 'DATA VISUALIZATION', 'ADVANCED SQL'],
    'CBS': ['CRYPTOGRAPHY', 'NETWORK SECURITY', 'MALWARE ANALYSIS', 'PENETRATION TESTING', 'INCIDENT RESPONSE', 'BLOCKCHAIN'],
}

# Time slots (2-hour labs straight)
TIME_SLOTS = [
    ('09:00', '11:00', 'LAB'),      # 2-hour lab
    ('11:00', '12:00', 'THEORY'),   # 1-hour theory
    ('12:00', '13:00', 'THEORY'),   # 1-hour theory
    ('14:00', '16:00', 'LAB'),      # 2-hour lab
    ('16:00', '17:00', 'THEORY'),   # 1-hour theory
]

DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY']

# Room assignments
LAB_ROOMS = ['LAB-1', 'LAB-2', 'LAB-3', 'LAB-4']
CLASS_ROOMS = ['ROOM-101', 'ROOM-102', 'ROOM-103', 'ROOM-104', 'ROOM-105', 'ROOM-201', 'ROOM-202', 'ROOM-203']

# Read faculty data to get actual names
faculty_data = {}
with open('faculty_96.csv', 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    for row in reader:
        dept_code = row['program']
        if dept_code not in faculty_data:
            faculty_data[dept_code] = []
        faculty_data[dept_code].append(row)

print("📅 Generating Timetable...")
timetable_data = []
slot_counter = 1

for dept_code in sorted(DEPARTMENTS.keys()):
    dept_name = DEPARTMENTS[dept_code]['name']
    courses = COURSES.get(dept_code, [])
    faculty_list = faculty_data.get(dept_code, [])
    
    for class_num in range(1, 4):  # 3 classes per department
        section = f"{dept_code}-{chr(64 + class_num)}"  # CSE-A, CSE-B, CSE-C
        
        for day_idx, day in enumerate(DAYS):
            for slot_idx, (start_time, end_time, slot_type) in enumerate(TIME_SLOTS):
                course = courses[slot_idx % len(courses)]
                faculty = faculty_list[slot_counter % len(faculty_list)] if faculty_list else None
                
                if slot_type == 'LAB':
                    room = LAB_ROOMS[slot_counter % len(LAB_ROOMS)]
                else:
                    room = CLASS_ROOMS[slot_counter % len(CLASS_ROOMS)]
                
                faculty_name = faculty['full_name'] if faculty else 'TBD'
                
                timetable_data.append({
                    'DEPARTMENT': dept_name,
                    'PROGRAM': dept_code,
                    'CLASS': section,
                    'SEMESTER': class_num,
                    'DAY': day,
                    'START_TIME': start_time,
                    'END_TIME': end_time,
                    'DURATION_HOURS': '2' if slot_type == 'LAB' else '1',
                    'SLOT_TYPE': slot_type,
                    'COURSE': course,
                    'FACULTY_NAME': faculty_name,
                    'FACULTY_ID': faculty['employee_id'] if faculty else 'N/A',
                    'ROOM': room,
                })
                
                slot_counter += 1

# Write Timetable CSV
with open('timetable_2026.csv', 'w', newline='', encoding='utf-8') as f:
    fieldnames = ['DEPARTMENT', 'PROGRAM', 'CLASS', 'SEMESTER', 'DAY', 'START_TIME', 'END_TIME', 
                  'DURATION_HOURS', 'SLOT_TYPE', 'COURSE', 'FACULTY_NAME', 'FACULTY_ID', 'ROOM']
    writer = csv.DictWriter(f, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(timetable_data)

print(f"✅ Created timetable_2026.csv with {len(timetable_data)} slots")

print(f"\n📅 Timetable Summary:")
print(f"   Total Slots: {len(timetable_data)}")
total_labs = sum(1 for t in timetable_data if t['SLOT_TYPE'] == 'LAB')
total_theory = sum(1 for t in timetable_data if t['SLOT_TYPE'] == 'THEORY')
print(f"   Lab Slots (2 hours each): {total_labs}")
print(f"   Theory Slots (1 hour each): {total_theory}")

print(f"\n📊 Sample Timetable:")
for i in range(10):
    if i < len(timetable_data):
        t = timetable_data[i]
        print(f"   {t['CLASS']} | {t['DAY']} {t['START_TIME']}-{t['END_TIME']} ({t['DURATION_HOURS']}h) | {t['COURSE']} | {t['FACULTY_NAME']} | {t['ROOM']}")
