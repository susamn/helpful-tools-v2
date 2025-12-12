#!/usr/bin/env python3
"""
Minimal test suite for Cron Parser - UI workflow testing only
"""

import pytest
import requests
import json
import os
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options
import time

BASE_URL = os.environ.get('HELPFUL_TOOLS_BASE_URL', "http://localhost:8000")

class TestCronParserIntegration:
    """Test basic integration and route availability"""
    
    def test_cron_parser_route_exists(self):
        """Test that the cron parser route is accessible"""
        response = requests.get(f"{BASE_URL}/tools/cron-parser")
        assert response.status_code == 200
        assert "Cron Parser" in response.text
        assert "cron-input" in response.text

class TestCronParserUI:
    """Test basic UI workflow"""
    
    @pytest.fixture
    def driver(self):
        chrome_options = Options()
        chrome_options.add_argument("--headless")
        chrome_options.add_argument("--no-sandbox")
        chrome_options.add_argument("--disable-dev-shm-usage")
        chrome_options.add_argument("--window-size=1200,800")
        
        driver = webdriver.Chrome(options=chrome_options)
        yield driver
        driver.quit()
    
    def test_page_loads_correctly(self, driver):
        """Test that the cron parser page loads with all elements"""
        driver.get(f"{BASE_URL}/tools/cron-parser")
        wait = WebDriverWait(driver, 10)
        
        # Check main elements are present
        cron_input = wait.until(EC.presence_of_element_located((By.ID, "cronInput")))
        status = driver.find_element(By.ID, "cronStatus")
        
        assert cron_input is not None
        assert status.text == "WAITING"
    
    def test_basic_cron_input_parsing(self, driver):
        """Test basic cron expression input and parsing"""
        driver.get(f"{BASE_URL}/tools/cron-parser")
        wait = WebDriverWait(driver, 10)
        
        # Find input and enter a basic cron expression
        cron_input = wait.until(EC.presence_of_element_located((By.ID, "cronInput")))
        cron_input.clear()
        cron_input.send_keys("0 9 * * 1-5")
        
        # Wait for parsing (auto-parse has 500ms delay)
        time.sleep(1)
        
        # Check that status changed to VALID
        wait.until(EC.text_to_be_present_in_element((By.ID, "cronStatus"), "VALID"))
        
        # Check that field values were updated
        minute_value = driver.find_element(By.ID, "minuteValue")
        hour_value = driver.find_element(By.ID, "hourValue")
        
        assert minute_value.text == "0"
        assert hour_value.text == "9"

class TestCronHistoryIntegration:
    """Test history functionality integration"""
    
    def test_history_api_endpoints(self):
        """Test that history API endpoints work for cron-parser"""
        # Test saving to history
        test_data = {
            "data": json.dumps({"expression": "0 9 * * 1-5"}),
            "operation": "parse"
        }
        
        response = requests.post(f"{BASE_URL}/api/history/cron-parser", json=test_data)
        assert response.status_code == 200
        result = response.json()
        assert result["success"] is True
        
        # Test retrieving history
        response = requests.get(f"{BASE_URL}/api/history/cron-parser?limit=5")
        assert response.status_code == 200
        history = response.json()
        assert "history" in history
        assert len(history["history"]) > 0

if __name__ == '__main__':
    pytest.main([__file__, '-v', '--tb=short'])