"""
Tests for LocalFileSource implementation.
"""

import pytest
import sys
import os
import tempfile
import shutil
from datetime import datetime
from pathlib import Path
from unittest.mock import patch, mock_open

# Add src directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', '..', 'src'))

from sources.local_file import LocalFileSource
from sources.base import SourceConfig, SourceMetadata, TestResult
from sources.exceptions import (
    SourceNotFoundError, SourceConnectionError, SourcePermissionError, SourceDataError
)


class TestLocalFileSource:
    """Test LocalFileSource functionality."""
    
    def setup_method(self):
        """Set up test environment."""
        self.temp_dir = tempfile.mkdtemp()
        self.test_file = os.path.join(self.temp_dir, 'test.txt')
        self.test_content = "Hello, World!\nThis is a test file."
        
        # Create test file
        with open(self.test_file, 'w') as f:
            f.write(self.test_content)
    
    def teardown_method(self):
        """Clean up test environment."""
        shutil.rmtree(self.temp_dir, ignore_errors=True)
    
    def create_config(self, path=None, **kwargs):
        """Helper to create SourceConfig."""
        return SourceConfig(
            source_id='test-123',
            name='Test Local File',
            source_type='local_file',
            static_config=kwargs.get('static_config', {}),
            path_template=path or self.test_file,
            dynamic_variables=kwargs.get('dynamic_variables', {}),
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
    
    def test_initialization(self):
        """Test LocalFileSource initialization."""
        config = self.create_config()
        source = LocalFileSource(config)
        
        assert source.config == config
        assert source._resolved_path == self.test_file
    
    def test_test_connection_success(self):
        """Test successful connection test."""
        config = self.create_config()
        source = LocalFileSource(config)
        
        result = source.test_connection()
        
        assert isinstance(result, TestResult)
        assert result.success is True
        assert result.status == 'connected'
        assert 'Successfully accessed' in result.message
        assert result.response_time is not None
        assert result.metadata is not None
        assert result.error is None
    
    def test_test_connection_file_not_found(self):
        """Test connection test with non-existent file."""
        non_existent = os.path.join(self.temp_dir, 'nonexistent.txt')
        config = self.create_config(path=non_existent)
        source = LocalFileSource(config)
        
        result = source.test_connection()
        
        assert result.success is False
        assert result.status == 'error'
        assert 'does not exist' in result.message
        assert result.error == 'Path not found'
    
    @patch('os.access')
    def test_test_connection_permission_denied(self, mock_access):
        """Test connection test with permission denied."""
        mock_access.return_value = False
        
        config = self.create_config()
        source = LocalFileSource(config)
        
        result = source.test_connection()
        
        assert result.success is False
        assert result.status == 'unauthorized'
        assert 'No read permission' in result.message
        assert result.error == 'Permission denied'
    
    def test_get_metadata_file(self):
        """Test getting metadata for a file."""
        config = self.create_config()
        source = LocalFileSource(config)
        
        metadata = source.get_metadata()
        
        assert isinstance(metadata, SourceMetadata)
        assert metadata.size == len(self.test_content)
        assert metadata.content_type == 'text/plain'
        assert metadata.permissions is not None
        assert metadata.last_modified is not None
        assert metadata.extra['is_file'] is True
        assert metadata.extra['is_directory'] is False
        assert metadata.extra['absolute_path'] == self.test_file
    
    def test_get_metadata_directory(self):
        """Test getting metadata for a directory."""
        config = self.create_config(path=self.temp_dir)
        source = LocalFileSource(config)
        
        metadata = source.get_metadata()
        
        assert isinstance(metadata, SourceMetadata)
        assert metadata.size is None  # Directories don't have size
        assert metadata.extra['is_file'] is False
        assert metadata.extra['is_directory'] is True
    
    def test_get_metadata_not_found(self):
        """Test getting metadata for non-existent file."""
        non_existent = os.path.join(self.temp_dir, 'nonexistent.txt')
        config = self.create_config(path=non_existent)
        source = LocalFileSource(config)
        
        with pytest.raises(SourceNotFoundError):
            source.get_metadata()
    
    @patch('os.access')
    def test_get_metadata_permission_denied(self, mock_access):
        """Test getting metadata with permission denied."""
        mock_access.return_value = False
        
        config = self.create_config()
        source = LocalFileSource(config)
        
        with pytest.raises(SourcePermissionError):
            source.get_metadata()
    
    def test_exists_true(self):
        """Test exists() with existing file."""
        config = self.create_config()
        source = LocalFileSource(config)
        
        assert source.exists() is True
    
    def test_exists_false(self):
        """Test exists() with non-existent file."""
        non_existent = os.path.join(self.temp_dir, 'nonexistent.txt')
        config = self.create_config(path=non_existent)
        source = LocalFileSource(config)
        
        assert source.exists() is False
    
    def test_read_data_text_mode(self):
        """Test reading data in text mode."""
        config = self.create_config()
        source = LocalFileSource(config)
        
        data = source.read_data(mode='text')
        
        assert isinstance(data, str)
        assert data == self.test_content
    
    def test_read_data_binary_mode(self):
        """Test reading data in binary mode."""
        config = self.create_config()
        source = LocalFileSource(config)
        
        data = source.read_data(mode='binary')
        
        assert isinstance(data, bytes)
        assert data == self.test_content.encode('utf-8')
    
    def test_read_data_with_limit(self):
        """Test reading data with limit."""
        config = self.create_config()
        source = LocalFileSource(config)
        
        data = source.read_data(mode='text', limit=5)
        
        assert data == "Hello"
    
    def test_read_data_with_encoding(self):
        """Test reading data with specific encoding."""
        # Create file with specific encoding
        utf8_file = os.path.join(self.temp_dir, 'utf8.txt')
        content = "Hello, 世界!"
        with open(utf8_file, 'w', encoding='utf-8') as f:
            f.write(content)
        
        config = self.create_config(path=utf8_file)
        source = LocalFileSource(config)
        
        data = source.read_data(mode='text', encoding='utf-8')
        assert data == content
    
    def test_read_data_not_found(self):
        """Test reading non-existent file."""
        non_existent = os.path.join(self.temp_dir, 'nonexistent.txt')
        config = self.create_config(path=non_existent)
        source = LocalFileSource(config)
        
        with pytest.raises(SourceNotFoundError):
            source.read_data()
    
    def test_read_data_directory(self):
        """Test reading a directory (should fail)."""
        config = self.create_config(path=self.temp_dir)
        source = LocalFileSource(config)
        
        with pytest.raises(SourceDataError):
            source.read_data()
    
    @patch('os.access')
    def test_read_data_permission_denied(self, mock_access):
        """Test reading with permission denied."""
        mock_access.return_value = False
        
        config = self.create_config()
        source = LocalFileSource(config)
        
        with pytest.raises(SourcePermissionError):
            source.read_data()
    
    def test_read_stream_text(self):
        """Test reading data as stream in text mode."""
        config = self.create_config()
        source = LocalFileSource(config)
        
        chunks = list(source.read_stream(mode='text', chunk_size=5))
        
        assert all(isinstance(chunk, str) for chunk in chunks)
        assert ''.join(chunks) == self.test_content
    
    def test_read_stream_binary(self):
        """Test reading data as stream in binary mode."""
        config = self.create_config()
        source = LocalFileSource(config)
        
        chunks = list(source.read_stream(mode='binary', chunk_size=5))
        
        assert all(isinstance(chunk, bytes) for chunk in chunks)
        assert b''.join(chunks) == self.test_content.encode('utf-8')
    
    def test_read_stream_not_found(self):
        """Test streaming non-existent file."""
        non_existent = os.path.join(self.temp_dir, 'nonexistent.txt')
        config = self.create_config(path=non_existent)
        source = LocalFileSource(config)
        
        with pytest.raises(SourceNotFoundError):
            list(source.read_stream())
    
    def test_write_data_text(self):
        """Test writing text data."""
        write_file = os.path.join(self.temp_dir, 'write_test.txt')
        config = self.create_config(path=write_file)
        source = LocalFileSource(config)
        
        test_data = "New file content"
        result = source.write_data(test_data, mode='text')
        
        assert result is True
        assert os.path.exists(write_file)
        
        with open(write_file, 'r') as f:
            assert f.read() == test_data
    
    def test_write_data_binary(self):
        """Test writing binary data."""
        write_file = os.path.join(self.temp_dir, 'write_binary.txt')
        config = self.create_config(path=write_file)
        source = LocalFileSource(config)
        
        test_data = b"Binary content"
        result = source.write_data(test_data, mode='binary')
        
        assert result is True
        assert os.path.exists(write_file)
        
        with open(write_file, 'rb') as f:
            assert f.read() == test_data
    
    def test_write_data_append(self):
        """Test appending data to existing file."""
        config = self.create_config()
        source = LocalFileSource(config)
        
        append_data = "\nAppended content"
        result = source.write_data(append_data, mode='text', append=True)
        
        assert result is True
        
        with open(self.test_file, 'r') as f:
            content = f.read()
            assert content == self.test_content + append_data
    
    def test_write_data_parent_not_found(self):
        """Test writing to non-existent parent directory."""
        write_file = os.path.join(self.temp_dir, 'nonexistent', 'file.txt')
        config = self.create_config(path=write_file)
        source = LocalFileSource(config)
        
        with pytest.raises(SourceNotFoundError):
            source.write_data("content")
    
    @patch('os.access')
    def test_write_data_permission_denied(self, mock_access):
        """Test writing with permission denied."""
        mock_access.return_value = False
        
        config = self.create_config()
        source = LocalFileSource(config)
        
        with pytest.raises(SourcePermissionError):
            source.write_data("content")
    
    def test_list_contents_directory(self):
        """Test listing directory contents."""
        # Create some files in the directory
        file1 = os.path.join(self.temp_dir, 'file1.txt')
        file2 = os.path.join(self.temp_dir, 'file2.log')
        subdir = os.path.join(self.temp_dir, 'subdir')
        
        with open(file1, 'w') as f:
            f.write("content1")
        with open(file2, 'w') as f:
            f.write("content2")
        os.makedirs(subdir)
        
        config = self.create_config(path=self.temp_dir)
        source = LocalFileSource(config)
        
        contents = source.list_contents()
        
        assert len(contents) >= 4  # test.txt + file1.txt + file2.log + subdir
        
        # Find our created items
        names = [item['name'] for item in contents]
        assert 'file1.txt' in names
        assert 'file2.log' in names
        assert 'subdir' in names
        
        # Check file vs directory types
        for item in contents:
            if item['name'] == 'subdir':
                assert item['type'] == 'directory'
                assert item['size'] is None
            elif item['name'] in ['file1.txt', 'file2.log']:
                assert item['type'] == 'file'
                assert item['size'] is not None
    
    def test_list_contents_not_directory(self):
        """Test listing contents of a file (should fail)."""
        config = self.create_config()
        source = LocalFileSource(config)
        
        with pytest.raises(SourceDataError):
            source.list_contents()
    
    def test_list_contents_not_found(self):
        """Test listing non-existent directory."""
        non_existent = os.path.join(self.temp_dir, 'nonexistent')
        config = self.create_config(path=non_existent)
        source = LocalFileSource(config)
        
        with pytest.raises(SourceNotFoundError):
            source.list_contents()
    
    @patch('os.access')
    def test_list_contents_permission_denied(self, mock_access):
        """Test listing with permission denied."""
        mock_access.return_value = False
        
        config = self.create_config(path=self.temp_dir)
        source = LocalFileSource(config)
        
        with pytest.raises(SourcePermissionError):
            source.list_contents()
    
    def test_capabilities(self):
        """Test source capabilities."""
        config = self.create_config()
        source = LocalFileSource(config)
        
        assert source.is_readable() is True
        assert source.is_writable() is True
        assert source.is_listable() is True
    
    def test_dynamic_variables_resolution(self):
        """Test path resolution with dynamic variables."""
        template = os.path.join(self.temp_dir, '$filename.txt')
        config = SourceConfig(
            source_id='test-123',
            name='Test Dynamic',
            source_type='local_file',
            static_config={},
            path_template=template,
            dynamic_variables={'filename': 'test'},
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        
        source = LocalFileSource(config)
        assert source._resolved_path == self.test_file
    
    def test_checksum_calculation(self):
        """Test checksum calculation in metadata."""
        config = self.create_config()
        source = LocalFileSource(config)
        
        metadata = source.get_metadata()
        
        # Should have checksum for small files
        assert metadata.checksum is not None
        
        # Verify checksum is correct
        import hashlib
        with open(self.test_file, 'rb') as f:
            expected_checksum = hashlib.md5(f.read()).hexdigest()
        
        assert metadata.checksum == expected_checksum
    
    def test_large_file_no_checksum(self):
        """Test that large files don't get checksum calculated."""
        # Create a mock large file
        large_file = os.path.join(self.temp_dir, 'large.txt')
        
        # Create the file first
        with open(large_file, 'w') as f:
            f.write("large file content")
        
        # Mock the stat result to return large size
        with patch('pathlib.Path.stat') as mock_stat:
            real_stat = os.stat(large_file)
            mock_stat.return_value = type('MockStat', (), {
                'st_size': 20 * 1024 * 1024,  # 20MB
                'st_mtime': real_stat.st_mtime,
                'st_mode': real_stat.st_mode
            })()
            
            config = self.create_config(path=large_file)
            source = LocalFileSource(config)
            metadata = source.get_metadata()
            assert metadata.checksum is None
    
    def test_unicode_decode_error(self):
        """Test handling of unicode decode errors."""
        # Create binary file that can't be decoded as UTF-8
        binary_file = os.path.join(self.temp_dir, 'binary.dat')
        with open(binary_file, 'wb') as f:
            f.write(b'\x80\x81\x82\x83')  # Invalid UTF-8
        
        config = self.create_config(path=binary_file)
        source = LocalFileSource(config)
        
        with pytest.raises(SourceDataError):
            source.read_data(mode='text', encoding='utf-8')
    
    def test_content_type_detection(self):
        """Test content type detection based on file extension."""
        test_cases = [
            ('test.json', 'application/json'),
            ('test.xml', 'application/xml'),
            ('test.csv', 'text/csv'),
            ('test.py', 'text/x-python'),
            ('test.js', 'application/javascript'),
            ('test.html', 'text/html'),
            ('test.css', 'text/css'),
            ('test.unknown', 'application/octet-stream')
        ]
        
        for filename, expected_type in test_cases:
            file_path = os.path.join(self.temp_dir, filename)
            with open(file_path, 'w') as f:
                f.write("content")
            
            config = self.create_config(path=file_path)
            source = LocalFileSource(config)
            metadata = source.get_metadata()
            
            assert metadata.content_type == expected_type


class TestLocalFileDirectoryDetection:
    """Test LocalFileSource directory detection functionality."""
    
    def setup_method(self):
        """Set up test environment."""
        self.temp_dir = tempfile.mkdtemp()
        self.test_file = os.path.join(self.temp_dir, 'test.txt')
        self.test_subdir = os.path.join(self.temp_dir, 'subdir')
        self.test_content = "Hello, World!\nThis is a test file."
        
        # Create test file
        with open(self.test_file, 'w') as f:
            f.write(self.test_content)
        
        # Create test subdirectory
        os.makedirs(self.test_subdir)
        
        # Create file in subdirectory
        subfile = os.path.join(self.test_subdir, 'subfile.txt')
        with open(subfile, 'w') as f:
            f.write("Subfile content")
    
    def teardown_method(self):
        """Clean up test environment."""
        shutil.rmtree(self.temp_dir, ignore_errors=True)
    
    def create_config(self, path, **kwargs):
        """Helper to create SourceConfig."""
        return SourceConfig(
            source_id='test-123',
            name='Test Local Source',
            source_type='local_file',
            static_config=kwargs.get('static_config', {}),
            path_template=path,
            dynamic_variables=kwargs.get('dynamic_variables', {}),
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
    
    def test_file_detection(self):
        """Test detection of regular files."""
        config = self.create_config(self.test_file)
        source = LocalFileSource(config)
        
        assert source.is_file() is True
        assert source.is_directory() is False
        assert source.exists() is True
    
    def test_directory_detection(self):
        """Test detection of directories."""
        config = self.create_config(self.temp_dir)
        source = LocalFileSource(config)
        
        assert source.is_file() is False
        assert source.is_directory() is True
        assert source.exists() is True
    
    def test_subdirectory_detection(self):
        """Test detection of subdirectories."""
        config = self.create_config(self.test_subdir)
        source = LocalFileSource(config)
        
        assert source.is_file() is False
        assert source.is_directory() is True
        assert source.exists() is True
    
    def test_nonexistent_path_detection(self):
        """Test detection of non-existent paths."""
        nonexistent = os.path.join(self.temp_dir, 'nonexistent')
        config = self.create_config(nonexistent)
        source = LocalFileSource(config)
        
        assert source.is_file() is False
        assert source.is_directory() is False
        assert source.exists() is False
    
    def test_nonexistent_file_detection(self):
        """Test detection of non-existent file."""
        nonexistent_file = os.path.join(self.temp_dir, 'nonexistent.txt')
        config = self.create_config(nonexistent_file)
        source = LocalFileSource(config)
        
        assert source.is_file() is False
        assert source.is_directory() is False
        assert source.exists() is False
    
    def test_nonexistent_directory_detection(self):
        """Test detection of non-existent directory."""
        nonexistent_dir = os.path.join(self.temp_dir, 'nonexistent_dir')
        config = self.create_config(nonexistent_dir)
        source = LocalFileSource(config)
        
        assert source.is_file() is False
        assert source.is_directory() is False
        assert source.exists() is False
    
    def test_directory_capabilities(self):
        """Test directory source capabilities."""
        config = self.create_config(self.temp_dir)
        source = LocalFileSource(config)
        
        assert source.is_listable() is True
        assert source.is_writable() is True
        assert source.is_readable() is True
    
    def test_file_capabilities(self):
        """Test file source capabilities."""
        config = self.create_config(self.test_file)
        source = LocalFileSource(config)
        
        assert source.is_listable() is True  # LocalFileSource supports listing generally
        assert source.is_writable() is True
        assert source.is_readable() is True
    
    
    def test_dynamic_variables_with_directory(self):
        """Test dynamic variables resolution with directory paths."""
        config = self.create_config(
            path='$base_dir/subdir',
            dynamic_variables={'base_dir': self.temp_dir}
        )
        source = LocalFileSource(config)
        
        assert source._resolved_path == self.test_subdir
        assert source.is_directory() is True
        assert source.is_file() is False
    
    def test_dynamic_variables_with_file(self):
        """Test dynamic variables resolution with file paths."""
        config = self.create_config(
            path='$base_dir/test.txt',
            dynamic_variables={'base_dir': self.temp_dir}
        )
        source = LocalFileSource(config)
        
        assert source._resolved_path == self.test_file
        assert source.is_directory() is False
        assert source.is_file() is True
    
    def test_symlink_detection(self):
        """Test detection of symbolic links."""
        if os.name != 'nt':  # Skip on Windows where symlinks need special permissions
            # Create a symlink to the test file
            symlink_path = os.path.join(self.temp_dir, 'test_symlink.txt')
            os.symlink(self.test_file, symlink_path)
            
            config = self.create_config(symlink_path)
            source = LocalFileSource(config)
            
            # Should detect as file (following the symlink)
            assert source.is_file() is True
            assert source.is_directory() is False
            assert source.exists() is True
            
            # Create a symlink to the directory
            symlink_dir = os.path.join(self.temp_dir, 'test_symlink_dir')
            os.symlink(self.test_subdir, symlink_dir)
            
            config_dir = self.create_config(symlink_dir)
            source_dir = LocalFileSource(config_dir)
            
            # Should detect as directory (following the symlink)
            assert source_dir.is_file() is False
            assert source_dir.is_directory() is True
            assert source_dir.exists() is True