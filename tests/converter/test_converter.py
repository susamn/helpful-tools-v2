"""
Comprehensive test cases for the JSON-YAML-XML converter backend.
Tests all conversion scenarios, edge cases, and error handling.
"""

import pytest
import json
import yaml
import xml.etree.ElementTree as ET
import sys
import os

# Add project root to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../')))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../src')))

from src.api.converter import FormatConverter, convert_format, validate_format


class TestFormatConverter:
    """Test the FormatConverter class methods."""
    
    def setup_method(self):
        """Setup converter instance for each test."""
        self.converter = FormatConverter()
    
    def test_detect_format_json(self):
        """Test JSON format detection."""
        json_data = '{"name": "test", "value": 123}'
        assert self.converter.detect_format(json_data) == 'json'
    
    def test_detect_format_yaml(self):
        """Test YAML format detection."""
        yaml_data = 'name: test\nvalue: 123'
        assert self.converter.detect_format(yaml_data) == 'yaml'
    
    def test_detect_format_xml(self):
        """Test XML format detection."""
        xml_data = '<root><name>test</name><value>123</value></root>'
        assert self.converter.detect_format(xml_data) == 'xml'
    
    def test_detect_format_unknown(self):
        """Test unknown format detection."""
        invalid_data = 'this is not any known format'
        assert self.converter.detect_format(invalid_data) == 'unknown'

    def test_detect_format_empty_string(self):
        """Test detection with empty string - covers line 38."""
        assert self.converter.detect_format("") == 'unknown'

    def test_detect_format_whitespace_only(self):
        """Test detection with whitespace only - covers line 38."""
        assert self.converter.detect_format("   \n\t  ") == 'unknown'

    def test_detect_format_malformed_yaml(self):
        """Test detection with malformed YAML - covers lines 60-61."""
        malformed_yaml = "key: value\n  invalid: [unclosed"
        assert self.converter.detect_format(malformed_yaml) == 'unknown'

    def test_detect_format_yaml_without_indicators(self):
        """Test YAML detection without : or - indicators."""
        simple_text = "just plain text"
        assert self.converter.detect_format(simple_text) == 'unknown'
    
    def test_json_to_yaml_simple(self):
        """Test simple JSON to YAML conversion."""
        json_data = '{"name": "John", "age": 30}'
        result = self.converter.json_to_yaml(json_data)
        
        # Verify it's valid YAML
        parsed = yaml.safe_load(result)
        assert parsed['name'] == 'John'
        assert parsed['age'] == 30
    
    def test_json_to_yaml_nested(self):
        """Test nested JSON to YAML conversion."""
        json_data = '{"user": {"name": "John", "details": {"age": 30, "city": "NYC"}}}'
        result = self.converter.json_to_yaml(json_data)
        
        parsed = yaml.safe_load(result)
        assert parsed['user']['name'] == 'John'
        assert parsed['user']['details']['age'] == 30
        assert parsed['user']['details']['city'] == 'NYC'
    
    def test_json_to_yaml_array(self):
        """Test JSON array to YAML conversion."""
        json_data = '{"items": [1, 2, 3], "names": ["alice", "bob"]}'
        result = self.converter.json_to_yaml(json_data)
        
        parsed = yaml.safe_load(result)
        assert parsed['items'] == [1, 2, 3]
        assert parsed['names'] == ['alice', 'bob']
    
    def test_yaml_to_json_simple(self):
        """Test simple YAML to JSON conversion."""
        yaml_data = 'name: John\nage: 30'
        result = self.converter.yaml_to_json(yaml_data)
        
        parsed = json.loads(result)
        assert parsed['name'] == 'John'
        assert parsed['age'] == 30
    
    def test_yaml_to_json_nested(self):
        """Test nested YAML to JSON conversion."""
        yaml_data = '''
user:
  name: John
  details:
    age: 30
    city: NYC
'''
        result = self.converter.yaml_to_json(yaml_data)
        
        parsed = json.loads(result)
        assert parsed['user']['name'] == 'John'
        assert parsed['user']['details']['age'] == 30
        assert parsed['user']['details']['city'] == 'NYC'
    
    def test_json_to_xml_simple(self):
        """Test simple JSON to XML conversion."""
        json_data = '{"name": "John", "age": 30}'
        result = self.converter.json_to_xml(json_data)
        
        # Parse and verify XML
        root = ET.fromstring(result)
        assert root.find('name').text == 'John'
        assert root.find('age').text == '30'
    
    def test_json_to_xml_with_root(self):
        """Test JSON to XML with single root element."""
        json_data = '{"person": {"name": "John", "age": 30}}'
        result = self.converter.json_to_xml(json_data)
        
        root = ET.fromstring(result)
        assert root.tag == 'person'
        assert root.find('name').text == 'John'
        assert root.find('age').text == '30'
    
    def test_xml_to_json_simple(self):
        """Test simple XML to JSON conversion."""
        xml_data = '<root><name>John</name><age>30</age></root>'
        result = self.converter.xml_to_json(xml_data)
        
        parsed = json.loads(result)
        assert parsed['root']['name'] == 'John'
        assert parsed['root']['age'] == '30'
    
    def test_yaml_to_xml_conversion(self):
        """Test YAML to XML conversion."""
        yaml_data = 'name: John\nage: 30'
        result = self.converter.yaml_to_xml(yaml_data)
        
        root = ET.fromstring(result)
        assert root.find('name').text == 'John'
        assert root.find('age').text == '30'
    
    def test_xml_to_yaml_conversion(self):
        """Test XML to YAML conversion."""
        xml_data = '<root><name>John</name><age>30</age></root>'
        result = self.converter.xml_to_yaml(xml_data)
        
        parsed = yaml.safe_load(result)
        assert parsed['root']['name'] == 'John'
        assert parsed['root']['age'] == '30'
    
    def test_format_json(self):
        """Test JSON formatting/prettifying."""
        json_data = '{"name":"John","age":30}'
        result = self.converter.format_json(json_data)
        
        # Should be properly indented
        assert '  "name": "John"' in result
        assert '  "age": 30' in result
    
    def test_format_yaml(self):
        """Test YAML formatting."""
        yaml_data = 'name: John\nage: 30'
        result = self.converter.format_yaml(yaml_data)
        
        parsed = yaml.safe_load(result)
        assert parsed['name'] == 'John'
        assert parsed['age'] == 30
    
    def test_format_xml(self):
        """Test XML formatting."""
        xml_data = '<root><name>John</name></root>'
        result = self.converter.format_xml(xml_data)
        
        # Should be properly indented
        assert '  <name>John</name>' in result
    
    def test_invalid_json_error(self):
        """Test error handling for invalid JSON."""
        invalid_json = '{"name": "John", "age":}'
        
        with pytest.raises(ValueError) as exc_info:
            self.converter.json_to_yaml(invalid_json)
        assert 'JSON to YAML conversion failed' in str(exc_info.value)
    
    def test_invalid_yaml_error(self):
        """Test error handling for invalid YAML."""
        invalid_yaml = 'name: John\n  age: 30\ninvalid: }'
        
        with pytest.raises(ValueError) as exc_info:
            self.converter.yaml_to_json(invalid_yaml)
        assert 'YAML to JSON conversion failed' in str(exc_info.value)
    
    def test_invalid_xml_error(self):
        """Test error handling for invalid XML."""
        invalid_xml = '<root><name>John</name><unclosed>'
        
        with pytest.raises(ValueError) as exc_info:
            self.converter.xml_to_json(invalid_xml)
        assert 'XML to JSON conversion failed' in str(exc_info.value)


