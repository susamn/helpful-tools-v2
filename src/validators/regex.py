"""
Regular expression validator implementation.
"""

import re
from typing import Any, Dict, Optional, Pattern

from .base import BaseValidator, ValidationResult, ValidationError


class RegexValidator(BaseValidator):
    """
    Validator for regular expression pattern matching.

    Validates text data against regular expression patterns.
    """

    def __init__(self, validator_id: str, name: str, schema_content: str, config: Optional[Dict[str, Any]] = None):
        """Initialize regex validator."""
        super().__init__(validator_id, name, schema_content, config)

    def _initialize_schema(self) -> None:
        """Initialize the regex pattern."""
        try:
            flags = 0

            # Parse configuration flags
            if self.config.get('ignore_case', False):
                flags |= re.IGNORECASE
            if self.config.get('multiline', False):
                flags |= re.MULTILINE
            if self.config.get('dotall', False):
                flags |= re.DOTALL

            self._schema: Pattern = re.compile(self.schema_content, flags)
        except re.error as e:
            raise ValidationError(f"Invalid regular expression: {str(e)}")

    def validate_data(self, data: Any) -> ValidationResult:
        """
        Validate data against the regex pattern.

        Args:
            data: The data to validate (will be converted to string)

        Returns:
            ValidationResult with validation outcome
        """
        result = ValidationResult(is_valid=True, errors=[], warnings=[])

        try:
            # Convert data to string
            data_str = str(data)

            # Check if pattern matches
            match_type = self.config.get('match_type', 'search')  # 'search', 'match', 'fullmatch'

            if match_type == 'match':
                match_result = self._schema.match(data_str)
            elif match_type == 'fullmatch':
                match_result = self._schema.fullmatch(data_str)
            else:  # search (default)
                match_result = self._schema.search(data_str)

            # Determine validation outcome based on config
            expect_match = self.config.get('expect_match', True)

            if expect_match and not match_result:
                result.add_error(f"Data does not match pattern: {self.schema_content}")
            elif not expect_match and match_result:
                result.add_error(f"Data should not match pattern: {self.schema_content}")

            # Add match details
            if match_result:
                result.details = {
                    'matched_text': match_result.group(0),
                    'match_start': match_result.start(),
                    'match_end': match_result.end(),
                    'groups': match_result.groups(),
                    'pattern': self.schema_content,
                    'validated_against': self.name
                }
            else:
                result.details = {
                    'pattern': self.schema_content,
                    'validated_against': self.name,
                    'match_found': False
                }

        except Exception as e:
            result.add_error(f"Validation error: {str(e)}")

        return result

    def validate_string(self, data_string: str) -> ValidationResult:
        """
        Validate string data against regex pattern.

        Args:
            data_string: String to validate

        Returns:
            ValidationResult with validation outcome
        """
        return self.validate_data(data_string)

    def get_validator_type(self) -> str:
        """Return the validator type identifier."""
        return 'regex'

    def get_schema_info(self) -> Dict[str, Any]:
        """Get detailed regex information."""
        info = super().get_schema_info()

        info.update({
            'pattern': self.schema_content,
            'flags': {
                'ignore_case': self.config.get('ignore_case', False),
                'multiline': self.config.get('multiline', False),
                'dotall': self.config.get('dotall', False)
            },
            'match_type': self.config.get('match_type', 'search'),
            'expect_match': self.config.get('expect_match', True)
        })

        return info