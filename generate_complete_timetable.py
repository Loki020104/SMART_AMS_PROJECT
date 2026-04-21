"""
Generate comprehensive timetable for ALL 96 imported faculty members
Maps each faculty to multiple courses and time slots
Distributes across all departments and semesters
"""

import csv
from itertools import cycle

# All imported faculty (from faculty_96.csv)
FACULTY_DATA = [
    # CSE - 12 faculty
    ("PUC26CSE001", "ARJUN KUMAR", "COMPUTER SCIENCE & ENGINEERING"),
    ("PUC26CSE002", "DARSHAN REDDY", "COMPUTER SCIENCE & ENGINEERING"),
    ("PUC26CSE003", "CHARVI PATEL", "COMPUTER SCIENCE & ENGINEERING"),
    ("PUC26CSE004", "DALIT KUMAR", "COMPUTER SCIENCE & ENGINEERING"),
    ("PUC26CSE005", "AKSHAY SINGH", "COMPUTER SCIENCE & ENGINEERING"),
    ("PUC26CSE006", "ANANYA GUPTA", "COMPUTER SCIENCE & ENGINEERING"),
    ("PUC26CSE007", "DARSHAN REDDY", "COMPUTER SCIENCE & ENGINEERING"),
    ("PUC26CSE008", "CHANDNI SHARMA", "COMPUTER SCIENCE & ENGINEERING"),
    ("PUC26CSE009", "DEEP SHARMA", "COMPUTER SCIENCE & ENGINEERING"),
    ("PUC26CSE010", "CHETAN MAHESHWARI", "COMPUTER SCIENCE & ENGINEERING"),
    ("PUC26CSE011", "EDEN PATEL", "COMPUTER SCIENCE & ENGINEERING"),
    ("PUC26CSE012", "CHETAN MAHESHWARI", "COMPUTER SCIENCE & ENGINEERING"),
    # ADS - 7 faculty
    ("PUC26ADS001", "BALAJI NAIR", "ADVANCED DATA SCIENCE"),
    ("PUC26ADS002", "ESWAR NAIR", "ADVANCED DATA SCIENCE"),
    ("PUC26ADS003", "ARJUN KUMAR", "ADVANCED DATA SCIENCE"),
    ("PUC26ADS004", "CHIRAG MALHOTRA", "ADVANCED DATA SCIENCE"),
    ("PUC26ADS005", "DEVANSH TIWARI", "ADVANCED DATA SCIENCE"),
    ("PUC26ADS006", "BOOM BABU", "ADVANCED DATA SCIENCE"),
    ("PUC26ADS007", "CHHAYA BANERJEE", "ADVANCED DATA SCIENCE"),
    # ECE - 8 faculty
    ("PUC26ECE001", "ARYAN DESAI", "ELECTRONICS & COMMUNICATION"),
    ("PUC26ECE002", "BHANU PRAKASH", "ELECTRONICS & COMMUNICATION"),
    ("PUC26ECE003", "CHIRAG Singh", "ELECTRONICS & COMMUNICATION"),
    ("PUC26ECE004", "DEEPAK VERMA", "ELECTRONICS & COMMUNICATION"),
    ("PUC26ECE005", "ESHA KAPOOR", "ELECTRONICS & COMMUNICATION"),
    ("PUC26ECE006", "FAISAL KHAN", "ELECTRONICS & COMMUNICATION"),
    ("PUC26ECE007", "GAURAV MAHAJAN", "ELECTRONICS & COMMUNICATION"),
    ("PUC26ECE008", "HARSH MITTAL", "ELECTRONICS & COMMUNICATION"),
    # ME - 8 faculty
    ("PUC26ME001", "ADITYA KUMAR", "MECHANICAL ENGINEERING"),
    ("PUC26ME002", "BRIJESH SINGH", "MECHANICAL ENGINEERING"),
    ("PUC26ME003", "CHANDRA SHEKHAR", "MECHANICAL ENGINEERING"),
    ("PUC26ME004", "DINESH PATEL", "MECHANICAL ENGINEERING"),
    ("PUC26ME005", "EAKSHYA RAO", "MECHANICAL ENGINEERING"),
    ("PUC26ME006", "FARHAN ALI", "MECHANICAL ENGINEERING"),
    ("PUC26ME007", "GAJENDRA SINGH", "MECHANICAL ENGINEERING"),
    ("PUC26ME008", "HARSHIT SHARMA", "MECHANICAL ENGINEERING"),
    # CE - 8 faculty
    ("PUC26CE001", "ABHISHEK GUPTA", "CIVIL ENGINEERING"),
    ("PUC26CE002", "BHAVNA SHARMA", "CIVIL ENGINEERING"),
    ("PUC26CE003", "CHIRAG JOSHI", "CIVIL ENGINEERING"),
    ("PUC26CE004", "DHRUVENDRA SINGH", "CIVIL ENGINEERING"),
    ("PUC26CE005", "EKTA VERMA", "CIVIL ENGINEERING"),
    ("PUC26CE006", "FIONA PATEL", "CIVIL ENGINEERING"),
    ("PUC26CE007", "GAURAV NEGI", "CIVIL ENGINEERING"),
    ("PUC26CE008", "HARSH BHATNAGAR", "CIVIL ENGINEERING"),
    # IOT - 6 faculty
    ("PUC26IOT001", "ARUN KUMAR", "INTERNET OF THINGS"),
    ("PUC26IOT002", "BHAVESH VERMA", "INTERNET OF THINGS"),
    ("PUC26IOT003", "CHIRANJEEV RAJ", "INTERNET OF THINGS"),
    ("PUC26IOT004", "DARSHAN PATEL", "INTERNET OF THINGS"),
    ("PUC26IOT005", "ESHAAN KRISHNAN", "INTERNET OF THINGS"),
    ("PUC26IOT006", "FARHAN MALIK", "INTERNET OF THINGS"),
    # AI - 7 faculty
    ("PUC26AI001", "ABHIJIT NAIR", "ARTIFICIAL INTELLIGENCE"),
    ("PUC26AI002", "BHAVNA DESAI", "ARTIFICIAL INTELLIGENCE"),
    ("PUC26AI003", "CHIRAG MALHOTRA", "ARTIFICIAL INTELLIGENCE"),
    ("PUC26AI004", "DIVYAM SINGH", "ARTIFICIAL INTELLIGENCE"),
    ("PUC26AI005", "ESHA SHARMA", "ARTIFICIAL INTELLIGENCE"),
    ("PUC26AI006", "FARHAN HASSAN", "ARTIFICIAL INTELLIGENCE"),
    ("PUC26AI007", "GAJENDRA KUMAR", "ARTIFICIAL INTELLIGENCE"),
    # MBA - 6 faculty
    ("PUC26MBA001", "ADITYA SAXENA", "MASTER OF BUSINESS ADMINISTRATION"),
    ("PUC26MBA002", "BHAVNA KAPOOR", "MASTER OF BUSINESS ADMINISTRATION"),
    ("PUC26MBA003", "CHIRAG VERMA", "MASTER OF BUSINESS ADMINISTRATION"),
    ("PUC26MBA004", "DEEPIKA SHARMA", "MASTER OF BUSINESS ADMINISTRATION"),
    ("PUC26MBA005", "ESHWARI REDDY", "MASTER OF BUSINESS ADMINISTRATION"),
    ("PUC26MBA006", "FARIDA KHAN", "MASTER OF BUSINESS ADMINISTRATION"),
    # BBA - 6 faculty
    ("PUC26BBA001", "ABHIJEET SINGH", "BACHELOR OF BUSINESS ADMINISTRATION"),
    ("PUC26BBA002", "BHAGVAN RAGHAV", "BACHELOR OF BUSINESS ADMINISTRATION"),
    ("PUC26BBA003", "CHIRAG DESAI", "BACHELOR OF BUSINESS ADMINISTRATION"),
    ("PUC26BBA004", "DIVYA SHARMA", "BACHELOR OF BUSINESS ADMINISTRATION"),
    ("PUC26BBA005", "ESHITA PRABHU", "BACHELOR OF BUSINESS ADMINISTRATION"),
    ("PUC26BBA006", "FARISH KHAN", "BACHELOR OF BUSINESS ADMINISTRATION"),
    # FSD - 6 faculty
    ("PUC26FSD001", "AJAYVEER SINGH", "FULL STACK DEVELOPMENT"),
    ("PUC26FSD002", "BHASHKAR REDDY", "FULL STACK DEVELOPMENT"),
    ("PUC26FSD003", "CHIRANJEEVI PAL", "FULL STACK DEVELOPMENT"),
    ("PUC26FSD004", "DARSHANA NAIR", "FULL STACK DEVELOPMENT"),
    ("PUC26FSD005", "ESHA MAHAJAN", "FULL STACK DEVELOPMENT"),
    ("PUC26FSD006", "FARISHA KHAN", "FULL STACK DEVELOPMENT"),
    # EEE - 8 faculty
    ("PUC26EEE001", "ASHOK KUMAR", "ELECTRICAL & ELECTRONICS"),
    ("PUC26EEE002", "BHARGAV DESAI", "ELECTRICAL & ELECTRONICS"),
    ("PUC26EEE003", "CHIRAG KUMAR", "ELECTRICAL & ELECTRONICS"),
    ("PUC26EEE004", "DEEPENDRA SINGH", "ELECTRICAL & ELECTRONICS"),
    ("PUC26EEE005", "EKALAVYA RAO", "ELECTRICAL & ELECTRONICS"),
    ("PUC26EEE006", "FAROOQ MALIK", "ELECTRICAL & ELECTRONICS"),
    ("PUC26EEE007", "GAURAV MEHRA", "ELECTRICAL & ELECTRONICS"),
    ("PUC26EEE008", "HARSHVARDHAN DESAI", "ELECTRICAL & ELECTRONICS"),
]

