"""
Behave environment configuration for BDD tests.
Sets up and tears down the WebDriver for UI testing.
"""

import os
import time
from pathlib import Path
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.firefox.options import Options as FirefoxOptions


def get_config_directory():
    """Get the config directory path."""
    config_dir = os.environ.get('HELPFUL_TOOLS_CONFIG_DIR')
    if config_dir:
        return Path(config_dir)

    # Default to ~/.config/helpful-tools
    home_dir = Path.home()
    return home_dir / '.config' / 'helpful-tools'


def get_server_port():
    """Get the server port from .port file or environment variable."""
    config_dir = get_config_directory()
    port_file = config_dir / '.port'

    # Try to read port from .port file first
    if port_file.exists():
        try:
            port = int(port_file.read_text().strip())
            return port
        except (ValueError, IOError):
            pass

    # Fall back to environment variable
    port = os.environ.get('HELPFUL_TOOLS_PORT', '8000')
    try:
        return int(port)
    except ValueError:
        return 8000


def is_server_running():
    """Check if the server is running by checking the PID file."""
    config_dir = get_config_directory()
    pid_file = config_dir / 'helpful-tools-v2.pid'

    if not pid_file.exists():
        return False

    try:
        pid = int(pid_file.read_text().strip())
        # Check if process is actually running
        try:
            import psutil
            return psutil.pid_exists(pid)
        except ImportError:
            # If psutil is not available, just check if PID file exists
            return True
    except (ValueError, IOError):
        return False


def before_all(context):
    """Set up test environment before all tests."""
    # Get port and config from environment or defaults
    port = get_server_port()
    server_running = is_server_running()
    config_dir = get_config_directory()

    # Configuration
    context.base_url = os.getenv("BASE_URL", f"http://localhost:{port}")
    context.browser = os.getenv("BROWSER", "chrome").lower()
    context.headless = os.getenv("HEADLESS", "true").lower() == "true"
    context.timeout = int(os.getenv("TIMEOUT", "10"))
    context.server_port = port
    context.server_running = server_running
    context.config_dir = config_dir

    print(f"🔧 BDD Test Configuration:")
    print(f"   Config Directory: {config_dir}")
    print(f"   Server Port: {port}")
    print(f"   Server Running: {'✅ Yes' if server_running else '❌ No'}")
    print(f"   Browser: {context.browser}")
    print(f"   Base URL: {context.base_url}")
    print(f"   Headless mode: {context.headless}")

    if not server_running:
        print(f"   ⚠️  WARNING: Server is not running!")
        print(f"   💡 Start with: ./quick-start.sh start {port}")
        print(f"   🚨 Some BDD tests may fail!")


def before_scenario(context, scenario):
    """Set up WebDriver before each scenario."""
    print(f"\n🔸 Starting scenario: {scenario.name}")

    try:
        if context.browser == "chrome":
            context.driver = setup_chrome_driver(context.headless)
        elif context.browser == "firefox":
            context.driver = setup_firefox_driver(context.headless)
        else:
            raise ValueError(f"Unsupported browser: {context.browser}")

        # Set implicit wait
        context.driver.implicitly_wait(context.timeout)

        # Store driver reference for cleanup
        if not hasattr(context, 'drivers'):
            context.drivers = []
        context.drivers.append(context.driver)

    except Exception as e:
        print(f"❌ Failed to set up WebDriver: {e}")
        print("ℹ️  Make sure ChromeDriver/GeckoDriver is installed and in PATH")
        print("ℹ️  You can install ChromeDriver with: npm install -g chromedriver")

        # Create a mock driver for development
        context.driver = MockWebDriver()


def after_scenario(context, scenario):
    """Clean up WebDriver after each scenario."""
    if hasattr(context, 'driver') and context.driver and not isinstance(context.driver, MockWebDriver):
        try:
            context.driver.quit()
        except Exception as e:
            print(f"Warning: Failed to quit WebDriver: {e}")

    # Status reporting
    status = "✅ PASSED" if scenario.status == "passed" else "❌ FAILED"
    print(f"🔹 Scenario completed: {scenario.name} - {status}")


def after_all(context):
    """Clean up after all tests."""
    # Clean up any remaining drivers
    if hasattr(context, 'drivers'):
        for driver in context.drivers:
            if driver and not isinstance(driver, MockWebDriver):
                try:
                    driver.quit()
                except:
                    pass

    print("\n🏁 BDD test suite completed")


def setup_chrome_driver(headless=True):
    """Set up Chrome WebDriver with appropriate options."""
    chrome_options = Options()

    if headless:
        chrome_options.add_argument("--headless")

    # Chrome options for better stability
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--disable-gpu")
    chrome_options.add_argument("--window-size=1920,1080")
    chrome_options.add_argument("--disable-extensions")
    chrome_options.add_argument("--disable-web-security")
    chrome_options.add_argument("--allow-running-insecure-content")

    # Try to create ChromeDriver
    try:
        driver = webdriver.Chrome(options=chrome_options)
        return driver
    except Exception as e:
        print(f"Failed to create ChromeDriver: {e}")
        raise


def setup_firefox_driver(headless=True):
    """Set up Firefox WebDriver with appropriate options."""
    firefox_options = FirefoxOptions()

    if headless:
        firefox_options.add_argument("--headless")

    # Firefox options
    firefox_options.add_argument("--width=1920")
    firefox_options.add_argument("--height=1080")

    try:
        driver = webdriver.Firefox(options=firefox_options)
        return driver
    except Exception as e:
        print(f"Failed to create FirefoxDriver: {e}")
        raise


class MockWebDriver:
    """Mock WebDriver for development when actual driver is not available."""

    def __init__(self):
        print("🔧 Using MockWebDriver for development")

    def get(self, url):
        print(f"🔧 Mock: Navigating to {url}")

    def quit(self):
        print("🔧 Mock: Quitting driver")

    def find_element(self, *args, **kwargs):
        return MockWebElement()

    def find_elements(self, *args, **kwargs):
        return [MockWebElement()]

    def implicitly_wait(self, timeout):
        print(f"🔧 Mock: Setting implicit wait to {timeout}s")


class MockWebElement:
    """Mock WebElement for development."""

    def click(self):
        print("🔧 Mock: Clicking element")

    def send_keys(self, text):
        print(f"🔧 Mock: Sending keys: {text[:50]}...")

    def clear(self):
        print("🔧 Mock: Clearing element")

    def get_attribute(self, name):
        return "mock_value"

    @property
    def text(self):
        return "mock_text"