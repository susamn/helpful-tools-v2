"""
Tests for new source API endpoints in main.py.
"""

import pytest
import sys
import os
import json
import tempfile
import shutil
from datetime import datetime
from pathlib import Path
from unittest.mock import patch, MagicMock

# Add src directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'src'))

# Import Flask app
from main import app
from sources.base import SourceConfig
from sources.local_file import LocalFileSource


class TestSourceAPIEndpoints:
    """Test new source API endpoints."""
    
    def setup_method(self):
        """Set up test environment."""
        self.app = app.test_client()
        self.app.testing = True
        
        # Create temporary directory structure
        self.temp_dir = tempfile.mkdtemp()
        self.test_file = os.path.join(self.temp_dir, 'test.txt')
        self.test_subdir = os.path.join(self.temp_dir, 'subdir')
        self.test_subfile = os.path.join(self.test_subdir, 'subfile.txt')
        
        # Create test files and directories
        with open(self.test_file, 'w') as f:
            f.write("Test file content\nSecond line")
        
        os.makedirs(self.test_subdir)
        with open(self.test_subfile, 'w') as f:
            f.write("Subfile content")
            
        # Create deeper structure for 2-level testing
        deep_dir = os.path.join(self.test_subdir, 'deeper')
        os.makedirs(deep_dir)
        with open(os.path.join(deep_dir, 'deep.txt'), 'w') as f:
            f.write("Deep file content")
        
        # Mock sources data
        self.mock_sources = {
            'file-source-1': {
                'id': 'file-source-1',
                'name': 'Test File Source',
                'type': 'local_file',
                'config': {'path': self.test_file},
                'pathTemplate': self.test_file,
                'dynamicVariables': {}
            },
            'dir-source-1': {
                'id': 'dir-source-1',
                'name': 'Test Directory Source',
                'type': 'local_file',
                'config': {'path': self.temp_dir},
                'pathTemplate': self.temp_dir,
                'dynamicVariables': {}
            },
            'nonexistent-source': {
                'id': 'nonexistent-source',
                'name': 'Nonexistent Source',
                'type': 'local_file',
                'config': {'path': '/nonexistent/path'},
                'pathTemplate': '/nonexistent/path',
                'dynamicVariables': {}
            }
        }
    
    def teardown_method(self):
        """Clean up test environment."""
        shutil.rmtree(self.temp_dir, ignore_errors=True)


class TestFetchSourceEndpoint(TestSourceAPIEndpoints):
    """Test /api/sources/<id>/fetch endpoint."""
    
    @patch('main.get_stored_sources')
    def test_fetch_file_source(self, mock_get_sources):
        """Test fetching from a file source."""
        mock_get_sources.return_value = self.mock_sources
        
        response = self.app.get('/api/sources/file-source-1/fetch')
        
        assert response.status_code == 200
        assert 'text/plain' in response.content_type
        assert b"Test file content" in response.data
        assert b"Second line" in response.data
    
    @patch('main.get_stored_sources')
    def test_fetch_directory_source(self, mock_get_sources):
        """Test fetching from a directory source."""
        mock_get_sources.return_value = self.mock_sources
        
        response = self.app.get('/api/sources/dir-source-1/fetch')
        
        assert response.status_code == 200
        assert response.content_type.startswith('application/json')
        
        data = json.loads(response.data)
        assert data['success'] is True
        assert data['type'] == 'directory'
        assert 'tree' in data
        assert 'base_path' in data
        
        # Check tree structure
        tree = data['tree']
        assert len(tree) >= 2  # Should have test.txt and subdir
        
        # Find test.txt in tree
        test_file_item = next((item for item in tree if item['name'] == 'test.txt'), None)
        assert test_file_item is not None
        assert test_file_item['is_directory'] is False
        assert test_file_item['size'] > 0
        
        # Find subdir in tree
        subdir_item = next((item for item in tree if item['name'] == 'subdir'), None)
        assert subdir_item is not None
        assert subdir_item['is_directory'] is True
        assert 'children' in subdir_item
        
        # Check subdir contents
        subdir_children = subdir_item['children']
        assert len(subdir_children) >= 1
        subfile_item = next((item for item in subdir_children if item['name'] == 'subfile.txt'), None)
        assert subfile_item is not None
        assert subfile_item['is_directory'] is False
    
    @patch('main.get_stored_sources')
    def test_fetch_nonexistent_source(self, mock_get_sources):
        """Test fetching from a non-existent source."""
        mock_get_sources.return_value = self.mock_sources
        
        response = self.app.get('/api/sources/nonexistent-source/fetch')
        
        # Could be 400 if path validation fails or 500 if source creation fails
        assert response.status_code in [400, 500]
        data = json.loads(response.data)
        assert data['success'] is False
        assert 'error' in data
    
    @patch('main.get_stored_sources')
    def test_fetch_source_not_found(self, mock_get_sources):
        """Test fetching from unknown source ID."""
        mock_get_sources.return_value = self.mock_sources
        
        response = self.app.get('/api/sources/unknown-source/fetch')
        
        assert response.status_code == 404
        data = json.loads(response.data)
        assert data['success'] is False
        assert data['error'] == 'Source not found'


