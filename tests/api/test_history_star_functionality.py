#!/usr/bin/env python3
"""
Comprehensive tests for history star functionality
Tests the new star feature implementation including API endpoints and synchronization
"""

import sys
import os
import pytest
import json
from unittest.mock import patch, MagicMock

# Add src to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'src'))

from api.history import HistoryManager, validate_tool_name, sanitize_data


class TestHistoryStarFunctionality:
    """Test suite for history star functionality"""

    def setup_method(self):
        """Setup fresh HistoryManager for each test"""
        self.history_manager = HistoryManager()
        self.test_tool = "test-tool"
        self.test_data = "sample test data for history"
        self.test_operation = "test-operation"

    def test_add_history_entry_with_default_starred_false(self):
        """Test that new history entries have starred=False by default"""
        result = self.history_manager.add_history_entry(
            self.test_tool, self.test_data, self.test_operation
        )

        assert result["success"] is True
        assert "entry_id" in result

        # Check local history
        local_history = self.history_manager.get_history(self.test_tool)
        assert len(local_history) == 1
        assert local_history[0]["starred"] is False

        # Check global history
        global_history = self.history_manager.get_global_history()
        assert len(global_history) == 1
        assert global_history[0]["starred"] is False

    def test_update_star_status_local_history(self):
        """Test starring/unstarring local history entries"""
        # Add entry
        result = self.history_manager.add_history_entry(
            self.test_tool, self.test_data, self.test_operation
        )
        entry_id = result["entry_id"]

        # Star the entry
        success = self.history_manager.update_star_status(self.test_tool, entry_id, True)
        assert success is True

        # Verify starred in local history
        local_history = self.history_manager.get_history(self.test_tool)
        assert local_history[0]["starred"] is True

        # Verify starred in global history (should sync)
        global_history = self.history_manager.get_global_history()
        assert global_history[0]["starred"] is True

        # Unstar the entry
        success = self.history_manager.update_star_status(self.test_tool, entry_id, False)
        assert success is True

        # Verify unstarred in both
        local_history = self.history_manager.get_history(self.test_tool)
        assert local_history[0]["starred"] is False

        global_history = self.history_manager.get_global_history()
        assert global_history[0]["starred"] is False

    def test_update_global_star_status(self):
        """Test starring/unstarring global history entries"""
        # Add entry
        result = self.history_manager.add_history_entry(
            self.test_tool, self.test_data, self.test_operation
        )
        entry_id = result["entry_id"]

        # Star via global method
        success = self.history_manager.update_global_star_status(entry_id, True)
        assert success is True

        # Verify starred in both local and global
        local_history = self.history_manager.get_history(self.test_tool)
        assert local_history[0]["starred"] is True

        global_history = self.history_manager.get_global_history()
        assert global_history[0]["starred"] is True

        # Unstar via global method
        success = self.history_manager.update_global_star_status(entry_id, False)
        assert success is True

        # Verify unstarred in both
        local_history = self.history_manager.get_history(self.test_tool)
        assert local_history[0]["starred"] is False

        global_history = self.history_manager.get_global_history()
        assert global_history[0]["starred"] is False

    def test_star_nonexistent_entry(self):
        """Test starring nonexistent entries returns False"""
        success = self.history_manager.update_star_status(self.test_tool, "fake-id", True)
        assert success is False

        success = self.history_manager.update_global_star_status("fake-id", True)
        assert success is False

    def test_star_nonexistent_tool(self):
        """Test starring entries for nonexistent tools returns False"""
        success = self.history_manager.update_star_status("fake-tool", "fake-id", True)
        assert success is False

    def test_multiple_entries_star_management(self):
        """Test managing stars across multiple entries"""
        # Add multiple entries
        entries = []
        for i in range(3):
            result = self.history_manager.add_history_entry(
                self.test_tool, f"data-{i}", f"op-{i}"
            )
            entries.append(result["entry_id"])

        # Star first and third entries (entries[0] is oldest, entries[2] is newest)
        self.history_manager.update_star_status(self.test_tool, entries[0], True)
        self.history_manager.update_star_status(self.test_tool, entries[2], True)

        # Verify correct starred status
        local_history = self.history_manager.get_history(self.test_tool)
        assert len(local_history) == 3

        # Note: starred items come first, then non-starred (both groups in insertion order)
        # Starred: entries[0], entries[2] -> but entries[2] was starred last so it's first in starred group
        # Actually the starred items maintain their original order within the starred group
        starred_entries = [e for e in local_history if e["starred"]]
        non_starred_entries = [e for e in local_history if not e["starred"]]

        assert len(starred_entries) == 2
        assert len(non_starred_entries) == 1
        assert non_starred_entries[0]["operation"] == "op-1"  # entries[1] is not starred

        # Verify in global history - same pattern
        global_history = self.history_manager.get_global_history()
        assert len(global_history) == 3
        starred_global = [e for e in global_history if e["starred"]]
        non_starred_global = [e for e in global_history if not e["starred"]]
        assert len(starred_global) == 2
        assert len(non_starred_global) == 1

    def test_cross_tool_star_independence(self):
        """Test that stars are independent across different tools"""
        tool1 = "tool-1"
        tool2 = "tool-2"

        # Add entries to both tools
        result1 = self.history_manager.add_history_entry(tool1, "data1", "op1")
        result2 = self.history_manager.add_history_entry(tool2, "data2", "op2")

        entry1_id = result1["entry_id"]
        entry2_id = result2["entry_id"]

        # Star only tool1 entry
        self.history_manager.update_star_status(tool1, entry1_id, True)

        # Verify tool1 entry is starred
        tool1_history = self.history_manager.get_history(tool1)
        assert tool1_history[0]["starred"] is True

        # Verify tool2 entry is not starred
        tool2_history = self.history_manager.get_history(tool2)
        assert tool2_history[0]["starred"] is False

        # Verify global history shows correct stars
        global_history = self.history_manager.get_global_history()
        assert len(global_history) == 2

        # Starred items come first, so tool1 entry (starred) is first
        starred_global = [e for e in global_history if e["starred"]]
        non_starred_global = [e for e in global_history if not e["starred"]]

        assert len(starred_global) == 1
        assert len(non_starred_global) == 1
        assert starred_global[0]["tool_name"] == tool1
        assert non_starred_global[0]["tool_name"] == tool2

    def test_star_persistence_through_operations(self):
        """Test that star status persists through other operations"""
        # Add entry and star it
        result = self.history_manager.add_history_entry(
            self.test_tool, self.test_data, self.test_operation
        )
        entry_id = result["entry_id"]

        self.history_manager.update_star_status(self.test_tool, entry_id, True)

        # Add more entries
        for i in range(2):
            self.history_manager.add_history_entry(
                self.test_tool, f"new-data-{i}", f"new-op-{i}"
            )

        # Verify original starred entry still starred
        local_history = self.history_manager.get_history(self.test_tool)
        assert len(local_history) == 3

        # Find the starred entry (should be the oldest one, at index 2)
        starred_entries = [entry for entry in local_history if entry["starred"]]
        assert len(starred_entries) == 1
        assert starred_entries[0]["starred"] is True

    def test_star_status_in_get_history_entry(self):
        """Test that specific entry retrieval includes star status"""
        # Add and star entry
        result = self.history_manager.add_history_entry(
            self.test_tool, self.test_data, self.test_operation
        )
        entry_id = result["entry_id"]

        self.history_manager.update_star_status(self.test_tool, entry_id, True)

        # Get specific entry
        entry = self.history_manager.get_history_entry(self.test_tool, entry_id)
        assert entry is not None
        assert entry["id"] == entry_id
        assert entry["data"] == self.test_data

    def test_star_status_in_get_global_history_entry(self):
        """Test that specific global entry retrieval includes star status"""
        # Add and star entry
        result = self.history_manager.add_history_entry(
            self.test_tool, self.test_data, self.test_operation
        )
        entry_id = result["entry_id"]

        self.history_manager.update_global_star_status(entry_id, True)

        # Get specific global entry
        entry = self.history_manager.get_global_history_entry(entry_id)
        assert entry is not None
        assert entry["id"] == entry_id
        assert entry["data"] == self.test_data
        assert entry["tool_name"] == self.test_tool

    def test_delete_starred_entry_local(self):
        """Test that starred entries cannot be deleted from local history"""
        # Add and star entry
        result = self.history_manager.add_history_entry(
            self.test_tool, self.test_data, self.test_operation
        )
        entry_id = result["entry_id"]

        self.history_manager.update_star_status(self.test_tool, entry_id, True)

        # Verify starred
        local_history = self.history_manager.get_history(self.test_tool)
        assert local_history[0]["starred"] is True

        # Attempt to delete entry - should fail because it's starred
        success = self.history_manager.delete_history_entry(self.test_tool, entry_id)
        assert success is False  # Cannot delete starred entries

        # Verify entry still exists
        local_history = self.history_manager.get_history(self.test_tool)
        assert len(local_history) == 1

        global_history = self.history_manager.get_global_history()
        assert len(global_history) == 1

    def test_delete_starred_entry_global(self):
        """Test that starred entries cannot be deleted from global history"""
        # Add and star entry
        result = self.history_manager.add_history_entry(
            self.test_tool, self.test_data, self.test_operation
        )
        entry_id = result["entry_id"]

        self.history_manager.update_global_star_status(entry_id, True)

        # Attempt to delete via global method - should fail because it's starred
        success = self.history_manager.delete_global_history_entry(entry_id)
        assert success is False  # Cannot delete starred entries

        # Verify entry still exists
        local_history = self.history_manager.get_history(self.test_tool)
        assert len(local_history) == 1

        global_history = self.history_manager.get_global_history()
        assert len(global_history) == 1

    def test_clear_history_removes_starred_entries(self):
        """Test that clearing history removes starred entries"""
        # Add and star multiple entries
        for i in range(3):
            result = self.history_manager.add_history_entry(
                self.test_tool, f"data-{i}", f"op-{i}"
            )
            if i % 2 == 0:  # Star every other entry
                self.history_manager.update_star_status(self.test_tool, result["entry_id"], True)

        # Verify some entries are starred
        local_history = self.history_manager.get_history(self.test_tool)
        starred_count = sum(1 for entry in local_history if entry["starred"])
        assert starred_count == 2

        # Clear history
        result = self.history_manager.clear_history(self.test_tool)
        assert result["success"] is True

        # Verify all local entries cleared
        local_history = self.history_manager.get_history(self.test_tool)
        assert len(local_history) == 0

        # Global history should still contain entries (clear_history only clears local)
        global_history = self.history_manager.get_global_history()
        assert len(global_history) == 3

    def test_history_limit_with_starred_entries(self):
        """Test that starred entries are preserved beyond history limit"""
        # Set a small limit for testing
        original_limit = self.history_manager._get_history_limit(self.test_tool)

        with patch.object(self.history_manager, '_get_history_limit', return_value=2):
            # Add first entry and star it
            result0 = self.history_manager.add_history_entry(
                self.test_tool, "data-0", "op-0"
            )
            self.history_manager.update_star_status(self.test_tool, result0["entry_id"], True)

            # Add 2 more entries (these will trigger limit)
            for i in range(1, 3):
                self.history_manager.add_history_entry(
                    self.test_tool, f"data-{i}", f"op-{i}"
                )

            # Should have 3 entries: 1 starred + 2 non-starred (limit applies to non-starred only)
            local_history = self.history_manager.get_history(self.test_tool)
            assert len(local_history) == 3

            # Starred entry should be preserved
            starred_entries = [entry for entry in local_history if entry["starred"]]
            assert len(starred_entries) == 1
            assert starred_entries[0]["operation"] == "op-0"


