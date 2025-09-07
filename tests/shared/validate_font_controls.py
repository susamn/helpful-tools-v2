#!/usr/bin/env python3
"""
Quick validation script for font controls functionality.
"""

import requests


def validate_font_controls():
    """Validate that font controls are properly integrated"""
    try:
        # Test JSON formatter route
        response = requests.get("http://127.0.0.1:8000/tools/json-formatter")
        if response.status_code != 200:
            return False, "JSON formatter route not accessible"
        
        content = response.text
        
        # Check for font controls in HTML
        required_elements = [
            'class="font-controls"',
            'id="fontIncreaseBtn"',
            'id="fontDecreaseBtn"',
            'title="Increase font size"',
            'title="Decrease font size"',
            '<label>Font:</label>',
        ]
        
        missing = []
        for element in required_elements:
            if element not in content:
                missing.append(element)
        
        if missing:
            return False, f"Missing HTML elements: {missing}"
        
        # Check JavaScript file
        js_response = requests.get("http://127.0.0.1:8000/static/js/json-formatter.js")
        if js_response.status_code != 200:
            return False, "JavaScript file not accessible"
        
        js_content = js_response.text
        
        # Check for JavaScript methods
        required_js = [
            'increaseFontSize()',
            'decreaseFontSize()',
            'applyFontSize()',
            'saveFontSize()',
            'fontIncreaseBtn',
            'fontDecreaseBtn',
        ]
        
        missing_js = []
        for js_element in required_js:
            if js_element not in js_content:
                missing_js.append(js_element)
        
        if missing_js:
            return False, f"Missing JavaScript elements: {missing_js}"
        
        return True, "All font controls validated successfully"
        
    except Exception as e:
        return False, f"Validation error: {e}"


if __name__ == "__main__":
    success, message = validate_font_controls()
    if success:
        print(f"✅ {message}")
        exit(0)
    else:
        print(f"❌ {message}")
        exit(1)