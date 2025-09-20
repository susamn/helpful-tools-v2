"""
Base classes and interfaces for data sources.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Union, BinaryIO, Iterator
from datetime import datetime
import re
import hashlib
import time
import json
from pathlib import Path

from .exceptions import (
    SourceException, SourceNotFoundError, SourceConnectionError,
    SourceConfigurationError, SourcePermissionError, SourceDataError
)


@dataclass
class SourceMetadata:
    """Metadata about a data source."""
    size: Optional[int] = None
    last_modified: Optional[datetime] = None
    content_type: Optional[str] = None
    encoding: Optional[str] = None
    checksum: Optional[str] = None
    permissions: Optional[str] = None
    extra: Optional[Dict[str, Any]] = None


@dataclass
class ConnectionTestResult:
    """Result of testing a data source connection."""
    success: bool
    status: str  # 'connected', 'error', 'timeout', 'unauthorized'
    message: str
    response_time: Optional[float] = None
    metadata: Optional[SourceMetadata] = None
    error: Optional[str] = None


@dataclass
class PaginationOptions:
    """Pagination options for directory listing."""
    page: int = 1
    limit: int = 50
    offset: Optional[int] = None
    sort_by: str = 'name'  # 'name', 'size', 'modified'
    sort_order: str = 'asc'  # 'asc', 'desc'
    filter_type: Optional[str] = None  # 'files', 'directories', None for both

    def __post_init__(self):
        """Calculate offset from page and limit if not provided."""
        if self.offset is None:
            self.offset = (self.page - 1) * self.limit


@dataclass
class PaginatedResult:
    """Paginated directory listing result."""
    items: List[Dict[str, Any]]
    total_count: int
    page: int
    limit: int
    has_next: bool
    has_previous: bool
    total_pages: int
    sort_by: str = 'name'
    sort_order: str = 'asc'

    @classmethod
    def create(cls, items: List[Dict[str, Any]], total_count: int, pagination: PaginationOptions) -> 'PaginatedResult':
        """Create a PaginatedResult from items and pagination options."""
        total_pages = (total_count + pagination.limit - 1) // pagination.limit
        has_next = pagination.page < total_pages
        has_previous = pagination.page > 1

        return cls(
            items=items,
            total_count=total_count,
            page=pagination.page,
            limit=pagination.limit,
            has_next=has_next,
            has_previous=has_previous,
            total_pages=total_pages,
            sort_by=pagination.sort_by,
            sort_order=pagination.sort_order
        )


@dataclass
class CacheEntry:
    """Cache entry for directory listings."""
    data: Dict[str, Any]
    timestamp: float
    source_id: str
    ttl: int = 3600  # 1 hour default TTL

    def is_expired(self) -> bool:
        """Check if cache entry is expired."""
        return time.time() - self.timestamp > self.ttl

    @classmethod
    def create(cls, data: Dict[str, Any], source_id: str, ttl: int = 3600) -> 'CacheEntry':
        """Create a new cache entry."""
        return cls(data=data, timestamp=time.time(), source_id=source_id, ttl=ttl)


@dataclass
class PersistentCacheConfig:
    """Configuration for persistent cache."""
    ttl_seconds: int = 3600  # 1 hour default
    max_entries: int = 1000
    cache_dir: str = '/tmp/source_cache'
    enable_file_cache: bool = True


class PersistentCache:
    """File-based persistent cache that survives server restarts."""

    def __init__(self, config: PersistentCacheConfig):
        self.config = config
        self.cache_dir = Path(config.cache_dir)
        self.memory_cache: Dict[str, CacheEntry] = {}

        if config.enable_file_cache:
            try:
                self.cache_dir.mkdir(parents=True, exist_ok=True)
            except Exception:
                # Fallback to memory-only cache if file system not available
                self.config.enable_file_cache = False

    def _create_cache_key(self, source_id: str, path: str, pagination: Optional[PaginationOptions] = None) -> str:
        """Create a unique cache key for the request."""
        key_parts = [source_id, path or "root"]

        if pagination:
            key_parts.extend([
                str(pagination.page),
                str(pagination.limit),
                pagination.sort_by,
                pagination.sort_order,
                pagination.filter_type or "all"
            ])

        key_string = ":".join(key_parts)
        return hashlib.md5(key_string.encode()).hexdigest()

    def get(self, source_id: str, path: Optional[str], pagination: Optional[PaginationOptions] = None) -> Optional[Dict[str, Any]]:
        """Get cached result if available and not expired."""
        cache_key = self._create_cache_key(source_id, path or "", pagination)

        # Try memory cache first
        if cache_key in self.memory_cache:
            entry = self.memory_cache[cache_key]
            if not entry.is_expired():
                return entry.data
            else:
                del self.memory_cache[cache_key]

        # Try file cache
        if self.config.enable_file_cache:
            cache_file = self.cache_dir / f"{cache_key}.json"
            if cache_file.exists():
                try:
                    with open(cache_file, 'r') as f:
                        file_data = json.load(f)

                    entry = CacheEntry(
                        data=file_data['data'],
                        timestamp=file_data['timestamp'],
                        ttl=file_data.get('ttl', self.config.ttl_seconds)
                    )

                    if not entry.is_expired():
                        # Load back into memory cache
                        self.memory_cache[cache_key] = entry
                        return entry.data
                    else:
                        # Remove expired file
                        cache_file.unlink()
                except Exception:
                    # Ignore cache read errors
                    pass

        return None

    def set(self, source_id: str, path: Optional[str], data: Dict[str, Any],
            pagination: Optional[PaginationOptions] = None, ttl: Optional[int] = None):
        """Store result in cache."""
        cache_key = self._create_cache_key(source_id, path or "", pagination)
        cache_ttl = ttl or self.config.ttl_seconds

        entry = CacheEntry.create(data, source_id, cache_ttl)

        # Store in memory cache
        self.memory_cache[cache_key] = entry

        # Cleanup memory cache if too large
        if len(self.memory_cache) > self.config.max_entries:
            # Remove oldest 10% of entries
            sorted_items = sorted(self.memory_cache.items(), key=lambda x: x[1].timestamp)
            for key, _ in sorted_items[:len(sorted_items) // 10]:
                del self.memory_cache[key]

        # Store in file cache
        if self.config.enable_file_cache:
            cache_file = self.cache_dir / f"{cache_key}.json"
            try:
                file_data = {
                    'data': data,
                    'timestamp': entry.timestamp,
                    'ttl': cache_ttl
                }
                with open(cache_file, 'w') as f:
                    json.dump(file_data, f)
            except Exception:
                # Ignore cache write errors
                pass

    def clear(self, source_id: Optional[str] = None):
        """Clear cache entries, optionally for a specific source."""
        if source_id:
            # Clear entries for specific source from memory cache
            keys_to_remove = []
            for key, entry in self.memory_cache.items():
                if hasattr(entry, 'source_id') and entry.source_id == source_id:
                    keys_to_remove.append(key)
            for key in keys_to_remove:
                del self.memory_cache[key]

            # Clear file cache for source
            if self.config.enable_file_cache:
                try:
                    # For source-specific clearing, we need to read and check each file
                    # since the cache key is hashed
                    for cache_file in self.cache_dir.glob("*.json"):
                        try:
                            with open(cache_file, 'r') as f:
                                file_data = json.load(f)

                            # Check if this cache entry is for our source
                            # The cache key format includes source_id as first part
                            if 'data' in file_data and 'items' in file_data['data']:
                                # Try to extract source info from cached data
                                items = file_data['data']['items']
                                if items and len(items) > 0:
                                    # Check if any item path contains this source_id pattern
                                    first_item_path = items[0].get('path', '')
                                    if source_id in first_item_path or any(source_id in str(item.get('path', '')) for item in items[:3]):
                                        cache_file.unlink()
                                        continue

                            # Alternative: clear all files for refresh (safer approach)
                            # Since we can't easily map hashed keys back to source_ids
                            cache_file.unlink()

                        except Exception:
                            # If we can't read the file, skip it
                            continue
                except Exception:
                    pass
        else:
            # Clear all cache
            self.memory_cache.clear()
            if self.config.enable_file_cache:
                try:
                    for cache_file in self.cache_dir.glob("*.json"):
                        cache_file.unlink()
                except Exception:
                    pass


@dataclass
class SourceConfig:
    """Configuration for a data source."""
    source_id: str
    name: str
    source_type: str
    static_config: Dict[str, Any]
    path_template: str
    dynamic_variables: Dict[str, str]
    created_at: datetime
    updated_at: datetime
    last_accessed: Optional[datetime] = None
    last_tested: Optional[datetime] = None
    status: str = 'created'
    metadata: Optional[SourceMetadata] = None
    is_directory: Optional[bool] = None
    level: int = 0

    def get_resolved_path(self) -> str:
        """Get the resolved path with dynamic variables substituted."""
        path = self.path_template
        for var, value in self.dynamic_variables.items():
            path = path.replace(f'${var}', str(value))
        
        # Add trailing slash for directories if not already present
        if self.is_directory and not path.endswith('/'):
            path += '/'
        
        return path

    def extract_variables(self) -> List[str]:
        """Extract variable names from path template."""
        return re.findall(r'\$(\w+)', self.path_template)

    def validate_variables(self) -> List[str]:
        """Validate that all variables in template have values."""
        required_vars = self.extract_variables()
        missing_vars = []
        
        for var in required_vars:
            if var not in self.dynamic_variables or not self.dynamic_variables[var]:
                missing_vars.append(var)
                
        return missing_vars


class DataSourceInterface(ABC):
    """Abstract interface that all data sources must implement."""

    def __init__(self, config: SourceConfig):
        """Initialize the data source with configuration."""
        self.config = config
        self._validate_config()

    @abstractmethod
    def test_connection(self) -> ConnectionTestResult:
        """
        Test connection to the data source.
        
        Returns:
            ConnectionTestResult with connection status and metadata
            
        Raises:
            SourceException: If test fails with specific error details
        """
        pass

    @abstractmethod
    def get_metadata(self) -> SourceMetadata:
        """
        Get metadata about the data source (size, last modified, etc.).
        
        Returns:
            SourceMetadata object with available information
            
        Raises:
            SourceNotFoundError: If source doesn't exist
            SourceConnectionError: If can't connect to source
            SourcePermissionError: If access denied
        """
        pass

    @abstractmethod
    def exists(self) -> bool:
        """
        Check if the data source exists and is accessible.
        
        Returns:
            True if source exists, False otherwise
        """
        pass

    @abstractmethod
    def read_data(self, **kwargs) -> Union[str, bytes]:
        """
        Read data from the source.
        
        Args:
            **kwargs: Additional options (limit, offset, etc.)
            
        Returns:
            Raw data from source as string or bytes
            
        Raises:
            SourceNotFoundError: If source doesn't exist
            SourceConnectionError: If can't connect to source
            SourcePermissionError: If access denied
            SourceDataError: If data is corrupted
        """
        pass

    @abstractmethod
    def read_stream(self, **kwargs) -> Iterator[Union[str, bytes]]:
        """
        Read data from source as a stream (for large files).
        
        Args:
            **kwargs: Additional options (chunk_size, etc.)
            
        Yields:
            Chunks of data from source
            
        Raises:
            SourceNotFoundError: If source doesn't exist
            SourceConnectionError: If can't connect to source
            SourcePermissionError: If access denied
        """
        pass

    @abstractmethod
    def write_data(self, data: Union[str, bytes], **kwargs) -> bool:
        """
        Write data to the source (if supported).
        
        Args:
            data: Data to write
            **kwargs: Additional options
            
        Returns:
            True if write successful
            
        Raises:
            SourcePermissionError: If write not allowed
            SourceConnectionError: If can't connect to source
            NotImplementedError: If source doesn't support writing
        """
        pass

    @abstractmethod
    def list_contents(self, path: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        List contents of a directory-like source.

        Args:
            path: Optional sub-path to list

        Returns:
            List of items with metadata

        Raises:
            SourceNotFoundError: If path doesn't exist
            SourceConnectionError: If can't connect to source
            NotImplementedError: If source doesn't support listing
        """
        pass

    @abstractmethod
    def list_contents_paginated(self, path: Optional[str] = None,
                              pagination: Optional[PaginationOptions] = None) -> PaginatedResult:
        """
        List contents of a directory-like source with pagination.

        Args:
            path: Optional sub-path to list
            pagination: Pagination options

        Returns:
            PaginatedResult with items and pagination metadata

        Raises:
            SourceNotFoundError: If path doesn't exist
            SourceConnectionError: If can't connect to source
            NotImplementedError: If source doesn't support listing
        """
        pass

    def explore_directory_tree(self, start_path: Optional[str] = None, current_depth: int = 0) -> List[Dict[str, Any]]:
        """
        Explore directory tree structure with level-based depth control.

        Args:
            start_path: Optional starting path (uses source path if None)
            current_depth: Current recursion depth (for internal use)

        Returns:
            List of directory tree items with metadata and children

        Raises:
            SourceNotFoundError: If path doesn't exist
            SourceConnectionError: If can't connect to source
            NotImplementedError: If source doesn't support directory exploration
        """
        max_depth = self.config.level

        # If max depth is 0, just list current level without children
        if max_depth == 0:
            return self._get_flat_listing(start_path, True)

        # Get recursive tree structure
        return self._get_recursive_tree(start_path, current_depth, max_depth)

    def explore_directory_lazy(self, start_path: Optional[str] = None,
                             pagination: Optional[PaginationOptions] = None) -> PaginatedResult:
        """
        Explore directory with lazy loading support - only loads immediate children.

        Args:
            start_path: Optional starting path (uses source path if None)
            pagination: Pagination options for the listing

        Returns:
            PaginatedResult with items for this level only

        Raises:
            SourceNotFoundError: If path doesn't exist
            SourceConnectionError: If can't connect to source
            NotImplementedError: If source doesn't support directory exploration
        """
        if pagination is None:
            pagination = PaginationOptions()

        return self.list_contents_paginated(start_path, pagination)
    
    def _get_flat_listing(self, path: Optional[str], at_max_depth: bool = False) -> List[Dict[str, Any]]:
        """
        Get flat listing of items at current path.
        
        Args:
            path: Path to list
            at_max_depth: Whether we're at maximum depth (affects metadata)
            
        Returns:
            List of items with basic metadata
        """
        try:
            items = self.list_contents(path)
            
            # Add exploration metadata
            for item in items:
                if item.get('is_directory', False):
                    item['has_children'] = not at_max_depth  # Assume has children unless at max depth
                    item['explorable'] = not at_max_depth
                    item['children'] = []  # Empty list for compatibility, no children loaded for flat listing
                
            return items
        except Exception:
            return []
    
    def _get_recursive_tree(self, start_path: Optional[str], current_depth: int, max_depth: int) -> List[Dict[str, Any]]:
        """
        Get recursive tree structure up to max_depth.
        
        Args:
            start_path: Starting path
            current_depth: Current depth level
            max_depth: Maximum depth to explore
            
        Returns:
            List of items with nested children
        """
        try:
            items = self.list_contents(start_path)
            
            for item in items:
                if item.get('is_directory', False):
                    # Check if we can go deeper
                    if current_depth < max_depth:
                        try:
                            # Recursively get children
                            child_path = self._build_child_path(start_path, item)
                            children = self._get_recursive_tree(child_path, current_depth + 1, max_depth)
                            item['children'] = children
                            item['has_children'] = len(children) > 0
                            item['explorable'] = current_depth + 1 < max_depth
                        except Exception:
                            item['children'] = []
                            item['has_children'] = False
                            item['explorable'] = False
                            item['error'] = 'Access denied'
                    else:
                        # At max depth, don't load children but provide empty list for compatibility
                        item['children'] = []
                        item['has_children'] = True  # Assume has children
                        item['explorable'] = False  # Can't explore further
                
            return items
        except Exception:
            return []
    
    def _build_child_path(self, parent_path: Optional[str], item: Dict[str, Any]) -> str:
        """
        Build child path for directory exploration. Override in subclasses.
        
        Args:
            parent_path: Parent directory path
            item: Directory item metadata
            
        Returns:
            Full path to child directory
        """
        raise NotImplementedError("Subclasses must implement _build_child_path")

    def _validate_config(self) -> None:
        """Validate the source configuration."""
        missing_vars = self.config.validate_variables()
        if missing_vars:
            raise SourceConfigurationError(
                f"Missing values for variables: {', '.join(missing_vars)}"
            )

    def get_display_path(self) -> str:
        """Get a display-friendly version of the resolved path."""
        return self.config.get_resolved_path()

    def is_readable(self) -> bool:
        """Check if source supports reading."""
        return True

    def is_writable(self) -> bool:
        """Check if source supports writing."""
        return False

    def is_listable(self) -> bool:
        """Check if source supports listing contents."""
        return False
    
    def is_directory(self) -> bool:
        """Check if source points to a directory/collection."""
        # Check config override first
        if hasattr(self.config, 'is_directory') and self.config.is_directory is not None:
            return self.config.is_directory
        return False
    
    def is_file(self) -> bool:
        """Check if source points to a single file."""
        # Check config override first (inverse of is_directory)
        if hasattr(self.config, 'is_directory') and self.config.is_directory is not None:
            return not self.config.is_directory
        return True
    
    def supports_expiry(self) -> bool:
        """Check if source supports credential expiry."""
        return False
    
    def get_expiry_time(self) -> Optional[datetime]:
        """
        Get credential expiry time if supported.
        
        Returns:
            datetime: Expiry time if available, None otherwise
        """
        return None

    def get_connection_info(self) -> Dict[str, Any]:
        """Get connection information for debugging."""
        return {
            'source_type': self.config.source_type,
            'resolved_path': self.config.get_resolved_path(),
            'static_config': self.config.static_config,
            'status': self.config.status
        }

    @staticmethod
    def format_last_modified(last_modified) -> Dict[str, Any]:
        """
        Format last_modified data consistently across all source types.
        
        Args:
            last_modified: Can be datetime, timestamp (float/int), or ISO string
            
        Returns:
            Dictionary with formatted timestamp data
        """
        if last_modified is None:
            return {
                'modified': None,
                'last_modified': None
            }
        
        try:
            # Handle different input types
            if isinstance(last_modified, datetime):
                dt = last_modified
            elif isinstance(last_modified, (int, float)):
                dt = datetime.fromtimestamp(last_modified)
            elif isinstance(last_modified, str):
                # Try to parse ISO format first
                try:
                    # Handle ISO format with Z timezone
                    if last_modified.endswith('Z'):
                        dt = datetime.fromisoformat(last_modified[:-1] + '+00:00')
                    else:
                        dt = datetime.fromisoformat(last_modified)
                except ValueError:
                    # Try parsing as timestamp string
                    try:
                        timestamp = float(last_modified)
                        dt = datetime.fromtimestamp(timestamp)
                    except ValueError:
                        # Unknown string format, return None
                        return {
                            'modified': None,
                            'last_modified': None
                        }
            else:
                # Unknown type, return None
                return {
                    'modified': None,
                    'last_modified': None
                }
            
            # Return consistent format
            return {
                'modified': dt.timestamp(),  # For API compatibility
                'last_modified': dt.isoformat()  # For display/sorting
            }
            
        except (ValueError, TypeError):
            # If parsing fails, return None
            return {
                'modified': None,
                'last_modified': None
            }


