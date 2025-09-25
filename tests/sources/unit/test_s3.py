"""
Tests for S3 source implementation.
"""

import pytest
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime
from pathlib import Path

from src.sources.base import SourceConfig
from src.sources.s3 import S3Source
from src.sources.exceptions import (
    SourceConfigurationError, SourceNotFoundError, SourceConnectionError,
    SourcePermissionError, SourceAuthenticationError
)


class TestS3SourceSimple:
    """Simple tests for S3Source that don't require mocking."""

    def test_initialization(self):
        """Test S3 source initialization."""
        config = SourceConfig(
            source_id='test-s3',
            name='Test S3',
            source_type='s3',
            static_config={'region': 'us-east-1'},
            path_template='s3://test-bucket/test.txt',
            dynamic_variables={},
            created_at=datetime.now(),
            updated_at=datetime.now()
        )

        source = S3Source(config)
        assert source.config == config
        assert source._bucket == 'test-bucket'
        assert source._key == 'test.txt'

    def test_invalid_s3_path(self):
        """Test invalid S3 path handling."""
        config = SourceConfig(
            source_id='test-s3',
            name='Test S3',
            source_type='s3',
            static_config={},
            path_template='invalid://path',
            dynamic_variables={},
            created_at=datetime.now(),
            updated_at=datetime.now()
        )

        with pytest.raises(SourceConfigurationError, match="S3 path must start with 's3://'"):
            S3Source(config)

    def test_empty_bucket_name(self):
        """Test empty bucket name handling."""
        config = SourceConfig(
            source_id='test-s3',
            name='Test S3',
            source_type='s3',
            static_config={},
            path_template='s3://',
            dynamic_variables={},
            created_at=datetime.now(),
            updated_at=datetime.now()
        )

        with pytest.raises(SourceConfigurationError, match="S3 bucket name is required"):
            S3Source(config)

    def test_parse_expiry_time(self):
        """Test expiry time parsing."""
        config = SourceConfig(
            source_id='test-s3',
            name='Test S3',
            source_type='s3',
            static_config={},
            path_template='s3://test-bucket/test.txt',
            dynamic_variables={},
            created_at=datetime.now(),
            updated_at=datetime.now()
        )

        source = S3Source(config)

        # Test ISO format
        iso_time = "2024-01-01T12:00:00Z"
        parsed = source._parse_expiry_time(iso_time)
        assert parsed is not None
        assert parsed.year == 2024

        # Test timestamp
        timestamp = "1704110400"  # 2024-01-01 12:00:00 UTC
        parsed = source._parse_expiry_time(timestamp)
        assert parsed is not None

        # Test invalid format
        invalid = "invalid-date"
        parsed = source._parse_expiry_time(invalid)
        assert parsed is None


