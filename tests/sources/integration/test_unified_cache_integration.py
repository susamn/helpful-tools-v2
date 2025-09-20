"""
Integration tests for unified cache with actual source implementations.
"""

import tempfile
import shutil
from pathlib import Path
from unittest.mock import patch, MagicMock
from datetime import datetime

import pytest
import sys
import os

# Add src directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', '..', 'src'))

from sources.base import SourceConfig, PaginationOptions
from sources.local_file import LocalFileSource
from sources.s3 import S3Source
from sources.unified_cache import UnifiedSourceCache, SourceState


class TestUnifiedCacheWithLocalFileSource:
    """Test unified cache integration with LocalFileSource."""

    def setup_method(self):
        """Set up test environment."""
        self.temp_dir = tempfile.mkdtemp()
        self.test_dir = os.path.join(self.temp_dir, 'test_source')
        os.makedirs(self.test_dir)

        # Create test file structure
        self.create_test_structure()

        # Create source config
        self.config = SourceConfig(
            source_id='local-test-unified',
            name='Test Local Unified',
            source_type='local_file',
            static_config={},
            path_template=self.test_dir,
            dynamic_variables={},
            created_at=datetime.now(),
            updated_at=datetime.now()
        )

    def teardown_method(self):
        """Clean up test environment."""
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def create_test_structure(self):
        """Create test file/directory structure."""
        # Create files
        for i in range(10):
            file_path = os.path.join(self.test_dir, f'file_{i:02d}.txt')
            with open(file_path, 'w') as f:
                f.write(f'Content of file {i}')

        # Create directories with subdirectories
        for i in range(3):
            dir_path = os.path.join(self.test_dir, f'dir_{i:02d}')
            os.makedirs(dir_path)
            # Add files to subdirectories
            for j in range(5):
                file_path = os.path.join(dir_path, f'nested_file_{j}.txt')
                with open(file_path, 'w') as f:
                    f.write(f'Nested content {j}')

    @patch('pathlib.Path.home')
    def test_local_source_unified_cache_basic(self, mock_home):
        """Test basic unified cache functionality with LocalFileSource."""
        mock_home.return_value = Path(self.temp_dir)

        source = LocalFileSource(self.config)

        # First call should populate cache
        pagination = PaginationOptions(page=1, limit=20)
        result1 = source.list_contents_paginated(pagination=pagination)

        # Verify cache was populated
        cache = source._cache
        cached_data = cache.get_path_data("")
        assert cached_data is not None
        assert len(cached_data) == 13  # 10 files + 3 directories

        # Second call should use cache
        result2 = source.list_contents_paginated(pagination=pagination)

        # Results should be identical
        assert result1.items == result2.items
        assert result1.total_count == result2.total_count

    @patch('pathlib.Path.home')
    def test_local_source_unified_cache_subdirectory_expansion(self, mock_home):
        """Test cache expansion with subdirectories."""
        mock_home.return_value = Path(self.temp_dir)

        source = LocalFileSource(self.config)

        # Cache root directory
        pagination = PaginationOptions(page=1, limit=20)
        root_result = source.list_contents_paginated(pagination=pagination)

        # Cache subdirectory
        sub_result = source.list_contents_paginated(path="dir_00", pagination=pagination)

        # Verify both are cached
        cache = source._cache
        assert cache.get_path_data("") is not None
        assert cache.get_path_data("dir_00") is not None

        # Verify subdirectory has expected content
        assert len(sub_result.items) == 5  # 5 nested files

    @patch('pathlib.Path.home')
    def test_local_source_unified_cache_filtering(self, mock_home):
        """Test cache works correctly with different filters."""
        mock_home.return_value = Path(self.temp_dir)

        source = LocalFileSource(self.config)

        # Cache all items
        pagination_all = PaginationOptions(page=1, limit=20)
        result_all = source.list_contents_paginated(pagination=pagination_all)

        # Filter for files only (should use cache)
        pagination_files = PaginationOptions(page=1, limit=20, filter_type='files')
        result_files = source.list_contents_paginated(pagination=pagination_files)

        # Filter for directories only (should use cache)
        pagination_dirs = PaginationOptions(page=1, limit=20, filter_type='directories')
        result_dirs = source.list_contents_paginated(pagination=pagination_dirs)

        # Verify filtering worked
        assert result_all.total_count == 13  # 10 files + 3 dirs
        assert result_files.total_count == 10  # Only files
        assert result_dirs.total_count == 3   # Only directories

        # Verify all used same cache
        cache_data = source._cache.get_path_data("")
        assert len(cache_data) == 13  # Full dataset cached

    @patch('pathlib.Path.home')
    def test_local_source_cache_refresh(self, mock_home):
        """Test cache refresh clears and reloads."""
        mock_home.return_value = Path(self.temp_dir)

        source = LocalFileSource(self.config)

        # Initial cache
        pagination = PaginationOptions(page=1, limit=20)
        result1 = source.list_contents_paginated(pagination=pagination)

        # Verify cache exists
        assert source._cache.get_path_data("") is not None

        # Clear cache (simulate refresh)
        source._cache.clear()

        # Verify cache cleared
        assert source._cache.get_path_data("") is None

        # Next call should repopulate cache
        result2 = source.list_contents_paginated(pagination=pagination)

        # Cache should be populated again
        assert source._cache.get_path_data("") is not None
        assert len(source._cache.get_path_data("")) == 13


