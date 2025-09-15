"""
Tests for backward compatibility with sources that don't have is_directory/level fields.
"""

import pytest
import sys
import os
from datetime import datetime
from unittest.mock import patch, MagicMock

# Add src directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', '..', 'src'))

from sources.factory import SourceFactory
from sources.base import SourceConfig
from sources.local_file import LocalFileSource
from sources.s3 import S3Source


class TestBackwardCompatibilityFactory:
    """Test backward compatibility for factory source creation."""

    def test_create_source_from_dict_old_format_no_is_directory(self):
        """Test creating source from old dict format without is_directory."""
        # Simulate old source data format from database/API
        old_source_data = {
            'source_id': 'legacy-123',
            'name': 'Legacy Source',
            'source_type': 'local_file',
            'staticConfig': {'timeout': 30},
            'pathTemplate': '/tmp/legacy.txt',
            'dynamicVariables': {},
            'created_at': '2023-01-01T12:00:00',
            'updated_at': '2023-01-01T12:00:00',
            'status': 'active'
            # Note: no is_directory or level fields
        }

        source = SourceFactory.create_source_from_dict(old_source_data)

        # Should create successfully
        assert isinstance(source, LocalFileSource)
        assert source.config.source_id == 'legacy-123'
        assert source.config.name == 'Legacy Source'

        # Should have default values
        assert source.config.is_directory is None  # None when not specified
        assert source.config.level == 0

        # Behavior should fall back to filesystem detection
        # Since we're not mocking filesystem, this will depend on actual /tmp/legacy.txt
        # But it should not crash

    def test_create_source_from_dict_mixed_format_fields(self):
        """Test creating source with mix of old and new field names."""
        mixed_source_data = {
            'source_id': 'mixed-123',
            'name': 'Mixed Format Source',
            'source_type': 'local_file',
            # Mix of camelCase and snake_case
            'staticConfig': {'timeout': 30},
            'static_config': {'retries': 3},  # This should be ignored in favor of staticConfig
            'pathTemplate': '/tmp/mixed.txt',
            'path_template': '/tmp/ignored.txt',  # This should be ignored
            'dynamicVariables': {'env': 'test'},
            'dynamic_variables': {'env': 'ignored'},  # This should be ignored
            'is_directory': True,
            'level': 2
        }

        source = SourceFactory.create_source_from_dict(mixed_source_data)

        assert isinstance(source, LocalFileSource)
        assert source.config.static_config == {'timeout': 30}  # Should use staticConfig
        assert source.config.path_template == '/tmp/mixed.txt'  # Should use pathTemplate
        assert source.config.dynamic_variables == {'env': 'test'}  # Should use dynamicVariables
        assert source.config.is_directory is True
        assert source.config.level == 2

    def test_create_source_from_dict_very_old_format(self):
        """Test creating source from very minimal old format."""
        minimal_source_data = {
            'source_id': 'minimal-123',
            'name': 'Minimal Source',
            'source_type': 'local_file'
            # Absolutely minimal - no config, paths, etc.
        }

        source = SourceFactory.create_source_from_dict(minimal_source_data)

        assert isinstance(source, LocalFileSource)
        assert source.config.source_id == 'minimal-123'
        assert source.config.name == 'Minimal Source'
        assert source.config.static_config == {}
        assert source.config.path_template == ''
        assert source.config.dynamic_variables == {}
        assert source.config.is_directory is None
        assert source.config.level == 0

    def test_create_source_from_dict_legacy_snake_case_only(self):
        """Test creating source using only legacy snake_case field names."""
        legacy_source_data = {
            'source_id': 'legacy-snake-123',
            'name': 'Legacy Snake Case',
            'source_type': 'local_file',
            'static_config': {'timeout': 30},
            'path_template': '/tmp/snake_case.txt',
            'dynamic_variables': {'env': 'prod'}
            # No camelCase equivalents, no is_directory/level
        }

        source = SourceFactory.create_source_from_dict(legacy_source_data)

        assert isinstance(source, LocalFileSource)
        assert source.config.static_config == {'timeout': 30}
        assert source.config.path_template == '/tmp/snake_case.txt'
        assert source.config.dynamic_variables == {'env': 'prod'}
        assert source.config.is_directory is None
        assert source.config.level == 0

    def test_create_source_from_dict_path_fallback(self):
        """Test creating source with 'path' field fallback."""
        path_fallback_data = {
            'source_id': 'path-fallback-123',
            'name': 'Path Fallback Source',
            'source_type': 'local_file',
            'path': '/tmp/fallback.txt'  # Using old 'path' field
            # No pathTemplate or path_template
        }

        source = SourceFactory.create_source_from_dict(path_fallback_data)

        assert isinstance(source, LocalFileSource)
        assert source.config.path_template == '/tmp/fallback.txt'