@pytest.mark.skipif(not pytest.importorskip("boto3", reason="boto3 not available"), reason="boto3 not available")
class TestS3Source:
    """Comprehensive tests for S3Source with mocking."""

    @pytest.fixture
    def s3_config(self):
        """Create a test S3 configuration."""
        return SourceConfig(
            source_id='test-s3',
            name='Test S3',
            source_type='s3',
            static_config={
                'region': 'us-east-1',
                'aws_profile': 'test'
            },
            path_template='s3://test-bucket/test-key',
            dynamic_variables={},
            created_at=datetime.now(),
            updated_at=datetime.now()
        )

    @pytest.fixture
    def s3_source(self, s3_config):
        """Create a test S3 source."""
        return S3Source(s3_config)

    def test_get_s3_client_basic(self, s3_source):
        """Test basic S3 client creation."""
        with patch('boto3.Session') as mock_session_class:
            mock_session = Mock()
            mock_session_class.return_value = mock_session
            mock_client = Mock()
            mock_session.client.return_value = mock_client

            client = s3_source._get_s3_client()
            assert client == mock_client
            mock_session_class.assert_called_once_with(profile_name='test')
            mock_session.client.assert_called_once()

    def test_get_s3_client_with_endpoint(self, s3_config):
        """Test S3 client creation with custom endpoint."""
        s3_config.static_config['endpoint_url'] = 'https://minio.example.com'
        s3_source = S3Source(s3_config)

        with patch('boto3.Session') as mock_session_class:
            mock_session = Mock()
            mock_session_class.return_value = mock_session
            mock_client = Mock()
            mock_session.client.return_value = mock_client

            client = s3_source._get_s3_client()
            mock_session.client.assert_called_once()
            call_args = mock_session.client.call_args
            assert call_args[1]['endpoint_url'] == 'https://minio.example.com'

    def test_get_s3_client_no_credentials(self, s3_source):
        """Test S3 client creation without credentials."""
        with patch('boto3.Session') as mock_session_class:
            from botocore.exceptions import NoCredentialsError
            mock_session_class.side_effect = NoCredentialsError()

            with pytest.raises(SourceAuthenticationError, match="AWS credentials not found"):
                s3_source._get_s3_client()

    def test_test_connection_success(self, s3_source):
        """Test successful connection test."""
        mock_client = Mock()
        mock_client.head_bucket.return_value = {}
        mock_client.head_object.return_value = {
            'ContentLength': 1024,
            'LastModified': datetime.now(),
            'ContentType': 'text/plain',
            'ETag': '"abc123"'
        }

        with patch.object(s3_source, '_get_s3_client', return_value=mock_client):
            result = s3_source.test_connection()
            assert result.success
            assert result.status == 'connected'
            assert result.metadata is not None

    def test_test_connection_bucket_not_found(self, s3_source):
        """Test connection test with bucket not found."""
        mock_client = Mock()
        from botocore.exceptions import ClientError
        error_response = {'Error': {'Code': '404'}}
        mock_client.head_bucket.side_effect = ClientError(error_response, 'HeadBucket')

        with patch.object(s3_source, '_get_s3_client', return_value=mock_client):
            result = s3_source.test_connection()
            assert not result.success
            assert result.status == 'error'
            assert 'not found' in result.message

    def test_test_connection_access_denied(self, s3_source):
        """Test connection test with access denied."""
        mock_client = Mock()
        from botocore.exceptions import ClientError
        error_response = {'Error': {'Code': '403'}}
        mock_client.head_bucket.side_effect = ClientError(error_response, 'HeadBucket')

        with patch.object(s3_source, '_get_s3_client', return_value=mock_client):
            result = s3_source.test_connection()
            assert not result.success
            assert result.status == 'unauthorized'
            assert 'Access denied' in result.message

    def test_exists_true(self, s3_source):
        """Test exists method returns True."""
        mock_client = Mock()
        mock_client.head_object.return_value = {}

        with patch.object(s3_source, '_get_s3_client', return_value=mock_client):
            assert s3_source.exists()

    def test_exists_false(self, s3_source):
        """Test exists method returns False."""
        mock_client = Mock()
        from botocore.exceptions import ClientError
        error_response = {'Error': {'Code': '404'}}
        mock_client.head_object.side_effect = ClientError(error_response, 'HeadObject')

        with patch.object(s3_source, '_get_s3_client', return_value=mock_client):
            assert not s3_source.exists()

    def test_read_data_binary(self, s3_source):
        """Test reading data in binary mode."""
        mock_client = Mock()
        mock_response = {
            'Body': Mock()
        }
        mock_response['Body'].read.return_value = b'test content'
        mock_client.get_object.return_value = mock_response

        with patch.object(s3_source, '_get_s3_client', return_value=mock_client):
            data = s3_source.read_data(mode='binary')
            assert data == b'test content'

    def test_read_data_text(self, s3_source):
        """Test reading data in text mode."""
        mock_client = Mock()
        mock_response = {
            'Body': Mock()
        }
        mock_response['Body'].read.return_value = b'test content'
        mock_client.get_object.return_value = mock_response

        with patch.object(s3_source, '_get_s3_client', return_value=mock_client):
            data = s3_source.read_data(mode='text', encoding='utf-8')
            assert data == 'test content'

    def test_read_data_with_limit(self, s3_source):
        """Test reading data with byte limit."""
        mock_client = Mock()
        mock_response = {
            'Body': Mock()
        }
        mock_response['Body'].read.return_value = b'test'
        mock_client.get_object.return_value = mock_response

        with patch.object(s3_source, '_get_s3_client', return_value=mock_client):
            data = s3_source.read_data(limit=4)

            # Check that Range header was used
            call_args = mock_client.get_object.call_args
            assert call_args[1]['Range'] == 'bytes=0-3'

    def test_read_data_not_found(self, s3_source):
        """Test reading data when object not found."""
        mock_client = Mock()
        from botocore.exceptions import ClientError
        error_response = {'Error': {'Code': '404'}}
        mock_client.get_object.side_effect = ClientError(error_response, 'GetObject')

        with patch.object(s3_source, '_get_s3_client', return_value=mock_client):
            with pytest.raises(SourceNotFoundError):
                s3_source.read_data()

    def test_write_data_success(self, s3_source):
        """Test successful data writing."""
        mock_client = Mock()
        mock_client.put_object.return_value = {}

        with patch.object(s3_source, '_get_s3_client', return_value=mock_client):
            result = s3_source.write_data(b'test content')
            assert result is True
            mock_client.put_object.assert_called_once()

    def test_write_data_string(self, s3_source):
        """Test writing string data."""
        mock_client = Mock()
        mock_client.put_object.return_value = {}

        with patch.object(s3_source, '_get_s3_client', return_value=mock_client):
            result = s3_source.write_data('test content', encoding='utf-8')
            assert result is True

            # Verify the data was encoded
            call_args = mock_client.put_object.call_args
            assert call_args[1]['Body'] == b'test content'

    def test_list_contents_basic(self, s3_config):
        """Test basic directory listing."""
        s3_config.path_template = 's3://test-bucket/'  # Directory
        s3_source = S3Source(s3_config)

        mock_client = Mock()
        mock_paginator = Mock()
        mock_client.get_paginator.return_value = mock_paginator

        mock_page_iterator = [
            {
                'CommonPrefixes': [
                    {'Prefix': 'folder1/'}
                ],
                'Contents': [
                    {
                        'Key': 'file1.txt',
                        'Size': 1024,
                        'LastModified': datetime(2024, 1, 1),
                        'ETag': '"abc123"',
                        'StorageClass': 'STANDARD'
                    }
                ]
            }
        ]
        mock_paginator.paginate.return_value = mock_page_iterator

        with patch.object(s3_source, '_get_s3_client', return_value=mock_client):
            contents = s3_source.list_contents()

            assert len(contents) == 2

            # Check directory
            folder = next(item for item in contents if item['name'] == 'folder1')
            assert folder['type'] == 'directory'
            assert folder['is_directory'] is True

            # Check file
            file = next(item for item in contents if item['name'] == 'file1.txt')
            assert file['type'] == 'file'
            assert file['is_directory'] is False
            assert file['size'] == 1024

    def test_is_directory_bucket_only(self, s3_config):
        """Test directory detection for bucket-only path."""
        s3_config.path_template = 's3://test-bucket/'
        s3_source = S3Source(s3_config)

        mock_client = Mock()
        mock_client.head_bucket.return_value = {}

        with patch.object(s3_source, '_get_s3_client', return_value=mock_client):
            assert s3_source.is_directory()

    def test_is_directory_prefix(self, s3_config):
        """Test directory detection for prefix path."""
        s3_config.path_template = 's3://test-bucket/folder/'
        s3_source = S3Source(s3_config)

        mock_client = Mock()
        mock_client.list_objects_v2.return_value = {'KeyCount': 1}

        with patch.object(s3_source, '_get_s3_client', return_value=mock_client):
            assert s3_source.is_directory()

    def test_is_file_object(self, s3_source):
        """Test file detection for object path."""
        mock_client = Mock()
        mock_client.head_object.return_value = {}

        with patch.object(s3_source, '_get_s3_client', return_value=mock_client):
            assert s3_source.is_file()

    def test_capabilities(self, s3_source):
        """Test S3 source capabilities."""
        assert s3_source.is_readable()
        assert s3_source.is_writable()
        assert s3_source.is_listable()
        assert s3_source.supports_expiry()

    def test_config_validation_valid_bucket(self):
        """Test config validation with valid bucket."""
        config = SourceConfig(
            source_id='test-s3',
            name='Test S3',
            source_type='s3',
            static_config={'region': 'us-east-1'},
            path_template='s3://valid-bucket-name/key',
            dynamic_variables={},
            created_at=datetime.now(),
            updated_at=datetime.now()
        )

        # Should not raise
        s3_source = S3Source(config)
        s3_source._validate_config()

    def test_config_validation_invalid_bucket_too_short(self):
        """Test config validation with too short bucket name."""
        config = SourceConfig(
            source_id='test-s3',
            name='Test S3',
            source_type='s3',
            static_config={},
            path_template='s3://ab/key',  # Too short
            dynamic_variables={},
            created_at=datetime.now(),
            updated_at=datetime.now()
        )

        with pytest.raises(SourceConfigurationError, match="must be between 3 and 63 characters"):
            S3Source(config)

    def test_config_validation_invalid_bucket_chars(self):
        """Test config validation with invalid bucket characters."""
        config = SourceConfig(
            source_id='test-s3',
            name='Test S3',
            source_type='s3',
            static_config={},
            path_template='s3://invalid_bucket$/key',  # Invalid characters
            dynamic_variables={},
            created_at=datetime.now(),
            updated_at=datetime.now()
        )

        with pytest.raises(SourceConfigurationError, match="contains invalid characters"):
            S3Source(config)

    def test_expiry_time_from_credentials_file(self, s3_source, tmp_path):
        """Test getting expiry time from AWS credentials file."""
        # Create fake credentials file
        aws_dir = tmp_path / '.aws'
        aws_dir.mkdir()

        credentials_file = aws_dir / 'credentials'
        credentials_file.write_text("""
[test]
aws_access_key_id = fake_key
aws_secret_access_key = fake_secret
aws_session_token = fake_token
aws_session_token_expiry = 2024-01-01T12:00:00Z
""")

        with patch.object(Path, 'home', return_value=tmp_path):
            expiry = s3_source.get_expiry_time()
            assert expiry is not None
            assert expiry.year == 2024
            assert expiry.month == 1
            assert expiry.day == 1

    def test_cleanup_connections(self, s3_source):
        """Test connection cleanup."""
        mock_client = Mock()
        mock_session = Mock()

        s3_source._s3_client = mock_client
        s3_source._session = mock_session

        s3_source.__exit__(None, None, None)

        # Connections should be cleared
        assert s3_source._s3_client is None
        assert s3_source._session is None