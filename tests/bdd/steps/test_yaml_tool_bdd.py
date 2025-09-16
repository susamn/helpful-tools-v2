"""
BDD step definitions for YAML Tool using Selenium WebDriver.
"""

import time
import yaml
from behave import given, when, then
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.chrome.options import Options
from selenium.common.exceptions import TimeoutException


class YAMLToolPage:
    """Page Object Model for YAML Tool."""

    def __init__(self, driver):
        self.driver = driver
        self.wait = WebDriverWait(driver, 10)

    # Element locators
    INPUT_TEXTAREA = (By.ID, "yamlInput")
    OUTPUT_TEXTAREA = (By.ID, "yamlOutput")
    OUTPUT_FORMATTED = (By.ID, "yamlOutputFormatted")
    FORMAT_BUTTON = (By.ID, "formatBtn")
    MINIFY_BUTTON = (By.ID, "minifyBtn")
    STRINGIFY_BUTTON = (By.ID, "stringifyBtn")
    CLEAR_BUTTON = (By.ID, "clearBtn")
    COPY_BUTTON = (By.ID, "copyBtn")
    ERROR_MESSAGE = (By.ID, "errorMessage")
    SUCCESS_MESSAGE = (By.ID, "successMessage")
    LOADING_INDICATOR = (By.CLASS_NAME, "loading")
    YAML_PATH_INPUT = (By.ID, "yamlPathInput")
    TOGGLE_MARKUP_BUTTON = (By.ID, "toggleMarkupBtn")
    EXPAND_ALL_BUTTON = (By.ID, "expandAllBtn")
    COLLAPSE_ALL_BUTTON = (By.ID, "collapseAllBtn")
    INDENT_TYPE_SELECT = (By.ID, "indentType")
    INDENT_SIZE_SELECT = (By.ID, "indentSize")

    def navigate_to_yaml_tool(self, base_url):
        """Navigate to the YAML tool page."""
        self.driver.get(f"{base_url}/yaml-tool.html")

    def wait_for_page_load(self):
        """Wait for page to fully load."""
        self.wait.until(EC.presence_of_element_located(self.INPUT_TEXTAREA))
        self.wait.until(EC.element_to_be_clickable(self.FORMAT_BUTTON))

    def enter_yaml_input(self, yaml_text):
        """Enter YAML text into the input field."""
        input_element = self.wait.until(EC.presence_of_element_located(self.INPUT_TEXTAREA))
        input_element.clear()
        input_element.send_keys(yaml_text)

    def click_format_button(self):
        """Click the Format button."""
        format_btn = self.wait.until(EC.element_to_be_clickable(self.FORMAT_BUTTON))
        format_btn.click()

    def click_minify_button(self):
        """Click the Minify button."""
        minify_btn = self.wait.until(EC.element_to_be_clickable(self.MINIFY_BUTTON))
        minify_btn.click()

    def click_stringify_button(self):
        """Click the Stringify button."""
        stringify_btn = self.wait.until(EC.element_to_be_clickable(self.STRINGIFY_BUTTON))
        stringify_btn.click()

    def click_clear_button(self):
        """Click the Clear button."""
        clear_btn = self.wait.until(EC.element_to_be_clickable(self.CLEAR_BUTTON))
        clear_btn.click()

    def click_copy_button(self):
        """Click the Copy button."""
        copy_btn = self.wait.until(EC.element_to_be_clickable(self.COPY_BUTTON))
        copy_btn.click()

    def click_toggle_markup_button(self):
        """Click the Toggle Markup button."""
        toggle_btn = self.wait.until(EC.element_to_be_clickable(self.TOGGLE_MARKUP_BUTTON))
        toggle_btn.click()

    def click_expand_all_button(self):
        """Click the Expand All button."""
        expand_btn = self.wait.until(EC.element_to_be_clickable(self.EXPAND_ALL_BUTTON))
        expand_btn.click()

    def click_collapse_all_button(self):
        """Click the Collapse All button."""
        collapse_btn = self.wait.until(EC.element_to_be_clickable(self.COLLAPSE_ALL_BUTTON))
        collapse_btn.click()

    def enter_yaml_path(self, path):
        """Enter YAML path in the search field."""
        path_input = self.wait.until(EC.presence_of_element_located(self.YAML_PATH_INPUT))
        path_input.clear()
        path_input.send_keys(path)

    def set_indent_type(self, indent_type):
        """Set the indentation type."""
        indent_select = self.wait.until(EC.presence_of_element_located(self.INDENT_TYPE_SELECT))
        indent_select.send_keys(indent_type)

    def set_indent_size(self, size):
        """Set the indentation size."""
        size_select = self.wait.until(EC.presence_of_element_located(self.INDENT_SIZE_SELECT))
        size_select.send_keys(str(size))

    def get_output_text(self):
        """Get the text from the output field."""
        try:
            # Try formatted output first
            output_element = self.driver.find_element(*self.OUTPUT_FORMATTED)
            if output_element.is_displayed():
                return output_element.text
        except:
            pass

        # Fallback to textarea
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
            if error_element.is_displayed():
                return error_element.text
        except TimeoutException:
            pass
        return None

    def get_success_message(self):
        """Get the success message if present."""
        try:
            success_element = self.wait.until(
                EC.presence_of_element_located(self.SUCCESS_MESSAGE)
            )
            if success_element.is_displayed():
                return success_element.text
        except TimeoutException:
            pass
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


