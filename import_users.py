#!/usr/bin/env python3
"""
SmartAMS Bulk User Import - Complete Workflow
Usage: python3 import_users.py your_data.csv
"""

import sys
import json
import requests
from pathlib import Path
from csv_import_converter import convert_csv_to_json, validate_json_users


def import_from_file(json_file, batch_size=None):
    """Import users from JSON file"""
    
    print(f"\n{'='*60}")
    print(f"📥 SMARTAMS BULK USER IMPORT")
    print(f"{'='*60}\n")
    
    # Load JSON
    try:
        with open(json_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception as e:
        print(f"❌ Error reading file: {e}")
        return False
    
    users = data.get('users', [])
    if not users:
        print("❌ No users found in JSON file")
        return False
    
    print(f"📊 Total users to import: {len(users)}")
    
    # Optionally batch
    if batch_size and batch_size > 0:
        batches = [users[i:i+batch_size] for i in range(0, len(users), batch_size)]
        print(f"📦 Processing in {len(batches)} batches of {batch_size} users each\n")
    else:
        batches = [users]
        batch_size = len(users)
    
    # Import
    all_results = {
        'success': True,
        'total_created': 0,
        'total_failed': 0,
        'all_errors': [],
        'batch_results': []
    }
    
    for batch_num, batch in enumerate(batches, 1):
        print(f"\n⏳ Batch {batch_num}/{len(batches)} ({len(batch)} users)...")
        
        try:
            url = "https://smartams-backend-ts3a5sewfq-uc.a.run.app/api/users/bulk-import"
            response = requests.post(
                url,
                json={'users': batch},
                timeout=300,
                headers={'Content-Type': 'application/json'}
            )
            
            if response.status_code != 200:
                print(f"   ❌ HTTP {response.status_code}: {response.text[:200]}")
                all_results['success'] = False
                continue
            
            result = response.json()
            created = result.get('created', 0)
            failed = result.get('failed', 0)
            errors = result.get('errors', [])
            
            print(f"   ✅ Created: {created}")
            print(f"   ⚠️  Failed: {failed}")
            
            all_results['total_created'] += created
            all_results['total_failed'] += failed
            all_results['all_errors'].extend(errors)
            all_results['batch_results'].append({
                'batch': batch_num,
                'created': created,
                'failed': failed,
                'errors': len(errors)
            })
            
        except requests.exceptions.Timeout:
            print(f"   ❌ Timeout! Backend may be cold-starting. Retrying...")
            # Retry once
            try:
                response = requests.post(
                    url,
                    json={'users': batch},
                    timeout=300,
                    headers={'Content-Type': 'application/json'}
                )
                result = response.json()
                all_results['total_created'] += result.get('created', 0)
                all_results['total_failed'] += result.get('failed', 0)
                all_results['all_errors'].extend(result.get('errors', []))
            except Exception as e2:
                print(f"   ❌ Retry failed: {e2}")
                all_results['success'] = False
        
        except Exception as e:
            print(f"   ❌ Error: {e}")
            all_results['success'] = False
    
    # Final report
    print(f"\n{'='*60}")
    print(f"📊 IMPORT COMPLETE")
    print(f"{'='*60}")
    print(f"✅ Total Created: {all_results['total_created']}")
    print(f"❌ Total Failed: {all_results['total_failed']}")
    print(f"📊 Success Rate: {(all_results['total_created']/(all_results['total_created']+all_results['total_failed'])*100):.1f}%" 
          if (all_results['total_created']+all_results['total_failed']) > 0 else "N/A")
    
    # Show first errors
    if all_results['all_errors']:
        print(f"\n⚠️  First 10 Errors:")
        for err in all_results['all_errors'][:10]:
            print(f"   {err['username']}: {err['error']}")
        
        if len(all_results['all_errors']) > 10:
            print(f"   ... and {len(all_results['all_errors']) - 10} more")
    
    # Save detailed report
    report_file = Path(json_file).stem + '_report.json'
    with open(report_file, 'w') as f:
        json.dump(all_results, f, indent=2)
    print(f"\n💾 Detailed report saved: {report_file}")
    
    return all_results['success']


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 import_users.py data.csv [--batch 500]")
        print("\nExample:")
        print("  # Convert and import directly")
        print("  python3 import_users.py users.csv")
        print("\n  # Import in batches of 500")
        print("  python3 import_users.py users.csv --batch 500")
        sys.exit(1)
    
    input_file = sys.argv[1]
    batch_size = None
    
    # Parse batch size
    if '--batch' in sys.argv:
        try:
            batch_size = int(sys.argv[sys.argv.index('--batch') + 1])
        except:
            batch_size = 500
    
    # Check file type
    if input_file.endswith('.csv'):
        print(f"\n📄 Converting CSV: {input_file}")
        json_file = Path(input_file).stem + '_converted.json'
        
        # Convert
        if not convert_csv_to_json(input_file, json_file):
            print("❌ Conversion failed")
            return False
        
        # Validate
        print(f"\n✅ Validating converted data...")
        validate_json_users(json_file)
        
        # Proceed to import
        input_file = json_file
    
    # Import from JSON
    return import_from_file(input_file, batch_size)


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