class TestBrowseSourceEndpoint(TestSourceAPIEndpoints):
    """Test /api/sources/<id>/browse endpoint."""
    
    @patch('main.get_stored_sources')
    def test_browse_directory_source(self, mock_get_sources):
        """Test browsing a directory source."""
        mock_get_sources.return_value = self.mock_sources
        
        response = self.app.get('/api/sources/dir-source-1/browse')
        
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['success'] is True
        assert 'tree' in data
        assert 'base_path' in data
        assert 'current_path' in data
        
        # Check tree structure
        tree = data['tree']
        assert len(tree) >= 2  # Should have test.txt and subdir
        
        # Verify file items
        file_items = [item for item in tree if not item['is_directory']]
        assert len(file_items) >= 1
        test_file_item = next((item for item in file_items if item['name'] == 'test.txt'), None)
        assert test_file_item is not None
        assert 'size' in test_file_item
        assert 'modified' in test_file_item
        
        # Verify directory items
        dir_items = [item for item in tree if item['is_directory']]
        assert len(dir_items) >= 1
        subdir_item = next((item for item in dir_items if item['name'] == 'subdir'), None)
        assert subdir_item is not None
        assert subdir_item['has_children'] is True
    
    @patch('main.get_stored_sources')
    def test_browse_file_source_error(self, mock_get_sources):
        """Test browsing a file source (should fail)."""
        mock_get_sources.return_value = self.mock_sources
        
        response = self.app.get('/api/sources/file-source-1/browse')
        
        assert response.status_code == 400
        data = json.loads(response.data)
        assert data['success'] is False
        assert 'not a directory' in data['error']
    
    @patch('main.get_stored_sources')
    def test_browse_with_path_parameter(self, mock_get_sources):
        """Test browsing with path parameter."""
        mock_get_sources.return_value = self.mock_sources
        
        response = self.app.get('/api/sources/dir-source-1/browse?path=subdir')
        
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['success'] is True
        
        # Should show contents of subdir
        tree = data['tree']
        assert len(tree) >= 1
        subfile_item = next((item for item in tree if item['name'] == 'subfile.txt'), None)
        assert subfile_item is not None
    
    @patch('main.get_stored_sources')
    def test_browse_non_local_file_source(self, mock_get_sources):
        """Test browsing non-local file source type."""
        sources = {
            'http-source': {
                'id': 'http-source',
                'name': 'HTTP Source',
                'type': 'http',
                'config': {'url': 'http://example.com'},
                'pathTemplate': 'http://example.com',
                'dynamicVariables': {}
            }
        }
        mock_get_sources.return_value = sources
        
        response = self.app.get('/api/sources/http-source/browse')
        
        assert response.status_code == 400
        data = json.loads(response.data)
        assert data['success'] is False
        assert 'only supported for local file sources' in data['error']


