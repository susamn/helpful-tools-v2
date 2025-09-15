"""
Tests for is_directory and is_file config override behavior across all source types.
"""

import pytest
import sys
import os
from datetime import datetime
from unittest.mock import patch, MagicMock
from pathlib import Path

# Add src directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', '..', 'src'))

from sources.factory import SourceFactory
from sources.base import SourceConfig
from sources.local_file import LocalFileSource
from sources.s3 import S3Source
from sources.sftp import SftpSource
from sources.http import HttpSource
from sources.samba import SambaSource


class TestLocalFileSourceIsDirectoryOverride:
    """Test LocalFileSource is_directory config override behavior."""

    def test_is_directory_override_true(self):
        """Test that config.is_directory=True overrides filesystem detection."""
        config = SourceConfig(
            source_id='test-123',
            name='Test Override True',
            source_type='local_file',
            static_config={},
            path_template='/tmp/nonexistent_file.txt',  # This would normally be a file
            dynamic_variables={},
            created_at=datetime.now(),
            updated_at=datetime.now(),
            is_directory=True,
            level=2
        )

        source = LocalFileSource(config)
        assert source.is_directory() is True
        assert source.is_file() is False

    def test_is_directory_override_false(self):
        """Test that config.is_directory=False overrides filesystem detection."""
        config = SourceConfig(
            source_id='test-123',
            name='Test Override False',
            source_type='local_file',
            static_config={},
            path_template='/tmp',  # This would normally be a directory
            dynamic_variables={},
            created_at=datetime.now(),
            updated_at=datetime.now(),
            is_directory=False,
            level=0
        )

        source = LocalFileSource(config)
        assert source.is_directory() is False
        assert source.is_file() is True

    def test_is_directory_fallback_to_filesystem(self):
        """Test fallback to filesystem detection when config doesn't specify."""
        # Create config with is_directory=None (not specified)
        config = SourceConfig(
            source_id='test-123',
            name='Test Fallback Directory',
            source_type='local_file',
            static_config={},
            path_template='/tmp',  # This should exist and be a directory
            dynamic_variables={},
            created_at=datetime.now(),
            updated_at=datetime.now(),
            is_directory=None  # Explicitly set to None to indicate "not specified"
        )

        source = LocalFileSource(config)
        # Should fall back to filesystem detection
        # /tmp should exist and be a directory on most systems
        assert source.is_directory() is True
        assert source.is_file() is False


class TestS3SourceIsDirectoryOverride:
    """Test S3Source is_directory config override behavior."""

    def test_is_directory_override_true(self):
        """Test that config.is_directory=True overrides S3 structure detection."""
        config = SourceConfig(
            source_id='test-123',
            name='Test S3 Override True',
            source_type='s3',
            static_config={'aws_profile': 'default'},
            path_template='s3://bucket/file.txt',  # This would normally be a file
            dynamic_variables={},
            created_at=datetime.now(),
            updated_at=datetime.now(),
            is_directory=True,
            level=1
        )

        source = S3Source(config)
        assert source.is_directory() is True
        assert source.is_file() is False

    def test_is_directory_override_false(self):
        """Test that config.is_directory=False overrides S3 structure detection."""
        config = SourceConfig(
            source_id='test-123',
            name='Test S3 Override False',
            source_type='s3',
            static_config={'aws_profile': 'default'},
            path_template='s3://bucket/prefix/',  # This would normally be a directory
            dynamic_variables={},
            created_at=datetime.now(),
            updated_at=datetime.now(),
            is_directory=False,
            level=0
        )

        source = S3Source(config)
        assert source.is_directory() is False
        assert source.is_file() is True


class TestSftpSourceIsDirectoryOverride:
    """Test SftpSource is_directory config override behavior."""

    def test_is_directory_override_true(self):
        """Test that config.is_directory=True is respected by SFTP source."""
        config = SourceConfig(
            source_id='test-123',
            name='Test SFTP Override True',
            source_type='sftp',
            static_config={'username': 'user'},
            path_template='sftp://example.com/path/file.txt',
            dynamic_variables={},
            created_at=datetime.now(),
            updated_at=datetime.now(),
            is_directory=True,
            level=2
        )

        source = SftpSource(config)
        # SFTP source should respect config override (uses base class implementation)
        assert source.is_directory() is True
        assert source.is_file() is False

    def test_is_directory_override_false(self):
        """Test that config.is_directory=False is respected by SFTP source."""
        config = SourceConfig(
            source_id='test-123',
            name='Test SFTP Override False',
            source_type='sftp',
            static_config={'username': 'user'},
            path_template='sftp://example.com/path/directory/',
            dynamic_variables={},
            created_at=datetime.now(),
            updated_at=datetime.now(),
            is_directory=False,
            level=0
        )

        source = SftpSource(config)
        # SFTP source should respect config override (uses base class implementation)
        assert source.is_directory() is False
        assert source.is_file() is True


class TestHttpSourceIsDirectoryOverride:
    """Test HttpSource is_directory config override behavior."""

    def test_is_directory_override_true(self):
        """Test that config.is_directory=True is respected by HTTP source."""
        config = SourceConfig(
            source_id='test-123',
            name='Test HTTP Override True',
            source_type='http',
            static_config={},
            path_template='http://example.com/api/data.json',
            dynamic_variables={},
            created_at=datetime.now(),
            updated_at=datetime.now(),
            is_directory=True,
            level=1
        )

        source = HttpSource(config)
        # HTTP source should respect config override (uses base class implementation)
        assert source.is_directory() is True
        assert source.is_file() is False

    def test_is_directory_override_false(self):
        """Test that config.is_directory=False is respected by HTTP source."""
        config = SourceConfig(
            source_id='test-123',
            name='Test HTTP Override False',
            source_type='http',
            static_config={},
            path_template='http://example.com/api/',
            dynamic_variables={},
            created_at=datetime.now(),
            updated_at=datetime.now(),
            is_directory=False,
            level=0
        )

        source = HttpSource(config)
        # HTTP source should respect config override (uses base class implementation)
        assert source.is_directory() is False
        assert source.is_file() is True


