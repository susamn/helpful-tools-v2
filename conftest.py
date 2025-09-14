"""
pytest configuration for Helpful Tools v2.
Handles port detection, server status checking, and test environment setup.
"""

import os
import pytest
import warnings
from pathlib import Path


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
        import psutil
        return psutil.pid_exists(pid)
    except (ValueError, IOError, ImportError):
        # If psutil is not available, just check if PID file exists
        return pid_file.exists()


def pytest_configure(config):
    """Configure pytest with server information."""
    port = get_server_port()
    server_running = is_server_running()
    config_dir = get_config_directory()

    # Store in pytest config for access by tests
    config.port = port
    config.server_running = server_running
    config.config_dir = config_dir

    # Set environment variable for tests that need it
    os.environ['HELPFUL_TOOLS_PORT'] = str(port)
    os.environ['HELPFUL_TOOLS_BASE_URL'] = f'http://127.0.0.1:{port}'
    os.environ['HELPFUL_TOOLS_CONFIG_DIR'] = str(config_dir)

    print(f"\n🔧 Test Configuration:")
    print(f"   Config Directory: {config_dir}")
    print(f"   Server Port: {port}")
    print(f"   Server Running: {'✅ Yes' if server_running else '❌ No'}")

    if not server_running:
        print(f"   ⚠️  WARNING: Server is not running!")
        print(f"   💡 Start with: ./quick-start.sh start {port}")

    # Add custom markers
    config.addinivalue_line(
        "markers", "integration: marks tests as integration tests (requires running server)"
    )
    config.addinivalue_line(
        "markers", "requires_server: marks tests that require the server to be running"
    )


def pytest_sessionstart(session):
    """Called after the Session object has been created."""
    if not session.config.server_running:
        warnings.warn(
            "\n"
            "⚠️  Helpful-Tools-v2 server is not running!\n"
            "Some integration tests may fail or be skipped.\n"
            f"Start the server with: ./quick-start.sh start {session.config.port}\n",
            UserWarning
        )


@pytest.fixture(scope="session")
def server_port(pytestconfig):
    """Fixture to provide server port to tests."""
    return pytestconfig.port


@pytest.fixture(scope="session")
def server_running(pytestconfig):
    """Fixture to provide server running status to tests."""
    return pytestconfig.server_running


@pytest.fixture(scope="session")
def base_url(server_port):
    """Fixture to provide base URL for tests."""
    return f'http://127.0.0.1:{server_port}'


@pytest.fixture(scope="session")
def skip_if_server_not_running(server_running):
    """Fixture to skip tests if server is not running."""
    if not server_running:
        pytest.skip("Server is not running - skipping integration test")




def pytest_collection_modifyitems(config, items):
    """Modify test collection to handle server-dependent tests."""
    if not config.server_running:
        # Add skip marker to integration tests when server is not running
        skip_integration = pytest.mark.skip(reason="Server not running")
        for item in items:
            if "integration" in item.keywords or "requires_server" in item.keywords:
                item.add_marker(skip_integration)