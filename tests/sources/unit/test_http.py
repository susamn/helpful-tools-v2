"""
Tests for HttpSource implementation.
"""

import pytest
import sys
import os
from datetime import datetime
from unittest.mock import patch, MagicMock
from email.utils import formatdate

# Add src directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', '..', 'src'))

from sources.http import HttpSource
from sources.base import SourceConfig, SourceMetadata, TestResult
from sources.exceptions import (
    SourceNotFoundError, SourceConnectionError, SourcePermissionError, SourceDataError
)


class TestHttpSource:
    """Test HttpSource functionality."""
    
    def create_config(self, url='http://example.com/api/data', **kwargs):
        """Helper to create SourceConfig."""
        return SourceConfig(
            source_id='test-123',
            name='Test HTTP Source',
            source_type='http',
            static_config=kwargs.get('static_config', {}),
            path_template=url,
            dynamic_variables=kwargs.get('dynamic_variables', {}),
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
    
    def test_initialization(self):
        """Test HttpSource initialization."""
        config = self.create_config()
        source = HttpSource(config)
        
        assert source.config == config
        assert source._resolved_path == 'http://example.com/api/data'
        assert source._parsed_url.scheme == 'http'
        assert source._parsed_url.hostname == 'example.com'
        assert source._session is None
    
    @patch('requests.Session')
    def test_get_session_basic(self, mock_session_class):
        """Test getting session with basic configuration."""
        mock_session = MagicMock()
        mock_session_class.return_value = mock_session
        
        config = self.create_config()
        source = HttpSource(config)
        
        session = source._get_session()
        
        assert session == mock_session
        assert source._session == mock_session
        mock_session_class.assert_called_once()
    
    @patch('requests.Session')
    def test_get_session_with_auth(self, mock_session_class):
        """Test getting session with authentication."""
        mock_session = MagicMock()
        mock_session_class.return_value = mock_session
        
        config = self.create_config(
            static_config={
                'auth_type': 'basic',
                'username': 'user',
                'password': 'pass'
            }
        )
        source = HttpSource(config)
        
        session = source._get_session()
        
        assert session == mock_session
        # Auth should be set (we can't easily test the exact auth object)
        assert hasattr(mock_session, 'auth')
    
    @patch('requests.Session')
    def test_get_session_with_headers(self, mock_session_class):
        """Test getting session with custom headers."""
        mock_session = MagicMock()
        mock_session_class.return_value = mock_session
        
        config = self.create_config(
            static_config={
                'headers': {'Authorization': 'Bearer token123'}
            }
        )
        source = HttpSource(config)
        
        session = source._get_session()
        
        mock_session.headers.update.assert_called_with({'Authorization': 'Bearer token123'})
    
    @patch('requests.Session')
    def test_test_connection_success(self, mock_session_class):
        """Test successful connection test."""
        mock_session = MagicMock()
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.headers = {
            'content-length': '1024',
            'content-type': 'application/json',
            'last-modified': formatdate(),
            'etag': '"abc123"'
        }
        mock_session.head.return_value = mock_response
        mock_session_class.return_value = mock_session
        
        config = self.create_config()
        source = HttpSource(config)
        
        result = source.test_connection()
        
        assert isinstance(result, TestResult)
        assert result.success is True
        assert result.status == 'connected'
        assert 'Successfully accessed' in result.message
        assert result.response_time is not None
        assert result.metadata is not None
    
    @patch('requests.Session')
    def test_test_connection_404(self, mock_session_class):
        """Test connection test with 404 response."""
        mock_session = MagicMock()
        mock_response = MagicMock()
        mock_response.status_code = 404
        mock_session.head.return_value = mock_response
        mock_session_class.return_value = mock_session
        
        config = self.create_config()
        source = HttpSource(config)
        
        result = source.test_connection()
        
        assert result.success is False
        assert result.status == 'error'
        assert 'not found' in result.message.lower()
        assert result.error == 'Resource not found'
    
    @patch('requests.Session')
    def test_test_connection_401(self, mock_session_class):
        """Test connection test with 401 response."""
        mock_session = MagicMock()
        mock_response = MagicMock()
        mock_response.status_code = 401
        mock_session.head.return_value = mock_response
        mock_session_class.return_value = mock_session
        
        config = self.create_config()
        source = HttpSource(config)
        
        result = source.test_connection()
        
        assert result.success is False
        assert result.status == 'unauthorized'
        assert 'Authentication required' in result.message
    
    @patch('requests.Session')
    def test_test_connection_403(self, mock_session_class):
        """Test connection test with 403 response."""
        mock_session = MagicMock()
        mock_response = MagicMock()
        mock_response.status_code = 403
        mock_session.head.return_value = mock_response
        mock_session_class.return_value = mock_session
        
        config = self.create_config()
        source = HttpSource(config)
        
        result = source.test_connection()
        
        assert result.success is False
        assert result.status == 'unauthorized'
        assert 'Access forbidden' in result.message
    
    @patch('requests.Session')
    def test_test_connection_timeout(self, mock_session_class):
        """Test connection test with timeout."""
        mock_session = MagicMock()
        mock_session.head.side_effect = Exception('timeout')
        mock_session_class.return_value = mock_session
        
        config = self.create_config()
        source = HttpSource(config)
        
        result = source.test_connection()
        
        assert result.success is False
        assert result.status == 'timeout'
        assert 'timeout' in result.message.lower()
    
    def test_parse_http_headers(self):
        """Test parsing HTTP headers to metadata."""
        config = self.create_config()
        source = HttpSource(config)
        
        headers = {
            'content-length': '2048',
            'content-type': 'application/json; charset=utf-8',
            'last-modified': 'Wed, 21 Oct 2015 07:28:00 GMT',
            'etag': '"abc123def"',
            'server': 'nginx/1.0',
            'cache-control': 'max-age=3600'
        }
        
        metadata = source._parse_http_headers(headers)
        
        assert isinstance(metadata, SourceMetadata)
        assert metadata.size == 2048
        assert metadata.content_type == 'application/json'
        assert metadata.encoding == 'utf-8'
        assert metadata.checksum == 'abc123def'
        assert metadata.extra['server'] == 'nginx/1.0'
        assert metadata.extra['cache_control'] == 'max-age=3600'
    
    @patch('requests.Session')
    def test_get_metadata_success(self, mock_session_class):
        """Test getting metadata successfully."""
        mock_session = MagicMock()
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.headers = {
            'content-length': '1024',
            'content-type': 'text/plain'
        }
        mock_session.head.return_value = mock_response
        mock_session_class.return_value = mock_session
        
        config = self.create_config()
        source = HttpSource(config)
        
        metadata = source.get_metadata()
        
        assert isinstance(metadata, SourceMetadata)
        assert metadata.size == 1024
        assert metadata.content_type == 'text/plain'
    
    @patch('requests.Session')
    def test_get_metadata_404(self, mock_session_class):
        """Test getting metadata with 404 response."""
        mock_session = MagicMock()
        mock_response = MagicMock()
        mock_response.status_code = 404
        mock_session.head.return_value = mock_response
        mock_session_class.return_value = mock_session
        
        config = self.create_config()
        source = HttpSource(config)
        
        with pytest.raises(SourceNotFoundError):
            source.get_metadata()
    
    @patch('requests.Session')
    def test_exists_true(self, mock_session_class):
        """Test exists() with successful response."""
        mock_session = MagicMock()
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_session.head.return_value = mock_response
        mock_session_class.return_value = mock_session
        
        config = self.create_config()
        source = HttpSource(config)
        
        assert source.exists() is True
    
    @patch('requests.Session')
    def test_exists_false(self, mock_session_class):
        """Test exists() with 404 response."""
        mock_session = MagicMock()
        mock_response = MagicMock()
        mock_response.status_code = 404
        mock_session.head.return_value = mock_response
        mock_session_class.return_value = mock_session
        
        config = self.create_config()
        source = HttpSource(config)
        
        assert source.exists() is False
    
    @patch('requests.Session')
    def test_read_data_auto_mode(self, mock_session_class):
        """Test reading data in auto mode."""
        mock_session = MagicMock()
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.headers = {'content-type': 'application/json'}
        mock_response.text = '{"key": "value"}'
        mock_session.get.return_value = mock_response
        mock_session_class.return_value = mock_session
        
        config = self.create_config()
        source = HttpSource(config)
        
        data = source.read_data(mode='auto')
        
        assert data == '{"key": "value"}'
        mock_session.get.assert_called_with(
            'http://example.com/api/data',
            headers={},
            stream=False
        )
    
    @patch('requests.Session')
    def test_read_data_binary_mode(self, mock_session_class):
        """Test reading data in binary mode."""
        mock_session = MagicMock()
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.content = b'binary content'
        mock_session.get.return_value = mock_response
        mock_session_class.return_value = mock_session
        
        config = self.create_config()
        source = HttpSource(config)
        
        data = source.read_data(mode='binary')
        
        assert data == b'binary content'
    
    @patch('requests.Session')
    def test_read_data_text_mode(self, mock_session_class):
        """Test reading data in text mode."""
        mock_session = MagicMock()
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.content = b'text content'
        mock_session.get.return_value = mock_response
        mock_session_class.return_value = mock_session
        
        config = self.create_config()
        source = HttpSource(config)
        
        data = source.read_data(mode='text', encoding='utf-8')
        
        assert data == 'text content'
    
    @patch('requests.Session')
    def test_read_data_with_limit(self, mock_session_class):
        """Test reading data with range limit."""
        mock_session = MagicMock()
        mock_response = MagicMock()
        mock_response.status_code = 206  # Partial content
        mock_response.content = b'partial'
        mock_session.get.return_value = mock_response
        mock_session_class.return_value = mock_session
        
        config = self.create_config()
        source = HttpSource(config)
        
        data = source.read_data(mode='binary', limit=100)
        
        mock_session.get.assert_called_with(
            'http://example.com/api/data',
            headers={'Range': 'bytes=0-99'},
            stream=False
        )
        assert data == b'partial'
    
    @patch('requests.Session')
    def test_read_data_404(self, mock_session_class):
        """Test reading data with 404 response."""
        mock_session = MagicMock()
        mock_response = MagicMock()
        mock_response.status_code = 404
        mock_session.get.return_value = mock_response
        mock_session_class.return_value = mock_session
        
        config = self.create_config()
        source = HttpSource(config)
        
        with pytest.raises(SourceNotFoundError):
            source.read_data()
    
    @patch('requests.Session')
    def test_read_stream_success(self, mock_session_class):
        """Test reading data as stream."""
        mock_session = MagicMock()
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.iter_content.return_value = [b'chunk1', b'chunk2', b'chunk3']
        mock_session.get.return_value = mock_response
        mock_session_class.return_value = mock_session
        
        config = self.create_config()
        source = HttpSource(config)
        
        chunks = list(source.read_stream(chunk_size=1024))
        
        assert chunks == [b'chunk1', b'chunk2', b'chunk3']
        mock_session.get.assert_called_with('http://example.com/api/data', stream=True)
        mock_response.iter_content.assert_called_with(chunk_size=1024)
        mock_response.close.assert_called_once()
    
    @patch('requests.Session')
    def test_read_stream_text_mode(self, mock_session_class):
        """Test reading stream in text mode."""
        mock_session = MagicMock()
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.encoding = 'utf-8'
        mock_response.iter_content.return_value = [b'hello', b' world']
        mock_session.get.return_value = mock_response
        mock_session_class.return_value = mock_session
        
        config = self.create_config()
        source = HttpSource(config)
        
        chunks = list(source.read_stream(mode='text'))
        
        assert chunks == ['hello', ' world']
    
    @patch('requests.Session')
    def test_write_data_put(self, mock_session_class):
        """Test writing data using PUT method."""
        mock_session = MagicMock()
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_session.put.return_value = mock_response
        mock_session_class.return_value = mock_session
        
        config = self.create_config(static_config={'writable': True})
        source = HttpSource(config)
        
        result = source.write_data('test data', method='PUT')
        
        assert result is True
        mock_session.put.assert_called_with(
            'http://example.com/api/data',
            data=b'test data',
            headers={}
        )
    
    @patch('requests.Session')
    def test_write_data_post(self, mock_session_class):
        """Test writing data using POST method."""
        mock_session = MagicMock()
        mock_response = MagicMock()
        mock_response.status_code = 201
        mock_session.post.return_value = mock_response
        mock_session_class.return_value = mock_session
        
        config = self.create_config()
        source = HttpSource(config)
        
        result = source.write_data('test data', method='POST', content_type='text/plain')
        
        assert result is True
        mock_session.post.assert_called_with(
            'http://example.com/api/data',
            data=b'test data',
            headers={'Content-Type': 'text/plain'}
        )
    
    @patch('requests.Session')
    def test_write_data_permission_denied(self, mock_session_class):
        """Test writing data with permission denied."""
        mock_session = MagicMock()
        mock_response = MagicMock()
        mock_response.status_code = 403
        mock_session.put.return_value = mock_response
        mock_session_class.return_value = mock_session
        
        config = self.create_config()
        source = HttpSource(config)
        
        with pytest.raises(SourcePermissionError):
            source.write_data('test data')
    
    @patch('requests.Session')
    def test_list_contents(self, mock_session_class):
        """Test listing contents (basic implementation)."""
        mock_session = MagicMock()
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.headers = {
            'content-length': '1024',
            'content-type': 'application/json',
            'last-modified': 'Wed, 21 Oct 2015 07:28:00 GMT'
        }
        mock_session.head.return_value = mock_response
        mock_session_class.return_value = mock_session
        
        config = self.create_config()
        source = HttpSource(config)
        
        contents = source.list_contents()
        
        assert len(contents) == 1
        assert contents[0]['name'] == 'data'  # From URL path
        assert contents[0]['type'] == 'file'
        assert contents[0]['size'] == 1024
    
    def test_capabilities(self):
        """Test source capabilities."""
        config = self.create_config()
        source = HttpSource(config)
        
        assert source.is_readable() is True
        assert source.is_writable() is False  # Default
        assert source.is_listable() is False
        
        # Test with writable config
        config_writable = self.create_config(static_config={'writable': True})
        source_writable = HttpSource(config_writable)
        assert source_writable.is_writable() is True
    
    def test_dynamic_variables_resolution(self):
        """Test URL resolution with dynamic variables."""
        template = 'http://example.com/api/$endpoint'
        config = SourceConfig(
            source_id='test-123',
            name='Test Dynamic HTTP',
            source_type='http',
            static_config={},
            path_template=template,
            dynamic_variables={'endpoint': 'users'},
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        
        source = HttpSource(config)
        assert source._resolved_path == 'http://example.com/api/users'
    
    @patch('requests.Session')
    def test_session_cleanup(self, mock_session_class):
        """Test session cleanup in context manager."""
        mock_session = MagicMock()
        mock_session_class.return_value = mock_session
        
        config = self.create_config()
        
        with HttpSource(config) as source:
            # Get session to initialize it
            source._get_session()
            assert source._session == mock_session
        
        # After context exit, session should be None
        assert source._session is None
        mock_session.close.assert_called_once()
    
    def test_ssl_verification_config(self):
        """Test SSL verification configuration."""
        config = self.create_config(
            static_config={'verify_ssl': False}
        )
        source = HttpSource(config)
        
        with patch('requests.Session') as mock_session_class:
            mock_session = MagicMock()
            mock_session_class.return_value = mock_session
            
            session = source._get_session()
            assert session.verify is False
    
    def test_timeout_configuration(self):
        """Test timeout configuration."""
        config = self.create_config(
            static_config={'timeout': 60}
        )
        source = HttpSource(config)
        
        with patch('requests.Session') as mock_session_class:
            mock_session = MagicMock()
            mock_session_class.return_value = mock_session
            
            session = source._get_session()
            assert session.timeout == 60
    
    @patch('requests.Session')
    def test_content_type_auto_detection(self, mock_session_class):
        """Test automatic content type detection in auto mode."""
        mock_session = MagicMock()
        mock_session_class.return_value = mock_session
        
        test_cases = [
            ('application/json', '{"key": "value"}', str),
            ('text/plain', 'plain text', str),
            ('application/xml', '<xml></xml>', str),
            ('application/javascript', 'console.log("test")', str),
            ('image/png', b'binary image data', bytes),
            ('application/octet-stream', b'binary data', bytes)
        ]
        
        config = self.create_config()
        source = HttpSource(config)
        
        for content_type, content, expected_type in test_cases:
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.headers = {'content-type': content_type}
            
            if expected_type == str:
                mock_response.text = content
            else:
                mock_response.content = content
            
            mock_session.get.return_value = mock_response
            
            data = source.read_data(mode='auto')
            assert isinstance(data, expected_type)
            assert data == content