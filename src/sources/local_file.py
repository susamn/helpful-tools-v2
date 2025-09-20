"""
Local file system data source implementation.
"""

import os
import hashlib
from datetime import datetime
from pathlib import Path
from typing import Union, Iterator, List, Dict, Any, Optional
import stat

from .base import BaseDataSource, SourceMetadata, ConnectionTestResult, PaginationOptions, PaginatedResult
from .exceptions import (
    SourceNotFoundError, SourceConnectionError, SourcePermissionError,
    SourceDataError, SourceTimeoutError
)


class LocalFileSource(BaseDataSource):
    """Implementation for local file system sources."""
    
    def __init__(self, config):
        super().__init__(config)
        self._resolved_path = config.get_resolved_path()
    
    def test_connection(self) -> ConnectionTestResult:
        """Test if the local file/directory exists and is accessible."""
        start_time = datetime.now()
        
        try:
            path = Path(self._resolved_path)
            
            if not path.exists():
                result = ConnectionTestResult(
                    success=False,
                    status='error',
                    message=f'Path does not exist: {self._resolved_path}',
                    response_time=(datetime.now() - start_time).total_seconds(),
                    error='Path not found'
                )
            elif not os.access(str(path), os.R_OK):
                result = ConnectionTestResult(
                    success=False,
                    status='unauthorized',
                    message=f'No read permission for: {self._resolved_path}',
                    response_time=(datetime.now() - start_time).total_seconds(),
                    error='Permission denied'
                )
            else:
                metadata = self._get_path_metadata(path)
                result = ConnectionTestResult(
                    success=True,
                    status='connected',
                    message=f'Successfully accessed: {self._resolved_path}',
                    response_time=(datetime.now() - start_time).total_seconds(),
                    metadata=metadata
                )
                
        except Exception as e:
            result = ConnectionTestResult(
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
        if path:
            target_path = Path(self._resolved_path) / path
        else:
            target_path = Path(self._resolved_path)
        
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
                    
                    # Use base class method for consistent timestamp formatting
                    time_data = self.format_last_modified(stat_result.st_mtime)
                    
                    item_info = {
                        'name': item.name,
                        'path': str(item),
                        'type': 'directory' if item.is_dir() else 'file',
                        'is_directory': item.is_dir(),
                        'size': stat_result.st_size if item.is_file() else None,
                        'permissions': oct(stat_result.st_mode)[-3:],
                        'is_symlink': item.is_symlink()
                    }
                    # Add standardized time fields
                    item_info.update(time_data)
                    
                    contents.append(item_info)
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

    def list_contents_paginated(self, path: Optional[str] = None,
                              pagination: Optional[PaginationOptions] = None) -> PaginatedResult:
        """List contents of a local directory with pagination and efficient scanning."""
        if pagination is None:
            pagination = PaginationOptions()

        # Normalize path
        normalized_path = path or ""

        # Try cache first - get full directory listing
        cached_items = self._cache.get_path_data(normalized_path)
        if cached_items:
            # Apply filtering and pagination to cached data
            filtered_items = self._apply_filters(cached_items, pagination)
            sorted_items = self._sort_items(filtered_items, pagination.sort_by, pagination.sort_order)

            total_count = len(sorted_items)
            start_idx = pagination.offset
            end_idx = start_idx + pagination.limit
            paginated_items = sorted_items[start_idx:end_idx]

            return PaginatedResult.create(paginated_items, total_count, pagination)

        if path:
            target_path = Path(self._resolved_path) / path
        else:
            target_path = Path(self._resolved_path)

        if not target_path.exists():
            raise SourceNotFoundError(f"Directory does not exist: {target_path}")

        if not target_path.is_dir():
            raise SourceDataError(f"Path is not a directory: {target_path}")

        if not os.access(str(target_path), os.R_OK):
            raise SourcePermissionError(f"No read permission for directory: {target_path}")

        try:
            # Use os.scandir for efficient directory scanning
            all_items = []
            with os.scandir(target_path) as entries:
                for entry in entries:
                    try:
                        # Get stat info efficiently
                        stat_result = entry.stat()

                        # Apply filter early if specified
                        is_directory = entry.is_dir()
                        if pagination.filter_type:
                            if pagination.filter_type == 'files' and is_directory:
                                continue
                            elif pagination.filter_type == 'directories' and not is_directory:
                                continue

                        # Use base class method for consistent timestamp formatting
                        time_data = self.format_last_modified(stat_result.st_mtime)

                        item_info = {
                            'name': entry.name,
                            'path': str(entry.path),
                            'type': 'directory' if is_directory else 'file',
                            'is_directory': is_directory,
                            'size': stat_result.st_size if not is_directory else None,
                            'permissions': oct(stat_result.st_mode)[-3:],
                            'is_symlink': entry.is_symlink()
                        }
                        # Add standardized time fields
                        item_info.update(time_data)

                        # Add lazy loading metadata for directories
                        if is_directory:
                            item_info['has_children'] = True  # Assume directories have children
                            item_info['explorable'] = True
                            item_info['children'] = []  # Empty for lazy loading

                        all_items.append(item_info)

                    except (OSError, PermissionError):
                        # Skip items we can't access
                        all_items.append({
                            'name': entry.name,
                            'path': str(entry.path),
                            'type': 'unknown',
                            'error': 'Permission denied'
                        })

            # Cache the full directory listing (before pagination)
            self._cache.cache_path_data(normalized_path, all_items, expanded=True)

            # Apply filtering and pagination
            filtered_items = self._apply_filters(all_items, pagination)
            sorted_items = self._sort_items(filtered_items, pagination.sort_by, pagination.sort_order)

            total_count = len(sorted_items)
            start_idx = pagination.offset
            end_idx = start_idx + pagination.limit
            paginated_items = sorted_items[start_idx:end_idx]

            return PaginatedResult.create(paginated_items, total_count, pagination)

        except Exception as e:
            raise SourceConnectionError(f"Failed to list directory: {str(e)}")

    def _apply_filters(self, items: List[Dict[str, Any]], pagination: PaginationOptions) -> List[Dict[str, Any]]:
        """Apply filtering based on pagination options."""
        if not pagination.filter_type:
            return items

        filtered_items = []
        for item in items:
            is_directory = item.get('is_directory', False)
            if pagination.filter_type == 'files' and not is_directory:
                filtered_items.append(item)
            elif pagination.filter_type == 'directories' and is_directory:
                filtered_items.append(item)
            elif pagination.filter_type not in ['files', 'directories']:
                filtered_items.append(item)

        return filtered_items
    
    def is_writable(self) -> bool:
        """Check if the local file source supports writing."""
        return True
    
    def is_listable(self) -> bool:
        """Check if the local file source supports listing (directories)."""
        return True
    
    def is_directory(self) -> bool:
        """Check if the source points to a directory."""
        # First check config override
        if hasattr(self.config, 'is_directory') and self.config.is_directory is not None:
            return self.config.is_directory

        # Fallback to filesystem check
        path = Path(self._resolved_path)
        return path.exists() and path.is_dir()
    
    def is_file(self) -> bool:
        """Check if the source points to a single file."""
        # First check config override (inverse of is_directory)
        if hasattr(self.config, 'is_directory') and self.config.is_directory is not None:
            return not self.config.is_directory

        # Fallback to filesystem check
        path = Path(self._resolved_path)
        return path.exists() and path.is_file()
    
    def _build_child_path(self, parent_path: Optional[str], item: Dict[str, Any]) -> str:
        """
        Build child path for local file directory exploration.
        
        Args:
            parent_path: Parent directory path
            item: Directory item metadata containing 'path' or 'name'
            
        Returns:
            Full path to child directory
        """
        if parent_path is None:
            parent_path = self._resolved_path
        
        # Use item's full path if available, otherwise join parent with item name
        if 'path' in item:
            return item['path']
        else:
            return os.path.join(parent_path, item['name'])