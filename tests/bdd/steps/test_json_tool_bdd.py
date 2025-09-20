"""
BDD step definitions for JSON Tool using Selenium WebDriver.
"""

import json
import time
from behave import given, when, then
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.chrome.options import Options
from selenium.common.exceptions import TimeoutException


class JSONToolPage:
    """Page Object Model for JSON Tool."""

    def __init__(self, driver):
        self.driver = driver
        self.wait = WebDriverWait(driver, 10)

    # Element locators
    INPUT_TEXTAREA = (By.ID, "json-input")
    OUTPUT_TEXTAREA = (By.ID, "json-output")
    FORMAT_BUTTON = (By.ID, "format-btn")
    MINIFY_BUTTON = (By.ID, "minify-btn")
    CLEAR_BUTTON = (By.ID, "clear-btn")
    COPY_BUTTON = (By.ID, "copy-btn")
    ERROR_MESSAGE = (By.ID, "error-message")
    SUCCESS_MESSAGE = (By.ID, "success-message")
    LOADING_INDICATOR = (By.CLASS_NAME, "loading")

    def navigate_to_json_tool(self, base_url):
        """Navigate to the JSON tool page."""
        self.driver.get(f"{base_url}/json-tool.html")

    def wait_for_page_load(self):
        """Wait for page to fully load."""
        self.wait.until(EC.presence_of_element_located(self.INPUT_TEXTAREA))
        self.wait.until(EC.element_to_be_clickable(self.FORMAT_BUTTON))

    def enter_json_input(self, json_text):
        """Enter JSON text into the input field."""
        input_element = self.wait.until(EC.presence_of_element_located(self.INPUT_TEXTAREA))
        input_element.clear()
        input_element.send_keys(json_text)

    def click_format_button(self):
        """Click the Format button."""
        format_btn = self.wait.until(EC.element_to_be_clickable(self.FORMAT_BUTTON))
        format_btn.click()

    def click_minify_button(self):
        """Click the Minify button."""
        minify_btn = self.wait.until(EC.element_to_be_clickable(self.MINIFY_BUTTON))
        minify_btn.click()

    def click_clear_button(self):
        """Click the Clear button."""
        clear_btn = self.wait.until(EC.element_to_be_clickable(self.CLEAR_BUTTON))
        clear_btn.click()

    def click_copy_button(self):
        """Click the Copy button."""
        copy_btn = self.wait.until(EC.element_to_be_clickable(self.COPY_BUTTON))
        copy_btn.click()

    def get_output_text(self):
        """Get the text from the output field."""
        output_element = self.wait.until(EC.presence_of_element_located(self.OUTPUT_TEXTAREA))
        return output_element.get_attribute("value") or output_element.text

    def get_input_text(self):
        """Get the text from the input field."""
        input_element = self.wait.until(EC.presence_of_element_located(self.INPUT_TEXTAREA))
        return input_element.get_attribute("value") or input_element.text

    def get_error_message(self):
        """Get the error message if present."""
        try:
            error_element = self.wait.until(
                EC.presence_of_element_located(self.ERROR_MESSAGE)
            )
            return error_element.text
        except TimeoutException:
            return None

    def get_success_message(self):
        """Get the success message if present."""
        try:
            success_element = self.wait.until(
                EC.presence_of_element_located(self.SUCCESS_MESSAGE)
            )
            return success_element.text
        except TimeoutException:
            return None

    def is_loading(self):
        """Check if loading indicator is visible."""
        try:
            self.driver.find_element(*self.LOADING_INDICATOR)
            return True
        except:
            return False

    def wait_for_processing(self, timeout=10):
        """Wait for processing to complete."""
        start_time = time.time()
        while self.is_loading() and (time.time() - start_time) < timeout:
            time.sleep(0.1)


# Global variables to store test context
context_data = {}


@given('I am on the JSON tool page')
def step_navigate_to_json_tool(context):
    """Navigate to the JSON tool page."""
    # TODO: Set up WebDriver (Chrome headless for CI)
    chrome_options = Options()
    chrome_options.add_argument("--headless")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")

    # Initialize WebDriver - this would need to be configured
    # context.driver = webdriver.Chrome(options=chrome_options)
    # context.page = JSONToolPage(context.driver)
    # context.page.navigate_to_json_tool("http://localhost:5000")

    # Placeholder for now
    context.driver = None
    context.page = None
    print("TODO: Initialize WebDriver and navigate to JSON tool page")


