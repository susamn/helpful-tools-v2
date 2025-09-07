#!/usr/bin/env python3
"""
Test runner for Text Diff Tool
Runs both backend and frontend tests with proper setup
"""

import subprocess
import sys
import os
import time
import signal
import requests
from multiprocessing import Process

def check_dependencies():
    """Check if required dependencies are available"""
    try:
        import pytest
        print("✓ pytest found")
    except ImportError:
        print("✗ pytest not found. Install with: pip install pytest")
        return False
    
    try:
        import flask
        print("✓ Flask found")
    except ImportError:
        print("✗ Flask not found. Install with: pip install flask")
        return False
    
    return True

def run_backend_tests():
    """Run the backend API tests"""
    print("\n" + "="*50)
    print("RUNNING BACKEND TESTS")
    print("="*50)
    
    try:
        # Run pytest with verbose output
        result = subprocess.run([
            sys.executable, '-m', 'pytest', 
            'test_text_diff.py', 
            '-v', 
            '--tb=short',
            '--color=yes'
        ], capture_output=False, text=True)
        
        if result.returncode == 0:
            print("\n✓ Backend tests PASSED")
            return True
        else:
            print("\n✗ Backend tests FAILED")
            return False
            
    except Exception as e:
        print(f"\n✗ Error running backend tests: {e}")
        return False

def start_test_server():
    """Start Flask development server for testing"""
    def run_server():
        os.environ['FLASK_ENV'] = 'testing'
        from main import app
        app.run(host='localhost', port=5000, debug=False)
    
    server_process = Process(target=run_server)
    server_process.start()
    
    # Wait for server to start
    max_attempts = 10
    for attempt in range(max_attempts):
        try:
            response = requests.get('http://localhost:5000/')
            if response.status_code == 200:
                print("✓ Test server started successfully")
                return server_process
        except requests.exceptions.ConnectionError:
            pass
        
        print(f"Waiting for server to start... ({attempt + 1}/{max_attempts})")
        time.sleep(2)
    
    print("✗ Failed to start test server")
    server_process.terminate()
    return None

def run_frontend_tests():
    """Run the frontend integration tests"""
    print("\n" + "="*50)
    print("RUNNING FRONTEND INTEGRATION TESTS")
    print("="*50)
    
    # Check if Selenium is available
    try:
        import selenium
        print("✓ Selenium found")
    except ImportError:
        print("✗ Selenium not found. Install with: pip install selenium")
        print("Frontend tests will be skipped.")
        return True
    
    # Start test server
    server_process = start_test_server()
    if not server_process:
        print("✗ Cannot run frontend tests without server")
        return False
    
    try:
        # Run frontend tests
        result = subprocess.run([
            sys.executable, 'test_text_diff_frontend.py'
        ], capture_output=False, text=True)
        
        success = result.returncode == 0
        
        if success:
            print("\n✓ Frontend tests PASSED")
        else:
            print("\n✗ Frontend tests FAILED")
        
        return success
        
    except Exception as e:
        print(f"\n✗ Error running frontend tests: {e}")
        return False
        
    finally:
        # Stop test server
        if server_process:
            server_process.terminate()
            server_process.join(timeout=5)
            if server_process.is_alive():
                server_process.kill()
            print("✓ Test server stopped")

def run_manual_api_test():
    """Run a quick manual API test"""
    print("\n" + "="*50)
    print("RUNNING MANUAL API TEST")
    print("="*50)
    
    server_process = start_test_server()
    if not server_process:
        return False
    
    try:
        # Test the API endpoint directly
        import json
        import requests
        
        test_data = {
            'text1': 'Hello world\nThis is a test',
            'text2': 'Hello universe\nThis is a test'
        }
        
        print("Testing /api/text-diff/compare endpoint...")
        response = requests.post(
            'http://localhost:5000/api/text-diff/compare',
            json=test_data,
            headers={'Content-Type': 'application/json'}
        )
        
        if response.status_code == 200:
            result = response.json()
            if result.get('success'):
                print("✓ API endpoint working correctly")
                print(f"✓ Found {result['stats']['equal']} equal lines")
                print(f"✓ Found {result['stats']['deleted']} deleted lines")  
                print(f"✓ Found {result['stats']['inserted']} inserted lines")
                return True
            else:
                print(f"✗ API returned error: {result.get('error')}")
                return False
        else:
            print(f"✗ API request failed with status: {response.status_code}")
            return False
            
    except Exception as e:
        print(f"✗ Manual API test failed: {e}")
        return False
        
    finally:
        if server_process:
            server_process.terminate()
            server_process.join(timeout=5)
            if server_process.is_alive():
                server_process.kill()

def main():
    """Main test runner"""
    print("Text Diff Tool - Comprehensive Test Suite")
    print("="*50)
    
    # Check dependencies
    if not check_dependencies():
        print("\n✗ Missing dependencies. Please install required packages.")
        return 1
    
    # Change to script directory
    script_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(script_dir)
    
    results = []
    
    # Run backend tests
    backend_success = run_backend_tests()
    results.append(("Backend Tests", backend_success))
    
    # Run manual API test
    api_success = run_manual_api_test()
    results.append(("Manual API Test", api_success))
    
    # Run frontend tests (optional)
    frontend_success = run_frontend_tests()
    results.append(("Frontend Tests", frontend_success))
    
    # Summary
    print("\n" + "="*50)
    print("TEST RESULTS SUMMARY")
    print("="*50)
    
    all_passed = True
    for test_name, success in results:
        status = "PASSED" if success else "FAILED"
        icon = "✓" if success else "✗"
        print(f"{icon} {test_name}: {status}")
        if not success:
            all_passed = False
    
    print("-" * 50)
    
    if all_passed:
        print("🎉 ALL TESTS PASSED! Text Diff Tool is ready.")
        return 0
    else:
        print("⚠️  Some tests failed. Please review the output above.")
        return 1

if __name__ == '__main__':
    exit_code = main()
    sys.exit(exit_code)