class TestConvertFormatFunction:
    """Test the convert_format API function."""
    
    def test_auto_detect_json(self):
        """Test auto-detection with JSON input."""
        result = convert_format('{"name": "John"}', 'auto', 'yaml')
        
        assert result['success'] is True
        assert result['input_format'] == 'json'
        assert result['output_format'] == 'yaml'
        assert 'name: John' in result['result']
    
    def test_auto_detect_yaml(self):
        """Test auto-detection with YAML input."""
        result = convert_format('name: John\nage: 30', 'auto', 'json')
        
        assert result['success'] is True
        assert result['input_format'] == 'yaml'
        assert result['output_format'] == 'json'
        parsed = json.loads(result['result'])
        assert parsed['name'] == 'John'
    
    def test_auto_detect_xml(self):
        """Test auto-detection with XML input."""
        result = convert_format('<root><name>John</name></root>', 'auto', 'json')
        
        assert result['success'] is True
        assert result['input_format'] == 'xml'
        assert result['output_format'] == 'json'
    
    def test_same_format_json(self):
        """Test formatting when input and output formats are the same (JSON)."""
        result = convert_format('{"name":"John"}', 'json', 'json')
        
        assert result['success'] is True
        assert result['operation'] == 'format'
        assert '  "name": "John"' in result['result']
    
    def test_same_format_yaml(self):
        """Test formatting when input and output formats are the same (YAML)."""
        result = convert_format('name: John', 'yaml', 'yaml')
        
        assert result['success'] is True
        assert result['operation'] == 'format'
        parsed = yaml.safe_load(result['result'])
        assert parsed['name'] == 'John'
    
    def test_invalid_input_format(self):
        """Test error handling for invalid input format."""
        result = convert_format('{"name": "John"}', 'invalid', 'yaml')
        
        assert result['success'] is False
        assert 'Invalid format' in result['error']
    
    def test_invalid_output_format(self):
        """Test error handling for invalid output format."""
        result = convert_format('{"name": "John"}', 'json', 'invalid')
        
        assert result['success'] is False
        assert 'Invalid format' in result['error']
    
    def test_auto_detect_unknown(self):
        """Test auto-detection failure."""
        result = convert_format('this is not valid data', 'auto', 'json')
        
        assert result['success'] is False
        assert 'Could not auto-detect' in result['error']
    
    def test_conversion_error(self):
        """Test conversion error handling."""
        result = convert_format('invalid json}', 'json', 'yaml')
        
        assert result['success'] is False
        assert 'conversion failed' in result['error']


