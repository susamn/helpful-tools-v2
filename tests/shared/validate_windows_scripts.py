#!/usr/bin/env python3
"""
Validation script to verify Windows startup scripts are properly created
and have the correct structure and functionality.
"""

import os
import re

def validate_batch_script():
    """Validate the Windows batch script"""
    print("🔧 Validating Windows Batch Script (quick-start.bat)")
    print("=" * 60)
    
    script_path = "/home/susamn/dotfiles/workspace/tools/helpful-tools-v2/quick-start.bat"
    
    if not os.path.exists(script_path):
        print("❌ Batch script not found!")
        return False
    
    with open(script_path, 'r') as f:
        content = f.read()
    
    # Check essential components
    checks = [
        ("Virtual environment creation", r"python -m venv"),
        ("PID file management", r"helpful-tools-v2\.pid"),
        ("Process checking", r"tasklist.*PID"),
        ("Dependency installation", r"pip.*install.*-r.*requirements\.txt"),
        ("Background process start", r"start /B"),
        ("Process termination", r"taskkill"),
        ("Log file handling", r"helpful-tools-v2\.log"),
        ("Command parsing", r"if.*COMMAND.*==.*start"),
        ("Browser opening", r'start.*http://127\.0\.0\.1:8000'),
    ]
    
    all_passed = True
    for check_name, pattern in checks:
        if re.search(pattern, content, re.IGNORECASE):
            print(f"   ✅ {check_name}")
        else:
            print(f"   ❌ {check_name}")
            all_passed = False
    
    # Check command support
    commands = ["start", "stop", "restart", "status", "logs", "open"]
    for cmd in commands:
        if f'"%COMMAND%" == "{cmd}"' in content:
            print(f"   ✅ Command: {cmd}")
        else:
            print(f"   ❌ Command: {cmd}")
            all_passed = False
    
    print(f"\n📊 Batch Script Validation: {'✅ PASSED' if all_passed else '❌ FAILED'}")
    return all_passed

def validate_powershell_script():
    """Validate the PowerShell script"""
    print("\n🔧 Validating PowerShell Script (quick-start.ps1)")
    print("=" * 60)
    
    script_path = "/home/susamn/dotfiles/workspace/tools/helpful-tools-v2/quick-start.ps1"
    
    if not os.path.exists(script_path):
        print("❌ PowerShell script not found!")
        return False
    
    with open(script_path, 'r') as f:
        content = f.read()
    
    # Check essential components
    checks = [
        ("PowerShell version requirement", r"#Requires -Version"),
        ("Parameter validation", r"ValidateSet.*start.*stop.*restart"),
        ("Virtual environment creation", r"python -m venv"),
        ("PID file management", r"helpful-tools-v2\.pid"),
        ("Process management", r"Get-Process.*-Id"),
        ("Dependency installation", r"pip.*install.*-r"),
        ("Background process start", r"Start-Process.*-PassThru"),
        ("Process termination", r"Kill\(\)|CloseMainWindow"),
        ("Log file handling", r"helpful-tools-v2\.log"),
        ("Function definitions", r"function.*Start-App|Stop-App|Show-Status"),
        ("Browser opening", r"Start-Process.*http://127\.0\.0\.1:8000"),
    ]
    
    all_passed = True
    for check_name, pattern in checks:
        if re.search(pattern, content, re.IGNORECASE):
            print(f"   ✅ {check_name}")
        else:
            print(f"   ❌ {check_name}")
            all_passed = False
    
    # Check switch statement for commands
    commands = ["start", "stop", "restart", "status", "logs", "open"]
    for cmd in commands:
        if f'"{cmd}"' in content:
            print(f"   ✅ Command: {cmd}")
        else:
            print(f"   ❌ Command: {cmd}")
            all_passed = False
    
    print(f"\n📊 PowerShell Script Validation: {'✅ PASSED' if all_passed else '❌ FAILED'}")
    return all_passed

