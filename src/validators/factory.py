"""
Validator factory for creating validator instances.
"""

from typing import Dict, List, Type, Optional, Any

from .base import BaseValidator, ValidationError
from .json_schema import JsonSchemaValidator
from .xml_schema import XmlSchemaValidator
from .regex import RegexValidator


class ValidatorFactory:
    """
    Factory class for creating validator instances.
    """

    _validators: Dict[str, Type[BaseValidator]] = {
        'json_schema': JsonSchemaValidator,
        'xml_schema': XmlSchemaValidator,
        'regex': RegexValidator
    }

    @classmethod
    def register_validator(cls, validator_type: str, validator_class: Type[BaseValidator]) -> None:
        """
        Register a new validator type.

        Args:
            validator_type: String identifier for the validator type
            validator_class: Validator class that inherits from BaseValidator
        """
        cls._validators[validator_type] = validator_class

    @classmethod
    def get_validator_types(cls) -> List[Dict[str, str]]:
        """
        Get list of available validator types with descriptions.

        Returns:
            List of dictionaries with validator type information
        """
        type_info = []

        for validator_type, validator_class in cls._validators.items():
            # Try to get description from class docstring
            description = ""
            if validator_class.__doc__:
                # Get first line of docstring
                description = validator_class.__doc__.strip().split('\n')[0]

            type_info.append({
                'type': validator_type,
                'name': cls._get_type_display_name(validator_type),
                'description': description,
                'available': cls._check_validator_availability(validator_class)
            })

        return sorted(type_info, key=lambda x: x['name'])

    @classmethod
    def create_validator(cls, validator_type: str, validator_id: str, name: str,
                        schema_content: str, config: Optional[Dict[str, Any]] = None) -> BaseValidator:
        """
        Create a validator instance.

        Args:
            validator_type: Type of validator to create
            validator_id: Unique identifier for the validator
            name: Human-readable name for the validator
            schema_content: Schema content for validation
            config: Additional configuration options

        Returns:
            Validator instance

        Raises:
            ValidationError: If validator type is not supported or creation fails
        """
        if validator_type not in cls._validators:
            available_types = list(cls._validators.keys())
            raise ValidationError(f"Unsupported validator type: {validator_type}. Available types: {available_types}")

        validator_class = cls._validators[validator_type]

        try:
            return validator_class(validator_id, name, schema_content, config)
        except Exception as e:
            raise ValidationError(f"Failed to create {validator_type} validator: {str(e)}")

    @classmethod
    def _get_type_display_name(cls, validator_type: str) -> str:
        """Get user-friendly display name for validator type."""
        display_names = {
            'json_schema': 'JSON Schema',
            'xml_schema': 'XML Schema (XSD)',
            'regex': 'Regular Expression'
        }
        return display_names.get(validator_type, validator_type.title())

    @classmethod
    def _check_validator_availability(cls, validator_class: Type[BaseValidator]) -> bool:
        """Check if a validator type is available (dependencies installed)."""
        try:
            # Try to create a minimal instance to check dependencies
            test_validator = validator_class(
                validator_id='test',
                name='test',
                schema_content=cls._get_test_schema(validator_class),
                config={}
            )
            return True
        except ValidationError as e:
            # Check if error is due to missing dependencies
            if 'not installed' in str(e):
                return False
            return True
        except Exception:
            return True

    @classmethod
    def _get_test_schema(cls, validator_class: Type[BaseValidator]) -> str:
        """Get a minimal test schema for checking validator availability."""
        if validator_class.__name__ == 'JsonSchemaValidator':
            return '{"type": "object"}'
        elif validator_class.__name__ == 'XmlSchemaValidator':
            return '''<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
    <xs:element name="root" type="xs:string"/>
</xs:schema>'''
        elif validator_class.__name__ == 'RegexValidator':
            return r'.*'
        else:
            return ''


# Convenience functions
def get_validator_types() -> List[Dict[str, str]]:
    """Get list of available validator types."""
    return ValidatorFactory.get_validator_types()


def create_validator(validator_type: str, validator_id: str, name: str,
                    schema_content: str, config: Optional[Dict[str, Any]] = None) -> BaseValidator:
    """Create a validator instance."""
    return ValidatorFactory.create_validator(validator_type, validator_id, name, schema_content, config)