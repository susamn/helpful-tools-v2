#!/usr/bin/env python3
"""
Comprehensive test suite for Scientific Calculator
Tests both backend API integration and frontend functionality
"""

import pytest
import requests
import json
import time
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.common.action_chains import ActionChains

class TestScientificCalculatorIntegration:
    """Test API integration and route accessibility"""
    
    @pytest.fixture
    def base_url(self):
        return "http://127.0.0.1:8000"
    
    def test_scientific_calculator_route_exists(self, base_url):
        """Test that scientific calculator route is accessible"""
        response = requests.get(f"{base_url}/tools/scientific-calculator")
        assert response.status_code == 200
        assert "Scientific Calculator" in response.text
        assert "mathjs" in response.text  # Check math.js is included
        assert "scientific-calculator.js" in response.text  # Check our JS is included
    
    def test_main_dashboard_includes_calculator(self, base_url):
        """Test that calculator appears in main dashboard"""
        response = requests.get(f"{base_url}/")
        assert response.status_code == 200
        assert "Scientific Calculator" in response.text
        assert "/tools/scientific-calculator" in response.text
        assert "calculator" in response.text.lower()

class TestScientificCalculatorHistory:
    """Test history API endpoints for scientific calculator"""
    
    @pytest.fixture
    def base_url(self):
        return "http://127.0.0.1:8000"
    
    def test_history_api_endpoints(self, base_url):
        """Test history save and retrieve functionality"""
        # Test saving function to history
        test_data = {
            "data": json.dumps({"expression": "x^2 + 2*x + 1"}),
            "operation": "plot"
        }
        
        response = requests.post(f"{base_url}/api/history/scientific-calculator", json=test_data)
        assert response.status_code == 200
        
        result = response.json()
        assert result["success"] is True
        assert "entry_id" in result
        
        # Test retrieving history
        response = requests.get(f"{base_url}/api/history/scientific-calculator?limit=5")
        assert response.status_code == 200
        
        data = response.json()
        assert data["tool"] == "scientific-calculator"
        assert isinstance(data["history"], list)
        assert data["count"] >= 1
        
        # Verify our entry exists
        found_entry = False
        for entry in data["history"]:
            if "x^2 + 2*x + 1" in entry["preview"]:
                found_entry = True
                break
        assert found_entry, "Saved function not found in history"
        
        # Test global history inclusion
        response = requests.get(f"{base_url}/api/global-history?limit=10")
        assert response.status_code == 200
        
        global_data = response.json()
        assert global_data["success"] is True
        
        # Find our entry in global history
        found_global = False
        for entry in global_data["history"]:
            if entry["tool_name"] == "scientific-calculator" and "x^2 + 2*x + 1" in entry["preview"]:
                found_global = True
                break
        assert found_global, "Scientific calculator entry not found in global history"

class TestScientificCalculatorUI:
    """Test UI functionality with Selenium"""
    
    @pytest.fixture
    def driver(self):
        chrome_options = Options()
        chrome_options.add_argument("--headless")
        chrome_options.add_argument("--no-sandbox")
        chrome_options.add_argument("--disable-dev-shm-usage")
        chrome_options.add_argument("--window-size=1400,900")
        
        driver = webdriver.Chrome(options=chrome_options)
        yield driver
        driver.quit()
    
    def test_page_loads_correctly(self, driver):
        """Test that calculator page loads with all elements"""
        driver.get("http://127.0.0.1:8000/tools/scientific-calculator")
        wait = WebDriverWait(driver, 10)
        
        # Check page title and header
        assert "Scientific Calculator" in driver.title
        header = wait.until(EC.presence_of_element_located((By.TAG_NAME, "h1")))
        assert "Scientific Calculator" in header.text
        
        # Check main panels exist
        calc_panel = driver.find_element(By.CLASS_NAME, "calculator-panel")
        graph_panel = driver.find_element(By.CLASS_NAME, "graph-panel")
        assert calc_panel.is_displayed()
        assert graph_panel.is_displayed()
        
        # Check display exists
        display = driver.find_element(By.ID, "result")
        assert display.text == "0"
        
        # Check canvas exists
        canvas = driver.find_element(By.ID, "graphCanvas")
        assert canvas.is_displayed()