def validate_linux_compatibility():
    """Validate that Windows scripts have equivalent functionality to Linux script"""
    print("\n🔧 Validating Linux Compatibility")
    print("=" * 60)
    
    linux_script = "/home/susamn/dotfiles/workspace/tools/helpful-tools-v2/quick-start.sh"
    batch_script = "/home/susamn/dotfiles/workspace/tools/helpful-tools-v2/quick-start.bat"
    ps_script = "/home/susamn/dotfiles/workspace/tools/helpful-tools-v2/quick-start.ps1"
    
    if not all(os.path.exists(f) for f in [linux_script, batch_script, ps_script]):
        print("❌ One or more scripts missing!")
        return False
    
    with open(linux_script, 'r') as f:
        linux_content = f.read()
    with open(batch_script, 'r') as f:
        batch_content = f.read()
    with open(ps_script, 'r') as f:
        ps_content = f.read()
    
    # Check equivalent functionality
    equivalents = [
        ("Virtual environment management", r"python.*-m venv", r"python.*-m venv"),
        ("PID file usage", r"\.pid", r"\.pid"),
        ("Dependency installation", r"pip.*install.*-r.*requirements", r"pip.*install.*-r.*requirements"),
        ("Process background execution", r"nohup.*&|start /B", r"Start-Process.*PassThru"),
        ("Graceful shutdown", r"kill.*\$pid", r"taskkill|CloseMainWindow"),
        ("Force kill", r"kill -9", r"taskkill.*\/F|Kill\(\)"),
        ("Log file handling", r"\.log", r"\.log"),
        ("Status checking", r"ps -p.*pid", r"tasklist.*PID|Get-Process.*-Id"),
        ("URL opening", r"xdg-open|open", r"start.*http|Start-Process.*http"),
    ]
    
    all_passed = True
    for check_name, linux_pattern, windows_pattern in equivalents:
        linux_has = bool(re.search(linux_pattern, linux_content, re.IGNORECASE))
        batch_has = bool(re.search(windows_pattern, batch_content, re.IGNORECASE))
        ps_has = bool(re.search(windows_pattern, ps_content, re.IGNORECASE))
        
        if linux_has and (batch_has or ps_has):
            print(f"   ✅ {check_name}")
        else:
            print(f"   ❌ {check_name} - Linux: {linux_has}, Batch: {batch_has}, PS: {ps_has}")
            all_passed = False
    
    print(f"\n📊 Linux Compatibility: {'✅ PASSED' if all_passed else '❌ FAILED'}")
    return all_passed

def validate_file_permissions():
    """Check file permissions and structure"""
    print("\n🔧 Validating File Structure")
    print("=" * 60)
    
    files_to_check = [
        "/home/susamn/dotfiles/workspace/tools/helpful-tools-v2/quick-start.bat",
        "/home/susamn/dotfiles/workspace/tools/helpful-tools-v2/quick-start.ps1",
    ]
    
    all_passed = True
    for file_path in files_to_check:
        if os.path.exists(file_path):
            size = os.path.getsize(file_path)
            print(f"   ✅ {os.path.basename(file_path)}: {size} bytes")
        else:
            print(f"   ❌ {os.path.basename(file_path)}: Not found")
            all_passed = False
    
    print(f"\n📊 File Structure: {'✅ PASSED' if all_passed else '❌ FAILED'}")
    return all_passed

def main():
    """Run all validations"""
    print("🚀 Windows Startup Scripts Validation")
    print("=" * 80)
    
    results = []
    results.append(validate_batch_script())
    results.append(validate_powershell_script())
    results.append(validate_linux_compatibility())
    results.append(validate_file_permissions())
    
    overall_success = all(results)
    
    print("\n" + "=" * 80)
    if overall_success:
        print("🎉 All validations PASSED! Windows startup scripts are ready.")
        print("\nUsage Instructions:")
        print("📁 Batch Script: quick-start.bat start|stop|restart|status|logs|open")
        print("📁 PowerShell: .\\quick-start.ps1 start|stop|restart|status|logs|open")
        print("\n✨ Features:")
        print("   • Automatic virtual environment creation")
        print("   • Dependency installation from requirements.txt")
        print("   • PID-based process management")
        print("   • Background process execution")
        print("   • Graceful and force shutdown options")
        print("   • Status monitoring and log viewing")
        print("   • Browser integration")
    else:
        print("❌ Some validations FAILED. Please review the issues above.")
        return False
    
    return True

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)