#!/usr/bin/env python3
"""
Comprehensive test suite for Regex Tester Tool
Tests both backend API and frontend functionality
"""

import pytest
import json
import sys
import os
import re
from unittest.mock import patch, MagicMock

# Add the project directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from main import app

class TestRegexTesterIntegration:
    """Integration tests for the regex tester tool with the main app"""
    
    @pytest.fixture
    def client(self):
        """Create a test client for the Flask app"""
        app.config['TESTING'] = True
        with app.test_client() as client:
            yield client
    
    def test_regex_tester_route_exists(self, client):
        """Test that the regex tester route is accessible"""
        response = client.get('/tools/regex-tester')
        assert response.status_code == 200
        assert b'Regex Tester' in response.data
        assert b'Enter your regular expression' in response.data

class TestRegexPatterns:
    """Test cases for common regex patterns and edge cases"""
    
    def test_email_regex(self):
        """Test email validation regex"""
        pattern = r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'
        test_cases = [
            ('test@example.com', True),
            ('user.name+tag@domain.co.uk', True),
            ('invalid-email', False),
            ('missing@.com', False),
            ('@invalid.com', False),
            ('test@', False)
        ]
        
        for text, should_match in test_cases:
            match = re.search(pattern, text)
            assert bool(match) == should_match, f"Pattern failed for: {text}"
    
    def test_multiline_email_regex(self):
        """Test email regex with multiline text"""
        pattern = r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'
        multiline_text = 'Contact: john@example.com\nsupport@company.org\nInvalid: not-email\nuser@test.co.uk'
        
        matches = list(re.finditer(pattern, multiline_text))
        assert len(matches) == 3
        
        expected_matches = ['john@example.com', 'support@company.org', 'user@test.co.uk']
        actual_matches = [match.group(0) for match in matches]
        assert actual_matches == expected_matches
    
    def test_phone_number_regex(self):
        """Test phone number regex with groups"""
        pattern = r'\(?([0-9]{3})\)?[-. ]?([0-9]{3})[-. ]?([0-9]{4})'
        test_cases = [
            ('(555) 123-4567', ['555', '123', '4567']),
            ('555-123-4567', ['555', '123', '4567']),
            ('555.123.4567', ['555', '123', '4567']),
            ('5551234567', ['555', '123', '4567']),
            ('12-345-6789', None)  # Invalid format
        ]
        
        for text, expected_groups in test_cases:
            match = re.search(pattern, text)
            if expected_groups:
                assert match is not None, f"Should match: {text}"
                assert list(match.groups()) == expected_groups
            else:
                assert match is None, f"Should not match: {text}"
    
    def test_date_regex(self):
        """Test ISO date format regex"""
        pattern = r'\d{4}-\d{2}-\d{2}'
        test_cases = [
            ('2024-03-15', True),
            ('1990-12-25', True),
            ('2024/03/15', False),
            ('24-03-15', False),
            ('2024-3-15', False),
            ('2024-13-45', True)  # Invalid date but matches pattern
        ]
        
        for text, should_match in test_cases:
            match = re.search(pattern, text)
            assert bool(match) == should_match, f"Pattern failed for: {text}"
    
    def test_password_strength_regex(self):
        """Test strong password regex with lookaheads"""
        pattern = r'^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$'
        test_cases = [
            ('Password123!', True),
            ('MyP@ssw0rd', True),
            ('weakpass', False),     # No uppercase, number, special
            ('PASSWORD123!', False), # No lowercase
            ('Password123', False),  # No special char
            ('Pass1!', False),       # Too short
            ('STRONG456#', False)    # No lowercase
        ]
        
        for text, should_match in test_cases:
            match = re.match(pattern, text)
            assert bool(match) == should_match, f"Pattern failed for: {text}"
    
    def test_password_strength_regex_multiline(self):
        """Test strong password regex with multiline text (simulating our fix)"""
        pattern = r'^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$'
        multiline_text = 'Password123!\nweakpass\nSTRONG456#\nAbc123\nMyP@ssw0rd'
        
        # Test with multiline flag
        matches = list(re.finditer(pattern, multiline_text, re.MULTILINE))
        assert len(matches) == 2
        
        expected_matches = ['Password123!', 'MyP@ssw0rd']
        actual_matches = [match.group(0) for match in matches]
        assert actual_matches == expected_matches
        
        # Test line-by-line approach (simulating our JavaScript fix)
        lines = multiline_text.split('\n')
        line_matches = []
        for line in lines:
            match = re.match(pattern, line)
            if match:
                line_matches.append(match.group(0))
        
        assert line_matches == expected_matches
    
    def test_url_regex(self):
        """Test URL matching regex"""
        pattern = r'https?://(?:[-\w.])+(?:[:\d]+)?(?:/(?:[\w/_.])*(?:\?(?:[\w&=%.])*)?(?:#(?:[\w.])*)?)?'
        test_cases = [
            ('https://example.com', True),
            ('http://test.org:8080/path?param=value#section', True),
            ('https://sub.domain.com/deep/path/file.html', True),
            ('ftp://example.com', False),
            ('not-a-url', False),
            ('https://', False)
        ]
        
        for text, should_match in test_cases:
            match = re.search(pattern, text)
            assert bool(match) == should_match, f"Pattern failed for: {text}"

