#!/usr/bin/env python3
"""
Minimal test suite for Regex Tester Tool - Integration testing only
"""

import pytest
import requests
import json
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options
import time

class TestRegexTesterIntegration:
    """Integration tests for the regex tester tool route accessibility"""
    
    def test_regex_tester_route_exists(self):
        """Test that the regex tester route is accessible"""
        response = requests.get("http://127.0.0.1:8000/tools/regex-tester")
        assert response.status_code == 200
        assert "Regex Tester" in response.text
        assert "Enter your regular expression" in response.text

class TestRegexTesterUI:
    """Basic UI functionality tests"""
    
    @pytest.fixture
    def driver(self):
        chrome_options = Options()
        chrome_options.add_argument("--headless")
        chrome_options.add_argument("--no-sandbox")
        chrome_options.add_argument("--disable-dev-shm-usage")
        
        driver = webdriver.Chrome(options=chrome_options)
        yield driver
        driver.quit()
    
    def test_page_loads_with_elements(self, driver):
        """Test that page loads with basic elements"""
        driver.get("http://127.0.0.1:8000/tools/regex-tester")
        wait = WebDriverWait(driver, 10)
        
        # Check basic elements exist
        pattern_input = wait.until(EC.presence_of_element_located((By.ID, "patternInput")))
        test_input = driver.find_element(By.ID, "testInput")
        assert pattern_input is not None
        assert test_input is not None
    
    def test_basic_regex_functionality(self, driver):
        """Test basic regex matching works in UI"""
        driver.get("http://127.0.0.1:8000/tools/regex-tester")
        wait = WebDriverWait(driver, 10)
        
        # Enter simple email regex
        pattern_input = wait.until(EC.presence_of_element_located((By.ID, "patternInput")))
        test_input = driver.find_element(By.ID, "testInput")
        
        pattern_input.send_keys(r"\w+@\w+\.\w+")
        test_input.send_keys("test@example.com")
        
        time.sleep(1)  # Wait for processing
        
        # Check that some results are displayed
        results = driver.find_elements(By.CLASS_NAME, "match-highlight")
        assert len(results) > 0

class TestHistoryIntegration:
    """Test history API integration"""
    
    def test_history_api_endpoints(self):
        """Test that history API endpoints work"""
        # Test saving to history
        test_data = {
            "data": json.dumps({
                "pattern": r"\d+",
                "testText": "Test 123 numbers",
                "flags": "g"
            }),
            "operation": "test"
        }
        
        response = requests.post("http://127.0.0.1:8000/api/history/regex-tester", json=test_data)
        assert response.status_code == 200
        
        result = response.json()
        assert result["success"] is True
        
        # Test retrieving history
        response = requests.get("http://127.0.0.1:8000/api/history/regex-tester?limit=5")
        assert response.status_code == 200
        
        data = response.json()
        assert "history" in data
        assert len(data["history"]) >= 1

if __name__ == '__main__':
    pytest.main([__file__, '-v', '--tb=short'])