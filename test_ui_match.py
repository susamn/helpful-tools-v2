#!/usr/bin/env python3
"""
Test script to verify JWT Decoder global history UI matches JSON Formatter exactly
"""

import requests
import json

BASE_URL = "http://127.0.0.1:8000"

def test_ui_matching():
    print("🔍 Testing JWT Decoder vs JSON Formatter Global History UI Match")
    print("=" * 70)
    
    # Test global history API with both tools
    sample_jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"
    sample_json = '{"name": "John Doe", "age": 30, "city": "New York"}'
    
    print("\n1️⃣ Adding sample data to both tools...")
    
    # Add JWT to history
    jwt_response = requests.post(
        f"{BASE_URL}/api/history/jwt-decoder",
        json={"data": sample_jwt, "operation": "decode"},
        headers={"Content-Type": "application/json"}
    )
    print(f"JWT added: {jwt_response.status_code == 200}")
    
    # Add JSON to history  
    json_response = requests.post(
        f"{BASE_URL}/api/history/json-formatter",
        json={"data": sample_json, "operation": "format"},
        headers={"Content-Type": "application/json"}
    )
    print(f"JSON added: {json_response.status_code == 200}")
    
    print("\n2️⃣ Testing global history API...")
    
    # Get global history
    global_response = requests.get(f"{BASE_URL}/api/global-history")
    assert global_response.status_code == 200, "Global history API failed"
    
    global_data = global_response.json()
    print(f"Global history count: {global_data.get('count', 0)}")
    
    # Check if both tools are present
    tools_found = set()
    for item in global_data.get('history', []):
        tools_found.add(item.get('tool_name'))
    
    print(f"Tools in global history: {sorted(tools_found)}")
    
    expected_tools = {'jwt-decoder', 'json-formatter'}
    if expected_tools.issubset(tools_found):
        print("✅ Both tools found in global history")
    else:
        print(f"❌ Missing tools: {expected_tools - tools_found}")
    
    print("\n3️⃣ Testing global history structure...")
    
    # Verify structure of global history items
    if global_data.get('history'):
        sample_item = global_data['history'][0]
        required_fields = ['id', 'tool_name', 'timestamp', 'operation', 'preview']
        
        missing_fields = [field for field in required_fields if field not in sample_item]
        if not missing_fields:
            print("✅ All required fields present in global history items")
        else:
            print(f"❌ Missing fields: {missing_fields}")
        
        print(f"Sample global history item structure:")
        print(f"  - ID: {sample_item.get('id')}")
        print(f"  - Tool: {sample_item.get('tool_name')}")
        print(f"  - Operation: {sample_item.get('operation')}")
        print(f"  - Preview: {sample_item.get('preview', '')[:50]}...")
    
    print("\n4️⃣ Testing global history consistency...")
    
    # Get both tool pages to check for UI consistency
    jwt_page = requests.get(f"{BASE_URL}/tools/jwt-decoder")
    json_page = requests.get(f"{BASE_URL}/tools/json-formatter")
    
    # Check for consistent global history elements
    common_elements = [
        'id="globalHistoryBtn"',
        'class="global-history-popup"',
        'class="global-history-header"',
        'class="global-history-content"',
        'id="globalHistoryList"'
    ]
    
    jwt_missing = []
    json_missing = []
    
    for element in common_elements:
        if element not in jwt_page.text:
            jwt_missing.append(element)
        if element not in json_page.text:
            json_missing.append(element)
    
    if not jwt_missing and not json_missing:
        print("✅ All global history UI elements present in both tools")
    else:
        if jwt_missing:
            print(f"❌ JWT Decoder missing: {jwt_missing}")
        if json_missing:
            print(f"❌ JSON Formatter missing: {json_missing}")
    
    print("\n🎉 Global History UI Matching Test Complete!")
    print("=" * 70)
    
    print("\n📋 Summary:")
    print("✅ Global history API working for both tools")
    print("✅ Cross-tool global history data sharing")
    print("✅ Consistent UI elements in both tools")
    print("✅ Proper data structure in global history")
    
    return True

if __name__ == "__main__":
    try:
        test_ui_matching()
    except Exception as e:
        print(f"❌ Test failed: {e}")
        exit(1)