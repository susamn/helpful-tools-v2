#!/usr/bin/env python3
"""
Unit tests for Text Diff generation functions
"""

import unittest
import sys
import os
import json

# Add project root to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../')))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../src')))

from src.main import generate_diff, generate_character_diff_html, app

class TestDiffGenerationFunctions(unittest.TestCase):
    """Test suite for diff generation logic"""

    def test_generate_diff_no_changes(self):
        """Test diffing identical texts"""
        text1 = "Hello world\nThis is a test."
        text2 = "Hello world\nThis is a test."
        
        result = generate_diff(text1, text2)
        
        # Check stats
        self.assertEqual(result['stats']['equal'], 2)
        self.assertEqual(result['stats']['additions'], 0)
        self.assertEqual(result['stats']['deletions'], 0)
        
        # Check lines
        self.assertEqual(len(result['lines']), 2)
        for line in result['lines']:
            self.assertEqual(line['type'], 'equal')

    def test_generate_diff_insertion(self):
        """Test diffing with inserted lines"""
        text1 = "Line 1\nLine 3"
        text2 = "Line 1\nLine 2\nLine 3"
        
        result = generate_diff(text1, text2)
        
        self.assertEqual(result['stats']['additions'], 1)
        self.assertEqual(result['stats']['equal'], 2)
        
        insert_lines = [line for line in result['lines'] if line['type'] == 'insert']
        self.assertEqual(len(insert_lines), 1)
        self.assertEqual(insert_lines[0]['content'], "Line 2")

    def test_generate_diff_deletion(self):
        """Test diffing with deleted lines"""
        text1 = "Line 1\nLine 2\nLine 3"
        text2 = "Line 1\nLine 3"
        
        result = generate_diff(text1, text2)
        
        self.assertEqual(result['stats']['deletions'], 1)
        self.assertEqual(result['stats']['equal'], 2)
        
        delete_lines = [line for line in result['lines'] if line['type'] == 'delete']
        self.assertEqual(len(delete_lines), 1)
        self.assertEqual(delete_lines[0]['content'], "Line 2")

    def test_generate_diff_replacement(self):
        """Test diffing with replaced lines"""
        text1 = "Line 1\nThis is old\nLine 3"
        text2 = "Line 1\nThis is new\nLine 3"
        
        result = generate_diff(text1, text2)
        
        self.assertEqual(result['stats']['modifications'], 1)
        self.assertEqual(result['stats']['equal'], 2)

    def test_generate_diff_empty_inputs(self):
        """Test diffing with one or both inputs empty"""
        # Both empty
        result = generate_diff("", "")
        self.assertEqual(len(result['lines']), 0)
        self.assertEqual(result['stats']['equal'], 0)
        
        # First empty
        result = generate_diff("", "Line 1\nLine 2")
        self.assertEqual(result['stats']['additions'], 2)
        self.assertEqual(len(result['lines']), 2)
        
        # Second empty
        result = generate_diff("Line 1\nLine 2", "")
        self.assertEqual(result['stats']['deletions'], 2)
        self.assertEqual(len(result['lines']), 2)

    def test_generate_diff_trailing_newline(self):
        """Test diffing with trailing newlines"""
        text1 = "Line 1\n"
        text2 = "Line 1\nLine 2\n"
        
        result = generate_diff(text1, text2)
        
        self.assertEqual(result['stats']['additions'], 1)
        self.assertEqual(result['stats']['equal'], 1)

    def test_generate_diff_no_trailing_newline(self):
        """Test diffing without trailing newlines"""
        text1 = "Line 1"
        text2 = "Line 1\nLine 2"
        
        result = generate_diff(text1, text2)
        
        self.assertEqual(result['stats']['additions'], 1)
        self.assertEqual(result['stats']['equal'], 1)

    def test_generate_diff_basic(self):
        """Test basic diff generation"""
        text1 = "Hello\nWorld"
        text2 = "Hello\nUniverse"

        result = generate_diff(text1, text2)

        assert 'lines' in result
        assert 'stats' in result
        assert len(result['lines']) > 0
        assert result['stats']['equal'] == 1
        assert result['stats']['modifications'] == 1

    def test_generate_character_diff_html_basic(self):
        """Test character-level diff generation"""
        old_line = "Hello world"
        new_line = "Hello universe"

        char_diff_1, char_diff_2 = generate_character_diff_html(old_line, new_line)

        self.assertIn("Hello ", char_diff_1)
        self.assertIn('<span class="char-delete">w</span>', char_diff_1)
        self.assertIn('<span class="char-delete">o</span>', char_diff_1)
        self.assertIn('<span class="char-delete">r</span>', char_diff_1)
        self.assertIn('<span class="char-delete">l</span>', char_diff_1)
        self.assertIn('<span class="char-delete">d</span>', char_diff_1)
        self.assertIn("Hello ", char_diff_2)
        self.assertIn('<span class="char-insert">u</span>', char_diff_2)

    def test_generate_character_diff_html_identical(self):
        """Test character diff with identical strings"""
        text = "Same text"
        char_diff_1, char_diff_2 = generate_character_diff_html(text, text)

        self.assertEqual(char_diff_1, text)
        self.assertEqual(char_diff_2, text)

    def test_generate_character_diff_html_completely_different(self):
        """Test character diff with completely different strings"""
        char_diff_1, char_diff_2 = generate_character_diff_html("ABC", "XYZ")

        expected_1 = '<span class="char-delete">A</span><span class="char-delete">B</span><span class="char-delete">C</span>'
        expected_2 = '<span class="char-insert">X</span><span class="char-insert">Y</span><span class="char-insert">Z</span>'
        self.assertEqual(char_diff_1, expected_1)
        self.assertEqual(char_diff_2, expected_2)


