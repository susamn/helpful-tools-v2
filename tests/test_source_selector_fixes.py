#!/usr/bin/env python3
"""
Test script for source selector fixes.

This script tests the following issues that were fixed:
1. Directory/file type confusion when editing sources with dynamic parameters
2. Local file path validation discrepancies
3. HTTP URL source directory listing issues
4. Missing is_directory and level information when saving dynamic variables
"""

import pytest
import tempfile
import os
import json
import shutil
from unittest.mock import patch, MagicMock

# Assume we can import the main application and test utilities
import sys
sys.path.insert(0, '/home/susamn/dotfiles/workspace/tools/helpful-tools-v2/src')

from main import app, check_source_connection, convert_to_source_config


class TestSourceSelectorFixes:
    """Test class for source selector fixes."""

    def setup_method(self):
        """Set up test environment."""
        self.app = app.test_client()
        self.temp_dir = tempfile.mkdtemp()
        self.test_file = os.path.join(self.temp_dir, 'test.txt')
        self.test_dir = os.path.join(self.temp_dir, 'test_directory')

        # Create test file and directory
        with open(self.test_file, 'w') as f:
            f.write('test content')
        os.makedirs(self.test_dir, exist_ok=True)

    def teardown_method(self):
        """Clean up test environment."""
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_directory_file_type_preservation_with_dynamic_params(self):
        """Test that directory/file type is preserved when editing sources with dynamic parameters."""
        # Create a directory source with dynamic parameters
        source_data = {
            'id': 'test-dir-source',
            'name': 'Test Directory Source',
            'type': 'local_file',
            'staticConfig': {},
            'pathTemplate': f'{self.temp_dir}/$subdir',
            'dynamicVariables': {'subdir': 'test_directory'},
            'is_directory': True,
            'level': 2,
            'status': 'created',
            'created_at': '2024-01-01T00:00:00',
            'updated_at': '2024-01-01T00:00:00'
        }

        # Convert to SourceConfig
        source_config = convert_to_source_config(source_data)

        # Verify directory configuration is preserved
        assert source_config.is_directory == True
        assert source_config.level == 2

        # Test that when we simulate saving dynamic variables (like the frontend does),
        # the directory configuration is maintained
        updated_data = {
            'name': source_data['name'],
            'type': source_data['type'],
            'staticConfig': source_data['staticConfig'],
            'pathTemplate': source_data['pathTemplate'],
            'dynamicVariables': {'subdir': 'updated_directory'},
            'is_directory': source_data['is_directory'],
            'level': source_data['level']
        }

        updated_config = convert_to_source_config({**source_data, **updated_data})
        assert updated_config.is_directory == True
        assert updated_config.level == 2
        assert updated_config.dynamic_variables['subdir'] == 'updated_directory'

    def test_local_file_path_validation_consistency(self):
        """Test that local file path validation is consistent between test and fetch operations."""

        # Test 1: Valid directory source
        dir_source = {
            'id': 'test-dir',
            'name': 'Test Directory',
            'type': 'local_file',
            'config': {'path': self.test_dir},
            'is_directory': True,
            'level': 1
        }

        # Test connection should succeed with warnings for directory validation
        test_result = check_source_connection('local_file', dir_source['config'], dir_source)
        assert test_result['success'] == True
        # Should not have warnings since the directory exists
        assert 'Warning: Path is not a directory' not in test_result.get('message', '')

        # Test 2: File configured as directory (should warn)
        file_as_dir_source = {
            'id': 'test-file-as-dir',
            'name': 'Test File as Directory',
            'type': 'local_file',
            'config': {'path': self.test_file},
            'is_directory': True,
            'level': 1
        }

        test_result = check_source_connection('local_file', file_as_dir_source['config'], file_as_dir_source)
        assert test_result['success'] == True
        # Should warn about path issues (either not directory or path doesn't exist due to trailing slash)
        message = test_result.get('message', '')
        assert 'Warning:' in message and ('Path is not a directory' in message or 'Path does not exist' in message)

        # Test 3: Non-existent path (should warn)
        nonexistent_source = {
            'id': 'test-nonexistent',
            'name': 'Test Nonexistent',
            'type': 'local_file',
            'config': {'path': '/nonexistent/path'},
            'is_directory': True,
            'level': 1
        }

        test_result = check_source_connection('local_file', nonexistent_source['config'], nonexistent_source)
        # Connection test should either fail or warn about path
        message = test_result.get('message', '') + test_result.get('error', '')
        assert 'Path does not exist' in message

    def test_http_url_directory_listing_validation(self):
        """Test that HTTP URL sources properly validate directory listing capabilities."""

        # Test HTTP source configured as directory (should warn)
        http_dir_source = {
            'id': 'test-http-dir',
            'name': 'Test HTTP Directory',
            'type': 'http',
            'config': {'url': 'https://example.com/api'},
            'is_directory': True,
            'level': 1
        }

        test_result = check_source_connection('http', http_dir_source['config'], http_dir_source)
        # Should warn that HTTP doesn't support directory listing
        assert 'Warning: Source type \'http\' does not support directory listing but is configured as a directory' in test_result.get('message', '')

        # Test HTTP source configured as file (should not warn)
        http_file_source = {
            'id': 'test-http-file',
            'name': 'Test HTTP File',
            'type': 'http',
            'config': {'url': 'https://example.com/api/data.json'},
            'is_directory': False,
            'level': 0
        }

        test_result = check_source_connection('http', http_file_source['config'], http_file_source)
        # Should not warn about directory listing since it's configured as a file
        assert 'does not support directory listing' not in test_result.get('message', '')

    def test_dynamic_variables_preservation_in_edit(self):
        """Test that all source properties are preserved when editing dynamic variables."""

        # Simulate the frontend saveVariables payload structure
        original_source = {
            'id': 'test-dynamic',
            'name': 'Test Dynamic Source',
            'type': 's3',
            'staticConfig': {'aws_profile': 'default', 'region': 'us-east-1'},
            'pathTemplate': 's3://$bucket/$prefix/data.json',
            'dynamicVariables': {'bucket': 'my-bucket', 'prefix': 'raw'},
            'is_directory': False,
            'level': 0
        }

        # Simulate editing dynamic variables (like the frontend does)
        edit_payload = {
            'name': original_source['name'],
            'type': original_source['type'],
            'staticConfig': original_source['staticConfig'],
            'pathTemplate': original_source['pathTemplate'],
            'dynamicVariables': {'bucket': 'updated-bucket', 'prefix': 'processed'},
            'is_directory': original_source['is_directory'],
            'level': original_source['level']
        }

        # Convert and verify all properties are preserved
        updated_config = convert_to_source_config({**original_source, **edit_payload})

        assert updated_config.name == original_source['name']
        assert updated_config.source_type == original_source['type']
        assert updated_config.static_config == original_source['staticConfig']
        assert updated_config.path_template == original_source['pathTemplate']
        assert updated_config.dynamic_variables == edit_payload['dynamicVariables']
        assert updated_config.is_directory == original_source['is_directory']
        assert updated_config.level == original_source['level']

    def test_source_config_level_clamping(self):
        """Test that source level is properly clamped between 0 and 5."""

        # Test level clamping with various values
        test_cases = [
            (-1, 0),  # Negative should clamp to 0
            (0, 0),   # Zero should stay 0
            (3, 3),   # Normal value should stay
            (5, 5),   # Max value should stay
            (10, 5),  # Over max should clamp to 5
        ]

        for input_level, expected_level in test_cases:
            source_data = {
                'id': f'test-level-{input_level}',
                'name': 'Test Level',
                'type': 'local_file',
                'pathTemplate': '/test/path',
                'is_directory': True,
                'level': input_level
            }

            config = convert_to_source_config(source_data)
            assert config.level == expected_level, f"Level {input_level} should clamp to {expected_level}, got {config.level}"

    def test_non_directory_source_level_reset(self):
        """Test that level is reset to 0 for non-directory sources."""

        source_data = {
            'id': 'test-file-with-level',
            'name': 'Test File With Level',
            'type': 'local_file',
            'pathTemplate': '/test/file.txt',
            'is_directory': False,  # Not a directory
            'level': 3  # Should be ignored
        }

        config = convert_to_source_config(source_data)
        assert config.level == 0, "Level should be reset to 0 for non-directory sources"


