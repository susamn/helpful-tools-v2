"""
pytest configuration for Helpful Tools v2.
Handles port detection, server status checking, and test environment setup.
"""

import os
import pytest
import warnings
import json
import tempfile
import shutil
import socket
import subprocess
import time
import signal
import sys
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


def find_free_port(start_port=32000):
    """Find a free port starting from start_port."""
    port = start_port
    while port < 65535:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            try:
                sock.bind(('127.0.0.1', port))
                return port
            except OSError:
                port += 1
    raise RuntimeError("No free ports found")


def start_test_server(port):
    """Start the test server on the specified port."""
    project_root = Path(__file__).parent.absolute()
    cmd = [sys.executable, str(project_root / "app.py"), "--port", str(port)]
    
    # Start server as a subprocess
    process = subprocess.Popen(
        cmd,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        cwd=str(project_root)
    )
    
    # Wait for server to start
    start_time = time.time()
    while time.time() - start_time < 10:  # 10 second timeout
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
                if sock.connect_ex(('127.0.0.1', port)) == 0:
                    return process
        except Exception:
            pass
        time.sleep(0.1)
        
    # If we get here, server failed to start
    process.terminate()
    raise RuntimeError(f"Failed to start test server on port {port}")


def pytest_configure(config):
    """Configure pytest with server information."""
    config_dir = get_config_directory()
    
    # Check if server is already running
    if is_server_running():
        port = get_server_port()
        server_running = True
        config.server_process = None
        print(f"\n🔧 Test Configuration: Using existing server on port {port}")
    else:
        # Start a new server for testing
        try:
            port = find_free_port()
            print(f"\n🚀 Starting test server on port {port}...")
            config.server_process = start_test_server(port)
            server_running = True
            
            # Ensure config dir exists
            config_dir.mkdir(parents=True, exist_ok=True)
            
            # Write port to file so other tools (like Jest) can find it
            port_file = config_dir / ".port"
            port_file.write_text(str(port))
            
        except Exception as e:
            print(f"⚠️  Failed to auto-start server: {e}")
            port = 8000
            server_running = False
            config.server_process = None

    # Store in pytest config for access by tests
    config.port = port
    config.server_running = server_running
    config.config_dir = config_dir

    # Set environment variable for tests that need it
    os.environ['HELPFUL_TOOLS_PORT'] = str(port)
    os.environ['HELPFUL_TOOLS_BASE_URL'] = f'http://127.0.0.1:{port}'
    os.environ['HELPFUL_TOOLS_CONFIG_DIR'] = str(config_dir)

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


def pytest_unconfigure(config):
    """Clean up after tests."""
    if hasattr(config, 'server_process') and config.server_process:
        print("\n🛑 Stopping test server...")
        config.server_process.terminate()
        try:
            config.server_process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            config.server_process.kill()
            
        # Clean up port file
        config_dir = get_config_directory()
        port_file = config_dir / ".port"
        if port_file.exists():
            try:
                port_file.unlink()
            except OSError:
                pass


def pytest_sessionstart(session):
    """Called after the Session object has been created."""
    # We no longer need to warn here as we handle it in configure
    pass


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


# Source management and cleanup utilities

def get_sources_file_path():
    """Get the path to the sources.json file."""
    # Use the old config directory location for backward compatibility
    sources_file = Path.home() / '.helpful-tools' / 'sources.json'
    return sources_file


def get_test_sources_backup_path():
    """Get the path for backing up existing sources during tests."""
    sources_file = get_sources_file_path()
    return sources_file.with_suffix('.json.test_backup')


def load_sources():
    """Load sources from the sources.json file."""
    sources_file = get_sources_file_path()
    if not sources_file.exists():
        return {}

    try:
        with open(sources_file, 'r') as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError):
        return {}


def save_sources(sources):
    """Save sources to the sources.json file."""
    sources_file = get_sources_file_path()
    sources_file.parent.mkdir(exist_ok=True, parents=True)

    try:
        with open(sources_file, 'w') as f:
            json.dump(sources, f, indent=2)
    except IOError as e:
        print(f"Warning: Failed to save sources: {e}")