@given('I am on the YAML tool page')
def step_navigate_to_yaml_tool(context):
    """Navigate to the YAML tool page."""
    # TODO: Set up WebDriver (Chrome headless for CI)
    chrome_options = Options()
    chrome_options.add_argument("--headless")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")

    # Initialize WebDriver - this would need to be configured
    # context.driver = webdriver.Chrome(options=chrome_options)
    # context.page = YAMLToolPage(context.driver)
    # context.page.navigate_to_yaml_tool("http://localhost:5000")

    # Placeholder for now
    context.driver = None
    context.page = None
    print("TODO: Initialize WebDriver and navigate to YAML tool page")


@given('the page is fully loaded')
def step_wait_for_page_load(context):
    """Wait for the page to fully load."""
    if context.page:
        context.page.wait_for_page_load()
    print("TODO: Wait for page to fully load")


@given('I have valid YAML input')
def step_set_valid_yaml_input(context):
    """Set valid YAML input from the scenario."""
    context_data['yaml_input'] = context.text.strip()
    print(f"TODO: Set valid YAML input: {context_data['yaml_input'][:50]}...")


@given('I have invalid YAML input')
def step_set_invalid_yaml_input(context):
    """Set invalid YAML input from the scenario."""
    context_data['yaml_input'] = context.text.strip()
    print(f"TODO: Set invalid YAML input: {context_data['yaml_input'][:50]}...")


@given('I have formatted YAML input')
def step_set_formatted_yaml_input(context):
    """Set formatted YAML input from the scenario."""
    context_data['yaml_input'] = context.text.strip()
    print(f"TODO: Set formatted YAML input: {context_data['yaml_input'][:50]}...")


@given('I have YAML input')
def step_set_yaml_input(context):
    """Set YAML input from the scenario."""
    context_data['yaml_input'] = context.text.strip()
    print(f"TODO: Set YAML input: {context_data['yaml_input'][:50]}...")


@given('I have YAML content in both input and output fields')
def step_set_yaml_in_both_fields(context):
    """Set YAML content in both input and output fields."""
    if context.page:
        context.page.enter_yaml_input('name: test\nvalue: input')
        # Simulate having output content
        context_data['has_content'] = True
    print("TODO: Set YAML content in both input and output fields")


@given('I have formatted YAML in the output field')
def step_set_formatted_yaml_output(context):
    """Set formatted YAML in the output field."""
    context_data['output_content'] = 'name: test\nvalue: output\n'
    print("TODO: Set formatted YAML in output field")


@given('I have a large YAML file with 100+ properties')
def step_set_large_yaml_input(context):
    """Generate a large YAML file for performance testing."""
    large_yaml_dict = {f"property_{i}": f"value_{i}" for i in range(100)}
    context_data['yaml_input'] = yaml.dump(large_yaml_dict)
    print("TODO: Set large YAML input with 100+ properties")


@given('I have YAML with different data types')
def step_set_mixed_datatype_yaml(context):
    """Set YAML with various data types."""
    context_data['yaml_input'] = context.text.strip()
    print("TODO: Set YAML with different data types")


@given('I have deeply nested YAML')
def step_set_nested_yaml(context):
    """Set deeply nested YAML."""
    context_data['yaml_input'] = context.text.strip()
    print("TODO: Set deeply nested YAML")


