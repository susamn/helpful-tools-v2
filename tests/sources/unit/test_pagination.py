"""
Tests for pagination functionality in the sources package.
"""

import pytest
import sys
import os
import tempfile
import shutil
from datetime import datetime, timedelta
from unittest.mock import patch, MagicMock
from pathlib import Path

# Add src directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', '..', 'src'))

from sources.base import (
    PaginationOptions, PaginatedResult, CacheEntry, PersistentCache, PersistentCacheConfig, SourceConfig
)
from sources.local_file import LocalFileSource
from sources.s3 import S3Source
from sources.exceptions import SourceConfigurationError


class TestPaginationOptions:
    """Test PaginationOptions dataclass functionality."""

    def test_pagination_options_creation(self):
        """Test creating PaginationOptions with default values."""
        options = PaginationOptions()
        assert options.page == 1
        assert options.limit == 50
        assert options.sort_by == 'name'
        assert options.sort_order == 'asc'
        assert options.filter_type is None

    def test_pagination_options_custom(self):
        """Test creating PaginationOptions with custom values."""
        options = PaginationOptions(
            page=3,
            limit=25,
            sort_by='size',
            sort_order='desc',
            filter_type='files'
        )
        assert options.page == 3
        assert options.limit == 25
        assert options.sort_by == 'size'
        assert options.sort_order == 'desc'
        assert options.filter_type == 'files'

    def test_pagination_validation(self):
        """Test pagination options validation."""
        # Test minimum page
        options = PaginationOptions(page=0)
        assert options.page == 0  # Constructor doesn't validate, API should

        # Test minimum limit
        options = PaginationOptions(limit=1)
        assert options.limit == 1

        # Test maximum limit (handled in API layer)
        options = PaginationOptions(limit=1000)
        assert options.limit == 1000


class TestPaginatedResult:
    """Test PaginatedResult functionality."""

    def test_paginated_result_creation(self):
        """Test creating PaginatedResult."""
        items = [{'name': 'file1.txt'}, {'name': 'file2.txt'}]
        pagination = PaginationOptions(page=1, limit=10)

        result = PaginatedResult.create(items, 25, pagination)

        assert result.items == items
        assert result.total_count == 25
        assert result.page == 1
        assert result.limit == 10
        assert result.total_pages == 3  # ceil(25/10)
        assert result.has_next is True
        assert result.has_previous is False

    def test_paginated_result_last_page(self):
        """Test PaginatedResult on last page."""
        items = [{'name': 'file1.txt'}]
        pagination = PaginationOptions(page=3, limit=10)

        result = PaginatedResult.create(items, 25, pagination)

        assert result.total_pages == 3
        assert result.has_next is False
        assert result.has_previous is True

    def test_paginated_result_single_page(self):
        """Test PaginatedResult when all items fit on one page."""
        items = [{'name': 'file1.txt'}, {'name': 'file2.txt'}]
        pagination = PaginationOptions(page=1, limit=10)

        result = PaginatedResult.create(items, 2, pagination)

        assert result.total_pages == 1
        assert result.has_next is False
        assert result.has_previous is False


