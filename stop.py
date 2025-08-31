#!/usr/bin/env python3
import os
import signal
from pathlib import Path

def stop_server():
    pid_file = Path("helpful-tools-v2.pid")
    
    if not pid_file.exists():
        print("❌ Server is not running (no PID file found)")
        return
    
    try:
        with open(pid_file, "r") as f:
            pid = int(f.read().strip())
        
        # Send termination signal
        os.kill(pid, signal.SIGTERM)
        print(f"⏹️  Server stopped (PID: {pid})")
        
        # Clean up PID file
        pid_file.unlink()
        
    except ProcessLookupError:
        print("❌ Server process not found")
        pid_file.unlink()  # Clean up stale PID file
    except Exception as e:
        print(f"❌ Error stopping server: {e}")

if __name__ == "__main__":
    stop_server()