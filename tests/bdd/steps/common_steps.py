"""
Common BDD steps shared across multiple tool tests.
"""

from behave import given, when, then

# Common page loading step
@given('the page is fully loaded')
def step_wait_for_page_load(context):
    """Wait for the page to fully load."""
    if context.page:
        context.page.wait_for_page_load()
    print("TODO: Wait for page to fully load")

# Common button click step
@when('I click the "{button_name}" button')
def step_click_button(context, button_name):
    """Click the specified button."""
    if context.page:
        if button_name.lower() == "format":
            context.page.click_format_button()
        elif button_name.lower() == "minify":
            context.page.click_minify_button()
        elif button_name.lower() == "copy":
            context.page.click_copy_button()
    print(f"TODO: Click {button_name} button")

# Common validation steps
@then('all data types should be preserved in the output')
def step_validate_data_types_preserved(context):
    """Validate that all data types are preserved."""
    print("TODO: Validate data types preserved")

@then('any error messages should be cleared')
def step_error_messages_cleared(context):
    """Validate that error messages are cleared."""
    print("TODO: Validate error messages cleared")

@then('booleans should remain as booleans')
def step_validate_booleans(context):
    """Validate boolean preservation."""
    print("TODO: Validate booleans")

@then('each nesting level should be properly indented')
def step_validate_indentation(context):
    """Validate proper indentation."""
    print("TODO: Validate indentation")

@then('I should see a message indicating empty input')
def step_validate_empty_input_message(context):
    """Validate empty input message."""
    print("TODO: Validate empty input message")

@then('I should see a success message confirming the copy action')
def step_validate_copy_success(context):
    """Validate copy success message."""
    print("TODO: Validate copy success")

@then('no error should be thrown')
def step_validate_no_error(context):
    """Validate no error occurs."""
    print("TODO: Validate no error")

@then('null values should remain as null')
def step_validate_nulls(context):
    """Validate null preservation."""
    print("TODO: Validate nulls")

@then('numbers should remain as numbers')
def step_validate_numbers(context):
    """Validate number preservation."""
    print("TODO: Validate numbers")

@then('strings should remain as strings')
def step_validate_strings(context):
    """Validate string preservation."""
    print("TODO: Validate strings")