class TestUnifiedCacheWithS3Source:
    """Test unified cache integration with S3Source."""

    def setup_method(self):
        """Set up test environment."""
        self.temp_dir = tempfile.mkdtemp()

        self.config = SourceConfig(
            source_id='s3-test-unified',
            name='Test S3 Unified',
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

    def teardown_method(self):
        """Clean up test environment."""
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    @patch('pathlib.Path.home')
    def test_s3_source_unified_cache_basic(self, mock_home):
        """Test basic unified cache functionality with S3Source."""
        mock_home.return_value = Path(self.temp_dir)

        source = S3Source(self.config)

        # Mock S3 client
        mock_client = MagicMock()
        mock_paginator = MagicMock()
        source._s3_client = mock_client
        mock_client.get_paginator.return_value = mock_paginator

        # Mock S3 response
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

        # First call should populate cache
        pagination = PaginationOptions(page=1, limit=10)
        result1 = source.list_contents_paginated(pagination=pagination)

        # Verify cache was populated
        cache = source._cache
        cached_data = cache.get_path_data("")
        assert cached_data is not None
        assert len(cached_data) == 4  # 2 files + 2 folders

        # Second call should use cache
        result2 = source.list_contents_paginated(pagination=pagination)

        # Results should be identical
        assert result1.items == result2.items
        assert result1.total_count == result2.total_count

        # Verify S3 API was only called once (cache hit on second call)
        assert mock_paginator.paginate.call_count == 1

    @patch('pathlib.Path.home')
    def test_s3_source_unified_cache_filtering(self, mock_home):
        """Test S3 cache works with filtering."""
        mock_home.return_value = Path(self.temp_dir)

        source = S3Source(self.config)

        # Mock S3 client
        mock_client = MagicMock()
        mock_paginator = MagicMock()
        source._s3_client = mock_client
        mock_client.get_paginator.return_value = mock_paginator

        # Mock S3 response with mixed content
        mock_page = {
            'Contents': [
                {
                    'Key': 'file1.txt',
                    'Size': 100,
                    'LastModified': datetime.now(),
                    'ETag': '"abc123"',
                    'StorageClass': 'STANDARD'
                }
            ],
            'CommonPrefixes': [
                {'Prefix': 'folder1/'}
            ]
        }
        mock_paginator.paginate.return_value = [mock_page]

        # Cache all items
        pagination_all = PaginationOptions(page=1, limit=10)
        result_all = source.list_contents_paginated(pagination=pagination_all)

        # Filter for files only (should use cache)
        pagination_files = PaginationOptions(page=1, limit=10, filter_type='files')
        result_files = source.list_contents_paginated(pagination=pagination_files)

        # Filter for directories only (should use cache)
        pagination_dirs = PaginationOptions(page=1, limit=10, filter_type='directories')
        result_dirs = source.list_contents_paginated(pagination=pagination_dirs)

        # Verify filtering worked
        assert result_all.total_count == 2  # 1 file + 1 dir
        assert result_files.total_count == 1  # Only file
        assert result_dirs.total_count == 1   # Only directory

        # Verify S3 API was only called once (all used cache)
        assert mock_paginator.paginate.call_count == 1


class TestUnifiedCacheCrossToolSharing:
    """Test cache sharing between different tools/contexts."""

    def setup_method(self):
        """Set up test environment."""
        self.temp_dir = tempfile.mkdtemp()

    def teardown_method(self):
        """Clean up test environment."""
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    @patch('pathlib.Path.home')
    def test_cross_tool_cache_sharing(self, mock_home):
        """Test cache sharing between different tool contexts."""
        mock_home.return_value = Path(self.temp_dir)

        # Simulate JSON tool caching data
        json_cache = UnifiedSourceCache("shared-source-123")
        json_cache.activate_source("json_tool")

        json_data = [
            {'name': 'data.json', 'type': 'file'},
            {'name': 'config.yaml', 'type': 'file'},
            {'name': 'assets', 'type': 'directory'}
        ]
        json_cache.cache_path_data("", json_data)

        # Simulate YAML tool accessing same source
        yaml_cache = UnifiedSourceCache.get_current_source_cache("yaml_tool")
        assert yaml_cache is not None
        assert yaml_cache.source_id == "shared-source-123"

        # YAML tool should see cached data
        cached_data = yaml_cache.get_path_data("")
        assert cached_data == json_data

        # Verify tool transition was recorded
        state = SourceState.load()
        assert state.current_source == "shared-source-123"
        assert state.last_tool == "yaml_tool"

        # YAML tool expands a directory
        yaml_subdata = [
            {'name': 'image1.png', 'type': 'file'},
            {'name': 'image2.jpg', 'type': 'file'}
        ]
        yaml_cache.cache_path_data("assets", yaml_subdata)

        # XML tool should see both cached datasets
        xml_cache = UnifiedSourceCache.get_current_source_cache("xml_tool")
        assert xml_cache.get_path_data("") == json_data
        assert xml_cache.get_path_data("assets") == yaml_subdata

    @patch('pathlib.Path.home')
    def test_source_lifecycle_management(self, mock_home):
        """Test complete source lifecycle with caching."""
        mock_home.return_value = Path(self.temp_dir)

        # Tool opens source
        cache = UnifiedSourceCache("lifecycle-test")
        cache.activate_source("json_tool")

        # Cache some data
        cache.cache_path_data("", [{'name': 'test.json'}])
        cache.cache_path_data("folder1", [{'name': 'nested.json'}])

        # Verify cache exists
        assert cache.cache_file.exists()
        assert cache.get_path_data("") is not None
        assert cache.get_path_data("folder1") is not None

        # Source is closed/deactivated
        cache.deactivate_source()

        # Cache file should still exist but source not active
        assert cache.cache_file.exists()
        cached_source = cache.get_cache()
        assert cached_source.active is False

        # Global state should be cleared
        state = SourceState.load()
        assert state.current_source is None

        # Tool deletes cache when done
        cache.delete_cache()
        assert not cache.cache_file.exists()

    @patch('pathlib.Path.home')
    def test_cache_cleanup_old_inactive(self, mock_home):
        """Test cleanup of old inactive caches."""
        mock_home.return_value = Path(self.temp_dir)

        # Create multiple caches
        cache1 = UnifiedSourceCache("active-source")
        cache1.activate_source("json_tool")
        cache1.cache_path_data("", [{'name': 'active.json'}])

        cache2 = UnifiedSourceCache("inactive-old")
        cache2.cache_path_data("", [{'name': 'old.json'}])
        cache2.deactivate_source()

        cache3 = UnifiedSourceCache("inactive-recent")
        cache3.cache_path_data("", [{'name': 'recent.json'}])
        cache3.deactivate_source()

        # Make cache2 appear old by modifying file timestamp
        import time
        old_time = time.time() - (25 * 3600)  # 25 hours ago
        os.utime(cache2.cache_file, (old_time, old_time))

        # Run cleanup (24 hour threshold)
        UnifiedSourceCache.cleanup_inactive_caches(max_age_hours=24)

        # Active cache should remain
        assert cache1.cache_file.exists()

        # Recent inactive cache should remain
        assert cache3.cache_file.exists()

        # Old inactive cache should be removed
        assert not cache2.cache_file.exists()


class TestUnifiedCacheErrorHandling:
    """Test error handling and edge cases for unified cache."""

    def setup_method(self):
        """Set up test environment."""
        self.temp_dir = tempfile.mkdtemp()

    def teardown_method(self):
        """Clean up test environment."""
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    @patch('pathlib.Path.home')
    def test_cache_permission_errors(self, mock_home):
        """Test handling of permission errors during cache operations."""
        mock_home.return_value = Path(self.temp_dir)

        cache = UnifiedSourceCache("permission-test")

        # Should handle permission errors gracefully during file operations
        with patch('builtins.open', side_effect=PermissionError("Permission denied")):
            # Cache operations should not raise exceptions
            cache.cache_path_data("", [{'name': 'test.txt'}])

            # Data might be available in memory even if file write failed
            data = cache.get_path_data("")
            # Test that no exception was raised (data might be in memory cache)
            assert True  # The main goal is no exception during operation

        # Test loading from corrupted/inaccessible file
        cache2 = UnifiedSourceCache("permission-test-2")
        with patch('builtins.open', side_effect=PermissionError("Permission denied")):
            # Should create default cache when file can't be read
            loaded_cache = cache2.get_cache()
            assert loaded_cache.source_id == "permission-test-2"

    @patch('pathlib.Path.home')
    def test_cache_disk_full_errors(self, mock_home):
        """Test handling of disk full errors during cache operations."""
        mock_home.return_value = Path(self.temp_dir)

        cache = UnifiedSourceCache("diskfull-test")

        # Should handle disk full errors gracefully
        with patch('builtins.open', side_effect=OSError("No space left on device")):
            # Cache operations should not raise exceptions
            cache.cache_path_data("", [{'name': 'test.txt'}])
            # Should continue working even if cache fails
            assert True  # Test that no exception was raised

    @patch('pathlib.Path.home')
    def test_cache_concurrent_modification(self, mock_home):
        """Test handling of concurrent cache file modifications."""
        mock_home.return_value = Path(self.temp_dir)

        cache1 = UnifiedSourceCache("concurrent-test")
        cache2 = UnifiedSourceCache("concurrent-test")

        # Both cache different data simultaneously
        cache1.cache_path_data("path1", [{'name': 'file1.txt'}])
        cache2.cache_path_data("path2", [{'name': 'file2.txt'}])

        # Both should be able to read their own data after reload
        cache1._cache = None  # Force reload
        cache2._cache = None  # Force reload

        # One of them might win, but neither should crash
        data1 = cache1.get_path_data("path1")
        data2 = cache2.get_path_data("path2")

        # At least one should have succeeded
        assert data1 is not None or data2 is not None


if __name__ == '__main__':
    pytest.main([__file__])