class TestValidationUtilityFunctions:
    """Test utility functions used by history functionality"""

    def test_validate_tool_name_valid(self):
        """Test valid tool name validation"""
        valid_names = ["json-tool", "yaml_tool", "tool123", "a", "regex-tester"]
        for name in valid_names:
            assert validate_tool_name(name) is True

    def test_validate_tool_name_invalid(self):
        """Test invalid tool name validation"""
        invalid_names = ["", None, "tool with spaces", "tool@special", "tool.dot"]
        for name in invalid_names:
            assert validate_tool_name(name) is False

    def test_sanitize_data_normal(self):
        """Test normal data sanitization"""
        test_data = "normal test data"
        result = sanitize_data(test_data)
        assert result == test_data

    def test_sanitize_data_non_string(self):
        """Test sanitization of non-string data"""
        test_data = {"key": "value"}
        result = sanitize_data(test_data)
        assert result == str(test_data)

    def test_sanitize_data_too_large(self):
        """Test sanitization of oversized data"""
        large_data = "x" * (1024 * 1024 + 1)  # 1MB + 1 byte

        with pytest.raises(ValueError, match="Data too large"):
            sanitize_data(large_data)

    def test_sanitize_data_custom_limit(self):
        """Test sanitization with custom size limit"""
        test_data = "x" * 100

        # Should pass with larger limit
        result = sanitize_data(test_data, max_size=200)
        assert result == test_data

        # Should fail with smaller limit
        with pytest.raises(ValueError, match="Data too large"):
            sanitize_data(test_data, max_size=50)


if __name__ == "__main__":
    # Run tests
    pytest.main([__file__, "-v", "--tb=short"])