# @given('the page is fully loaded') - moved to common_steps.py


@given('I have valid JSON input')
def step_set_valid_json_input(context):
    """Set valid JSON input from the scenario."""
    context_data['json_input'] = context.text.strip()
    print(f"TODO: Set valid JSON input: {context_data['json_input'][:50]}...")


@given('I have invalid JSON input')
def step_set_invalid_json_input(context):
    """Set invalid JSON input from the scenario."""
    context_data['json_input'] = context.text.strip()
    print(f"TODO: Set invalid JSON input: {context_data['json_input'][:50]}...")


@given('I have formatted JSON input')
def step_set_formatted_json_input(context):
    """Set formatted JSON input from the scenario."""
    context_data['json_input'] = context.text.strip()
    print(f"TODO: Set formatted JSON input: {context_data['json_input'][:50]}...")


@given('I have JSON content in both input and output fields')
def step_set_json_in_both_fields(context):
    """Set JSON content in both input and output fields."""
    if context.page:
        context.page.enter_json_input('{"test": "input"}')
        # Simulate having output content
        context_data['has_content'] = True
    print("TODO: Set JSON content in both input and output fields")


@given('I have formatted JSON in the output field')
def step_set_formatted_json_output(context):
    """Set formatted JSON in the output field."""
    context_data['output_content'] = '{\n  "test": "output"\n}'
    print("TODO: Set formatted JSON in output field")


@given('I have a large JSON file with 1000+ properties')
def step_set_large_json_input(context):
    """Generate a large JSON file for performance testing."""
    large_json = {f"property_{i}": f"value_{i}" for i in range(1000)}
    context_data['json_input'] = json.dumps(large_json)
    print("TODO: Set large JSON input with 1000+ properties")


@given('I have JSON with different data types')
def step_set_mixed_datatype_json(context):
    """Set JSON with various data types."""
    context_data['json_input'] = context.text.strip()
    print("TODO: Set JSON with different data types")


@given('I have deeply nested JSON')
def step_set_nested_json(context):
    """Set deeply nested JSON."""
    context_data['json_input'] = context.text.strip()
    print("TODO: Set deeply nested JSON")


@given('I have empty input in the JSON field')
def step_set_empty_json_input(context):
    """Set empty input."""
    context_data['json_input'] = ""
    print("TODO: Set empty JSON input")


@given('I have JSON with special characters')
def step_set_special_char_json(context):
    """Set JSON with special characters and unicode."""
    context_data['json_input'] = context.text.strip()
    print("TODO: Set JSON with special characters")


@when('I paste the JSON into the input field')
def step_paste_json_input(context):
    """Paste JSON into the input field."""
    if context.page and 'json_input' in context_data:
        context.page.enter_json_input(context_data['json_input'])
    print(f"TODO: Paste JSON into input field")


# @when('I click the "{button_name}" button') - moved to common_steps.py


@then('the JSON should be formatted with proper indentation')
def step_verify_formatted_json(context):
    """Verify JSON is properly formatted."""
    if context.page:
        output = context.page.get_output_text()
        # Verify proper formatting (should contain newlines and indentation)
        assert '\n' in output, "Formatted JSON should contain line breaks"
        assert '  ' in output, "Formatted JSON should contain indentation"
    print("TODO: Verify JSON is formatted with proper indentation")


@then('the output should be valid JSON')
def step_verify_valid_json_output(context):
    """Verify the output is valid JSON."""
    if context.page:
        output = context.page.get_output_text()
        try:
            json.loads(output)
        except json.JSONDecodeError as e:
            assert False, f"Output is not valid JSON: {e}"
    print("TODO: Verify output is valid JSON")


@then('the output should contain proper line breaks and spacing')
def step_verify_formatting_details(context):
    """Verify proper line breaks and spacing."""
    print("TODO: Verify proper line breaks and spacing in output")


