#!/usr/bin/env python3
"""
Comprehensive test suite for Text Diff Tool
Tests both backend API and frontend functionality
"""

import pytest
import json
import sys
import os
from unittest.mock import patch, MagicMock

# Add the project directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from main import app, generate_diff, generate_character_diff

class TestTextDiffAPI:
    """Test cases for the text diff backend API"""
    
    @pytest.fixture
    def client(self):
        """Create a test client for the Flask app"""
        app.config['TESTING'] = True
        with app.test_client() as client:
            yield client
    
    def test_compare_texts_basic_diff(self, client):
        """Test basic text comparison with simple differences"""
        data = {
            'text1': 'Hello world\nThis is line 2',
            'text2': 'Hello universe\nThis is line 2'
        }
        
        response = client.post('/api/text-diff/compare',
                             data=json.dumps(data),
                             content_type='application/json')
        
        assert response.status_code == 200
        result = json.loads(response.data)
        assert result['success'] is True
        assert 'diff' in result
        assert 'stats' in result
        assert len(result['diff']) > 0
    
    def test_compare_texts_identical(self, client):
        """Test comparison of identical texts"""
        data = {
            'text1': 'Same text\nAnother line',
            'text2': 'Same text\nAnother line'
        }
        
        response = client.post('/api/text-diff/compare',
                             data=json.dumps(data),
                             content_type='application/json')
        
        assert response.status_code == 200
        result = json.loads(response.data)
        assert result['success'] is True
        assert result['stats']['equal'] == 2
        assert result['stats']['deleted'] == 0
        assert result['stats']['inserted'] == 0
    
    def test_compare_texts_empty(self, client):
        """Test comparison with empty texts"""
        data = {
            'text1': '',
            'text2': 'Some text'
        }
        
        response = client.post('/api/text-diff/compare',
                             data=json.dumps(data),
                             content_type='application/json')
        
        assert response.status_code == 200
        result = json.loads(response.data)
        assert result['success'] is True
        assert result['stats']['inserted'] == 1
        assert result['stats']['deleted'] == 0
    
    def test_compare_texts_missing_data(self, client):
        """Test API with missing required data"""
        data = {'text1': 'Only one text'}
        
        response = client.post('/api/text-diff/compare',
                             data=json.dumps(data),
                             content_type='application/json')
        
        assert response.status_code == 400
        result = json.loads(response.data)
        assert result['success'] is False
        assert 'Missing text1 or text2' in result['error']
    
    def test_compare_texts_invalid_json(self, client):
        """Test API with invalid JSON"""
        response = client.post('/api/text-diff/compare',
                             data='invalid json',
                             content_type='application/json')
        
        assert response.status_code == 500
        result = json.loads(response.data)
        assert result['success'] is False
        assert 'error' in result
    
    def test_compare_texts_multiline_changes(self, client):
        """Test complex multiline text changes"""
        data = {
            'text1': 'Line 1\nLine 2\nLine 3\nLine 4',
            'text2': 'Line 1\nModified Line 2\nLine 4\nNew Line 5'
        }
        
        response = client.post('/api/text-diff/compare',
                             data=json.dumps(data),
                             content_type='application/json')
        
        assert response.status_code == 200
        result = json.loads(response.data)
        assert result['success'] is True
        
        # Verify stats contain expected changes
        stats = result['stats']
        assert stats['equal'] > 0  # Line 1 and Line 4 should be equal
        assert stats['deleted'] > 0  # Line 3 deleted
        assert stats['inserted'] > 0  # Modified Line 2 and New Line 5


class TestDiffGenerationFunctions:
    """Test cases for diff generation helper functions"""
    
    def test_generate_diff_basic(self):
        """Test basic diff generation"""
        text1 = "Hello\nWorld"
        text2 = "Hello\nUniverse"
        
        result = generate_diff(text1, text2)
        
        assert 'lines' in result
        assert 'stats' in result
        assert len(result['lines']) > 0
        assert result['stats']['equal'] == 1  # "Hello" line should be equal
        assert result['stats']['deleted'] == 1  # "World" deleted
        assert result['stats']['inserted'] == 1  # "Universe" inserted
    
    def test_generate_diff_empty_texts(self):
        """Test diff generation with empty texts"""
        result1 = generate_diff("", "")
        assert result1['stats']['equal'] == 0
        assert result1['stats']['deleted'] == 0
        assert result1['stats']['inserted'] == 0
        
        result2 = generate_diff("", "New text")
        assert result2['stats']['inserted'] == 1
        
        result3 = generate_diff("Old text", "")
        assert result3['stats']['deleted'] == 1
    
    def test_generate_character_diff_basic(self):
        """Test character-level diff generation"""
        old_line = "Hello world"
        new_line = "Hello universe"
        
        char_diffs = generate_character_diff(old_line, new_line)
        
        assert len(char_diffs) > 0
        # Should have equal part ("Hello "), delete part ("world"), insert part ("universe")
        types = [diff['type'] for diff in char_diffs]
        assert 'equal' in types
        assert 'delete' in types
        assert 'insert' in types
    
    def test_generate_character_diff_identical(self):
        """Test character diff with identical strings"""
        text = "Same text"
        char_diffs = generate_character_diff(text, text)
        
        assert len(char_diffs) == 1
        assert char_diffs[0]['type'] == 'equal'
        assert char_diffs[0]['content'] == text
    
    def test_generate_character_diff_completely_different(self):
        """Test character diff with completely different strings"""
        char_diffs = generate_character_diff("ABC", "XYZ")
        
        # Should have one delete and one insert
        types = [diff['type'] for diff in char_diffs]
        assert 'delete' in types
        assert 'insert' in types
        assert 'equal' not in types


