#!/bin/bash

# Helpful Tools v2 - Quick Start Script
# Usage: ./quick-start.sh {start|stop|restart|status|logs|test|bdd|install|help} [port]

VENV_DIR="venv"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR"  # Script is now in root

# Config directory setup
CONFIG_DIR="$HOME/.config/helpful-tools"
PID_FILE="$CONFIG_DIR/helpful-tools-v2.pid"
LOG_FILE="$CONFIG_DIR/helpful-tools-v2.log"
PORT_FILE="$CONFIG_DIR/.port"
PORT=${PORT:-8000}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to ensure config directory exists
ensure_config_dir() {
    if [ ! -d "$CONFIG_DIR" ]; then
        echo -e "${YELLOW}📁 Creating config directory: $CONFIG_DIR${NC}"
        mkdir -p "$CONFIG_DIR"
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✅ Config directory created successfully${NC}"
        else
            echo -e "${RED}❌ Failed to create config directory${NC}"
            exit 1
        fi
    fi
}

# Function to check if process is running
is_running() {
    if [ -f "$PID_FILE" ]; then
        local pid=$(cat "$PID_FILE")
        if ps -p "$pid" > /dev/null 2>&1; then
            return 0
        else
            rm -f "$PID_FILE"
            return 1
        fi
    fi
    return 1
}

