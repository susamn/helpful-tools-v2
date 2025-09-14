#!/bin/bash

# BDD Test Runner for Helpful Tools
# Usage: ./run_bdd_tests.sh [feature_file] [browser] [headless]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to get config directory
get_config_dir() {
    if [ -n "$HELPFUL_TOOLS_CONFIG_DIR" ]; then
        echo "$HELPFUL_TOOLS_CONFIG_DIR"
    else
        echo "$HOME/.config/helpful-tools"
    fi
}

# Function to get port from config directory or default
get_port() {
    local config_dir=$(get_config_dir)
    local port_file="$config_dir/.port"

    if [ -f "$port_file" ]; then
        port=$(cat "$port_file" 2>/dev/null)
        if [[ "$port" =~ ^[0-9]+$ ]]; then
            echo "$port"
            return
        fi
    fi
    echo "${PORT:-8000}"
}

# Function to check if server is running
is_server_running() {
    local config_dir=$(get_config_dir)
    local pid_file="$config_dir/helpful-tools-v2.pid"

    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file" 2>/dev/null)
        if [[ "$pid" =~ ^[0-9]+$ ]] && ps -p "$pid" > /dev/null 2>&1; then
            return 0
        fi
    fi
    return 1
}

# Default values
FEATURE_FILE=${1:-""}
BROWSER=${2:-"chrome"}
HEADLESS=${3:-"true"}
CONFIG_DIR=$(get_config_dir)
SERVER_PORT=$(get_port)
BASE_URL=${BASE_URL:-"http://localhost:$SERVER_PORT"}

echo -e "${BLUE}🚀 Starting BDD Tests for Helpful Tools${NC}"
echo -e "${BLUE}======================================${NC}"

# Check if we're in the project root directory
if [ ! -f "requirements.txt" ] || [ ! -d "tests/bdd" ]; then
    echo -e "${RED}❌ Error: Please run this script from the project root directory${NC}"
    echo -e "${YELLOW}💡 Expected structure: requirements.txt and tests/bdd/ should exist${NC}"
    exit 1
fi

# Check if virtual environment exists, create if not
if [ ! -d "venv" ]; then
    echo -e "${YELLOW}🐍 Creating virtual environment...${NC}"
    python3 -m venv venv
    echo -e "${GREEN}✅ Virtual environment created${NC}"
fi

# Use virtual environment Python directly (don't activate to avoid shell issues)
PYTHON_PATH="venv/bin/python"
PIP_PATH="venv/bin/pip"

# Check if dependencies are installed, install if needed
echo -e "${YELLOW}📦 Checking and installing dependencies...${NC}"
$PIP_PATH install --quiet --upgrade pip

# Check for specific BDD dependencies
if ! $PYTHON_PATH -c "import behave, selenium" 2>/dev/null; then
    echo -e "${YELLOW}⚠️  Installing missing dependencies from requirements.txt...${NC}"
    $PIP_PATH install -r requirements.txt
else
    echo -e "${GREEN}✅ Dependencies already installed${NC}"
fi

# Double-check critical dependencies are available
echo -e "${YELLOW}🔍 Verifying BDD dependencies...${NC}"
$PYTHON_PATH -c "
try:
    import behave
    print('✅ Behave available')
except ImportError as e:
    print(f'❌ Behave missing: {e}')
    exit(1)

try:
    import selenium
    print('✅ Selenium available')
except ImportError as e:
    print(f'❌ Selenium missing: {e}')
    exit(1)

try:
    from webdriver_manager.chrome import ChromeDriverManager
    print('✅ WebDriver Manager available')
except ImportError as e:
    print(f'❌ WebDriver Manager missing: {e}')
    exit(1)
"

# Check WebDriver availability
echo -e "${YELLOW}🔧 Checking WebDriver for ${BROWSER}...${NC}"
if [ "$BROWSER" = "chrome" ]; then
    # Try to auto-install ChromeDriver if not found
    if ! which chromedriver >/dev/null 2>&1; then
        echo -e "${YELLOW}⚠️  ChromeDriver not found. Installing via webdriver-manager...${NC}"
        $PYTHON_PATH -c "
from webdriver_manager.chrome import ChromeDriverManager
try:
    driver_path = ChromeDriverManager().install()
    print(f'✅ ChromeDriver installed at: {driver_path}')
except Exception as e:
    print(f'❌ Failed to install ChromeDriver: {e}')
    print('💡 Try installing manually: npm install -g chromedriver')
    exit(1)
"
    else
        echo -e "${GREEN}✅ ChromeDriver already available${NC}"
    fi
