import re
import time
from typing import Dict, Any, List
from flask import Blueprint, request, jsonify

regex_bp = Blueprint('regex', __name__)

def generate_regex_explanation(pattern: str) -> List[Dict[str, str]]:
    """Generate human-readable explanation of regex pattern components"""
    explanations = []
    i = 0
    
    while i < len(pattern):
        char = pattern[i]
        explanation = {'component': char, 'description': ''}
        
        if char == '\\':
            if i + 1 < len(pattern):
                next_char = pattern[i + 1]
                component = char + next_char
                explanation['component'] = component
                
                if next_char == 'd':
                    explanation['description'] = 'Match any digit (0-9)'
                elif next_char == 'w':
                    explanation['description'] = 'Match any word character (a-z, A-Z, 0-9, _)'
                elif next_char == 's':
                    explanation['description'] = 'Match any whitespace character (space, tab, newline)'
                elif next_char == 'D':
                    explanation['description'] = 'Match any non-digit character'
                elif next_char == 'W':
                    explanation['description'] = 'Match any non-word character'
                elif next_char == 'S':
                    explanation['description'] = 'Match any non-whitespace character'
                elif next_char == 'b':
                    explanation['description'] = 'Match word boundary'
                elif next_char == 'B':
                    explanation['description'] = 'Match non-word boundary'
                elif next_char == 'n':
                    explanation['description'] = 'Match newline character'
                elif next_char == 't':
                    explanation['description'] = 'Match tab character'
                elif next_char == 'r':
                    explanation['description'] = 'Match carriage return'
                elif next_char.isdigit():
                    explanation['description'] = f'Match backreference to group {next_char}'
                else:
                    explanation['description'] = f'Match literal character "{next_char}"'
                
                i += 2
                explanations.append(explanation)
                continue
                
        elif char == '.':
            explanation['description'] = 'Match any single character (except newline)'
        elif char == '^':
            explanation['description'] = 'Match start of string/line'
        elif char == '$':
            explanation['description'] = 'Match end of string/line'
        elif char == '*':
            explanation['description'] = 'Match 0 or more of the preceding element'
        elif char == '+':
            explanation['description'] = 'Match 1 or more of the preceding element'
        elif char == '?':
            explanation['description'] = 'Match 0 or 1 of the preceding element (optional)'
        elif char == '|':
            explanation['description'] = 'OR operator - match either left or right side'
        elif char == '(':
            explanation['description'] = 'Start capture group'
        elif char == ')':
            explanation['description'] = 'End capture group'
        elif char == '[':
            # Character class - find the closing bracket
            j = i + 1
            while j < len(pattern) and pattern[j] != ']':
                j += 1
            if j < len(pattern):
                char_class = pattern[i:j+1]
                explanation['component'] = char_class
                explanation['description'] = f'Match any character in the set: {char_class}'
                i = j + 1
                explanations.append(explanation)
                continue
            else:
                explanation['description'] = 'Start character class (missing closing bracket)'
        elif char == '{':
            # Quantifier - find the closing brace
            j = i + 1
            while j < len(pattern) and pattern[j] != '}':
                j += 1
            if j < len(pattern):
                quantifier = pattern[i:j+1]
                explanation['component'] = quantifier
                if ',' in quantifier:
                    parts = quantifier[1:-1].split(',')
                    if len(parts) == 2:
                        min_count, max_count = parts[0], parts[1]
                        if max_count:
                            explanation['description'] = f'Match between {min_count} and {max_count} of the preceding element'
                        else:
                            explanation['description'] = f'Match {min_count} or more of the preceding element'
                    else:
                        explanation['description'] = f'Quantifier: {quantifier}'
                else:
                    count = quantifier[1:-1]
                    explanation['description'] = f'Match exactly {count} of the preceding element'
                i = j + 1
                explanations.append(explanation)
                continue
            else:
                explanation['description'] = 'Start quantifier (missing closing brace)'
        else:
            explanation['description'] = f'Match literal character "{char}"'
        
        explanations.append(explanation)
        i += 1
    
    return explanations

def test_regex_with_performance(pattern: str, text: str, flags: str) -> Dict[str, Any]:
    """Test regex with performance metrics"""
    try:
        # Convert JavaScript flags to Python flags
        py_flags = 0
        if 'i' in flags:
            py_flags |= re.IGNORECASE
        if 'm' in flags:
            py_flags |= re.MULTILINE
        if 's' in flags:
            py_flags |= re.DOTALL
        
        # Compile regex and measure time
        compile_start = time.perf_counter()
        regex = re.compile(pattern, py_flags)
        compile_time = (time.perf_counter() - compile_start) * 1000  # Convert to ms
        
        # Find matches and measure time
        match_start = time.perf_counter()
        matches = []
        step_count = 0
        
        if 'g' in flags:
            # Global flag - find all matches
            for match in regex.finditer(text):
                matches.append({
                    'text': match.group(0),
                    'index': match.start(),
                    'groups': list(match.groups()),
                    'end': match.end()
                })
                step_count += 1
        else:
            # Non-global - find first match only
            match = regex.search(text)
            if match:
                matches.append({
                    'text': match.group(0),
                    'index': match.start(),
                    'groups': list(match.groups()),
                    'end': match.end()
                })
                step_count = 1
        
        match_time = (time.perf_counter() - match_start) * 1000  # Convert to ms
        total_time = compile_time + match_time
        
        return {
            'success': True,
            'matches': matches,
            'performance': {
                'compile_time_ms': round(compile_time, 3),
                'match_time_ms': round(match_time, 3),
                'total_time_ms': round(total_time, 3),
                'steps': step_count,
                'pattern_length': len(pattern),
                'text_length': len(text)
            }
        }
        
    except re.error as e:
        return {
            'success': False,
            'error': f'Invalid regex pattern: {str(e)}'
        }
    except Exception as e:
        return {
            'success': False,
            'error': f'Error testing regex: {str(e)}'
        }

@regex_bp.route('/api/regex/explain', methods=['POST'])
def explain_regex():
    """Explain regex pattern components"""
    try:
        data = request.json
        if not data or 'pattern' not in data:
            return jsonify({'success': False, 'error': 'Missing pattern field'}), 400
        
        pattern = data['pattern']
        if not pattern:
            return jsonify({'success': False, 'error': 'Pattern cannot be empty'}), 400
        
        explanation = generate_regex_explanation(pattern)
        return jsonify({
            'success': True,
            'pattern': pattern,
            'explanation': explanation
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@regex_bp.route('/api/regex/test', methods=['POST'])
def test_regex_with_metrics():
    """Test regex with performance metrics"""
    try:
        data = request.json
        if not data or 'pattern' not in data or 'text' not in data:
            return jsonify({'success': False, 'error': 'Missing pattern or text field'}), 400
        
        pattern = data['pattern']
        text = data['text']
        flags = data.get('flags', '')
        
        if not pattern:
            return jsonify({'success': False, 'error': 'Pattern cannot be empty'}), 400
        
        result = test_regex_with_performance(pattern, text, flags)
        return jsonify(result)
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
