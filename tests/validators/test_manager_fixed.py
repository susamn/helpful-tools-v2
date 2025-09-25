"""
Tests for validator manager functionality - corrected to match actual API.
"""

import json
import pytest
import shutil
import tempfile
from pathlib import Path
from unittest.mock import patch, mock_open

import sys
import os

# Add project root to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../')))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../src')))

from src.validators.manager import ValidatorManager
from src.validators.base import BaseValidator, ValidationError
from src.validators.json_schema import JsonSchemaValidator


class TestValidatorManager:
    """Test ValidatorManager class with actual API methods."""

    def setup_method(self):
        """Setup test with temporary directory."""
        self.temp_dir = Path(tempfile.mkdtemp())
        self.manager = ValidatorManager(config_dir=self.temp_dir)

    def teardown_method(self):
        """Clean up temporary directory."""
        if self.temp_dir.exists():
            shutil.rmtree(self.temp_dir)

    def test_init_default_config_dir(self):
        """Test initialization with default config directory."""
        manager = ValidatorManager()
        expected_path = Path.home() / '.helpful-tools'
        assert manager.config_dir == expected_path

    def test_init_custom_config_dir(self):
        """Test initialization with custom config directory."""
        custom_dir = Path("/tmp/custom")
        manager = ValidatorManager(config_dir=custom_dir)
        assert manager.config_dir == custom_dir

    def test_get_source_validator_dir(self):
        """Test getting source validator directory."""
        source_id = "test-source"
        expected_dir = self.temp_dir / 'sources' / source_id / 'validators'

        result_dir = self.manager.get_source_validator_dir(source_id)
        assert result_dir == expected_dir

    def test_save_validator(self):
        """Test saving a validator."""
        source_id = "test-source"

        # Create a test validator
        validator = JsonSchemaValidator(
            validator_id="test-validator",
            name="Test Validator",
            schema_content='{"type": "object"}'
        )

        # Save the validator
        saved_path = self.manager.save_validator(source_id, validator)
        assert saved_path.endswith("test-validator.json")

        # Check that the validator directory was created
        validator_dir = self.manager.get_source_validator_dir(source_id)
        assert validator_dir.exists()

        # Check that the validator file exists
        validator_file = validator_dir / "test-validator.json"
        assert validator_file.exists()

    def test_save_validator_file_error(self):
        """Test saving validator with file write error."""
        source_id = "test-source"
        validator_dir = self.manager.get_source_validator_dir(source_id)

        # Create directory but make it read-only
        validator_dir.mkdir(parents=True, exist_ok=True)
        validator_dir.chmod(0o444)

        validator = JsonSchemaValidator(
            validator_id="test-validator",
            name="Test Validator",
            schema_content='{"type": "object"}'
        )

        # Should handle the error gracefully
        with pytest.raises(Exception):
            self.manager.save_validator(source_id, validator)

    def test_load_validator(self):
        """Test loading a validator."""
        source_id = "test-source"

        # First save a validator
        validator = JsonSchemaValidator(
            validator_id="test-validator",
            name="Test Validator",
            schema_content='{"type": "object"}'
        )
        self.manager.save_validator(source_id, validator)

        # Then load it
        loaded_validator = self.manager.load_validator(source_id, "test-validator")
        assert loaded_validator is not None
        assert loaded_validator.validator_id == "test-validator"
        assert loaded_validator.name == "Test Validator"

    def test_load_validator_nonexistent(self):
        """Test loading non-existent validator."""
        with pytest.raises(ValidationError, match="Validator not found"):
            self.manager.load_validator("nonexistent-source", "nonexistent-validator")

    def test_list_validators(self):
        """Test listing validators for a source."""
        source_id = "test-source"

        # Initially should be empty
        validators = self.manager.list_validators(source_id)
        assert validators == []

        # Add a validator
        validator = JsonSchemaValidator(
            validator_id="test-validator",
            name="Test Validator",
            schema_content='{"type": "object"}'
        )
        self.manager.save_validator(source_id, validator)

        # Should now have one validator
        validators = self.manager.list_validators(source_id)
        assert len(validators) == 1
        assert validators[0]["validator_id"] == "test-validator"

    def test_delete_validator(self):
        """Test deleting a validator."""
        source_id = "test-source"

        # Save a validator first
        validator = JsonSchemaValidator(
            validator_id="test-validator",
            name="Test Validator",
            schema_content='{"type": "object"}'
        )
        self.manager.save_validator(source_id, validator)

        # Verify it exists
        validators = self.manager.list_validators(source_id)
        assert len(validators) == 1

        # Delete it
        result = self.manager.delete_validator(source_id, "test-validator")
        assert result is True

        # Verify it's gone
        validators = self.manager.list_validators(source_id)
        assert len(validators) == 0

    def test_delete_validator_nonexistent(self):
        """Test deleting non-existent validator."""
        result = self.manager.delete_validator("nonexistent-source", "nonexistent-validator")
        assert result is False

    def test_validate_source_data_with_validator(self):
        """Test validating source data with specific validator."""
        source_id = "test-source"

        # Create and save a JSON schema validator
        schema = {
            "type": "object",
            "properties": {
                "name": {"type": "string"}
            },
            "required": ["name"]
        }
        validator = JsonSchemaValidator(
            validator_id="json-validator",
            name="JSON Validator",
            schema_content=json.dumps(schema)
        )
        self.manager.save_validator(source_id, validator)

        # Test with valid data
        valid_data = {"name": "test"}
        result = self.manager.validate_source_data(source_id, valid_data, "json-validator")
        assert result["overall_valid"] is True
        assert len(result["validation_results"]) == 1
        assert result["validation_results"][0]["valid"] is True

        # Test with invalid data
        invalid_data = {"age": 25}  # missing required 'name'
        result = self.manager.validate_source_data(source_id, invalid_data, "json-validator")
        assert result["overall_valid"] is False
        assert len(result["validation_results"]) == 1
        assert result["validation_results"][0]["valid"] is False

    def test_validate_source_data_all_validators(self):
        """Test validating source data with all validators."""
        source_id = "test-source"

        # Create and save a JSON schema validator
        schema = {
            "type": "object",
            "properties": {
                "name": {"type": "string"}
            },
            "required": ["name"]
        }
        validator = JsonSchemaValidator(
            validator_id="json-validator",
            name="JSON Validator",
            schema_content=json.dumps(schema)
        )
        self.manager.save_validator(source_id, validator)

        # Test with valid data (no validator_id specified)
        valid_data = {"name": "test"}
        result = self.manager.validate_source_data(source_id, valid_data)
        assert "validation_results" in result
        assert len(result["validation_results"]) == 1
        assert result["validation_results"][0]["valid"] is True
        assert result["overall_valid"] is True

    def test_validate_source_data_no_validators(self):
        """Test validating source data with no validators."""
        result = self.manager.validate_source_data("empty-source", {"data": "test"})
        assert "validation_results" in result
        assert len(result["validation_results"]) == 0
        assert result["overall_valid"] is True
        assert result["validator_count"] == 0

    def test_validate_source_data_nonexistent_validator(self):
        """Test validating with non-existent validator."""
        result = self.manager.validate_source_data("test-source", {"data": "test"}, "nonexistent")
        assert result["overall_valid"] is False
        assert len(result["validation_results"]) == 1
        assert "error" in result["validation_results"][0]
        assert "Failed to load validator" in result["validation_results"][0]["error"]

    def test_create_validator_id(self):
        """Test creating unique validator ID."""
        id1 = self.manager.create_validator_id()
        id2 = self.manager.create_validator_id()

        assert id1 != id2
        assert len(id1) > 0
        assert len(id2) > 0