class TestPersistentCache:
    """Test PersistentCache functionality."""

    def setup_method(self):
        """Set up test cache directory."""
        self.temp_dir = tempfile.mkdtemp()
        config = PersistentCacheConfig(cache_dir=self.temp_dir)
        self.cache = PersistentCache(config)

    def teardown_method(self):
        """Clean up test cache directory."""
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_cache_creation(self):
        """Test cache directory creation."""
        assert os.path.exists(self.temp_dir)

    def test_cache_store_and_retrieve(self):
        """Test storing and retrieving cache entries."""
        items = [{'name': 'file1.txt', 'size': 100}]
        pagination = PaginationOptions(page=1, limit=10)

        # Store cache entry
        cache_data = {'items': items, 'total_count': 10}
        self.cache.set('source123', 'folder/path', cache_data, pagination)

        # Retrieve cache entry
        cached = self.cache.get('source123', 'folder/path', pagination)

        assert cached is not None
        assert cached['items'] == items
        assert cached['total_count'] == 10

    def test_cache_expiry(self):
        """Test cache expiry functionality."""
        items = [{'name': 'file1.txt'}]
        pagination = PaginationOptions()

        # Store with short TTL
        cache_data = {'items': items, 'total_count': 1}
        self.cache.set('source123', 'path', cache_data, pagination, ttl=1)  # 1 second TTL

        # Should be available immediately
        cached = self.cache.get('source123', 'path', pagination)
        assert cached is not None

        # Wait for expiry
        import time
        time.sleep(1.1)  # Wait longer than TTL

        # Should be expired
        cached = self.cache.get('source123', 'path', pagination)
        assert cached is None

    def test_cache_key_generation(self):
        """Test cache key generation for different parameters."""
        pagination1 = PaginationOptions(page=1, limit=10)
        pagination2 = PaginationOptions(page=2, limit=10)

        key1 = self.cache._create_cache_key('source1', 'path', pagination1)
        key2 = self.cache._create_cache_key('source1', 'path', pagination2)
        key3 = self.cache._create_cache_key('source2', 'path', pagination1)

        # Different pagination should give different keys
        assert key1 != key2
        # Different source should give different keys
        assert key1 != key3

    def test_cache_clear_all(self):
        """Test clearing all cache entries."""
        items = [{'name': 'file1.txt'}]
        pagination = PaginationOptions()

        # Store multiple entries
        cache_data = {'items': items, 'total_count': 1}
        self.cache.set('source1', 'path1', cache_data, pagination)
        self.cache.set('source2', 'path2', cache_data, pagination)

        # Verify they exist
        assert self.cache.get('source1', 'path1', pagination) is not None
        assert self.cache.get('source2', 'path2', pagination) is not None

        # Clear all
        self.cache.clear()

        # Verify they're gone
        assert self.cache.get('source1', 'path1', pagination) is None
        assert self.cache.get('source2', 'path2', pagination) is None

    def test_cache_clear_source_specific(self):
        """Test clearing cache for specific source."""
        items = [{'name': 'file1.txt'}]
        pagination = PaginationOptions()

        # Store entries for different sources
        cache_data = {'items': items, 'total_count': 1}
        self.cache.set('source1', 'path1', cache_data, pagination)
        self.cache.set('source2', 'path2', cache_data, pagination)

        # Clear only source1
        self.cache.clear('source1')

        # Verify source1 is gone, source2 remains
        assert self.cache.get('source1', 'path1', pagination) is None
        assert self.cache.get('source2', 'path2', pagination) is not None


