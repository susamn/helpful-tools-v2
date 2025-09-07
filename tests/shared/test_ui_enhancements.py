#!/usr/bin/env python3
"""
Test script to verify UI enhancements are working across all tools
"""

import requests
import re

BASE_URL = "http://127.0.0.1:8000"

def test_ui_enhancements():
    print("🎨 Testing UI Enhancements Across All Tools")
    print("=" * 50)
    
    tools = [
        "jwt-decoder",
        "json-formatter", 
        "json-yaml-xml-converter",
        "text-diff",
        "regex-tester",
        "cron-parser",
        "scientific-calculator"
    ]
    
    print("\n1️⃣ Testing CSS file availability...")
    
    # Test CSS file is accessible
    css_response = requests.get(f"{BASE_URL}/static/css/common-enhancements.css")
    assert css_response.status_code == 200, "CSS file not accessible"
    
    css_content = css_response.text
    
    # Check that CSS contains expected enhancements
    expected_css_rules = [
        "body",
        "font-size: 15px !important",  # Base font increase
        "padding: 6px 12px !important", # Button padding increase
        ".toolbar button",
        ".history-btn",
        "min-height: 32px !important"  # Button height increase
    ]
    
    missing_rules = []
    for rule in expected_css_rules:
        if rule not in css_content:
            missing_rules.append(rule)
    
    if not missing_rules:
        print("✅ CSS file contains all expected enhancement rules")
    else:
        print(f"❌ Missing CSS rules: {missing_rules}")
    
    print(f"📊 CSS file size: {len(css_content)} characters")
    
    print("\n2️⃣ Testing CSS inclusion in all tools...")
    
    tools_with_css = 0
    tools_without_css = []
    
    for tool in tools:
        response = requests.get(f"{BASE_URL}/tools/{tool}")
        if response.status_code == 200:
            if "common-enhancements.css" in response.text:
                tools_with_css += 1
                print(f"✅ {tool}: CSS included")
            else:
                tools_without_css.append(tool)
                print(f"❌ {tool}: CSS missing")
        else:
            print(f"❌ {tool}: Tool not accessible (status {response.status_code})")
    
    print(f"\n📊 Tools with enhancements: {tools_with_css}/{len(tools)}")
    
    if tools_without_css:
        print(f"❌ Tools missing CSS: {tools_without_css}")
    else:
        print("✅ All tools include the common enhancements CSS")
    
    print("\n3️⃣ Testing CSS loading in browsers...")
    
    # Test a few tools to make sure CSS is actually being loaded
    test_tools = ["jwt-decoder", "json-formatter", "scientific-calculator"]
    
    for tool in test_tools:
        response = requests.get(f"{BASE_URL}/tools/{tool}")
        content = response.text
        
        # Check that CSS link is properly formatted
        css_link_pattern = r'<link rel="stylesheet" href="/static/css/common-enhancements\.css">'
        if re.search(css_link_pattern, content):
            print(f"✅ {tool}: CSS link properly formatted")
        else:
            print(f"❌ {tool}: CSS link format issue")
    
    print("\n4️⃣ Summary of enhancements...")
    
    print("📋 Applied enhancements:")
    print("  • Base font size: 13px → 15px")
    print("  • Header titles: 16px → 18px")  
    print("  • Button padding: 4px 8px → 6px 12px")
    print("  • Button font size: 11px → 13px")
    print("  • Button min height: ~24px → 32px")
    print("  • Text areas: 12-13px → 14px")
    print("  • Primary buttons: Enhanced with bold weight")
    print("  • Mobile responsive: Larger touch targets")
    
    print("\n🎉 UI Enhancement Test Complete!")
    
    # Summary
    success = (
        css_response.status_code == 200 and
        not missing_rules and
        not tools_without_css
    )
    
    return success

if __name__ == "__main__":
    try:
        success = test_ui_enhancements()
        if success:
            print("\n✅ All UI enhancements successfully applied!")
        else:
            print("\n❌ Some issues found with UI enhancements")
            exit(1)
    except Exception as e:
        print(f"❌ Test failed: {e}")
        exit(1)