class BaseDataSource(DataSourceInterface):
    """Base implementation with common functionality."""

    def __init__(self, config: SourceConfig):
        super().__init__(config)
        self._connection = None
        self._last_test_result: Optional[ConnectionTestResult] = None

        # Initialize unified cache system
        from .unified_cache import UnifiedSourceCache
        self._cache = UnifiedSourceCache(config.source_id)

    def get_last_test_result(self) -> Optional[ConnectionTestResult]:
        """Get the result of the last connection test."""
        return self._last_test_result

    def _cache_test_result(self, result: ConnectionTestResult) -> ConnectionTestResult:
        """Cache the test result for later reference."""
        self._last_test_result = result
        return result

    def _get_timeout(self) -> int:
        """Get connection timeout from config or default."""
        return self.config.static_config.get('timeout', 30)

    def _should_retry(self, exception: Exception, attempt: int, max_retries: int = 3) -> bool:
        """Determine if operation should be retried."""
        if attempt >= max_retries:
            return False
        
        # Retry on connection errors but not on auth/permission errors
        return isinstance(exception, SourceConnectionError)

    def write_data(self, data: Union[str, bytes], **kwargs) -> bool:
        """Default implementation - most sources are read-only."""
        raise NotImplementedError(f"{self.config.source_type} sources are read-only")

    def list_contents(self, path: Optional[str] = None) -> List[Dict[str, Any]]:
        """Default implementation - most sources don't support listing."""
        raise NotImplementedError(f"{self.config.source_type} sources don't support listing")

    def list_contents_paginated(self, path: Optional[str] = None,
                              pagination: Optional[PaginationOptions] = None) -> PaginatedResult:
        """Default paginated implementation with caching."""
        if pagination is None:
            pagination = PaginationOptions()

        # Try cache first
        cached_result = self._cache.get(self.config.source_id, path, pagination)
        if cached_result:
            return PaginatedResult.create(
                cached_result['items'],
                cached_result['total_count'],
                pagination
            )

        # Get all items from the non-paginated method
        all_items = self.list_contents(path)

        # Apply filtering if specified
        if pagination.filter_type:
            if pagination.filter_type == 'files':
                all_items = [item for item in all_items if not item.get('is_directory', False)]
            elif pagination.filter_type == 'directories':
                all_items = [item for item in all_items if item.get('is_directory', False)]

        # Apply sorting
        all_items = self._sort_items(all_items, pagination.sort_by, pagination.sort_order)

        # Calculate pagination
        total_count = len(all_items)
        start_idx = pagination.offset
        end_idx = start_idx + pagination.limit
        paginated_items = all_items[start_idx:end_idx]

        # Add lazy loading metadata for directories
        for item in paginated_items:
            if item.get('is_directory', False):
                item['has_children'] = True  # Assume directories have children
                item['explorable'] = True
                item['children'] = []  # Empty for lazy loading

        # Cache the result
        cache_data = {
            'items': paginated_items,
            'total_count': total_count
        }
        self._cache.set(self.config.source_id, path, cache_data, pagination)

        return PaginatedResult.create(paginated_items, total_count, pagination)

    def _sort_items(self, items: List[Dict[str, Any]], sort_by: str, sort_order: str) -> List[Dict[str, Any]]:
        """Sort items based on sort criteria."""
        reverse = sort_order.lower() == 'desc'

        if sort_by == 'name':
            return sorted(items, key=lambda x: x.get('name', '').lower(), reverse=reverse)
        elif sort_by == 'size':
            return sorted(items, key=lambda x: x.get('size', 0) or 0, reverse=reverse)
        elif sort_by == 'modified':
            return sorted(items, key=lambda x: x.get('last_modified', '') or '', reverse=reverse)
        else:
            return items

    def __enter__(self):
        """Context manager entry."""
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit - cleanup connections."""
        if hasattr(self, '_connection') and self._connection:
            try:
                if hasattr(self._connection, 'close'):
                    self._connection.close()
            except Exception:
                pass  # Ignore cleanup errors
        self._connection = None

    def __str__(self) -> str:
        return f"{self.__class__.__name__}({self.config.name})"

    def __repr__(self) -> str:
        return f"{self.__class__.__name__}(source_id='{self.config.source_id}', path='{self.get_display_path()}')"