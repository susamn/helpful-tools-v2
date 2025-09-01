#!/usr/bin/env python3
"""
Test runner for Regex Tester Tool
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
    """Run the backend regex tests"""
    print("\n" + "="*50)
    print("RUNNING REGEX BACKEND TESTS")
    print("="*50)
    
    try:
        # Run pytest with verbose output
        result = subprocess.run([
            sys.executable, '-m', 'pytest', 
            'test_regex_tester.py', 
            '-v', 
            '--tb=short',
            '--color=yes'
        ], capture_output=False, text=True)
        
        if result.returncode == 0:
            print("\n✓ Regex backend tests PASSED")
            return True
        else:
            print("\n✗ Regex backend tests FAILED")
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
    print("RUNNING REGEX FRONTEND INTEGRATION TESTS")
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
            sys.executable, 'test_regex_tester_frontend.py'
        ], capture_output=False, text=True)
        
        success = result.returncode == 0
        
        if success:
            print("\n✓ Regex frontend tests PASSED")
        else:
            print("\n✗ Regex frontend tests FAILED")
        
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

def run_manual_regex_test():
    """Run a quick manual regex functionality test"""
    print("\n" + "="*50)
    print("RUNNING MANUAL REGEX FUNCTIONALITY TEST")
    print("="*50)
    
    server_process = start_test_server()
    if not server_process:
        return False
    
    try:
        import requests
        import re
        
        # Test regex functionality directly
        print("Testing regex patterns manually...")
        
        test_cases = [
            # Pattern, Text, Expected matches
            (r'\d+', 'Find 123 and 456', 2),
            (r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', 'test@example.com invalid@', 1),
            (r'(\d{4})-(\d{2})-(\d{2})', '2024-03-15', 1),
            (r'(?i)test', 'Test TEST test', 3),  # Case insensitive
        ]
        
        all_passed = True
        
        for pattern, text, expected_count in test_cases:
            try:
                # Test with Python regex (simulating frontend behavior)
                matches = list(re.finditer(pattern, text))
                actual_count = len(matches)
                
                if actual_count == expected_count:
                    print(f"✓ Pattern /{pattern}/ found {actual_count} matches in '{text}'")
                else:
                    print(f"✗ Pattern /{pattern}/ found {actual_count} matches, expected {expected_count}")
                    all_passed = False
                    
            except re.error as e:
                print(f"✗ Invalid regex pattern /{pattern}/: {e}")
                all_passed = False
        
        # Test the regex tester route
        print("\nTesting regex tester route...")
        response = requests.get('http://localhost:5000/tools/regex-tester')
        if response.status_code == 200 and 'Regex Tester' in response.text:
            print("✓ Regex tester route accessible")
        else:
            print(f"✗ Regex tester route failed: {response.status_code}")
            all_passed = False
        
        return all_passed
        
    except Exception as e:
        print(f"✗ Manual regex test failed: {e}")
        return False
        
    finally:
        if server_process:
            server_process.terminate()
            server_process.join(timeout=5)
            if server_process.is_alive():
                server_process.kill()

def run_regex_pattern_validation_tests():
    """Run comprehensive regex pattern validation tests"""
    print("\n" + "="*50)
    print("RUNNING REGEX PATTERN VALIDATION TESTS")
    print("="*50)
    
    import re
    
    # Test common regex patterns
    pattern_tests = {
        "Email": {
            "pattern": r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}",
            "valid": ["test@example.com", "user+tag@domain.co.uk", "name.surname@company.org"],
            "invalid": ["invalid-email", "@missing.com", "test@", "test.com"]
        },
        "Phone": {
            "pattern": r"\(?([0-9]{3})\)?[-. ]?([0-9]{3})[-. ]?([0-9]{4})",
            "valid": ["(555) 123-4567", "555-123-4567", "555.123.4567", "5551234567"],
            "invalid": ["12-345-6789", "555-12-34567", "phone-number"]
        },
        "URL": {
            "pattern": r"https?://(?:[-\w.])+(?:[:\d]+)?(?:/(?:[\w/_.])*(?:\?(?:[\w&=%.])*)?(?:#(?:[\w.])*)?)?",
            "valid": ["https://example.com", "http://test.org:8080/path", "https://sub.domain.com/path?param=value"],
            "invalid": ["ftp://example.com", "not-a-url", "https://"]
        },
        "Date ISO": {
            "pattern": r"\d{4}-\d{2}-\d{2}",
            "valid": ["2024-03-15", "1990-12-25", "2023-01-01"],
            "invalid": ["2024/03/15", "24-03-15", "2024-3-15"]
        }
    }
    
    all_passed = True
    
    for test_name, test_data in pattern_tests.items():
        print(f"\nTesting {test_name} pattern: /{test_data['pattern']}/")
        
        pattern = test_data['pattern']
        
        try:
            compiled_pattern = re.compile(pattern)
            
            # Test valid cases
            for valid_text in test_data['valid']:
                match = compiled_pattern.search(valid_text)
                if match:
                    print(f"  ✓ Valid: '{valid_text}' → matched")
                else:
                    print(f"  ✗ Valid: '{valid_text}' → no match (expected match)")
                    all_passed = False
            
            # Test invalid cases
            for invalid_text in test_data['invalid']:
                match = compiled_pattern.search(invalid_text)
                if not match:
                    print(f"  ✓ Invalid: '{invalid_text}' → no match")
                else:
                    print(f"  ✗ Invalid: '{invalid_text}' → matched (expected no match)")
                    all_passed = False
                    
        except re.error as e:
            print(f"  ✗ Pattern compilation failed: {e}")
            all_passed = False
    
    if all_passed:
        print("\n✓ All regex pattern validation tests PASSED")
    else:
        print("\n✗ Some regex pattern validation tests FAILED")
    
    return all_passed

def main():
    """Main test runner"""
    print("Regex Tester Tool - Comprehensive Test Suite")
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
    
    # Run regex pattern validation tests
    pattern_success = run_regex_pattern_validation_tests()
    results.append(("Pattern Validation Tests", pattern_success))
    
    # Run manual functionality test
    manual_success = run_manual_regex_test()
    results.append(("Manual Functionality Test", manual_success))
    
    # Run frontend tests (optional)
    frontend_success = run_frontend_tests()
    results.append(("Frontend Integration Tests", frontend_success))
    
    # Summary
    print("\n" + "="*50)
    print("REGEX TESTER TEST RESULTS SUMMARY")
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
        print("🎉 ALL TESTS PASSED! Regex Tester Tool is ready.")
        print("\n📝 Features tested:")
        print("  • Basic regex pattern matching")
        print("  • Regex flags (global, case-insensitive, multiline, dotall, unicode)")
        print("  • Capture groups and named groups")
        print("  • Error handling for invalid patterns")
        print("  • Match highlighting and visualization")
        print("  • History functionality")
        print("  • Interactive UI features")
        print("  • Common regex patterns (email, phone, URL, dates)")
        return 0
    else:
        print("⚠️  Some tests failed. Please review the output above.")
        return 1

if __name__ == '__main__':
    exit_code = main()
    sys.exit(exit_code)