"""
Local file system data source implementation.
"""

import os
import hashlib
from datetime import datetime
from pathlib import Path
from typing import Union, Iterator, List, Dict, Any, Optional
import stat

from .base import BaseDataSource, SourceMetadata, TestResult
from .exceptions import (
    SourceNotFoundError, SourceConnectionError, SourcePermissionError, 
    SourceDataError, SourceTimeoutError
)


class LocalFileSource(BaseDataSource):
    """Implementation for local file system sources."""
    
    def __init__(self, config):
        super().__init__(config)
        self._resolved_path = config.get_resolved_path()
    
    def test_connection(self) -> TestResult:
        """Test if the local file/directory exists and is accessible."""
        start_time = datetime.now()
        
        try:
            path = Path(self._resolved_path)
            
            if not path.exists():
                result = TestResult(
                    success=False,
                    status='error',
                    message=f'Path does not exist: {self._resolved_path}',
                    response_time=(datetime.now() - start_time).total_seconds(),
                    error='Path not found'
                )
            elif not os.access(str(path), os.R_OK):
                result = TestResult(
                    success=False,
                    status='unauthorized',
                    message=f'No read permission for: {self._resolved_path}',
                    response_time=(datetime.now() - start_time).total_seconds(),
                    error='Permission denied'
                )
            else:
                metadata = self._get_path_metadata(path)
                result = TestResult(
                    success=True,
                    status='connected',
                    message=f'Successfully accessed: {self._resolved_path}',
                    response_time=(datetime.now() - start_time).total_seconds(),
                    metadata=metadata
                )
                
        except Exception as e:
            result = TestResult(
                success=False,
                status='error',
                message=f'Error accessing path: {str(e)}',
                response_time=(datetime.now() - start_time).total_seconds(),
                error=str(e)
            )
        
        return self._cache_test_result(result)
    
    def get_metadata(self) -> SourceMetadata:
        """Get metadata about the local file/directory."""
        path = Path(self._resolved_path)
        
        if not path.exists():
            raise SourceNotFoundError(f"Path does not exist: {self._resolved_path}")
        
        if not os.access(str(path), os.R_OK):
            raise SourcePermissionError(f"No read permission for: {self._resolved_path}")
        
        return self._get_path_metadata(path)
    
    def _get_path_metadata(self, path: Path) -> SourceMetadata:
        """Extract metadata from a local path."""
        try:
            stat_result = path.stat()
            
            size = stat_result.st_size if path.is_file() else None
            last_modified = datetime.fromtimestamp(stat_result.st_mtime)
            
            # Get permissions in octal format
            permissions = oct(stat_result.st_mode)[-3:]
            
            # Determine content type based on file extension
            content_type = None
            if path.is_file():
                suffix = path.suffix.lower()
                content_type_map = {
                    '.txt': 'text/plain',
                    '.json': 'application/json',
                    '.xml': 'application/xml',
                    '.csv': 'text/csv',
                    '.log': 'text/plain',
                    '.py': 'text/x-python',
                    '.js': 'application/javascript',
                    '.html': 'text/html',
                    '.css': 'text/css'
                }
                content_type = content_type_map.get(suffix, 'application/octet-stream')
            
            # Calculate checksum for files
            checksum = None
            if path.is_file() and size and size < 10 * 1024 * 1024:  # Only for files < 10MB
                try:
                    with open(path, 'rb') as f:
                        checksum = hashlib.md5(f.read()).hexdigest()
                except Exception:
                    pass  # Ignore checksum errors
            
            return SourceMetadata(
                size=size,
                last_modified=last_modified,
                content_type=content_type,
                permissions=permissions,
                checksum=checksum,
                extra={
                    'is_file': path.is_file(),
                    'is_directory': path.is_dir(),
                    'is_symlink': path.is_symlink(),
                    'absolute_path': str(path.absolute())
                }
            )
            
        except Exception as e:
            raise SourceConnectionError(f"Failed to get metadata: {str(e)}")
    
    def exists(self) -> bool:
        """Check if the local path exists."""
        return Path(self._resolved_path).exists()
    
    def read_data(self, **kwargs) -> Union[str, bytes]:
        """Read data from the local file."""
        path = Path(self._resolved_path)
        
        if not path.exists():
            raise SourceNotFoundError(f"File does not exist: {self._resolved_path}")
        
        if not path.is_file():
            raise SourceDataError(f"Path is not a file: {self._resolved_path}")
        
        if not os.access(str(path), os.R_OK):
            raise SourcePermissionError(f"No read permission for: {self._resolved_path}")
        
        try:
            # Check if we should return bytes or text
            mode = kwargs.get('mode', 'text')
            encoding = kwargs.get('encoding', 'utf-8')
            limit = kwargs.get('limit')
            
            if mode == 'binary':
                with open(path, 'rb') as f:
                    data = f.read(limit) if limit else f.read()
                return data
            else:
                with open(path, 'r', encoding=encoding) as f:
                    if limit:
                        data = f.read(limit)
                    else:
                        data = f.read()
                return data
                
        except UnicodeDecodeError as e:
            raise SourceDataError(f"Failed to decode file: {str(e)}")
        except Exception as e:
            raise SourceConnectionError(f"Failed to read file: {str(e)}")
    
    def read_stream(self, **kwargs) -> Iterator[Union[str, bytes]]:
        """Read data from the local file as a stream."""
        path = Path(self._resolved_path)
        
        if not path.exists():
            raise SourceNotFoundError(f"File does not exist: {self._resolved_path}")
        
        if not path.is_file():
            raise SourceDataError(f"Path is not a file: {self._resolved_path}")
        
        if not os.access(str(path), os.R_OK):
            raise SourcePermissionError(f"No read permission for: {self._resolved_path}")
        
        try:
            chunk_size = kwargs.get('chunk_size', 8192)
            mode = kwargs.get('mode', 'text')
            encoding = kwargs.get('encoding', 'utf-8')
            
            if mode == 'binary':
                with open(path, 'rb') as f:
                    while True:
                        chunk = f.read(chunk_size)
                        if not chunk:
                            break
                        yield chunk
            else:
                with open(path, 'r', encoding=encoding) as f:
                    while True:
                        chunk = f.read(chunk_size)
                        if not chunk:
                            break
                        yield chunk
                        
        except UnicodeDecodeError as e:
            raise SourceDataError(f"Failed to decode file: {str(e)}")
        except Exception as e:
            raise SourceConnectionError(f"Failed to read file: {str(e)}")
    
    def write_data(self, data: Union[str, bytes], **kwargs) -> bool:
        """Write data to the local file."""
        path = Path(self._resolved_path)
        
        # Check parent directory exists
        parent = path.parent
        if not parent.exists():
            raise SourceNotFoundError(f"Parent directory does not exist: {parent}")
        
        if not os.access(str(parent), os.W_OK):
            raise SourcePermissionError(f"No write permission for directory: {parent}")
        
        # Check if file exists and we can overwrite
        if path.exists() and not os.access(str(path), os.W_OK):
            raise SourcePermissionError(f"No write permission for file: {self._resolved_path}")
        
        try:
            mode = kwargs.get('mode', 'text')
            encoding = kwargs.get('encoding', 'utf-8')
            append = kwargs.get('append', False)
            
            if isinstance(data, bytes) or mode == 'binary':
                write_mode = 'ab' if append else 'wb'
                with open(path, write_mode) as f:
                    if isinstance(data, str):
                        data = data.encode(encoding)
                    f.write(data)
            else:
                write_mode = 'a' if append else 'w'
                with open(path, write_mode, encoding=encoding) as f:
                    if isinstance(data, bytes):
                        data = data.decode(encoding)
                    f.write(data)
            
            return True
            
        except Exception as e:
            raise SourceConnectionError(f"Failed to write file: {str(e)}")
    
    def list_contents(self, path: Optional[str] = None) -> List[Dict[str, Any]]:
        """List contents of a local directory."""
        target_path = Path(path) if path else Path(self._resolved_path)
        
        if not target_path.exists():
            raise SourceNotFoundError(f"Directory does not exist: {target_path}")
        
        if not target_path.is_dir():
            raise SourceDataError(f"Path is not a directory: {target_path}")
        
        if not os.access(str(target_path), os.R_OK):
            raise SourcePermissionError(f"No read permission for directory: {target_path}")
        
        try:
            contents = []
            for item in target_path.iterdir():
                try:
                    stat_result = item.stat()
                    contents.append({
                        'name': item.name,
                        'path': str(item),
                        'type': 'directory' if item.is_dir() else 'file',
                        'size': stat_result.st_size if item.is_file() else None,
                        'last_modified': datetime.fromtimestamp(stat_result.st_mtime).isoformat(),
                        'permissions': oct(stat_result.st_mode)[-3:],
                        'is_symlink': item.is_symlink()
                    })
                except (OSError, PermissionError):
                    # Skip items we can't access
                    contents.append({
                        'name': item.name,
                        'path': str(item),
                        'type': 'unknown',
                        'error': 'Permission denied'
                    })
            
            return contents
            
        except Exception as e:
            raise SourceConnectionError(f"Failed to list directory: {str(e)}")
    
    def is_writable(self) -> bool:
        """Check if the local file source supports writing."""
        return True
    
    def is_listable(self) -> bool:
        """Check if the local file source supports listing (directories)."""
        return True