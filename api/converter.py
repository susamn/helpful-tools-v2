"""
Data format converter API using reliable Python libraries.
Handles conversion between JSON, YAML, and XML formats.
"""

import json
import yaml
import xml.etree.ElementTree as ET
import xmltodict
from typing import Dict, Any, Union
from xml.dom import minidom
import datetime


# Create a custom YAML loader that doesn't auto-convert dates to date objects
class StringLoader(yaml.SafeLoader):
    """Custom YAML loader that treats dates as strings."""
    pass

# Remove the implicit timestamp resolver so dates stay as strings
StringLoader.yaml_implicit_resolvers = {
    key: [resolver for resolver in resolvers if resolver[0] != 'tag:yaml.org,2002:timestamp']
    for key, resolvers in StringLoader.yaml_implicit_resolvers.items()
}


class FormatConverter:
    """Reliable format converter using established Python libraries."""
    
    def __init__(self):
        # Configure PyYAML to handle various data types properly
        self.yaml_loader = StringLoader
        self.yaml_dumper = yaml.SafeDumper
        
    def detect_format(self, data: str) -> str:
        """Detect the format of input data."""
        data = data.strip()
        if not data:
            return 'unknown'
        
        # Check for JSON first (most strict)
        try:
            json.loads(data)
            return 'json'
        except json.JSONDecodeError:
            pass
        
        # Check for XML
        try:
            ET.fromstring(data)
            return 'xml'
        except ET.ParseError:
            pass
        
        # Check for YAML (most permissive, so check last)
        try:
            yaml.load(data, Loader=self.yaml_loader)
            # Additional check to avoid false positives
            if ':' in data or '-' in data:
                return 'yaml'
        except yaml.YAMLError:
            pass
        
        return 'unknown'
    
    def json_to_yaml(self, json_str: str) -> str:
        """Convert JSON string to YAML string."""
        try:
            data = json.loads(json_str)
            return yaml.dump(data, default_flow_style=False, allow_unicode=True, sort_keys=False)
        except (json.JSONDecodeError, yaml.YAMLError) as e:
            raise ValueError(f"JSON to YAML conversion failed: {str(e)}")
    
    def yaml_to_json(self, yaml_str: str) -> str:
        """Convert YAML string to JSON string."""
        try:
            data = yaml.load(yaml_str, Loader=self.yaml_loader)
            return json.dumps(data, indent=2, ensure_ascii=False)
        except (yaml.YAMLError, TypeError) as e:
            raise ValueError(f"YAML to JSON conversion failed: {str(e)}")
    
    def json_to_xml(self, json_str: str, root_name: str = 'root') -> str:
        """Convert JSON string to XML string."""
        try:
            data = json.loads(json_str)
            
            # Handle the case where JSON has a single root key
            if isinstance(data, dict) and len(data) == 1:
                root_name = list(data.keys())[0]
                data = data[root_name]
            
            xml_str = self._dict_to_xml(data, root_name)
            
            # Pretty print the XML
            dom = minidom.parseString(xml_str)
            return dom.toprettyxml(indent="  ", encoding=None)
        except (json.JSONDecodeError, Exception) as e:
            raise ValueError(f"JSON to XML conversion failed: {str(e)}")
    
    def xml_to_json(self, xml_str: str) -> str:
        """Convert XML string to JSON string."""
        try:
            # Use xmltodict for reliable XML to dict conversion
            data = xmltodict.parse(xml_str)
            return json.dumps(data, indent=2, ensure_ascii=False)
        except Exception as e:
            raise ValueError(f"XML to JSON conversion failed: {str(e)}")
    
    def yaml_to_xml(self, yaml_str: str, root_name: str = 'root') -> str:
        """Convert YAML string to XML string."""
        try:
            # First convert YAML to JSON, then JSON to XML
            json_str = self.yaml_to_json(yaml_str)
            return self.json_to_xml(json_str, root_name)
        except ValueError as e:
            raise ValueError(f"YAML to XML conversion failed: {str(e)}")
    
    def xml_to_yaml(self, xml_str: str) -> str:
        """Convert XML string to YAML string."""
        try:
            # First convert XML to JSON, then JSON to YAML
            json_str = self.xml_to_json(xml_str)
            return self.json_to_yaml(json_str)
        except ValueError as e:
            raise ValueError(f"XML to YAML conversion failed: {str(e)}")
    
    def format_json(self, json_str: str) -> str:
        """Format/prettify JSON string."""
        try:
            data = json.loads(json_str)
            return json.dumps(data, indent=2, ensure_ascii=False)
        except json.JSONDecodeError as e:
            raise ValueError(f"JSON formatting failed: {str(e)}")
    
    def format_yaml(self, yaml_str: str) -> str:
        """Format/prettify YAML string."""
        try:
            data = yaml.load(yaml_str, Loader=self.yaml_loader)
            return yaml.dump(data, default_flow_style=False, allow_unicode=True, sort_keys=False)
        except yaml.YAMLError as e:
            raise ValueError(f"YAML formatting failed: {str(e)}")
    
    def format_xml(self, xml_str: str) -> str:
        """Format/prettify XML string."""
        try:
            dom = minidom.parseString(xml_str)
            return dom.toprettyxml(indent="  ", encoding=None)
        except Exception as e:
            raise ValueError(f"XML formatting failed: {str(e)}")
    
    def _dict_to_xml(self, data: Any, root_name: str) -> str:
        """Convert Python dict/list to XML string."""
        root = ET.Element(root_name)
        self._build_xml_element(root, data)
        return ET.tostring(root, encoding='unicode')
    
    def _build_xml_element(self, parent: ET.Element, data: Any):
        """Recursively build XML elements from Python data structures."""
        if isinstance(data, dict):
            for key, value in data.items():
                # Handle special XML attributes notation
                if key.startswith('@'):
                    parent.set(key[1:], str(value))
                elif key == '#text':
                    parent.text = str(value)
                else:
                    child = ET.SubElement(parent, self._sanitize_tag_name(str(key)))
                    self._build_xml_element(child, value)
        elif isinstance(data, list):
            for item in data:
                child = ET.SubElement(parent, 'item')
                self._build_xml_element(child, item)
        else:
            parent.text = str(data) if data is not None else ''
    
    def _sanitize_tag_name(self, name: str) -> str:
        """Sanitize string to be a valid XML tag name."""
        # Replace invalid characters with underscores
        sanitized = ''.join(c if c.isalnum() or c in '-_.' else '_' for c in name)
        
        # Ensure it starts with a letter or underscore
        if not sanitized or not (sanitized[0].isalpha() or sanitized[0] == '_'):
            sanitized = 'tag_' + sanitized
        
        return sanitized