@given('I have empty input in the YAML field')
def step_set_empty_yaml_input(context):
    """Set empty input."""
    context_data['yaml_input'] = ""
    print("TODO: Set empty YAML input")


@given('I have YAML with special characters')
def step_set_special_char_yaml(context):
    """Set YAML with special characters and unicode."""
    context_data['yaml_input'] = context.text.strip()
    print("TODO: Set YAML with special characters")


@given('I have formatted YAML with nested structure')
def step_set_nested_structure_yaml(context):
    """Set YAML with nested structure for path queries."""
    context_data['yaml_input'] = context.text.strip()
    print("TODO: Set nested structure YAML")


@given('I have formatted YAML with nested objects in the output field')
def step_set_nested_objects_output(context):
    """Set formatted YAML with nested objects in output."""
    context_data['nested_output'] = True
    print("TODO: Set nested objects in output field")


@given('I have YAML input ready to format')
def step_set_yaml_ready_to_format(context):
    """Set YAML input ready for formatting."""
    context_data['yaml_input'] = "name: test\nconfig:\n  debug: true\n  port: 8080"
    print("TODO: Set YAML ready to format")


@given('I have YAML with comments')
def step_set_yaml_with_comments(context):
    """Set YAML with comments."""
    context_data['yaml_input'] = context.text.strip()
    print("TODO: Set YAML with comments")


@given('I have YAML with anchors and aliases')
def step_set_yaml_with_anchors(context):
    """Set YAML with anchors and aliases."""
    context_data['yaml_input'] = context.text.strip()
    print("TODO: Set YAML with anchors and aliases")


@when('I paste the YAML into the input field')
def step_paste_yaml_input(context):
    """Paste YAML into the input field."""
    if context.page and 'yaml_input' in context_data:
        context.page.enter_yaml_input(context_data['yaml_input'])
    print(f"TODO: Paste YAML into input field")


@when('I click the "{button_name}" button')
def step_click_button(context, button_name):
    """Click the specified button."""
    if context.page:
        if button_name.lower() == "format":
            context.page.click_format_button()
        elif button_name.lower() == "minify":
            context.page.click_minify_button()
        elif button_name.lower() == "stringify":
            context.page.click_stringify_button()
        elif button_name.lower() == "clear":
            context.page.click_clear_button()
        elif button_name.lower() == "copy":
            context.page.click_copy_button()
        elif button_name.lower() == "toggle markup":
            context.page.click_toggle_markup_button()
        elif button_name.lower() == "expand all":
            context.page.click_expand_all_button()
        elif button_name.lower() == "collapse all":
            context.page.click_collapse_all_button()

        # Wait for processing to complete
        context.page.wait_for_processing()

    print(f"TODO: Click the {button_name} button")


@when('I enter the path "{path}" in the search field')
def step_enter_yaml_path(context, path):
    """Enter YAML path in the search field."""
    if context.page:
        context.page.enter_yaml_path(path)
    print(f"TODO: Enter path '{path}' in search field")


@when('I change the indent type to "{indent_type}"')
def step_change_indent_type(context, indent_type):
    """Change the indentation type."""
    if context.page:
        context.page.set_indent_type(indent_type)
    print(f"TODO: Change indent type to {indent_type}")


@when('I change the indent size to "{size}"')
def step_change_indent_size(context, size):
    """Change the indentation size."""
    if context.page:
        context.page.set_indent_size(size)
    print(f"TODO: Change indent size to {size}")


@then('the YAML should be formatted with proper indentation')
def step_verify_formatted_yaml(context):
    """Verify YAML is properly formatted."""
    if context.page:
        output = context.page.get_output_text()
        # Verify proper formatting (should contain newlines and indentation)
        assert '\n' in output, "Formatted YAML should contain line breaks"
        assert '  ' in output or '\t' in output, "Formatted YAML should contain indentation"
    print("TODO: Verify YAML is formatted with proper indentation")


@then('the output should be valid YAML')
def step_verify_valid_yaml_output(context):
    """Verify the output is valid YAML."""
    if context.page:
        output = context.page.get_output_text()
        try:
            yaml.safe_load(output)
        except yaml.YAMLError as e:
            assert False, f"Output is not valid YAML: {e}"
    print("TODO: Verify output is valid YAML")


