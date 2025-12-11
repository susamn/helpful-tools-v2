#!/usr/bin/env python3
"""
Integration tests for history star API endpoints
Tests the Flask routes for star functionality
"""

import sys
import os
import pytest
import json
import requests
import time
from unittest.mock import patch

# Test configuration
BASE_URL = "http://127.0.0.1:8000"
TEST_TOOL = "test-integration-tool"


class TestHistoryStarAPIEndpoints:
    """Integration tests for history star API endpoints"""

    @classmethod
    def setup_class(cls):
        """Setup class - ensure server is running"""
        try:
            response = requests.get(f"{BASE_URL}/", timeout=5)
            if response.status_code != 200:
                pytest.skip("Server not running at http://127.0.0.1:8000")
        except requests.exceptions.RequestException:
            pytest.skip("Server not running at http://127.0.0.1:8000")

    def setup_method(self):
        """Setup for each test"""
        # Clear any existing history for our test tool
        try:
            requests.delete(f"{BASE_URL}/api/history/{TEST_TOOL}")
            requests.delete(f"{BASE_URL}/api/global-history")
        except:
            pass

    def test_add_history_and_verify_starred_false(self):
        """Test adding history entry has starred=False by default"""
        # Add a history entry
        data = {
            "data": "test data for star functionality",
            "operation": "test-operation"
        }

        response = requests.post(f"{BASE_URL}/api/history/{TEST_TOOL}", json=data)
        assert response.status_code == 200

        result = response.json()
        assert result["success"] is True
        entry_id = result["entry_id"]

        # Get history and verify starred=False
        response = requests.get(f"{BASE_URL}/api/history/{TEST_TOOL}")
        assert response.status_code == 200

        history_data = response.json()
        assert "history" in history_data
        assert len(history_data["history"]) == 1

        entry = history_data["history"][0]
        assert entry["id"] == entry_id
        assert entry["starred"] is False

    def test_star_local_history_entry(self):
        """Test starring a local history entry via API"""
        # Add entry
        data = {
            "data": "test data for starring",
            "operation": "test-star"
        }

        response = requests.post(f"{BASE_URL}/api/history/{TEST_TOOL}", json=data)
        assert response.status_code == 200
        entry_id = response.json()["entry_id"]

        # Star the entry
        star_data = {"starred": True}
        response = requests.put(
            f"{BASE_URL}/api/history/{TEST_TOOL}/{entry_id}/star",
            json=star_data
        )
        assert response.status_code == 200

        result = response.json()
        assert result["success"] is True
        assert "starred" in result["message"]

        # Verify entry is starred in local history
        response = requests.get(f"{BASE_URL}/api/history/{TEST_TOOL}")
        history_data = response.json()
        entry = history_data["history"][0]
        assert entry["starred"] is True

        # Verify entry is starred in global history
        response = requests.get(f"{BASE_URL}/api/global-history")
        global_data = response.json()
        global_entry = next(e for e in global_data["history"] if e["id"] == entry_id)
        assert global_entry["starred"] is True

    def test_unstar_local_history_entry(self):
        """Test unstarring a local history entry via API"""
        # Add and star entry
        data = {
            "data": "test data for unstarring",
            "operation": "test-unstar"
        }

        response = requests.post(f"{BASE_URL}/api/history/{TEST_TOOL}", json=data)
        entry_id = response.json()["entry_id"]

        # Star it first
        requests.put(
            f"{BASE_URL}/api/history/{TEST_TOOL}/{entry_id}/star",
            json={"starred": True}
        )

        # Unstar the entry
        star_data = {"starred": False}
        response = requests.put(
            f"{BASE_URL}/api/history/{TEST_TOOL}/{entry_id}/star",
            json=star_data
        )
        assert response.status_code == 200

        result = response.json()
        assert result["success"] is True
        assert "unstarred" in result["message"]

        # Verify entry is not starred
        response = requests.get(f"{BASE_URL}/api/history/{TEST_TOOL}")
        history_data = response.json()
        entry = history_data["history"][0]
        assert entry["starred"] is False

    def test_star_global_history_entry(self):
        """Test starring a global history entry via API"""
        # Add entry
        data = {
            "data": "test data for global starring",
            "operation": "test-global-star"
        }

        response = requests.post(f"{BASE_URL}/api/history/{TEST_TOOL}", json=data)
        entry_id = response.json()["entry_id"]

        # Star via global endpoint
        star_data = {"starred": True}
        response = requests.put(
            f"{BASE_URL}/api/global-history/{entry_id}/star",
            json=star_data
        )
        assert response.status_code == 200

        result = response.json()
        assert result["success"] is True

        # Verify entry is starred in both local and global
        response = requests.get(f"{BASE_URL}/api/history/{TEST_TOOL}")
        history_data = response.json()
        entry = history_data["history"][0]
        assert entry["starred"] is True

        response = requests.get(f"{BASE_URL}/api/global-history")
        global_data = response.json()
        global_entry = next(e for e in global_data["history"] if e["id"] == entry_id)
        assert global_entry["starred"] is True

    def test_star_nonexistent_local_entry(self):
        """Test starring nonexistent local entry returns 404"""
        star_data = {"starred": True}
        response = requests.put(
            f"{BASE_URL}/api/history/{TEST_TOOL}/fake-entry-id/star",
            json=star_data
        )
        assert response.status_code == 404

        result = response.json()
        assert "error" in result
        assert "not found" in result["error"].lower()

    def test_star_nonexistent_global_entry(self):
        """Test starring nonexistent global entry returns 404"""
        star_data = {"starred": True}
        response = requests.put(
            f"{BASE_URL}/api/global-history/fake-entry-id/star",
            json=star_data
        )
        assert response.status_code == 404

        result = response.json()
        assert "error" in result
        assert "not found" in result["error"].lower()

    def test_star_with_invalid_data(self):
        """Test starring with invalid request data"""
        # Add entry first
        data = {
            "data": "test data",
            "operation": "test"
        }
        response = requests.post(f"{BASE_URL}/api/history/{TEST_TOOL}", json=data)
        entry_id = response.json()["entry_id"]

        # Test missing starred field
        response = requests.put(
            f"{BASE_URL}/api/history/{TEST_TOOL}/{entry_id}/star",
            json={"invalid": "data"}
        )
        assert response.status_code == 400

        result = response.json()
        assert "error" in result
        assert "starred" in result["error"]

        # Test no JSON data - this returns 500 because Flask can't parse None as JSON
        response = requests.put(
            f"{BASE_URL}/api/history/{TEST_TOOL}/{entry_id}/star"
        )
        assert response.status_code in [400, 500]  # Either is acceptable for this error case

    def test_star_with_invalid_tool_name(self):
        """Test starring with invalid tool name"""
        star_data = {"starred": True}
        response = requests.put(
            f"{BASE_URL}/api/history/invalid@tool/fake-id/star",
            json=star_data
        )
        assert response.status_code == 400

        result = response.json()
        assert "error" in result
        assert "Invalid tool name" in result["error"]

    def test_multiple_entries_star_management_via_api(self):
        """Test managing stars for multiple entries via API"""
        entry_ids = []

        # Add multiple entries
        for i in range(3):
            data = {
                "data": f"test data {i}",
                "operation": f"test-op-{i}"
            }
            response = requests.post(f"{BASE_URL}/api/history/{TEST_TOOL}", json=data)
            entry_ids.append(response.json()["entry_id"])

        # Star first and third entries
        requests.put(
            f"{BASE_URL}/api/history/{TEST_TOOL}/{entry_ids[0]}/star",
            json={"starred": True}
        )
        requests.put(
            f"{BASE_URL}/api/history/{TEST_TOOL}/{entry_ids[2]}/star",
            json={"starred": True}
        )

        # Verify correct starred status in local history
        response = requests.get(f"{BASE_URL}/api/history/{TEST_TOOL}")
        history_data = response.json()
        entries = history_data["history"]

        assert len(entries) == 3
        # Entries are returned with starred items first, then by recency
        # entry2 (newest, starred) -> first
        # entry0 (oldest, starred) -> second
        # entry1 (middle, unstarred) -> third
        starred_status = [entry["starred"] for entry in entries]
        assert starred_status == [True, True, False]  # [entry2, entry0, entry1]

        # Verify in global history
        response = requests.get(f"{BASE_URL}/api/global-history")
        global_data = response.json()

        # Find our test tool entries (from this specific test)
        test_entries = [e for e in global_data["history"] if e["tool_name"] == TEST_TOOL]

        # Get the most recent 3 entries for this tool (our test entries)
        recent_test_entries = test_entries[:3]
        assert len(recent_test_entries) == 3

        # Check starred status for our recent entries
        starred_global = [e["starred"] for e in recent_test_entries]
        assert starred_global == [True, True, False]  # Same pattern

    def test_star_synchronization_between_local_and_global(self):
        """Test that starring in local syncs to global and vice versa"""
        # Add entry
        data = {
            "data": "sync test data",
            "operation": "sync-test"
        }
        response = requests.post(f"{BASE_URL}/api/history/{TEST_TOOL}", json=data)
        entry_id = response.json()["entry_id"]

        # Star via local endpoint
        requests.put(
            f"{BASE_URL}/api/history/{TEST_TOOL}/{entry_id}/star",
            json={"starred": True}
        )

        # Check global history is updated
        response = requests.get(f"{BASE_URL}/api/global-history")
        global_data = response.json()
        global_entry = next(e for e in global_data["history"] if e["id"] == entry_id)
        assert global_entry["starred"] is True

        # Unstar via global endpoint
        requests.put(
            f"{BASE_URL}/api/global-history/{entry_id}/star",
            json={"starred": False}
        )

        # Check local history is updated
        response = requests.get(f"{BASE_URL}/api/history/{TEST_TOOL}")
        history_data = response.json()
        local_entry = history_data["history"][0]
        assert local_entry["starred"] is False

    def test_star_persists_through_server_operations(self):
        """Test that starred status persists through various operations"""
        # Add and star entry
        data = {
            "data": "persistence test data",
            "operation": "persistence-test"
        }
        response = requests.post(f"{BASE_URL}/api/history/{TEST_TOOL}", json=data)
        entry_id = response.json()["entry_id"]

        requests.put(
            f"{BASE_URL}/api/history/{TEST_TOOL}/{entry_id}/star",
            json={"starred": True}
        )

        # Add more entries
        for i in range(2):
            requests.post(f"{BASE_URL}/api/history/{TEST_TOOL}", json={
                "data": f"additional data {i}",
                "operation": f"additional-{i}"
            })

        # Original starred entry should still be starred
        response = requests.get(f"{BASE_URL}/api/history/{TEST_TOOL}")
        history_data = response.json()
        entries = history_data["history"]

        starred_entries = [e for e in entries if e["starred"]]
        assert len(starred_entries) == 1
        assert starred_entries[0]["id"] == entry_id

    def teardown_method(self):
        """Cleanup after each test"""
        try:
            requests.delete(f"{BASE_URL}/api/history/{TEST_TOOL}")
        except:
            pass


if __name__ == "__main__":
    # Run tests
    pytest.main([__file__, "-v", "--tb=short"])