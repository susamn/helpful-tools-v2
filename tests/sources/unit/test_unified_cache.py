"""
Tests for the unified caching system.
"""

import json
import tempfile
import time
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import patch, mock_open

import pytest

import sys
import os

# Add src directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', '..', 'src'))

from sources.unified_cache import (
    SourceState, PathCacheEntry, SourceCache, UnifiedSourceCache
)
from sources.base import PaginationOptions


class TestSourceState:
    """Test global source state management."""

    def setup_method(self):
        """Set up test environment."""
        self.temp_dir = tempfile.mkdtemp()

    def teardown_method(self):
        """Clean up test environment."""
        import shutil
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_source_state_creation(self):
        """Test creating a new source state."""
        state = SourceState()
        assert state.current_source is None
        assert state.last_tool is None
        assert state.opened_at is None

    def test_source_state_set_current_source(self):
        """Test setting current source."""
        state = SourceState()
        state.set_current_source("test-source-123", "json_tool")

        assert state.current_source == "test-source-123"
        assert state.last_tool == "json_tool"
        assert state.opened_at is not None

        # Verify timestamp format
        datetime.fromisoformat(state.opened_at)

    def test_source_state_clear_current_source(self):
        """Test clearing current source."""
        state = SourceState()
        state.set_current_source("test-source-123", "json_tool")
        state.clear_current_source()

        assert state.current_source is None
        assert state.last_tool is None
        assert state.opened_at is None

    @patch('pathlib.Path.home')
    def test_source_state_save_and_load(self, mock_home):
        """Test saving and loading source state."""
        mock_home.return_value = Path(self.temp_dir)

        # Create and save state
        state1 = SourceState()
        state1.set_current_source("test-source-456", "yaml_tool")
        state1.save()

        # Load state from file
        state2 = SourceState.load()

        assert state2.current_source == "test-source-456"
        assert state2.last_tool == "yaml_tool"
        assert state2.opened_at == state1.opened_at

    @patch('pathlib.Path.home')
    def test_source_state_load_nonexistent_file(self, mock_home):
        """Test loading when state file doesn't exist."""
        mock_home.return_value = Path(self.temp_dir)

        state = SourceState.load()
        assert state.current_source is None
        assert state.last_tool is None
        assert state.opened_at is None

    @patch('pathlib.Path.home')
    def test_source_state_load_corrupted_file(self, mock_home):
        """Test loading when state file is corrupted."""
        mock_home.return_value = Path(self.temp_dir)

        # Create corrupted state file
        state_file = Path(self.temp_dir) / '.helpful-tools' / 'source_state.json'
        state_file.parent.mkdir(parents=True, exist_ok=True)
        with open(state_file, 'w') as f:
            f.write("invalid json content")

        # Should return default state
        state = SourceState.load()
        assert state.current_source is None


class TestPathCacheEntry:
    """Test path cache entry functionality."""

    def test_path_cache_entry_creation(self):
        """Test creating path cache entry."""
        items = [{'name': 'file1.txt', 'type': 'file'}]
        entry = PathCacheEntry(
            items=items,
            expanded=True,
            last_fetched=datetime.now().isoformat()
        )

        assert entry.items == items
        assert entry.expanded is True
        assert entry.last_fetched is not None

    def test_path_cache_entry_not_expired(self):
        """Test entry not expired within TTL."""
        entry = PathCacheEntry(
            items=[],
            expanded=True,
            last_fetched=datetime.now().isoformat()
        )

        assert not entry.is_expired(ttl_seconds=3600)

    def test_path_cache_entry_expired(self):
        """Test entry expired after TTL."""
        old_time = datetime.now() - timedelta(hours=2)
        entry = PathCacheEntry(
            items=[],
            expanded=True,
            last_fetched=old_time.isoformat()
        )

        assert entry.is_expired(ttl_seconds=3600)

    def test_path_cache_entry_invalid_timestamp(self):
        """Test entry with invalid timestamp is considered expired."""
        entry = PathCacheEntry(
            items=[],
            expanded=True,
            last_fetched="invalid-timestamp"
        )

        assert entry.is_expired(ttl_seconds=3600)


