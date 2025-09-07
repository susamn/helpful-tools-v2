#!/usr/bin/env python3
"""
Test Runner for Helpful Tools v2
Runs all JavaScript tests and generates a comprehensive report
"""

import os
import subprocess
import json
import sys
from pathlib import Path
from datetime import datetime
import time

class TestRunner:
    def __init__(self):
        self.results = {
            'timestamp': datetime.now().isoformat(),
            'total_tests': 0,
            'passed_tests': 0,
            'failed_tests': 0,
            'tools_tested': 0,
            'tools': {}
        }
        
    def check_node_available(self):
        """Check if Node.js is available for running tests"""
        try:
            result = subprocess.run(['node', '--version'], 
                                  capture_output=True, text=True, check=True)
            print(f"✓ Node.js available: {result.stdout.strip()}")
            return True
        except (subprocess.CalledProcessError, FileNotFoundError):
            print("❌ Node.js not found. Please install Node.js to run JavaScript tests.")
            print("   Visit: https://nodejs.org/")
            return False
    
    def find_test_files(self):
        """Find all test files in the tests directory"""
        test_dir = Path("tests")
        if not test_dir.exists():
            print("❌ Tests directory not found")
            return []
        
        test_files = list(test_dir.glob("*.test.js"))
        print(f"📁 Found {len(test_files)} test files")
        return test_files
    
    def run_javascript_test(self, test_file):
        """Run a JavaScript test file using Node.js"""
        tool_name = test_file.stem.replace('.test', '')
        print(f"\n🧪 Testing {tool_name}")
        print("=" * 50)
        
        try:
            start_time = time.time()
            
            # Run the test file with Node.js
            result = subprocess.run(
                ['node', str(test_file)],
                capture_output=True,
                text=True,
                cwd=Path.cwd(),
                timeout=30  # 30 second timeout
            )
            
            execution_time = time.time() - start_time
            
            # Parse test results from stdout
            success = result.returncode == 0
            output = result.stdout
            error_output = result.stderr
            
            # Extract test statistics from output
            passed_count = output.count('✅')
            failed_count = output.count('❌')
            total_count = passed_count + failed_count
            
            self.results['tools'][tool_name] = {
                'success': success,
                'total_tests': total_count,
                'passed_tests': passed_count,
                'failed_tests': failed_count,
                'execution_time': round(execution_time, 3),
                'output': output,
                'error': error_output if error_output else None
            }
            
            # Update global counters
            self.results['total_tests'] += total_count
            self.results['passed_tests'] += passed_count
            self.results['failed_tests'] += failed_count
            self.results['tools_tested'] += 1
            
            # Print results
            if success:
                print(f"✅ {tool_name} tests completed successfully")
                print(f"   Passed: {passed_count}/{total_count} ({execution_time:.3f}s)")
            else:
                print(f"❌ {tool_name} tests failed")
                print(f"   Passed: {passed_count}/{total_count} ({execution_time:.3f}s)")
                if error_output:
                    print(f"   Error: {error_output}")
            
            # Show detailed output
            print("\n📋 Test Output:")
            print("-" * 30)
            print(output)
            
            return success
            
        except subprocess.TimeoutExpired:
            print(f"⏱️ {tool_name} tests timed out (>30s)")
            self.results['tools'][tool_name] = {
                'success': False,
                'error': 'Test execution timed out',
                'execution_time': 30.0
            }
            return False
            
        except Exception as e:
            print(f"❌ Error running {tool_name} tests: {e}")
            self.results['tools'][tool_name] = {
                'success': False,
                'error': str(e),
                'execution_time': 0
            }
            return False
    
    def check_tool_files(self):
        """Check if all required tool files exist"""
        print("\n🔍 Checking Tool Files")
        print("=" * 50)
        
        issues = []
        
        # Check main files
        required_files = [
            'main.py',
            'config.json',
            'static/css/main.css',
            'api/history.py'
        ]
        
        for file_path in required_files:
            path = Path(file_path)
            if path.exists():
                print(f"✓ {file_path}")
            else:
                print(f"❌ {file_path} - Missing")
                issues.append(f"Missing required file: {file_path}")
        
        # Check tool-specific files
        tools_dir = Path("tools")
        js_dir = Path("static/js")
        
        if tools_dir.exists():
            html_files = list(tools_dir.glob("*.html"))
            print(f"📄 Found {len(html_files)} HTML tool files")
            
            for html_file in html_files:
                tool_name = html_file.stem
                js_file = js_dir / f"{tool_name}.js"
                
                if js_file.exists():
                    print(f"✓ {tool_name} - JS file exists")
                else:
                    print(f"⚠️  {tool_name} - JS file missing")
                    issues.append(f"Missing JS file for tool: {tool_name}")
        
        return issues
    
    def generate_html_report(self):
        """Generate an HTML test report"""
        html_content = f"""
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Helpful Tools v2 - Test Report</title>
    <style>
        body {{ font-family: 'Segoe UI', sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }}
        .container {{ max-width: 1200px; margin: 0 auto; }}
        .header {{ text-align: center; margin-bottom: 30px; padding: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border-radius: 8px; }}
        .summary {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }}
        .stat-card {{ background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); text-align: center; }}
        .stat-number {{ font-size: 2em; font-weight: bold; color: #667eea; }}
        .stat-label {{ color: #666; margin-top: 5px; }}
        .tool-results {{ background: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); overflow: hidden; }}
        .tool-header {{ background: #f8f9fa; padding: 15px; border-bottom: 1px solid #dee2e6; font-weight: bold; }}
        .tool-content {{ padding: 15px; }}
        .success {{ color: #28a745; }}
        .error {{ color: #dc3545; }}
        .output {{ background: #f8f9fa; padding: 10px; border-radius: 4px; font-family: monospace; white-space: pre-wrap; font-size: 0.9em; margin-top: 10px; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🧪 Helpful Tools v2 - Test Report</h1>
            <p>Generated on {self.results['timestamp']}</p>
        </div>
        
        <div class="summary">
            <div class="stat-card">
                <div class="stat-number">{self.results['tools_tested']}</div>
                <div class="stat-label">Tools Tested</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">{self.results['total_tests']}</div>
                <div class="stat-label">Total Tests</div>
            </div>
            <div class="stat-card">
                <div class="stat-number success">{self.results['passed_tests']}</div>
                <div class="stat-label">Passed</div>
            </div>
            <div class="stat-card">
                <div class="stat-number {'error' if self.results['failed_tests'] > 0 else 'success'}">{self.results['failed_tests']}</div>
                <div class="stat-label">Failed</div>
            </div>
        </div>
        
        <div class="tool-results">
            <div class="tool-header">Tool Test Results</div>
            <div class="tool-content">
"""
        
        for tool_name, results in self.results['tools'].items():
            status_class = 'success' if results['success'] else 'error'
            status_text = '✅ PASSED' if results['success'] else '❌ FAILED'
            
            html_content += f"""
                <div style="margin-bottom: 20px; padding-bottom: 20px; border-bottom: 1px solid #eee;">
                    <h3>{tool_name} <span class="{status_class}">{status_text}</span></h3>
                    <p>Tests: {results.get('passed_tests', 0)}/{results.get('total_tests', 0)} passed 
                       (Execution: {results.get('execution_time', 0)}s)</p>
                    {f'<div class="output">{results.get("output", "")}</div>' if results.get('output') else ''}
                    {f'<div class="output error">Error: {results.get("error", "")}</div>' if results.get('error') else ''}
                </div>
"""
        
        html_content += """
            </div>
        </div>
    </div>
</body>
</html>
"""
        
        report_path = Path("test-report.html")
        with open(report_path, 'w', encoding='utf-8') as f:
            f.write(html_content)
        
        print(f"📊 HTML report generated: {report_path.absolute()}")
    
    def run_all_tests(self):
        """Run all tests and generate reports"""
        print("🚀 Helpful Tools v2 - Test Suite")
        print("=" * 50)
        print(f"Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        
        # Check prerequisites
        if not self.check_node_available():
            return False
        
        # Check file integrity
        issues = self.check_tool_files()
        if issues:
            print(f"\n⚠️  Found {len(issues)} file issues:")
            for issue in issues:
                print(f"   • {issue}")
            print()
        
        # Find and run tests
        test_files = self.find_test_files()
        if not test_files:
            print("❌ No test files found")
            return False
        
        all_passed = True
        
        for test_file in test_files:
            success = self.run_javascript_test(test_file)
            if not success:
                all_passed = False
        
        # Generate reports
        self.generate_html_report()
        
        # Print summary
        print("\n" + "=" * 50)
        print("📊 FINAL RESULTS")
        print("=" * 50)
        print(f"Tools Tested: {self.results['tools_tested']}")
        print(f"Total Tests: {self.results['total_tests']}")
        print(f"Passed: {self.results['passed_tests']}")
        print(f"Failed: {self.results['failed_tests']}")
        
        if all_passed and self.results['total_tests'] > 0:
            print("\n🎉 All tests passed!")
        elif self.results['total_tests'] == 0:
            print("\n⚠️  No tests were executed")
        else:
            print(f"\n❌ {self.results['failed_tests']} test(s) failed")
        
        print(f"\nDetailed report: {Path('test-report.html').absolute()}")
        
        return all_passed and self.results['total_tests'] > 0

def main():
    """Main entry point"""
    if len(sys.argv) > 1 and sys.argv[1] == '--help':
        print("Helpful Tools v2 Test Runner")
        print("")
        print("Usage:")
        print("  python3 test.py       Run all tests")
        print("  python3 test.py --help Show this help")
        print("")
        print("This script will:")
        print("  • Check file integrity")
        print("  • Run JavaScript tests for all tools")
        print("  • Generate HTML test report")
        return
    
    runner = TestRunner()
    success = runner.run_all_tests()
    
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()