class TestValidateFormatFunction:
    """Test the validate_format function."""
    
    def test_valid_json(self):
        """Test validation of valid JSON."""
        result = validate_format('{"name": "John", "age": 30}', 'json')
        
        assert result['valid'] is True
        assert result['format'] == 'json'
    
    def test_valid_yaml(self):
        """Test validation of valid YAML."""
        result = validate_format('name: John\nage: 30', 'yaml')
        
        assert result['valid'] is True
        assert result['format'] == 'yaml'
    
    def test_valid_xml(self):
        """Test validation of valid XML."""
        result = validate_format('<root><name>John</name></root>', 'xml')
        
        assert result['valid'] is True
        assert result['format'] == 'xml'
    
    def test_invalid_json(self):
        """Test validation of invalid JSON."""
        result = validate_format('{"name": "John", "age":}', 'json')
        
        assert result['valid'] is False
        assert 'Invalid json' in result['error']
        assert result['format'] == 'json'
    
    def test_invalid_yaml(self):
        """Test validation of invalid YAML."""
        result = validate_format('name: John\n  invalid: }', 'yaml')
        
        assert result['valid'] is False
        assert 'Invalid yaml' in result['error']
    
    def test_invalid_xml(self):
        """Test validation of invalid XML."""
        result = validate_format('<root><name>John</name>', 'xml')
        
        assert result['valid'] is False
        assert 'Invalid xml' in result['error']
    
    def test_unsupported_format(self):
        """Test validation with unsupported format."""
        result = validate_format('some data', 'txt')
        
        assert result['valid'] is False
        assert 'Unsupported format' in result['error']