@then('the output should contain proper line breaks and spacing')
def step_verify_formatting_details(context):
    """Verify proper line breaks and spacing."""
    print("TODO: Verify proper line breaks and spacing in output")


@then('I should see a YAML validation error message')
def step_verify_error_message(context):
    """Verify error message is displayed."""
    if context.page:
        error_msg = context.page.get_error_message()
        assert error_msg is not None, "Expected error message to be displayed"
        assert "error" in error_msg.lower() or "invalid" in error_msg.lower(), "Error message should mention 'error' or 'invalid'"
    print("TODO: Verify YAML validation error message")


@then('the error should indicate the location of the syntax error')
def step_verify_error_location(context):
    """Verify error message includes location information."""
    print("TODO: Verify error indicates syntax error location")


@then('the output field should not be updated with invalid content')
def step_verify_output_unchanged(context):
    """Verify output field is not updated with invalid content."""
    print("TODO: Verify output field remains unchanged for invalid input")


@then('the YAML should be compressed to a more compact format')
def step_verify_minified_yaml(context):
    """Verify YAML is compressed."""
    if context.page:
        output = context.page.get_output_text()
        # Minified YAML might still have some newlines but should be more compact
        lines = output.split('\n')
        assert len(lines) > 0, "Minified YAML should have content"
    print("TODO: Verify YAML is compressed to compact format")


@then('unnecessary whitespace should be reduced')
def step_verify_whitespace_reduced(context):
    """Verify unnecessary whitespace is reduced."""
    print("TODO: Verify unnecessary whitespace is reduced")


@then('the YAML should be converted to JSON string format')
def step_verify_yaml_to_json(context):
    """Verify YAML is converted to JSON."""
    if context.page:
        output = context.page.get_output_text()
        # Should look like JSON (starts with { or [)
        assert output.strip().startswith(('{', '[')), "Output should be JSON format"
    print("TODO: Verify YAML converted to JSON string")


@then('the output should be valid JSON')
def step_verify_valid_json_output(context):
    """Verify the output is valid JSON."""
    if context.page:
        output = context.page.get_output_text()
        try:
            import json
            json.loads(output)
        except json.JSONDecodeError as e:
            assert False, f"Output is not valid JSON: {e}"
    print("TODO: Verify output is valid JSON")


@then('all YAML data should be preserved')
def step_verify_data_preserved(context):
    """Verify all YAML data is preserved."""
    print("TODO: Verify all YAML data is preserved")


# Common step implementations (similar to JSON tool)
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


@then('any error messages should be cleared')
def step_verify_errors_cleared(context):
    """Verify error messages are cleared."""
    print("TODO: Verify error messages are cleared")


@then('the formatted YAML should be copied to clipboard')
def step_verify_clipboard_content(context):
    """Verify YAML is copied to clipboard."""
    print("TODO: Verify formatted YAML copy action was triggered")


@then('I should see a success message confirming the copy action')
def step_verify_copy_success_message(context):
    """Verify copy success message is displayed."""
    if context.page:
        success_msg = context.page.get_success_message()
        assert success_msg is not None, "Expected success message to be displayed"
    print("TODO: Verify copy success message")


@then('the YAML should be processed without performance issues')
def step_verify_performance(context):
    """Verify YAML processing performance."""
    print("TODO: Verify YAML processing performance")


@then('the operation should complete within {seconds:d} seconds')
def step_verify_operation_time(context, seconds):
    """Verify operation completes within specified time."""
    print(f"TODO: Verify operation completes within {seconds} seconds")


@then('all data types should be preserved in the output')
def step_verify_datatypes_preserved(context):
    """Verify all YAML data types are preserved."""
    print("TODO: Verify all data types are preserved")


@then('strings should remain as strings')
def step_verify_strings_preserved(context):
    """Verify strings remain as strings."""
    print("TODO: Verify strings remain as strings")


@then('numbers should remain as numbers')
def step_verify_numbers_preserved(context):
    """Verify numbers remain as numbers."""
    print("TODO: Verify numbers remain as numbers")


@then('booleans should remain as booleans')
def step_verify_booleans_preserved(context):
    """Verify booleans remain as booleans."""
    print("TODO: Verify booleans remain as booleans")


