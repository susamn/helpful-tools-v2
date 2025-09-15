"""
Base validator interface and common validation types.
"""

from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional, Union
from dataclasses import dataclass
from pathlib import Path
import json


@dataclass
class ValidationResult:
    """Result of a validation operation."""

    is_valid: bool
    errors: List[str]
    warnings: List[str]
    details: Optional[Dict[str, Any]] = None

    def add_error(self, message: str) -> None:
        """Add an error message."""
        self.errors.append(message)
        self.is_valid = False

    def add_warning(self, message: str) -> None:
        """Add a warning message."""
        self.warnings.append(message)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for API responses."""
        return {
            'valid': self.is_valid,
            'errors': self.errors,
            'warnings': self.warnings,
            'details': self.details or {}
        }


class ValidationError(Exception):
    """Exception raised when validation configuration is invalid."""
    pass


class BaseValidator(ABC):
    """
    Base class for all data validators.

    Validators are responsible for validating data against a specific schema type
    (e.g., JSON Schema, XML Schema, etc.).
    """

    def __init__(self, validator_id: str, name: str, schema_content: str, config: Optional[Dict[str, Any]] = None):
        """
        Initialize the validator.

        Args:
            validator_id: Unique identifier for this validator instance
            name: Human-readable name for the validator
            schema_content: The validation schema content (JSON, XML, etc.)
            config: Additional configuration options
        """
        self.validator_id = validator_id
        self.name = name
        self.schema_content = schema_content
        self.config = config or {}
        self._schema = None
        self._initialize_schema()

    @abstractmethod
    def _initialize_schema(self) -> None:
        """
        Initialize the internal schema representation.
        Should be implemented by subclasses to parse and prepare the schema.
        """
        pass

    @abstractmethod
    def validate_data(self, data: Any) -> ValidationResult:
        """
        Validate data against the schema.

        Args:
            data: The data to validate (can be string, dict, list, etc.)

        Returns:
            ValidationResult with validation outcome
        """
        pass

    @abstractmethod
    def get_validator_type(self) -> str:
        """
        Return the type identifier for this validator.

        Returns:
            String identifier (e.g., 'json_schema', 'xml_schema')
        """
        pass

    def validate_string(self, data_string: str) -> ValidationResult:
        """
        Validate string data. Default implementation tries to parse as JSON.

        Args:
            data_string: String data to validate

        Returns:
            ValidationResult with validation outcome
        """
        try:
            # Try to parse as JSON first
            data = json.loads(data_string)
            return self.validate_data(data)
        except json.JSONDecodeError:
            # If not JSON, pass the raw string
            return self.validate_data(data_string)

    def validate_file(self, file_path: Union[str, Path]) -> ValidationResult:
        """
        Validate data from a file.

        Args:
            file_path: Path to the file to validate

        Returns:
            ValidationResult with validation outcome
        """
        try:
            file_path = Path(file_path)
            if not file_path.exists():
                result = ValidationResult(is_valid=False, errors=[], warnings=[])
                result.add_error(f"File does not exist: {file_path}")
                return result

            content = file_path.read_text(encoding='utf-8')
            return self.validate_string(content)

        except Exception as e:
            result = ValidationResult(is_valid=False, errors=[], warnings=[])
            result.add_error(f"Error reading file {file_path}: {str(e)}")
            return result

    def get_schema_info(self) -> Dict[str, Any]:
        """
        Get information about the validation schema.

        Returns:
            Dictionary with schema metadata
        """
        return {
            'validator_id': self.validator_id,
            'name': self.name,
            'type': self.get_validator_type(),
            'config': self.config,
            'schema_length': len(self.schema_content)
        }

    def to_dict(self) -> Dict[str, Any]:
        """
        Convert validator to dictionary for storage/serialization.

        Returns:
            Dictionary representation of the validator
        """
        return {
            'validator_id': self.validator_id,
            'name': self.name,
            'type': self.get_validator_type(),
            'schema_content': self.schema_content,
            'config': self.config
        }