class TestSourceCache:
    """Test source cache functionality."""

    def test_source_cache_creation(self):
        """Test creating source cache."""
        cache = SourceCache.create("test-source-789")

        assert cache.source_id == "test-source-789"
        assert cache.active is True
        assert cache.tree_cache == {}
        assert cache.last_accessed is not None

    def test_source_cache_set_and_get_path_cache(self):
        """Test setting and getting path cache."""
        cache = SourceCache.create("test-source")
        items = [{'name': 'file1.txt', 'type': 'file'}]

        cache.set_path_cache("folder1", items, expanded=True)

        entry = cache.get_path_cache("folder1")
        assert entry is not None
        assert entry.items == items
        assert entry.expanded is True

    def test_source_cache_get_nonexistent_path(self):
        """Test getting cache for non-existent path."""
        cache = SourceCache.create("test-source")

        entry = cache.get_path_cache("nonexistent")
        assert entry is None

    def test_source_cache_get_expired_path(self):
        """Test getting expired cache entry."""
        cache = SourceCache.create("test-source")

        # Create expired entry manually
        old_time = datetime.now() - timedelta(hours=2)
        cache.tree_cache["expired"] = PathCacheEntry(
            items=[],
            expanded=True,
            last_fetched=old_time.isoformat()
        )

        # Should return None and remove expired entry
        entry = cache.get_path_cache("expired")
        assert entry is None
        assert "expired" not in cache.tree_cache

    def test_source_cache_expand_path(self):
        """Test expanding path with new items."""
        cache = SourceCache.create("test-source")
        items = [{'name': 'file1.txt', 'type': 'file'}]

        cache.expand_path("folder1", items)

        assert cache.is_path_expanded("folder1")
        entry = cache.get_path_cache("folder1")
        assert entry.items == items

    def test_source_cache_is_path_expanded(self):
        """Test checking if path is expanded."""
        cache = SourceCache.create("test-source")

        assert not cache.is_path_expanded("folder1")

        cache.set_path_cache("folder1", [], expanded=True)
        assert cache.is_path_expanded("folder1")

    def test_source_cache_clear(self):
        """Test clearing cache."""
        cache = SourceCache.create("test-source")
        cache.set_path_cache("folder1", [], expanded=True)
        cache.set_path_cache("folder2", [], expanded=True)

        cache.clear()

        assert cache.tree_cache == {}
        assert cache.get_path_cache("folder1") is None
        assert cache.get_path_cache("folder2") is None