class TestDiffTypes:
    """Test cases for different types of diffs"""
    
    def test_line_insertion(self):
        """Test detection of line insertions"""
        text1 = "Line 1\nLine 3"
        text2 = "Line 1\nLine 2\nLine 3"
        
        result = generate_diff(text1, text2)
        
        # Should detect one insertion
        assert result['stats']['inserted'] == 1
        assert result['stats']['equal'] == 2  # Line 1 and Line 3
        assert result['stats']['deleted'] == 0
        
        # Check that the inserted line is correctly identified
        insert_lines = [line for line in result['lines'] if line['type'] == 'insert']
        assert len(insert_lines) == 1
        assert 'Line 2' in insert_lines[0]['content']
    
    def test_line_deletion(self):
        """Test detection of line deletions"""
        text1 = "Line 1\nLine 2\nLine 3"
        text2 = "Line 1\nLine 3"
        
        result = generate_diff(text1, text2)
        
        # Should detect one deletion
        assert result['stats']['deleted'] == 1
        assert result['stats']['equal'] == 2  # Line 1 and Line 3
        assert result['stats']['inserted'] == 0
    
    def test_line_replacement(self):
        """Test detection of line replacements with character diffs"""
        text1 = "Hello world"
        text2 = "Hello universe"
        
        result = generate_diff(text1, text2)
        
        # Should detect replacement
        replace_lines = [line for line in result['lines'] if line['type'] == 'replace']
        assert len(replace_lines) == 1
        
        # Should have character-level diff
        assert 'char_diff' in replace_lines[0]
        assert replace_lines[0]['char_diff'] is not None


class TestEdgeCases:
    """Test cases for edge cases and error conditions"""
    
    def test_very_long_texts(self):
        """Test diff with very long texts"""
        text1 = '\n'.join([f"Line {i}" for i in range(1000)])
        text2 = '\n'.join([f"Line {i}" for i in range(500, 1500)])
        
        result = generate_diff(text1, text2)
        
        assert 'lines' in result
        assert 'stats' in result
        # Should handle large texts without errors
        assert result['stats']['equal'] > 0
        assert result['stats']['deleted'] > 0
        assert result['stats']['inserted'] > 0
    
    def test_unicode_text(self):
        """Test diff with Unicode characters"""
        text1 = "Hello 世界\nUnicode test 🌟"
        text2 = "Hello 世界\nUnicode test ⭐"
        
        result = generate_diff(text1, text2)
        
        assert result['stats']['equal'] == 1  # First line should be equal
        
        # Check character diff handles Unicode
        replace_lines = [line for line in result['lines'] if line['type'] == 'replace']
        if replace_lines:
            char_diff = replace_lines[0]['char_diff']
            assert char_diff is not None
    
    def test_whitespace_only_differences(self):
        """Test diff with only whitespace differences"""
        text1 = "Line 1\nLine 2"
        text2 = "Line 1 \n Line 2"  # Added trailing space and leading space
        
        result = generate_diff(text1, text2)
        
        # Should detect the whitespace differences
        assert result['stats']['deleted'] > 0 or result['stats']['inserted'] > 0 or len([line for line in result['lines'] if line['type'] == 'replace']) > 0
    
    def test_newline_variations(self):
        """Test diff with different newline styles"""
        text1 = "Line 1\nLine 2\nLine 3"
        text2 = "Line 1\r\nLine 2\r\nLine 3"
        
        result = generate_diff(text1, text2)
        
        # Should handle different newline styles gracefully
        assert 'lines' in result
        assert 'stats' in result


if __name__ == '__main__':
    # Run tests with pytest
    pytest.main([__file__, '-v', '--tb=short'])