#!/usr/bin/env python3
"""
Unit tests for the core regex testing logic in the simplified RegexTester class
"""

import pytest
import re
import json


class TestRegexLogic:
    """Test core regex matching logic that mirrors the JavaScript implementation"""
    
    def find_matches(self, regex, text, is_global=False):
        """Python implementation of the JavaScript findMatches method"""
        matches = []
        
        if is_global:
            # Global flag - find all matches
            for match in regex.finditer(text):
                matches.append({
                    'text': match.group(0),
                    'index': match.start(),
                    'groups': list(match.groups())
                })
        else:
            # Non-global - find first match only
            match = regex.search(text)
            if match:
                matches.append({
                    'text': match.group(0),
                    'index': match.start(),
                    'groups': list(match.groups())
                })
        
        return matches
    
    def test_simple_pattern_matching(self):
        """Test basic pattern matching without flags"""
        regex = re.compile(r'\d+')
        text = "Test 123 and 456"
        matches = self.find_matches(regex, text, is_global=False)
        
        assert len(matches) == 1  # Non-global, should only match first
        assert matches[0]['text'] == '123'
        assert matches[0]['index'] == 5
        assert matches[0]['groups'] == []
    
    def test_global_flag_matching(self):
        """Test pattern matching with global flag"""
        regex = re.compile(r'\d+')
        text = "Test 123 and 456"
        matches = self.find_matches(regex, text, is_global=True)
        
        assert len(matches) == 2
        assert matches[0]['text'] == '123'
        assert matches[0]['index'] == 5
        assert matches[1]['text'] == '456'
        assert matches[1]['index'] == 13
    
    def test_pattern_with_groups(self):
        """Test pattern matching with capture groups"""
        regex = re.compile(r'(\w+)@(\w+)\.(\w+)')
        text = "Contact: user@example.com"
        matches = self.find_matches(regex, text, is_global=False)
        
        assert len(matches) == 1
        assert matches[0]['text'] == 'user@example.com'
        assert matches[0]['index'] == 9
        assert matches[0]['groups'] == ['user', 'example', 'com']
    
    def test_case_insensitive_matching(self):
        """Test case insensitive flag"""
        regex = re.compile(r'test', re.IGNORECASE)
        text = "This is a TEST string"
        matches = self.find_matches(regex, text, is_global=False)
        
        assert len(matches) == 1
        assert matches[0]['text'] == 'TEST'
        assert matches[0]['index'] == 10
    
    def test_multiline_matching(self):
        """Test multiline flag with ^ and $ anchors"""
        regex = re.compile(r'^line', re.MULTILINE)
        text = "first line\nline two\nthird line"
        
        matches = self.find_matches(regex, text, is_global=True)
        
        assert len(matches) == 1  # Only "line two" starts with "line" at beginning of line
        assert matches[0]['text'] == 'line'
        assert matches[0]['index'] == 11  # Position of "line two"
    
    def test_dotall_flag(self):
        """Test dotall flag where . matches newlines"""
        regex = re.compile(r'start.*end', re.DOTALL)
        text = "start\nsome text\nend"
        matches = self.find_matches(regex, text, is_global=False)
        
        assert len(matches) == 1
        assert matches[0]['text'] == text
        assert matches[0]['index'] == 0
    
    def test_empty_pattern_edge_case(self):
        """Test handling of empty pattern"""
        # Empty pattern is actually valid in Python regex and matches at every position
        regex = re.compile('')
        text = "abc"
        matches = self.find_matches(regex, text, is_global=True)
        assert len(matches) >= 1  # Will match at multiple positions
    
    def test_invalid_pattern_edge_case(self):
        """Test handling of invalid regex pattern"""
        with pytest.raises(re.error):
            re.compile('[')
    
    def test_no_matches_case(self):
        """Test when pattern doesn't match anything"""
        regex = re.compile(r'\d+')
        text = "No numbers here"
        matches = self.find_matches(regex, text, is_global=False)
        
        assert len(matches) == 0
        assert matches == []
    
    def test_zero_length_match(self):
        """Test zero-length matches (word boundaries)"""
        regex = re.compile(r'\b')
        text = "word boundary"
        
        # Find all word boundaries
        matches = []
        for match in regex.finditer(text):
            matches.append({
                'text': match.group(0),
                'index': match.start(),
                'groups': list(match.groups())
            })
        
        assert len(matches) > 0  # Should find multiple word boundaries
        for match in matches:
            assert match['text'] == ''  # Zero-length match
    
    def test_overlapping_patterns(self):
        """Test handling of potentially overlapping patterns"""
        regex = re.compile(r'(.)\1')  # Repeated character
        text = "aabbcc"
        
        matches = []
        for match in regex.finditer(text):
            matches.append({
                'text': match.group(0),
                'index': match.start(),
                'groups': list(match.groups())
            })
        
        assert len(matches) == 3
        assert matches[0]['text'] == 'aa'
        assert matches[1]['text'] == 'bb'
        assert matches[2]['text'] == 'cc'


