#!/usr/bin/env python3
import sys
import subprocess
import os
from pathlib import Path

def setup_venv():
    # Get project root directory (two levels up from this script)
    project_root = Path(__file__).parent.parent.parent
    os.chdir(project_root)
    venv_path = project_root / "venv"
    
    if not venv_path.exists():
        print("Creating virtual environment...")
        subprocess.run([sys.executable, "-m", "venv", "venv"], check=True)
        print("✓ Virtual environment created")
    
    # Get pip path
    if os.name == 'nt':  # Windows
        pip_path = venv_path / "Scripts" / "pip.exe"
        python_path = venv_path / "Scripts" / "python.exe"
    else:  # Unix/Linux/macOS
        pip_path = venv_path / "bin" / "pip"
        python_path = venv_path / "bin" / "python"
    
    # Install requirements
    if Path("requirements.txt").exists():
        print("Installing requirements...")
        subprocess.run([str(pip_path), "install", "-r", "requirements.txt"], check=True)
        print("✓ Requirements installed")
    
    return python_path

def start_server():
    print("Setting up Helpful Tools v2...")
    
    try:
        python_path = setup_venv()
        
        # Create PID file
        with open("helpful-tools-v2.pid", "w") as f:
            f.write(str(os.getpid()))
        
        print("\n" + "="*50)
        print("🚀 Starting Helpful Tools v2")
        print("📍 Server: http://127.0.0.1:8000")
        print("📋 Dashboard ready with minimal setup")
        print("="*50 + "\n")
        
        # Start the Flask app
        subprocess.run([str(python_path), "app.py"])
        
    except KeyboardInterrupt:
        print("\n⏹️  Server stopped by user")
    except Exception as e:
        print(f"❌ Error: {e}")
    finally:
        # Clean up PID file
        if Path("helpful-tools-v2.pid").exists():
            Path("helpful-tools-v2.pid").unlink()

if __name__ == "__main__":
    start_server()