#!/usr/bin/env python3
"""
Main entry point for the Helpful Tools v2 application.
This file serves as the application launcher that imports and runs the Flask app from the src directory.
"""

import sys
import os
from pathlib import Path

# Add the src directory to the Python path so we can import from it
project_root = Path(__file__).parent
src_path = project_root / "src"
sys.path.insert(0, str(src_path))

# Now we can import the main Flask application
from main import app

if __name__ == '__main__':
    # Change working directory to project root to ensure relative paths work correctly
    os.chdir(project_root)
    
    # Run the Flask application
    app.run(host='127.0.0.1', port=8000, debug=True)