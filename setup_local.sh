#!/bin/bash
# ============================================
# SmartAMS - LOCAL DEVELOPMENT SETUP & RUN
# ============================================
# This script sets up the local development environment
# and starts both the Node.js frontend server and Python Flask backend

set -e  # Exit on any error

echo "🚀 SmartAMS - Local Development Setup"
echo "======================================"

# Check if .env.local exists
if [ ! -f ".env.local" ]; then
    echo "❌ Error: .env.local not found"
    echo "   Please create .env.local from .env.local.example"
    exit 1
fi

# Load local environment variables
export $(cat .env.local | grep -v '^#' | xargs)

echo "📋 Environment: $NODE_ENV"
echo "🔧 Port: $PORT"
echo "🐍 Flask Port: $FLASK_PORT"

# ─── Step 1: Install Node.js Dependencies ───
echo ""
echo "📦 Installing Node.js dependencies..."
if [ ! -d "node_modules" ]; then
    npm install
else
    echo "   ✓ node_modules already exists"
fi

# ─── Step 2: Check Python Environment ───
echo ""
echo "🔍 Checking Python environment..."

# Try to activate virtual environment
if [ -d "venv" ]; then
    source venv/bin/activate
    echo "   ✓ Using virtual environment: venv"
elif [ -d ".venv" ]; then
    source .venv/bin/activate
    echo "   ✓ Using virtual environment: .venv"
elif [ -d ".venv311" ]; then
    source .venv311/bin/activate
    echo "   ✓ Using virtual environment: .venv311"
else
    echo "   ⚠ Warning: No virtual environment found"
    echo "   Creating virtual environment..."
    python3 -m venv venv
    source venv/bin/activate
    pip install --upgrade pip
fi

# ─── Step 3: Install Python Dependencies ───
echo ""
echo "📦 Installing Python dependencies..."
pip install -q -r backend/requirements.txt
echo "   ✓ Python dependencies installed"

# ─── Step 4: Display Startup Information ───
echo ""
echo "════════════════════════════════════════"
echo "✅ Setup Complete!"
echo "════════════════════════════════════════"
echo ""
echo "📌 To start the application, run BOTH of these in separate terminals:"
echo ""
echo "   Terminal 1 (Node.js frontend server):"
echo "   $ npm run dev:local"
echo ""
echo "   Terminal 2 (Python Flask backend):"
echo "   $ cd backend && python backend.py"
echo ""
echo "🌐 Access the application at:"
echo "   • Frontend: http://localhost:3000"
echo "   • Backend API: http://localhost:6001/api/*"
echo ""
echo "🧪 To test the connection:"
echo "   $ curl http://localhost:3000"
echo "   $ curl http://localhost:6001/api/health"
echo ""
