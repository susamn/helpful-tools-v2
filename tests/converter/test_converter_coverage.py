"""
Additional test cases to improve coverage for converter.py
Tests focus on error handling and edge cases
"""

import pytest
import json
import yaml
import sys
import os

# Add project root to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../')))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../src')))

from src.api.converter import FormatConverter, convert_format


class TestConverterErrorHandling:
    """Test error handling paths to improve coverage."""

    def setup_method(self):
        """Setup converter instance for each test."""
        self.converter = FormatConverter()

    def test_json_to_xml_invalid_json(self):
        """Test JSON to XML with invalid JSON - covers lines 96-97."""
        invalid_json = '{"incomplete": json'
        with pytest.raises(ValueError, match="JSON to XML conversion failed"):
            self.converter.json_to_xml(invalid_json)

    def test_json_to_yaml_invalid_json(self):
        """Test JSON to YAML with invalid JSON - covers lines 114-115."""
        invalid_json = '{"incomplete": json'
        with pytest.raises(ValueError, match="JSON to YAML conversion failed"):
            self.converter.json_to_yaml(invalid_json)

    def test_yaml_to_json_invalid_yaml(self):
        """Test YAML to JSON with invalid YAML - covers lines 123-124."""
        invalid_yaml = "key: value\n  invalid: [unclosed"
        with pytest.raises(ValueError, match="YAML to JSON conversion failed"):
            self.converter.yaml_to_json(invalid_yaml)

    def test_yaml_to_xml_invalid_yaml(self):
        """Test YAML to XML with invalid YAML - covers lines 131-132."""
        invalid_yaml = "key: value\n  invalid: [unclosed"
        with pytest.raises(ValueError, match="YAML to XML conversion failed"):
            self.converter.yaml_to_xml(invalid_yaml)

    def test_xml_to_json_invalid_xml(self):
        """Test XML to JSON with invalid XML - covers lines 139-140."""
        invalid_xml = "<root><unclosed>data</root>"
        with pytest.raises(ValueError, match="XML to JSON conversion failed"):
            self.converter.xml_to_json(invalid_xml)

    def test_xml_to_yaml_invalid_xml(self):
        """Test XML to YAML with invalid XML - covers lines 147-148."""
        invalid_xml = "<root><unclosed>data</root>"
        with pytest.raises(ValueError, match="XML to YAML conversion failed"):
            self.converter.xml_to_yaml(invalid_xml)

    def test_format_json_invalid(self):
        """Test format JSON with invalid JSON - covers lines 162, 164."""
        invalid_json = '{"incomplete": json'
        with pytest.raises(ValueError, match="JSON formatting failed"):
            self.converter.format_json(invalid_json)

    def test_format_yaml_invalid(self):
        """Test format YAML with invalid YAML - covers lines 169-171."""
        invalid_yaml = "key: value\n  invalid: [unclosed"
        with pytest.raises(ValueError, match="YAML formatting failed"):
            self.converter.format_yaml(invalid_yaml)

    def test_format_xml_invalid(self):
        """Test format XML with invalid XML - covers lines 227-228."""
        invalid_xml = "<root><unclosed>data</root>"
        with pytest.raises(ValueError, match="XML formatting failed"):
            self.converter.format_xml(invalid_xml)


class TestConverterFunctionCoverage:
    """Test convert_format function to improve coverage."""

    def test_convert_unsupported_input_format(self):
        """Test convert with unsupported input format - covers lines 270-271."""
        result = convert_format("some data", "csv", "json")
        assert not result["success"]
        assert "Invalid format" in result["error"]

    def test_convert_unsupported_output_format(self):
        """Test convert with unsupported output format - covers lines 270-271."""
        result = convert_format('{"key": "value"}', "json", "csv")
        assert not result["success"]
        assert "Invalid format" in result["error"]

    def test_convert_general_exception(self):
        """Test convert function general exception handling - covers lines 307-308."""
        # Test with data that would cause a conversion error
        result = convert_format('invalid json', "json", "yaml")
        assert not result["success"]
        assert "error" in result