class TestLocalFileSourcePagination:
    """Test pagination in LocalFileSource."""

    def setup_method(self):
        """Set up test directory structure."""
        self.temp_dir = tempfile.mkdtemp()
        self.test_dir = os.path.join(self.temp_dir, 'test_source')
        os.makedirs(self.test_dir)

        # Create test files and directories
        self.create_test_structure()

        # Create source instance
        config = SourceConfig(
            source_id='test-local',
            name='Test Local',
            source_type='local_file',
            static_config={},
            path_template=self.test_dir,
            dynamic_variables={},
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        self.source = LocalFileSource(config)

    def teardown_method(self):
        """Clean up test directory."""
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def create_test_structure(self):
        """Create test file/directory structure."""
        # Create files
        for i in range(15):
            file_path = os.path.join(self.test_dir, f'file_{i:02d}.txt')
            with open(file_path, 'w') as f:
                f.write(f'Content of file {i}')

        # Create directories
        for i in range(5):
            dir_path = os.path.join(self.test_dir, f'dir_{i:02d}')
            os.makedirs(dir_path)
            # Add files to directories
            for j in range(3):
                file_path = os.path.join(dir_path, f'nested_file_{j}.txt')
                with open(file_path, 'w') as f:
                    f.write(f'Nested content {j}')

    def test_list_contents_paginated_first_page(self):
        """Test first page of paginated results."""
        pagination = PaginationOptions(page=1, limit=10)
        result = self.source.list_contents_paginated(pagination=pagination)

        assert len(result.items) == 10
        assert result.total_count == 20  # 15 files + 5 directories
        assert result.has_next is True
        assert result.has_previous is False
        assert result.total_pages == 2

    def test_list_contents_paginated_second_page(self):
        """Test second page of paginated results."""
        pagination = PaginationOptions(page=2, limit=10)
        result = self.source.list_contents_paginated(pagination=pagination)

        assert len(result.items) == 10
        assert result.has_next is False
        assert result.has_previous is True

    def test_list_contents_paginated_sorting(self):
        """Test sorting in paginated results."""
        # Test ascending sort by name
        pagination = PaginationOptions(page=1, limit=5, sort_by='name', sort_order='asc')
        result = self.source.list_contents_paginated(pagination=pagination)

        names = [item['name'] for item in result.items]
        assert names == sorted(names)

        # Test descending sort by name
        pagination = PaginationOptions(page=1, limit=5, sort_by='name', sort_order='desc')
        result = self.source.list_contents_paginated(pagination=pagination)

        names = [item['name'] for item in result.items]
        assert names == sorted(names, reverse=True)

    def test_list_contents_paginated_filtering(self):
        """Test filtering in paginated results."""
        # Filter for files only
        pagination = PaginationOptions(page=1, limit=20, filter_type='files')
        result = self.source.list_contents_paginated(pagination=pagination)

        for item in result.items:
            assert item['is_directory'] is False

        # Filter for directories only
        pagination = PaginationOptions(page=1, limit=20, filter_type='directories')
        result = self.source.list_contents_paginated(pagination=pagination)

        for item in result.items:
            assert item['is_directory'] is True

    def test_list_contents_paginated_subdirectory(self):
        """Test pagination in subdirectory."""
        # List contents of first directory
        subdir_path = os.path.join(self.test_dir, 'dir_00')
        pagination = PaginationOptions(page=1, limit=10)
        result = self.source.list_contents_paginated(path=subdir_path, pagination=pagination)

        assert len(result.items) == 3  # 3 nested files
        for item in result.items:
            assert item['name'].startswith('nested_file_')

    def test_list_contents_paginated_cache_usage(self):
        """Test that caching works correctly."""
        pagination = PaginationOptions(page=1, limit=10)

        # First call should populate cache
        result1 = self.source.list_contents_paginated(pagination=pagination)

        # Second call should use cache
        result2 = self.source.list_contents_paginated(pagination=pagination)

        # Results should be identical
        assert result1.items == result2.items
        assert result1.total_count == result2.total_count


class TestS3SourcePagination:
    """Test pagination in S3Source (mocked)."""

    def setup_method(self):
        """Set up S3 source with mocked boto3."""
        import uuid
        # Use unique source ID to avoid cache conflicts between tests
        unique_id = f'test-s3-{uuid.uuid4().hex[:8]}'

        config = SourceConfig(
            source_id=unique_id,
            name='Test S3',
            source_type='s3',
            static_config={
                'bucket': 'test-bucket',
                'key': '',
                'region': 'us-east-1',
                'aws_profile': 'default'
            },
            path_template='s3://test-bucket/',
            dynamic_variables={},
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        self.source = S3Source(config)

        # Clear any existing cache
        self.source._cache.clear_cache()

    def test_s3_pagination_basic(self):
        """Test basic S3 pagination functionality."""
        # Mock S3 client and paginator directly on the source
        mock_client = MagicMock()
        mock_paginator = MagicMock()
        self.source._s3_client = mock_client
        mock_client.get_paginator.return_value = mock_paginator

        # Mock paginator response
        mock_page = {
            'Contents': [
                {
                    'Key': 'file1.txt',
                    'Size': 100,
                    'LastModified': datetime.now(),
                    'ETag': '"abc123"',
                    'StorageClass': 'STANDARD'
                },
                {
                    'Key': 'file2.txt',
                    'Size': 200,
                    'LastModified': datetime.now(),
                    'ETag': '"def456"',
                    'StorageClass': 'STANDARD'
                }
            ],
            'CommonPrefixes': [
                {'Prefix': 'folder1/'},
                {'Prefix': 'folder2/'}
            ]
        }
        mock_paginator.paginate.return_value = [mock_page]

        # Test pagination
        pagination = PaginationOptions(page=1, limit=10)
        result = self.source.list_contents_paginated(pagination=pagination)

        assert len(result.items) == 4  # 2 files + 2 folders
        assert result.total_count == 4

        # Verify paginator was called with correct parameters
        mock_paginator.paginate.assert_called_once()
        call_args = mock_paginator.paginate.call_args
        assert call_args[1]['Bucket'] == 'test-bucket'
        assert call_args[1]['Delimiter'] == '/'
        assert 'PaginationConfig' in call_args[1]

    def test_s3_pagination_with_prefix(self):
        """Test S3 pagination with path prefix."""
        # Mock S3 client directly on the source
        mock_client = MagicMock()
        mock_paginator = MagicMock()
        self.source._s3_client = mock_client
        mock_client.get_paginator.return_value = mock_paginator

        # Mock empty response
        mock_paginator.paginate.return_value = [{'Contents': [], 'CommonPrefixes': []}]

        # Test with path
        pagination = PaginationOptions(page=1, limit=10)
        result = self.source.list_contents_paginated(path='folder1', pagination=pagination)

        # Verify prefix was set correctly
        call_args = mock_paginator.paginate.call_args
        assert call_args[1]['Prefix'] == 'folder1/'


class TestPaginationAPI:
    """Test pagination API endpoints (integration-style tests)."""

    def test_api_pagination_parameters(self):
        """Test that API correctly handles pagination parameters."""
        # This would test the actual Flask endpoints
        # For now, this is a placeholder for integration tests
        pass

    def test_api_cache_invalidation(self):
        """Test cache invalidation via refresh parameter."""
        # This would test the refresh=true parameter
        pass

    def test_api_error_handling(self):
        """Test API error handling for invalid pagination parameters."""
        # This would test parameter validation
        pass


if __name__ == '__main__':
    pytest.main([__file__])