class TestFileSourceEndpoint(TestSourceAPIEndpoints):
    """Test /api/sources/<id>/file endpoint."""
    
    @patch('main.get_stored_sources')
    def test_get_file_from_directory_source(self, mock_get_sources):
        """Test getting specific file from directory source."""
        mock_get_sources.return_value = self.mock_sources
        
        response = self.app.get('/api/sources/dir-source-1/file?path=test.txt')
        
        assert response.status_code == 200
        assert 'text/plain' in response.content_type
        assert b"Test file content" in response.data
        assert b"Second line" in response.data
    
    @patch('main.get_stored_sources')
    def test_get_file_from_subdirectory(self, mock_get_sources):
        """Test getting file from subdirectory."""
        mock_get_sources.return_value = self.mock_sources
        
        response = self.app.get('/api/sources/dir-source-1/file?path=subdir/subfile.txt')
        
        assert response.status_code == 200
        assert 'text/plain' in response.content_type
        assert b"Subfile content" in response.data
    
    @patch('main.get_stored_sources')
    def test_get_file_missing_path_parameter(self, mock_get_sources):
        """Test getting file without path parameter."""
        mock_get_sources.return_value = self.mock_sources
        
        response = self.app.get('/api/sources/dir-source-1/file')
        
        assert response.status_code == 400
        data = json.loads(response.data)
        assert data['success'] is False
        assert 'File path parameter required' in data['error']
    
    @patch('main.get_stored_sources')
    def test_get_nonexistent_file(self, mock_get_sources):
        """Test getting non-existent file."""
        mock_get_sources.return_value = self.mock_sources
        
        response = self.app.get('/api/sources/dir-source-1/file?path=nonexistent.txt')
        
        assert response.status_code == 404
        data = json.loads(response.data)
        assert data['success'] is False
        assert 'File not found' in data['error']
    
    @patch('main.get_stored_sources')
    def test_get_directory_as_file(self, mock_get_sources):
        """Test trying to get directory as file."""
        mock_get_sources.return_value = self.mock_sources
        
        response = self.app.get('/api/sources/dir-source-1/file?path=subdir')
        
        assert response.status_code == 400
        data = json.loads(response.data)
        assert data['success'] is False
        assert 'Path is a directory, not a file' in data['error']
    
    @patch('main.get_stored_sources')
    def test_path_traversal_security(self, mock_get_sources):
        """Test path traversal security."""
        mock_get_sources.return_value = self.mock_sources
        
        # Try to access file outside base directory
        response = self.app.get('/api/sources/dir-source-1/file?path=../../../etc/passwd')
        
        assert response.status_code == 403
        data = json.loads(response.data)
        assert data['success'] is False
        assert 'Access denied' in data['error']
    
    @patch('main.get_stored_sources')
    def test_get_file_from_non_local_source(self, mock_get_sources):
        """Test getting file from non-local source type."""
        sources = {
            'http-source': {
                'id': 'http-source',
                'name': 'HTTP Source',
                'type': 'http',
                'config': {'url': 'http://example.com'},
                'pathTemplate': 'http://example.com',
                'dynamicVariables': {}
            }
        }
        mock_get_sources.return_value = sources
        
        response = self.app.get('/api/sources/http-source/file?path=test.txt')
        
        assert response.status_code == 400
        data = json.loads(response.data)
        assert data['success'] is False
        assert 'only supported for local file sources' in data['error']