def backup_existing_sources():
    """Backup existing sources before tests start."""
    sources_file = get_sources_file_path()
    backup_file = get_test_sources_backup_path()

    if sources_file.exists():
        try:
            shutil.copy2(sources_file, backup_file)
            return True
        except IOError as e:
            print(f"Warning: Failed to backup sources: {e}")
            return False
    return False


def restore_sources_backup():
    """Restore sources from backup after tests complete."""
    sources_file = get_sources_file_path()
    backup_file = get_test_sources_backup_path()

    try:
        if backup_file.exists():
            shutil.copy2(backup_file, sources_file)
            backup_file.unlink()  # Remove backup file
        else:
            # No backup exists, remove the sources file if it exists
            if sources_file.exists():
                sources_file.unlink()
    except IOError as e:
        print(f"Warning: Failed to restore sources backup: {e}")


def clean_test_sources():
    """Clean up any sources created during tests."""
    sources = load_sources()
    test_sources_removed = 0

    # Remove sources that look like test sources (have 'test' in name or use temp paths)
    sources_to_remove = []
    for source_id, source in sources.items():
        source_name = source.get('name', '').lower()
        path_template = source.get('pathTemplate', '').lower()

        # Check if this looks like a test source
        is_test_source = (
            'test' in source_name or
            '/tmp/' in path_template or
            '/temp/' in path_template or
            'tempfile' in path_template or
            source_name.startswith('temp') or
            source_name.startswith('mock')
        )

        if is_test_source:
            sources_to_remove.append(source_id)

    # Remove identified test sources
    for source_id in sources_to_remove:
        del sources[source_id]
        test_sources_removed += 1

    if test_sources_removed > 0:
        save_sources(sources)
        print(f"🧹 Cleaned up {test_sources_removed} test sources")

    return test_sources_removed


@pytest.fixture(scope="session", autouse=True)
def sources_cleanup():
    """Session-level fixture to handle source cleanup before and after tests."""
    # Backup existing sources before tests start
    backup_created = backup_existing_sources()

    yield

    # After all tests complete, clean up and restore
    clean_test_sources()

    if backup_created:
        restore_sources_backup()
        print("🔄 Restored original sources from backup")
    else:
        print("📝 No original sources to restore")


@pytest.fixture(scope="function")
def clean_sources():
    """Function-level fixture to ensure clean source state for each test."""
    # Store sources that existed before the test
    initial_sources = load_sources()
    initial_source_ids = set(initial_sources.keys())

    yield

    # After test completes, remove any new sources created during the test
    current_sources = load_sources()
    current_source_ids = set(current_sources.keys())

    # Find sources created during this test
    new_source_ids = current_source_ids - initial_source_ids

    if new_source_ids:
        # Remove new sources
        for source_id in new_source_ids:
            del current_sources[source_id]

        save_sources(current_sources)
        print(f"🧹 Cleaned up {len(new_source_ids)} sources created during test")


@pytest.fixture
def temp_sources_backup():
    """Fixture to temporarily backup and restore sources for a test."""
    # Create a temporary backup
    temp_backup = tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False)
    sources = load_sources()

    try:
        json.dump(sources, temp_backup, indent=2)
        temp_backup.close()

        yield temp_backup.name

    finally:
        # Restore from temporary backup
        try:
            with open(temp_backup.name, 'r') as f:
                restored_sources = json.load(f)
            save_sources(restored_sources)
        except (IOError, json.JSONDecodeError):
            pass

        # Clean up temporary file
        try:
            os.unlink(temp_backup.name)
        except OSError:
            pass




def pytest_collection_modifyitems(config, items):
    """Modify test collection to handle server-dependent tests."""
    if not config.server_running:
        # Add skip marker to integration tests when server is not running
        skip_integration = pytest.mark.skip(reason="Server not running")
        for item in items:
            if "integration" in item.keywords or "requires_server" in item.keywords:
                item.add_marker(skip_integration)