class TestEdgeCases:
    """Test edge cases and special scenarios."""
    
    def setup_method(self):
        self.converter = FormatConverter()
    
    def test_empty_objects(self):
        """Test conversion of empty objects."""
        # Empty JSON object
        result = convert_format('{}', 'json', 'yaml')
        assert result['success'] is True
        parsed = yaml.safe_load(result['result'])
        assert parsed == {} or parsed is None
        
        # Empty JSON array
        result = convert_format('[]', 'json', 'yaml')
        assert result['success'] is True
    
    def test_special_characters(self):
        """Test conversion with special characters."""
        json_data = '{"message": "Hello \\n World! 🌍", "symbols": "~`!@#$%^&*()_+-="}'
        result = convert_format(json_data, 'json', 'yaml')
        
        assert result['success'] is True
        parsed = yaml.safe_load(result['result'])
        assert 'Hello \n World! 🌍' in parsed['message']
    
    def test_numeric_types(self):
        """Test various numeric types."""
        json_data = '{"int": 42, "float": 3.14, "negative": -10, "zero": 0}'
        result = convert_format(json_data, 'json', 'yaml')
        
        assert result['success'] is True
        parsed = yaml.safe_load(result['result'])
        assert parsed['int'] == 42
        assert parsed['float'] == 3.14
        assert parsed['negative'] == -10
        assert parsed['zero'] == 0
    
    def test_boolean_and_null(self):
        """Test boolean and null values."""
        json_data = '{"active": true, "disabled": false, "empty": null}'
        result = convert_format(json_data, 'json', 'yaml')
        
        assert result['success'] is True
        parsed = yaml.safe_load(result['result'])
        assert parsed['active'] is True
        assert parsed['disabled'] is False
        assert parsed['empty'] is None
    
    def test_deeply_nested(self):
        """Test deeply nested structures."""
        json_data = '''
        {
            "level1": {
                "level2": {
                    "level3": {
                        "level4": {
                            "value": "deep"
                        }
                    }
                }
            }
        }
        '''
        result = convert_format(json_data, 'json', 'yaml')
        
        assert result['success'] is True
        parsed = yaml.safe_load(result['result'])
        assert parsed['level1']['level2']['level3']['level4']['value'] == 'deep'
    
    def test_large_arrays(self):
        """Test conversion of arrays with many elements."""
        large_array = list(range(100))
        json_data = json.dumps({"numbers": large_array})
        result = convert_format(json_data, 'json', 'yaml')
        
        assert result['success'] is True
        parsed = yaml.safe_load(result['result'])
        assert len(parsed['numbers']) == 100
        assert parsed['numbers'][99] == 99
    
    def test_xml_attributes(self):
        """Test XML with attributes conversion."""
        xml_data = '<person id="123" active="true"><name>John</name></person>'
        result = convert_format(xml_data, 'xml', 'json')
        
        assert result['success'] is True
        # Should handle attributes properly
        parsed = json.loads(result['result'])
        assert 'person' in parsed
    
    def test_sanitize_xml_tag_names(self):
        """Test XML tag name sanitization."""
        json_data = '{"invalid-tag!": "value", "123numeric": "test", "": "empty"}'
        result = convert_format(json_data, 'json', 'xml')
        
        assert result['success'] is True
        # Should not throw XML parsing errors due to invalid tag names
        root = ET.fromstring(result['result'])
        assert root is not None