# Function to setup virtual environment and install dependencies
setup_venv() {
    local force_check="${1:-false}"
    local dependency_marker="$CONFIG_DIR/.dependencies_verified"

    # Skip dependency check if recently verified (unless forced)
    if [ "$force_check" != "true" ] && [ -f "$dependency_marker" ]; then
        local marker_age=$(($(date +%s) - $(stat -c %Y "$dependency_marker" 2>/dev/null || echo 0)))
        # Skip check if dependencies were verified less than 24 hours ago
        if [ $marker_age -lt 86400 ]; then
            echo -e "${GREEN}✅ Dependencies recently verified (skipping check)${NC}"
            return 0
        fi
    fi

    # Create temporary log file for rolling logs
    local temp_log=$(mktemp)
    local install_log=$(mktemp)

    echo -e "${YELLOW}📦 Setting up virtual environment...${NC}"

    # Create venv if it doesn't exist
    if [ ! -d "$PROJECT_DIR/$VENV_DIR" ]; then
        echo -e "${YELLOW}🐍 Creating virtual environment...${NC}"
        python3 -m venv "$PROJECT_DIR/$VENV_DIR" > "$temp_log" 2>&1
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✅ Virtual environment created${NC}"
        else
            echo -e "${RED}❌ Failed to create virtual environment${NC}"
            cat "$temp_log"
            rm -f "$temp_log" "$install_log"
            exit 1
        fi
    fi

    # Install/update dependencies with rolling log
    echo -e "${YELLOW}📋 Installing/updating dependencies...${NC}"

    # Show a spinner/progress while installing
    (
        "$PROJECT_DIR/$VENV_DIR/bin/pip" install --quiet --upgrade pip > "$install_log" 2>&1
        "$PROJECT_DIR/$VENV_DIR/bin/pip" install --quiet -r "$PROJECT_DIR/requirements.txt" >> "$install_log" 2>&1
    ) &
    local pip_pid=$!

    # Show progress dots while pip is running
    local dots=0
    while kill -0 $pip_pid 2>/dev/null; do
        case $dots in
            0) printf "📦 Installing " ;;
            1) printf "." ;;
            2) printf "." ;;
            3) printf "."; dots=-1 ;;
        esac
        dots=$((dots + 1))
        sleep 0.5
    done
    wait $pip_pid
    local pip_exit=$?
    echo ""  # New line after dots

    if [ $pip_exit -ne 0 ]; then
        echo -e "${RED}❌ Failed to install dependencies${NC}"
        echo -e "${YELLOW}Installation log:${NC}"
        tail -20 "$install_log"
        rm -f "$temp_log" "$install_log"
        exit 1
    fi

    # Verify all dependencies from requirements.txt - keep output clean
    echo -e "${YELLOW}🔍 Verifying installation...${NC}"
    local verification_result=$("$PROJECT_DIR/$VENV_DIR/bin/python" -c "
import sys
import re

# Read requirements.txt and extract package names
requirements_file = '$PROJECT_DIR/requirements.txt'
dependencies = []

# Mapping for packages with different import names
import_mapping = {
    'PyYAML': 'yaml',
    'XMLtodict': 'xmltodict',
    'requests-mock': 'requests_mock',
    'pytest-mock': 'pytest_mock',
    'webdriver-manager': 'webdriver_manager',
    'smbprotocol': 'smbprotocol',
}

try:
    with open(requirements_file, 'r') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#'):
                # Extract package name (before == or other version specifiers)
                package_name = re.split('[=<>!]', line)[0].strip()
                if package_name:
                    # Use mapping or convert to lowercase for import
                    import_name = import_mapping.get(package_name, package_name.lower())
                    dependencies.append((package_name, import_name))
except FileNotFoundError:
    print('❌ requirements.txt not found')
    sys.exit(1)

all_good = True
for display_name, import_name in dependencies:
    try:
        __import__(import_name)
        print(f'✅ {display_name}')
    except ImportError:
        print(f'❌ {display_name} - MISSING')
        all_good = False

if all_good:
    print(f'🎉 All {len(dependencies)} dependencies verified!')
else:
    print('⚠️  Some dependencies are missing. Re-running installation...')
    sys.exit(1)
" 2>"$temp_log")

    local verify_exit=$?

    # Show only the clean verification output
    echo "$verification_result"

    if [ $verify_exit -ne 0 ]; then
        echo -e "${YELLOW}⚠️  Re-installing dependencies...${NC}"
        "$PROJECT_DIR/$VENV_DIR/bin/pip" install --quiet -r "$PROJECT_DIR/requirements.txt" > "$install_log" 2>&1

        # Re-verify after reinstall
        "$PROJECT_DIR/$VENV_DIR/bin/python" -c "
import sys
import re

# Read requirements.txt and extract package names
requirements_file = '$PROJECT_DIR/requirements.txt'
dependencies = []

# Mapping for packages with different import names
import_mapping = {
    'PyYAML': 'yaml',
    'XMLtodict': 'xmltodict',
    'requests-mock': 'requests_mock',
    'pytest-mock': 'pytest_mock',
    'webdriver-manager': 'webdriver_manager',
    'smbprotocol': 'smbprotocol',
}

try:
    with open(requirements_file, 'r') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#'):
                package_name = re.split('[=<>!]', line)[0].strip()
                if package_name:
                    import_name = import_mapping.get(package_name, package_name.lower())
                    dependencies.append((package_name, import_name))
except FileNotFoundError:
    print('❌ requirements.txt not found')
    sys.exit(1)

all_good = True
for display_name, import_name in dependencies:
    try:
        __import__(import_name)
    except ImportError:
        all_good = False

if not all_good:
    print('❌ Some dependencies still missing after reinstall')
    sys.exit(1)
"
        if [ $? -ne 0 ]; then
            echo -e "${RED}❌ Failed to install some dependencies${NC}"
            echo -e "${YELLOW}Check installation log:${NC}"
            tail -10 "$install_log"
            rm -f "$temp_log" "$install_log"
            exit 1
        fi
    fi

    echo -e "${GREEN}✅ Dependencies installed and verified${NC}"

    # Create marker file to skip future checks for 24 hours
    touch "$dependency_marker"

    # Clean up temporary files
    rm -f "$temp_log" "$install_log"
}

# Function to start the application
start_app() {
    # Ensure config directory exists
    ensure_config_dir

    # Check for flags and port parameter
    local start_port="$PORT"
    local force_deps="false"

    # Parse arguments
    for arg in "$@"; do
        case $arg in
            --force-deps)
                force_deps="true"
                shift
                ;;
            *)
                if [[ "$arg" =~ ^[0-9]+$ ]]; then
                    start_port="$arg"
                    echo -e "${BLUE}🔧 Using specified port: $start_port${NC}"
                fi
                ;;
        esac
    done

    if is_running; then
        local pid=$(cat "$PID_FILE")
        # Try to read actual port from .port file
        local current_port="$start_port"
        if [ -f "$PORT_FILE" ]; then
            current_port=$(cat "$PORT_FILE")
        fi
        echo -e "${YELLOW}Helpful-Tools-v2 is already running (PID: $pid)${NC}"
        echo -e "${BLUE}📍 Access at: http://127.0.0.1:$current_port${NC}"
        return
    fi

    setup_venv "$force_deps"

    echo -e "${BLUE}🚀 Starting Helpful-Tools-v2 on port $start_port in background...${NC}"

    # Write port to .port file
    echo "$start_port" > "$PORT_FILE"

    # Start in background using Python app with specified port
    cd "$PROJECT_DIR"
    nohup "$PROJECT_DIR/$VENV_DIR/bin/python" "$PROJECT_DIR/app.py" --port "$start_port" > "$LOG_FILE" 2>&1 &
    local pid=$!

    # Save PID
    echo "$pid" > "$PID_FILE"

    # Wait a moment and check if it started successfully
    sleep 3
    if is_running; then
        echo -e "${GREEN}✅ Helpful-Tools-v2 started successfully (PID: $pid)${NC}"
        echo -e "${BLUE}📍 Access at: http://127.0.0.1:$start_port${NC}"
        echo -e "${BLUE}📋 Dashboard ready with JSON formatter, text diff, regex tester, and more!${NC}"
        echo -e "${YELLOW}📝 Logs: $LOG_FILE${NC}"
        echo -e "${YELLOW}📝 Port: $PORT_FILE${NC}"
        echo -e "${BLUE}📁 Config: $CONFIG_DIR${NC}"
    else
        echo -e "${RED}❌ Failed to start Helpful-Tools-v2${NC}"
        echo -e "${YELLOW}Check logs: $LOG_FILE${NC}"
        rm -f "$PID_FILE"
        rm -f "$PORT_FILE"
    fi
}

