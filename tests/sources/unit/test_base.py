"""
Tests for base classes and interfaces in the sources package.
"""

import pytest
import sys
import os
from datetime import datetime
from unittest.mock import patch, MagicMock
from pathlib import Path

# Add src directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', '..', 'src'))

from sources.base import (
    SourceConfig, SourceMetadata, TestResult, DataSourceInterface, BaseDataSource
)
from sources.exceptions import SourceConfigurationError, SourceConnectionError


class TestSourceConfig:
    """Test SourceConfig dataclass functionality."""
    
    def test_source_config_creation(self):
        """Test creating a SourceConfig instance."""
        config = SourceConfig(
            source_id='test-123',
            name='Test Source',
            source_type='local_file',
            static_config={'timeout': 30},
            path_template='/data/$file',
            dynamic_variables={'file': 'test.txt'},
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        
        assert config.source_id == 'test-123'
        assert config.name == 'Test Source'
        assert config.source_type == 'local_file'
        assert config.static_config == {'timeout': 30}
        assert config.path_template == '/data/$file'
        assert config.dynamic_variables == {'file': 'test.txt'}
    
    def test_get_resolved_path(self):
        """Test path resolution with dynamic variables."""
        config = SourceConfig(
            source_id='test-123',
            name='Test Source',
            source_type='local_file',
            static_config={},
            path_template='/data/$folder/$file.txt',
            dynamic_variables={'folder': 'uploads', 'file': 'document'},
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        
        resolved = config.get_resolved_path()
        assert resolved == '/data/uploads/document.txt'
    
    def test_extract_variables(self):
        """Test extracting variable names from path template."""
        config = SourceConfig(
            source_id='test-123',
            name='Test Source',
            source_type='s3',
            static_config={},
            path_template='s3://$bucket/$folder/$file',
            dynamic_variables={},
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        
        variables = config.extract_variables()
        assert set(variables) == {'bucket', 'folder', 'file'}
    
    def test_validate_variables_success(self):
        """Test successful variable validation."""
        config = SourceConfig(
            source_id='test-123',
            name='Test Source',
            source_type='local_file',
            static_config={},
            path_template='/data/$file',
            dynamic_variables={'file': 'test.txt'},
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        
        missing = config.validate_variables()
        assert missing == []
    
    def test_validate_variables_missing(self):
        """Test validation with missing variables."""
        config = SourceConfig(
            source_id='test-123',
            name='Test Source',
            source_type='local_file',
            static_config={},
            path_template='/data/$folder/$file',
            dynamic_variables={'file': 'test.txt'},
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        
        missing = config.validate_variables()
        assert 'folder' in missing
    
    def test_validate_variables_empty_values(self):
        """Test validation with empty variable values."""
        config = SourceConfig(
            source_id='test-123',
            name='Test Source',
            source_type='local_file',
            static_config={},
            path_template='/data/$folder/$file',
            dynamic_variables={'folder': '', 'file': 'test.txt'},
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        
        missing = config.validate_variables()
        assert 'folder' in missing


class TestSourceMetadata:
    """Test SourceMetadata dataclass functionality."""
    
    def test_source_metadata_creation(self):
        """Test creating a SourceMetadata instance."""
        metadata = SourceMetadata(
            size=1024,
            last_modified=datetime.now(),
            content_type='text/plain',
            encoding='utf-8',
            checksum='abc123',
            permissions='644',
            extra={'custom_field': 'value'}
        )
        
        assert metadata.size == 1024
        assert metadata.content_type == 'text/plain'
        assert metadata.encoding == 'utf-8'
        assert metadata.checksum == 'abc123'
        assert metadata.permissions == '644'
        assert metadata.extra['custom_field'] == 'value'
    
    def test_source_metadata_defaults(self):
        """Test SourceMetadata with default values."""
        metadata = SourceMetadata()
        
        assert metadata.size is None
        assert metadata.last_modified is None
        assert metadata.content_type is None
        assert metadata.encoding is None
        assert metadata.checksum is None
        assert metadata.permissions is None
        assert metadata.extra is None


class TestTestResult:
    """Test TestResult dataclass functionality."""
    
    def test_test_result_success(self):
        """Test successful TestResult creation."""
        result = TestResult(
            success=True,
            status='connected',
            message='Connection successful',
            response_time=0.123,
            metadata=SourceMetadata(size=1024),
            error=None
        )
        
        assert result.success is True
        assert result.status == 'connected'
        assert result.message == 'Connection successful'
        assert result.response_time == 0.123
        assert result.metadata.size == 1024
        assert result.error is None
    
    def test_test_result_failure(self):
        """Test failed TestResult creation."""
        result = TestResult(
            success=False,
            status='error',
            message='Connection failed',
            response_time=1.5,
            error='Network timeout'
        )
        
        assert result.success is False
        assert result.status == 'error'
        assert result.message == 'Connection failed'
        assert result.response_time == 1.5
        assert result.error == 'Network timeout'
        assert result.metadata is None


class MockDataSource(BaseDataSource):
    """Mock implementation of DataSourceInterface for testing."""
    
    def test_connection(self):
        result = TestResult(success=True, status='connected', message='Mock connection')
        return self._cache_test_result(result)
    
    def get_metadata(self):
        return SourceMetadata(size=100)
    
    def exists(self):
        return True
    
    def read_data(self, **kwargs):
        return b"mock data"
    
    def read_stream(self, **kwargs):
        yield b"mock"
        yield b" data"
    
    def write_data(self, data, **kwargs):
        return True
    
    def list_contents(self, path=None):
        return [{'name': 'file.txt', 'type': 'file'}]


class TestBaseDataSource:
    """Test BaseDataSource functionality."""
    
    def test_base_data_source_creation(self):
        """Test creating a BaseDataSource instance."""
        config = SourceConfig(
            source_id='test-123',
            name='Test Source',
            source_type='mock',
            static_config={},
            path_template='/data/test.txt',
            dynamic_variables={},
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        
        source = MockDataSource(config)
        assert source.config == config
        assert source._connection is None
        assert source._last_test_result is None
    
    def test_validation_success(self):
        """Test successful config validation."""
        config = SourceConfig(
            source_id='test-123',
            name='Test Source',
            source_type='mock',
            static_config={},
            path_template='/data/test.txt',
            dynamic_variables={},
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        
        # Should not raise exception
        source = MockDataSource(config)
        assert source.config == config
    
    def test_validation_failure(self):
        """Test config validation failure."""
        config = SourceConfig(
            source_id='test-123',
            name='Test Source',
            source_type='mock',
            static_config={},
            path_template='/data/$file',
            dynamic_variables={},  # Missing 'file' variable
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        
        with pytest.raises(SourceConfigurationError) as exc_info:
            MockDataSource(config)
        
        assert 'Missing values for variables: file' in str(exc_info.value)
    
    def test_get_last_test_result(self):
        """Test getting last test result."""
        config = SourceConfig(
            source_id='test-123',
            name='Test Source',
            source_type='mock',
            static_config={},
            path_template='/data/test.txt',
            dynamic_variables={},
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        
        source = MockDataSource(config)
        assert source.get_last_test_result() is None
        
        # Test connection and check cached result
        result = source.test_connection()
        assert source.get_last_test_result() == result
    
    def test_get_timeout(self):
        """Test getting timeout from config."""
        config = SourceConfig(
            source_id='test-123',
            name='Test Source',
            source_type='mock',
            static_config={'timeout': 60},
            path_template='/data/test.txt',
            dynamic_variables={},
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        
        source = MockDataSource(config)
        assert source._get_timeout() == 60
        
        # Test default timeout
        config.static_config = {}
        source = MockDataSource(config)
        assert source._get_timeout() == 30
    
    def test_should_retry(self):
        """Test retry logic."""
        config = SourceConfig(
            source_id='test-123',
            name='Test Source',
            source_type='mock',
            static_config={},
            path_template='/data/test.txt',
            dynamic_variables={},
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        
        source = MockDataSource(config)
        
        # Should retry connection errors
        conn_error = SourceConnectionError("Network error")
        assert source._should_retry(conn_error, 1) is True
        assert source._should_retry(conn_error, 3) is False  # Max retries reached
        
        # Should not retry other errors
        config_error = SourceConfigurationError("Config error")
        assert source._should_retry(config_error, 1) is False
    
    def test_get_display_path(self):
        """Test getting display path."""
        config = SourceConfig(
            source_id='test-123',
            name='Test Source',
            source_type='mock',
            static_config={},
            path_template='/data/$file',
            dynamic_variables={'file': 'test.txt'},
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        
        source = MockDataSource(config)
        assert source.get_display_path() == '/data/test.txt'
    
    def test_capabilities(self):
        """Test source capability checks."""
        config = SourceConfig(
            source_id='test-123',
            name='Test Source',
            source_type='mock',
            static_config={},
            path_template='/data/test.txt',
            dynamic_variables={},
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        
        source = MockDataSource(config)
        assert source.is_readable() is True
        assert source.is_writable() is False  # Default implementation
        assert source.is_listable() is False  # Default implementation
    
    def test_get_connection_info(self):
        """Test getting connection info."""
        config = SourceConfig(
            source_id='test-123',
            name='Test Source',
            source_type='mock',
            static_config={'key': 'value'},
            path_template='/data/$file',
            dynamic_variables={'file': 'test.txt'},
            created_at=datetime.now(),
            updated_at=datetime.now(),
            status='connected'
        )
        
        source = MockDataSource(config)
        info = source.get_connection_info()
        
        expected = {
            'source_type': 'mock',
            'resolved_path': '/data/test.txt',
            'static_config': {'key': 'value'},
            'status': 'connected'
        }
        assert info == expected
    
    def test_context_manager(self):
        """Test context manager functionality."""
        config = SourceConfig(
            source_id='test-123',
            name='Test Source',
            source_type='mock',
            static_config={},
            path_template='/data/test.txt',
            dynamic_variables={},
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        
        with MockDataSource(config) as source:
            assert source.config == config
        
        # Connection should be cleaned up (mocked connection)
        assert source._connection is None
    
    def test_string_representations(self):
        """Test string representations."""
        config = SourceConfig(
            source_id='test-123',
            name='Test Source',
            source_type='mock',
            static_config={},
            path_template='/data/test.txt',
            dynamic_variables={},
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        
        source = MockDataSource(config)
        
        assert str(source) == "MockDataSource(Test Source)"
        assert repr(source) == "MockDataSource(source_id='test-123', path='/data/test.txt')"


class TestDataSourceInterface:
    """Test DataSourceInterface abstract base class."""
    
    def test_cannot_instantiate_interface(self):
        """Test that DataSourceInterface cannot be instantiated directly."""
        config = SourceConfig(
            source_id='test-123',
            name='Test Source',
            source_type='mock',
            static_config={},
            path_template='/data/test.txt',
            dynamic_variables={},
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        
        with pytest.raises(TypeError):
            DataSourceInterface(config)
    
    def test_mock_implementation_works(self):
        """Test that our mock implementation satisfies the interface."""
        config = SourceConfig(
            source_id='test-123',
            name='Test Source',
            source_type='mock',
            static_config={},
            path_template='/data/test.txt',
            dynamic_variables={},
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        
        source = MockDataSource(config)
        
        # Test all interface methods
        result = source.test_connection()
        assert isinstance(result, TestResult)
        assert result.success is True
        
        metadata = source.get_metadata()
        assert isinstance(metadata, SourceMetadata)
        assert metadata.size == 100
        
        assert source.exists() is True
        
        data = source.read_data()
        assert data == b"mock data"
        
        stream_data = list(source.read_stream())
        assert stream_data == [b"mock", b" data"]
        
        assert source.write_data(b"test") is True
        
        contents = source.list_contents()
        assert len(contents) == 1
        assert contents[0]['name'] == 'file.txt'