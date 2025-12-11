"""
HTTP/HTTPS data source implementation.
"""

import hashlib
from datetime import datetime
from typing import Union, Iterator, List, Dict, Any, Optional
from urllib.parse import urlparse, urljoin
import time

from .base import BaseDataSource, SourceMetadata, ConnectionTestResult, PaginationOptions, PaginatedResult
from .exceptions import (
    SourceNotFoundError, SourceConnectionError, SourcePermissionError,
    SourceDataError, SourceTimeoutError, SourceAuthenticationError,
    SourceConfigurationError
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
            import urllib3
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

            if not username and auth_type in ['basic', 'digest']:
                raise SourceConfigurationError(f"Username is required for {auth_type} authentication")

            if auth_type == 'basic':
                self._session.auth = HTTPBasicAuth(username, password or '')
            elif auth_type == 'digest':
                self._session.auth = HTTPDigestAuth(username, password or '')
            elif auth_type == 'bearer':
                token = self.config.static_config.get('token')
                if not token:
                    raise SourceConfigurationError("Token is required for bearer authentication")
                self._session.headers['Authorization'] = f'Bearer {token}'
            elif auth_type == 'api_key':
                api_key = self.config.static_config.get('api_key')
                header_name = self.config.static_config.get('api_key_header', 'X-API-Key')
                if not api_key:
                    raise SourceConfigurationError("API key is required for api_key authentication")
                self._session.headers[header_name] = api_key

        # Configure headers
        headers = self.config.static_config.get('headers', {})
        if headers and isinstance(headers, dict):
            self._session.headers.update(headers)

        # Configure user agent
        user_agent = self.config.static_config.get('user_agent', 'Helpful-Tools-HTTP-Client/1.0')
        self._session.headers['User-Agent'] = user_agent

        # Configure retry strategy with exponential backoff
        retry_config = self.config.static_config.get('retry', {})
        retry_strategy = Retry(
            total=retry_config.get('total', 3),
            backoff_factor=retry_config.get('backoff_factor', 2),
            status_forcelist=retry_config.get('status_forcelist', [429, 500, 502, 503, 504]),
            allowed_methods=retry_config.get('allowed_methods', ['HEAD', 'GET', 'OPTIONS']),
            respect_retry_after_header=True
        )
        adapter = HTTPAdapter(
            max_retries=retry_strategy,
            pool_connections=self.config.static_config.get('pool_connections', 10),
            pool_maxsize=self.config.static_config.get('pool_maxsize', 10)
        )
        self._session.mount("http://", adapter)
        self._session.mount("https://", adapter)

        # Configure SSL verification
        verify_ssl = self.config.static_config.get('verify_ssl', True)
        if verify_ssl and isinstance(verify_ssl, str):
            # Custom CA certificate path
            self._session.verify = verify_ssl
        else:
            self._session.verify = bool(verify_ssl)

        # Configure SSL client certificate
        client_cert = self.config.static_config.get('client_cert')
        if client_cert:
            if isinstance(client_cert, dict):
                cert_file = client_cert.get('cert')
                key_file = client_cert.get('key')
                if cert_file and key_file:
                    self._session.cert = (cert_file, key_file)
            elif isinstance(client_cert, str):
                self._session.cert = client_cert

        # Disable SSL warnings if verification is disabled
        if not self._session.verify:
            urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

        return self._session
    
    def test_connection(self) -> ConnectionTestResult:
        """Test HTTP connection and resource access."""
        start_time = datetime.now()
        
        try:
            session = self._get_session()
            
            # Make HEAD request to test connectivity
            response = session.head(self._resolved_path, allow_redirects=True)
            response_time = (datetime.now() - start_time).total_seconds()
            
            if response.status_code == 200:
                metadata = self._parse_http_headers(response.headers)
                return self._cache_test_result(ConnectionTestResult(
                    success=True,
                    status='connected',
                    message=f'Successfully accessed HTTP resource: {self._resolved_path}',
                    response_time=response_time,
                    metadata=metadata
                ))
            elif response.status_code == 401:
                return self._cache_test_result(ConnectionTestResult(
                    success=False,
                    status='unauthorized',
                    message=f'Authentication required for: {self._resolved_path}',
                    response_time=response_time,
                    error='Authentication required'
                ))
            elif response.status_code == 403:
                return self._cache_test_result(ConnectionTestResult(
                    success=False,
                    status='unauthorized',
                    message=f'Access forbidden to: {self._resolved_path}',
                    response_time=response_time,
                    error='Access forbidden'
                ))
            elif response.status_code == 404:
                return self._cache_test_result(ConnectionTestResult(
                    success=False,
                    status='error',
                    message=f'HTTP resource not found: {self._resolved_path}',
                    response_time=response_time,
                    error='Resource not found'
                ))
            else:
                return self._cache_test_result(ConnectionTestResult(
                    success=False,
                    status='error',
                    message=f'HTTP error {response.status_code}: {self._resolved_path}',
                    response_time=response_time,
                    error=f'HTTP {response.status_code}'
                ))
                
        except Exception as e:
            error_type = type(e).__name__
            response_time = (datetime.now() - start_time).total_seconds()

            # Handle specific exceptions
            if 'timeout' in error_type.lower() or 'timeout' in str(e).lower():
                return self._cache_test_result(ConnectionTestResult(
                    success=False,
                    status='timeout',
                    message=f'HTTP request timeout after {response_time:.1f}s: {self._resolved_path}',
                    response_time=response_time,
                    error='Request timeout'
                ))
            elif 'ConnectionError' in error_type or 'connection' in str(e).lower():
                return self._cache_test_result(ConnectionTestResult(
                    success=False,
                    status='error',
                    message=f'HTTP connection error: {self._resolved_path}',
                    response_time=response_time,
                    error='Network connection failed'
                ))
            elif 'SSLError' in error_type or 'ssl' in str(e).lower():
                return self._cache_test_result(ConnectionTestResult(
                    success=False,
                    status='error',
                    message=f'SSL/TLS error: {self._resolved_path}',
                    response_time=response_time,
                    error='SSL certificate verification failed'
                ))
            elif 'TooManyRedirects' in error_type:
                return self._cache_test_result(ConnectionTestResult(
                    success=False,
                    status='error',
                    message=f'Too many redirects: {self._resolved_path}',
                    response_time=response_time,
                    error='Redirect loop detected'
                ))
            elif isinstance(e, SourceConfigurationError):
                return self._cache_test_result(ConnectionTestResult(
                    success=False,
                    status='error',
                    message=f'Configuration error: {str(e)}',
                    response_time=response_time,
                    error=str(e)
                ))
            else:
                return self._cache_test_result(ConnectionTestResult(
                    success=False,
                    status='error',
                    message=f'HTTP connection failed: {str(e)}',
                    response_time=response_time,
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
        # Check if this is a directory-style API endpoint
        api_config = self.config.static_config.get('directory_api')

        if api_config and isinstance(api_config, dict):
            return self._list_api_directory(path, api_config)

        # For regular HTTP resources, return basic information about the current resource
        try:
            metadata = self.get_metadata()
            filename = self._parsed_url.path.split('/')[-1] or 'index'

            # Use base class method for consistent timestamp formatting
            time_data = self.format_last_modified(metadata.last_modified)

            item_info = {
                'name': filename,
                'path': self._resolved_path,
                'type': 'file',
                'is_directory': False,
                'size': metadata.size,
                'content_type': metadata.content_type
            }
            # Add standardized time fields
            item_info.update(time_data)

            return [item_info]

        except Exception as e:
            raise SourceConnectionError(f"Failed to list HTTP resource: {str(e)}")

    def _list_api_directory(self, path: Optional[str], api_config: Dict[str, Any]) -> List[Dict[str, Any]]:
        """List contents using a directory-style API endpoint."""
        try:
            session = self._get_session()

            # Build API URL
            api_endpoint = api_config.get('endpoint', '')
            if path:
                # Construct URL with path parameter
                if api_config.get('path_param'):
                    params = {api_config['path_param']: path}
                    response = session.get(api_endpoint, params=params)
                else:
                    # Append path to endpoint
                    endpoint_url = f"{api_endpoint.rstrip('/')}/{path.lstrip('/')}"
                    response = session.get(endpoint_url)
            else:
                response = session.get(api_endpoint)

            if response.status_code != 200:
                raise SourceConnectionError(f"API returned status {response.status_code}")

            # Parse response
            data = response.json()

            # Extract items based on configuration
            items_path = api_config.get('items_path', 'items')
            if '.' in items_path:
                # Navigate nested JSON path
                items = data
                for key in items_path.split('.'):
                    items = items.get(key, [])
            else:
                items = data.get(items_path, data if isinstance(data, list) else [])

            # Map items to standard format
            name_field = api_config.get('name_field', 'name')
            size_field = api_config.get('size_field', 'size')
            type_field = api_config.get('type_field', 'type')
            modified_field = api_config.get('modified_field', 'last_modified')

            result = []
            for item in items:
                if not isinstance(item, dict):
                    continue

                item_name = item.get(name_field, 'unknown')
                item_type = item.get(type_field, 'file')
                is_directory = item_type.lower() in ['directory', 'folder', 'dir']

                # Build item path
                if path:
                    item_path = f"{self._resolved_path.rstrip('/')}/{path.strip('/')}/{item_name}"
                else:
                    item_path = f"{self._resolved_path.rstrip('/')}/{item_name}"

                # Use base class method for consistent timestamp formatting
                time_data = self.format_last_modified(item.get(modified_field))

                item_info = {
                    'name': item_name,
                    'path': item_path,
                    'type': 'directory' if is_directory else 'file',
                    'is_directory': is_directory,
                    'size': item.get(size_field),
                    'content_type': item.get('content_type'),
                }
                # Add standardized time fields
                item_info.update(time_data)

                # Add lazy loading metadata for directories
                if is_directory:
                    item_info['has_children'] = True
                    item_info['explorable'] = True
                    item_info['children'] = []

                result.append(item_info)

            return result

        except Exception as e:
            if isinstance(e, SourceConnectionError):
                raise
            else:
                raise SourceConnectionError(f"Failed to list API directory: {str(e)}")

    def list_contents_paginated(self, path: Optional[str] = None,
                              pagination: Optional[PaginationOptions] = None) -> PaginatedResult:
        """List contents with pagination support for API endpoints."""
        if pagination is None:
            pagination = PaginationOptions()

        # Check if API supports native pagination
        api_config = self.config.static_config.get('directory_api')
        if api_config and api_config.get('supports_pagination'):
            return self._list_api_directory_paginated(path, pagination, api_config)

        # Fall back to base implementation for non-API sources
        return super().list_contents_paginated(path, pagination)

    def _list_api_directory_paginated(self, path: Optional[str],
                                    pagination: PaginationOptions,
                                    api_config: Dict[str, Any]) -> PaginatedResult:
        """List contents using paginated API endpoint."""
        try:
            session = self._get_session()

            # Build API URL with pagination parameters
            api_endpoint = api_config.get('endpoint', '')
            params = {}

            # Add path parameter
            if path and api_config.get('path_param'):
                params[api_config['path_param']] = path

            # Add pagination parameters
            page_param = api_config.get('page_param', 'page')
            limit_param = api_config.get('limit_param', 'limit')
            params[page_param] = pagination.page
            params[limit_param] = pagination.limit

            # Add sorting parameters
            if api_config.get('supports_sorting'):
                sort_param = api_config.get('sort_param', 'sort_by')
                order_param = api_config.get('order_param', 'sort_order')
                params[sort_param] = pagination.sort_by
                params[order_param] = pagination.sort_order

            # Add filtering parameters
            if pagination.filter_type and api_config.get('supports_filtering'):
                filter_param = api_config.get('filter_param', 'type')
                params[filter_param] = pagination.filter_type

            # Make API request
            if path and not api_config.get('path_param'):
                endpoint_url = f"{api_endpoint.rstrip('/')}/{path.lstrip('/')}"
                response = session.get(endpoint_url, params=params)
            else:
                response = session.get(api_endpoint, params=params)

            if response.status_code != 200:
                raise SourceConnectionError(f"API returned status {response.status_code}")

            data = response.json()

            # Extract pagination metadata
            total_count = data.get(api_config.get('total_field', 'total'), 0)

            # Extract items
            items_path = api_config.get('items_path', 'items')
            if '.' in items_path:
                items = data
                for key in items_path.split('.'):
                    items = items.get(key, [])
            else:
                items = data.get(items_path, data if isinstance(data, list) else [])

            # Map items to standard format (similar to _list_api_directory)
            mapped_items = self._map_api_items(items, api_config, path)

            return PaginatedResult.create(mapped_items, total_count, pagination)

        except Exception as e:
            if isinstance(e, SourceConnectionError):
                raise
            else:
                raise SourceConnectionError(f"Failed to list paginated API directory: {str(e)}")

    def _map_api_items(self, items: List[Dict[str, Any]], api_config: Dict[str, Any], path: Optional[str]) -> List[Dict[str, Any]]:
        """Map API response items to standard format."""
        name_field = api_config.get('name_field', 'name')
        size_field = api_config.get('size_field', 'size')
        type_field = api_config.get('type_field', 'type')
        modified_field = api_config.get('modified_field', 'last_modified')

        result = []
        for item in items:
            if not isinstance(item, dict):
                continue

            item_name = item.get(name_field, 'unknown')
            item_type = item.get(type_field, 'file')
            is_directory = item_type.lower() in ['directory', 'folder', 'dir']

            # Build item path
            if path:
                item_path = f"{self._resolved_path.rstrip('/')}/{path.strip('/')}/{item_name}"
            else:
                item_path = f"{self._resolved_path.rstrip('/')}/{item_name}"

            # Use base class method for consistent timestamp formatting
            time_data = self.format_last_modified(item.get(modified_field))

            item_info = {
                'name': item_name,
                'path': item_path,
                'type': 'directory' if is_directory else 'file',
                'is_directory': is_directory,
                'size': item.get(size_field),
                'content_type': item.get('content_type'),
            }
            # Add standardized time fields
            item_info.update(time_data)

            # Add lazy loading metadata for directories
            if is_directory:
                item_info['has_children'] = True
                item_info['explorable'] = True
                item_info['children'] = []

            result.append(item_info)

        return result
    
    def is_writable(self) -> bool:
        """HTTP sources may support writing via PUT/POST."""
        # This depends on server configuration
        # Could be configured via static_config
        return self.config.static_config.get('writable', False)
    
    def is_directory(self) -> bool:
        """HTTP sources are files unless configured as directory API."""
        return bool(self.config.static_config.get('directory_api'))

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