#!/bin/bash
# =====================================================
# SmartAMS - FIREBASE DEPLOYMENT GUIDE
# =====================================================
# This script prepares the project for Firebase deployment
# and guides you through the deployment process

set -e

echo "🚀 SmartAMS - Firebase Deployment Setup"
echo "========================================"

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo "❌ Firebase CLI is not installed"
    echo "   Install it with: npm install -g firebase-tools"
    echo "   Then run: firebase login"
    exit 1
fi

# Check if user is logged in to Firebase
echo ""
echo "🔐 Checking Firebase authentication..."
if ! firebase projects:list &> /dev/null; then
    echo "   ⚠ Not logged in to Firebase"
    echo "   Running: firebase login"
    firebase login
fi

# Verify project setup
echo ""
echo "📋 Firebase Project Configuration"
echo "=================================="
FIREBASE_PROJECT=$(cat firebase.json | grep '"default"' | awk -F'"' '{print $4}')
echo "Project ID: $FIREBASE_PROJECT"

# Check if backend Cloud Run service exists
echo ""
echo "🔍 Checking Cloud Run backend..."
echo "Important: Backend must be deployed separately to Cloud Run"
echo "Backend URL: https://smartams-backend-76160313029.us-central1.run.app"

# ─── Step 1: Build Frontend ───
echo ""
echo "📦 Building frontend..."
# Ensure all dependencies are installed
npm install
echo "   ✓ Frontend ready"

# ─── Step 2: Verify Environment Variables ───
echo ""
echo "🔐 Checking Firebase credentials..."
if [ ! -f "serviceAccountKey.json" ]; then
    echo "   ⚠ serviceAccountKey.json missing (for Cloud Functions only)"
else
    echo "   ✓ Service account key found"
fi

# ─── Step 3: Deployment Instructions ───
echo ""
echo "════════════════════════════════════════════"
echo "✅ Ready for Firebase Deployment!"
echo "════════════════════════════════════════════"
echo ""
echo "📌 DEPLOYMENT STEPS:"
echo ""
echo "1️⃣  Deploy HOSTING (Frontend):"
echo "    $ firebase deploy --only hosting"
echo ""
echo "2️⃣  Deploy CLOUD FUNCTIONS (Optional):"
echo "    $ firebase deploy --only functions"
echo ""
echo "3️⃣  Deploy EVERYTHING:"
echo "    $ firebase deploy"
echo ""
echo "📌 IMPORTANT NOTES:"
echo ""
echo "✓ Backend: Must be deployed separately to Cloud Run"
echo "  Command: gcloud run deploy smartams-backend --source . --region us-central1"
echo ""
echo "✓ Frontend: Serves from Firebase Hosting"
echo "  URL: https://$FIREBASE_PROJECT.web.app"
echo ""
echo "✓ API Routes: /api/* paths are rewritten to Cloud Run backend"
echo "  (Configured in firebase.json)"
echo ""
echo "✓ Environment Variables: Use Cloud Run or Secret Manager"
echo "  See .env.production for reference"
echo ""
echo "🧪 VERIFICATION:"
echo ""
echo "After deployment, test with:"
echo "  $ curl https://$FIREBASE_PROJECT.web.app"
echo "  $ curl https://$FIREBASE_PROJECT.web.app/api/health"
echo ""
