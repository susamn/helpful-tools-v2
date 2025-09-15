"""
Integration tests for validators - test the actual working functionality.
"""
import json
import pytest
from src.validators.factory import ValidatorFactory
from src.validators.json_schema import JsonSchemaValidator
from src.validators.xml_schema import XmlSchemaValidator
from src.validators.regex import RegexValidator


class TestValidatorIntegration:
    """Test actual validator functionality with real examples."""

    def test_json_schema_validator_integration(self):
        """Test JSON Schema validator with real schema and data."""
        schema = {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "age": {"type": "number", "minimum": 0}
            },
            "required": ["name"]
        }

        validator = JsonSchemaValidator(
            validator_id="json-test",
            name="JSON Test",
            schema_content=json.dumps(schema)
        )

        # Test valid data
        valid_data = {"name": "John", "age": 30}
        result = validator.validate_data(valid_data)
        assert result.is_valid is True

        # Test invalid data
        invalid_data = {"age": 30}  # Missing required name
        result = validator.validate_data(invalid_data)
        assert result.is_valid is False
        assert len(result.errors) > 0

    def test_xml_schema_validator_integration(self):
        """Test XML Schema validator with real XSD and XML."""
        xsd_schema = '''<?xml version="1.0" encoding="UTF-8"?>
        <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
            <xs:element name="person">
                <xs:complexType>
                    <xs:sequence>
                        <xs:element name="name" type="xs:string"/>
                        <xs:element name="age" type="xs:int"/>
                    </xs:sequence>
                </xs:complexType>
            </xs:element>
        </xs:schema>'''

        validator = XmlSchemaValidator(
            validator_id="xml-test",
            name="XML Test",
            schema_content=xsd_schema
        )

        # Test valid XML
        valid_xml = '''<?xml version="1.0"?>
        <person>
            <name>John Doe</name>
            <age>30</age>
        </person>'''

        result = validator.validate_data(valid_xml)
        assert result.is_valid is True

        # Test invalid XML
        invalid_xml = '''<?xml version="1.0"?>
        <person>
            <name>John Doe</name>
        </person>'''  # Missing age

        result = validator.validate_data(invalid_xml)
        assert result.is_valid is False

    def test_regex_validator_integration(self):
        """Test Regex validator with real patterns."""
        email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'

        validator = RegexValidator(
            validator_id="regex-test",
            name="Email Validator",
            schema_content=email_pattern
        )

        # Test valid email
        result = validator.validate_data("test@example.com")
        assert result.is_valid is True

        # Test invalid email
        result = validator.validate_data("not-an-email")
        assert result.is_valid is False

    def test_factory_integration(self):
        """Test validator factory creates working validators."""
        # Test JSON Schema creation
        json_validator = ValidatorFactory.create_validator(
            validator_type="json_schema",
            validator_id="test",
            name="Test JSON",
            schema_content='{"type": "string"}',
            config={}
        )

        result = json_validator.validate_data("hello")
        assert result.is_valid is True

        result = json_validator.validate_data(123)
        assert result.is_valid is False

        # Test Regex creation
        regex_validator = ValidatorFactory.create_validator(
            validator_type="regex",
            validator_id="test",
            name="Test Regex",
            schema_content=r"\d+",
            config={}
        )

        result = regex_validator.validate_data("123")
        assert result.is_valid is True

        result = regex_validator.validate_data("abc")
        assert result.is_valid is False

    def test_factory_get_available_types(self):
        """Test that factory returns available types correctly."""
        types = ValidatorFactory.get_validator_types()

        assert len(types) >= 3
        type_names = [t['type'] for t in types]
        assert 'json_schema' in type_names
        assert 'xml_schema' in type_names
        assert 'regex' in type_names

        # All types should have required fields
        for validator_type in types:
            assert 'type' in validator_type
            assert 'name' in validator_type
            assert 'description' in validator_type
            assert 'available' in validator_type

    def test_validator_error_handling(self):
        """Test that validators handle errors gracefully."""
        # Test JSON Schema with invalid schema
        with pytest.raises(Exception):  # Should raise ValidationError
            JsonSchemaValidator("test", "Test", "invalid json")

        # Test XML Schema with invalid schema
        with pytest.raises(Exception):  # Should raise ValidationError
            XmlSchemaValidator("test", "Test", "invalid xsd")

        # Test Regex with invalid pattern
        with pytest.raises(Exception):  # Should raise ValidationError
            RegexValidator("test", "Test", "[unclosed")

    def test_complex_json_schema(self):
        """Test complex JSON Schema validation."""
        schema = {
            "type": "object",
            "properties": {
                "users": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "name": {"type": "string", "minLength": 1},
                            "email": {"type": "string", "format": "email"},
                            "age": {"type": "integer", "minimum": 0, "maximum": 150}
                        },
                        "required": ["name", "email"]
                    }
                }
            },
            "required": ["users"]
        }

        validator = JsonSchemaValidator(
            validator_id="complex-test",
            name="Complex JSON Test",
            schema_content=json.dumps(schema)
        )

        # Valid complex data
        valid_data = {
            "users": [
                {"name": "John", "email": "john@example.com", "age": 30},
                {"name": "Jane", "email": "jane@example.com", "age": 25}
            ]
        }

        result = validator.validate_data(valid_data)
        assert result.is_valid is True

        # Invalid complex data
        invalid_data = {
            "users": [
                {"name": "John", "age": 30}  # Missing email
            ]
        }

        result = validator.validate_data(invalid_data)
        assert result.is_valid is False

    def test_regex_with_config(self):
        """Test regex validator with configuration options."""
        pattern = "hello"
        config = {"ignore_case": True}

        validator = RegexValidator(
            validator_id="config-test",
            name="Config Test",
            schema_content=pattern,
            config=config
        )

        # Should match regardless of case
        assert validator.validate_data("hello").is_valid is True
        assert validator.validate_data("HELLO").is_valid is True
        assert validator.validate_data("Hello").is_valid is True

        # Without ignore_case config
        validator_case_sensitive = RegexValidator(
            validator_id="case-test",
            name="Case Test",
            schema_content=pattern,
            config={"ignore_case": False}
        )

        assert validator_case_sensitive.validate_data("hello").is_valid is True
        assert validator_case_sensitive.validate_data("HELLO").is_valid is False

    def test_all_validators_basic_functionality(self):
        """Test that all validator types have basic functionality."""
        validators = [
            ("json_schema", '{"type": "string"}', "test string", 123),
            ("regex", r"\d+", "123", "abc"),
            ("xml_schema", '''<?xml version="1.0"?>
                <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
                    <xs:element name="root" type="xs:string"/>
                </xs:schema>''', '<root>test</root>', '<invalid>xml</invalid>')
        ]

        for validator_type, schema, valid_data, invalid_data in validators:
            # Check if type is available by looking at get_validator_types
            types = ValidatorFactory.get_validator_types()
            type_info = next((t for t in types if t['type'] == validator_type), None)
            if not type_info or not type_info.get('available', False):
                pytest.skip(f"{validator_type} dependencies not available")

            validator = ValidatorFactory.create_validator(
                validator_type=validator_type,
                validator_id=f"test-{validator_type}",
                name=f"Test {validator_type}",
                schema_content=schema,
                config={}
            )

            # Test basic validator properties
            assert validator.validator_id == f"test-{validator_type}"
            assert validator.name == f"Test {validator_type}"
            assert validator.get_validator_type() == validator_type

            # Test validation
            valid_result = validator.validate_data(valid_data)
            assert valid_result.is_valid is True

            invalid_result = validator.validate_data(invalid_data)
            assert invalid_result.is_valid is False