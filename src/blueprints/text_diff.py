import difflib
import html
import re
from typing import Dict, Any, Tuple
from flask import Blueprint, request, jsonify

text_diff_bp = Blueprint('text_diff', __name__)

def preprocess_texts(text1: str, text2: str, ignore_whitespace: bool, ignore_case: bool) -> Tuple[str, str]:
    """Preprocess texts based on comparison options"""
    if ignore_case:
        text1 = text1.lower()
        text2 = text2.lower()
    
    if ignore_whitespace:
        # Normalize whitespace - replace multiple spaces/tabs with single space
        text1 = re.sub(r'\s+', ' ', text1).strip()
        text2 = re.sub(r'\s+', ' ', text2).strip()
    
    return text1, text2

def generate_unified_diff(text1: str, text2: str, context_lines: int) -> str:
    """Generate unified diff format"""
    lines1 = text1.splitlines(keepends=True)
    lines2 = text2.splitlines(keepends=True)
    
    diff = difflib.unified_diff(
        lines1, lines2,
        fromfile='text1', tofile='text2',
        n=context_lines
    )
    return ''.join(diff)

def generate_context_diff(text1: str, text2: str, context_lines: int) -> str:
    """Generate context diff format"""
    lines1 = text1.splitlines(keepends=True)
    lines2 = text2.splitlines(keepends=True)
    
    diff = difflib.context_diff(
        lines1, lines2,
        fromfile='text1', tofile='text2',
        n=context_lines
    )
    return ''.join(diff)

def generate_side_by_side_diff(text1: str, text2: str) -> str:
    """Generate side-by-side diff format"""
    lines1 = text1.splitlines()
    lines2 = text2.splitlines()
    
    result = []
    max_lines = max(len(lines1), len(lines2))
    
    for i in range(max_lines):
        line1 = lines1[i] if i < len(lines1) else ''
        line2 = lines2[i] if i < len(lines2) else ''
        
        # Simple side-by-side format
        if line1 == line2:
            result.append(f"{i+1:4d} | {line1:<40} | {line2}")
        else:
            result.append(f"{i+1:4d} | {line1:<40} | {line2}")
    
    return '\n'.join(result)

def generate_character_diff_html(text1: str, text2: str) -> Tuple[str, str]:
    """Generate character-level diff as an HTML string with proper escaping."""
    res1 = []
    res2 = []
    i = 0
    j = 0
    while i < len(text1) or j < len(text2):
        if i < len(text1) and j < len(text2) and text1[i] == text2[j]:
            # Escape matching characters to prevent XSS
            escaped_char = html.escape(text1[i])
            res1.append(escaped_char)
            res2.append(escaped_char)
            i += 1
            j += 1
        else:
            if i < len(text1):
                escaped_char1 = html.escape(text1[i])
                res1.append(f'<span class="char-delete">{escaped_char1}</span>')
                i += 1
            if j < len(text2):
                escaped_char2 = html.escape(text2[j])
                res2.append(f'<span class="char-insert">{escaped_char2}</span>')
                j += 1
    return "".join(res1), "".join(res2)