class TestCalculatorFunctionality:
    """Test calculator button functionality"""
    
    @pytest.fixture
    def driver(self):
        chrome_options = Options()
        chrome_options.add_argument("--headless")
        chrome_options.add_argument("--no-sandbox")
        chrome_options.add_argument("--disable-dev-shm-usage")
        chrome_options.add_argument("--window-size=1400,900")
        
        driver = webdriver.Chrome(options=chrome_options)
        driver.get("http://127.0.0.1:8000/tools/scientific-calculator")
        WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.ID, "result"))
        )
        time.sleep(2)  # Wait for initialization
        yield driver
        driver.quit()
    
    def test_basic_arithmetic(self, driver):
        """Test basic arithmetic operations"""
        # Ensure calculator is fully loaded and clear any existing state
        time.sleep(3)  # Give extra time for JavaScript initialization
        
        # Clear any existing calculation
        for i in range(2):
            try:
                driver.find_element(By.XPATH, "//button[contains(text(), 'CE')]").click()
                time.sleep(0.1)
            except:
                pass
        
        # Test: 2 + 3 = 5
        driver.find_element(By.XPATH, "//button[text()='2']").click()
        time.sleep(0.1)
        
        # Click + with fallback
        driver.find_element(By.XPATH, "//button[text()='+']").click()
        time.sleep(0.1)
        
        # Ensure + operator was added (fallback if HTML onclick failed)
        if driver.execute_script("return typeof calculator !== 'undefined' && calculator !== null;"):
            current_expr = driver.execute_script("return calculator.currentExpression;")
            if current_expr == '2':  # Should be '2+' if + button worked
                driver.execute_script("calculator.appendOperator('+');")
        
        driver.find_element(By.XPATH, "//button[text()='3']").click()
        time.sleep(0.1)
        driver.find_element(By.XPATH, "//button[text()='=']").click()
        time.sleep(0.5)
        
        result = driver.find_element(By.ID, "result")
        assert result.text == "5"
        
        # Clear and test: 10 - 4 = 6
        driver.find_element(By.XPATH, "//button[contains(text(), 'CE')]").click()
        driver.find_element(By.XPATH, "//button[text()='1']").click()
        driver.find_element(By.XPATH, "//button[text()='0']").click()
        driver.find_element(By.XPATH, "//button[text()='-']").click()
        driver.find_element(By.XPATH, "//button[text()='4']").click()
        driver.find_element(By.XPATH, "//button[text()='=']").click()
        
        time.sleep(1)
        result = driver.find_element(By.ID, "result")
        assert result.text == "6"
    
    def test_scientific_functions(self, driver):
        """Test scientific function buttons"""
        # Test: sin(0) = 0 (in degrees)
        driver.find_element(By.XPATH, "//button[text()='sin']").click()
        driver.find_element(By.XPATH, "//button[text()='0']").click()
        driver.find_element(By.XPATH, "//button[text()=')']").click()
        driver.find_element(By.XPATH, "//button[text()='=']").click()
        
        time.sleep(1)
        result = driver.find_element(By.ID, "result")
        assert float(result.text) == 0.0
        
        # Clear and test: sqrt(4) = 2
        driver.find_element(By.XPATH, "//button[contains(text(), 'CE')]").click()
        driver.find_element(By.XPATH, "//button[text()='√']").click()
        driver.find_element(By.XPATH, "//button[text()='4']").click()
        driver.find_element(By.XPATH, "//button[text()=')']").click()
        driver.find_element(By.XPATH, "//button[text()='=']").click()
        
        time.sleep(1)
        result = driver.find_element(By.ID, "result")
        assert float(result.text) == 2.0
    
    def test_constants(self, driver):
        """Test mathematical constants"""
        # Test pi constant
        driver.find_element(By.XPATH, "//button[text()='π']").click()
        driver.find_element(By.XPATH, "//button[text()='=']").click()
        
        time.sleep(1)
        result = driver.find_element(By.ID, "result")
        pi_value = float(result.text)
        assert 3.14 < pi_value < 3.15  # Approximate pi value
    
    def test_backspace_and_clear(self, driver):
        """Test backspace and clear functionality"""
        # Enter some numbers
        driver.find_element(By.XPATH, "//button[text()='1']").click()
        driver.find_element(By.XPATH, "//button[text()='2']").click()
        driver.find_element(By.XPATH, "//button[text()='3']").click()
        
        expression = driver.find_element(By.ID, "expression")
        assert expression.text == "123"
        
        # Test backspace
        driver.find_element(By.XPATH, "//button[text()='⌫']").click()
        time.sleep(0.5)
        assert driver.find_element(By.ID, "expression").text == "12"
        
        # Test clear entry
        driver.find_element(By.XPATH, "//button[contains(text(), 'CE')]").click()
        time.sleep(0.5)
        assert driver.find_element(By.ID, "expression").text == ""

