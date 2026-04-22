#!/bin/bash

# Bulk import script using curl
API_URL="https://smartams-backend-ts3a5sewfq-uc.a.run.app"
BATCH_SIZE=50

echo "🚀 SMART AMS BULK IMPORT SCRIPT"
echo "================================"
date

# Function to import CSV in batches
import_csv() {
    local csv_file=$1
    local endpoint=$2
    local data_type=$3
    local record_key=$4
    
    echo ""
    echo "📤 Importing $data_type from $csv_file"
    
    # Convert CSV to JSON batches and import
    python3 << PYTHON_EOF
import csv
import json
import subprocess
import time

csv_file = "$csv_file"
endpoint = "$endpoint"
api_url = "$API_URL"
batch_size = $BATCH_SIZE
record_key = "$record_key"

with open(csv_file, 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    records = list(reader)

print(f"   ✅ Loaded {len(records)} records")

total_success = 0
total_failed = 0
batches = (len(records) + batch_size - 1) // batch_size

for i in range(0, len(records), batch_size):
    batch_num = (i // batch_size) + 1
    batch = records[i:i+batch_size]
    
    payload = {record_key: batch}
    json_str = json.dumps(payload)
    
    print(f"   [{batch_num}/{batches}] Batch {i+1}-{min(i+batch_size, len(records))}...", end=" ", flush=True)
    
    try:
        result = subprocess.run(
            ['curl', '-s', '-X', 'POST', 
             f"{api_url}{endpoint}",
             '-H', 'Content-Type: application/json',
             '-d', json_str,
             '--max-time', '60'],
            capture_output=True,
            text=True,
            timeout=70
        )
        
        if result.returncode == 0:
            resp = json.loads(result.stdout)
            success = resp.get('created', resp.get('inserted', len(batch)))
            failed = resp.get('failed', 0)
            total_success += success
            total_failed += failed
            print(f"✅ +{success}")
        else:
            print(f"❌ Error")
            total_failed += len(batch)
    except Exception as e:
        print(f"❌ {str(e)[:30]}")
        total_failed += len(batch)
    
    time.sleep(0.3)

print(f"   Result: {total_success} success, {total_failed} failed")

PYTHON_EOF
}

# Import data
import_csv "students_1500.csv" "/api/users/bulk-import" "STUDENTS" "users"
sleep 2

import_csv "faculty_96.csv" "/api/users/bulk-import" "FACULTY" "users"
sleep 2

import_csv "timetable_2026.csv" "/api/timetable/bulk-import" "TIMETABLE" "slots"

echo ""
echo "✅ Bulk import complete!"
date
