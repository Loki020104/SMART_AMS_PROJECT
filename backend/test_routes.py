#!/usr/bin/env python3
import sys
import os

os.environ['FIREBASE_PROJECT_ID'] = 'smart-ams-project-faa5f'

print('[TEST] Starting route registration test...', file=sys.stderr)

# Create Flask app
from flask import Flask
app = Flask(__name__)

sb = None  # Mock Supabase

print('[TEST] Flask app created', file=sys.stderr)

# Initialize modules
try:
    from config_manager import ConfigManager
    config = ConfigManager()
    print('[CONFIG] ✓ ConfigManager initialized', file=sys.stderr)
except Exception as e:
    print(f'[CONFIG] ✗ Failed: {e}', file=sys.stderr)
    sys.exit(1)

# Register analytics module
try:
    from analytics_apis import setup_analytics_apis
    setup_analytics_apis(app, sb, config)
    print('[ANALYTICS] ✓ setup_analytics_apis() called', file=sys.stderr)
except Exception as e:
    print(f'[ANALYTICS] ✗ Failed: {e}', file=sys.stderr)

# Count routes
all_routes = list(app.url_map.iter_rules())
analytics_routes = [str(rule) for rule in all_routes if 'analytics' in str(rule).lower()]

print(f'[TEST] Total routes: {len(all_routes)}', file=sys.stderr)
print(f'[TEST] Analytics routes found: {len(analytics_routes)}', file=sys.stderr)

if analytics_routes:
    print('[TEST] ✓ SUCCESS - Analytics routes registered!', file=sys.stderr)
    for route in sorted(analytics_routes)[:10]:
        print(f'  {route}', file=sys.stderr)
else:
    print('[TEST] ✗ FAIL - No analytics routes found!', file=sys.stderr)
    print(f'[TEST] All routes: {all_routes}', file=sys.stderr)
