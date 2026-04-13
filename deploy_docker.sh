#!/bin/bash
# =====================================================
# SmartAMS - DOCKER DEPLOYMENT (Cloud Run)
# =====================================================
# This script builds and deploys the application to Google Cloud Run

set -e

echo "🚀 SmartAMS - Docker/Cloud Run Deployment"
echo "=========================================="

# Configuration
PROJECT_ID=$(cat firebase.json | grep '"default"' | awk -F'"' '{print $4}')
SERVICE_NAME="smartams-backend"
REGION="us-central1"
IMAGE_NAME="gcr.io/$PROJECT_ID/$SERVICE_NAME"

echo "Project ID: $PROJECT_ID"
echo "Service: $SERVICE_NAME"
echo "Region: $REGION"
echo "Image: $IMAGE_NAME"
echo ""

# Check prerequisites
echo "🔍 Checking prerequisites..."

if ! command -v gcloud &> /dev/null; then
    echo "❌ gcloud CLI is not installed"
    echo "   Install from: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed"
    echo "   Install from: https://docs.docker.com/get-docker/"
    exit 1
fi

echo "✓ Prerequisites verified"
echo ""

# ─── Step 1: Authenticate with Google Cloud ───
echo "🔐 Google Cloud Authentication"
gcloud auth login
gcloud config set project $PROJECT_ID
echo ""

# ─── Step 2: Build Docker Image ───
echo "📦 Building Docker image..."
docker build -t $IMAGE_NAME:latest .
echo "   ✓ Image built: $IMAGE_NAME:latest"
echo ""

# ─── Step 3: Push to Container Registry ───
echo "📤 Pushing image to Google Container Registry..."
docker push $IMAGE_NAME:latest
echo "   ✓ Image pushed"
echo ""

# ─── Step 4: Deploy to Cloud Run ───
echo "🚀 Deploying to Cloud Run..."
gcloud run deploy $SERVICE_NAME \
  --image $IMAGE_NAME:latest \
  --region $REGION \
  --platform managed \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 2 \
  --timeout 3600 \
  --env-vars-file .env.production

echo ""
echo "════════════════════════════════════════════"
echo "✅ Deployment Complete!"
echo "════════════════════════════════════════════"
echo ""

# Get the service URL
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --region $REGION --format 'value(status.url)')
echo "📌 Service URL: $SERVICE_URL"
echo ""
echo "🧪 Test the deployment:"
echo "   $ curl $SERVICE_URL/api/health"
echo ""
echo "📝 Update api-config.js with new backend URL if needed:"
echo "   API_BACKEND_URL: $SERVICE_URL"
echo ""