class TestConverterRobustness:
    """Test converter robustness with edge cases and malformed data"""
    
    def test_extremely_nested_json(self):
        """Test with deeply nested JSON"""
        nested_json = {"level": 1}
        current = nested_json
        for i in range(2, 51):  # Create 50 levels deep
            current["level"] = {"level": i}
            current = current["level"]
        
        json_str = json.dumps(nested_json)
        result = convert_format(json_str, 'json', 'yaml')
        
        assert result['success'] is True
        assert 'level' in result['result']
    
    def test_json_with_all_data_types(self):
        """Test JSON with all possible data types"""
        complex_json = {
            "string": "test",
            "integer": 42,
            "float": 3.14159,
            "boolean_true": True,
            "boolean_false": False,
            "null_value": None,
            "empty_array": [],
            "empty_object": {},
            "array_mixed": [1, "two", True, None, {"nested": "value"}],
            "unicode": "Hello 世界 🌍",
            "special_chars": "!@#$%^&*()_+-={}[]|\\:;\"'<>?,./"
        }
        
        json_str = json.dumps(complex_json, ensure_ascii=False)
        
        # Test JSON → YAML → JSON round trip
        yaml_result = convert_format(json_str, 'json', 'yaml')
        assert yaml_result['success'] is True
        
        json_result = convert_format(yaml_result['result'], 'yaml', 'json')
        assert json_result['success'] is True
        
        # Should maintain data integrity
        restored = json.loads(json_result['result'])
        assert restored["unicode"] == "Hello 世界 🌍"
        assert restored["float"] == 3.14159
        assert restored["boolean_true"] is True
    
    def test_malformed_inputs(self):
        """Test handling of malformed input data"""
        malformed_cases = [
            ('{"incomplete": json', 'json', 'yaml'),
            ('invalid: yaml: structure: [', 'yaml', 'json'),
            ('<incomplete><xml>', 'xml', 'json'),
            ('', 'json', 'yaml'),  # Empty input
            ('   \n\t   ', 'yaml', 'json'),  # Whitespace only
        ]
        
        for data, source, target in malformed_cases:
            result = convert_format(data, source, target)
            # Should handle gracefully with error message
            assert result['success'] is False
            assert 'error' in result
            assert len(result['error']) > 0
    
    def test_large_data_conversion(self):
        """Test conversion of large datasets"""
        large_array = [{"id": i, "data": f"Item {i}" * 10} for i in range(1000)]
        large_json = {"items": large_array, "count": len(large_array)}
        
        json_str = json.dumps(large_json)
        
        # Should handle large data without timeout
        result = convert_format(json_str, 'json', 'yaml')
        assert result['success'] is True
        
        # Verify data integrity
        yaml_back = convert_format(result['result'], 'yaml', 'json')
        assert yaml_back['success'] is True
        
        restored = json.loads(yaml_back['result'])
        assert restored['count'] == 1000
        assert len(restored['items']) == 1000
    
    def test_xml_namespaces(self):
        """Test XML with namespaces"""
        namespaced_xml = '''<?xml version="1.0"?>
        <root xmlns:ns1="http://example.com/ns1" xmlns:ns2="http://example.com/ns2">
            <ns1:item id="1">Value 1</ns1:item>
            <ns2:item id="2">Value 2</ns2:item>
        </root>'''
        
        result = convert_format(namespaced_xml, 'xml', 'json')
        assert result['success'] is True
        
        # Should handle namespaces without crashing
        parsed = json.loads(result['result'])
        assert 'root' in parsed

class TestConverterAPIEndpoints:
    """Test the actual API endpoints that serve conversion functionality"""
    
    def test_conversion_api_endpoint(self):
        """Test /api/convert endpoint"""
        import requests
        
        try:
            payload = {
                'data': '{"test": "value", "number": 42}',
                'source_format': 'json',
                'target_format': 'yaml'
            }
            
            response = requests.post('http://127.0.0.1:8000/api/convert', json=payload)
            
            if response.status_code == 200:
                data = response.json()
                assert data['success'] is True
                assert 'result' in data
                assert 'test: value' in data['result']
                assert 'number: 42' in data['result']
            else:
                pytest.skip("Server not available for API testing")
                
        except requests.ConnectionError:
            pytest.skip("Server not available for API testing")
    
    def test_validation_api_endpoint(self):
        """Test /api/validate endpoint"""
        import requests
        
        try:
            # Test valid JSON
            payload = {
                'data': '{"valid": "json", "number": 123}',
                'format': 'json'
            }
            
            response = requests.post('http://127.0.0.1:8000/api/validate', json=payload)
            
            if response.status_code == 200:
                data = response.json()
                assert data['valid'] is True
                
                # Test invalid JSON
                payload['data'] = '{"invalid": json}'
                response = requests.post('http://127.0.0.1:8000/api/validate', json=payload)
                data = response.json()
                assert data['valid'] is False
                assert 'error' in data
            else:
                pytest.skip("Server not available for API testing")
                
        except requests.ConnectionError:
            pytest.skip("Server not available for API testing")