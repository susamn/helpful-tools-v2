"""
Validator management utilities for storing and loading validators.
"""

import json
import uuid
from pathlib import Path
from typing import Dict, List, Optional, Any

from .base import BaseValidator, ValidationError
from .factory import ValidatorFactory


class ValidatorManager:
    """
    Manages validators for sources, including storage and retrieval.
    """

    def __init__(self, config_dir: Optional[Path] = None):
        """
        Initialize validator manager.

        Args:
            config_dir: Base configuration directory (defaults to ~/.helpful-tools)
        """
        if config_dir is None:
            config_dir = Path.home() / '.helpful-tools'

        self.config_dir = Path(config_dir)
        self.sources_dir = self.config_dir / 'sources'
        self.sources_dir.mkdir(parents=True, exist_ok=True)

    def get_source_validator_dir(self, source_id: str) -> Path:
        """
        Get the validator directory for a specific source.

        Args:
            source_id: Source identifier

        Returns:
            Path to the source's validator directory
        """
        source_dir = self.sources_dir / source_id
        validator_dir = source_dir / 'validators'
        validator_dir.mkdir(parents=True, exist_ok=True)
        return validator_dir

    def save_validator(self, source_id: str, validator: BaseValidator) -> str:
        """
        Save a validator for a source.

        Args:
            source_id: Source identifier
            validator: Validator instance to save

        Returns:
            Path to the saved validator file
        """
        validator_dir = self.get_source_validator_dir(source_id)
        validator_file = validator_dir / f"{validator.validator_id}.json"

        # Prepare validator data for storage
        validator_data = {
            'validator_id': validator.validator_id,
            'name': validator.name,
            'type': validator.get_validator_type(),
            'config': validator.config,
            'created_at': validator.config.get('created_at'),
            'updated_at': validator.config.get('updated_at')
        }

        # Save schema content to separate file
        schema_file = validator_dir / f"{validator.validator_id}_schema.txt"
        schema_file.write_text(validator.schema_content, encoding='utf-8')

        # Save validator metadata
        validator_file.write_text(json.dumps(validator_data, indent=2), encoding='utf-8')

        return str(validator_file)

    def load_validator(self, source_id: str, validator_id: str) -> BaseValidator:
        """
        Load a validator for a source.

        Args:
            source_id: Source identifier
            validator_id: Validator identifier

        Returns:
            Loaded validator instance

        Raises:
            ValidationError: If validator cannot be loaded
        """
        validator_dir = self.get_source_validator_dir(source_id)
        validator_file = validator_dir / f"{validator_id}.json"
        schema_file = validator_dir / f"{validator_id}_schema.txt"

        if not validator_file.exists():
            raise ValidationError(f"Validator not found: {validator_id}")

        if not schema_file.exists():
            raise ValidationError(f"Validator schema file not found: {validator_id}")

        try:
            # Load validator metadata
            validator_data = json.loads(validator_file.read_text(encoding='utf-8'))

            # Load schema content
            schema_content = schema_file.read_text(encoding='utf-8')

            # Create validator instance
            return ValidatorFactory.create_validator(
                validator_type=validator_data['type'],
                validator_id=validator_data['validator_id'],
                name=validator_data['name'],
                schema_content=schema_content,
                config=validator_data.get('config', {})
            )

        except Exception as e:
            raise ValidationError(f"Failed to load validator {validator_id}: {str(e)}")

    def list_validators(self, source_id: str) -> List[Dict[str, Any]]:
        """
        List all validators for a source.

        Args:
            source_id: Source identifier

        Returns:
            List of validator metadata dictionaries
        """
        validator_dir = self.get_source_validator_dir(source_id)
        validators = []

        if not validator_dir.exists():
            return validators

        for validator_file in validator_dir.glob("*.json"):
            # Skip schema files
            if validator_file.name.endswith('_schema.txt'):
                continue

            try:
                validator_data = json.loads(validator_file.read_text(encoding='utf-8'))

                # Add file information
                validator_data['file_path'] = str(validator_file)
                validator_data['schema_file'] = str(validator_dir / f"{validator_data['validator_id']}_schema.txt")

                validators.append(validator_data)
            except Exception as e:
                # Skip corrupted validator files
                continue

        return sorted(validators, key=lambda x: x.get('name', ''))

    def delete_validator(self, source_id: str, validator_id: str) -> bool:
        """
        Delete a validator for a source.

        Args:
            source_id: Source identifier
            validator_id: Validator identifier

        Returns:
            True if validator was deleted, False if not found
        """
        validator_dir = self.get_source_validator_dir(source_id)
        validator_file = validator_dir / f"{validator_id}.json"
        schema_file = validator_dir / f"{validator_id}_schema.txt"

        deleted = False

        if validator_file.exists():
            validator_file.unlink()
            deleted = True

        if schema_file.exists():
            schema_file.unlink()
            deleted = True

        return deleted

    def validate_source_data(self, source_id: str, data: Any, validator_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Validate source data using configured validators.

        Args:
            source_id: Source identifier
            data: Data to validate
            validator_id: Specific validator to use (if None, use all validators)

        Returns:
            Dictionary with validation results
        """
        results = {
            'source_id': source_id,
            'validation_results': [],
            'overall_valid': True,
            'validator_count': 0
        }

        validators_to_use = []

        if validator_id:
            # Use specific validator
            try:
                validator = self.load_validator(source_id, validator_id)
                validators_to_use = [validator]
            except ValidationError as e:
                results['validation_results'].append({
                    'validator_id': validator_id,
                    'error': f"Failed to load validator: {str(e)}"
                })
                results['overall_valid'] = False
        else:
            # Use all validators for the source
            validator_list = self.list_validators(source_id)
            for validator_info in validator_list:
                try:
                    validator = self.load_validator(source_id, validator_info['validator_id'])
                    validators_to_use.append(validator)
                except ValidationError:
                    continue

        # Run validation with each validator
        for validator in validators_to_use:
            try:
                validation_result = validator.validate_data(data)
                result_dict = validation_result.to_dict()
                result_dict['validator_id'] = validator.validator_id
                result_dict['validator_name'] = validator.name
                result_dict['validator_type'] = validator.get_validator_type()

                results['validation_results'].append(result_dict)

                if not validation_result.is_valid:
                    results['overall_valid'] = False

                results['validator_count'] += 1

            except Exception as e:
                results['validation_results'].append({
                    'validator_id': validator.validator_id,
                    'validator_name': validator.name,
                    'validator_type': validator.get_validator_type(),
                    'error': f"Validation failed: {str(e)}",
                    'valid': False
                })
                results['overall_valid'] = False

        return results

    def create_validator_id(self) -> str:
        """
        Generate a unique validator ID.

        Returns:
            Unique validator identifier
        """
        return str(uuid.uuid4())[:8]