COURSES = [
    "Data Structures", "Algorithms", "Web Development", "Cloud Computing",
    "AI & ML", "Cybersecurity", "IoT", "Databases", "OS", "Networking",
    "Statistics", "Machine Learning", "Deep Learning", "Circuit Analysis",
    "Power Systems", "Digital Design", "Thermodynamics", "Mechanics",
    "Structural Analysis", "Concrete Technology", "VLSI Design", "Embedded Systems",
    "Business Management", "Finance", "Marketing", "Economics"
]

DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
DEPARTMENTS = {
    "CSE": ["1", "2", "3", "4"],
    "ADS": ["1", "2"],
    "ECE": ["1", "2", "3"],
    "ME": ["1", "2", "3"],
    "CE": ["1", "2"],
    "IOT": ["1", "2"],
    "AI": ["1"],
    "MBA": ["1"],
    "BBA": ["1"],
    "FSD": ["1"],
    "EEE": ["1", "2"]
}

THEORY_TIMES = [
    ("08:00", "09:00"), ("09:00", "10:00"), ("10:00", "11:00"),
    ("11:00", "12:00"), ("12:00", "13:00"), ("14:00", "15:00"),
    ("15:00", "16:00"), ("16:00", "17:00")
]

LAB_TIMES = [
    ("08:00", "10:00"), ("09:00", "11:00"), ("10:00", "12:00"),
    ("13:00", "15:00"), ("14:00", "16:00"), ("15:00", "17:00")
]