class TestUnifiedSourceCache:
    """Test unified source cache manager."""

    def setup_method(self):
        """Set up test environment."""
        self.temp_dir = tempfile.mkdtemp()

    def teardown_method(self):
        """Clean up test environment."""
        import shutil
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    @patch('pathlib.Path.home')
    def test_unified_cache_creation(self, mock_home):
        """Test creating unified cache."""
        mock_home.return_value = Path(self.temp_dir)

        cache = UnifiedSourceCache("test-source-abc")
        assert cache.source_id == "test-source-abc"
        assert cache.cache_file.parent.exists()

    @patch('pathlib.Path.home')
    def test_unified_cache_store_and_retrieve(self, mock_home):
        """Test storing and retrieving data."""
        mock_home.return_value = Path(self.temp_dir)

        cache = UnifiedSourceCache("test-source-def")
        items = [
            {'name': 'file1.txt', 'type': 'file'},
            {'name': 'folder1', 'type': 'directory'}
        ]

        # Store data
        cache.cache_path_data("", items, expanded=True)

        # Retrieve data
        retrieved_items = cache.get_path_data("")
        assert retrieved_items == items

    @patch('pathlib.Path.home')
    def test_unified_cache_persistence(self, mock_home):
        """Test cache persists to disk."""
        mock_home.return_value = Path(self.temp_dir)

        items = [{'name': 'test.txt', 'type': 'file'}]

        # Create cache and store data
        cache1 = UnifiedSourceCache("test-source-ghi")
        cache1.cache_path_data("folder1", items)

        # Create new cache instance (should load from disk)
        cache2 = UnifiedSourceCache("test-source-ghi")
        retrieved_items = cache2.get_path_data("folder1")

        assert retrieved_items == items

    @patch('pathlib.Path.home')
    def test_unified_cache_is_path_cached(self, mock_home):
        """Test checking if path is cached."""
        mock_home.return_value = Path(self.temp_dir)

        cache = UnifiedSourceCache("test-source-jkl")

        assert not cache.is_path_cached("folder1")

        cache.cache_path_data("folder1", [])
        assert cache.is_path_cached("folder1")

    @patch('pathlib.Path.home')
    def test_unified_cache_activate_deactivate(self, mock_home):
        """Test source activation and deactivation."""
        mock_home.return_value = Path(self.temp_dir)

        cache = UnifiedSourceCache("test-source-mno")

        # Activate source
        cache.activate_source("json_tool")

        # Check global state
        state = SourceState.load()
        assert state.current_source == "test-source-mno"
        assert state.last_tool == "json_tool"

        # Deactivate source
        cache.deactivate_source()

        # Check global state cleared
        state = SourceState.load()
        assert state.current_source is None

    @patch('pathlib.Path.home')
    def test_unified_cache_clear_cache(self, mock_home):
        """Test clearing cache."""
        mock_home.return_value = Path(self.temp_dir)

        cache = UnifiedSourceCache("test-source-pqr")
        cache.cache_path_data("folder1", [{'name': 'file1.txt'}])
        cache.cache_path_data("folder2", [{'name': 'file2.txt'}])

        # Verify data exists
        assert cache.is_path_cached("folder1")
        assert cache.is_path_cached("folder2")

        # Clear cache
        cache.clear_cache()

        # Verify data cleared
        assert not cache.is_path_cached("folder1")
        assert not cache.is_path_cached("folder2")

    @patch('pathlib.Path.home')
    def test_unified_cache_delete_cache(self, mock_home):
        """Test deleting cache file."""
        mock_home.return_value = Path(self.temp_dir)

        cache = UnifiedSourceCache("test-source-stu")
        cache.cache_path_data("", [{'name': 'file1.txt'}])

        # Verify cache file exists
        assert cache.cache_file.exists()

        # Delete cache
        cache.delete_cache()

        # Verify cache file deleted
        assert not cache.cache_file.exists()

    @patch('pathlib.Path.home')
    def test_get_current_source_cache(self, mock_home):
        """Test getting current source cache."""
        mock_home.return_value = Path(self.temp_dir)

        # No current source
        cache = UnifiedSourceCache.get_current_source_cache("yaml_tool")
        assert cache is None

        # Set current source
        cache1 = UnifiedSourceCache("test-source-vwx")
        cache1.activate_source("json_tool")

        # Get current source from different tool
        cache2 = UnifiedSourceCache.get_current_source_cache("yaml_tool")
        assert cache2 is not None
        assert cache2.source_id == "test-source-vwx"

        # Check that tool was updated
        state = SourceState.load()
        assert state.last_tool == "yaml_tool"

    @patch('pathlib.Path.home')
    def test_cleanup_inactive_caches(self, mock_home):
        """Test cleanup of old inactive caches."""
        mock_home.return_value = Path(self.temp_dir)

        # Create active cache
        cache1 = UnifiedSourceCache("active-source")
        cache1.activate_source("json_tool")
        cache1.cache_path_data("", [])

        # Create inactive cache with old timestamp
        cache2 = UnifiedSourceCache("inactive-source")
        cache2.cache_path_data("", [])
        cache2.deactivate_source()

        # Manually set old timestamp on cache file
        old_time = time.time() - (25 * 3600)  # 25 hours ago
        os.utime(cache2.cache_file, (old_time, old_time))

        # Run cleanup
        UnifiedSourceCache.cleanup_inactive_caches(max_age_hours=24)

        # Active cache should remain
        assert cache1.cache_file.exists()
        # Inactive old cache should be removed
        assert not cache2.cache_file.exists()

    @patch('pathlib.Path.home')
    def test_unified_cache_corrupted_file_handling(self, mock_home):
        """Test handling of corrupted cache files."""
        mock_home.return_value = Path(self.temp_dir)

        cache = UnifiedSourceCache("test-source-xyz")

        # Create corrupted cache file
        cache.cache_file.parent.mkdir(parents=True, exist_ok=True)
        with open(cache.cache_file, 'w') as f:
            f.write("invalid json content")

        # Should create new cache when loaded
        loaded_cache = cache.get_cache()
        assert loaded_cache.source_id == "test-source-xyz"
        assert loaded_cache.tree_cache == {}

    @patch('pathlib.Path.home')
    def test_unified_cache_incremental_expansion(self, mock_home):
        """Test incremental cache expansion."""
        mock_home.return_value = Path(self.temp_dir)

        cache = UnifiedSourceCache("test-incremental")

        # Cache root directory
        root_items = [
            {'name': 'file1.txt', 'type': 'file'},
            {'name': 'folder1', 'type': 'directory'}
        ]
        cache.cache_path_data("", root_items)

        # Cache subdirectory
        sub_items = [
            {'name': 'subfile1.txt', 'type': 'file'},
            {'name': 'subfile2.txt', 'type': 'file'}
        ]
        cache.cache_path_data("folder1", sub_items)

        # Verify both are cached
        assert cache.get_path_data("") == root_items
        assert cache.get_path_data("folder1") == sub_items

        # Check cache structure on disk
        cache_data = cache.get_cache()
        assert "" in cache_data.tree_cache
        assert "folder1" in cache_data.tree_cache

    @patch('pathlib.Path.home')
    def test_unified_cache_concurrent_access(self, mock_home):
        """Test concurrent access to cache doesn't cause corruption."""
        mock_home.return_value = Path(self.temp_dir)

        # Simulate multiple cache instances accessing same source
        cache1 = UnifiedSourceCache("concurrent-test")
        cache2 = UnifiedSourceCache("concurrent-test")

        # Both cache different paths
        cache1.cache_path_data("path1", [{'name': 'file1.txt'}])
        cache2.cache_path_data("path2", [{'name': 'file2.txt'}])

        # Both should see each other's data after reload
        cache1._cache = None  # Force reload
        cache2._cache = None  # Force reload

        assert cache1.get_path_data("path2") == [{'name': 'file2.txt'}]
        assert cache2.get_path_data("path1") == [{'name': 'file1.txt'}]


