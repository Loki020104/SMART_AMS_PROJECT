#!/usr/bin/env python3
"""
Test the bulk import endpoint with sample data
"""

import requests
import json
import sys

def test_bulk_import():
    """Test with sample data"""
    
    url = "https://smartams-backend-ts3a5sewfq-uc.a.run.app/api/users/bulk-import"
    
    # Sample test data
    test_data = {
        "users": [
            {
                "full_name": "Test Student One",
                "email": "test.student.one@puc.edu.in",
                "role": "student",
                "department": "Computer Science",
                "program": "B.Tech",
                "roll_no": "TEST001",
                "semester": "1"
            },
            {
                "full_name": "Test Faculty One",
                "email": "test.faculty.one@puc.edu.in",
                "role": "faculty",
                "department": "Computer Science",
                "designation": "Assistant Professor"
            },
            {
                "full_name": "",  # Will fail - missing name
                "email": "test.invalid@puc.edu.in",
                "role": "student",
                "department": "CS"
            }
        ]
    }
    
    print("Testing bulk import endpoint...")
    print(f"URL: {url}\n")
    
    try:
        response = requests.post(url, json=test_data, timeout=30)
        result = response.json()
        
        print(f"✅ Response Status: {response.status_code}")
        print(f"📊 Created: {result.get('created', 0)}")
        print(f"❌ Failed: {result.get('failed', 0)}")
        
        if result.get('errors'):
            print(f"\n⚠️  Errors ({len(result['errors'])} total):")
            for err in result['errors']:
                print(f"   - {err['username']}: {err['error']}")
        
        print(f"\n✅ Endpoint is working correctly!")
        return True
        
    except requests.exceptions.Timeout:
        print("❌ Request timed out. Backend may be cold-starting.")
        return False
    except requests.exceptions.ConnectionError:
        print("❌ Connection error. Check if backend is running.")
        return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False


if __name__ == "__main__":
    success = test_bulk_import()
    sys.exit(0 if success else 1)
