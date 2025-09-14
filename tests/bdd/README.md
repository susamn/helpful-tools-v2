# BDD Tests for Helpful Tools

This directory contains Behavior-Driven Development (BDD) tests using **Behave** and **Selenium** for UI testing of the Helpful Tools web application.

## 🏗️ Structure

```
tests/bdd/
├── features/                    # Gherkin feature files
│   └── json_formatter.feature   # JSON Formatter tool scenarios
├── steps/                       # Step definitions directory
│   ├── __init__.py             # Package init
│   └── test_json_formatter_bdd.py  # Step definitions for JSON Formatter
├── environment.py               # Behave environment setup
├── behave.ini                   # Behave configuration
└── README.md                    # This file
```

**Root level scripts:**
- `quick-start.sh` - Main project script with BDD support
- `run_bdd_tests.sh` - Dedicated BDD test runner
- `requirements.txt` - All dependencies (including BDD)

## 🚀 Quick Start

### 1. Install Dependencies & Start App

```bash
# From project root - this installs ALL dependencies including BDD
./quick-start.sh start

# Or install dependencies only
./quick-start.sh install
```

### 2. Run BDD Tests

```bash
# From project root - run all BDD tests
./quick-start.sh bdd

# Or use dedicated BDD runner
./run_bdd_tests.sh

# Run specific feature
./quick-start.sh bdd json_formatter.feature

# Run with specific browser
./run_bdd_tests.sh "" chrome
./run_bdd_tests.sh "" firefox

# Run in headed mode (show browser)
HEADLESS=false ./run_bdd_tests.sh

# Run with custom base URL
BASE_URL=http://localhost:3000 ./run_bdd_tests.sh
```

## 🧪 Test Features

### JSON Formatter Tool (`json_formatter.feature`)

**Scenarios covered:**
- ✅ Format valid JSON with pretty formatting
- ✅ Validate invalid JSON and show error
- ✅ Minify JSON to compact format
- ✅ Clear input and output fields
- ✅ Copy button interaction (UI testing without external clipboard dependencies)
- ✅ Handle large JSON files (performance)
- ✅ Preserve JSON data types during formatting
- ✅ Format nested JSON objects
- ✅ Handle empty JSON input
- ✅ Validate JSON with special characters and unicode

## 🔧 Configuration

### Environment Variables

- `BROWSER`: Browser to use (`chrome`, `firefox`) - default: `chrome`
- `HEADLESS`: Run in headless mode (`true`, `false`) - default: `true`
- `BASE_URL`: Application base URL - default: `http://localhost:5000`
- `TIMEOUT`: WebDriver timeout in seconds - default: `10`

### Example Usage

```bash
# Run tests with Firefox in headed mode
BROWSER=firefox HEADLESS=false behave

# Run with custom timeout and URL
TIMEOUT=30 BASE_URL=http://localhost:8080 behave

# Run only scenarios with specific tags
behave --tags=@smoke

# Run with detailed output
behave --format=pretty --show-timings
```

## 📝 Writing New Tests

### 1. Create Feature File

Create a new `.feature` file in `features/` directory:

```gherkin
Feature: New Tool
  As a user
  I want to use the new tool
  So that I can achieve my goal

  Scenario: Basic functionality
    Given I am on the new tool page
    When I perform an action
    Then I should see the expected result
```

### 2. Create Step Definitions

Create a corresponding `test_new_tool_bdd.py` file with step definitions:

```python
from behave import given, when, then

@given('I am on the new tool page')
def step_navigate_to_tool(context):
    context.driver.get(f"{context.base_url}/new-tool.html")

@when('I perform an action')
def step_perform_action(context):
    # Selenium interactions
    pass

@then('I should see the expected result')
def step_verify_result(context):
    # Assertions
    assert True
```

## 🎯 Best Practices

### Page Object Model
Use the Page Object Model pattern for maintainable tests:

```python
class NewToolPage:
    def __init__(self, driver):
        self.driver = driver
        self.wait = WebDriverWait(driver, 10)

    BUTTON_LOCATOR = (By.ID, "action-btn")

    def click_action_button(self):
        button = self.wait.until(EC.element_to_be_clickable(self.BUTTON_LOCATOR))
        button.click()
```

### Assertions
Use clear, descriptive assertions:

```python
# Good
assert error_msg.text == "Invalid input", f"Expected error message, got: {error_msg.text}"

# Better
expected_msg = "Invalid input"
actual_msg = error_msg.text
assert actual_msg == expected_msg, f"Error message mismatch. Expected: '{expected_msg}', Actual: '{actual_msg}'"
```

### Waits
Use explicit waits instead of time.sleep():

```python
# Good
element = WebDriverWait(driver, 10).until(
    EC.presence_of_element_located((By.ID, "result"))
)

# Avoid
time.sleep(5)
```

## 🐛 Debugging

### Debug Mode
Run with `--no-capture` to see print statements:

```bash
behave --no-capture
```

### Screenshots
Add screenshots on failure in `environment.py`:

```python
def after_step(context, step):
    if step.status == "failed":
        timestamp = int(time.time())
        screenshot_path = f"screenshots/failed_step_{timestamp}.png"
        context.driver.save_screenshot(screenshot_path)
        print(f"Screenshot saved: {screenshot_path}")
```

### Browser Developer Tools
Run in headed mode to inspect elements:

```bash
HEADLESS=false behave features/json_formatter.feature
```

## 🔄 CI/CD Integration

### GitHub Actions Example

```yaml
- name: Run BDD Tests
  run: |
    pip install -r tests/bdd/requirements-bdd.txt
    cd tests/bdd
    behave --format=json --outfile=reports/results.json
```

### Generate Reports

```bash
# JUnit XML (for CI)
behave --junit --junit-directory reports/

# Allure reports (advanced)
behave -f allure_behave.formatter:AllureFormatter -o allure-results/
allure serve allure-results/
```

## 📚 Resources

- [Behave Documentation](https://behave.readthedocs.io/)
- [Selenium Python Documentation](https://selenium-python.readthedocs.io/)
- [Gherkin Reference](https://cucumber.io/docs/gherkin/reference/)
- [Page Object Model Pattern](https://selenium-python.readthedocs.io/page-objects.html)