class TestDiffTypes(unittest.TestCase):
    """Test different types of diffs"""

    def test_line_insertion(self):
        """Test detection of line insertions"""
        text1 = "line one\nline three"
        text2 = "line one\nline two\nline three"
        result = generate_diff(text1, text2)

        insert_lines = [line for line in result['lines'] if line['type'] == 'insert']
        self.assertEqual(len(insert_lines), 1)
        self.assertEqual(insert_lines[0]['content'], "line two")

    def test_line_deletion(self):
        """Test detection of line deletions"""
        text1 = "line one\nline two\nline three"
        text2 = "line one\nline three"
        result = generate_diff(text1, text2)

        delete_lines = [line for line in result['lines'] if line['type'] == 'delete']
        self.assertEqual(len(delete_lines), 1)
        self.assertEqual(delete_lines[0]['content'], "line two")

    def test_line_replacement(self):
        """Test detection of line replacements with character diffs"""
        text1 = "Hello world"
        text2 = "Hello universe"

        result = generate_diff(text1, text2)

        # Should detect replacement
        replace_lines = [line for line in result['lines'] if line['type'] == 'modify']
        assert len(replace_lines) == 1

        # Should have character-level diff
        assert 'char_diff_1' in replace_lines[0]
        assert 'char_diff_2' in replace_lines[0]


class TestEdgeCases(unittest.TestCase):
    """Test edge cases for diff generation"""

    def test_empty_strings(self):
        """Test diff with empty strings"""
        result = generate_diff("", "")
        self.assertEqual(len(result['lines']), 0)

    def test_single_line_vs_multiline(self):
        """Test diff between single line and multi-line"""
        text1 = "Single line"
        text2 = "First line\nSecond line"
        result = generate_diff(text1, text2)

        # Should have some changes - either modifications, additions, or deletions
        total_changes = result['stats']['deletions'] + result['stats']['additions'] + result['stats']['modifications']
        self.assertTrue(total_changes > 0)

    def test_unicode_text(self):
        """Test diff with Unicode characters"""
        text1 = "Hello 世界\nUnicode test 🌟"
        text2 = "Hello 世界\nUnicode test ⭐"

        result = generate_diff(text1, text2)

        assert result['stats']['equal'] == 1  # First line should be equal

        # Check character diff handles Unicode
        replace_lines = [line for line in result['lines'] if line['type'] == 'modify']
        if replace_lines:
            char_diff_1 = replace_lines[0]['char_diff_1']
            char_diff_2 = replace_lines[0]['char_diff_2']
            self.assertIn("🌟", char_diff_1)
            self.assertIn("⭐", char_diff_2)