@then('I should see a JSON validation error message')
def step_verify_error_message(context):
    """Verify error message is displayed."""
    if context.page:
        error_msg = context.page.get_error_message()
        assert error_msg is not None, "Expected error message to be displayed"
        assert "error" in error_msg.lower(), "Error message should mention 'error'"
    print("TODO: Verify JSON validation error message")


@then('the error should indicate the location of the syntax error')
def step_verify_error_location(context):
    """Verify error message includes location information."""
    print("TODO: Verify error indicates syntax error location")


@then('the output field should not be updated with invalid content')
def step_verify_output_unchanged(context):
    """Verify output field is not updated with invalid content."""
    print("TODO: Verify output field remains unchanged for invalid input")


@then('the JSON should be compressed to a single line')
def step_verify_minified_json(context):
    """Verify JSON is compressed to single line."""
    if context.page:
        output = context.page.get_output_text()
        assert '\n' not in output.strip(), "Minified JSON should not contain line breaks"
    print("TODO: Verify JSON is compressed to single line")


@then('all unnecessary whitespace should be removed')
def step_verify_whitespace_removed(context):
    """Verify unnecessary whitespace is removed."""
    print("TODO: Verify unnecessary whitespace is removed")


@then('the input field should be empty')
def step_verify_input_empty(context):
    """Verify input field is empty."""
    if context.page:
        input_text = context.page.get_input_text()
        assert input_text.strip() == "", "Input field should be empty"
    print("TODO: Verify input field is empty")


@then('the output field should be empty')
def step_verify_output_empty(context):
    """Verify output field is empty."""
    if context.page:
        output_text = context.page.get_output_text()
        assert output_text.strip() == "", "Output field should be empty"
    print("TODO: Verify output field is empty")


# @then('any error messages should be cleared') - moved to common_steps.py


@then('the formatted JSON should be copied to clipboard')
def step_verify_clipboard_content(context):
    """Verify JSON is copied to clipboard."""
    # Note: Clipboard verification removed to avoid external dependencies
    # In actual implementation, this would verify the copy action was triggered
    print("TODO: Verify formatted JSON copy action was triggered (clipboard verification via DOM/JS events)")


# @then('I should see a success message confirming the copy action') - moved to common_steps.py


@then('the JSON should be processed without performance issues')
def step_verify_performance(context):
    """Verify JSON processing performance."""
    print("TODO: Verify JSON processing performance")


@then('the operation should complete within {seconds:d} seconds')
def step_verify_operation_time(context, seconds):
    """Verify operation completes within specified time."""
    print(f"TODO: Verify operation completes within {seconds} seconds")


# @then('all data types should be preserved in the output') - moved to common_steps.py


# @then('strings should remain as strings') - moved to common_steps.py
# @then('numbers should remain as numbers') - moved to common_steps.py
# @then('booleans should remain as booleans') - moved to common_steps.py
# @then('null values should remain as null') - moved to common_steps.py
# @then('each nesting level should be properly indented') - moved to common_steps.py


@then('the structure should be clearly visible')
def step_verify_structure_visibility(context):
    """Verify JSON structure is clearly visible."""
    print("TODO: Verify structure is clearly visible")


@then('all brackets and braces should be properly aligned')
def step_verify_bracket_alignment(context):
    """Verify brackets and braces alignment."""
    print("TODO: Verify brackets and braces are properly aligned")


# @then('I should see a message indicating empty input') - moved to common_steps.py


@then('the output field should remain empty')
def step_verify_output_remains_empty(context):
    """Verify output field remains empty."""
    print("TODO: Verify output field remains empty")


# @then('no error should be thrown') - moved to common_steps.py


@then('the special characters should be preserved')
def step_verify_special_chars_preserved(context):
    """Verify special characters are preserved."""
    print("TODO: Verify special characters are preserved")


@then('the unicode characters should be properly displayed')
def step_verify_unicode_displayed(context):
    """Verify unicode characters are displayed properly."""
    print("TODO: Verify unicode characters are properly displayed")


@then('the JSON should be valid after formatting')
def step_verify_formatted_json_valid(context):
    """Verify JSON remains valid after formatting."""
    print("TODO: Verify JSON is valid after formatting")


# Cleanup function for WebDriver
def cleanup_driver(context):
    """Clean up WebDriver after tests."""
    if hasattr(context, 'driver') and context.driver:
        context.driver.quit()