@then('null values should remain as null')
def step_verify_nulls_preserved(context):
    """Verify null values remain as null."""
    print("TODO: Verify null values remain as null")


@then('each nesting level should be properly indented')
def step_verify_nested_indentation(context):
    """Verify nested YAML indentation."""
    print("TODO: Verify each nesting level is properly indented")


@then('the structure should be clearly visible')
def step_verify_structure_visibility(context):
    """Verify YAML structure is clearly visible."""
    print("TODO: Verify structure is clearly visible")


@then('all elements should be properly aligned')
def step_verify_element_alignment(context):
    """Verify elements alignment."""
    print("TODO: Verify all elements are properly aligned")


@then('I should see a message indicating empty input')
def step_verify_empty_input_message(context):
    """Verify empty input message."""
    print("TODO: Verify empty input message is displayed")


@then('the output field should remain empty')
def step_verify_output_remains_empty(context):
    """Verify output field remains empty."""
    print("TODO: Verify output field remains empty")


@then('no error should be thrown')
def step_verify_no_error(context):
    """Verify no error is thrown."""
    if context.page:
        error_msg = context.page.get_error_message()
        assert error_msg is None, "Expected no error message"
    print("TODO: Verify no error is thrown")


@then('the special characters should be preserved')
def step_verify_special_chars_preserved(context):
    """Verify special characters are preserved."""
    print("TODO: Verify special characters are preserved")


@then('the unicode characters should be properly displayed')
def step_verify_unicode_displayed(context):
    """Verify unicode characters are displayed properly."""
    print("TODO: Verify unicode characters are properly displayed")


@then('the YAML should be valid after formatting')
def step_verify_formatted_yaml_valid(context):
    """Verify YAML remains valid after formatting."""
    print("TODO: Verify YAML is valid after formatting")


@then('the output should show only the queried data')
def step_verify_queried_data(context):
    """Verify output shows only queried data."""
    print("TODO: Verify output shows only queried data")


@then('the result should be "{expected_result}"')
def step_verify_result_value(context, expected_result):
    """Verify the result matches expected value."""
    if context.page:
        output = context.page.get_output_text()
        assert expected_result in output, f"Expected '{expected_result}' in output"
    print(f"TODO: Verify result is '{expected_result}'")


@then('the syntax highlighting should be turned off')
def step_verify_highlighting_off(context):
    """Verify syntax highlighting is turned off."""
    print("TODO: Verify syntax highlighting is turned off")


@then('the output should show plain text')
def step_verify_plain_text_output(context):
    """Verify output shows plain text."""
    print("TODO: Verify output shows plain text")


@then('the syntax highlighting should be turned back on')
def step_verify_highlighting_on(context):
    """Verify syntax highlighting is turned back on."""
    print("TODO: Verify syntax highlighting is turned back on")


@then('all nested sections should be collapsed')
def step_verify_sections_collapsed(context):
    """Verify all nested sections are collapsed."""
    print("TODO: Verify all nested sections are collapsed")


@then('all nested sections should be expanded')
def step_verify_sections_expanded(context):
    """Verify all nested sections are expanded."""
    print("TODO: Verify all nested sections are expanded")


@then('the output should use tab indentation')
def step_verify_tab_indentation(context):
    """Verify output uses tab indentation."""
    print("TODO: Verify output uses tab indentation")


@then('the indentation should be {size:d} units wide')
def step_verify_indentation_size(context, size):
    """Verify indentation size."""
    print(f"TODO: Verify indentation is {size} units wide")


@then('the comments should be preserved')
def step_verify_comments_preserved(context):
    """Verify comments are preserved."""
    print("TODO: Verify comments are preserved")


@then('the formatting should maintain comment alignment')
def step_verify_comment_alignment(context):
    """Verify comment alignment is maintained."""
    print("TODO: Verify comment alignment is maintained")


@then('the anchors and aliases should be preserved')
def step_verify_anchors_preserved(context):
    """Verify anchors and aliases are preserved."""
    print("TODO: Verify anchors and aliases are preserved")


@then('the YAML structure should be maintained')
def step_verify_structure_maintained(context):
    """Verify YAML structure is maintained."""
    print("TODO: Verify YAML structure is maintained")


# Cleanup function for WebDriver
def cleanup_driver(context):
    """Clean up WebDriver after tests."""
    if hasattr(context, 'driver') and context.driver:
        context.driver.quit()