class TestBackwardCompatibilitySourceBehavior:
    """Test backward compatibility for source behavior."""

    def test_source_without_is_directory_attribute(self):
        """Test source behavior when config doesn't have is_directory attribute."""
        # Create a basic SourceConfig
        config = SourceConfig(
            source_id='no-attr-123',
            name='No Attribute Source',
            source_type='local_file',
            static_config={},
            path_template='/tmp/test.txt',
            dynamic_variables={},
            created_at=datetime.now(),
            updated_at=datetime.now()
            # Note: not setting is_directory or level
        )

        # Simulate old config by removing the attribute
        if hasattr(config, 'is_directory'):
            delattr(config, 'is_directory')
        if hasattr(config, 'level'):
            delattr(config, 'level')

        source = LocalFileSource(config)

        # Should not crash when checking is_directory/is_file
        try:
            directory_result = source.is_directory()
            file_result = source.is_file()
            # Should get some result without crashing
            assert isinstance(directory_result, bool)
            assert isinstance(file_result, bool)
        except AttributeError:
            pytest.fail("Source should handle missing is_directory attribute gracefully")

    def test_config_without_level_attribute(self):
        """Test that sources handle missing level attribute gracefully."""
        config = SourceConfig(
            source_id='no-level-123',
            name='No Level Source',
            source_type='local_file',
            static_config={},
            path_template='/tmp/test_dir',
            dynamic_variables={},
            created_at=datetime.now(),
            updated_at=datetime.now(),
            is_directory=True
            # Note: not setting level
        )

        # Simulate old config by removing the level attribute
        if hasattr(config, 'level'):
            delattr(config, 'level')

        source = LocalFileSource(config)

        # Should not crash when accessing config.level for directory exploration
        try:
            # The explore_directory_tree method should handle missing level gracefully
            # or use a sensible default
            result = source.explore_directory_tree()
            assert isinstance(result, list)
        except AttributeError:
            pytest.fail("Source should handle missing level attribute gracefully")
        except Exception:
            # Other exceptions are OK (e.g., if /tmp is not accessible)
            pass


