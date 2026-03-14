#!/bin/bash
export PYTHONDONTWRITEBYTECODE=1
cd /Users/loki/Desktop/SMART_AMS_PROJECT
# Kill any existing process
pkill -9 -f "python3 backend/backend.py" 2>/dev/null || true
sleep 1
# Start fresh
python3 backend/backend.py 2>&1 | tee /tmp/backend.log
