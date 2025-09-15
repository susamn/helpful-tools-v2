"""
JSON Schema validator implementation.
"""

import json
from typing import Any, Dict, Optional
try:
    import jsonschema
    from jsonschema import validate, ValidationError as JsonSchemaValidationError
    JSONSCHEMA_AVAILABLE = True
except ImportError:
    JSONSCHEMA_AVAILABLE = False

from .base import BaseValidator, ValidationResult, ValidationError


class JsonSchemaValidator(BaseValidator):
    """
    Validator for JSON Schema validation.

    Validates JSON data against JSON Schema specifications.
    """

    def __init__(self, validator_id: str, name: str, schema_content: str, config: Optional[Dict[str, Any]] = None):
        """Initialize JSON Schema validator."""
        if not JSONSCHEMA_AVAILABLE:
            raise ValidationError("jsonschema package is not installed. Please install it: pip install jsonschema")

        super().__init__(validator_id, name, schema_content, config)

    def _initialize_schema(self) -> None:
        """Initialize the JSON schema."""
        try:
            self._schema = json.loads(self.schema_content)
            # Validate that the schema itself is valid
            jsonschema.Draft7Validator.check_schema(self._schema)
        except json.JSONDecodeError as e:
            raise ValidationError(f"Invalid JSON in schema: {str(e)}")
        except jsonschema.SchemaError as e:
            raise ValidationError(f"Invalid JSON Schema: {str(e)}")

    def validate_data(self, data: Any) -> ValidationResult:
        """
        Validate data against the JSON schema.

        Args:
            data: The data to validate (dict, list, string, etc.)

        Returns:
            ValidationResult with validation outcome
        """
        result = ValidationResult(is_valid=True, errors=[], warnings=[])

        try:
            # Create validator instance
            validator = jsonschema.Draft7Validator(
                self._schema,
                format_checker=jsonschema.FormatChecker() if self.config.get('check_formats', True) else None
            )

            # Collect all validation errors
            errors = list(validator.iter_errors(data))

            if errors:
                result.is_valid = False
                for error in errors:
                    # Build a descriptive error message
                    path = " -> ".join(str(p) for p in error.absolute_path) if error.absolute_path else "root"
                    error_msg = f"At '{path}': {error.message}"
                    result.add_error(error_msg)

            # Add validation statistics
            result.details = {
                'schema_version': self._schema.get('$schema', 'unknown'),
                'error_count': len(errors),
                'validated_against': self.name
            }

        except Exception as e:
            result.add_error(f"Validation error: {str(e)}")

        return result

    def validate_string(self, data_string: str) -> ValidationResult:
        """
        Validate JSON string data.

        Args:
            data_string: JSON string to validate

        Returns:
            ValidationResult with validation outcome
        """
        try:
            data = json.loads(data_string)
            return self.validate_data(data)
        except json.JSONDecodeError as e:
            result = ValidationResult(is_valid=False, errors=[], warnings=[])
            result.add_error(f"Invalid JSON format: {str(e)}")
            return result

    def get_validator_type(self) -> str:
        """Return the validator type identifier."""
        return 'json_schema'

    def get_schema_info(self) -> Dict[str, Any]:
        """Get detailed schema information."""
        info = super().get_schema_info()

        if self._schema:
            info.update({
                'schema_version': self._schema.get('$schema', 'unknown'),
                'title': self._schema.get('title', ''),
                'description': self._schema.get('description', ''),
                'properties_count': len(self._schema.get('properties', {})),
                'required_fields': self._schema.get('required', [])
            })

        return info