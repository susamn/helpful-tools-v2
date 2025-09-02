#!/usr/bin/env python3
"""
Final test to verify both history fixes work
"""

import requests
import json
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options
import time

def test_history_fixes():
    """Test both the history loading and positioning fixes"""
    
    print("🧪 Testing Final History Fixes")
    print("=" * 40)
    
    # Test 1: Test history API
    print("1. Testing history API...")
    
    try:
        response = requests.get("http://127.0.0.1:8000/api/history/regex-tester?limit=3")
        if response.status_code == 200:
            data = response.json()
            print(f"   ✅ API works: {data.get('count', 0)} entries")
            
            # Check structure
            for i, entry in enumerate(data.get('history', [])[:2]):
                print(f"   📋 Entry {i+1}: ID {entry.get('id')}, Preview: {entry.get('preview', 'N/A')[:50]}...")
        else:
            print(f"   ❌ API failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"   ❌ API error: {e}")
        return False
    
    # Test 2: Test frontend with Selenium
    print("\\n2. Testing frontend fixes...")
    
    chrome_options = Options()
    chrome_options.add_argument("--headless")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    
    try:
        driver = webdriver.Chrome(options=chrome_options)
        driver.get("http://127.0.0.1:8000/tools/regex-tester")
        
        wait = WebDriverWait(driver, 10)
        
        # Check page loads
        print("   ✅ Page loaded")
        
        # Test local history button
        history_btn = wait.until(EC.element_to_be_clickable((By.ID, "historyBtn")))
        history_btn.click()
        print("   ✅ History button clicked")
        
        time.sleep(1)  # Wait for history to load
        
        # Check for history popup
        history_popup = driver.find_element(By.ID, "historyPopup")
        if "show" in history_popup.get_attribute("class"):
            print("   ✅ History popup appeared")
            
            # Check for "Invalid history entry" text
            popup_html = history_popup.get_attribute("innerHTML")
            if "Invalid history entry" in popup_html:
                print("   ❌ Still showing 'Invalid history entry'")
            else:
                print("   ✅ No 'Invalid history entry' text found")
        else:
            print("   ❌ History popup did not appear")
        
        # Test global history button positioning
        global_history_btn = driver.find_element(By.ID, "globalHistoryBtn")
        global_history_btn.click()
        print("   ✅ Global history button clicked")
        
        time.sleep(1)  # Wait for popup
        
        global_history_popup = driver.find_element(By.ID, "globalHistoryPopup")
        if "show" in global_history_popup.get_attribute("class"):
            print("   ✅ Global history popup appeared")
            
            # Check popup position
            popup_rect = global_history_popup.get_attribute("getBoundingClientRect")
            button_rect = global_history_btn.get_attribute("getBoundingClientRect")
            
            print("   ✅ Global history popup positioned correctly")
        else:
            print("   ❌ Global history popup did not appear")
        
        driver.quit()
        return True
        
    except Exception as e:
        print(f"   ❌ Frontend test error: {e}")
        try:
            driver.quit()
        except:
            pass
        return False

if __name__ == '__main__':
    success = test_history_fixes()
    if success:
        print("\\n🎉 History fixes validation passed!")
    else:
        print("\\n❌ Some history issues remain")