#!/bin/bash

# Helpful Tools v2 - Quick Start Script
echo "🚀 Helpful Tools v2 - Quick Start"
echo "================================="

# Check if Python is available
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is required but not installed."
    echo "Please install Python 3 and try again."
    exit 1
fi

echo "✓ Python 3 found: $(python3 --version)"

# Make scripts executable
chmod +x start.py stop.py

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "📦 Creating virtual environment..."
    python3 -m venv venv
    echo "✓ Virtual environment created"
fi

# Activate virtual environment and install dependencies
echo "📋 Installing dependencies..."
source venv/bin/activate
pip install -q -r requirements.txt
echo "✓ Dependencies installed"

echo ""
echo "🎉 Setup complete!"
echo ""
echo "To start the server:"
echo "  python3 start.py"
echo ""
echo "To stop the server:"
echo "  python3 stop.py"
echo ""
echo "Server will be available at: http://127.0.0.1:8000"
echo ""