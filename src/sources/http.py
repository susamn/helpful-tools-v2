"""
HTTP/HTTPS data source implementation.
"""

import hashlib
from datetime import datetime
from typing import Union, Iterator, List, Dict, Any, Optional
from urllib.parse import urlparse, urljoin
import time

from .base import BaseDataSource, SourceMetadata, TestResult
from .exceptions import (
    SourceNotFoundError, SourceConnectionError, SourcePermissionError, 
    SourceDataError, SourceTimeoutError, SourceAuthenticationError
)


class HttpSource(BaseDataSource):
    """Implementation for HTTP/HTTPS sources."""
    
    def __init__(self, config):
        super().__init__(config)
        self._resolved_path = config.get_resolved_path()
        self._parsed_url = urlparse(self._resolved_path)
        self._session = None
    
    def _get_session(self):
        """Get requests session with configuration."""
        if self._session:
            return self._session
        
        try:
            import requests
            from requests.auth import HTTPBasicAuth, HTTPDigestAuth
            from requests.adapters import HTTPAdapter
            from urllib3.util.retry import Retry
        except ImportError:
            raise SourceConnectionError("requests library is required for HTTP sources")
        
        self._session = requests.Session()
        
        # Configure timeout
        timeout = self._get_timeout()
        self._session.timeout = timeout
        
        # Configure authentication
        auth_type = self.config.static_config.get('auth_type')
        if auth_type:
            username = self.config.static_config.get('username')
            password = self.config.static_config.get('password')
            
            if auth_type == 'basic':
                self._session.auth = HTTPBasicAuth(username, password)
            elif auth_type == 'digest':
                self._session.auth = HTTPDigestAuth(username, password)
        
        # Configure headers
        headers = self.config.static_config.get('headers', {})
        if headers:
            self._session.headers.update(headers)
        
        # Configure retry strategy
        retry_strategy = Retry(
            total=3,
            backoff_factor=1,
            status_forcelist=[429, 500, 502, 503, 504],
        )
        adapter = HTTPAdapter(max_retries=retry_strategy)
        self._session.mount("http://", adapter)
        self._session.mount("https://", adapter)
        
        # Configure SSL verification
        verify_ssl = self.config.static_config.get('verify_ssl', True)
        self._session.verify = verify_ssl
        
        return self._session
    
    def test_connection(self) -> TestResult:
        """Test HTTP connection and resource access."""
        start_time = datetime.now()
        
        try:
            session = self._get_session()
            
            # Make HEAD request to test connectivity
            response = session.head(self._resolved_path, allow_redirects=True)
            response_time = (datetime.now() - start_time).total_seconds()
            
            if response.status_code == 200:
                metadata = self._parse_http_headers(response.headers)
                return self._cache_test_result(TestResult(
                    success=True,
                    status='connected',
                    message=f'Successfully accessed HTTP resource: {self._resolved_path}',
                    response_time=response_time,
                    metadata=metadata
                ))
            elif response.status_code == 401:
                return self._cache_test_result(TestResult(
                    success=False,
                    status='unauthorized',
                    message=f'Authentication required for: {self._resolved_path}',
                    response_time=response_time,
                    error='Authentication required'
                ))
            elif response.status_code == 403:
                return self._cache_test_result(TestResult(
                    success=False,
                    status='unauthorized',
                    message=f'Access forbidden to: {self._resolved_path}',
                    response_time=response_time,
                    error='Access forbidden'
                ))
            elif response.status_code == 404:
                return self._cache_test_result(TestResult(
                    success=False,
                    status='error',
                    message=f'HTTP resource not found: {self._resolved_path}',
                    response_time=response_time,
                    error='Resource not found'
                ))
            else:
                return self._cache_test_result(TestResult(
                    success=False,
                    status='error',
                    message=f'HTTP error {response.status_code}: {self._resolved_path}',
                    response_time=response_time,
                    error=f'HTTP {response.status_code}'
                ))
                
        except Exception as e:
            error_type = type(e).__name__
            if 'timeout' in error_type.lower() or 'timeout' in str(e).lower():
                return self._cache_test_result(TestResult(
                    success=False,
                    status='timeout',
                    message=f'HTTP request timeout: {self._resolved_path}',
                    response_time=(datetime.now() - start_time).total_seconds(),
                    error='Request timeout'
                ))
            else:
                return self._cache_test_result(TestResult(
                    success=False,
                    status='error',
                    message=f'HTTP connection failed: {str(e)}',
                    response_time=(datetime.now() - start_time).total_seconds(),
                    error=str(e)
                ))
    
    def _parse_http_headers(self, headers) -> SourceMetadata:
        """Parse HTTP response headers to metadata."""
        size = None
        if 'content-length' in headers:
            try:
                size = int(headers['content-length'])
            except ValueError:
                pass
        
        last_modified = None
        if 'last-modified' in headers:
            try:
                from email.utils import parsedate_to_datetime
                last_modified = parsedate_to_datetime(headers['last-modified'])
            except:
                pass
        
        content_type = headers.get('content-type', '').split(';')[0]
        encoding = None
        if 'content-encoding' in headers:
            encoding = headers['content-encoding']
        
        # Extract encoding from content-type if present
        if 'charset=' in headers.get('content-type', ''):
            try:
                encoding_part = headers['content-type'].split('charset=')[1].split(';')[0]
                encoding = encoding_part.strip()
            except:
                pass
        
        checksum = headers.get('etag', '').strip('"')
        
        return SourceMetadata(
            size=size,
            last_modified=last_modified,
            content_type=content_type or None,
            encoding=encoding,
            checksum=checksum or None,
            extra={
                'server': headers.get('server'),
                'cache_control': headers.get('cache-control'),
                'expires': headers.get('expires'),
                'content_encoding': headers.get('content-encoding'),
                'all_headers': dict(headers)
            }
        )
    
    def get_metadata(self) -> SourceMetadata:
        """Get metadata about the HTTP resource."""
        try:
            session = self._get_session()
            response = session.head(self._resolved_path, allow_redirects=True)
            
            if response.status_code == 404:
                raise SourceNotFoundError(f"HTTP resource not found: {self._resolved_path}")
            elif response.status_code in [401, 403]:
                raise SourcePermissionError(f"Access denied to HTTP resource: {self._resolved_path}")
            elif response.status_code != 200:
                raise SourceConnectionError(f"HTTP error {response.status_code}: {self._resolved_path}")
            
            return self._parse_http_headers(response.headers)
            
        except Exception as e:
            if isinstance(e, (SourceNotFoundError, SourcePermissionError, SourceConnectionError)):
                raise
            else:
                raise SourceConnectionError(f"Failed to get HTTP metadata: {str(e)}")
    
    def exists(self) -> bool:
        """Check if the HTTP resource exists."""
        try:
            session = self._get_session()
            response = session.head(self._resolved_path, allow_redirects=True)
            return response.status_code == 200
        except Exception:
            return False
    
    def read_data(self, **kwargs) -> Union[str, bytes]:
        """Read data from HTTP resource."""
        try:
            session = self._get_session()
            
            # Handle range requests
            headers = {}
            if 'limit' in kwargs:
                headers['Range'] = f"bytes=0-{kwargs['limit'] - 1}"
            
            response = session.get(self._resolved_path, headers=headers, stream=False)
            
            if response.status_code == 404:
                raise SourceNotFoundError(f"HTTP resource not found: {self._resolved_path}")
            elif response.status_code in [401, 403]:
                raise SourcePermissionError(f"Access denied to HTTP resource: {self._resolved_path}")
            elif response.status_code not in [200, 206]:  # 206 for partial content
                raise SourceConnectionError(f"HTTP error {response.status_code}: {self._resolved_path}")
            
            # Handle text/binary mode
            mode = kwargs.get('mode', 'auto')
            
            if mode == 'binary':
                return response.content
            elif mode == 'text':
                encoding = kwargs.get('encoding', response.encoding or 'utf-8')
                return response.content.decode(encoding)
            else:  # auto mode
                # Try to determine if it's text or binary
                content_type = response.headers.get('content-type', '').lower()
                if any(text_type in content_type for text_type in ['text/', 'application/json', 'application/xml', 'application/javascript']):
                    return response.text
                else:
                    return response.content
                    
        except Exception as e:
            if isinstance(e, (SourceNotFoundError, SourcePermissionError, SourceConnectionError)):
                raise
            else:
                raise SourceConnectionError(f"Failed to read HTTP resource: {str(e)}")
    
    def read_stream(self, **kwargs) -> Iterator[Union[str, bytes]]:
        """Read HTTP resource as a stream."""
        try:
            session = self._get_session()
            
            response = session.get(self._resolved_path, stream=True)
            
            if response.status_code == 404:
                raise SourceNotFoundError(f"HTTP resource not found: {self._resolved_path}")
            elif response.status_code in [401, 403]:
                raise SourcePermissionError(f"Access denied to HTTP resource: {self._resolved_path}")
            elif response.status_code != 200:
                raise SourceConnectionError(f"HTTP error {response.status_code}: {self._resolved_path}")
            
            chunk_size = kwargs.get('chunk_size', 8192)
            mode = kwargs.get('mode', 'binary')
            encoding = kwargs.get('encoding', response.encoding or 'utf-8')
            
            try:
                for chunk in response.iter_content(chunk_size=chunk_size):
                    if not chunk:
                        continue
                    
                    if mode == 'text':
                        try:
                            chunk = chunk.decode(encoding)
                        except UnicodeDecodeError as e:
                            raise SourceDataError(f"Failed to decode HTTP resource: {str(e)}")
                    
                    yield chunk
            finally:
                response.close()
                
        except Exception as e:
            if isinstance(e, (SourceNotFoundError, SourcePermissionError, SourceConnectionError, SourceDataError)):
                raise
            else:
                raise SourceConnectionError(f"Failed to stream HTTP resource: {str(e)}")
    
    def write_data(self, data: Union[str, bytes], **kwargs) -> bool:
        """Write data to HTTP resource (PUT/POST)."""
        try:
            session = self._get_session()
            
            # Determine HTTP method
            method = kwargs.get('method', 'PUT').upper()
            
            # Prepare data
            if isinstance(data, str):
                encoding = kwargs.get('encoding', 'utf-8')
                data = data.encode(encoding)
            
            # Prepare headers
            headers = {}
            if 'content_type' in kwargs:
                headers['Content-Type'] = kwargs['content_type']
            
            # Make request
            if method == 'PUT':
                response = session.put(self._resolved_path, data=data, headers=headers)
            elif method == 'POST':
                response = session.post(self._resolved_path, data=data, headers=headers)
            else:
                raise SourceDataError(f"Unsupported HTTP method: {method}")
            
            if response.status_code in [401, 403]:
                raise SourcePermissionError(f"Access denied to write HTTP resource: {self._resolved_path}")
            elif response.status_code not in [200, 201, 204]:
                raise SourceConnectionError(f"HTTP write error {response.status_code}: {self._resolved_path}")
            
            return True
            
        except Exception as e:
            if isinstance(e, (SourcePermissionError, SourceConnectionError, SourceDataError)):
                raise
            else:
                raise SourceConnectionError(f"Failed to write HTTP resource: {str(e)}")
    
    def list_contents(self, path: Optional[str] = None) -> List[Dict[str, Any]]:
        """List contents - limited support for directory-style HTTP resources."""
        # Most HTTP resources don't support directory listing
        # This would need to be implemented based on specific server capabilities
        # For now, return basic information about the current resource
        try:
            metadata = self.get_metadata()
            
            return [{
                'name': self._parsed_url.path.split('/')[-1] or 'index',
                'path': self._resolved_path,
                'type': 'file',
                'size': metadata.size,
                'last_modified': metadata.last_modified.isoformat() if metadata.last_modified else None,
                'content_type': metadata.content_type
            }]
            
        except Exception as e:
            raise SourceConnectionError(f"Failed to list HTTP resource: {str(e)}")
    
    def is_writable(self) -> bool:
        """HTTP sources may support writing via PUT/POST."""
        # This depends on server configuration
        # Could be configured via static_config
        return self.config.static_config.get('writable', False)
    
    def is_listable(self) -> bool:
        """HTTP sources have limited listing support."""
        return False
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Clean up HTTP session."""
        if self._session:
            try:
                self._session.close()
            except Exception:
                pass
            self._session = None
        
        super().__exit__(exc_type, exc_val, exc_tb)