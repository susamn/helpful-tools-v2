"""
SFTP data source implementation.
"""

import hashlib
from datetime import datetime
from typing import Union, Iterator, List, Dict, Any, Optional
from urllib.parse import urlparse
import stat
import socket

from .base import BaseDataSource, SourceMetadata, ConnectionTestResult, PaginationOptions, PaginatedResult
from .exceptions import (
    SourceNotFoundError, SourceConnectionError, SourcePermissionError,
    SourceDataError, SourceTimeoutError, SourceAuthenticationError, SourceConfigurationError
)


class SftpSource(BaseDataSource):
    """Implementation for SFTP sources."""
    
    def __init__(self, config):
        super().__init__(config)
        self._resolved_path = config.get_resolved_path()
        self._parsed_url = self._parse_sftp_url()
        self._sftp_client = None
        self._ssh_client = None
    
    def _parse_sftp_url(self) -> Dict[str, Any]:
        """Parse SFTP URL to extract connection details."""
        if not self._resolved_path.startswith('sftp://'):
            raise SourceConfigurationError("SFTP path must start with 'sftp://'")
        
        parsed = urlparse(self._resolved_path)
        
        # Extract connection details from static config
        host = parsed.hostname or self.config.static_config.get('host')
        port = parsed.port or self.config.static_config.get('port', 22)
        username = parsed.username or self.config.static_config.get('username')
        
        if not host:
            raise SourceConfigurationError("SFTP host is required")
        
        return {
            'host': host,
            'port': port,
            'username': username,
            'path': parsed.path or '/'
        }
    
    def _get_sftp_client(self):
        """Get paramiko SFTP client with connection."""
        if self._sftp_client:
            return self._sftp_client
        
        try:
            import paramiko
            from paramiko.ssh_exception import SSHException, AuthenticationException
        except ImportError:
            raise SourceConnectionError("paramiko library is required for SFTP sources")
        
        try:
            # Create SSH client
            self._ssh_client = paramiko.SSHClient()
            self._ssh_client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            
            # Get connection parameters
            host = self._parsed_url['host']
            port = self._parsed_url['port']
            username = self._parsed_url['username']
            password = self.config.static_config.get('password')
            private_key_path = self.config.static_config.get('private_key_path')
            timeout = self._get_timeout()
            
            # Prepare connection arguments
            connect_kwargs = {
                'hostname': host,
                'port': port,
                'username': username,
                'timeout': timeout
            }
            
            # Add authentication method
            if private_key_path:
                try:
                    # Try different key types
                    private_key = None
                    for key_class in [paramiko.RSAKey, paramiko.ECDSAKey, paramiko.Ed25519Key, paramiko.DSSKey]:
                        try:
                            passphrase = self.config.static_config.get('private_key_passphrase')
                            if passphrase:
                                private_key = key_class.from_private_key_file(private_key_path, password=passphrase)
                            else:
                                private_key = key_class.from_private_key_file(private_key_path)
                            break
                        except Exception:
                            continue

                    if not private_key:
                        raise SourceAuthenticationError(f"Could not load private key from {private_key_path}")

                    connect_kwargs['pkey'] = private_key
                except Exception as e:
                    raise SourceAuthenticationError(f"Failed to load private key: {str(e)}")
            elif password:
                connect_kwargs['password'] = password
            else:
                # Try to use SSH agent or default keys
                connect_kwargs['look_for_keys'] = True
                connect_kwargs['allow_agent'] = self.config.static_config.get('allow_agent', True)
            
            # Connect
            self._ssh_client.connect(**connect_kwargs)
            
            # Create SFTP client
            self._sftp_client = self._ssh_client.open_sftp()
            
            return self._sftp_client
            
        except AuthenticationException:
            raise SourceAuthenticationError("SFTP authentication failed")
        except socket.timeout:
            raise SourceTimeoutError(f"SFTP connection timeout to {host}:{port}")
        except socket.gaierror:
            raise SourceConnectionError(f"Could not resolve hostname: {host}")
        except Exception as e:
            raise SourceConnectionError(f"Failed to connect to SFTP server: {str(e)}")
    
    def test_connection(self) -> ConnectionTestResult:
        """Test SFTP connection and path access."""
        start_time = datetime.now()
        
        try:
            sftp_client = self._get_sftp_client()
            path = self._parsed_url['path']
            
            try:
                # Test if path exists and get its attributes
                attrs = sftp_client.stat(path)
                
                # Convert to SourceMetadata
                metadata = self._parse_sftp_attrs(attrs, path)
                
                return self._cache_test_result(ConnectionTestResult(
                    success=True,
                    status='connected',
                    message=f'Successfully accessed SFTP path: {path}',
                    response_time=(datetime.now() - start_time).total_seconds(),
                    metadata=metadata
                ))
                
            except FileNotFoundError:
                return self._cache_test_result(ConnectionTestResult(
                    success=False,
                    status='error',
                    message=f'SFTP path not found: {path}',
                    response_time=(datetime.now() - start_time).total_seconds(),
                    error='Path not found'
                ))
            except PermissionError:
                return self._cache_test_result(ConnectionTestResult(
                    success=False,
                    status='unauthorized',
                    message=f'Access denied to SFTP path: {path}',
                    response_time=(datetime.now() - start_time).total_seconds(),
                    error='Permission denied'
                ))
                
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
                message=f'SFTP connection failed: {str(e)}',
                response_time=(datetime.now() - start_time).total_seconds(),
                error=str(e)
            ))
    
    def _parse_sftp_attrs(self, attrs, path: str) -> SourceMetadata:
        """Parse SFTP file attributes to metadata."""
        is_directory = stat.S_ISDIR(attrs.st_mode)
        
        # Get file size (None for directories)
        size = None if is_directory else attrs.st_size
        
        # Get last modified time
        last_modified = datetime.fromtimestamp(attrs.st_mtime) if attrs.st_mtime else None
        
        # Get permissions
        permissions = oct(attrs.st_mode)[-3:] if attrs.st_mode else None
        
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
            permissions=permissions,
            extra={
                'is_file': not is_directory,
                'is_directory': is_directory,
                'uid': attrs.st_uid,
                'gid': attrs.st_gid,
                'atime': attrs.st_atime,
                'mode': attrs.st_mode
            }
        )
    
    def get_metadata(self) -> SourceMetadata:
        """Get metadata about the SFTP file/directory."""
        try:
            sftp_client = self._get_sftp_client()
            path = self._parsed_url['path']
            attrs = sftp_client.stat(path)
            return self._parse_sftp_attrs(attrs, path)
            
        except FileNotFoundError:
            raise SourceNotFoundError(f"SFTP path not found: {path}")
        except PermissionError:
            raise SourcePermissionError(f"Access denied to SFTP path: {path}")
        except Exception as e:
            raise SourceConnectionError(f"Failed to get SFTP metadata: {str(e)}")
    
    def exists(self) -> bool:
        """Check if the SFTP path exists."""
        try:
            sftp_client = self._get_sftp_client()
            sftp_client.stat(self._parsed_url['path'])
            return True
        except Exception:
            return False
    
    def read_data(self, **kwargs) -> Union[str, bytes]:
        """Read data from SFTP file."""
        try:
            sftp_client = self._get_sftp_client()
            path = self._parsed_url['path']
            
            # Check if it's a file
            attrs = sftp_client.stat(path)
            if stat.S_ISDIR(attrs.st_mode):
                raise SourceDataError(f"Path is a directory, not a file: {path}")
            
            # Open and read file
            mode = kwargs.get('mode', 'binary')
            limit = kwargs.get('limit')
            
            with sftp_client.open(path, 'rb') as f:
                if limit:
                    data = f.read(limit)
                else:
                    data = f.read()
            
            # Handle text mode conversion
            if mode == 'text':
                encoding = kwargs.get('encoding', 'utf-8')
                try:
                    return data.decode(encoding)
                except UnicodeDecodeError as e:
                    raise SourceDataError(f"Failed to decode SFTP file: {str(e)}")
            
            return data
            
        except FileNotFoundError:
            raise SourceNotFoundError(f"SFTP file not found: {path}")
        except PermissionError:
            raise SourcePermissionError(f"Access denied to SFTP file: {path}")
        except Exception as e:
            raise SourceConnectionError(f"Failed to read SFTP file: {str(e)}")
    
    def read_stream(self, **kwargs) -> Iterator[Union[str, bytes]]:
        """Read SFTP file as a stream."""
        try:
            sftp_client = self._get_sftp_client()
            path = self._parsed_url['path']
            
            # Check if it's a file
            attrs = sftp_client.stat(path)
            if stat.S_ISDIR(attrs.st_mode):
                raise SourceDataError(f"Path is a directory, not a file: {path}")
            
            chunk_size = kwargs.get('chunk_size', 8192)
            mode = kwargs.get('mode', 'binary')
            encoding = kwargs.get('encoding', 'utf-8')
            
            with sftp_client.open(path, 'rb') as f:
                while True:
                    chunk = f.read(chunk_size)
                    if not chunk:
                        break
                    
                    if mode == 'text':
                        try:
                            chunk = chunk.decode(encoding)
                        except UnicodeDecodeError as e:
                            raise SourceDataError(f"Failed to decode SFTP file: {str(e)}")
                    
                    yield chunk
                    
        except FileNotFoundError:
            raise SourceNotFoundError(f"SFTP file not found: {path}")
        except PermissionError:
            raise SourcePermissionError(f"Access denied to SFTP file: {path}")
        except Exception as e:
            raise SourceConnectionError(f"Failed to read SFTP file: {str(e)}")
    
    def write_data(self, data: Union[str, bytes], **kwargs) -> bool:
        """Write data to SFTP file."""
        try:
            sftp_client = self._get_sftp_client()
            path = self._parsed_url['path']
            
            # Convert string to bytes if needed
            if isinstance(data, str):
                encoding = kwargs.get('encoding', 'utf-8')
                data = data.encode(encoding)
            
            # Write file
            with sftp_client.open(path, 'wb') as f:
                f.write(data)
            
            return True
            
        except PermissionError:
            raise SourcePermissionError(f"Access denied to write SFTP file: {path}")
        except Exception as e:
            raise SourceConnectionError(f"Failed to write SFTP file: {str(e)}")
    
    def list_contents(self, path: Optional[str] = None) -> List[Dict[str, Any]]:
        """List contents of SFTP directory."""
        try:
            sftp_client = self._get_sftp_client()
            target_path = path if path else self._parsed_url['path']
            
            # Check if it's a directory
            attrs = sftp_client.stat(target_path)
            if not stat.S_ISDIR(attrs.st_mode):
                raise SourceDataError(f"Path is not a directory: {target_path}")
            
            contents = []
            for item in sftp_client.listdir_attr(target_path):
                try:
                    is_directory = stat.S_ISDIR(item.st_mode)
                    item_path = f"{target_path.rstrip('/')}/{item.filename}"

                    # Use base class method for consistent timestamp formatting
                    time_data = self.format_last_modified(item.st_mtime)

                    item_info = {
                        'name': item.filename,
                        'path': f"sftp://{self._parsed_url['host']}:{self._parsed_url['port']}{item_path}",
                        'type': 'directory' if is_directory else 'file',
                        'is_directory': is_directory,
                        'size': None if is_directory else item.st_size,
                        'permissions': oct(item.st_mode)[-3:] if item.st_mode else None,
                        'uid': item.st_uid,
                        'gid': item.st_gid
                    }
                    # Add standardized time fields
                    item_info.update(time_data)

                    # Add lazy loading metadata for directories
                    if is_directory:
                        item_info['has_children'] = True  # Assume directories have children
                        item_info['explorable'] = True
                        item_info['children'] = []  # Empty for lazy loading

                    contents.append(item_info)
                except Exception:
                    # Skip items we can't access
                    contents.append({
                        'name': item.filename,
                        'path': f"sftp://{self._parsed_url['host']}:{self._parsed_url['port']}{target_path.rstrip('/')}/{item.filename}",
                        'type': 'unknown',
                        'error': 'Permission denied or invalid attributes'
                    })
            
            return contents
            
        except FileNotFoundError:
            raise SourceNotFoundError(f"SFTP directory not found: {target_path}")
        except PermissionError:
            raise SourcePermissionError(f"Access denied to SFTP directory: {target_path}")
        except Exception as e:
            raise SourceConnectionError(f"Failed to list SFTP directory: {str(e)}")

    def list_contents_paginated(self, path: Optional[str] = None,
                              pagination: Optional[PaginationOptions] = None) -> PaginatedResult:
        """List contents of SFTP directory with pagination (in-memory implementation)."""
        # SFTP doesn't have built-in pagination, so use the base class implementation
        # which leverages caching and implements pagination in memory
        return super().list_contents_paginated(path, pagination)
    
    def is_writable(self) -> bool:
        """SFTP sources support writing."""
        return True
    
    def is_listable(self) -> bool:
        """SFTP sources support listing."""
        return True

    def is_directory(self) -> bool:
        """Check if SFTP source points to a directory."""
        # First check config override
        if hasattr(self.config, 'is_directory') and self.config.is_directory is not None:
            return self.config.is_directory

        # Fallback to SFTP stat check
        try:
            sftp_client = self._get_sftp_client()
            attrs = sftp_client.stat(self._parsed_url['path'])
            return stat.S_ISDIR(attrs.st_mode)
        except Exception:
            return False

    def is_file(self) -> bool:
        """Check if SFTP source points to a single file."""
        # First check config override (inverse of is_directory)
        if hasattr(self.config, 'is_directory') and self.config.is_directory is not None:
            return not self.config.is_directory

        # Fallback to SFTP stat check
        try:
            sftp_client = self._get_sftp_client()
            attrs = sftp_client.stat(self._parsed_url['path'])
            return stat.S_ISREG(attrs.st_mode)
        except Exception:
            return False

    def _build_child_path(self, parent_path: Optional[str], item: Dict[str, Any]) -> str:
        """
        Build child path for SFTP directory exploration.

        Args:
            parent_path: Parent directory path
            item: Directory item metadata containing 'name'

        Returns:
            Full SFTP path to child directory
        """
        if parent_path is None:
            parent_path = self._parsed_url['path']

        # Build path by joining parent path with item name
        child_path = f"{parent_path.rstrip('/')}/{item['name']}"
        return child_path
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Clean up SFTP and SSH connections."""
        if self._sftp_client:
            try:
                self._sftp_client.close()
            except Exception:
                pass
            self._sftp_client = None
        
        if self._ssh_client:
            try:
                self._ssh_client.close()
            except Exception:
                pass
            self._ssh_client = None
        
        super().__exit__(exc_type, exc_val, exc_tb)