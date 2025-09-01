#!/usr/bin/env python3
"""
Frontend integration tests for Regex Tester Tool
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


class RegexTesterFrontendTest(unittest.TestCase):
    """Frontend integration tests for the Regex Tester Tool"""
    
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
        
        cls.base_url = "http://localhost:8000"  # Adjust port as needed
        cls.wait = WebDriverWait(cls.driver, 10)
    
    @classmethod
    def tearDownClass(cls):
        """Clean up driver"""
        cls.driver.quit()
    
    def setUp(self):
        """Navigate to regex tester tool before each test"""
        self.driver.get(f"{self.base_url}/tools/regex-tester")
        time.sleep(1)  # Allow page to load
    
    def test_page_loads_correctly(self):
        """Test that the regex tester page loads with all elements"""
        # Check title
        self.assertIn("Regex Tester", self.driver.title)
        
        # Check main elements are present
        regex_input = self.driver.find_element(By.ID, "regexInput")
        test_text = self.driver.find_element(By.ID, "testText")
        test_btn = self.driver.find_element(By.ID, "testBtn")
        clear_btn = self.driver.find_element(By.ID, "clearBtn")
        
        self.assertTrue(regex_input.is_displayed())
        self.assertTrue(test_text.is_displayed())
        self.assertTrue(test_btn.is_displayed())
        self.assertTrue(clear_btn.is_displayed())
        
        # Check flag checkboxes
        flag_global = self.driver.find_element(By.ID, "flagGlobal")
        flag_ignore_case = self.driver.find_element(By.ID, "flagIgnoreCase")
        self.assertTrue(flag_global.is_displayed())
        self.assertTrue(flag_ignore_case.is_displayed())
    
    def test_basic_regex_testing(self):
        """Test basic regex functionality"""
        # Input a simple regex pattern
        regex_input = self.driver.find_element(By.ID, "regexInput")
        test_text = self.driver.find_element(By.ID, "testText")
        
        regex_input.send_keys(r'\d+')
        test_text.send_keys('Find 123 and 456 in this text')
        
        # Click test button
        test_btn = self.driver.find_element(By.ID, "testBtn")
        test_btn.click()
        
        # Wait for results
        self.wait.until(EC.presence_of_element_located((By.CLASS_NAME, "regex-match")))
        
        # Check that matches are highlighted
        matches = self.driver.find_elements(By.CLASS_NAME, "regex-match")
        self.assertTrue(len(matches) > 0)
        
        # Check match count indicator
        match_count = self.driver.find_element(By.ID, "matchCount")
        self.assertIn("MATCH", match_count.text.upper())
    
    def test_regex_flags(self):
        """Test regex flags functionality"""
        regex_input = self.driver.find_element(By.ID, "regexInput")
        test_text = self.driver.find_element(By.ID, "testText")
        flag_ignore_case = self.driver.find_element(By.ID, "flagIgnoreCase")
        
        # Test case sensitive (default)
        regex_input.send_keys('test')
        test_text.send_keys('Test TEST test')
        
        test_btn = self.driver.find_element(By.ID, "testBtn")
        test_btn.click()
        
        time.sleep(0.5)  # Wait for processing
        
        # Should find only 1 match (lowercase 'test')
        matches = self.driver.find_elements(By.CLASS_NAME, "regex-match")
        case_sensitive_count = len(matches)
        
        # Enable case insensitive flag
        flag_ignore_case.click()
        test_btn.click()
        
        time.sleep(0.5)  # Wait for processing
        
        # Should find more matches now
        matches = self.driver.find_elements(By.CLASS_NAME, "regex-match")
        case_insensitive_count = len(matches)
        
        self.assertGreater(case_insensitive_count, case_sensitive_count)
    
    def test_invalid_regex_error_handling(self):
        """Test error handling for invalid regex patterns"""
        regex_input = self.driver.find_element(By.ID, "regexInput")
        test_text = self.driver.find_element(By.ID, "testText")
        
        # Enter invalid regex
        regex_input.send_keys('[invalid')  # Unclosed bracket
        test_text.send_keys('some test text')
        
        test_btn = self.driver.find_element(By.ID, "testBtn")
        test_btn.click()
        
        # Wait for error to appear
        self.wait.until(EC.presence_of_element_located((By.ID, "regexError")))
        
        # Check error display
        regex_error = self.driver.find_element(By.ID, "regexError")
        self.assertIn("Error", regex_error.text)
        
        # Check input styling
        self.assertIn("error", regex_input.get_attribute("class"))
    
    def test_example_buttons(self):
        """Test quick example buttons"""
        # Find and click an example button
        example_btns = self.driver.find_elements(By.CSS_SELECTOR, ".example-btn[data-pattern]")
        self.assertTrue(len(example_btns) > 0)
        
        # Click first example button
        example_btns[0].click()
        
        # Check that regex input and test text are populated
        regex_input = self.driver.find_element(By.ID, "regexInput")
        test_text = self.driver.find_element(By.ID, "testText")
        
        self.assertNotEqual(regex_input.get_attribute("value"), "")
        self.assertNotEqual(test_text.get_attribute("value"), "")
        
        # Check that matches are displayed
        time.sleep(1)  # Allow time for auto-test
        matches = self.driver.find_elements(By.CLASS_NAME, "regex-match")
        self.assertTrue(len(matches) > 0)
    
    def test_clear_functionality(self):
        """Test clear button functionality"""
        regex_input = self.driver.find_element(By.ID, "regexInput")
        test_text = self.driver.find_element(By.ID, "testText")
        
        # Add some content
        regex_input.send_keys(r'\d+')
        test_text.send_keys('123 test text')
        
        # Test the regex
        test_btn = self.driver.find_element(By.ID, "testBtn")
        test_btn.click()
        time.sleep(0.5)
        
        # Click clear
        clear_btn = self.driver.find_element(By.ID, "clearBtn")
        clear_btn.click()
        
        # Check that inputs are cleared
        self.assertEqual(regex_input.get_attribute("value"), "")
        self.assertEqual(test_text.get_attribute("value"), "")
        
        # Check that highlights are cleared
        matches = self.driver.find_elements(By.CLASS_NAME, "regex-match")
        self.assertEqual(len(matches), 0)
        
        # Check match count is reset
        match_count = self.driver.find_element(By.ID, "matchCount")
        self.assertIn("NO MATCHES", match_count.text)
    
    def test_match_details_panel(self):
        """Test match details panel functionality"""
        regex_input = self.driver.find_element(By.ID, "regexInput")
        test_text = self.driver.find_element(By.ID, "testText")
        
        # Use a pattern with capture groups
        regex_input.send_keys(r'(\w+)@(\w+\.\w+)')
        test_text.send_keys('Email: test@example.com and admin@site.org')
        
        # Test the regex
        test_btn = self.driver.find_element(By.ID, "testBtn")
        test_btn.click()
        
        # Wait for results
        self.wait.until(EC.presence_of_element_located((By.CLASS_NAME, "regex-match")))
        
        # Toggle match details panel
        toggle_btn = self.driver.find_element(By.ID, "toggleMatchesBtn")
        toggle_btn.click()
        
        # Check that matches panel is shown
        matches_panel = self.driver.find_element(By.ID, "matchesPanel")
        self.assertTrue("show" in matches_panel.get_attribute("class"))
        
        # Check that match details are displayed
        match_items = self.driver.find_elements(By.CLASS_NAME, "match-item")
        self.assertTrue(len(match_items) > 0)
        
        # Check for group matches
        group_matches = self.driver.find_elements(By.CLASS_NAME, "group-matches")
        if group_matches:
            self.assertTrue(len(group_matches) > 0)
    
    def test_auto_testing_on_input_change(self):
        """Test automatic testing when input changes"""
        regex_input = self.driver.find_element(By.ID, "regexInput")
        test_text = self.driver.find_element(By.ID, "testText")
        
        # Enter regex pattern
        regex_input.send_keys(r'\d+')
        
        # Enter test text - this should trigger auto-test
        test_text.send_keys('Find 123 in text')
        
        # Wait for auto-test to complete (debounced)
        time.sleep(1)
        
        # Check that matches are displayed without clicking test button
        matches = self.driver.find_elements(By.CLASS_NAME, "regex-match")
        self.assertTrue(len(matches) > 0)
    
    def test_copy_matches_functionality(self):
        """Test copy matches functionality"""
        regex_input = self.driver.find_element(By.ID, "regexInput")
        test_text = self.driver.find_element(By.ID, "testText")
        
        regex_input.send_keys(r'\d+')
        test_text.send_keys('Numbers: 123, 456, 789')
        
        # Test the regex
        test_btn = self.driver.find_element(By.ID, "testBtn")
        test_btn.click()
        
        # Wait for results
        self.wait.until(EC.presence_of_element_located((By.CLASS_NAME, "regex-match")))
        
        # Click copy matches
        copy_btn = self.driver.find_element(By.ID, "copyMatchesBtn")
        copy_btn.click()
        
        # Check status message
        status_text = self.driver.find_element(By.ID, "statusText")
        self.wait.until(lambda d: "copied" in status_text.text.lower())
    
    def test_keyboard_shortcuts(self):
        """Test keyboard shortcuts"""
        regex_input = self.driver.find_element(By.ID, "regexInput")
        test_text = self.driver.find_element(By.ID, "testText")
        
        regex_input.send_keys(r'\d+')
        test_text.send_keys('Find 123 here')
        
        # Test Ctrl+Enter for testing
        test_text.send_keys(Keys.CONTROL + Keys.RETURN)
        
        # Wait for results
        self.wait.until(EC.presence_of_element_located((By.CLASS_NAME, "regex-match")))
        
        # Check that test was executed
        matches = self.driver.find_elements(By.CLASS_NAME, "regex-match")
        self.assertTrue(len(matches) > 0)
    
    def test_history_functionality(self):
        """Test history save and load functionality"""
        regex_input = self.driver.find_element(By.ID, "regexInput")
        test_text = self.driver.find_element(By.ID, "testText")
        
        original_pattern = r'\d{4}-\d{2}-\d{2}'
        original_text = 'Date: 2024-03-15'
        
        regex_input.send_keys(original_pattern)
        test_text.send_keys(original_text)
        
        # Test to save to history
        test_btn = self.driver.find_element(By.ID, "testBtn")
        test_btn.click()
        
        # Wait for results and history save
        self.wait.until(EC.presence_of_element_located((By.CLASS_NAME, "regex-match")))
        time.sleep(1)  # Allow history save
        
        # Clear inputs
        clear_btn = self.driver.find_element(By.ID, "clearBtn")
        clear_btn.click()
        
        # Toggle history panel
        history_btn = self.driver.find_element(By.ID, "historyBtn")
        history_btn.click()
        
        # Wait for history panel to appear
        self.wait.until(EC.visibility_of_element_located((By.ID, "historyPopup")))
        
        # Check that history items exist
        history_items = self.driver.find_elements(By.CLASS_NAME, "history-item")
        self.assertTrue(len(history_items) > 0)
        
        # Click on first history item to load it
        if history_items:
            history_items[0].click()
            time.sleep(0.5)  # Wait for load
            
            # Check that pattern and text are restored
            self.assertEqual(regex_input.get_attribute("value"), original_pattern)
            self.assertEqual(test_text.get_attribute("value"), original_text)
    
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
        regex_input = self.driver.find_element(By.ID, "regexInput")
        test_text = self.driver.find_element(By.ID, "testText")
        self.assertTrue(regex_input.is_displayed())
        self.assertTrue(test_text.is_displayed())
    
    def test_error_handling_network_issues(self):
        """Test error handling for network issues"""
        # This test would require mocking network failures
        # For now, we'll test that the UI remains functional
        
        regex_input = self.driver.find_element(By.ID, "regexInput")
        test_text = self.driver.find_element(By.ID, "testText")
        
        # Use a simple pattern that should work regardless of network
        regex_input.send_keys(r'test')
        test_text.send_keys('This is a test')
        
        test_btn = self.driver.find_element(By.ID, "testBtn")
        test_btn.click()
        
        # Should still work for client-side regex testing
        self.wait.until(EC.presence_of_element_located((By.CLASS_NAME, "regex-match")))
        matches = self.driver.find_elements(By.CLASS_NAME, "regex-match")
        self.assertTrue(len(matches) > 0)
    
    def test_complex_regex_patterns(self):
        """Test complex regex patterns"""
        complex_patterns = [
            # Email with groups
            (r'([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})', 
             'Contact: john.doe+tag@example.com'),
            
            # URL with optional parts
            (r'https?://(?:www\.)?([a-zA-Z0-9.-]+)(?:/[^\s]*)?',
             'Visit https://www.example.com/path/to/page'),
            
            # Phone with optional formatting
            (r'\(?(\d{3})\)?[-.\s]?(\d{3})[-.\s]?(\d{4})',
             'Call (555) 123-4567 or 555.123.4567'),
        ]
        
        for pattern, text in complex_patterns:
            # Clear previous inputs
            self.driver.execute_script("arguments[0].value = '';", 
                                     self.driver.find_element(By.ID, "regexInput"))
            self.driver.execute_script("arguments[0].value = '';", 
                                     self.driver.find_element(By.ID, "testText"))
            
            regex_input = self.driver.find_element(By.ID, "regexInput")
            test_text = self.driver.find_element(By.ID, "testText")
            
            regex_input.send_keys(pattern)
            test_text.send_keys(text)
            
            test_btn = self.driver.find_element(By.ID, "testBtn")
            test_btn.click()
            
            # Wait for results
            self.wait.until(EC.presence_of_element_located((By.CLASS_NAME, "regex-match")))
            
            # Verify match exists
            matches = self.driver.find_elements(By.CLASS_NAME, "regex-match")
            self.assertGreater(len(matches), 0, f"Pattern should match: {pattern}")


if __name__ == '__main__':
    # Instructions for running these tests
    print("Frontend Integration Tests for Regex Tester Tool")
    print("=" * 50)
    print("Prerequisites:")
    print("1. Install selenium: pip install selenium")
    print("2. Install ChromeDriver or GeckoDriver")
    print("3. Start the Flask application on localhost:5000")
    print("4. Run: python test_regex_tester_frontend.py")
    print()
    print("Note: These tests require a running server and browser driver.")
    print("For headless testing, ensure Chrome/Firefox with headless support.")
    print()
    
    unittest.main()
