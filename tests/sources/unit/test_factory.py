"""
Tests for SourceFactory and factory functionality.
"""

import pytest
import sys
import os
from datetime import datetime
from unittest.mock import patch, MagicMock

# Add src directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', '..', 'src'))

from sources.factory import SourceFactory, create_source
from sources.base import SourceConfig, DataSourceInterface
from sources.exceptions import SourceConfigurationError
from sources.local_file import LocalFileSource
from sources.s3 import S3Source
from sources.sftp import SftpSource
from sources.http import HttpSource
from sources.samba import SambaSource


class MockSource(DataSourceInterface):
    """Mock source for testing factory registration."""
    
    def test_connection(self):
        pass
    
    def get_metadata(self):
        pass
    
    def exists(self):
        pass
    
    def read_data(self, **kwargs):
        pass
    
    def read_stream(self, **kwargs):
        pass
    
    def write_data(self, data, **kwargs):
        pass
    
    def list_contents(self, path=None):
        pass


class TestSourceFactory:
    """Test SourceFactory functionality."""
    
    def test_get_available_types(self):
        """Test getting available source types."""
        types = SourceFactory.get_available_types()
        
        expected_types = [
            'local_file', 'file', 's3', 'sftp', 'http', 'https', 'samba', 'smb'
        ]
        
        for expected_type in expected_types:
            assert expected_type in types
    
    def test_register_source_type(self):
        """Test registering a custom source type."""
        # Save original registry
        original_registry = SourceFactory._source_registry.copy()
        
        try:
            # Register custom source
            SourceFactory.register_source_type('custom', MockSource)
            
            # Check it's registered
            assert 'custom' in SourceFactory.get_available_types()
            assert SourceFactory._source_registry['custom'] == MockSource
            
        finally:
            # Restore original registry
            SourceFactory._source_registry = original_registry
    
    def test_create_source_local_file(self):
        """Test creating a local file source."""
        config = SourceConfig(
            source_id='test-123',
            name='Test Local File',
            source_type='local_file',
            static_config={},
            path_template='/tmp/test.txt',
            dynamic_variables={},
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        
        source = SourceFactory.create_source(config)
        assert isinstance(source, LocalFileSource)
        assert source.config == config
    
    def test_create_source_file_alias(self):
        """Test creating a source using 'file' alias."""
        config = SourceConfig(
            source_id='test-123',
            name='Test File',
            source_type='file',
            static_config={},
            path_template='/tmp/test.txt',
            dynamic_variables={},
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        
        source = SourceFactory.create_source(config)
        assert isinstance(source, LocalFileSource)
    
    def test_create_source_s3(self):
        """Test creating an S3 source."""
        config = SourceConfig(
            source_id='test-123',
            name='Test S3',
            source_type='s3',
            static_config={'aws_profile': 'default'},
            path_template='s3://bucket/key',
            dynamic_variables={},
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        
        source = SourceFactory.create_source(config)
        assert isinstance(source, S3Source)
        assert source.config == config
    
    def test_create_source_sftp(self):
        """Test creating an SFTP source."""
        config = SourceConfig(
            source_id='test-123',
            name='Test SFTP',
            source_type='sftp',
            static_config={'host': 'example.com', 'username': 'user'},
            path_template='sftp://example.com/path/file',
            dynamic_variables={},
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        
        source = SourceFactory.create_source(config)
        assert isinstance(source, SftpSource)
    
    def test_create_source_http(self):
        """Test creating an HTTP source."""
        config = SourceConfig(
            source_id='test-123',
            name='Test HTTP',
            source_type='http',
            static_config={},
            path_template='http://example.com/api/data',
            dynamic_variables={},
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        
        source = SourceFactory.create_source(config)
        assert isinstance(source, HttpSource)
    
    def test_create_source_https_alias(self):
        """Test creating a source using 'https' alias."""
        config = SourceConfig(
            source_id='test-123',
            name='Test HTTPS',
            source_type='https',
            static_config={},
            path_template='https://example.com/api/data',
            dynamic_variables={},
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        
        source = SourceFactory.create_source(config)
        assert isinstance(source, HttpSource)
    
    def test_create_source_samba(self):
        """Test creating a Samba source."""
        config = SourceConfig(
            source_id='test-123',
            name='Test Samba',
            source_type='samba',
            static_config={'host': 'server.local', 'username': 'user'},
            path_template='smb://server.local/share/file',
            dynamic_variables={},
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        
        source = SourceFactory.create_source(config)
        assert isinstance(source, SambaSource)
    
    def test_create_source_smb_alias(self):
        """Test creating a source using 'smb' alias."""
        config = SourceConfig(
            source_id='test-123',
            name='Test SMB',
            source_type='smb',
            static_config={'host': 'server.local'},
            path_template='smb://server.local/share/file',
            dynamic_variables={},
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        
        source = SourceFactory.create_source(config)
        assert isinstance(source, SambaSource)
    
    def test_create_source_case_insensitive(self):
        """Test that source type matching is case insensitive."""
        config = SourceConfig(
            source_id='test-123',
            name='Test Case',
            source_type='LOCAL_FILE',  # Uppercase
            static_config={},
            path_template='/tmp/test.txt',
            dynamic_variables={},
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        
        source = SourceFactory.create_source(config)
        assert isinstance(source, LocalFileSource)
    
    def test_create_source_unsupported_type(self):
        """Test creating a source with unsupported type."""
        config = SourceConfig(
            source_id='test-123',
            name='Test Unsupported',
            source_type='unsupported_type',
            static_config={},
            path_template='/tmp/test.txt',
            dynamic_variables={},
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        
        with pytest.raises(SourceConfigurationError) as exc_info:
            SourceFactory.create_source(config)
        
        assert 'Unsupported source type: unsupported_type' in str(exc_info.value)
        assert 'Available types:' in str(exc_info.value)
    
    def test_create_source_from_dict_new_format(self):
        """Test creating source from dictionary (new format)."""
        source_data = {
            'source_id': 'test-123',
            'name': 'Test Dict Source',
            'source_type': 'local_file',
            'staticConfig': {'timeout': 30},
            'pathTemplate': '/data/$file',
            'dynamicVariables': {'file': 'test.txt'},
            'created_at': '2023-01-01T12:00:00',
            'updated_at': '2023-01-01T12:00:00',
            'status': 'active'
        }
        
        source = SourceFactory.create_source_from_dict(source_data)
        assert isinstance(source, LocalFileSource)
        assert source.config.source_id == 'test-123'
        assert source.config.name == 'Test Dict Source'
        assert source.config.static_config == {'timeout': 30}
        assert source.config.path_template == '/data/$file'
        assert source.config.dynamic_variables == {'file': 'test.txt'}
    
    def test_create_source_from_dict_legacy_format(self):
        """Test creating source from dictionary (legacy format)."""
        source_data = {
            'source_id': 'test-123',
            'name': 'Test Legacy Source',
            'source_type': 'local_file',
            'static_config': {'timeout': 30},
            'path_template': '/data/test.txt',
            'dynamic_variables': {},
            'created_at': '2023-01-01T12:00:00',
            'updated_at': '2023-01-01T12:00:00'
        }
        
        source = SourceFactory.create_source_from_dict(source_data)
        assert isinstance(source, LocalFileSource)
        assert source.config.source_id == 'test-123'
        assert source.config.name == 'Test Legacy Source'
        assert source.config.static_config == {'timeout': 30}
        assert source.config.path_template == '/data/test.txt'
    
    def test_create_source_from_dict_minimal(self):
        """Test creating source from minimal dictionary."""
        source_data = {
            'source_id': 'test-123',
            'name': 'Test Minimal',
            'source_type': 'local_file'
        }
        
        source = SourceFactory.create_source_from_dict(source_data)
        assert isinstance(source, LocalFileSource)
        assert source.config.source_id == 'test-123'
        assert source.config.name == 'Test Minimal'
        assert source.config.source_type == 'local_file'
        assert source.config.static_config == {}
        assert source.config.dynamic_variables == {}
    
    def test_infer_source_type_s3(self):
        """Test inferring S3 source type from path."""
        path = 's3://my-bucket/path/to/file.txt'
        source_type = SourceFactory.infer_source_type_from_path(path)
        assert source_type == 's3'
    
    def test_infer_source_type_sftp(self):
        """Test inferring SFTP source type from path."""
        path = 'sftp://server.com/path/file.txt'
        source_type = SourceFactory.infer_source_type_from_path(path)
        assert source_type == 'sftp'
    
    def test_infer_source_type_http(self):
        """Test inferring HTTP source type from path."""
        path = 'http://example.com/api/data'
        source_type = SourceFactory.infer_source_type_from_path(path)
        assert source_type == 'http'
    
    def test_infer_source_type_https(self):
        """Test inferring HTTPS source type from path."""
        path = 'https://example.com/api/data'
        source_type = SourceFactory.infer_source_type_from_path(path)
        assert source_type == 'http'
    
    def test_infer_source_type_smb(self):
        """Test inferring SMB source type from path."""
        path = 'smb://server/share/file.txt'
        source_type = SourceFactory.infer_source_type_from_path(path)
        assert source_type == 'samba'
    
    def test_infer_source_type_local_absolute(self):
        """Test inferring local file type from absolute path."""
        path = '/home/user/documents/file.txt'
        source_type = SourceFactory.infer_source_type_from_path(path)
        assert source_type == 'local_file'
    
    def test_infer_source_type_local_windows(self):
        """Test inferring local file type from Windows path."""
        path = 'C:\\Users\\User\\Documents\\file.txt'
        source_type = SourceFactory.infer_source_type_from_path(path)
        assert source_type == 'local_file'
    
    def test_infer_source_type_local_relative(self):
        """Test inferring local file type from relative path."""
        path = './data/file.txt'
        source_type = SourceFactory.infer_source_type_from_path(path)
        assert source_type == 'local_file'
    
    def test_infer_source_type_unknown(self):
        """Test inferring source type from unknown path format."""
        path = 'unknown://something'
        
        with pytest.raises(SourceConfigurationError) as exc_info:
            SourceFactory.infer_source_type_from_path(path)
        
        assert 'Cannot infer source type from path' in str(exc_info.value)
    
    def test_infer_source_type_case_insensitive(self):
        """Test that path inference is case insensitive."""
        path = 'S3://MY-BUCKET/FILE.TXT'
        source_type = SourceFactory.infer_source_type_from_path(path)
        assert source_type == 's3'


class TestCreateSourceFunction:
    """Test the create_source convenience function."""
    
    def test_create_source_function(self):
        """Test the standalone create_source function."""
        config = SourceConfig(
            source_id='test-123',
            name='Test Function',
            source_type='local_file',
            static_config={},
            path_template='/tmp/test.txt',
            dynamic_variables={},
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        
        source = create_source(config)
        assert isinstance(source, LocalFileSource)
        assert source.config == config