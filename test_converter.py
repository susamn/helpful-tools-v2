"""
Comprehensive test cases for the JSON-YAML-XML converter backend.
Tests all conversion scenarios, edge cases, and error handling.
"""

import pytest
import json
import yaml
import xml.etree.ElementTree as ET
from api.converter import FormatConverter, convert_format, validate_format


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