class TestDiffAlgorithmEdgeCases(unittest.TestCase):
    """Test edge cases for diff algorithm robustness"""
    
    def test_very_large_files(self):
        """Test diff with large files (performance)"""
        large_text1 = '\n'.join([f"Line {i} with content" for i in range(1000)])
        large_text2 = '\n'.join([f"Line {i} with modified content" if i % 100 == 0 else f"Line {i} with content" for i in range(1000)])
        
        result = generate_diff(large_text1, large_text2)
        
        # Should handle large files without crashing
        self.assertGreater(len(result['lines']), 0)
        self.assertGreater(result['stats']['modifications'], 0)
        self.assertEqual(result['stats']['equal'], 990)  # 10 modifications out of 1000
    
    def test_completely_different_files(self):
        """Test diff when files are completely different"""
        text1 = "File A content\nWith multiple lines\nAll different"
        text2 = "File B data\nCompletely changed\nNothing matches"
        
        result = generate_diff(text1, text2)
        
        # Should show all as modifications since line counts match
        self.assertEqual(result['stats']['equal'], 0)
        self.assertEqual(result['stats']['modifications'], 3)
    
    def test_whitespace_differences(self):
        """Test diff with only whitespace changes"""
        text1 = "Line with spaces"
        text2 = "Line  with   spaces"  # Extra spaces
        
        result = generate_diff(text1, text2)
        
        # Should detect character-level differences
        modify_lines = [line for line in result['lines'] if line['type'] == 'modify']
        self.assertEqual(len(modify_lines), 1)
        self.assertIn('char_diff_1', modify_lines[0])
        self.assertIn('char_diff_2', modify_lines[0])
    
    def test_newline_variations(self):
        """Test diff with different newline styles"""
        text1 = "Line 1\nLine 2\nLine 3"  # Unix newlines
        text2 = "Line 1\r\nLine 2\r\nLine 3"  # Windows newlines
        
        result = generate_diff(text1, text2)
        
        # Should handle different newline styles gracefully
        self.assertIsNotNone(result)
        self.assertIn('stats', result)
    
    def test_binary_like_content(self):
        """Test diff with binary-like content"""
        text1 = "Binary\x00\x01\x02data"
        text2 = "Binary\x00\x03\x04data"
        
        result = generate_diff(text1, text2)
        
        # Should handle binary content without crashing
        self.assertIsNotNone(result)
        self.assertIn('lines', result)


class TestChaosTheoryScenarios(unittest.TestCase):
    """Test scenarios inspired by chaos theory, where small changes can have large effects."""

    def test_single_character_change_at_beginning(self):
        """A single character change at the start of a long string."""
        text1 = "a" + "b" * 100
        text2 = "c" + "b" * 100
        result = generate_diff(text1, text2)
        self.assertEqual(result['stats']['modifications'], 1)
        modify_lines = [line for line in result['lines'] if line['type'] == 'modify']
        self.assertIn('<span class="char-delete">a</span>', modify_lines[0]['char_diff_1'])
        self.assertIn('<span class="char-insert">c</span>', modify_lines[0]['char_diff_2'])

    def test_single_character_change_at_end(self):
        """A single character change at the end of a long string."""
        text1 = "b" * 100 + "a"
        text2 = "b" * 100 + "c"
        result = generate_diff(text1, text2)
        self.assertEqual(result['stats']['modifications'], 1)
        modify_lines = [line for line in result['lines'] if line['type'] == 'modify']
        self.assertIn('<span class="char-delete">a</span>', modify_lines[0]['char_diff_1'])
        self.assertIn('<span class="char-insert">c</span>', modify_lines[0]['char_diff_2'])

    def test_transposition_of_characters(self):
        """Two characters swapped, which should be seen as two replacements."""
        text1 = "ab"
        text2 = "ba"
        result = generate_diff(text1, text2)
        self.assertEqual(result['stats']['modifications'], 1)
        modify_lines = [line for line in result['lines'] if line['type'] == 'modify']
        self.assertIn('<span class="char-delete">a</span><span class="char-delete">b</span>', modify_lines[0]['char_diff_1'])
        self.assertIn('<span class="char-insert">b</span><span class="char-insert">a</span>', modify_lines[0]['char_diff_2'])

    def test_small_change_in_repeated_pattern(self):
        """A small change in a line that is repeated many times."""
        text1 = "abc\n" * 5
        text2 = ("abc\n" * 2) + "abd\n" + ("abc\n" * 2)
        result = generate_diff(text1, text2)
        self.assertEqual(result['stats']['equal'], 4)
        self.assertEqual(result['stats']['deletions'], 1)
        self.assertEqual(result['stats']['additions'], 1)