def test_integration_with_api_endpoints():
    """Integration test with actual API endpoints."""
    app_client = app.test_client()

    # Test that the fixes work end-to-end through the API
    with tempfile.TemporaryDirectory() as temp_dir:
        test_dir = os.path.join(temp_dir, 'api_test_dir')
        os.makedirs(test_dir, exist_ok=True)

        # Create a source via API
        source_payload = {
            'name': 'API Test Source',
            'type': 'local_file',
            'staticConfig': {},
            'pathTemplate': temp_dir + '/$subdir',
            'dynamicVariables': {'subdir': 'api_test_dir'},
            'is_directory': True,
            'level': 1
        }

        # This should work through the main API without errors
        response = app_client.post('/api/sources',
                                 data=json.dumps(source_payload),
                                 content_type='application/json')

        assert response.status_code in [200, 201]  # Both OK and Created are valid
        result = json.loads(response.data)
        assert result['success'] == True

        source_id = result['source']['id']

        # Test the source
        test_response = app_client.post(f'/api/sources/{source_id}/test')
        assert test_response.status_code == 200
        test_result = json.loads(test_response.data)
        assert test_result['success'] == True

        # Update dynamic variables (should preserve directory settings)
        update_payload = {
            'name': source_payload['name'],
            'type': source_payload['type'],
            'staticConfig': source_payload['staticConfig'],
            'pathTemplate': source_payload['pathTemplate'],
            'dynamicVariables': {'subdir': 'updated_test_dir'},
            'is_directory': source_payload['is_directory'],
            'level': source_payload['level']
        }

        update_response = app_client.put(f'/api/sources/{source_id}',
                                       data=json.dumps(update_payload),
                                       content_type='application/json')

        assert update_response.status_code == 200
        update_result = json.loads(update_response.data)
        assert update_result['success'] == True

        # Verify the source still has directory configuration
        updated_source = update_result['source']
        assert updated_source['is_directory'] == True
        assert updated_source['level'] == 1
        assert updated_source['dynamicVariables']['subdir'] == 'updated_test_dir'


if __name__ == '__main__':
    pytest.main([__file__, '-v'])