# Function to stop the application
stop_app() {
    if ! is_running; then
        echo -e "${YELLOW}Helpful-Tools-v2 is not running${NC}"
        return
    fi

    local pid=$(cat "$PID_FILE")
    echo -e "${YELLOW}⏹️  Stopping Helpful-Tools-v2 (PID: $pid)...${NC}"

    # Try graceful shutdown first
    kill "$pid" 2>/dev/null

    # Wait up to 5 seconds for graceful shutdown
    for i in {1..5}; do
        if ! ps -p "$pid" > /dev/null 2>&1; then
            echo -e "${GREEN}✅ Helpful-Tools-v2 stopped successfully${NC}"
            rm -f "$PID_FILE"
            rm -f "$PORT_FILE"
            return
        fi
        sleep 1
    done

    # Force kill if still running
    echo -e "${YELLOW}Force killing process...${NC}"
    kill -9 "$pid" 2>/dev/null
    rm -f "$PID_FILE"
    rm -f "$PORT_FILE"
    echo -e "${GREEN}✅ Helpful-Tools-v2 force stopped${NC}"
}

# Function to show status
show_status() {
    if is_running; then
        local pid=$(cat "$PID_FILE")
        local current_port="$PORT"
        if [ -f "$PORT_FILE" ]; then
            current_port=$(cat "$PORT_FILE")
        fi
        echo -e "${GREEN}✅ Helpful-Tools-v2 is running (PID: $pid)${NC}"
        echo -e "${BLUE}📍 Access at: http://127.0.0.1:$current_port${NC}"
        echo -e "${YELLOW}📝 Logs: $LOG_FILE${NC}"
        echo -e "${YELLOW}📝 Port: $PORT_FILE${NC}"
    else
        echo -e "${RED}❌ Helpful-Tools-v2 is not running${NC}"
    fi
}

# Function to show logs
show_logs() {
    if [ -f "$LOG_FILE" ]; then
        echo -e "${BLUE}📝 Recent logs:${NC}"
        tail -20 "$LOG_FILE"
    else
        echo -e "${RED}❌ No log file found${NC}"
    fi
}

# Function to run unit and integration tests
run_tests() {
    echo -e "${BLUE}🧪 Running unit and integration tests...${NC}"

    # Ensure config directory exists
    ensure_config_dir

    # Check if application is running
    if ! is_running; then
        echo -e "${RED}⚠️  WARNING: Helpful-Tools-v2 is not running!${NC}"
        echo -e "${YELLOW}Some integration tests may fail. Start the application with: ./quick-start.sh start${NC}"
    else
        local pid=$(cat "$PID_FILE")
        local current_port="8000"
        if [ -f "$PORT_FILE" ]; then
            current_port=$(cat "$PORT_FILE")
        fi
        echo -e "${GREEN}✅ Application is running on port $current_port (PID: $pid)${NC}"
        # Export port and config dir for tests to use
        export HELPFUL_TOOLS_PORT="$current_port"
        export HELPFUL_TOOLS_CONFIG_DIR="$CONFIG_DIR"
    fi

    setup_venv true  # Force dependency check for testing

    cd "$PROJECT_DIR"
    "$PROJECT_DIR/$VENV_DIR/bin/python" -m pytest tests/ -v --tb=short

    echo -e "${GREEN}✅ Tests completed${NC}"
}