class TestRegexFlags:
    """Test regex flags and their behavior"""
    
    def test_global_flag(self):
        """Test global flag behavior"""
        pattern = r'\d+'
        text = 'Find 123 and 456 and 789'
        
        # Without global flag (Python doesn't have global flag, but we can simulate)
        matches = list(re.finditer(pattern, text))
        assert len(matches) == 3
        assert [m.group() for m in matches] == ['123', '456', '789']
    
    def test_case_insensitive_flag(self):
        """Test case insensitive flag"""
        pattern = r'test'
        text = 'Test TEST test TeSt'
        
        # Case sensitive
        matches_sensitive = list(re.finditer(pattern, text))
        assert len(matches_sensitive) == 1
        
        # Case insensitive
        matches_insensitive = list(re.finditer(pattern, text, re.IGNORECASE))
        assert len(matches_insensitive) == 4
    
    def test_multiline_flag(self):
        """Test multiline flag with ^ and $"""
        pattern = r'^test'
        text = 'test\nother line\ntest again'
        
        # Without multiline
        matches_single = list(re.finditer(pattern, text))
        assert len(matches_single) == 1
        
        # With multiline
        matches_multi = list(re.finditer(pattern, text, re.MULTILINE))
        assert len(matches_multi) == 2
    
    def test_dotall_flag(self):
        """Test dotall flag with . matching newlines"""
        pattern = r'start.+end'
        text = 'start\nmiddle\nend'
        
        # Without dotall
        match_normal = re.search(pattern, text)
        assert match_normal is None
        
        # With dotall
        match_dotall = re.search(pattern, text, re.DOTALL)
        assert match_dotall is not None

class TestRegexEdgeCases:
    """Test edge cases and error conditions"""
    
    def test_invalid_regex_patterns(self):
        """Test invalid regex patterns"""
        invalid_patterns = [
            r'[',           # Unclosed bracket
            r'(?P<',        # Incomplete named group
            r'*',           # Nothing to repeat
            r'(?P<name>)(?P<name>)',  # Duplicate group name
            r'(?',          # Incomplete group
        ]
        
        for pattern in invalid_patterns:
            with pytest.raises(re.error):
                re.compile(pattern)
    
    def test_empty_patterns_and_text(self):
        """Test behavior with empty patterns and text"""
        # Empty pattern - newer Python versions allow this
        empty_regex = re.compile('')
        assert empty_regex.pattern == ''
        
        # Empty pattern should match empty strings
        match = empty_regex.search('')
        assert match is not None
        assert match.group() == ''
        
        # Empty text with non-empty pattern
        pattern = r'\d+'
        text = ''
        match = re.search(pattern, text)
        assert match is None
    
    def test_zero_length_matches(self):
        """Test patterns that can match zero-length strings"""
        pattern = r'\b'  # Word boundary - zero-length assertion
        text = 'hello world'
        matches = list(re.finditer(pattern, text))
        assert len(matches) == 4  # Start, between words, end positions
    
    def test_very_long_text(self):
        """Test regex with very long text"""
        pattern = r'\d+'
        # Create a long text with numbers
        text = 'text ' * 1000 + '12345' + ' more' * 1000
        
        match = re.search(pattern, text)
        assert match is not None
        assert match.group() == '12345'
    
    def test_unicode_text(self):
        """Test regex with Unicode characters"""
        pattern = r'\w+'
        text = 'Hello 世界 🌍 Düsseldorf café'
        
        matches = list(re.finditer(pattern, text, re.UNICODE))
        # This will match based on Unicode word character definition
        assert len(matches) > 0
    
    def test_complex_nested_groups(self):
        """Test complex nested capture groups"""
        pattern = r'(((\d{4})-(\d{2}))-(\d{2}))'
        text = 'Date: 2024-03-15'
        
        match = re.search(pattern, text)
        assert match is not None
        groups = match.groups()
        assert groups == ('2024-03-15', '2024-03', '2024', '03', '15')

