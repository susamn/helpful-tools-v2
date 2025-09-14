"""
Complete tests for S3Source implementation with proper mocking.
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


class TestS3SourceComplete:
    """Complete test suite for S3Source functionality with proper mocking."""

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

    @patch('sources.s3.S3Source._get_s3_client')
    def test_test_connection_success_object(self, mock_get_client):
        """Test successful connection test for S3 object."""
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client

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

    @patch('sources.s3.S3Source._get_s3_client')
    def test_test_connection_success_bucket(self, mock_get_client):
        """Test successful connection test for S3 bucket only."""
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client

        # Mock successful bucket check
        mock_client.head_bucket.return_value = {}

        config = self.create_config(path='s3://test-bucket/')
        source = S3Source(config)

        result = source.test_connection()

        assert result.success is True
        assert result.status == 'connected'
        assert 'Successfully accessed S3 bucket' in result.message

    @patch('sources.s3.S3Source._get_s3_client')
    def test_test_connection_bucket_not_found(self, mock_get_client):
        """Test connection test when bucket is not found."""
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client

        # Mock bucket not found error
        error_response = {'Error': {'Code': '404'}}
        mock_exception = Exception()
        mock_exception.response = error_response
        mock_client.head_bucket.side_effect = mock_exception

        config = self.create_config()
        source = S3Source(config)

        result = source.test_connection()

        assert result.success is False
        assert result.status == 'error'
        assert 'Bucket not found' in result.message

    @patch('sources.s3.S3Source._get_s3_client')
    def test_get_metadata_success(self, mock_get_client):
        """Test successful metadata retrieval."""
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client

        mock_client.head_object.return_value = {
            'ContentLength': 2048,
            'ContentType': 'application/json',
            'LastModified': datetime.now(),
            'ETag': '"def456"',
            'StorageClass': 'STANDARD'
        }

        config = self.create_config()
        source = S3Source(config)

        metadata = source.get_metadata()

        assert isinstance(metadata, SourceMetadata)
        assert metadata.size == 2048
        assert metadata.content_type == 'application/json'
        assert metadata.checksum == 'def456'

    @patch('sources.s3.S3Source._get_s3_client')
    def test_get_metadata_not_found(self, mock_get_client):
        """Test metadata retrieval for non-existent object."""
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client

        error_response = {'Error': {'Code': '404'}}
        mock_exception = Exception()
        mock_exception.response = error_response
        mock_client.head_object.side_effect = mock_exception

        config = self.create_config()
        source = S3Source(config)

        with pytest.raises(SourceNotFoundError):
            source.get_metadata()

    @patch('sources.s3.S3Source._get_s3_client')
    def test_exists_object_true(self, mock_get_client):
        """Test exists() returns True for existing object."""
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client

        mock_client.head_object.return_value = {'ContentLength': 100}

        config = self.create_config()
        source = S3Source(config)

        assert source.exists() is True

    @patch('sources.s3.S3Source._get_s3_client')
    def test_exists_object_false(self, mock_get_client):
        """Test exists() returns False for non-existent object."""
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client

        error_response = {'Error': {'Code': '404'}}
        mock_exception = Exception()
        mock_exception.response = error_response
        mock_client.head_object.side_effect = mock_exception

        config = self.create_config()
        source = S3Source(config)

        assert source.exists() is False

    @patch('sources.s3.S3Source._get_s3_client')
    def test_read_data_success(self, mock_get_client):
        """Test successful data reading (binary mode by default)."""
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client

        mock_body = MagicMock()
        mock_body.read.return_value = b'Test file content'
        mock_client.get_object.return_value = {'Body': mock_body}

        config = self.create_config()
        source = S3Source(config)

        data = source.read_data()

        assert data == b'Test file content'  # Returns bytes by default
        mock_client.get_object.assert_called_with(Bucket='test-bucket', Key='test-key.txt')

    @patch('sources.s3.S3Source._get_s3_client')
    def test_read_data_text_mode(self, mock_get_client):
        """Test data reading in text mode."""
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client

        mock_body = MagicMock()
        mock_body.read.return_value = b'Test file content'
        mock_client.get_object.return_value = {'Body': mock_body}

        config = self.create_config()
        source = S3Source(config)

        data = source.read_data(mode='text')

        assert data == 'Test file content'  # Returns string in text mode
        mock_client.get_object.assert_called_with(Bucket='test-bucket', Key='test-key.txt')

    @patch('sources.s3.S3Source._get_s3_client')
    def test_read_data_binary_mode(self, mock_get_client):
        """Test data reading in binary mode."""
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client

        mock_body = MagicMock()
        mock_body.read.return_value = b'\x00\x01\x02\x03'
        mock_client.get_object.return_value = {'Body': mock_body}

        config = self.create_config()
        source = S3Source(config)

        data = source.read_data(mode='binary')

        assert data == b'\x00\x01\x02\x03'

    @patch('sources.s3.S3Source._get_s3_client')
    def test_write_data_success(self, mock_get_client):
        """Test successful data writing."""
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client

        config = self.create_config()
        source = S3Source(config)

        result = source.write_data('Test content')

        assert result is True
        mock_client.put_object.assert_called_once()
        call_args = mock_client.put_object.call_args
        assert call_args[1]['Bucket'] == 'test-bucket'
        assert call_args[1]['Key'] == 'test-key.txt'
        assert call_args[1]['Body'] == b'Test content'  # String gets encoded to bytes

    @patch('sources.s3.S3Source._get_s3_client')
    def test_list_contents_success(self, mock_get_client):
        """Test successful directory listing."""
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client

        # Mock paginator
        mock_paginator = MagicMock()
        mock_client.get_paginator.return_value = mock_paginator

        mock_page_iterator = [
            {
                'CommonPrefixes': [{'Prefix': 'folder1/'}, {'Prefix': 'folder2/'}],
                'Contents': [
                    {
                        'Key': 'file1.txt',
                        'Size': 1024,
                        'LastModified': datetime.now(),
                        'ETag': '"abc123"',
                        'StorageClass': 'STANDARD'
                    },
                    {
                        'Key': 'file2.txt',
                        'Size': 2048,
                        'LastModified': datetime.now(),
                        'ETag': '"def456"',
                        'StorageClass': 'STANDARD'
                    }
                ]
            }
        ]
        mock_paginator.paginate.return_value = mock_page_iterator

        config = self.create_config(path='s3://test-bucket/')
        source = S3Source(config)

        contents = source.list_contents()

        assert len(contents) == 4  # 2 folders + 2 files

        # Check folders
        folders = [item for item in contents if item['is_directory']]
        assert len(folders) == 2
        assert folders[0]['name'] == 'folder1'
        assert folders[1]['name'] == 'folder2'

        # Check files
        files = [item for item in contents if not item['is_directory']]
        assert len(files) == 2
        assert files[0]['name'] == 'file1.txt'
        assert files[0]['size'] == 1024
        assert files[1]['name'] == 'file2.txt'
        assert files[1]['size'] == 2048

    @patch('sources.s3.S3Source._get_s3_client')
    def test_is_directory_bucket(self, mock_get_client):
        """Test is_directory() for bucket path."""
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client

        # Mock bucket exists
        mock_client.head_bucket.return_value = {}

        config = self.create_config(path='s3://test-bucket/')
        source = S3Source(config)

        assert source.is_directory() is True

    @patch('sources.s3.S3Source._get_s3_client')
    def test_is_directory_prefix(self, mock_get_client):
        """Test is_directory() for prefix path."""
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client

        # Mock list_objects_v2 returns objects with the prefix
        mock_client.list_objects_v2.return_value = {
            'Contents': [{'Key': 'folder/file.txt'}],
            'IsTruncated': False
        }

        config = self.create_config(path='s3://test-bucket/folder/')
        source = S3Source(config)

        assert source.is_directory() is True

    @patch('sources.s3.S3Source._get_s3_client')
    def test_is_file_true(self, mock_get_client):
        """Test is_file() returns True for existing file."""
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client

        # Mock head_object succeeds
        mock_client.head_object.return_value = {'ContentLength': 100}

        config = self.create_config()
        source = S3Source(config)

        assert source.is_file() is True

    def test_get_s3_client_import_error(self):
        """Test S3 client creation with missing boto3."""
        config = self.create_config()
        source = S3Source(config)

        # Mock import to raise ImportError
        with patch('builtins.__import__') as mock_import:
            def side_effect(name, *args, **kwargs):
                if name == 'boto3':
                    raise ImportError("No module named 'boto3'")
                return __import__(name, *args, **kwargs)

            mock_import.side_effect = side_effect

            with pytest.raises(SourceConnectionError, match="boto3 library is required"):
                source._get_s3_client()

    @patch('sources.s3.S3Source._get_s3_client')
    def test_read_stream_success(self, mock_get_client):
        """Test successful stream reading."""
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client

        # Mock the body to return chunks when read() is called
        mock_body = MagicMock()
        # Simulate reading chunks: first returns chunk, then empty (EOF)
        mock_body.read.side_effect = [b'chunk1chunk2chunk3', b'']
        mock_client.get_object.return_value = {'Body': mock_body}

        config = self.create_config()
        source = S3Source(config)

        chunks = list(source.read_stream(chunk_size=16))  # Large chunk size to get all at once

        assert chunks == [b'chunk1chunk2chunk3']
        mock_client.get_object.assert_called_with(Bucket='test-bucket', Key='test-key.txt')

    def test_capabilities(self):
        """Test source capabilities."""
        config = self.create_config()
        source = S3Source(config)

        assert source.is_writable() is True
        assert source.is_listable() is True
        assert source.is_readable() is True

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