#!/usr/bin/env python3
"""
Main entry point for the Helpful Tools v2 application.
This file serves as the application launcher that imports and runs the Flask app from the src directory.
"""

import sys
import os
import argparse
from pathlib import Path

# Add the src directory to the Python path so we can import from it
project_root = Path(__file__).parent
src_path = project_root / "src"
sys.path.insert(0, str(src_path))

# Now we can import the main Flask application
from main import app

def write_port_file(port):
    """Write the port number to .port file for other processes to read."""
    port_file = project_root / ".port"
    with open(port_file, 'w') as f:
        f.write(str(port))
    print(f"📝 Port {port} written to {port_file}")

def cleanup_port_file():
    """Remove the .port file on shutdown."""
    port_file = project_root / ".port"
    if port_file.exists():
        port_file.unlink()
        print("🗑️  Port file cleaned up")

if __name__ == '__main__':
    # Parse command line arguments
    parser = argparse.ArgumentParser(description='Helpful Tools v2 Server')
    parser.add_argument('--port', '-p', type=int, default=8000,
                       help='Port to run the server on (default: 8000)')
    parser.add_argument('--host', default='127.0.0.1',
                       help='Host to bind to (default: 127.0.0.1)')
    args = parser.parse_args()

    # Change working directory to project root to ensure relative paths work correctly
    os.chdir(project_root)

    # Write port to file for tests and other processes
    write_port_file(args.port)

    try:
        print(f"🚀 Starting Helpful Tools v2 on http://{args.host}:{args.port}")
        # Run the Flask application
        app.run(host=args.host, port=args.port, debug=True)
    except KeyboardInterrupt:
        print("\n⏹️  Server stopped by user")
    finally:
        cleanup_port_file()