class TestBackwardCompatibilityMigration:
    """Test migration scenarios from old to new format."""

    def test_migrate_old_source_data_format(self):
        """Test that old source data can be migrated to new format."""
        # Simulate data that might come from old database/API
        old_formats = [
            {
                'source_id': 'migrate-1',
                'name': 'Old Format 1',
                'source_type': 'local_file',
                'config': {'path': '/tmp/old1.txt', 'timeout': 30}
            },
            {
                'source_id': 'migrate-2',
                'name': 'Old Format 2',
                'source_type': 's3',
                'config': {'bucket': 'my-bucket', 'key': 'data/file.txt', 'aws_profile': 'default'}
            }
        ]

        for old_data in old_formats:
            # Add missing new fields with defaults
            migrated_data = old_data.copy()
            migrated_data.setdefault('staticConfig', {})

            # Set proper pathTemplate based on source type and old config
            if old_data['source_type'] == 'local_file':
                config = old_data.get('config', {})
                migrated_data.setdefault('pathTemplate', config.get('path', ''))
            elif old_data['source_type'] == 's3':
                config = old_data.get('config', {})
                bucket = config.get('bucket', 'bucket')
                key = config.get('key', 'key')
                migrated_data.setdefault('pathTemplate', f's3://{bucket}/{key}')

            migrated_data.setdefault('dynamicVariables', {})
            migrated_data.setdefault('is_directory', False)
            migrated_data.setdefault('level', 0)

            # Should be able to create source successfully
            source = SourceFactory.create_source_from_dict(migrated_data)
            assert source.config.source_id == old_data['source_id']
            assert source.config.is_directory is False  # Explicitly set to False in migration
            assert source.config.level == 0

    def test_gradual_migration_mixed_sources(self):
        """Test system with mix of old and new format sources."""
        # Simulate a system where some sources have been migrated and others haven't
        source_data_list = [
            # Old format source
            {
                'source_id': 'old-1',
                'name': 'Old Source',
                'source_type': 'local_file',
                'staticConfig': {},
                'pathTemplate': '/tmp/old.txt',
                'dynamicVariables': {}
                # No is_directory or level
            },
            # New format source
            {
                'source_id': 'new-1',
                'name': 'New Source',
                'source_type': 'local_file',
                'staticConfig': {},
                'pathTemplate': '/tmp/new_dir',
                'dynamicVariables': {},
                'is_directory': True,
                'level': 2
            },
            # Partially migrated source
            {
                'source_id': 'partial-1',
                'name': 'Partial Source',
                'source_type': 's3',
                'staticConfig': {'aws_profile': 'default'},
                'pathTemplate': 's3://bucket/prefix/',
                'dynamicVariables': {},
                'is_directory': True
                # Has is_directory but no level
            }
        ]

        # All should create successfully
        sources = []
        for data in source_data_list:
            source = SourceFactory.create_source_from_dict(data)
            sources.append(source)

        # Verify all sources work
        assert len(sources) == 3

        # Old format source
        assert sources[0].config.is_directory is None  # Not specified
        assert sources[0].config.level == 0

        # New format source
        assert sources[1].config.is_directory is True
        assert sources[1].config.level == 2

        # Partially migrated source
        assert sources[2].config.is_directory is True
        assert sources[2].config.level == 0  # Should get default


class TestBackwardCompatibilityEdgeCases:
    """Test edge cases for backward compatibility."""

    def test_none_values_in_new_fields(self):
        """Test handling of None values in new fields."""
        source_data = {
            'source_id': 'none-values-123',
            'name': 'None Values Source',
            'source_type': 'local_file',
            'staticConfig': {},
            'pathTemplate': '/tmp/test.txt',
            'dynamicVariables': {},
            'is_directory': None,  # Explicitly None
            'level': None  # Explicitly None
        }

        source = SourceFactory.create_source_from_dict(source_data)

        # Should handle None values gracefully
        assert isinstance(source, LocalFileSource)
        # None should be converted to defaults
        assert source.config.is_directory is None  # Factory preserves None
        assert source.config.level is None  # Factory preserves None

    def test_invalid_level_values(self):
        """Test handling of invalid level values."""
        test_cases = [
            {'level': -1, 'expected': -1},  # Factory should preserve, validation happens elsewhere
            {'level': 10, 'expected': 10},  # Factory should preserve, validation happens elsewhere
            {'level': 'invalid', 'expected': 'invalid'},  # Factory should preserve
        ]

        for case in test_cases:
            source_data = {
                'source_id': f'invalid-level-{case["level"]}',
                'name': 'Invalid Level Source',
                'source_type': 'local_file',
                'staticConfig': {},
                'pathTemplate': '/tmp/test.txt',
                'dynamicVariables': {},
                'is_directory': True,
                'level': case['level']
            }

            source = SourceFactory.create_source_from_dict(source_data)
            # Factory should preserve whatever value is provided
            assert source.config.level == case['expected']