"""
Tests for S3Source implementation.
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


class TestS3Source:
    """Test S3Source functionality."""
    
    def setup_s3_mocks(self, mock_import):
        """Helper to set up S3 mocking consistently."""
        # Mock boto3 module
        mock_boto3 = MagicMock()
        mock_session = MagicMock()
        mock_client = MagicMock()
        mock_session.client.return_value = mock_client
        mock_boto3.Session.return_value = mock_session
        
        # Mock botocore exceptions
        mock_botocore = MagicMock()
        mock_botocore.exceptions.NoCredentialsError = Exception
        mock_botocore.exceptions.ClientError = Exception
        
        def side_effect(name, *args, **kwargs):
            if name == 'boto3':
                return mock_boto3
            elif name == 'botocore.exceptions':
                return mock_botocore.exceptions
            else:
                return __builtins__['__import__'](name, *args, **kwargs)
        
        mock_import.side_effect = side_effect
        return mock_boto3, mock_session, mock_client
    
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
    
    @patch('builtins.__import__')
    def test_get_s3_client_basic(self, mock_import):
        """Test getting S3 client with basic configuration."""
        mock_boto3, mock_session, mock_client = self.setup_s3_mocks(mock_import)
        
        config = self.create_config()
        source = S3Source(config)
        
        client = source._get_s3_client()
        
        assert client == mock_client
        assert source._s3_client == mock_client
        assert source._session == mock_session
        mock_boto3.Session.assert_called_once()
        mock_session.client.assert_called_with('s3', region_name='us-east-1')
    
    @patch('builtins.__import__')
    def test_get_s3_client_with_profile(self, mock_import):
        """Test getting S3 client with AWS profile."""
        mock_boto3, mock_session, mock_client = self.setup_s3_mocks(mock_import)
        
        config = self.create_config(
            static_config={
                'aws_profile': 'test-profile',
                'region': 'us-west-2'
            }
        )
        source = S3Source(config)
        
        client = source._get_s3_client()
        
        mock_boto3.Session.assert_called_with(profile_name='test-profile')
        mock_session.client.assert_called_with('s3', region_name='us-west-2')
    
    @patch('sources.s3.boto3')
    def test_get_s3_client_import_error(self, mock_boto3):
        """Test S3 client creation with missing boto3."""
        mock_boto3.side_effect = ImportError("No module named 'boto3'")
        
        config = self.create_config()
        source = S3Source(config)
        
        with pytest.raises(SourceConnectionError, match="boto3 library is required"):
            source._get_s3_client()
    
    @patch('sources.s3.boto3')
    def test_get_s3_client_no_credentials(self, mock_session_class):
        """Test S3 client creation with no credentials."""
        from botocore.exceptions import NoCredentialsError
        
        mock_session = MagicMock()
        mock_session.client.side_effect = NoCredentialsError()
        mock_session_class.return_value = mock_session
        
        config = self.create_config()
        source = S3Source(config)
        
        with pytest.raises(SourceAuthenticationError, match="AWS credentials not found"):
            source._get_s3_client()
    
    @patch('sources.s3.boto3')
    def test_test_connection_success_object(self, mock_session_class):
        """Test successful connection test for S3 object."""
        mock_session = MagicMock()
        mock_client = MagicMock()
        mock_session.client.return_value = mock_client
        mock_session_class.return_value = mock_session
        
        # Mock successful bucket and object checks
        mock_client.head_bucket.return_value = {}
        mock_client.head_object.return_value = {
            'ContentLength': 1024,
            'ContentType': 'text/plain',
            'LastModified': datetime.now(),
            'ETag': '"abc123"'
        }
        
        config = self.create_config()
        source = S3Source(config)
        
        result = source.test_connection()
        
        assert isinstance(result, ConnectionTestResult)
        assert result.success is True
        assert result.status == 'connected'
        assert 'Successfully accessed S3 object' in result.message
        assert result.response_time is not None
        assert result.metadata is not None
        assert result.metadata.size == 1024
    
    @patch('sources.s3.boto3')
    def test_test_connection_success_bucket(self, mock_session_class):
        """Test successful connection test for S3 bucket only."""
        mock_session = MagicMock()
        mock_client = MagicMock()
        mock_session.client.return_value = mock_client
        mock_session_class.return_value = mock_session
        
        # Mock successful bucket check
        mock_client.head_bucket.return_value = {}
        
        config = self.create_config(path='s3://test-bucket/')
        source = S3Source(config)
        
        result = source.test_connection()
        
        assert result.success is True
        assert result.status == 'connected'
        assert 'Successfully accessed S3 bucket' in result.message
    
    @patch('sources.s3.boto3')
    def test_test_connection_bucket_not_found(self, mock_session_class):
        """Test connection test with bucket not found."""
        mock_session = MagicMock()
        mock_client = MagicMock()
        mock_session.client.return_value = mock_client
        mock_session_class.return_value = mock_session
        
        # Mock 404 error for bucket
        error = Exception()
        error.response = {'Error': {'Code': '404'}}
        mock_client.head_bucket.side_effect = error
        
        config = self.create_config()
        source = S3Source(config)
        
        result = source.test_connection()
        
        assert result.success is False
        assert result.status == 'error'
        assert 'Bucket not found' in result.message
        assert result.error == 'Bucket not found'
    
    @patch('sources.s3.boto3')
    def test_test_connection_bucket_forbidden(self, mock_session_class):
        """Test connection test with bucket access forbidden."""
        mock_session = MagicMock()
        mock_client = MagicMock()
        mock_session.client.return_value = mock_client
        mock_session_class.return_value = mock_session
        
        # Mock 403 error for bucket
        error = Exception()
        error.response = {'Error': {'Code': '403'}}
        mock_client.head_bucket.side_effect = error
        
        config = self.create_config()
        source = S3Source(config)
        
        result = source.test_connection()
        
        assert result.success is False
        assert result.status == 'unauthorized'
        assert 'Access denied to bucket' in result.message
    
    @patch('sources.s3.boto3')
    def test_test_connection_object_not_found(self, mock_session_class):
        """Test connection test with object not found."""
        mock_session = MagicMock()
        mock_client = MagicMock()
        mock_session.client.return_value = mock_client
        mock_session_class.return_value = mock_session
        
        # Mock successful bucket check
        mock_client.head_bucket.return_value = {}
        
        # Mock 404 error for object
        error = Exception()
        error.response = {'Error': {'Code': '404'}}
        mock_client.head_object.side_effect = error
        
        config = self.create_config()
        source = S3Source(config)
        
        result = source.test_connection()
        
        assert result.success is False
        assert result.status == 'error'
        assert 'Object not found' in result.message
    
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
    
    @patch('sources.s3.boto3')
    def test_get_metadata_success(self, mock_session_class):
        """Test getting metadata successfully."""
        mock_session = MagicMock()
        mock_client = MagicMock()
        mock_session.client.return_value = mock_client
        mock_session_class.return_value = mock_session
        
        mock_client.head_object.return_value = {
            'ContentLength': 1024,
            'ContentType': 'text/plain',
            'LastModified': datetime.now(),
            'ETag': '"abc123"'
        }
        
        config = self.create_config()
        source = S3Source(config)
        
        metadata = source.get_metadata()
        
        assert isinstance(metadata, SourceMetadata)
        assert metadata.size == 1024
        assert metadata.content_type == 'text/plain'
        mock_client.head_object.assert_called_with(Bucket='test-bucket', Key='test-key.txt')
    
    @patch('sources.s3.boto3')
    def test_get_metadata_no_key(self, mock_session_class):
        """Test getting metadata without object key."""
        config = self.create_config(path='s3://test-bucket/')
        source = S3Source(config)
        
        with pytest.raises(SourceDataError, match="Cannot get metadata for bucket without object key"):
            source.get_metadata()
    
    @patch('sources.s3.boto3')
    def test_get_metadata_not_found(self, mock_session_class):
        """Test getting metadata with object not found."""
        mock_session = MagicMock()
        mock_client = MagicMock()
        mock_session.client.return_value = mock_client
        mock_session_class.return_value = mock_session
        
        error = Exception()
        error.response = {'Error': {'Code': '404'}}
        mock_client.head_object.side_effect = error
        
        config = self.create_config()
        source = S3Source(config)
        
        with pytest.raises(SourceNotFoundError):
            source.get_metadata()
    
    @patch('sources.s3.boto3')
    def test_exists_object_true(self, mock_session_class):
        """Test exists() with object that exists."""
        mock_session = MagicMock()
        mock_client = MagicMock()
        mock_session.client.return_value = mock_client
        mock_session_class.return_value = mock_session
        
        mock_client.head_object.return_value = {}
        
        config = self.create_config()
        source = S3Source(config)
        
        assert source.exists() is True
        mock_client.head_object.assert_called_with(Bucket='test-bucket', Key='test-key.txt')
    
    @patch('sources.s3.boto3')
    def test_exists_object_false(self, mock_session_class):
        """Test exists() with object that doesn't exist."""
        mock_session = MagicMock()
        mock_client = MagicMock()
        mock_session.client.return_value = mock_client
        mock_session_class.return_value = mock_session
        
        mock_client.head_object.side_effect = Exception()
        
        config = self.create_config()
        source = S3Source(config)
        
        assert source.exists() is False
    
    @patch('sources.s3.boto3')
    def test_exists_bucket_true(self, mock_session_class):
        """Test exists() with bucket that exists."""
        mock_session = MagicMock()
        mock_client = MagicMock()
        mock_session.client.return_value = mock_client
        mock_session_class.return_value = mock_session
        
        mock_client.head_bucket.return_value = {}
        
        config = self.create_config(path='s3://test-bucket/')
        source = S3Source(config)
        
        assert source.exists() is True
        mock_client.head_bucket.assert_called_with(Bucket='test-bucket')
    
    @patch('sources.s3.boto3')
    def test_read_data_success(self, mock_session_class):
        """Test reading data from S3 object."""
        mock_session = MagicMock()
        mock_client = MagicMock()
        mock_session.client.return_value = mock_client
        mock_session_class.return_value = mock_session
        
        mock_body = MagicMock()
        mock_body.read.return_value = b'test content'
        mock_client.get_object.return_value = {'Body': mock_body}
        
        config = self.create_config()
        source = S3Source(config)
        
        data = source.read_data()
        
        assert data == b'test content'
        mock_client.get_object.assert_called_with(Bucket='test-bucket', Key='test-key.txt')
    
    @patch('sources.s3.boto3')
    def test_read_data_text_mode(self, mock_session_class):
        """Test reading data in text mode."""
        mock_session = MagicMock()
        mock_client = MagicMock()
        mock_session.client.return_value = mock_client
        mock_session_class.return_value = mock_session
        
        mock_body = MagicMock()
        mock_body.read.return_value = b'test content'
        mock_client.get_object.return_value = {'Body': mock_body}
        
        config = self.create_config()
        source = S3Source(config)
        
        data = source.read_data(mode='text', encoding='utf-8')
        
        assert data == 'test content'
    
    @patch('sources.s3.boto3')
    def test_read_data_with_limit(self, mock_session_class):
        """Test reading data with byte range limit."""
        mock_session = MagicMock()
        mock_client = MagicMock()
        mock_session.client.return_value = mock_client
        mock_session_class.return_value = mock_session
        
        mock_body = MagicMock()
        mock_body.read.return_value = b'test'
        mock_client.get_object.return_value = {'Body': mock_body}
        
        config = self.create_config()
        source = S3Source(config)
        
        data = source.read_data(limit=100)
        
        mock_client.get_object.assert_called_with(
            Bucket='test-bucket', 
            Key='test-key.txt',
            Range='bytes=0-99'
        )
        assert data == b'test'
    
    @patch('sources.s3.boto3')
    def test_read_data_no_key(self, mock_session_class):
        """Test reading data without object key."""
        config = self.create_config(path='s3://test-bucket/')
        source = S3Source(config)
        
        with pytest.raises(SourceDataError, match="Cannot read data from bucket without object key"):
            source.read_data()
    
    @patch('sources.s3.boto3')
    def test_read_data_not_found(self, mock_session_class):
        """Test reading data with object not found."""
        mock_session = MagicMock()
        mock_client = MagicMock()
        mock_session.client.return_value = mock_client
        mock_session_class.return_value = mock_session
        
        error = Exception()
        error.response = {'Error': {'Code': '404'}}
        mock_client.get_object.side_effect = error
        
        config = self.create_config()
        source = S3Source(config)
        
        with pytest.raises(SourceNotFoundError):
            source.read_data()
    
    @patch('sources.s3.boto3')
    def test_read_stream_success(self, mock_session_class):
        """Test reading data as stream."""
        mock_session = MagicMock()
        mock_client = MagicMock()
        mock_session.client.return_value = mock_client
        mock_session_class.return_value = mock_session
        
        mock_body = MagicMock()
        mock_body.read.side_effect = [b'chunk1', b'chunk2', b'']
        mock_client.get_object.return_value = {'Body': mock_body}
        
        config = self.create_config()
        source = S3Source(config)
        
        chunks = list(source.read_stream(chunk_size=6))
        
        assert chunks == [b'chunk1', b'chunk2']
        mock_body.close.assert_called_once()
    
    @patch('sources.s3.boto3')
    def test_read_stream_text_mode(self, mock_session_class):
        """Test reading stream in text mode."""
        mock_session = MagicMock()
        mock_client = MagicMock()
        mock_session.client.return_value = mock_client
        mock_session_class.return_value = mock_session
        
        mock_body = MagicMock()
        mock_body.read.side_effect = [b'hello', b' world', b'']
        mock_client.get_object.return_value = {'Body': mock_body}
        
        config = self.create_config()
        source = S3Source(config)
        
        chunks = list(source.read_stream(mode='text', chunk_size=5))
        
        assert chunks == ['hello', ' world']
    
    @patch('sources.s3.boto3')
    def test_write_data_success(self, mock_session_class):
        """Test writing data to S3 object."""
        mock_session = MagicMock()
        mock_client = MagicMock()
        mock_session.client.return_value = mock_client
        mock_session_class.return_value = mock_session
        
        mock_client.put_object.return_value = {}
        
        config = self.create_config()
        source = S3Source(config)
        
        result = source.write_data('test content')
        
        assert result is True
        mock_client.put_object.assert_called_with(
            Bucket='test-bucket',
            Key='test-key.txt',
            Body=b'test content'
        )
    
    @patch('sources.s3.boto3')
    def test_write_data_with_metadata(self, mock_session_class):
        """Test writing data with metadata."""
        mock_session = MagicMock()
        mock_client = MagicMock()
        mock_session.client.return_value = mock_client
        mock_session_class.return_value = mock_session
        
        mock_client.put_object.return_value = {}
        
        config = self.create_config()
        source = S3Source(config)
        
        result = source.write_data(
            'test content',
            content_type='text/plain',
            metadata={'custom': 'value'}
        )
        
        assert result is True
        mock_client.put_object.assert_called_with(
            Bucket='test-bucket',
            Key='test-key.txt',
            Body=b'test content',
            ContentType='text/plain',
            Metadata={'custom': 'value'}
        )
    
    @patch('sources.s3.boto3')
    def test_write_data_no_key(self, mock_session_class):
        """Test writing data without object key."""
        config = self.create_config(path='s3://test-bucket/')
        source = S3Source(config)
        
        with pytest.raises(SourceDataError, match="Cannot write data to bucket without object key"):
            source.write_data('test')
    
    @patch('sources.s3.boto3')
    def test_write_data_permission_denied(self, mock_session_class):
        """Test writing data with permission denied."""
        mock_session = MagicMock()
        mock_client = MagicMock()
        mock_session.client.return_value = mock_client
        mock_session_class.return_value = mock_session
        
        error = Exception()
        error.response = {'Error': {'Code': '403'}}
        mock_client.put_object.side_effect = error
        
        config = self.create_config()
        source = S3Source(config)
        
        with pytest.raises(SourcePermissionError):
            source.write_data('test')
    
    @patch('sources.s3.boto3')
    def test_list_contents_success(self, mock_session_class):
        """Test listing S3 bucket contents."""
        mock_session = MagicMock()
        mock_client = MagicMock()
        mock_session.client.return_value = mock_client
        mock_session_class.return_value = mock_session
        
        # Mock paginator
        mock_paginator = MagicMock()
        mock_client.get_paginator.return_value = mock_paginator
        
        mock_page_iterator = [
            {
                'CommonPrefixes': [
                    {'Prefix': 'docs/'}
                ],
                'Contents': [
                    {
                        'Key': 'file1.txt',
                        'Size': 1024,
                        'LastModified': datetime.now(),
                        'ETag': '"abc123"',
                        'StorageClass': 'STANDARD'
                    }
                ]
            }
        ]
        mock_paginator.paginate.return_value = mock_page_iterator
        
        config = self.create_config(path='s3://test-bucket/')
        source = S3Source(config)
        
        contents = source.list_contents()
        
        assert len(contents) == 2
        
        # Check directory
        dir_item = next(item for item in contents if item['type'] == 'directory')
        assert dir_item['name'] == 'docs'
        assert dir_item['is_directory'] is True
        assert dir_item['path'] == 's3://test-bucket/docs/'
        
        # Check file
        file_item = next(item for item in contents if item['type'] == 'file')
        assert file_item['name'] == 'file1.txt'
        assert file_item['is_directory'] is False
        assert file_item['size'] == 1024
        assert file_item['path'] == 's3://test-bucket/file1.txt'
    
    @patch('sources.s3.boto3')
    def test_list_contents_not_found(self, mock_session_class):
        """Test listing contents with bucket not found."""
        mock_session = MagicMock()
        mock_client = MagicMock()
        mock_session.client.return_value = mock_client
        mock_session_class.return_value = mock_session
        
        error = Exception()
        error.response = {'Error': {'Code': '404'}}
        mock_client.get_paginator.side_effect = error
        
        config = self.create_config(path='s3://test-bucket/')
        source = S3Source(config)
        
        with pytest.raises(SourceNotFoundError):
            source.list_contents()
    
    @patch('sources.s3.boto3')
    def test_is_directory_bucket(self, mock_session_class):
        """Test is_directory() for bucket."""
        mock_session = MagicMock()
        mock_client = MagicMock()
        mock_session.client.return_value = mock_client
        mock_session_class.return_value = mock_session
        
        mock_client.head_bucket.return_value = {}
        
        config = self.create_config(path='s3://test-bucket/')
        source = S3Source(config)
        
        assert source.is_directory() is True
    
    @patch('sources.s3.boto3')
    def test_is_directory_prefix(self, mock_session_class):
        """Test is_directory() for prefix with trailing slash."""
        mock_session = MagicMock()
        mock_client = MagicMock()
        mock_session.client.return_value = mock_client
        mock_session_class.return_value = mock_session
        
        mock_client.head_bucket.return_value = {}
        
        config = self.create_config(path='s3://test-bucket/docs/')
        source = S3Source(config)
        
        assert source.is_directory() is True
    
    @patch('sources.s3.boto3')
    def test_is_directory_prefix_with_objects(self, mock_session_class):
        """Test is_directory() for prefix with objects."""
        mock_session = MagicMock()
        mock_client = MagicMock()
        mock_session.client.return_value = mock_client
        mock_session_class.return_value = mock_session
        
        mock_client.list_objects_v2.return_value = {'KeyCount': 1}
        
        config = self.create_config(path='s3://test-bucket/docs')
        source = S3Source(config)
        
        assert source.is_directory() is True
        mock_client.list_objects_v2.assert_called_with(
            Bucket='test-bucket',
            Prefix='docs/',
            MaxKeys=1
        )
    
    @patch('sources.s3.boto3')
    def test_is_directory_false(self, mock_session_class):
        """Test is_directory() returning false."""
        mock_session = MagicMock()
        mock_client = MagicMock()
        mock_session.client.return_value = mock_client
        mock_session_class.return_value = mock_session
        
        mock_client.list_objects_v2.return_value = {'KeyCount': 0}
        
        config = self.create_config(path='s3://test-bucket/file.txt')
        source = S3Source(config)
        
        assert source.is_directory() is False
    
    @patch('sources.s3.boto3')
    def test_is_file_true(self, mock_session_class):
        """Test is_file() returning true."""
        mock_session = MagicMock()
        mock_client = MagicMock()
        mock_session.client.return_value = mock_client
        mock_session_class.return_value = mock_session
        
        mock_client.head_object.return_value = {}
        
        config = self.create_config()
        source = S3Source(config)
        
        assert source.is_file() is True
        mock_client.head_object.assert_called_with(Bucket='test-bucket', Key='test-key.txt')
    
    @patch('sources.s3.boto3')
    def test_is_file_false_bucket(self, mock_session_class):
        """Test is_file() returning false for bucket."""
        config = self.create_config(path='s3://test-bucket/')
        source = S3Source(config)
        
        assert source.is_file() is False
    
    @patch('sources.s3.boto3')
    def test_is_file_false_prefix(self, mock_session_class):
        """Test is_file() returning false for prefix."""
        config = self.create_config(path='s3://test-bucket/docs/')
        source = S3Source(config)
        
        assert source.is_file() is False
    
    @patch('sources.s3.boto3')
    def test_is_file_false_not_exists(self, mock_session_class):
        """Test is_file() returning false when object doesn't exist."""
        mock_session = MagicMock()
        mock_client = MagicMock()
        mock_session.client.return_value = mock_client
        mock_session_class.return_value = mock_session
        
        mock_client.head_object.side_effect = Exception()
        
        config = self.create_config()
        source = S3Source(config)
        
        assert source.is_file() is False
    
    def test_capabilities(self):
        """Test source capabilities."""
        config = self.create_config()
        source = S3Source(config)
        
        assert source.is_writable() is True
        assert source.is_listable() is True
        assert source.is_readable() is True  # Inherited from base
    
    @patch('sources.s3.boto3')
    def test_context_manager_cleanup(self, mock_session_class):
        """Test cleanup in context manager."""
        mock_session = MagicMock()
        mock_client = MagicMock()
        mock_session.client.return_value = mock_client
        mock_session_class.return_value = mock_session
        
        config = self.create_config()
        
        with S3Source(config) as source:
            # Initialize client
            source._get_s3_client()
            assert source._s3_client == mock_client
            assert source._session == mock_session
        
        # After context exit, references should be None
        assert source._s3_client is None
        assert source._session is None
    
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