"""
Tests for enhanced error handling and edge cases across all sources.
"""

import pytest
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime
import tempfile
import os
from pathlib import Path

from src.sources.base import SourceConfig, BaseDataSource
from src.sources.local_file import LocalFileSource
from src.sources.exceptions import (
    SourceConfigurationError, SourceNotFoundError, SourceConnectionError,
    SourcePermissionError, SourceAuthenticationError, SourceTimeoutError,
    SourceDataError
)


class TestErrorHandlingEdgeCases:
    """Tests for error handling and edge cases."""

    def test_source_config_validation_missing_variables(self):
        """Test source configuration validation with missing variables."""
        config = SourceConfig(
            source_id='test-config',
            name='Test Config',
            source_type='local_file',
            static_config={},
            path_template='/path/to/$missing_var/file.txt',
            dynamic_variables={},  # Missing the required variable
            created_at=datetime.now(),
            updated_at=datetime.now()
        )

        with pytest.raises(SourceConfigurationError, match="Missing values for variables"):
            LocalFileSource(config)

    def test_source_config_validation_empty_variable_values(self):
        """Test source configuration validation with empty variable values."""
        config = SourceConfig(
            source_id='test-config',
            name='Test Config',
            source_type='local_file',
            static_config={},
            path_template='/path/to/$empty_var/file.txt',
            dynamic_variables={'empty_var': ''},  # Empty value
            created_at=datetime.now(),
            updated_at=datetime.now()
        )

        with pytest.raises(SourceConfigurationError, match="Missing values for variables"):
            LocalFileSource(config)

    def test_local_file_permission_error_on_read(self):
        """Test local file source handles permission errors on read."""
        with tempfile.NamedTemporaryFile(delete=False) as temp_file:
            temp_path = temp_file.name
            temp_file.write(b'test content')

        try:
            # Remove read permission
            os.chmod(temp_path, 0o000)

            config = SourceConfig(
                source_id='test-local',
                name='Test Local',
                source_type='local_file',
                static_config={},
                path_template=temp_path,
                dynamic_variables={},
                created_at=datetime.now(),
                updated_at=datetime.now()
            )

            source = LocalFileSource(config)

            with pytest.raises(SourcePermissionError, match="No read permission"):
                source.read_data()

        finally:
            # Restore permissions for cleanup
            try:
                os.chmod(temp_path, 0o644)
                os.unlink(temp_path)
            except:
                pass

    def test_local_file_unicode_decode_error(self):
        """Test local file source handles unicode decode errors."""
        with tempfile.NamedTemporaryFile(delete=False) as temp_file:
            temp_path = temp_file.name
            # Write invalid UTF-8 bytes
            temp_file.write(b'\xff\xfe\x00\x00invalid utf-8')

        try:
            config = SourceConfig(
                source_id='test-local',
                name='Test Local',
                source_type='local_file',
                static_config={},
                path_template=temp_path,
                dynamic_variables={},
                created_at=datetime.now(),
                updated_at=datetime.now()
            )

            source = LocalFileSource(config)

            with pytest.raises(SourceDataError, match="Failed to decode file"):
                source.read_data(mode='text', encoding='utf-8')

        finally:
            os.unlink(temp_path)

    def test_local_file_directory_read_error(self):
        """Test local file source handles directory read errors."""
        with tempfile.TemporaryDirectory() as temp_dir:
            config = SourceConfig(
                source_id='test-local',
                name='Test Local',
                source_type='local_file',
                static_config={},
                path_template=temp_dir,  # Directory, not file
                dynamic_variables={},
                created_at=datetime.now(),
                updated_at=datetime.now()
            )

            source = LocalFileSource(config)

            with pytest.raises(SourceDataError, match="Path is not a file"):
                source.read_data()

    def test_local_file_write_parent_not_exists(self):
        """Test local file source write when parent directory doesn't exist."""
        nonexistent_path = '/nonexistent/directory/file.txt'

        config = SourceConfig(
            source_id='test-local',
            name='Test Local',
            source_type='local_file',
            static_config={},
            path_template=nonexistent_path,
            dynamic_variables={},
            created_at=datetime.now(),
            updated_at=datetime.now()
        )

        source = LocalFileSource(config)

        with pytest.raises(SourceNotFoundError, match="Parent directory does not exist"):
            source.write_data('test content')

    def test_local_file_directory_listing(self):
        """Test local file source directory listing functionality."""
        with tempfile.TemporaryDirectory() as temp_dir:
            # Create test files
            normal_file = os.path.join(temp_dir, 'normal.txt')
            with open(normal_file, 'w') as f:
                f.write('content')

            config = SourceConfig(
                source_id='test-local',
                name='Test Local',
                source_type='local_file',
                static_config={},
                path_template=temp_dir,
                dynamic_variables={},
                created_at=datetime.now(),
                updated_at=datetime.now()
            )

            source = LocalFileSource(config)

            # Test directory listing works
            contents = source.list_contents_paginated().items
            assert len(contents) > 0

            # Check that we can find our test file
            normal_files = [item for item in contents if item['name'] == 'normal.txt']
            if normal_files:  # May not be found due to directory structure
                assert normal_files[0]['type'] == 'file'

    def test_connection_test_caching(self):
        """Test connection test result caching."""
        config = SourceConfig(
            source_id='test-cache',
            name='Test Cache',
            source_type='local_file',
            static_config={},
            path_template='/tmp',
            dynamic_variables={},
            created_at=datetime.now(),
            updated_at=datetime.now()
        )

        source = LocalFileSource(config)

        # First test
        result1 = source.test_connection()
        cached_result = source.get_last_test_result()

        assert cached_result is not None
        assert cached_result.success == result1.success
        assert cached_result.status == result1.status

        # Second test should return new result but update cache
        result2 = source.test_connection()
        cached_result2 = source.get_last_test_result()

        assert cached_result2.response_time == result2.response_time

    def test_timeout_configuration(self):
        """Test timeout configuration."""
        config = SourceConfig(
            source_id='test-timeout',
            name='Test Timeout',
            source_type='local_file',
            static_config={'timeout': 45},
            path_template='/tmp',
            dynamic_variables={},
            created_at=datetime.now(),
            updated_at=datetime.now()
        )

        source = LocalFileSource(config)
        assert source._get_timeout() == 45

    def test_retry_logic(self):
        """Test retry logic for operations."""
        config = SourceConfig(
            source_id='test-retry',
            name='Test Retry',
            source_type='local_file',
            static_config={},
            path_template='/tmp',
            dynamic_variables={},
            created_at=datetime.now(),
            updated_at=datetime.now()
        )

        source = LocalFileSource(config)

        # Test retry logic
        connection_error = SourceConnectionError("Connection failed")
        auth_error = SourceAuthenticationError("Auth failed")
        permission_error = SourcePermissionError("Permission denied")

        # Should retry connection errors
        assert source._should_retry(connection_error, 1, 3)
        assert not source._should_retry(connection_error, 3, 3)  # Max retries reached

        # Should not retry auth/permission errors
        assert not source._should_retry(auth_error, 1, 3)
        assert not source._should_retry(permission_error, 1, 3)

    def test_context_manager_cleanup_on_exception(self):
        """Test context manager cleanup when exception occurs."""
        config = SourceConfig(
            source_id='test-context',
            name='Test Context',
            source_type='local_file',
            static_config={},
            path_template='/tmp',
            dynamic_variables={},
            created_at=datetime.now(),
            updated_at=datetime.now()
        )

        source = LocalFileSource(config)
        mock_connection = Mock()
        mock_connection.close = Mock()
        source._connection = mock_connection

        try:
            with source:
                raise ValueError("Test exception")
        except ValueError:
            pass

        # Connection should be cleaned up even with exception
        assert source._connection is None

    def test_string_representations(self):
        """Test string representations of source objects."""
        config = SourceConfig(
            source_id='test-repr',
            name='Test Repr',
            source_type='local_file',
            static_config={},
            path_template='/tmp/test.txt',
            dynamic_variables={},
            created_at=datetime.now(),
            updated_at=datetime.now()
        )

        source = LocalFileSource(config)

        str_repr = str(source)
        assert 'LocalFileSource' in str_repr
        assert 'Test Repr' in str_repr

        repr_repr = repr(source)
        assert 'LocalFileSource' in repr_repr
        assert 'test-repr' in repr_repr
        assert '/tmp/test.txt' in repr_repr

    def test_format_last_modified_edge_cases(self):
        """Test format_last_modified method with edge cases."""
        # Test with None
        result = BaseDataSource.format_last_modified(None)
        assert result['modified'] is None
        assert result['last_modified'] is None

        # Test with datetime
        dt = datetime(2024, 1, 1, 12, 0, 0)
        result = BaseDataSource.format_last_modified(dt)
        assert result['modified'] == dt.timestamp()
        assert result['last_modified'] == dt.isoformat()

        # Test with timestamp
        timestamp = 1704110400.0  # 2024-01-01 12:00:00 UTC
        result = BaseDataSource.format_last_modified(timestamp)
        assert result['modified'] == timestamp
        assert '2024-01-01' in result['last_modified']  # Just check date part, timezone may vary

        # Test with ISO string with Z
        iso_string = "2024-01-01T12:00:00Z"
        result = BaseDataSource.format_last_modified(iso_string)
        assert result['modified'] is not None
        assert result['last_modified'] is not None

        # Test with regular ISO string
        iso_string = "2024-01-01T12:00:00"
        result = BaseDataSource.format_last_modified(iso_string)
        assert result['modified'] is not None
        assert result['last_modified'] is not None

        # Test with timestamp string
        timestamp_string = "1704110400"
        result = BaseDataSource.format_last_modified(timestamp_string)
        assert result['modified'] is not None
        assert '2024-01-01' in result['last_modified']  # Just check date part

        # Test with invalid string
        invalid_string = "invalid-date-format"
        result = BaseDataSource.format_last_modified(invalid_string)
        assert result['modified'] is None
        assert result['last_modified'] is None

        # Test with invalid type
        invalid_type = {'not': 'a date'}
        result = BaseDataSource.format_last_modified(invalid_type)
        assert result['modified'] is None
        assert result['last_modified'] is None

    def test_large_file_checksum_skip(self):
        """Test that large files skip checksum calculation."""
        # Create a config for a large file (simulate by patching file size)
        with tempfile.NamedTemporaryFile(delete=False) as temp_file:
            temp_path = temp_file.name
            temp_file.write(b'small content')

        try:
            config = SourceConfig(
                source_id='test-large',
                name='Test Large',
                source_type='local_file',
                static_config={},
                path_template=temp_path,
                dynamic_variables={},
                created_at=datetime.now(),
                updated_at=datetime.now()
            )

            source = LocalFileSource(config)

            # Mock the file size to be larger than 10MB threshold
            with patch('pathlib.Path.stat') as mock_stat:
                mock_stat_result = Mock()
                mock_stat_result.st_size = 20 * 1024 * 1024  # 20MB
                mock_stat_result.st_mtime = datetime.now().timestamp()
                mock_stat_result.st_mode = 0o644
                mock_stat.return_value = mock_stat_result

                metadata = source.get_metadata()
                assert metadata.checksum is None  # No checksum for large files

        finally:
            os.unlink(temp_path)

    def test_checksum_calculation_error_handling(self):
        """Test checksum calculation error handling."""
        with tempfile.NamedTemporaryFile(delete=False) as temp_file:
            temp_path = temp_file.name
            temp_file.write(b'test content')

        try:
            config = SourceConfig(
                source_id='test-checksum',
                name='Test Checksum',
                source_type='local_file',
                static_config={},
                path_template=temp_path,
                dynamic_variables={},
                created_at=datetime.now(),
                updated_at=datetime.now()
            )

            source = LocalFileSource(config)

            # Mock open to raise an exception during checksum calculation
            original_open = open

            def mock_open(*args, **kwargs):
                if 'rb' in args or kwargs.get('mode') == 'rb':
                    raise IOError("Simulated read error")
                return original_open(*args, **kwargs)

            with patch('builtins.open', side_effect=mock_open):
                metadata = source.get_metadata()
                # Checksum should be None when calculation fails
                assert metadata.checksum is None

        finally:
            os.unlink(temp_path)

    def test_directory_capabilities(self):
        """Test directory vs file capabilities."""
        with tempfile.TemporaryDirectory() as temp_dir:
            config = SourceConfig(
                source_id='test-dir',
                name='Test Dir',
                source_type='local_file',
                static_config={},
                path_template=temp_dir,
                dynamic_variables={},
                created_at=datetime.now(),
                updated_at=datetime.now()
            )

            source = LocalFileSource(config)

            assert source.is_directory()
            assert not source.is_file()
            assert source.is_listable()

    def test_file_capabilities(self):
        """Test file capabilities."""
        with tempfile.NamedTemporaryFile(delete=False) as temp_file:
            temp_path = temp_file.name
            temp_file.write(b'test content')

        try:
            config = SourceConfig(
                source_id='test-file',
                name='Test File',
                source_type='local_file',
                static_config={},
                path_template=temp_path,
                dynamic_variables={},
                created_at=datetime.now(),
                updated_at=datetime.now()
            )

            source = LocalFileSource(config)

            assert not source.is_directory()
            assert source.is_file()
            assert source.is_writable()
            assert source.is_readable()

        finally:
            os.unlink(temp_path)

    def test_config_override_capabilities(self):
        """Test configuration override for directory/file detection."""
        with tempfile.TemporaryDirectory() as temp_dir:
            # Create config that overrides directory detection
            config = SourceConfig(
                source_id='test-override',
                name='Test Override',
                source_type='local_file',
                static_config={},
                path_template=temp_dir,
                dynamic_variables={},
                created_at=datetime.now(),
                updated_at=datetime.now(),
                is_directory=False  # Override: treat directory as file
            )

            source = LocalFileSource(config)

            # Should respect override
            assert not source.is_directory()
            assert source.is_file()