class TestRegexFlags:
    """Test flag handling logic"""
    
    def test_flag_combination_parsing(self):
        """Test various flag combinations"""
        # This simulates the JavaScript getFlags() method
        flag_combinations = [
            ('g', re.MULTILINE),  # Global (simulated)
            ('i', re.IGNORECASE),
            ('m', re.MULTILINE),
            ('s', re.DOTALL),
            ('u', 0),  # Unicode flag (default in Python 3)
            ('gim', re.IGNORECASE | re.MULTILINE),
            ('gis', re.IGNORECASE | re.DOTALL),
            ('gimu', re.IGNORECASE | re.MULTILINE)
        ]
        
        for flag_str, expected_py_flags in flag_combinations:
            # Simulate flag parsing
            py_flags = 0
            if 'i' in flag_str:
                py_flags |= re.IGNORECASE
            if 'm' in flag_str:
                py_flags |= re.MULTILINE
            if 's' in flag_str:
                py_flags |= re.DOTALL
            
            # Test basic flag functionality
            if py_flags:
                regex = re.compile(r'test', py_flags)
                assert regex.flags & py_flags == py_flags


class TestRegexEdgeCases:
    """Test edge cases and error conditions"""
    
    def test_empty_text_input(self):
        """Test regex against empty text"""
        regex = re.compile(r'.*')
        text = ""
        
        match = regex.search(text)
        assert match is not None
        assert match.group(0) == ""
        assert match.start() == 0
    
    def test_very_long_text(self):
        """Test regex against very long text"""
        regex = re.compile(r'\d+')
        text = "a" * 10000 + "123" + "b" * 10000
        
        match = regex.search(text)
        assert match is not None
        assert match.group(0) == "123"
        assert match.start() == 10000
    
    def test_special_characters_in_pattern(self):
        """Test patterns with special regex characters"""
        test_cases = [
            (r'\$\d+\.\d{2}', '$19.99', True),
            (r'\[.*\]', '[test]', True),
            (r'\(.*\)', '(test)', True),
            (r'\{.*\}', '{test}', True),
            (r'\+', '+', True),
            (r'\*', '*', True),
            (r'\?', '?', True)
        ]
        
        for pattern, text, should_match in test_cases:
            regex = re.compile(pattern)
            match = regex.search(text)
            if should_match:
                assert match is not None, f"Pattern {pattern} should match {text}"
            else:
                assert match is None, f"Pattern {pattern} should not match {text}"
    
    def test_unicode_handling(self):
        """Test Unicode character handling"""
        regex = re.compile(r'\w+', re.UNICODE)
        text = "café naïve résumé"
        
        matches = []
        for match in regex.finditer(text):
            matches.append(match.group(0))
        
        assert 'café' in matches
        assert 'naïve' in matches
        assert 'résumé' in matches


class TestRegexExamples:
    """Test the regex examples from the HTML"""
    
    def test_phone_number_example(self):
        """Test USA phone number regex"""
        pattern = r'\(([0-9]{3})\)[-. ]?([0-9]{3})[-. ]?([0-9]{4})'
        test_text = "Call me at (555) 123-4567\nOr try 555-123-4567\nAlso 555.123.4567\nInvalid: 12-345-6789"
        
        regex = re.compile(pattern)
        matches = list(regex.finditer(test_text))
        
        # Should match (555) 123-4567
        assert len(matches) >= 1
        assert matches[0].group(0) == "(555) 123-4567"
        assert matches[0].groups() == ("555", "123", "4567")
    
    def test_email_example(self):
        """Test basic email regex"""
        pattern = r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'
        test_text = "Contact: john@example.com\nsupport@company.org\nInvalid: not-email\nuser@test.co.uk"
        
        regex = re.compile(pattern)
        matches = [match.group(0) for match in regex.finditer(test_text)]
        
        assert "john@example.com" in matches
        assert "support@company.org" in matches
        assert "user@test.co.uk" in matches
        assert "not-email" not in matches
    
    def test_iso_date_example(self):
        """Test ISO date regex"""
        pattern = r'\d{4}-\d{2}-\d{2}'
        test_text = "Today: 2024-03-15\nBirthday: 1990-12-25\nInvalid: 2024/03/15\nAlso: 2023-01-01"
        
        regex = re.compile(pattern)
        matches = [match.group(0) for match in regex.finditer(test_text)]
        
        assert "2024-03-15" in matches
        assert "1990-12-25" in matches
        assert "2023-01-01" in matches
        assert "2024/03/15" not in matches
    
    def test_us_dollar_example(self):
        """Test US dollar regex"""
        pattern = r'\$([0-9]{1,3}(,[0-9]{3})*|[0-9]+)(\.[0-9]{2})?'
        test_text = "Price: $19.99\nExpensive: $1,234.56\nCheap: $5\nCost: $12,345.00\nInvalid: 19.99"
        
        regex = re.compile(pattern)
        matches = [match.group(0) for match in regex.finditer(test_text)]
        
        assert "$19.99" in matches
        assert "$1,234.56" in matches
        assert "$5" in matches
        assert "$12,345.00" in matches
        # Check that 19.99 without $ is not matched as a standalone item
        assert not any(match == "19.99" for match in matches)


if __name__ == '__main__':
    pytest.main([__file__, '-v', '--tb=short'])