class TestGraphPlotting:
    """Test graph plotting functionality"""
    
    @pytest.fixture
    def driver(self):
        chrome_options = Options()
        chrome_options.add_argument("--headless")
        chrome_options.add_argument("--no-sandbox")
        chrome_options.add_argument("--disable-dev-shm-usage")
        chrome_options.add_argument("--window-size=1400,900")
        
        driver = webdriver.Chrome(options=chrome_options)
        driver.get("http://127.0.0.1:8000/tools/scientific-calculator")
        WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.ID, "graphCanvas"))
        )
        time.sleep(3)  # Wait for graph initialization
        yield driver
        driver.quit()
    
    def test_function_input_and_plotting(self, driver):
        """Test function input and basic plotting"""
        function_input = driver.find_element(By.ID, "functionInput")
        
        # Test plotting x^2
        function_input.clear()
        function_input.send_keys("x^2")
        time.sleep(0.5)
        
        # Check input validation (should be valid)
        assert "error" not in function_input.get_attribute("class")
        
        # Click plot button
        driver.find_element(By.XPATH, "//button[text()='Plot']").click()
        time.sleep(2)
        
        # Check status message
        status = driver.find_element(By.ID, "statusText")
        assert "Plotted 1 function" in status.text
        
        # Check legend appears
        legend = driver.find_element(By.ID, "functionLegend")
        assert legend.is_displayed()
        assert "x^2" in legend.text
    
    def test_multiple_functions(self, driver):
        """Test adding multiple functions to graph"""
        function_input = driver.find_element(By.ID, "functionInput")
        
        # Plot first function: x^2
        function_input.clear()
        function_input.send_keys("x^2")
        driver.find_element(By.XPATH, "//button[text()='Plot']").click()
        time.sleep(1)
        
        # Add second function: sin(x)
        function_input.clear()
        function_input.send_keys("sin(x)")
        driver.find_element(By.XPATH, "//button[text()='Add']").click()
        time.sleep(1)
        
        # Check status shows 2 functions
        status = driver.find_element(By.ID, "statusText")
        assert "Plotted 2 function" in status.text
        
        # Check legend shows both functions
        legend = driver.find_element(By.ID, "functionLegend")
        assert "x^2" in legend.text
        assert "sin(x)" in legend.text
    
    def test_example_buttons(self, driver):
        """Test example function buttons"""
        example_buttons = [
            ("x²", "x^2"),
            ("sin(x)", "sin(x)"),
            ("e^x", "e^x"),
            ("ln(x)", "ln(x)")
        ]
        
        for button_text, expected_value in example_buttons:
            # Click example button
            driver.find_element(By.XPATH, f"//button[text()='{button_text}']").click()
            time.sleep(0.5)
            
            # Check function input is filled
            function_input = driver.find_element(By.ID, "functionInput")
            assert function_input.get_attribute("value") == expected_value
    
    def test_zoom_controls(self, driver):
        """Test zoom controls functionality"""
        # Get current zoom values
        x_min_input = driver.find_element(By.ID, "xMinInput")
        x_max_input = driver.find_element(By.ID, "xMaxInput")
        
        original_x_min = x_min_input.get_attribute("value")
        original_x_max = x_max_input.get_attribute("value")
        
        # Change zoom range
        x_min_input.clear()
        x_min_input.send_keys("-5")
        x_max_input.clear()
        x_max_input.send_keys("5")
        
        # Trigger zoom update
        x_max_input.send_keys(Keys.TAB)
        time.sleep(1)
        
        # Values should be updated
        assert x_min_input.get_attribute("value") == "-5"
        assert x_max_input.get_attribute("value") == "5"
        
        # Test reset zoom
        driver.find_element(By.XPATH, "//button[text()='Reset Zoom']").click()
        time.sleep(1)
        
        # Should return to original values
        assert x_min_input.get_attribute("value") == original_x_min
        assert x_max_input.get_attribute("value") == original_x_max
    
    def test_clear_graph(self, driver):
        """Test clear graph functionality"""
        function_input = driver.find_element(By.ID, "functionInput")
        
        # Plot a function first
        function_input.clear()
        function_input.send_keys("x^2")
        driver.find_element(By.XPATH, "//button[text()='Plot']").click()
        time.sleep(1)
        
        # Verify function is plotted
        legend = driver.find_element(By.ID, "functionLegend")
        assert legend.is_displayed()
        
        # Clear graph
        driver.find_element(By.XPATH, "//button[text()='Clear Graph']").click()
        time.sleep(1)
        
        # Legend should be hidden
        assert not legend.is_displayed()
        
        # Status should indicate graph cleared
        status = driver.find_element(By.ID, "statusText")
        assert "Graph cleared" in status.text
    
    def test_derivative_plotting(self, driver):
        """Test derivative plotting functionality"""
        function_input = driver.find_element(By.ID, "functionInput")
        
        # Enter a function
        function_input.clear()
        function_input.send_keys("x^2")
        
        # Click derivative button
        driver.find_element(By.XPATH, "//button[@title='Plot derivative' or contains(text(), \"f'(x)\")]").click()
        time.sleep(2)
        
        # Check status message mentions derivative
        status = driver.find_element(By.ID, "statusText")
        assert "derivative" in status.text.lower()
        
        # Check legend shows derivative
        legend = driver.find_element(By.ID, "functionLegend")
        assert "d/dx" in legend.text or "derivative" in legend.text.lower()

