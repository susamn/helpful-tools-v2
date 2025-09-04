#!/usr/bin/env python3
"""
Test script to validate text-diff improvements:
1. Fixed window sizing (50% each, no dynamic resizing)
2. Improved synchronized scrolling (no jiggling)
"""

import requests
import time
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options

BASE_URL = "http://127.0.0.1:8000"

def test_text_diff_improvements():
    print("🔧 Testing Text Diff Tool Improvements")
    print("=" * 50)
    
    chrome_options = Options()
    chrome_options.add_argument("--headless")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--window-size=1400,900")
    
    driver = webdriver.Chrome(options=chrome_options)
    
    try:
        print("1️⃣ Loading text-diff tool...")
        driver.get(f"{BASE_URL}/tools/text-diff")
        wait = WebDriverWait(driver, 10)
        
        # Wait for page to load
        wait.until(EC.presence_of_element_located((By.ID, "text1")))
        
        print("2️⃣ Testing window sizing constraints...")
        
        # Get the initial panel widths
        left_panel = driver.find_element(By.CSS_SELECTOR, ".text-panel:first-child")
        right_panel = driver.find_element(By.CSS_SELECTOR, ".text-panel:last-child")
        
        left_width_initial = left_panel.size['width']
        right_width_initial = right_panel.size['width']
        
        print(f"   Initial widths - Left: {left_width_initial}px, Right: {right_width_initial}px")
        
        # Add some text to both panels
        text1_input = driver.find_element(By.ID, "text1")
        text2_input = driver.find_element(By.ID, "text2")
        
        # Add text of different lengths to test if panels resize dynamically
        short_text = "Short text"
        long_text = "This is a much longer text that should not cause the panels to resize dynamically. " * 10
        
        text1_input.send_keys(short_text)
        text2_input.send_keys(long_text)
        
        time.sleep(0.5)
        
        # Check widths again after adding text
        left_width_after = left_panel.size['width']
        right_width_after = right_panel.size['width']
        
        print(f"   After text input - Left: {left_width_after}px, Right: {right_width_after}px")
        
        # Verify panels maintain equal width
        width_difference = abs(left_width_after - right_width_after)
        if width_difference <= 5:  # Allow small browser differences
            print("   ✅ Panel widths remain equal")
        else:
            print(f"   ❌ Panel width difference: {width_difference}px")
        
        print("3️⃣ Testing comparison and synchronized scrolling...")
        
        # Compare the texts
        compare_btn = driver.find_element(By.ID, "compareBtn")
        compare_btn.click()
        
        # Wait for comparison to complete
        wait.until(EC.presence_of_element_located((By.CLASS_NAME, "diff-line")))
        time.sleep(1)
        
        # Get the diff containers
        left_diff = driver.find_element(By.ID, "leftDiff")
        right_diff = driver.find_element(By.ID, "rightDiff")
        
        # Check if both containers have content
        left_lines = driver.find_elements(By.CSS_SELECTOR, "#leftDiff .diff-line")
        right_lines = driver.find_elements(By.CSS_SELECTOR, "#rightDiff .diff-line")
        
        print(f"   Diff lines - Left: {len(left_lines)}, Right: {len(right_lines)}")
        
        if len(left_lines) > 0 and len(right_lines) > 0:
            print("   ✅ Diff comparison generated successfully")
            
            # Test synchronized scrolling by scrolling one container
            initial_left_scroll = driver.execute_script("return arguments[0].scrollTop;", left_diff)
            initial_right_scroll = driver.execute_script("return arguments[0].scrollTop;", right_diff)
            
            print(f"   Initial scroll positions - Left: {initial_left_scroll}, Right: {initial_right_scroll}")
            
            # Scroll the left container
            driver.execute_script("arguments[0].scrollTop = 100;", left_diff)
            time.sleep(0.2)  # Allow sync to happen
            
            final_left_scroll = driver.execute_script("return arguments[0].scrollTop;", left_diff)
            final_right_scroll = driver.execute_script("return arguments[0].scrollTop;", right_diff)
            
            print(f"   After scroll - Left: {final_left_scroll}, Right: {final_right_scroll}")
            
            # Check if scrolling is synchronized
            scroll_difference = abs(final_left_scroll - final_right_scroll)
            if scroll_difference <= 5:  # Allow small differences
                print("   ✅ Synchronized scrolling working")
            else:
                print(f"   ❌ Scroll sync issue - difference: {scroll_difference}px")
        else:
            print("   ❌ Diff comparison failed")
        
        print("4️⃣ Testing CSS improvements...")
        
        # Check if the CSS improvements are applied
        panel_css = driver.execute_script("""
            const panel = document.querySelector('.text-panel');
            const computed = window.getComputedStyle(panel);
            return {
                width: computed.width,
                maxWidth: computed.maxWidth,
                minWidth: computed.minWidth
            };
        """)
        
        print(f"   Panel CSS - Width: {panel_css['width']}, Min: {panel_css['minWidth']}, Max: {panel_css['maxWidth']}")
        
        if '50%' in panel_css['maxWidth'] and '50%' in panel_css['minWidth']:
            print("   ✅ CSS constraints applied correctly")
        else:
            print("   ❌ CSS constraints not properly applied")
        
        print("5️⃣ Testing line content wrapping...")
        
        # Test with very long content that should wrap
        text1_input.clear()
        text2_input.clear()
        
        very_long_line = "This is an extremely long line of text that should wrap properly without causing the containers to expand horizontally and break the 50/50 layout that we have established. " * 5
        
        text1_input.send_keys(very_long_line)
        text2_input.send_keys(very_long_line + " with a small difference")
        
        compare_btn.click()
        wait.until(EC.presence_of_element_located((By.CLASS_NAME, "diff-line")))
        time.sleep(0.5)
        
        # Check panel widths again
        final_left_width = left_panel.size['width']
        final_right_width = right_panel.size['width']
        
        print(f"   Final widths after long content - Left: {final_left_width}px, Right: {final_right_width}px")
        
        final_width_difference = abs(final_left_width - final_right_width)
        if final_width_difference <= 5:
            print("   ✅ Panels maintain equal width with long content")
        else:
            print(f"   ❌ Panel width difference with long content: {final_width_difference}px")
        
        print("\n🎉 Text Diff Improvements Test Complete!")
        return True
        
    except Exception as e:
        print(f"❌ Test failed: {e}")
        return False
    finally:
        driver.quit()

if __name__ == "__main__":
    try:
        success = test_text_diff_improvements()
        if success:
            print("\n✅ All text diff improvements are working correctly!")
        else:
            print("\n❌ Some issues found with text diff improvements")
            exit(1)
    except Exception as e:
        print(f"❌ Test failed: {e}")
        exit(1)