# Function to run BDD tests
run_bdd_tests() {
    echo -e "${BLUE}🎭 Running BDD tests...${NC}"
    echo -e "${BLUE}======================================${NC}"

    # Parse arguments
    local FEATURE_FILE=${1:-""}
    local BROWSER=${2:-"chrome"}
    local HEADLESS=${3:-"true"}
    local SERVER_PORT="8000"

    # Ensure config directory exists
    ensure_config_dir

    # Get current port from port file
    if [ -f "$PORT_FILE" ]; then
        SERVER_PORT=$(cat "$PORT_FILE")
    fi

    local BASE_URL=${BASE_URL:-"http://localhost:$SERVER_PORT"}

    # Check if we're in the project root directory
    if [ ! -f "requirements.txt" ] || [ ! -d "tests/bdd" ]; then
        echo -e "${RED}❌ Error: Please run this script from the project root directory${NC}"
        echo -e "${YELLOW}💡 Expected structure: requirements.txt and tests/bdd/ should exist${NC}"
        return 1
    fi

    # Setup virtual environment
    setup_venv true  # Force dependency check for BDD testing

    # Check if application is running
    echo -e "${YELLOW}🔍 Checking server status...${NC}"
    echo -e "${BLUE}   Config Directory: ${CONFIG_DIR}${NC}"
    echo -e "${BLUE}   Port: ${SERVER_PORT} (from config directory or default)${NC}"

    if ! is_running; then
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
            return 1
        fi
    else
        local pid=$(cat "$PID_FILE")
        echo -e "${GREEN}✅ Server is running (PID: $pid) on port ${SERVER_PORT}${NC}"

        # Double-check with HTTP request
        if curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}" 2>/dev/null | grep -q "200\|302\|404"; then
            echo -e "${GREEN}✅ Server is responding at ${BASE_URL}${NC}"
        else
            echo -e "${YELLOW}⚠️  Server PID exists but not responding at ${BASE_URL}${NC}"
            echo -e "${YELLOW}   This may cause some tests to fail${NC}"
        fi
    fi

    # Check WebDriver availability
    echo -e "${YELLOW}🔧 Checking WebDriver for ${BROWSER}...${NC}"
    if [ "$BROWSER" = "chrome" ]; then
        # Try to auto-install ChromeDriver if not found
        if ! which chromedriver >/dev/null 2>&1; then
            echo -e "${YELLOW}⚠️  ChromeDriver not found. Installing via webdriver-manager...${NC}"
            "$PROJECT_DIR/$VENV_DIR/bin/python" -c "
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
            echo -e "${YELLOW}   Or use Chrome: ./quick-start.sh bdd \"\" chrome${NC}"
            return 1
        else
            echo -e "${GREEN}✅ GeckoDriver available${NC}"
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
    echo -e "   Virtual Environment: $PROJECT_DIR/$VENV_DIR/bin/python"
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
    cd "$PROJECT_DIR/tests/bdd"

    # Run behave with appropriate options (using virtual environment)
    if [ -n "$FEATURE_FILE" ]; then
        # Run specific feature file
        echo -e "${BLUE}Running specific feature: ${FEATURE_FILE}${NC}"
        "../../$VENV_DIR/bin/python" -m behave "features/${FEATURE_FILE}" \
            --format=pretty \
            --junit \
            --junit-directory=reports \
            --show-timings \
            --no-capture \
            || {
                echo -e "${RED}❌ BDD tests failed${NC}"
                cd "$PROJECT_DIR"
                return 1
            }
    else
        # Run all features
        echo -e "${BLUE}Running all BDD features${NC}"
        "../../$VENV_DIR/bin/python" -m behave \
            --format=pretty \
            --junit \
            --junit-directory=reports \
            --show-timings \
            --no-capture \
            || {
                echo -e "${RED}❌ BDD tests failed${NC}"
                cd "$PROJECT_DIR"
                return 1
            }
    fi

    # Return to project root
    cd "$PROJECT_DIR"

    echo -e "${GREEN}✅ BDD tests completed successfully!${NC}"

    # Show reports location
    if [ -d "tests/bdd/reports" ] && [ "$(ls -A tests/bdd/reports)" ]; then
        echo -e "${BLUE}📊 Test reports generated in: $(pwd)/tests/bdd/reports/${NC}"
    fi

    echo -e "${BLUE}🎉 BDD tests done!${NC}"
}

