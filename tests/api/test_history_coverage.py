#!/usr/bin/env python3
"""
Additional tests for api/history.py to improve coverage from 84% to 85%+
Focuses on covering missing lines: 24-25, 88, 104, 122, 134, 148-159, etc.
"""

import sys
import os
import pytest
import json
import tempfile
from pathlib import Path
from unittest.mock import patch, mock_open, MagicMock

# Add src to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'src'))

from api.history import HistoryManager, validate_tool_name, sanitize_data


class TestHistoryCoverage:
    """Test suite to improve history.py coverage"""

    def setup_method(self):
        """Setup fresh HistoryManager for each test"""
        self.history_manager = HistoryManager()

    def test_load_config_with_existing_file(self):
        """Test _load_config when config.json exists - covers lines 24-25"""
        config_data = {
            "history_limits": {"test-tool": 50},
            "global_history_limit": 150
        }

        # Mock file existence and content
        with patch('pathlib.Path.exists', return_value=True):
            with patch('builtins.open', mock_open(read_data=json.dumps(config_data))):
                # Create new manager to trigger config loading
                manager = HistoryManager()
                assert manager.config["history_limits"]["test-tool"] == 50
                assert manager.config["global_history_limit"] == 150

    def test_load_config_without_file(self):
        """Test _load_config when config.json doesn't exist - covers line 26"""
        with patch('pathlib.Path.exists', return_value=False):
            manager = HistoryManager()
            assert manager.config == {"history_limits": {}}

    def test_global_history_limit_enforcement(self):
        """Test global history limit enforcement - covers line 88"""
        # Set up a history manager with a low global limit
        with patch('pathlib.Path.exists', return_value=True):
            config_data = {"global_history_limit": 2}
            with patch('builtins.open', mock_open(read_data=json.dumps(config_data))):
                manager = HistoryManager()

        # Add multiple entries to exceed the limit
        manager.add_history_entry("tool1", "data1", "op1")
        manager.add_history_entry("tool1", "data2", "op2")
        manager.add_history_entry("tool1", "data3", "op3")  # This should trigger limit enforcement

        # Global history should be trimmed to 2 entries
        assert len(manager.global_history) <= 2

    def test_get_history_with_limit_parameter(self):
        """Test get_history with limit parameter - covers line 104"""
        tool_name = "test-tool"

        # Add multiple entries
        manager = self.history_manager
        manager.add_history_entry(tool_name, "data1", "op1")
        manager.add_history_entry(tool_name, "data2", "op2")
        manager.add_history_entry(tool_name, "data3", "op3")

        # Get history with limit
        limited_history = manager.get_history(tool_name, limit=2)

        assert len(limited_history) == 2

    def test_get_history_entry_nonexistent_tool(self):
        """Test get_history_entry with nonexistent tool - covers line 122"""
        result = self.history_manager.get_history_entry("nonexistent-tool", "some-id")
        assert result is None

    def test_get_history_entry_nonexistent_entry(self):
        """Test get_history_entry with nonexistent entry ID - covers line 134"""
        tool_name = "test-tool"
        self.history_manager.add_history_entry(tool_name, "data1", "op1")

        result = self.history_manager.get_history_entry(tool_name, "nonexistent-id")
        assert result is None

    def test_update_star_status_nonexistent_tool(self):
        """Test update_star_status with nonexistent tool - returns False"""
        result = self.history_manager.update_star_status("nonexistent-tool", "some-id", True)
        assert result is False

    def test_update_star_status_nonexistent_entry(self):
        """Test update_star_status with nonexistent entry - returns False"""
        tool_name = "test-tool"
        self.history_manager.add_history_entry(tool_name, "data1", "op1")

        result = self.history_manager.update_star_status(tool_name, "nonexistent-id", True)
        assert result is False

    def test_delete_history_entry_nonexistent_tool(self):
        """Test delete_history_entry with nonexistent tool - returns False"""
        result = self.history_manager.delete_history_entry("nonexistent-tool", "some-id")
        assert result is False

    def test_delete_history_entry_nonexistent_entry(self):
        """Test delete_history_entry with nonexistent entry - returns False"""
        tool_name = "test-tool"
        self.history_manager.add_history_entry(tool_name, "data1", "op1")

        result = self.history_manager.delete_history_entry(tool_name, "nonexistent-id")
        assert result is False

    def test_clear_history_any_tool(self):
        """Test clear_history - always succeeds"""
        result = self.history_manager.clear_history("any-tool")
        assert result["success"] is True
        assert "History cleared" in result["message"]

    def test_clear_history_existing_tool(self):
        """Test clear_history with existing tool"""
        tool_name = "test-tool"
        self.history_manager.add_history_entry(tool_name, "data1", "op1")

        result = self.history_manager.clear_history(tool_name)
        assert result["success"] is True
        assert tool_name not in self.history_manager.history_data

    def test_get_global_history_empty(self):
        """Test get_global_history when no history exists - covers line 231"""
        # Fresh manager with no history
        manager = HistoryManager()
        result = manager.get_global_history()
        assert result == []

    def test_get_all_history_stats_empty(self):
        """Test get_all_history_stats with no history"""
        manager = HistoryManager()
        result = manager.get_all_history_stats()
        assert isinstance(result, dict)
        assert "total_entries" in result

    def test_validate_tool_name_edge_cases(self):
        """Test validate_tool_name with various edge cases - covers lines 281-283"""
        # Test None
        assert not validate_tool_name(None)

        # Test empty string
        assert not validate_tool_name("")

        # Test whitespace only
        assert not validate_tool_name("   ")

        # Test invalid characters
        assert not validate_tool_name("tool with spaces")
        assert not validate_tool_name("tool/with/slashes")
        assert not validate_tool_name("tool@with@symbols")

        # Test valid names
        assert validate_tool_name("valid-tool")
        assert validate_tool_name("valid_tool")
        assert validate_tool_name("validtool123")

    def test_sanitize_data_edge_cases(self):
        """Test sanitize_data with various data types and sizes"""
        # Test large data raises exception
        large_data = "x" * (1024 * 1024 + 1)  # Exceed 1MB limit
        with pytest.raises(ValueError, match="Data too large"):
            sanitize_data(large_data)

        # Test non-string data conversion
        assert sanitize_data(123) == "123"
        assert sanitize_data(None) == "None"
        assert sanitize_data([1, 2, 3]) == "[1, 2, 3]"

        # Test normal string
        normal_data = "test data"
        assert sanitize_data(normal_data) == "test data"

        # Test dictionary conversion
        test_dict = {"key": "value", "nested": {"inner": "data"}}
        sanitized = sanitize_data(test_dict)
        assert "key" in sanitized
        assert "value" in sanitized

    def test_history_manager_initialization_with_config(self):
        """Test HistoryManager initialization with custom config"""
        config_data = {
            "history_limits": {
                "json-tool": 30,
                "yaml-tool": 40
            },
            "global_history_limit": 200
        }

        with patch('pathlib.Path.exists', return_value=True):
            with patch('builtins.open', mock_open(read_data=json.dumps(config_data))):
                manager = HistoryManager()

                # Test that config is loaded properly
                assert manager._get_history_limit("json-tool") == 30
                assert manager._get_history_limit("yaml-tool") == 40
                assert manager._get_history_limit("unknown-tool") == 20  # default

    def test_tool_color_assignment(self):
        """Test tool color assignment and cycling"""
        manager = self.history_manager

        # Test color assignment for new tools
        tools = [f"tool{i}" for i in range(15)]  # More than available colors
        colors = []

        for tool in tools:
            color = manager._get_tool_color(tool)
            colors.append(color)

        # Should assign colors and cycle through them
        assert len(set(colors[:10])) == 10  # First 10 should be unique
        assert colors[10] == colors[0]  # Should cycle back to first color

    def test_format_date_method(self):
        """Test _format_date method with different timestamps"""
        manager = self.history_manager

        # Test with current timestamp
        import time
        current_time = time.time()
        formatted = manager._format_date(current_time)
        assert isinstance(formatted, str)
        assert len(formatted) > 0

        # Test with old timestamp (should include date)
        old_time = current_time - (24 * 60 * 60 * 2)  # 2 days ago
        formatted_old = manager._format_date(old_time)
        assert isinstance(formatted_old, str)
        assert len(formatted_old) > 0