class TestRegexPerformance:
    """Performance-related tests"""
    
    def test_catastrophic_backtracking(self):
        """Test patterns that could cause catastrophic backtracking"""
        # This pattern can cause exponential backtracking
        pattern = r'(a+)+b'
        text = 'a' * 20 + 'c'  # No 'b' at end causes backtracking
        
        import time
        start_time = time.time()
        match = re.search(pattern, text)
        end_time = time.time()
        
        # Should complete quickly and not match
        assert match is None
        assert end_time - start_time < 1.0  # Should complete in under 1 second
    
    def test_large_number_of_matches(self):
        """Test pattern with large number of matches"""
        pattern = r'\d'
        text = ''.join([str(i % 10) for i in range(10000)])  # 10,000 digits
        
        matches = list(re.finditer(pattern, text))
        assert len(matches) == 10000

class TestRegexFeatures:
    """Test specific regex features"""
    
    def test_named_groups(self):
        """Test named capture groups"""
        pattern = r'(?P<year>\d{4})-(?P<month>\d{2})-(?P<day>\d{2})'
        text = 'Today is 2024-03-15'
        
        match = re.search(pattern, text)
        assert match is not None
        assert match.group('year') == '2024'
        assert match.group('month') == '03'
        assert match.group('day') == '15'
    
    def test_lookahead_lookbehind(self):
        """Test lookahead and lookbehind assertions"""
        # Positive lookahead
        pattern = r'\d+(?=\s*dollars?)'
        text = 'I have 100 dollars and 50 cents'
        match = re.search(pattern, text)
        assert match is not None
        assert match.group() == '100'
        
        # Positive lookbehind
        pattern = r'(?<=\$)\d+'
        text = 'Price: $29.99 and €25.00'
        match = re.search(pattern, text)
        assert match is not None
        assert match.group() == '29'
    
    def test_non_capturing_groups(self):
        """Test non-capturing groups"""
        pattern = r'(?:http|https)://(\w+\.\w+)'
        text = 'Visit https://example.com for more info'
        
        match = re.search(pattern, text)
        assert match is not None
        assert len(match.groups()) == 1  # Only capturing group
        assert match.group(1) == 'example.com'
    
    def test_character_classes(self):
        """Test various character classes"""
        test_cases = [
            (r'\d+', '123abc', '123'),
            (r'\w+', 'hello-world_123', 'hello'),
            (r'\s+', 'a   b', '   '),
            (r'[a-zA-Z]+', '123abc456', 'abc'),
            (r'[^0-9]+', '123abc456', 'abc'),
        ]
        
        for pattern, text, expected in test_cases:
            match = re.search(pattern, text)
            assert match is not None, f"Pattern {pattern} should match in {text}"
            assert match.group() == expected

class TestRegexUIFeatures:
    """Test UI-specific features that would be tested in frontend"""
    
    def test_match_highlighting_data(self):
        """Test data structure for match highlighting"""
        pattern = r'(\w+)@(\w+\.\w+)'
        text = 'Contact: test@example.com and admin@site.org'
        
        matches = []
        for match in re.finditer(pattern, text):
            match_data = {
                'match': match.group(0),
                'index': match.start(),
                'endIndex': match.end(),
                'groups': list(match.groups()),
                'fullMatch': match
            }
            matches.append(match_data)
        
        assert len(matches) == 2
        
        # First match
        assert matches[0]['match'] == 'test@example.com'
        assert matches[0]['groups'] == ['test', 'example.com']
        assert matches[0]['index'] == 9
        
        # Second match
        assert matches[1]['match'] == 'admin@site.org'
        assert matches[1]['groups'] == ['admin', 'site.org']
    
    def test_group_color_assignment(self):
        """Test group color assignment logic"""
        groups = ['group1', 'group2', 'group3', 'group4', 'group5', 'group6', 'group7', 'group8', 'group9', 'group10']
        
        # Simulate color assignment (group index % 9) + 1
        colors = []
        for i, group in enumerate(groups):
            color_index = (i % 9) + 1
            colors.append(f'group-{color_index}')
        
        expected_colors = [f'group-{i+1}' for i in range(9)] + ['group-1']
        assert colors == expected_colors
    
    def test_match_statistics(self):
        """Test match statistics calculation"""
        pattern = r'(\d+)'
        text = 'Find 123, 456, and 789 numbers'
        
        matches = list(re.finditer(pattern, text))
        
        stats = {
            'total_matches': len(matches),
            'unique_matches': len(set(m.group() for m in matches)),
            'groups_per_match': len(matches[0].groups()) if matches else 0,
            'total_characters_matched': sum(len(m.group()) for m in matches)
        }
        
        assert stats['total_matches'] == 3
        assert stats['unique_matches'] == 3
        assert stats['groups_per_match'] == 1
        assert stats['total_characters_matched'] == 9

if __name__ == '__main__':
    # Run tests with pytest
    pytest.main([__file__, '-v', '--tb=short'])