"""
Simple tests for S3Source implementation focusing on key functionality.
"""

import pytest
import sys
import os
from datetime import datetime
from unittest.mock import patch, MagicMock

# Add src directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', '..', 'src'))

from sources.s3 import S3Source
from sources.base import SourceConfig, SourceMetadata, ConnectionTestResult
from sources.exceptions import (
    SourceNotFoundError, SourceConnectionError, SourcePermissionError, 
    SourceDataError, SourceAuthenticationError, SourceConfigurationError
)


class TestS3SourceSimple:
    """Simple test S3Source functionality without complex boto3 mocking."""
    
    def create_config(self, path='s3://test-bucket/test-key.txt', **kwargs):
        """Helper to create SourceConfig."""
        return SourceConfig(
            source_id='test-123',
            name='Test S3 Source',
            source_type='s3',
            static_config=kwargs.get('static_config', {}),
            path_template=path,
            dynamic_variables=kwargs.get('dynamic_variables', {}),
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
    
    def test_initialization(self):
        """Test S3Source initialization."""
        config = self.create_config()
        source = S3Source(config)
        
        assert source.config == config
        assert source._resolved_path == 's3://test-bucket/test-key.txt'
        assert source._bucket == 'test-bucket'
        assert source._key == 'test-key.txt'
        assert source._s3_client is None
        assert source._session is None
    
    def test_initialization_bucket_only(self):
        """Test S3Source initialization with bucket only."""
        config = self.create_config(path='s3://test-bucket/')
        source = S3Source(config)
        
        assert source._bucket == 'test-bucket'
        assert source._key == ''
    
    def test_parse_s3_path_invalid(self):
        """Test parsing invalid S3 paths."""
        # Test non-s3 URL
        config = self.create_config(path='http://example.com/file.txt')
        with pytest.raises(SourceConfigurationError, match="S3 path must start with 's3://'"):
            S3Source(config)
        
        # Test missing bucket
        config = self.create_config(path='s3:///file.txt')
        with pytest.raises(SourceConfigurationError, match="S3 bucket name is required"):
            S3Source(config)
    
    def test_parse_s3_metadata(self):
        """Test parsing S3 head_object response to metadata."""
        config = self.create_config()
        source = S3Source(config)
        
        response = {
            'ContentLength': 2048,
            'ContentType': 'application/json',
            'LastModified': datetime.now(),
            'ETag': '"abc123def"',
            'ContentEncoding': 'gzip',
            'StorageClass': 'STANDARD',
            'ServerSideEncryption': 'AES256',
            'Metadata': {'custom': 'value'},
            'VersionId': 'version123'
        }
        
        metadata = source._parse_s3_metadata(response)
        
        assert isinstance(metadata, SourceMetadata)
        assert metadata.size == 2048
        assert metadata.content_type == 'application/json'
        assert metadata.encoding == 'gzip'
        assert metadata.checksum == 'abc123def'
        assert metadata.extra['storage_class'] == 'STANDARD'
        assert metadata.extra['server_side_encryption'] == 'AES256'
        assert metadata.extra['metadata'] == {'custom': 'value'}
        assert metadata.extra['version_id'] == 'version123'
    
    def test_capabilities(self):
        """Test source capabilities."""
        config = self.create_config()
        source = S3Source(config)
        
        assert source.is_writable() is True
        assert source.is_listable() is True
        assert source.is_readable() is True  # Inherited from base
    
    def test_dynamic_variables_resolution(self):
        """Test S3 path resolution with dynamic variables."""
        template = 's3://$bucket/$prefix/file.txt'
        config = SourceConfig(
            source_id='test-123',
            name='Test Dynamic S3',
            source_type='s3',
            static_config={},
            path_template=template,
            dynamic_variables={'bucket': 'my-bucket', 'prefix': 'data'},
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        
        source = S3Source(config)
        assert source._resolved_path == 's3://my-bucket/data/file.txt'
        assert source._bucket == 'my-bucket'
        assert source._key == 'data/file.txt'
    
    def test_is_file_false_bucket(self):
        """Test is_file() returning false for bucket."""
        config = self.create_config(path='s3://test-bucket/')
        source = S3Source(config)
        
        assert source.is_file() is False
    
    def test_is_file_false_prefix(self):
        """Test is_file() returning false for prefix."""
        config = self.create_config(path='s3://test-bucket/docs/')
        source = S3Source(config)
        
        assert source.is_file() is False
    
    def test_context_manager_cleanup(self):
        """Test cleanup in context manager."""
        config = self.create_config()
        
        source = S3Source(config)
        # Set some mock values to test cleanup
        source._s3_client = MagicMock()
        source._session = MagicMock()
        
        with source:
            pass
        
        # After context exit, references should be None
        assert source._s3_client is None
        assert source._session is None
    
