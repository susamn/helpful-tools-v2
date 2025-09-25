"""
Tests for enhanced HTTP source functionality.
"""

import pytest
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime
import json

from src.sources.base import SourceConfig, PaginationOptions
from src.sources.http import HttpSource
from src.sources.exceptions import (
    SourceConfigurationError, SourceNotFoundError, SourceConnectionError,
    SourcePermissionError
)


class TestHttpSourceEnhanced:
    """Tests for enhanced HTTP source functionality."""

    @pytest.fixture
    def basic_config(self):
        """Create a basic HTTP configuration."""
        return SourceConfig(
            source_id='test-http',
            name='Test HTTP',
            source_type='http',
            static_config={},
            path_template='https://api.example.com/data',
            dynamic_variables={},
            created_at=datetime.now(),
            updated_at=datetime.now()
        )

    @pytest.fixture
    def api_config(self):
        """Create HTTP configuration for API directory listing."""
        return SourceConfig(
            source_id='test-http-api',
            name='Test HTTP API',
            source_type='http',
            static_config={
                'directory_api': {
                    'endpoint': 'https://api.example.com/files',
                    'supports_pagination': True,
                    'supports_sorting': True,
                    'supports_filtering': True,
                    'items_path': 'files',
                    'name_field': 'filename',
                    'size_field': 'filesize',
                    'type_field': 'filetype',
                    'modified_field': 'modified_date',
                    'page_param': 'page',
                    'limit_param': 'per_page',
                    'sort_param': 'sort',
                    'order_param': 'order',
                    'filter_param': 'type',
                    'total_field': 'total_count'
                }
            },
            path_template='https://api.example.com/files',
            dynamic_variables={},
            created_at=datetime.now(),
            updated_at=datetime.now()
        )

    def test_enhanced_session_config_bearer_auth(self, basic_config):
        """Test session configuration with bearer authentication."""
        basic_config.static_config = {
            'auth_type': 'bearer',
            'token': 'test-token-123'
        }

        with patch('requests.Session') as mock_session_class:
            mock_session = Mock()
            mock_headers = {}
            mock_session.headers = mock_headers
            mock_session_class.return_value = mock_session

            http_source = HttpSource(basic_config)
            session = http_source._get_session()

            # Check that authorization header was set
            assert 'Authorization' in mock_headers
            assert mock_headers['Authorization'] == 'Bearer test-token-123'

    def test_enhanced_session_config_api_key(self, basic_config):
        """Test session configuration with API key authentication."""
        basic_config.static_config = {
            'auth_type': 'api_key',
            'api_key': 'test-api-key',
            'api_key_header': 'X-Custom-API-Key'
        }

        with patch('requests.Session') as mock_session_class:
            mock_session = Mock()
            mock_headers = {}
            mock_session.headers = mock_headers
            mock_session_class.return_value = mock_session

            http_source = HttpSource(basic_config)
            session = http_source._get_session()

            # Check that custom API key header was set
            assert 'X-Custom-API-Key' in mock_headers
            assert mock_headers['X-Custom-API-Key'] == 'test-api-key'

    def test_enhanced_session_config_ssl_options(self, basic_config):
        """Test session configuration with SSL options."""
        basic_config.static_config = {
            'verify_ssl': '/path/to/ca-cert.pem',
            'client_cert': {
                'cert': '/path/to/client.crt',
                'key': '/path/to/client.key'
            }
        }

        with patch('requests.Session') as mock_session_class:
            mock_session = Mock()
            mock_session.verify = None
            mock_session.cert = None
            mock_session.headers = {}
            mock_session_class.return_value = mock_session

            http_source = HttpSource(basic_config)
            session = http_source._get_session()

            # Check SSL configuration
            assert mock_session.verify == '/path/to/ca-cert.pem'
            assert mock_session.cert == ('/path/to/client.crt', '/path/to/client.key')

    def test_enhanced_session_config_retry_options(self, basic_config):
        """Test session configuration with custom retry options."""
        basic_config.static_config = {
            'retry': {
                'total': 5,
                'backoff_factor': 3,
                'status_forcelist': [500, 502, 503, 504, 429],
                'allowed_methods': ['HEAD', 'GET', 'POST']
            }
        }

        with patch('requests.Session') as mock_session_class, \
             patch('requests.adapters.HTTPAdapter') as mock_adapter_class, \
             patch('urllib3.util.retry.Retry') as mock_retry_class:

            mock_session = Mock()
            mock_session.headers = {}
            mock_session_class.return_value = mock_session
            mock_adapter = Mock()
            mock_adapter_class.return_value = mock_adapter
            mock_retry = Mock()
            mock_retry_class.return_value = mock_retry

            http_source = HttpSource(basic_config)
            session = http_source._get_session()

            # Check that retry was configured with custom options
            mock_retry_class.assert_called_once()
            call_kwargs = mock_retry_class.call_args[1]
            assert call_kwargs['total'] == 5
            assert call_kwargs['backoff_factor'] == 3
            assert call_kwargs['status_forcelist'] == [500, 502, 503, 504, 429]
            assert call_kwargs['allowed_methods'] == ['HEAD', 'GET', 'POST']

    def test_auth_config_validation_bearer_missing_token(self, basic_config):
        """Test authentication config validation for bearer auth without token."""
        basic_config.static_config = {
            'auth_type': 'bearer'
            # Missing token
        }

        http_source = HttpSource(basic_config)

        with pytest.raises(SourceConfigurationError, match="Token is required for bearer authentication"):
            http_source._get_session()

    def test_auth_config_validation_api_key_missing_key(self, basic_config):
        """Test authentication config validation for API key auth without key."""
        basic_config.static_config = {
            'auth_type': 'api_key'
            # Missing api_key
        }

        http_source = HttpSource(basic_config)

        with pytest.raises(SourceConfigurationError, match="API key is required for api_key authentication"):
            http_source._get_session()

    def test_enhanced_error_handling_ssl_error(self, basic_config):
        """Test enhanced error handling for SSL errors."""
        http_source = HttpSource(basic_config)

        with patch.object(http_source, '_get_session') as mock_get_session:
            mock_session = Mock()
            mock_get_session.return_value = mock_session

            # Create a proper SSL error class
            class SSLError(Exception):
                pass

            ssl_error = SSLError("SSL: CERTIFICATE_VERIFY_FAILED")
            mock_session.head.side_effect = ssl_error

            result = http_source.test_connection()

            assert not result.success
            assert result.status == 'error'
            assert 'SSL/TLS error' in result.message
            assert result.error == 'SSL certificate verification failed'

    def test_enhanced_error_handling_connection_error(self, basic_config):
        """Test enhanced error handling for connection errors."""
        http_source = HttpSource(basic_config)

        with patch.object(http_source, '_get_session') as mock_get_session:
            mock_session = Mock()
            mock_get_session.return_value = mock_session

            # Create a proper connection error class
            class ConnectionError(Exception):
                pass

            conn_error = ConnectionError("Connection failed")
            mock_session.head.side_effect = conn_error

            result = http_source.test_connection()

            assert not result.success
            assert result.status == 'error'
            assert 'HTTP connection error' in result.message
            assert result.error == 'Network connection failed'

    def test_enhanced_error_handling_too_many_redirects(self, basic_config):
        """Test enhanced error handling for redirect loops."""
        http_source = HttpSource(basic_config)

        with patch.object(http_source, '_get_session') as mock_get_session:
            mock_session = Mock()
            mock_get_session.return_value = mock_session

            # Create a proper redirect error class
            class TooManyRedirects(Exception):
                pass

            redirect_error = TooManyRedirects("Too many redirects")
            mock_session.head.side_effect = redirect_error

            result = http_source.test_connection()

            assert not result.success
            assert result.status == 'error'
            assert 'Too many redirects' in result.message
            assert result.error == 'Redirect loop detected'

    @patch('requests.Session')
    def test_list_api_directory_basic(self, mock_session_class, api_config):
        """Test API directory listing."""
        mock_session = Mock()
        mock_session.headers = {}
        mock_session_class.return_value = mock_session

        # Mock API response
        api_response_data = {
            'files': [
                {
                    'filename': 'document1.pdf',
                    'filesize': 1024000,
                    'filetype': 'file',
                    'modified_date': '2024-01-01T12:00:00Z'
                },
                {
                    'filename': 'images',
                    'filesize': None,
                    'filetype': 'directory',
                    'modified_date': '2024-01-01T10:00:00Z'
                }
            ]
        }

        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = api_response_data
        mock_session.get.return_value = mock_response

        http_source = HttpSource(api_config)
        contents = http_source.list_contents()

        assert len(contents) == 2

        # Check document
        doc = next(item for item in contents if item['name'] == 'document1.pdf')
        assert doc['type'] == 'file'
        assert doc['is_directory'] is False
        assert doc['size'] == 1024000

        # Check directory
        folder = next(item for item in contents if item['name'] == 'images')
        assert folder['type'] == 'directory'
        assert folder['is_directory'] is True
        assert folder['has_children'] is True
        assert folder['explorable'] is True

    @patch('requests.Session')
    def test_list_api_directory_paginated(self, mock_session_class, api_config):
        """Test paginated API directory listing."""
        mock_session = Mock()
        mock_session.headers = {}
        mock_session_class.return_value = mock_session

        # Mock paginated API response
        api_response_data = {
            'files': [
                {
                    'filename': 'file1.txt',
                    'filesize': 100,
                    'filetype': 'file',
                    'modified_date': '2024-01-01T12:00:00Z'
                }
            ],
            'total_count': 50
        }

        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = api_response_data
        mock_session.get.return_value = mock_response

        http_source = HttpSource(api_config)
        pagination = PaginationOptions(page=2, limit=10, sort_by='name', sort_order='asc')

        result = http_source.list_contents_paginated(pagination=pagination)

        assert len(result.items) == 1
        assert result.total_count == 50
        assert result.page == 2
        assert result.limit == 10

        # Verify API was called with correct parameters
        call_args = mock_session.get.call_args
        params = call_args[1]['params']
        assert params['page'] == 2
        assert params['per_page'] == 10
        assert params['sort'] == 'name'
        assert params['order'] == 'asc'

    @patch('requests.Session')
    def test_list_api_directory_with_path(self, mock_session_class, api_config):
        """Test API directory listing with path parameter."""
        mock_session = Mock()
        mock_session.headers = {}
        mock_session_class.return_value = mock_session

        api_config.static_config['directory_api']['path_param'] = 'path'

        # Mock API response
        api_response_data = {
            'files': [
                {
                    'filename': 'nested_file.txt',
                    'filesize': 200,
                    'filetype': 'file',
                    'modified_date': '2024-01-01T12:00:00Z'
                }
            ]
        }

        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = api_response_data
        mock_session.get.return_value = mock_response

        http_source = HttpSource(api_config)
        contents = http_source.list_contents(path='subdirectory/nested')

        # Verify API was called with path parameter
        call_args = mock_session.get.call_args
        params = call_args[1]['params']
        assert params['path'] == 'subdirectory/nested'

    @patch('requests.Session')
    def test_list_api_directory_error_response(self, mock_session_class, api_config):
        """Test API directory listing with error response."""
        mock_session = Mock()
        mock_session.headers = {}
        mock_session_class.return_value = mock_session

        # Mock error response
        mock_response = Mock()
        mock_response.status_code = 500
        mock_session.get.return_value = mock_response

        http_source = HttpSource(api_config)

        with pytest.raises(SourceConnectionError, match="API returned status 500"):
            http_source.list_contents()

    def test_regular_http_list_contents(self, basic_config):
        """Test regular HTTP source list contents (non-API)."""
        http_source = HttpSource(basic_config)

        with patch.object(http_source, 'get_metadata') as mock_get_metadata:
            mock_metadata = Mock()
            mock_metadata.size = 1024
            mock_metadata.last_modified = datetime(2024, 1, 1, 12, 0, 0)
            mock_metadata.content_type = 'text/plain'
            mock_get_metadata.return_value = mock_metadata

            contents = http_source.list_contents()

            assert len(contents) == 1
            item = contents[0]
            assert item['name'] == 'data'  # From path 'https://api.example.com/data'
            assert item['type'] == 'file'
            assert item['is_directory'] is False
            assert item['size'] == 1024
            assert item['content_type'] == 'text/plain'

    def test_capabilities(self, basic_config):
        """Test HTTP source capabilities."""
        http_source = HttpSource(basic_config)

        assert http_source.is_readable()
        assert not http_source.is_writable()  # Default is False
        assert not http_source.is_listable()  # Limited support

    def test_writable_when_configured(self, basic_config):
        """Test HTTP source is writable when configured."""
        basic_config.static_config['writable'] = True
        http_source = HttpSource(basic_config)

        assert http_source.is_writable()

    def test_nested_json_path_extraction(self, api_config):
        """Test extracting items from nested JSON paths."""
        api_config.static_config['directory_api']['items_path'] = 'data.files'

        mock_response_data = {
            'data': {
                'files': [
                    {
                        'filename': 'nested_file.txt',
                        'filesize': 300,
                        'filetype': 'file',
                        'modified_date': '2024-01-01T12:00:00Z'
                    }
                ]
            }
        }

        with patch('requests.Session') as mock_session_class:
            mock_session = Mock()
            mock_session.headers = {}
            mock_session_class.return_value = mock_session

            mock_response = Mock()
            mock_response.status_code = 200
            mock_response.json.return_value = mock_response_data
            mock_session.get.return_value = mock_response

            http_source = HttpSource(api_config)
            contents = http_source.list_contents()

            assert len(contents) == 1
            assert contents[0]['name'] == 'nested_file.txt'

    def test_timestamp_formatting_consistency(self, api_config):
        """Test that HTTP source uses consistent timestamp formatting."""
        mock_response_data = {
            'files': [
                {
                    'filename': 'test_file.txt',
                    'filesize': 100,
                    'filetype': 'file',
                    'modified_date': '2024-01-01T12:00:00Z'
                }
            ]
        }

        with patch('requests.Session') as mock_session_class:
            mock_session = Mock()
            mock_session.headers = {}
            mock_session_class.return_value = mock_session

            mock_response = Mock()
            mock_response.status_code = 200
            mock_response.json.return_value = mock_response_data
            mock_session.get.return_value = mock_response

            http_source = HttpSource(api_config)
            contents = http_source.list_contents()

            assert len(contents) == 1
            item = contents[0]

            # Check that both timestamp fields are present (from format_last_modified)
            assert 'modified' in item
            assert 'last_modified' in item
            assert isinstance(item['modified'], float)  # Unix timestamp
            assert isinstance(item['last_modified'], str)  # ISO format