"""
Samba/SMB data source implementation.
"""

import hashlib
from datetime import datetime
from typing import Union, Iterator, List, Dict, Any, Optional
from urllib.parse import urlparse
import socket

from .base import BaseDataSource, SourceMetadata, ConnectionTestResult, PaginationOptions, PaginatedResult
from .exceptions import (
    SourceNotFoundError, SourceConnectionError, SourcePermissionError,
    SourceDataError, SourceTimeoutError, SourceAuthenticationError, SourceConfigurationError
)


class SambaSource(BaseDataSource):
    """Implementation for Samba/SMB sources."""
    
    def __init__(self, config):
        super().__init__(config)
        self._resolved_path = config.get_resolved_path()
        self._parsed_url = self._parse_smb_url()
        self._smb_conn = None
    
    def _parse_smb_url(self) -> Dict[str, Any]:
        """Parse SMB URL to extract connection details."""
        if not self._resolved_path.startswith('smb://'):
            raise SourceConfigurationError("SMB path must start with 'smb://'")
        
        parsed = urlparse(self._resolved_path)
        
        # Extract connection details
        host = parsed.hostname or self.config.static_config.get('host')
        port = parsed.port or self.config.static_config.get('port', 445)
        
        # Extract share and path
        path_parts = parsed.path.strip('/').split('/', 1)
        share = path_parts[0] if path_parts else None
        remote_path = '/' + path_parts[1] if len(path_parts) > 1 else '/'
        
        if not host or not share:
            raise SourceConfigurationError("SMB host and share are required")
        
        return {
            'host': host,
            'port': port,
            'share': share,
            'path': remote_path,
            'username': parsed.username or self.config.static_config.get('username'),
            'domain': self.config.static_config.get('domain', 'WORKGROUP')
        }
    
    def _get_smb_connection(self):
        """Get SMB connection using pysmb."""
        if self._smb_conn and self._smb_conn.isConnected:
            return self._smb_conn
        
        try:
            from smb.SMBConnection import SMBConnection
            from smb import smb_structs
        except ImportError:
            raise SourceConnectionError("pysmb library is required for SMB sources")
        
        try:
            # Get connection parameters
            host = self._parsed_url['host']
            port = self._parsed_url['port']
            username = self._parsed_url['username']
            password = self.config.static_config.get('password', '')
            domain = self._parsed_url['domain']
            
            # Create connection
            # Use a client machine name (can be arbitrary)
            client_name = self.config.static_config.get('client_name', 'python-client')
            server_name = self.config.static_config.get('server_name', host.upper())
            
            self._smb_conn = SMBConnection(
                username or '',
                password,
                client_name,
                server_name,
                domain=domain,
                use_ntlm_v2=True,
                is_direct_tcp=True  # Use direct TCP connection
            )
            
            # Connect
            timeout = self._get_timeout()
            if not self._smb_conn.connect(host, port, timeout=timeout):
                raise SourceConnectionError(f"Failed to connect to SMB server {host}:{port}")
            
            return self._smb_conn
            
        except Exception as e:
            if 'authentication' in str(e).lower() or 'login' in str(e).lower():
                raise SourceAuthenticationError(f"SMB authentication failed: {str(e)}")
            elif 'timeout' in str(e).lower():
                raise SourceTimeoutError(f"SMB connection timeout to {host}:{port}")
            else:
                raise SourceConnectionError(f"Failed to connect to SMB server: {str(e)}")
    
    def test_connection(self) -> ConnectionTestResult:
        """Test SMB connection and share access."""
        start_time = datetime.now()
        
        try:
            smb_conn = self._get_smb_connection()
            share = self._parsed_url['share']
            path = self._parsed_url['path']
            
            try:
                # Test if share is accessible
                shares = smb_conn.listShares()
                share_found = any(s.name.lower() == share.lower() for s in shares)
                
                if not share_found:
                    return self._cache_test_result(ConnectionTestResult(
                        success=False,
                        status='error',
                        message=f'SMB share not found: {share}',
                        response_time=(datetime.now() - start_time).total_seconds(),
                        error='Share not found'
                    ))
                
                # Test if path exists
                try:
                    attrs = smb_conn.getAttributes(share, path)
                    metadata = self._parse_smb_attrs(attrs, path)
                    
                    return self._cache_test_result(ConnectionTestResult(
                        success=True,
                        status='connected',
                        message=f'Successfully accessed SMB path: {share}{path}',
                        response_time=(datetime.now() - start_time).total_seconds(),
                        metadata=metadata
                    ))
                    
                except Exception as e:
                    if 'does not exist' in str(e).lower() or 'not found' in str(e).lower():
                        return self._cache_test_result(ConnectionTestResult(
                            success=False,
                            status='error',
                            message=f'SMB path not found: {share}{path}',
                            response_time=(datetime.now() - start_time).total_seconds(),
                            error='Path not found'
                        ))
                    elif 'access denied' in str(e).lower() or 'permission' in str(e).lower():
                        return self._cache_test_result(ConnectionTestResult(
                            success=False,
                            status='unauthorized',
                            message=f'Access denied to SMB path: {share}{path}',
                            response_time=(datetime.now() - start_time).total_seconds(),
                            error='Permission denied'
                        ))
                    else:
                        raise e
                        
            except Exception as e:
                if 'access denied' in str(e).lower():
                    return self._cache_test_result(ConnectionTestResult(
                        success=False,
                        status='unauthorized',
                        message=f'Access denied to SMB share: {share}',
                        response_time=(datetime.now() - start_time).total_seconds(),
                        error='Permission denied'
                    ))
                else:
                    raise e
                    
        except SourceAuthenticationError as e:
            return self._cache_test_result(ConnectionTestResult(
                success=False,
                status='unauthorized',
                message=str(e),
                response_time=(datetime.now() - start_time).total_seconds(),
                error=str(e)
            ))
        except SourceTimeoutError as e:
            return self._cache_test_result(ConnectionTestResult(
                success=False,
                status='timeout',
                message=str(e),
                response_time=(datetime.now() - start_time).total_seconds(),
                error=str(e)
            ))
        except Exception as e:
            return self._cache_test_result(ConnectionTestResult(
                success=False,
                status='error',
                message=f'SMB connection failed: {str(e)}',
                response_time=(datetime.now() - start_time).total_seconds(),
                error=str(e)
            ))
    
    def _parse_smb_attrs(self, attrs, path: str) -> SourceMetadata:
        """Parse SMB file attributes to metadata."""
        is_directory = attrs.isDirectory
        
        # Get file size (None for directories)  
        size = None if is_directory else attrs.file_size
        
        # Get last modified time
        last_modified = datetime.fromtimestamp(attrs.last_write_time) if attrs.last_write_time else None
        
        # Determine content type for files
        content_type = None
        if not is_directory and path:
            ext = path.lower().split('.')[-1] if '.' in path else ''
            content_type_map = {
                'txt': 'text/plain',
                'json': 'application/json',
                'xml': 'application/xml',
                'csv': 'text/csv',
                'log': 'text/plain',
                'py': 'text/x-python',
                'js': 'application/javascript',
                'html': 'text/html',
                'css': 'text/css'
            }
            content_type = content_type_map.get(ext, 'application/octet-stream')
        
        return SourceMetadata(
            size=size,
            last_modified=last_modified,
            content_type=content_type,
            extra={
                'is_file': not is_directory,
                'is_directory': is_directory,
                'is_readonly': attrs.isReadOnly,
                'is_hidden': attrs.isHidden,
                'is_system': attrs.isSystem,
                'creation_time': attrs.create_time,
                'last_access_time': attrs.last_access_time,
                'file_attributes': attrs.file_attributes
            }
        )
    
    def get_metadata(self) -> SourceMetadata:
        """Get metadata about the SMB file/directory."""
        try:
            smb_conn = self._get_smb_connection()
            share = self._parsed_url['share']
            path = self._parsed_url['path']
            
            attrs = smb_conn.getAttributes(share, path)
            return self._parse_smb_attrs(attrs, path)
            
        except Exception as e:
            if 'does not exist' in str(e).lower() or 'not found' in str(e).lower():
                raise SourceNotFoundError(f"SMB path not found: {share}{path}")
            elif 'access denied' in str(e).lower() or 'permission' in str(e).lower():
                raise SourcePermissionError(f"Access denied to SMB path: {share}{path}")
            else:
                raise SourceConnectionError(f"Failed to get SMB metadata: {str(e)}")
    
    def exists(self) -> bool:
        """Check if the SMB path exists."""
        try:
            smb_conn = self._get_smb_connection()
            smb_conn.getAttributes(self._parsed_url['share'], self._parsed_url['path'])
            return True
        except Exception:
            return False
    
    def read_data(self, **kwargs) -> Union[str, bytes]:
        """Read data from SMB file."""
        try:
            smb_conn = self._get_smb_connection()
            share = self._parsed_url['share']
            path = self._parsed_url['path']
            
            # Check if it's a file
            attrs = smb_conn.getAttributes(share, path)
            if attrs.isDirectory:
                raise SourceDataError(f"Path is a directory, not a file: {share}{path}")
            
            # Read file using BytesIO
            from io import BytesIO
            file_obj = BytesIO()
            
            try:
                # Handle partial reads with limit
                if 'limit' in kwargs:
                    # SMB doesn't have direct byte range support in pysmb
                    # We'll read the whole file and truncate (not ideal for large files)
                    smb_conn.retrieveFile(share, path, file_obj)
                    file_obj.seek(0)
                    data = file_obj.read(kwargs['limit'])
                else:
                    smb_conn.retrieveFile(share, path, file_obj)
                    file_obj.seek(0)
                    data = file_obj.read()
            finally:
                file_obj.close()
            
            # Handle text mode conversion
            mode = kwargs.get('mode', 'binary')
            if mode == 'text':
                encoding = kwargs.get('encoding', 'utf-8')
                try:
                    return data.decode(encoding)
                except UnicodeDecodeError as e:
                    raise SourceDataError(f"Failed to decode SMB file: {str(e)}")
            
            return data
            
        except Exception as e:
            if isinstance(e, SourceDataError):
                raise
            elif 'does not exist' in str(e).lower() or 'not found' in str(e).lower():
                raise SourceNotFoundError(f"SMB file not found: {share}{path}")
            elif 'access denied' in str(e).lower() or 'permission' in str(e).lower():
                raise SourcePermissionError(f"Access denied to SMB file: {share}{path}")
            else:
                raise SourceConnectionError(f"Failed to read SMB file: {str(e)}")
    
    def read_stream(self, **kwargs) -> Iterator[Union[str, bytes]]:
        """Read SMB file as a stream."""
        # pysmb doesn't have great streaming support
        # For now, we'll read the whole file and yield chunks
        try:
            data = self.read_data(**kwargs)
            chunk_size = kwargs.get('chunk_size', 8192)
            
            for i in range(0, len(data), chunk_size):
                yield data[i:i + chunk_size]
                
        except Exception as e:
            if isinstance(e, (SourceNotFoundError, SourcePermissionError, SourceConnectionError, SourceDataError)):
                raise
            else:
                raise SourceConnectionError(f"Failed to stream SMB file: {str(e)}")
    
    def write_data(self, data: Union[str, bytes], **kwargs) -> bool:
        """Write data to SMB file."""
        try:
            smb_conn = self._get_smb_connection()
            share = self._parsed_url['share']
            path = self._parsed_url['path']
            
            # Convert string to bytes if needed
            if isinstance(data, str):
                encoding = kwargs.get('encoding', 'utf-8')
                data = data.encode(encoding)
            
            # Write file using BytesIO
            from io import BytesIO
            file_obj = BytesIO(data)
            
            try:
                smb_conn.storeFile(share, path, file_obj)
                return True
            finally:
                file_obj.close()
                
        except Exception as e:
            if 'access denied' in str(e).lower() or 'permission' in str(e).lower():
                raise SourcePermissionError(f"Access denied to write SMB file: {share}{path}")
            else:
                raise SourceConnectionError(f"Failed to write SMB file: {str(e)}")
    
    def list_contents(self, path: Optional[str] = None) -> List[Dict[str, Any]]:
        """List contents of SMB directory."""
        try:
            smb_conn = self._get_smb_connection()
            share = self._parsed_url['share']
            target_path = path if path else self._parsed_url['path']
            
            # Check if it's a directory
            attrs = smb_conn.getAttributes(share, target_path)
            if not attrs.isDirectory:
                raise SourceDataError(f"Path is not a directory: {share}{target_path}")
            
            # List directory contents
            file_list = smb_conn.listPath(share, target_path)
            contents = []
            
            for file_info in file_list:
                # Skip . and .. entries
                if file_info.filename in ['.', '..']:
                    continue
                
                is_directory = file_info.isDirectory
                item_path = f"{target_path.rstrip('/')}/{file_info.filename}"
                
                contents.append({
                    'name': file_info.filename,
                    'path': f"smb://{self._parsed_url['host']}/{share}{item_path}",
                    'type': 'directory' if is_directory else 'file',
                    'size': None if is_directory else file_info.file_size,
                    'last_modified': datetime.fromtimestamp(file_info.last_write_time).isoformat() if file_info.last_write_time else None,
                    'is_readonly': file_info.isReadOnly,
                    'is_hidden': file_info.isHidden,
                    'creation_time': datetime.fromtimestamp(file_info.create_time).isoformat() if file_info.create_time else None
                })
            
            return contents
            
        except Exception as e:
            if isinstance(e, SourceDataError):
                raise
            elif 'does not exist' in str(e).lower() or 'not found' in str(e).lower():
                raise SourceNotFoundError(f"SMB directory not found: {share}{target_path}")
            elif 'access denied' in str(e).lower() or 'permission' in str(e).lower():
                raise SourcePermissionError(f"Access denied to SMB directory: {share}{target_path}")
            else:
                raise SourceConnectionError(f"Failed to list SMB directory: {str(e)}")

    def list_contents_paginated(self, path: Optional[str] = None,
                              pagination: Optional[PaginationOptions] = None) -> PaginatedResult:
        """List contents of SMB directory with pagination (in-memory implementation)."""
        # SMB doesn't have built-in pagination, so use the base class implementation
        # which leverages caching and implements pagination in memory
        return super().list_contents_paginated(path, pagination)
    
    def is_writable(self) -> bool:
        """SMB sources support writing."""
        return True
    
    def is_listable(self) -> bool:
        """SMB sources support listing."""
        return True
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Clean up SMB connection."""
        if self._smb_conn:
            try:
                self._smb_conn.close()
            except Exception:
                pass
            self._smb_conn = None
        
        super().__exit__(exc_type, exc_val, exc_tb)