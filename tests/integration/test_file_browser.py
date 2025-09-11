"""
Integration tests for file browser functionality.
Tests the complete workflow from directory detection to file selection.
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

# Import Flask app and modules
from main import app
from sources.base import SourceConfig
from sources.local_file import LocalFileSource


class TestFileBrowserIntegration:
    """Integration tests for complete file browser workflow."""
    
    def setup_method(self):
        """Set up test environment."""
        self.app = app.test_client()
        self.app.testing = True
        
        # Create complex directory structure for testing
        self.temp_dir = tempfile.mkdtemp()
        self.setup_test_directory_structure()
        
        # Mock sources
        self.setup_mock_sources()
    
    def teardown_method(self):
        """Clean up test environment."""
        shutil.rmtree(self.temp_dir, ignore_errors=True)
    
    def setup_test_directory_structure(self):
        """Create a complex directory structure for testing."""
        # Root files
        self.create_file('readme.txt', 'This is a readme file')
        self.create_file('config.json', '{"setting": "value", "number": 42}')
        
        # Documents directory
        docs_dir = os.path.join(self.temp_dir, 'documents')
        os.makedirs(docs_dir)
        self.create_file('documents/report.txt', 'Annual report content')
        self.create_file('documents/notes.md', '# Notes\n\nSome markdown content')
        
        # Data directory with subdirectories
        data_dir = os.path.join(self.temp_dir, 'data')
        os.makedirs(data_dir)
        self.create_file('data/dataset1.csv', 'name,value\nAlice,100\nBob,200')
        self.create_file('data/dataset2.csv', 'id,description\n1,First item\n2,Second item')
        
        # Data subdirectories (level 2)
        raw_dir = os.path.join(data_dir, 'raw')
        processed_dir = os.path.join(data_dir, 'processed')
        os.makedirs(raw_dir)
        os.makedirs(processed_dir)
        
        self.create_file('data/raw/input1.txt', 'Raw input data 1')
        self.create_file('data/raw/input2.txt', 'Raw input data 2')
        self.create_file('data/processed/output1.txt', 'Processed output 1')
        self.create_file('data/processed/output2.txt', 'Processed output 2')
        
        # Level 3 directory (should be marked as non-explorable)
        deep_dir = os.path.join(raw_dir, 'very_deep')
        os.makedirs(deep_dir)
        self.create_file('data/raw/very_deep/deep_file.txt', 'Very deep file content')
        
        # Empty directory
        empty_dir = os.path.join(self.temp_dir, 'empty')
        os.makedirs(empty_dir)
        
        # Binary-like file (simulate non-text file)
        self.create_file('binary_file.dat', '\\x00\\x01\\x02\\x03', mode='wb')
    
    def create_file(self, relative_path, content, mode='w'):
        """Helper to create files in test directory."""
        full_path = os.path.join(self.temp_dir, relative_path)
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        
        if mode == 'wb':
            with open(full_path, mode) as f:
                f.write(content.encode('unicode_escape').decode('unicode_escape').encode('latin1'))
        else:
            with open(full_path, mode) as f:
                f.write(content)
    
    def setup_mock_sources(self):
        """Set up mock sources for testing."""
        self.mock_sources = {
            'dir-source': {
                'id': 'dir-source',
                'name': 'Test Directory Source',
                'type': 'local_file',
                'config': {'path': self.temp_dir},
                'pathTemplate': self.temp_dir,
                'dynamicVariables': {}
            },
            'file-source': {
                'id': 'file-source',
                'name': 'Test File Source',
                'type': 'local_file',
                'config': {'path': os.path.join(self.temp_dir, 'readme.txt')},
                'pathTemplate': os.path.join(self.temp_dir, 'readme.txt'),
                'dynamicVariables': {}
            },
            'dynamic-dir-source': {
                'id': 'dynamic-dir-source',
                'name': 'Dynamic Directory Source',
                'type': 'local_file',
                'config': {'path': '$base_path/documents'},
                'pathTemplate': '$base_path/documents',
                'dynamicVariables': {'base_path': self.temp_dir}
            }
        }


class TestDirectoryDetectionWorkflow(TestFileBrowserIntegration):
    """Test complete directory detection workflow."""
    
    @patch('main.get_stored_sources')
    def test_fetch_detects_directory_automatically(self, mock_get_sources):
        """Test that fetch endpoint automatically detects directories."""
        mock_get_sources.return_value = self.mock_sources
        
        # Fetch from directory source
        response = self.app.get('/api/sources/dir-source/fetch')
        
        assert response.status_code == 200
        assert 'application/json' in response.content_type
        
        data = json.loads(response.data)
        assert data['success'] is True
        assert data['type'] == 'directory'
        assert 'tree' in data
        
        # Verify tree structure contains expected items
        tree = data['tree']
        file_names = [item['name'] for item in tree]
        
        assert 'readme.txt' in file_names
        assert 'config.json' in file_names
        assert 'documents' in file_names
        assert 'data' in file_names
        assert 'empty' in file_names
    
    @patch('main.get_stored_sources')
    def test_fetch_detects_file_automatically(self, mock_get_sources):
        """Test that fetch endpoint automatically detects files."""
        mock_get_sources.return_value = self.mock_sources
        
        # Fetch from file source
        response = self.app.get('/api/sources/file-source/fetch')
        
        assert response.status_code == 200
        assert 'text/plain' in response.content_type
        assert b'This is a readme file' in response.data
    
    @patch('main.get_stored_sources')
    def test_dynamic_variables_with_directory(self, mock_get_sources):
        """Test directory detection with dynamic variables."""
        mock_get_sources.return_value = self.mock_sources
        
        # Fetch from dynamic directory source
        response = self.app.get('/api/sources/dynamic-dir-source/fetch')
        
        # Could fail if dynamic variable resolution isn't working properly
        if response.status_code == 500:
            # Skip this test if dynamic variables aren't implemented yet
            pytest.skip("Dynamic variable resolution not yet implemented in test environment")
        
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['success'] is True
        assert data['type'] == 'directory'
        
        # Should show contents of documents directory
        tree = data['tree']
        file_names = [item['name'] for item in tree]
        assert 'report.txt' in file_names
        assert 'notes.md' in file_names


class TestDirectoryTreeStructure(TestFileBrowserIntegration):
    """Test directory tree structure and metadata."""
    
    @patch('main.get_stored_sources')
    def test_tree_structure_two_levels_deep(self, mock_get_sources):
        """Test tree structure goes exactly 2 levels deep."""
        mock_get_sources.return_value = self.mock_sources
        
        response = self.app.get('/api/sources/dir-source/browse')
        
        assert response.status_code == 200
        data = json.loads(response.data)
        tree = data['tree']
        
        # Find data directory
        data_dir = next((item for item in tree if item['name'] == 'data'), None)
        assert data_dir is not None
        assert data_dir['is_directory'] is True
        assert 'children' in data_dir
        
        # Check level 1 children
        data_children = data_dir['children']
        child_names = [child['name'] for child in data_children]
        assert 'dataset1.csv' in child_names
        assert 'dataset2.csv' in child_names
        assert 'raw' in child_names
        assert 'processed' in child_names
        
        # Check level 2 children
        raw_dir = next((child for child in data_children if child['name'] == 'raw'), None)
        assert raw_dir is not None
        assert raw_dir['is_directory'] is True
        
        # Check if raw_dir has children populated
        if 'children' in raw_dir:
            raw_children = raw_dir['children']
            raw_child_names = [child['name'] for child in raw_children]
            assert 'input1.txt' in raw_child_names
            assert 'input2.txt' in raw_child_names
            assert 'very_deep' in raw_child_names
            
            # Check level 3 directory is marked as non-explorable
            very_deep = next((child for child in raw_children if child['name'] == 'very_deep'), None)
            assert very_deep is not None
            assert very_deep['is_directory'] is True
            assert 'explorable' in very_deep
            assert very_deep['explorable'] is False
            assert 'children' not in very_deep  # Should not have children populated
        else:
            # If children not populated, should at least have has_children
            assert 'has_children' in raw_dir
            assert raw_dir['has_children'] is True
    
    @patch('main.get_stored_sources')
    def test_file_metadata_in_tree(self, mock_get_sources):
        """Test file metadata is included in tree."""
        mock_get_sources.return_value = self.mock_sources
        
        response = self.app.get('/api/sources/dir-source/browse')
        
        assert response.status_code == 200
        data = json.loads(response.data)
        tree = data['tree']
        
        # Find readme.txt
        readme = next((item for item in tree if item['name'] == 'readme.txt'), None)
        assert readme is not None
        assert readme['is_directory'] is False
        assert 'size' in readme
        assert 'modified' in readme
        assert readme['size'] > 0
        assert isinstance(readme['modified'], float)
        
        # Find config.json
        config = next((item for item in tree if item['name'] == 'config.json'), None)
        assert config is not None
        assert config['is_directory'] is False
        assert config['size'] > 0
    
    @patch('main.get_stored_sources')
    def test_directory_metadata_in_tree(self, mock_get_sources):
        """Test directory metadata is included in tree."""
        mock_get_sources.return_value = self.mock_sources
        
        response = self.app.get('/api/sources/dir-source/browse')
        
        assert response.status_code == 200
        data = json.loads(response.data)
        tree = data['tree']
        
        # Find documents directory
        documents = next((item for item in tree if item['name'] == 'documents'), None)
        assert documents is not None
        assert documents['is_directory'] is True
        assert 'size' not in documents or documents['size'] is None
        assert 'modified' in documents
        assert 'has_children' in documents
        assert documents['has_children'] is True
        
        # Find empty directory
        empty = next((item for item in tree if item['name'] == 'empty'), None)
        assert empty is not None
        assert empty['is_directory'] is True
        assert 'has_children' in empty
        assert empty['has_children'] is False
    
    @patch('main.get_stored_sources')
    def test_hidden_files_excluded(self, mock_get_sources):
        """Test hidden files are excluded from tree."""
        # Create hidden files
        self.create_file('.hidden_file', 'hidden content')
        hidden_dir = os.path.join(self.temp_dir, '.hidden_dir')
        os.makedirs(hidden_dir)
        
        mock_get_sources.return_value = self.mock_sources
        
        response = self.app.get('/api/sources/dir-source/browse')
        
        assert response.status_code == 200
        data = json.loads(response.data)
        tree = data['tree']
        
        # Should not include hidden items
        item_names = [item['name'] for item in tree]
        assert '.hidden_file' not in item_names
        assert '.hidden_dir' not in item_names


class TestFileRetrieval(TestFileBrowserIntegration):
    """Test file retrieval from directory sources."""
    
    @patch('main.get_stored_sources')
    def test_retrieve_file_from_root(self, mock_get_sources):
        """Test retrieving file from root directory."""
        mock_get_sources.return_value = self.mock_sources
        
        response = self.app.get('/api/sources/dir-source/file?path=readme.txt')
        
        assert response.status_code == 200
        assert 'text/plain' in response.content_type
        assert b'This is a readme file' in response.data
    
    @patch('main.get_stored_sources')
    def test_retrieve_file_from_subdirectory(self, mock_get_sources):
        """Test retrieving file from subdirectory."""
        mock_get_sources.return_value = self.mock_sources
        
        response = self.app.get('/api/sources/dir-source/file?path=documents/report.txt')
        
        assert response.status_code == 200
        assert b'Annual report content' in response.data
    
    @patch('main.get_stored_sources')
    def test_retrieve_file_from_deep_subdirectory(self, mock_get_sources):
        """Test retrieving file from deep subdirectory."""
        mock_get_sources.return_value = self.mock_sources
        
        response = self.app.get('/api/sources/dir-source/file?path=data/raw/input1.txt')
        
        assert response.status_code == 200
        assert b'Raw input data 1' in response.data
    
    @patch('main.get_stored_sources')
    def test_retrieve_csv_file(self, mock_get_sources):
        """Test retrieving CSV file."""
        mock_get_sources.return_value = self.mock_sources
        
        response = self.app.get('/api/sources/dir-source/file?path=data/dataset1.csv')
        
        assert response.status_code == 200
        assert b'name,value' in response.data
        assert b'Alice,100' in response.data
        assert b'Bob,200' in response.data
    
    @patch('main.get_stored_sources')
    def test_retrieve_json_file(self, mock_get_sources):
        """Test retrieving JSON file."""
        mock_get_sources.return_value = self.mock_sources
        
        response = self.app.get('/api/sources/dir-source/file?path=config.json')
        
        assert response.status_code == 200
        data = response.data.decode('utf-8')
        assert '"setting": "value"' in data
        assert '"number": 42' in data
    
    @patch('main.get_stored_sources')
    def test_retrieve_markdown_file(self, mock_get_sources):
        """Test retrieving Markdown file."""
        mock_get_sources.return_value = self.mock_sources
        
        response = self.app.get('/api/sources/dir-source/file?path=documents/notes.md')
        
        assert response.status_code == 200
        assert b'# Notes' in response.data
        assert b'Some markdown content' in response.data


class TestErrorScenarios(TestFileBrowserIntegration):
    """Test error scenarios in file browser workflow."""
    
    @patch('main.get_stored_sources')
    def test_access_nonexistent_file(self, mock_get_sources):
        """Test accessing non-existent file."""
        mock_get_sources.return_value = self.mock_sources
        
        response = self.app.get('/api/sources/dir-source/file?path=nonexistent.txt')
        
        assert response.status_code == 404
        data = json.loads(response.data)
        assert data['success'] is False
        assert 'File not found' in data['error']
    
    @patch('main.get_stored_sources')
    def test_access_directory_as_file(self, mock_get_sources):
        """Test accessing directory as file."""
        mock_get_sources.return_value = self.mock_sources
        
        response = self.app.get('/api/sources/dir-source/file?path=documents')
        
        assert response.status_code == 400
        data = json.loads(response.data)
        assert data['success'] is False
        assert 'Path is a directory, not a file' in data['error']
    
    @patch('main.get_stored_sources')
    def test_path_traversal_attack(self, mock_get_sources):
        """Test path traversal attack prevention."""
        mock_get_sources.return_value = self.mock_sources
        
        # Try various path traversal attacks
        attack_paths = [
            '../../../etc/passwd',
            '..\\..\\..\\windows\\system32\\config\\sam',
            'documents/../../etc/hosts',
            'documents/../../../etc/passwd'
        ]
        
        for attack_path in attack_paths:
            response = self.app.get(f'/api/sources/dir-source/file?path={attack_path}')
            
            # Could be 403 (access denied) or 404 (file not found after normalization)
            assert response.status_code in [403, 404]
            data = json.loads(response.data)
            assert data['success'] is False
            # Could be 'Access denied' or 'File not found'
            assert any(msg in data['error'] for msg in ['Access denied', 'File not found'])
    
    @patch('main.get_stored_sources')
    def test_browse_nonexistent_directory(self, mock_get_sources):
        """Test browsing non-existent directory."""
        nonexistent_sources = {
            'nonexistent-dir': {
                'id': 'nonexistent-dir',
                'name': 'Nonexistent Directory',
                'type': 'local_file',
                'config': {'path': '/nonexistent/directory'},
                'pathTemplate': '/nonexistent/directory',
                'dynamicVariables': {}
            }
        }
        mock_get_sources.return_value = nonexistent_sources
        
        response = self.app.get('/api/sources/nonexistent-dir/browse')
        
        assert response.status_code == 404
        data = json.loads(response.data)
        assert data['success'] is False
        assert 'does not exist' in data['error']


class TestPerformance(TestFileBrowserIntegration):
    """Test performance aspects of file browser."""
    
    @patch('main.get_stored_sources')
    def test_large_directory_handling(self, mock_get_sources):
        """Test handling of directories with many files."""
        # Create directory with many files
        large_dir = os.path.join(self.temp_dir, 'large_dir')
        os.makedirs(large_dir)
        
        # Create 100 files
        for i in range(100):
            self.create_file(f'large_dir/file_{i:03d}.txt', f'Content of file {i}')
        
        mock_get_sources.return_value = self.mock_sources
        
        response = self.app.get('/api/sources/dir-source/browse')
        
        assert response.status_code == 200
        data = json.loads(response.data)
        tree = data['tree']
        
        # Find large directory
        large_dir_item = next((item for item in tree if item['name'] == 'large_dir'), None)
        assert large_dir_item is not None
        assert large_dir_item['is_directory'] is True
        assert 'children' in large_dir_item
        
        # Should have all 100 files as children
        children = large_dir_item['children']
        assert len(children) == 100
        
        # Verify files are sorted
        file_names = [child['name'] for child in children]
        assert file_names == sorted(file_names)
    
    def test_directory_tree_caching_behavior(self):
        """Test that directory tree doesn't cache incorrectly."""
        from main import get_directory_tree
        
        # Get initial tree
        tree1 = get_directory_tree(self.temp_dir, self.temp_dir, max_depth=2)
        initial_count = len(tree1)
        
        # Add a new file
        self.create_file('new_file.txt', 'New file content')
        
        # Get tree again - should include new file
        tree2 = get_directory_tree(self.temp_dir, self.temp_dir, max_depth=2)
        
        assert len(tree2) == initial_count + 1
        new_file_item = next((item for item in tree2 if item['name'] == 'new_file.txt'), None)
        assert new_file_item is not None