# Function to install/update dependencies only
install_dependencies() {
    echo -e "${BLUE}📦 Installing/updating all dependencies...${NC}"
    setup_venv true  # Force dependency check
    echo -e "${GREEN}✅ Dependencies installation completed${NC}"
}

# Open the URL in the default browser
open_url() {
    local current_port="$PORT"
    if [ -f "$PORT_FILE" ]; then
        current_port=$(cat "$PORT_FILE")
    fi

    echo -e "${BLUE}🌐 Opening Helpful-Tools-v2 in browser...${NC}"
    if command -v xdg-open > /dev/null; then
        xdg-open "http://127.0.0.1:$current_port" >/dev/null 2>&1 &
    elif command -v gnome-open > /dev/null; then
        gnome-open "http://127.0.0.1:$current_port" >/dev/null 2>&1 &
    elif command -v open > /dev/null; then
        open "http://127.0.0.1:$current_port" >/dev/null 2>&1 &
    else
        echo -e "${YELLOW}Please open: http://127.0.0.1:$current_port${NC}"
    fi
}

# Function to show help
show_help() {
    echo -e "${BLUE}🚀 Helpful Tools v2 - Quick Start${NC}"
    echo -e "${BLUE}Usage: $0 {command} [port]${NC}"
    echo ""
    echo -e "${BLUE}Available commands:${NC}"
    echo -e "  ${YELLOW}start [port] [--force-deps]${NC} - Start Helpful-Tools-v2 in background (default port: 8000)"
    echo -e "  ${YELLOW}stop${NC}                        - Stop Helpful-Tools-v2"
    echo -e "  ${YELLOW}restart [port] [--force-deps]${NC} - Restart Helpful-Tools-v2"
    echo -e "  ${YELLOW}status${NC}       - Check if Helpful-Tools-v2 is running"
    echo -e "  ${YELLOW}logs${NC}         - Show recent logs"
    echo -e "  ${YELLOW}test${NC}         - Run unit and integration tests"
    echo -e "  ${YELLOW}bdd${NC}          - Run BDD tests (usage: ./quick-start.sh bdd [feature] [browser])"
    echo -e "  ${YELLOW}install${NC}      - Install/update all dependencies"
    echo -e "  ${YELLOW}open${NC}         - Open Helpful-Tools-v2 in default browser"
    echo -e "  ${YELLOW}help${NC}         - Show this help message"
    echo ""
    echo -e "${BLUE}Examples:${NC}"
    echo -e "  ${YELLOW}./quick-start.sh start${NC}                      # Start on default port (8000)"
    echo -e "  ${YELLOW}./quick-start.sh start 3000${NC}                 # Start on port 3000"
    echo -e "  ${YELLOW}./quick-start.sh start --force-deps${NC}         # Force dependency check"
    echo -e "  ${YELLOW}./quick-start.sh restart 5000${NC}               # Restart on port 5000"
    echo -e "  ${YELLOW}./quick-start.sh test${NC}                       # Run unit tests"
    echo -e "  ${YELLOW}./quick-start.sh bdd${NC}                        # Run all BDD tests"
    echo -e "  ${YELLOW}./quick-start.sh bdd json_formatter.feature${NC}   # Run specific feature"
    echo -e "  ${YELLOW}PORT=3000 ./quick-start.sh start${NC}            # Alternative: use environment variable"
    echo ""
    echo -e "${BLUE}🎯 Features available:${NC}"
    echo -e "  • JSON Formatter & Validator"
    echo -e "  • YAML ↔ JSON Converter"
    echo -e "  • XML ↔ JSON Converter"
    echo -e "  • Text Diff Tool"
    echo -e "  • Regex Tester"
    echo -e "  • Cron Parser"
    echo -e "  • JWT Decoder"
    echo -e "  • Scientific Calculator"
    echo -e "  • Sources Manager"
}

# Main script logic
case "${1:-start}" in
    "start")
        start_app "$@"
        ;;
    "stop")
        stop_app
        ;;
    "restart")
        stop_app
        sleep 1
        start_app "$@"
        ;;
    "status")
        show_status
        ;;
    "logs")
        show_logs
        ;;
    "test")
        run_tests
        ;;
    "bdd")
        shift  # Remove 'bdd' from arguments
        run_bdd_tests "$@"
        ;;
    "install")
        install_dependencies
        ;;
    "open")
        open_url
        ;;
    "help"|*)
        show_help
        exit 1
        ;;
esac