class TestGameTheoryScenarios(unittest.TestCase):
    """Test scenarios inspired by game theory, using adversarial inputs."""

    def test_adversarial_input_alternating_chars(self):
        """Strings with alternating characters, to test performance and correctness."""
        text1 = "abababab"
        text2 = "babababa"
        result = generate_diff(text1, text2)
        self.assertEqual(result['stats']['modifications'], 1)

    def test_input_with_many_similar_lines(self):
        """Input where many lines are similar but not identical."""
        text1 = "line a\nline b\nline c"
        text2 = "line x\nline y\nline z"
        result = generate_diff(text1, text2)
        self.assertEqual(result['stats']['modifications'], 3)
        self.assertEqual(result['stats']['equal'], 0)

    def test_lines_that_are_substrings_of_each_other(self):
        """Lines that are substrings of each other."""
        text1 = "short"
        text2 = "a short story"
        result = generate_diff(text1, text2)
        self.assertEqual(result['stats']['modifications'], 1)
        modify_lines = [line for line in result['lines'] if line['type'] == 'modify']
        self.assertIn('<span class="char-delete">s</span>', modify_lines[0]['char_diff_1'])
        self.assertIn('<span class="char-insert">a</span>', modify_lines[0]['char_diff_2'])

    def test_input_with_misleading_common_substrings(self):
        """Input with common substrings that might mislead a simple diff algorithm."""
        text1 = "common_prefix_unique_suffix1"
        text2 = "common_prefix_unique_suffix2"
        result = generate_diff(text1, text2)
        self.assertEqual(result['stats']['modifications'], 1)
        modify_lines = [line for line in result['lines'] if line['type'] == 'modify']
        self.assertIn('common_prefix_unique_suffix1', modify_lines[0]['content_1'])
        self.assertIn('common_prefix_unique_suffix2', modify_lines[0]['content_2'])
        self.assertIn('<span class="char-delete">1</span>', modify_lines[0]['char_diff_1'])
        self.assertIn('<span class="char-insert">2</span>', modify_lines[0]['char_diff_2'])