def generate_diff(text1: str, text2: str) -> Dict[str, Any]:
    """Generate unified diff with character-level highlighting"""
    lines1 = text1.splitlines()
    lines2 = text2.splitlines()
    
    # Generate sequence matcher for line-by-line comparison
    matcher = difflib.SequenceMatcher(None, lines1, lines2)
    
    result_lines = []
    stats = {'additions': 0, 'deletions': 0, 'equal': 0, 'modifications': 0}
    
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == 'equal':
            # Lines that are the same
            for i in range(i1, i2):
                result_lines.append({
                    'type': 'equal',
                    'content': lines1[i],
                    'line_num_1': i + 1,
                    'line_num_2': j1 + (i - i1) + 1
                })
                stats['equal'] += 1
                
        elif tag == 'delete':
            # Lines deleted from text1
            for i in range(i1, i2):
                result_lines.append({
                    'type': 'delete',
                    'content': lines1[i],
                    'line_num_1': i + 1,
                    'line_num_2': None
                })
                stats['deletions'] += 1
                
        elif tag == 'insert':
            # Lines inserted in text2
            for i in range(j1, j2):
                result_lines.append({
                    'type': 'insert',
                    'content': lines2[i],
                    'line_num_1': None,
                    'line_num_2': i + 1
                })
                stats['additions'] += 1
                
        elif tag == 'replace':
            # Lines that are different
            len1 = i2 - i1
            len2 = j2 - j1
            stats['modifications'] += min(len1, len2)

            for i in range(min(len1, len2)):
                line1 = lines1[i1 + i]
                line2 = lines2[j1 + i]
                char_diff_1, char_diff_2 = generate_character_diff_html(line1, line2)
                result_lines.append({
                    'type': 'modify',
                    'content_1': line1,
                    'content_2': line2,
                    'char_diff_1': char_diff_1,
                    'char_diff_2': char_diff_2,
                    'line_num_1': i1 + i + 1,
                    'line_num_2': j1 + i + 1
                })
            
            if len1 > len2:
                for i in range(len2, len1):
                    result_lines.append({
                        'type': 'delete',
                        'content': lines1[i1 + i],
                        'line_num_1': i1 + i + 1,
                        'line_num_2': None
                    })
                    stats['deletions'] += 1
            elif len2 > len1:
                for i in range(len1, len2):
                    result_lines.append({
                        'type': 'insert',
                        'content': lines2[j1 + i],
                        'line_num_1': None,
                        'line_num_2': j1 + i + 1
                    })
                    stats['additions'] += 1

    return {'lines': result_lines, 'stats': stats}

@text_diff_bp.route('/api/text-diff/compare', methods=['POST'])
def compare_texts():
    """Compare two texts and return diff with character-level changes
    
    Supports multiple output formats:
    - json: Default JSON format with structured diff data (default)
    - unified: Standard unified diff format
    - context: Context diff format
    - side-by-side: Side-by-side text format
    - stats-only: Just statistics
    
    Options:
    - ignore_whitespace: Ignore whitespace differences
    - ignore_case: Case insensitive comparison  
    - context_lines: Number of context lines (default: 3)
    """
    try:
        data = request.get_json(silent=True)
        if data is None:
            return jsonify({'success': False, 'error': 'Invalid JSON format'}), 400

        if 'text1' not in data or 'text2' not in data:
            return jsonify({'success': False, 'error': 'Missing text1 or text2'}), 400
            
        text1 = data['text1']
        text2 = data['text2']
        
        # Get options
        output_format = data.get('format', 'json')
        ignore_whitespace = data.get('ignore_whitespace', False)
        ignore_case = data.get('ignore_case', False)
        context_lines = data.get('context_lines', 3)
        
        # Apply preprocessing options
        processed_text1, processed_text2 = preprocess_texts(text1, text2, ignore_whitespace, ignore_case)
        
        # Generate line-by-line diff with character-level changes
        diff_result = generate_diff(processed_text1, processed_text2)
        
        # Return in requested format
        if output_format == 'unified':
            unified_diff = generate_unified_diff(text1, text2, context_lines)
            return jsonify({
                'success': True,
                'format': 'unified',
                'diff': unified_diff,
                'stats': diff_result['stats']
            })
        elif output_format == 'context':
            context_diff = generate_context_diff(text1, text2, context_lines)
            return jsonify({
                'success': True,
                'format': 'context', 
                'diff': context_diff,
                'stats': diff_result['stats']
            })
        elif output_format == 'side-by-side':
            side_by_side = generate_side_by_side_diff(text1, text2)
            return jsonify({
                'success': True,
                'format': 'side-by-side',
                'diff': side_by_side,
                'stats': diff_result['stats']
            })
        elif output_format == 'stats-only':
            return jsonify({
                'success': True,
                'format': 'stats-only',
                'stats': diff_result['stats']
            })
        else:  # Default JSON format
            return jsonify({
                'success': True,
                'format': 'json',
                'diff': diff_result['lines'],
                'stats': diff_result['stats']
            })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