elif [ "$BROWSER" = "firefox" ]; then
    if ! which geckodriver >/dev/null 2>&1; then
        echo -e "${YELLOW}⚠️  GeckoDriver not found${NC}"
        echo -e "${YELLOW}💡 Please install GeckoDriver from: https://github.com/mozilla/geckodriver/releases${NC}"
        echo -e "${YELLOW}   Or use Chrome: ./run_bdd_tests.sh \"\" chrome${NC}"
        exit 1
    else
        echo -e "${GREEN}✅ GeckoDriver available${NC}"
    fi
fi

# Check if application is running
echo -e "${YELLOW}🔍 Checking server status...${NC}"
echo -e "${BLUE}   Config Directory: ${CONFIG_DIR}${NC}"
echo -e "${BLUE}   Port: ${SERVER_PORT} (from config directory or default)${NC}"

if is_server_running; then
    local pid_file="$CONFIG_DIR/helpful-tools-v2.pid"
    local pid=$(cat "$pid_file")
    echo -e "${GREEN}✅ Server is running (PID: $pid) on port ${SERVER_PORT}${NC}"

    # Double-check with HTTP request
    if curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}" 2>/dev/null | grep -q "200\|302\|404"; then
        echo -e "${GREEN}✅ Server is responding at ${BASE_URL}${NC}"
    else
        echo -e "${YELLOW}⚠️  Server PID exists but not responding at ${BASE_URL}${NC}"
        echo -e "${YELLOW}   This may cause some tests to fail${NC}"
    fi
else
    echo -e "${RED}❌ Server is not running${NC}"
    echo -e "${YELLOW}💡 Please start the application first:${NC}"
    echo -e "${YELLOW}   ./quick-start.sh start ${SERVER_PORT}${NC}"
    echo -e "${YELLOW}🚨 BDD tests may fail without a running server!${NC}"

    # Still try to run curl check in case server is running but PID file is missing
    if curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}" 2>/dev/null | grep -q "200\|302\|404"; then
        echo -e "${YELLOW}   But server seems to be responding at ${BASE_URL}${NC}"
        echo -e "${YELLOW}   (PID file may be missing)${NC}"
    else
        echo -e "${RED}   And server is not responding at ${BASE_URL}${NC}"
        exit 1
    fi
fi

# Set environment variables
export BROWSER="$BROWSER"
export HEADLESS="$HEADLESS"
export BASE_URL="$BASE_URL"
export HELPFUL_TOOLS_PORT="$SERVER_PORT"
export HELPFUL_TOOLS_CONFIG_DIR="$CONFIG_DIR"

# Display configuration
echo -e "${BLUE}🔧 Test Configuration:${NC}"
echo -e "   Virtual Environment: $(which python)"
echo -e "   Config Directory: ${CONFIG_DIR}"
echo -e "   Server Port: ${SERVER_PORT}"
echo -e "   Browser: ${BROWSER}"
echo -e "   Headless: ${HEADLESS}"
echo -e "   Base URL: ${BASE_URL}"
echo -e "   Feature: ${FEATURE_FILE:-"All features"}"

# Create reports directory
mkdir -p tests/bdd/reports

echo -e "${BLUE}🧪 Running BDD Tests...${NC}"
echo -e "${BLUE}======================${NC}"

# Change to BDD directory for behave execution
cd tests/bdd

# Run behave with appropriate options (using virtual environment)
if [ -n "$FEATURE_FILE" ]; then
    # Run specific feature file
    echo -e "${BLUE}Running specific feature: ${FEATURE_FILE}${NC}"
    ../../$PYTHON_PATH -m behave "features/${FEATURE_FILE}" \
        --format=pretty \
        --junit \
        --junit-directory=reports \
        --show-timings \
        --no-capture \
        || {
            echo -e "${RED}❌ BDD tests failed${NC}"
            exit 1
        }
else
    # Run all features
    echo -e "${BLUE}Running all BDD features${NC}"
    ../../$PYTHON_PATH -m behave \
        --format=pretty \
        --junit \
        --junit-directory=reports \
        --show-timings \
        --no-capture \
        || {
            echo -e "${RED}❌ BDD tests failed${NC}"
            exit 1
        }
fi

# Return to project root
cd ../..

echo -e "${GREEN}✅ BDD tests completed successfully!${NC}"

# Show reports location
if [ -d "tests/bdd/reports" ] && [ "$(ls -A tests/bdd/reports)" ]; then
    echo -e "${BLUE}📊 Test reports generated in: $(pwd)/tests/bdd/reports/${NC}"
fi

echo -e "${BLUE}🎉 All done!${NC}"