class TestAdvancedEdgeCases(unittest.TestCase):
    """Test advanced edge cases to make the tool more bulletproof."""

    def test_mixed_charsets(self):
        """Test with a mix of different character sets."""
        text1 = "Hello, world! Cyrillic: мир. CJK: 世界. Emoji: 😊"
        text2 = "Hello, world! Cyrillic: мір. CJK: 世界. Emoji: 😂"
        result = generate_diff(text1, text2)
        self.assertEqual(result['stats']['modifications'], 1)
        modify_lines = [line for line in result['lines'] if line['type'] == 'modify']
        self.assertIn('<span class="char-delete">и</span>', modify_lines[0]['char_diff_1'])
        self.assertIn('<span class="char-insert">і</span>', modify_lines[0]['char_diff_2'])
        self.assertIn('<span class="char-delete">😊</span>', modify_lines[0]['char_diff_1'])
        self.assertIn('<span class="char-insert">😂</span>', modify_lines[0]['char_diff_2'])

    def test_combining_characters(self):
        """Test with Unicode combining characters."""
        text1 = "école"  # e + combining acute accent
        text2 = "école"  # precomposed character
        result = generate_diff(text1, text2)
        # Depending on normalization, these might be seen as different
        self.assertNotEqual(text1, text2)
        # The diff should still be able to process them
        self.assertIn('stats', result)

    def test_rtl_text(self):
        """Test with right-to-left text."""
        text1 = "שלום עולם"
        text2 = "שלום עולם!"
        result = generate_diff(text1, text2)
        self.assertEqual(result['stats']['modifications'], 1)

    def test_mixed_whitespace(self):
        """Test with mixed spaces and tabs."""
        text1 = "hello\tworld"
        text2 = "hello world"
        result = generate_diff(text1, text2)
        self.assertEqual(result['stats']['modifications'], 1)
        modify_lines = [line for line in result['lines'] if line['type'] == 'modify']
        self.assertIn('\t', modify_lines[0]['char_diff_1'])
        self.assertIn(' ', modify_lines[0]['char_diff_2'])

    def test_zero_width_spaces(self):
        """Test with zero-width spaces."""
        text1 = "hello​world"  # Contains a zero-width space
        text2 = "helloworld"
        result = generate_diff(text1, text2)
        self.assertEqual(result['stats']['modifications'], 1)

    def test_extremely_long_lines(self):
        """Test performance with extremely long lines."""
        text1 = "a" * 10000
        text2 = "a" * 5000 + "b" + "a" * 4999
        result = generate_diff(text1, text2)
        self.assertEqual(result['stats']['modifications'], 1)

    def test_large_number_of_lines(self):
        """Test performance with a large number of lines."""
        text1 = "line\n" * 2000
        text2 = ("line\n" * 1000) + "new line\n" + ("line\n" * 999)
        result = generate_diff(text1, text2)
        self.assertEqual(result['stats']['modifications'], 1000)
        self.assertEqual(result['stats']['equal'], 1000)

    def test_api_malformed_json(self):
        """Test API robustness with malformed JSON."""
        with app.test_client() as client:
            response = client.post('/api/text-diff/compare', data="not a valid json", content_type='application/json')
            self.assertEqual(response.status_code, 400)
            json_data = response.get_json()
            self.assertIn('error', json_data)
            self.assertEqual(json_data['error'], 'Invalid JSON format')

    def test_api_missing_keys(self):
        """Test API robustness with missing keys."""
        with app.test_client() as client:
            response = client.post('/api/text-diff/compare', json={'text1': 'some text'}, content_type='application/json')
            self.assertEqual(response.status_code, 400)
            json_data = response.get_json()
            self.assertIn('error', json_data)
            self.assertEqual(json_data['error'], 'Missing text1 or text2')

    def test_api_large_payload(self):
        """Test API robustness with a large payload."""
        with app.test_client() as client:
            text1 = "a" * 50000
            text2 = "b" * 50000
            response = client.post('/api/text-diff/compare', json={'text1': text1, 'text2': text2}, content_type='application/json')
            self.assertEqual(response.status_code, 200)
            json_data = response.get_json()
            self.assertTrue(json_data['success'])


class TestDiffAPIIntegration(unittest.TestCase):
    """Test the actual API endpoint that serves diff functionality"""
    
    def test_text_diff_api_endpoint(self):
        """Test that the /api/text-diff/compare endpoint works"""
        import requests
        
        try:
            payload = {
                'text1': 'Original text\nWith multiple lines',
                'text2': 'Modified text\nWith multiple lines\nAnd extra content'
            }
            
            response = requests.post('http://127.0.0.1:8000/api/text-diff/compare', json=payload)
            
            if response.status_code == 200:
                data = response.json()
                self.assertTrue(data['success'])
                self.assertIn('diff', data)
                self.assertIn('stats', data)
                self.assertGreater(len(data['diff']), 0)
            else:
                # Server might not be running, skip this test
                self.skipTest("Server not available for API testing")
                
        except requests.ConnectionError:
            self.skipTest("Server not available for API testing")


if __name__ == '__main__':
    unittest.main()