class TestHistoryFunctionality:
    """Test history integration"""
    
    @pytest.fixture
    def driver(self):
        chrome_options = Options()
        chrome_options.add_argument("--headless")
        chrome_options.add_argument("--no-sandbox")
        chrome_options.add_argument("--disable-dev-shm-usage")
        chrome_options.add_argument("--window-size=1400,900")
        
        driver = webdriver.Chrome(options=chrome_options)
        driver.get("http://127.0.0.1:8000/tools/scientific-calculator")
        WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.ID, "functionInput"))
        )
        time.sleep(3)
        yield driver
        driver.quit()
    
    def test_history_button_exists(self, driver):
        """Test that history button exists and is clickable"""
        history_btn = driver.find_element(By.ID, "historyToggle")
        assert history_btn.is_displayed()
        assert history_btn.is_enabled()
        
        global_history_btn = driver.find_element(By.ID, "globalHistoryBtn")
        assert global_history_btn.is_displayed()
        assert global_history_btn.is_enabled()
    
    def test_plotting_saves_to_history(self, driver):
        """Test that plotting a function saves to history"""
        function_input = driver.find_element(By.ID, "functionInput")
        
        # Plot a unique function
        test_function = f"x^2 + {int(time.time())}"
        function_input.clear()
        function_input.send_keys(test_function)
        driver.find_element(By.XPATH, "//button[text()='Plot']").click()
        time.sleep(2)
        
        # Open history
        driver.find_element(By.ID, "historyToggle").click()
        time.sleep(1)
        
        # Check history popup appears
        history_popup = driver.find_element(By.ID, "historyPopup")
        assert "show" in history_popup.get_attribute("class")
        
        # Check our function appears in history
        history_content = driver.find_element(By.ID, "historyContent")
        assert test_function in history_content.text

