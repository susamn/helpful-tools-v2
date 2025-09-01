#!/usr/bin/env python3
"""
Frontend integration tests for Text Diff Tool
Tests the HTML/JavaScript functionality using Selenium
"""

import os
import time
import json
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.chrome.options import Options
import unittest


class TextDiffFrontendTest(unittest.TestCase):
    """Frontend integration tests for the Text Diff Tool"""
    
    @classmethod
    def setUpClass(cls):
        """Set up Chrome driver for testing"""
        chrome_options = Options()
        chrome_options.add_argument("--headless")  # Run in headless mode for CI
        chrome_options.add_argument("--no-sandbox")
        chrome_options.add_argument("--disable-dev-shm-usage")
        chrome_options.add_argument("--window-size=1920,1080")
        
        try:
            cls.driver = webdriver.Chrome(options=chrome_options)
        except Exception as e:
            # Fallback to Firefox if Chrome not available
            cls.driver = webdriver.Firefox()
        
        cls.base_url = "http://localhost:5000"  # Adjust port as needed
        cls.wait = WebDriverWait(cls.driver, 10)
    
    @classmethod
    def tearDownClass(cls):
        """Clean up driver"""
        cls.driver.quit()
    
    def setUp(self):
        """Navigate to text diff tool before each test"""
        self.driver.get(f"{self.base_url}/tools/text-diff")
        time.sleep(1)  # Allow page to load
    
    def test_page_loads_correctly(self):
        """Test that the text diff page loads with all elements"""
        # Check title
        self.assertIn("Text Diff Tool", self.driver.title)
        
        # Check main elements are present
        text1_input = self.driver.find_element(By.ID, "text1")
        text2_input = self.driver.find_element(By.ID, "text2")
        compare_btn = self.driver.find_element(By.ID, "compare-btn")
        clear_btn = self.driver.find_element(By.ID, "clear-btn")
        swap_btn = self.driver.find_element(By.ID, "swap-btn")
        
        self.assertTrue(text1_input.is_displayed())
        self.assertTrue(text2_input.is_displayed())
        self.assertTrue(compare_btn.is_displayed())
        self.assertTrue(clear_btn.is_displayed())
        self.assertTrue(swap_btn.is_displayed())
    
    def test_basic_text_comparison(self):
        """Test basic text comparison functionality"""
        # Input different texts
        text1_input = self.driver.find_element(By.ID, "text1")
        text2_input = self.driver.find_element(By.ID, "text2")
        
        text1_input.send_keys("Hello world\nThis is line 2")
        text2_input.send_keys("Hello universe\nThis is line 2")
        
        # Click compare
        compare_btn = self.driver.find_element(By.ID, "compare-btn")
        compare_btn.click()
        
        # Wait for results
        self.wait.until(EC.presence_of_element_located((By.CLASS_NAME, "diff-line")))
        
        # Check that diff results are displayed
        diff_lines = self.driver.find_elements(By.CLASS_NAME, "diff-line")
        self.assertTrue(len(diff_lines) > 0)
        
        # Check for character-level highlighting
        char_deletes = self.driver.find_elements(By.CLASS_NAME, "char-delete")
        char_inserts = self.driver.find_elements(By.CLASS_NAME, "char-insert")
        
        # Should have character-level diffs for "world" -> "universe"
        self.assertTrue(len(char_deletes) > 0 or len(char_inserts) > 0)
    
    def test_identical_text_comparison(self):
        """Test comparison of identical texts"""
        # Input identical texts
        text1_input = self.driver.find_element(By.ID, "text1")
        text2_input = self.driver.find_element(By.ID, "text2")
        
        same_text = "Same text\nAnother line\nThird line"
        text1_input.send_keys(same_text)
        text2_input.send_keys(same_text)
        
        # Click compare
        compare_btn = self.driver.find_element(By.ID, "compare-btn")
        compare_btn.click()
        
        # Wait for results
        self.wait.until(EC.text_to_be_present_in_element((By.ID, "stats"), "equal"))
        
        # Check stats show all equal
        stats_element = self.driver.find_element(By.ID, "stats")
        stats_text = stats_element.text
        self.assertIn("3 equal", stats_text)
        self.assertIn("0 deleted", stats_text)
        self.assertIn("0 inserted", stats_text)
    
    def test_clear_functionality(self):
        """Test clear button functionality"""
        # Add some text
        text1_input = self.driver.find_element(By.ID, "text1")
        text2_input = self.driver.find_element(By.ID, "text2")
        
        text1_input.send_keys("Some text")
        text2_input.send_keys("Other text")
        
        # Click clear
        clear_btn = self.driver.find_element(By.ID, "clear-btn")
        clear_btn.click()
        
        # Check that inputs are cleared
        self.assertEqual(text1_input.get_attribute("value"), "")
        self.assertEqual(text2_input.get_attribute("value"), "")
        
        # Check that diff display is reset
        left_diff = self.driver.find_element(By.ID, "left-diff-display")
        right_diff = self.driver.find_element(By.ID, "right-diff-display")
        
        # Should show initial placeholder messages
        self.assertTrue("Enter text" in left_diff.text or left_diff.text == "")
        self.assertTrue("Enter text" in right_diff.text or right_diff.text == "")
    
    def test_swap_functionality(self):
        """Test swap button functionality"""
        # Add different text to each input
        text1_input = self.driver.find_element(By.ID, "text1")
        text2_input = self.driver.find_element(By.ID, "text2")
        
        original_text1 = "First text"
        original_text2 = "Second text"
        
        text1_input.send_keys(original_text1)
        text2_input.send_keys(original_text2)
        
        # Click swap
        swap_btn = self.driver.find_element(By.ID, "swap-btn")
        swap_btn.click()
        
        # Check that texts are swapped
        self.assertEqual(text1_input.get_attribute("value"), original_text2)
        self.assertEqual(text2_input.get_attribute("value"), original_text1)
    
    def test_copy_functionality(self):
        """Test copy diff functionality"""
        # Add text and compare
        text1_input = self.driver.find_element(By.ID, "text1")
        text2_input = self.driver.find_element(By.ID, "text2")
        
        text1_input.send_keys("Hello world")
        text2_input.send_keys("Hello universe")
        
        # Compare
        compare_btn = self.driver.find_element(By.ID, "compare-btn")
        compare_btn.click()
        
        # Wait for results
        self.wait.until(EC.presence_of_element_located((By.CLASS_NAME, "diff-line")))
        
        # Click copy button
        copy_btn = self.driver.find_element(By.ID, "copy-diff-btn")
        copy_btn.click()
        
        # Wait for feedback message
        self.wait.until(EC.text_to_be_present_in_element((By.ID, "feedback"), "copied"))
        
        feedback = self.driver.find_element(By.ID, "feedback")
        self.assertIn("copied", feedback.text.lower())
    
    def test_keyboard_shortcuts(self):
        """Test keyboard shortcuts functionality"""
        # Add text
        text1_input = self.driver.find_element(By.ID, "text1")
        text2_input = self.driver.find_element(By.ID, "text2")
        
        text1_input.send_keys("Test text")
        text2_input.send_keys("Test text modified")
        
        # Test Ctrl+Enter for compare
        text1_input.send_keys(Keys.CONTROL + Keys.RETURN)
        
        # Wait for results
        self.wait.until(EC.presence_of_element_located((By.CLASS_NAME, "diff-line")))
        
        # Check that comparison was triggered
        diff_lines = self.driver.find_elements(By.CLASS_NAME, "diff-line")
        self.assertTrue(len(diff_lines) > 0)
    
    def test_history_functionality(self):
        """Test history save and load functionality"""
        # Add text and compare
        text1_input = self.driver.find_element(By.ID, "text1")
        text2_input = self.driver.find_element(By.ID, "text2")
        
        original_text1 = "Historical text 1"
        original_text2 = "Historical text 2"
        
        text1_input.send_keys(original_text1)
        text2_input.send_keys(original_text2)
        
        # Compare to save to history
        compare_btn = self.driver.find_element(By.ID, "compare-btn")
        compare_btn.click()
        
        # Wait for results
        self.wait.until(EC.presence_of_element_located((By.CLASS_NAME, "diff-line")))
        
        # Clear inputs
        clear_btn = self.driver.find_element(By.ID, "clear-btn")
        clear_btn.click()
        
        # Toggle history panel
        history_toggle = self.driver.find_element(By.ID, "history-toggle")
        history_toggle.click()
        
        # Wait for history panel to appear
        self.wait.until(EC.visibility_of_element_located((By.ID, "history-panel")))
        
        # Check that history item exists
        history_items = self.driver.find_elements(By.CLASS_NAME, "history-item")
        self.assertTrue(len(history_items) > 0)
        
        # Click on first history item to load it
        if history_items:
            history_items[0].click()
            time.sleep(0.5)  # Wait for load
            
            # Check that texts are restored
            self.assertEqual(text1_input.get_attribute("value"), original_text1)
            self.assertEqual(text2_input.get_attribute("value"), original_text2)
    
    def test_error_handling(self):
        """Test error handling for network issues"""
        # Mock a network error by navigating to invalid URL temporarily
        # This is a basic test - in practice, you'd mock the API response
        
        # Add text
        text1_input = self.driver.find_element(By.ID, "text1")
        text2_input = self.driver.find_element(By.ID, "text2")
        
        text1_input.send_keys("Test")
        text2_input.send_keys("Test2")
        
        # Inject JavaScript to mock fetch error
        self.driver.execute_script("""
            window.originalFetch = window.fetch;
            window.fetch = function() {
                return Promise.reject(new Error('Network error'));
            };
        """)
        
        # Try to compare
        compare_btn = self.driver.find_element(By.ID, "compare-btn")
        compare_btn.click()
        
        # Wait for error message
        self.wait.until(EC.text_to_be_present_in_element((By.ID, "stats"), "error"))
        
        stats_element = self.driver.find_element(By.ID, "stats")
        self.assertIn("error", stats_element.text.lower())
        
        # Restore original fetch
        self.driver.execute_script("window.fetch = window.originalFetch;")
    
    def test_responsive_design(self):
        """Test responsive design at different screen sizes"""
        # Test desktop size
        self.driver.set_window_size(1920, 1080)
        time.sleep(0.5)
        
        main_container = self.driver.find_element(By.CLASS_NAME, "main-container")
        self.assertTrue(main_container.is_displayed())
        
        # Test tablet size
        self.driver.set_window_size(768, 1024)
        time.sleep(0.5)
        
        # Elements should still be visible
        text1_input = self.driver.find_element(By.ID, "text1")
        text2_input = self.driver.find_element(By.ID, "text2")
        self.assertTrue(text1_input.is_displayed())
        self.assertTrue(text2_input.is_displayed())
        
        # Test mobile size
        self.driver.set_window_size(375, 667)
        time.sleep(0.5)
        
        # Elements should still be functional
        compare_btn = self.driver.find_element(By.ID, "compare-btn")
        self.assertTrue(compare_btn.is_displayed())


if __name__ == '__main__':
    # Instructions for running these tests
    print("Frontend Integration Tests for Text Diff Tool")
    print("=" * 50)
    print("Prerequisites:")
    print("1. Install selenium: pip install selenium")
    print("2. Install ChromeDriver or GeckoDriver")
    print("3. Start the Flask application on localhost:5000")
    print("4. Run: python test_text_diff_frontend.py")
    print()
    print("Note: These tests require a running server and browser driver.")
    print("For headless testing, ensure Chrome/Firefox with headless support.")
    print()
    
    unittest.main()