class TestDirectoryTreeFunction(TestSourceAPIEndpoints):
    """Test get_directory_tree function."""
    
    def test_directory_tree_max_depth(self):
        """Test directory tree respects max depth."""
        from main import get_directory_tree
        
        tree = get_directory_tree(self.temp_dir, self.temp_dir, max_depth=2)
        
        # Should have top-level items
        assert len(tree) >= 2
        
        # Find subdir item
        subdir_item = next((item for item in tree if item['name'] == 'subdir'), None)
        assert subdir_item is not None
        assert subdir_item['is_directory'] is True
        assert 'children' in subdir_item
        
        # Check depth 1 children
        subdir_children = subdir_item['children']
        assert len(subdir_children) >= 1
        
        # Find deeper directory
        deeper_item = next((item for item in subdir_children if item['name'] == 'deeper'), None)
        assert deeper_item is not None
        assert deeper_item['is_directory'] is True
        
        # At max depth, should not have children or be marked as non-explorable
        assert 'explorable' in deeper_item
        assert deeper_item['explorable'] is False
    
    def test_directory_tree_file_metadata(self):
        """Test directory tree includes file metadata."""
        from main import get_directory_tree
        
        tree = get_directory_tree(self.temp_dir, self.temp_dir, max_depth=1)
        
        # Find test.txt
        test_file_item = next((item for item in tree if item['name'] == 'test.txt'), None)
        assert test_file_item is not None
        assert test_file_item['is_directory'] is False
        assert 'size' in test_file_item
        assert 'modified' in test_file_item
        assert test_file_item['size'] > 0
        assert isinstance(test_file_item['modified'], float)
    
    def test_directory_tree_empty_directory(self):
        """Test directory tree with empty directory."""
        from main import get_directory_tree
        
        empty_dir = os.path.join(self.temp_dir, 'empty')
        os.makedirs(empty_dir)
        
        tree = get_directory_tree(empty_dir, empty_dir, max_depth=1)
        
        assert tree == []  # Should return empty list for empty directory
    
    def test_directory_tree_hidden_files(self):
        """Test directory tree skips hidden files."""
        from main import get_directory_tree
        
        # Create hidden file
        hidden_file = os.path.join(self.temp_dir, '.hidden')
        with open(hidden_file, 'w') as f:
            f.write("hidden content")
        
        tree = get_directory_tree(self.temp_dir, self.temp_dir, max_depth=1)
        
        # Should not include hidden file
        hidden_item = next((item for item in tree if item['name'] == '.hidden'), None)
        assert hidden_item is None


class TestErrorHandling(TestSourceAPIEndpoints):
    """Test error handling in API endpoints."""
    
    @patch('main.get_stored_sources')
    def test_missing_source_id(self, mock_get_sources):
        """Test handling of missing source ID."""
        mock_get_sources.return_value = {}
        
        response = self.app.get('/api/sources/missing-source/fetch')
        
        assert response.status_code == 404
        data = json.loads(response.data)
        assert data['success'] is False
        assert data['error'] == 'Source not found'
    
    @patch('main.get_stored_sources')
    @patch('main.convert_to_source_config')
    def test_source_creation_error(self, mock_convert, mock_get_sources):
        """Test handling of source creation errors."""
        mock_get_sources.return_value = self.mock_sources
        mock_convert.side_effect = Exception("Source creation failed")
        
        response = self.app.get('/api/sources/file-source-1/fetch')
        
        assert response.status_code == 500
        data = json.loads(response.data)
        assert data['success'] is False
        assert 'Source creation failed' in data['error']
    
    @patch('main.get_stored_sources')
    def test_permission_error_handling(self, mock_get_sources):
        """Test handling of permission errors."""
        # Create a source pointing to a restricted path
        restricted_sources = {
            'restricted-source': {
                'id': 'restricted-source',
                'name': 'Restricted Source',
                'type': 'local_file',
                'config': {'path': '/root'},
                'pathTemplate': '/root',
                'dynamicVariables': {}
            }
        }
        mock_get_sources.return_value = restricted_sources
        
        response = self.app.get('/api/sources/restricted-source/browse')
        
        # Should handle permission error gracefully
        # Could be 200 if /root exists and is readable, 404 if not found, or 500 if permission error
        assert response.status_code in [200, 404, 500]  
        if response.status_code != 200:
            data = json.loads(response.data)
            assert data['success'] is False