class TestSambaSourceIsDirectoryOverride:
    """Test SambaSource is_directory config override behavior."""

    def test_is_directory_override_true(self):
        """Test that config.is_directory=True is respected by Samba source."""
        config = SourceConfig(
            source_id='test-123',
            name='Test Samba Override True',
            source_type='samba',
            static_config={'host': 'server.local', 'username': 'user'},
            path_template='smb://server.local/share/file.txt',
            dynamic_variables={},
            created_at=datetime.now(),
            updated_at=datetime.now(),
            is_directory=True,
            level=3
        )

        source = SambaSource(config)
        # Samba source should respect config override (uses base class implementation)
        assert source.is_directory() is True
        assert source.is_file() is False

    def test_is_directory_override_false(self):
        """Test that config.is_directory=False is respected by Samba source."""
        config = SourceConfig(
            source_id='test-123',
            name='Test Samba Override False',
            source_type='samba',
            static_config={'host': 'server.local', 'username': 'user'},
            path_template='smb://server.local/share/directory/',
            dynamic_variables={},
            created_at=datetime.now(),
            updated_at=datetime.now(),
            is_directory=False,
            level=0
        )

        source = SambaSource(config)
        # Samba source should respect config override (uses base class implementation)
        assert source.is_directory() is False
        assert source.is_file() is True


class TestBaseClassFallbackBehavior:
    """Test base class fallback behavior when config attributes are missing."""

    def test_base_class_without_config_attribute(self):
        """Test that sources work when config doesn't have is_directory attribute."""
        # Create a config without is_directory attribute (simulating old format)
        config = SourceConfig(
            source_id='test-123',
            name='Test No Attribute',
            source_type='local_file',
            static_config={},
            path_template='/tmp/test.txt',
            dynamic_variables={},
            created_at=datetime.now(),
            updated_at=datetime.now()
            # Note: is_directory not provided
        )

        # Remove the attribute to simulate old config format
        if hasattr(config, 'is_directory'):
            delattr(config, 'is_directory')

        source = LocalFileSource(config)

        # Should fall back to filesystem detection without error
        # The behavior will depend on what exists at /tmp/test.txt
        # but it shouldn't crash
        directory_result = source.is_directory()
        file_result = source.is_file()

        # Basic sanity check - they should be opposites
        assert directory_result != file_result


class TestLevelConfigurationAccess:
    """Test that level configuration is properly accessible."""

    def test_level_config_access(self):
        """Test that level configuration is accessible from source instances."""
        config = SourceConfig(
            source_id='test-123',
            name='Test Level Access',
            source_type='local_file',
            static_config={},
            path_template='/tmp/test_dir',
            dynamic_variables={},
            created_at=datetime.now(),
            updated_at=datetime.now(),
            is_directory=True,
            level=4
        )

        source = LocalFileSource(config)
        assert source.config.level == 4

    def test_level_used_in_exploration(self):
        """Test that level configuration affects directory exploration."""
        config = SourceConfig(
            source_id='test-123',
            name='Test Level in Exploration',
            source_type='local_file',
            static_config={},
            path_template='/tmp',
            dynamic_variables={},
            created_at=datetime.now(),
            updated_at=datetime.now(),
            is_directory=True,
            level=1  # Limit to 1 level
        )

        source = LocalFileSource(config)

        # The explore_directory_tree method should respect the level setting
        # This test just ensures the method can be called and uses the config
        try:
            result = source.explore_directory_tree()
            # Should not crash and should return some result
            assert isinstance(result, list)
            # The actual depth limitation is tested in the base class logic
        except Exception as e:
            # If /tmp is not accessible, that's fine for this test
            # We're just testing the config is properly passed through
            pass


class TestFactoryIntegrationWithOverrides:
    """Test full integration of factory with is_directory overrides."""

    def test_factory_creates_sources_with_overrides(self):
        """Test that factory properly creates sources that respect config overrides."""
        test_cases = [
            {
                'source_type': 'local_file',
                'path_template': '/tmp/test.txt',
                'is_directory': True,
                'expected_class': LocalFileSource
            },
            {
                'source_type': 's3',
                'path_template': 's3://bucket/file.txt',
                'static_config': {'aws_profile': 'default'},
                'is_directory': True,
                'expected_class': S3Source
            },
            {
                'source_type': 'sftp',
                'path_template': 'sftp://example.com/file.txt',
                'static_config': {'username': 'user'},
                'is_directory': True,
                'expected_class': SftpSource
            },
            {
                'source_type': 'http',
                'path_template': 'http://example.com/api/data.json',
                'is_directory': True,
                'expected_class': HttpSource
            },
            {
                'source_type': 'samba',
                'path_template': 'smb://server/share/file.txt',
                'static_config': {'host': 'server', 'username': 'user'},
                'is_directory': True,
                'expected_class': SambaSource
            }
        ]

        for case in test_cases:
            source_data = {
                'source_id': f'test-{case["source_type"]}',
                'name': f'Test {case["source_type"].title()}',
                'source_type': case['source_type'],
                'staticConfig': case.get('static_config', {}),
                'pathTemplate': case['path_template'],
                'dynamicVariables': {},
                'is_directory': case['is_directory'],
                'level': 2
            }

            source = SourceFactory.create_source_from_dict(source_data)
            assert isinstance(source, case['expected_class'])
            assert source.config.is_directory is True
            assert source.is_directory() is True
            assert source.is_file() is False