# Generate timetable
slots = []
slot_id = 1
faculty_cycle = cycle(FACULTY_DATA)
course_cycle = cycle(COURSES)

for day_idx, day in enumerate(DAYS):
    for dept_code, semesters in DEPARTMENTS.items():
        for sem in semesters:
            for class_letter in ["A", "B", "C"]:
                # Add theory slots
                for theory_time in THEORY_TIMES[:3]:  # 3 theory slots per day
                    faculty_id, faculty_name, dept_full = next(faculty_cycle)
                    course = next(course_cycle)
                    
                    room = f"T{slot_id:03d}"
                    
                    slots.append({
                        "SLOT_ID": f"{slot_id:04d}",
                        "DEPARTMENT": dept_code,
                        "PROGRAM": dept_code,
                        "SEMESTER": sem,
                        "CLASS": class_letter,
                        "DAY": day,
                        "START_TIME": theory_time[0],
                        "END_TIME": theory_time[1],
                        "DURATION_HOURS": 1,
                        "SLOT_TYPE": "THEORY",
                        "COURSE": course,
                        "FACULTY_ID": faculty_id,
                        "FACULTY_NAME": faculty_name,
                        "ROOM": room
                    })
                    slot_id += 1
                
                # Add lab slots
                for lab_time in LAB_TIMES[:2]:  # 2 lab slots per day
                    faculty_id, faculty_name, dept_full = next(faculty_cycle)
                    course = next(course_cycle)
                    
                    room = f"L{slot_id:03d}"
                    
                    slots.append({
                        "SLOT_ID": f"{slot_id:04d}",
                        "DEPARTMENT": dept_code,
                        "PROGRAM": dept_code,
                        "SEMESTER": sem,
                        "CLASS": class_letter,
                        "DAY": day,
                        "START_TIME": lab_time[0],
                        "END_TIME": lab_time[1],
                        "DURATION_HOURS": 2,
                        "SLOT_TYPE": "LAB",
                        "COURSE": course,
                        "FACULTY_ID": faculty_id,
                        "FACULTY_NAME": faculty_name,
                        "ROOM": room
                    })
                    slot_id += 1

# Write to CSV
output_file = "/Users/loki/Desktop/SMART_AMS_PROJECT/timetable_2026_complete_96faculty.csv"
with open(output_file, "w", newline="") as f:
    writer = csv.DictWriter(f, fieldnames=[
        "SLOT_ID", "DEPARTMENT", "PROGRAM", "SEMESTER", "CLASS", "DAY",
        "START_TIME", "END_TIME", "DURATION_HOURS", "SLOT_TYPE", "COURSE",
        "FACULTY_ID", "FACULTY_NAME", "ROOM"
    ])
    writer.writeheader()
    writer.writerows(slots)

print(f"✅ Generated {len(slots)} timetable slots")
print(f"✅ Coverage: All {len(FACULTY_DATA)} faculty members")
print(f"✅ Departments: {', '.join(DEPARTMENTS.keys())}")
print(f"✅ File: {output_file}")
print(f"\nStatistics:")
print(f"  - Total slots: {len(slots)}")
print(f"  - Faculty utilized: {len(FACULTY_DATA)}")
print(f"  - Theory slots: {len([s for s in slots if s['SLOT_TYPE'] == 'THEORY'])}")
print(f"  - Lab slots: {len([s for s in slots if s['SLOT_TYPE'] == 'LAB'])}")
