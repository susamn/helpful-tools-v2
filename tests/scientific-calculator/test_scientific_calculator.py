#!/usr/bin/env python3
"""
Minimal test suite for Scientific Calculator - Basic smoke tests only
"""

import pytest
import requests
import json
import os

BASE_URL = os.environ.get('HELPFUL_TOOLS_BASE_URL', "http://localhost:8000")

class TestScientificCalculatorIntegration:
    """Test API integration and route accessibility"""
    
    def test_scientific_calculator_route_exists(self):
        """Test that scientific calculator route is accessible"""
        response = requests.get(f"{BASE_URL}/tools/scientific-calculator")
        assert response.status_code == 200
        assert "Scientific Calculator" in response.text
        assert "mathjs" in response.text  # Check math.js is included
    
    def test_main_dashboard_includes_calculator(self):
        """Test that calculator appears in main dashboard"""
        response = requests.get(f"{BASE_URL}/")
        assert response.status_code == 200
        assert "Scientific Calculator" in response.text
        assert "/tools/scientific-calculator" in response.text

class TestScientificCalculatorHistory:
    """Test history API endpoints for scientific calculator"""
    
    def test_history_api_endpoints(self):
        """Test history save and retrieve functionality"""
        # Test saving function to history
        test_data = {
            "data": json.dumps({"expression": "x^2 + 2*x + 1"}),
            "operation": "plot"
        }
        
        response = requests.post(f"{BASE_URL}/api/history/scientific-calculator", json=test_data)
        assert response.status_code == 200
        
        result = response.json()
        assert result["success"] is True
        assert "entry_id" in result
        
        # Test retrieving history
        response = requests.get(f"{BASE_URL}/api/history/scientific-calculator?limit=5")
        assert response.status_code == 200
        
        data = response.json()
        assert data["tool"] == "scientific-calculator"
        assert isinstance(data["history"], list)

if __name__ == '__main__':
    pytest.main([__file__, '-v', '-s'])