# Global converter instance
converter = FormatConverter()


def convert_format(input_data: str, input_format: str, output_format: str) -> Dict[str, Any]:
    """
    Convert data between formats.
    
    Args:
        input_data: The input data string
        input_format: Source format ('json', 'yaml', 'xml', 'auto')
        output_format: Target format ('json', 'yaml', 'xml')
    
    Returns:
        Dict with 'success', 'result', and optional 'error' keys
    """
    try:
        # Auto-detect input format if needed
        if input_format == 'auto':
            input_format = converter.detect_format(input_data)
            if input_format == 'unknown':
                return {
                    'success': False,
                    'error': 'Could not auto-detect input format'
                }
        
        # Validate formats
        valid_formats = ['json', 'yaml', 'xml']
        if input_format not in valid_formats or output_format not in valid_formats:
            return {
                'success': False,
                'error': f'Invalid format. Supported: {valid_formats}'
            }
        
        # Handle same format (just prettify)
        if input_format == output_format:
            if input_format == 'json':
                result = converter.format_json(input_data)
            elif input_format == 'yaml':
                result = converter.format_yaml(input_data)
            elif input_format == 'xml':
                result = converter.format_xml(input_data)
            
            return {
                'success': True,
                'result': result,
                'input_format': input_format,
                'output_format': output_format,
                'operation': 'format'
            }
        
        # Convert between different formats
        conversion_map = {
            ('json', 'yaml'): converter.json_to_yaml,
            ('yaml', 'json'): converter.yaml_to_json,
            ('json', 'xml'): converter.json_to_xml,
            ('xml', 'json'): converter.xml_to_json,
            ('yaml', 'xml'): converter.yaml_to_xml,
            ('xml', 'yaml'): converter.xml_to_yaml,
        }
        
        conversion_func = conversion_map.get((input_format, output_format))
        if not conversion_func:
            return {
                'success': False,
                'error': f'Conversion from {input_format} to {output_format} not supported'
            }
        
        result = conversion_func(input_data)
        
        return {
            'success': True,
            'result': result,
            'input_format': input_format,
            'output_format': output_format,
            'operation': 'convert'
        }
        
    except ValueError as e:
        return {
            'success': False,
            'error': str(e)
        }
    except Exception as e:
        return {
            'success': False,
            'error': f'Unexpected error during conversion: {str(e)}'
        }


def validate_format(data: str, format_type: str) -> Dict[str, Any]:
    """
    Validate that data is in the specified format.
    
    Args:
        data: The data string to validate
        format_type: Expected format ('json', 'yaml', 'xml')
    
    Returns:
        Dict with 'valid', 'error' (if not valid), and optional metadata
    """
    try:
        if format_type == 'json':
            json.loads(data)
            return {'valid': True, 'format': 'json'}
        elif format_type == 'yaml':
            yaml.load(data, Loader=StringLoader)
            return {'valid': True, 'format': 'yaml'}
        elif format_type == 'xml':
            ET.fromstring(data)
            return {'valid': True, 'format': 'xml'}
        else:
            return {'valid': False, 'error': f'Unsupported format: {format_type}'}
            
    except (json.JSONDecodeError, yaml.YAMLError, ET.ParseError) as e:
        return {
            'valid': False,
            'error': f'Invalid {format_type}: {str(e)}',
            'format': format_type
        }
    except Exception as e:
        return {
            'valid': False,
            'error': f'Validation error: {str(e)}',
            'format': format_type
        }