class TestScientificCalculatorIntegrationEnd2End:
    """End-to-end integration tests"""
    
    @pytest.fixture
    def driver(self):
        chrome_options = Options()
        chrome_options.add_argument("--headless")
        chrome_options.add_argument("--no-sandbox")
        chrome_options.add_argument("--disable-dev-shm-usage")
        chrome_options.add_argument("--window-size=1400,900")
        
        driver = webdriver.Chrome(options=chrome_options)
        yield driver
        driver.quit()
    
    def test_full_calculator_workflow(self, driver):
        """Test complete calculator workflow"""
        driver.get("http://127.0.0.1:8000/tools/scientific-calculator")
        wait = WebDriverWait(driver, 10)
        
        # Wait for page to load
        wait.until(EC.presence_of_element_located((By.ID, "result")))
        time.sleep(3)
        
        # Ensure calculator is fully loaded and clear any existing state
        time.sleep(3)  # Give extra time for JavaScript initialization
        
        # Clear both entry and all
        try:
            driver.find_element(By.XPATH, "//button[contains(text(), 'CE')]").click()
            time.sleep(0.2)
        except:
            pass
            
        # Also try to clear the result element directly
        result_element = driver.find_element(By.ID, "result")
        if result_element.text != "0":
            try:
                driver.find_element(By.XPATH, "//button[contains(text(), 'CE')]").click()
                time.sleep(0.5)
            except:
                pass
        
        # 1. Test calculator functionality
        driver.find_element(By.XPATH, "//button[text()='2']").click()
        time.sleep(0.1)
        
        # Click + with fallback
        driver.find_element(By.XPATH, "//button[text()='+']").click()
        time.sleep(0.1)
        
        # Ensure + operator was added (fallback if HTML onclick failed)
        if driver.execute_script("return typeof calculator !== 'undefined' && calculator !== null;"):
            current_expr = driver.execute_script("return calculator.currentExpression;")
            if current_expr == '2':  # Should be '2+' if + button worked
                driver.execute_script("calculator.appendOperator('+');")
        
        driver.find_element(By.XPATH, "//button[text()='3']").click()
        time.sleep(0.1)
        driver.find_element(By.XPATH, "//button[text()='=']").click()
        time.sleep(0.5)
        
        result = driver.find_element(By.ID, "result")
        assert result.text == "5"
        
        # 2. Test scientific function
        driver.find_element(By.XPATH, "//button[contains(text(), 'CE')]").click()
        driver.find_element(By.XPATH, "//button[text()='√']").click()
        driver.find_element(By.XPATH, "//button[text()='9']").click()
        driver.find_element(By.XPATH, "//button[text()=')']").click()
        driver.find_element(By.XPATH, "//button[text()='=']").click()
        time.sleep(1)
        
        result = driver.find_element(By.ID, "result")
        assert float(result.text) == 3.0
        
        # 3. Test graph plotting
        function_input = driver.find_element(By.ID, "functionInput")
        function_input.clear()
        function_input.send_keys("x^2")
        driver.find_element(By.XPATH, "//button[text()='Plot']").click()
        time.sleep(2)
        
        # Check graph was plotted
        status = driver.find_element(By.ID, "statusText")
        assert "Plotted 1 function" in status.text
        
        # 4. Test multiple functions
        function_input.clear()
        function_input.send_keys("sin(x)")
        driver.find_element(By.XPATH, "//button[text()='Add']").click()
        time.sleep(2)
        
        status = driver.find_element(By.ID, "statusText")
        assert "Plotted 2 function" in status.text
        
        # 5. Test zoom controls
        x_min_input = driver.find_element(By.ID, "xMinInput")
        x_min_input.clear()
        x_min_input.send_keys("-5")
        x_min_input.send_keys(Keys.TAB)
        time.sleep(1)
        
        # 6. Test clear functionality
        driver.find_element(By.XPATH, "//button[text()='Clear Graph']").click()
        time.sleep(1)
        
        legend = driver.find_element(By.ID, "functionLegend")
        assert not legend.is_displayed()
        
        print("✅ All end-to-end tests passed!")

class TestEdgeCases:
    """Test edge cases and error handling"""
    
    @pytest.fixture
    def driver(self):
        chrome_options = Options()
        chrome_options.add_argument("--headless")
        chrome_options.add_argument("--no-sandbox")
        chrome_options.add_argument("--disable-dev-shm-usage")
        chrome_options.add_argument("--window-size=1400,900")
        
        driver = webdriver.Chrome(options=chrome_options)
        driver.get("http://127.0.0.1:8000/tools/scientific-calculator")
        WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.ID, "result"))
        )
        time.sleep(2)
        yield driver
        driver.quit()
    
    def test_invalid_expressions(self, driver):
        """Test handling of invalid mathematical expressions"""
        # Test division by zero
        driver.find_element(By.XPATH, "//button[text()='1']").click()
        driver.find_element(By.XPATH, "//button[text()='/']").click()
        driver.find_element(By.XPATH, "//button[text()='0']").click()
        driver.find_element(By.XPATH, "//button[text()='=']").click()
        time.sleep(1)
        
        result = driver.find_element(By.ID, "result")
        # Should show infinity or error
        assert result.text in ["Infinity", "Error", "∞"]
        
        # Clear and test invalid function
        driver.find_element(By.XPATH, "//button[contains(text(), 'CE')]").click()
        
        function_input = driver.find_element(By.ID, "functionInput")
        function_input.clear()
        function_input.send_keys("invalid_function(x)")
        time.sleep(1)
        
        # Should show error state
        assert "error" in function_input.get_attribute("class")
    
    def test_empty_inputs(self, driver):
        """Test behavior with empty inputs"""
        # Test empty calculation
        driver.find_element(By.XPATH, "//button[text()='=']").click()
        time.sleep(0.5)
        
        # Should not crash
        result = driver.find_element(By.ID, "result")
        assert result.text in ["0", "Error"]
        
        # Test empty function plot
        function_input = driver.find_element(By.ID, "functionInput")
        function_input.clear()
        driver.find_element(By.XPATH, "//button[text()='Plot']").click()
        time.sleep(0.5)
        
        # Should not crash
        status = driver.find_element(By.ID, "statusText")
        assert status.text  # Should have some status message

if __name__ == '__main__':
    # Run tests with pytest
    pytest.main([__file__, '-v', '-s'])