class TestUnifiedCacheIntegration:
    """Integration tests for unified cache with pagination."""

    def setup_method(self):
        """Set up test environment."""
        self.temp_dir = tempfile.mkdtemp()

    def teardown_method(self):
        """Clean up test environment."""
        import shutil
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    @patch('pathlib.Path.home')
    def test_cache_integration_with_pagination(self, mock_home):
        """Test cache works correctly with pagination options."""
        mock_home.return_value = Path(self.temp_dir)

        cache = UnifiedSourceCache("pagination-test")

        # Cache large dataset
        items = []
        for i in range(100):
            items.append({
                'name': f'file_{i:03d}.txt',
                'type': 'file',
                'size': i * 1024
            })

        cache.cache_path_data("", items)

        # Verify all data is cached
        cached_items = cache.get_path_data("")
        assert len(cached_items) == 100
        assert cached_items == items

    @patch('pathlib.Path.home')
    def test_cache_cross_tool_sharing(self, mock_home):
        """Test cache sharing between different tools."""
        mock_home.return_value = Path(self.temp_dir)

        # JSON tool caches data
        json_cache = UnifiedSourceCache("shared-source")
        json_cache.activate_source("json_tool")
        json_cache.cache_path_data("", [{'name': 'data.json', 'type': 'file'}])

        # YAML tool accesses same source
        yaml_cache = UnifiedSourceCache.get_current_source_cache("yaml_tool")
        assert yaml_cache is not None
        assert yaml_cache.source_id == "shared-source"

        # Should see cached data
        cached_data = yaml_cache.get_path_data("")
        assert cached_data == [{'name': 'data.json', 'type': 'file'}]

        # Verify tool transition recorded
        state = SourceState.load()
        assert state.last_tool == "yaml_tool"

    @patch('pathlib.Path.home')
    def test_cache_refresh_behavior(self, mock_home):
        """Test cache refresh clears and reloads data."""
        mock_home.return_value = Path(self.temp_dir)

        cache = UnifiedSourceCache("refresh-test")

        # Initial cache
        cache.cache_path_data("", [{'name': 'old_file.txt'}])
        assert cache.get_path_data("") == [{'name': 'old_file.txt'}]

        # Simulate refresh by clearing cache
        cache.clear_cache()
        assert cache.get_path_data("") is None

        # New data after refresh
        cache.cache_path_data("", [{'name': 'new_file.txt'}])
        assert cache.get_path_data("") == [{'name': 'new_file.txt'}]


if __name__ == '__main__':
    pytest.main([__file__])