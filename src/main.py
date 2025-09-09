import os
import json
from datetime import datetime
from pathlib import Path
from flask import Flask, render_template_string, request, jsonify, send_file, abort
import html

# Import history manager
from api.history import history_manager, validate_tool_name, sanitize_data
from api.converter import convert_format, validate_format, converter
import difflib
import re
import time
from typing import Dict, Any, List, Tuple

# Configure Flask to use the correct static folder with absolute path
static_dir = Path(__file__).parent.parent / "frontend" / "static"
app = Flask(__name__, 
            static_folder=str(static_dir),
            static_url_path='/static')

# Create directories using absolute paths
app_root = Path(__file__).parent.parent
os.makedirs(app_root / "frontend" / "static", exist_ok=True)
os.makedirs(app_root / "frontend" / "static" / "css", exist_ok=True)
os.makedirs(app_root / "frontend" / "static" / "js", exist_ok=True)
os.makedirs(app_root / "logs", exist_ok=True)
os.makedirs(app_root / "frontend" / "tools", exist_ok=True)

# Store for tools configuration
TOOLS = [
    {
        "name": "JSON Formatter",
        "description": "Format, validate, and minify JSON data with history tracking",
        "path": "/tools/json-formatter",
        "tags": ["formatter", "json", "validator"],
        "has_history": True,
        "icon": "📄"
    },
    {
        "name": "JSON-YAML-XML Converter",
        "description": "Bidirectional conversion between JSON, YAML, and XML formats with syntax highlighting",
        "path": "/tools/json-yaml-xml-converter",
        "tags": ["converter", "json", "yaml", "xml", "format"],
        "has_history": True,
        "icon": "🔄"
    },
    {
        "name": "Text Diff Tool",
        "description": "Compare two text files side-by-side with inline highlighting of differences",
        "path": "/tools/text-diff",
        "tags": ["diff", "compare", "text", "files"],
        "has_history": True,
        "icon": "⚖️"
    },
    {
        "name": "Regex Tester",
        "description": "Interactive regex testing tool with live highlighting, group visualization, and match details",
        "path": "/tools/regex-tester",
        "tags": ["regex", "pattern", "match", "test", "validation"],
        "has_history": True,
        "icon": "🔍"
    },
    {
        "name": "Cron Parser",
        "description": "Parse and analyze cron expressions with human-readable descriptions and next execution times",
        "path": "/tools/cron-parser",
        "tags": ["cron", "scheduler", "parser", "time", "unix"],
        "has_history": True,
        "icon": "⏰"
    },
    {
        "name": "Scientific Calculator",
        "description": "Advanced calculator with scientific functions and interactive graph plotter for mathematical expressions",
        "path": "/tools/scientific-calculator",
        "tags": ["calculator", "math", "science", "graph", "plotter", "functions"],
        "has_history": True,
        "icon": "🧮"
    },
    {
        "name": "JWT Decoder",
        "description": "Decode and analyze JWT (JSON Web Tokens) with syntax highlighting, validation, and timestamp formatting",
        "path": "/tools/jwt-decoder",
        "tags": ["jwt", "decoder", "token", "security", "json", "auth"],
        "has_history": True,
        "icon": "🔑"
    }
]

# Dashboard template
DASHBOARD_TEMPLATE = '''
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Helpful Tools v2</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            color: #333;
        }
        .header {
            text-align: center;
            padding: 40px 20px;
            color: white;
        }
        .header h1 {
            font-size: 3em;
            margin-bottom: 10px;
            font-weight: 300;
            text-shadow: 0 2px 4px rgba(0,0,0,0.3);
        }
        .header p {
            font-size: 1.2em;
            opacity: 0.9;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 0 20px;
        }
        .search-container {
            margin-bottom: 30px;
        }
        .search-box {
            width: 100%;
            max-width: 500px;
            margin: 0 auto;
            display: block;
            padding: 15px 20px;
            font-size: 16px;
            border: none;
            border-radius: 50px;
            background: rgba(255, 255, 255, 0.95);
            box-shadow: 0 4px 15px rgba(0,0,0,0.1);
            outline: none;
            transition: all 0.3s ease;
        }
        .search-box:focus {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(0,0,0,0.15);
        }
        .tools-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
            margin-bottom: 40px;
        }
        .tool-card {
            background: white;
            border-radius: 15px;
            padding: 25px;
            box-shadow: 0 8px 25px rgba(0,0,0,0.1);
            transition: all 0.3s ease;
            cursor: pointer;
            position: relative;
            overflow: hidden;
        }
        .tool-card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 4px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }
        .tool-card:hover {
            transform: translateY(-8px);
            box-shadow: 0 15px 35px rgba(0,0,0,0.15);
        }
        .tool-card h3 {
            color: #2d3748;
            margin-bottom: 10px;
            font-size: 1.3em;
            font-weight: 600;
        }
        .tool-card p {
            color: #718096;
            line-height: 1.5;
            margin-bottom: 15px;
        }
        .tool-tags {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
        }
        .tag {
            background: #e3f2fd;
            color: #1565c0;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 0.8em;
            font-weight: 500;
        }
        .empty-state {
            text-align: center;
            padding: 60px 20px;
            color: white;
        }
        .empty-state h2 {
            font-size: 2em;
            margin-bottom: 15px;
            font-weight: 300;
        }
        .empty-state p {
            font-size: 1.1em;
            opacity: 0.8;
        }
        .add-tool-btn {
            background: rgba(255, 255, 255, 0.2);
            color: white;
            border: 2px solid rgba(255, 255, 255, 0.3);
            padding: 12px 30px;
            border-radius: 50px;
            font-size: 1em;
            cursor: pointer;
            margin-top: 20px;
            transition: all 0.3s ease;
        }
        .add-tool-btn:hover {
            background: rgba(255, 255, 255, 0.3);
            border-color: rgba(255, 255, 255, 0.5);
            transform: translateY(-2px);
        }
        .no-results {
            text-align: center;
            padding: 40px;
            color: white;
            display: none;
        }
        .footer {
            text-align: center;
            padding: 40px 20px;
            color: rgba(255, 255, 255, 0.7);
            font-size: 0.9em;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>Helpful Tools v2</h1>
        <p>Your minimal collection of web development utilities</p>
    </div>
    
    <div class="container">
        <div class="search-container">
            <input type="text" class="search-box" placeholder="Search tools..." id="searchInput">
        </div>
        
        <div class="tools-grid" id="toolsGrid">
            {% if tools %}
                {% for tool in tools %}
                <div class="tool-card" onclick="openTool('{{ tool.path }}')">
                    <h3>{{ tool.icon }} {{ tool.name }}</h3>
                    <p>{{ tool.description }}</p>
                    <div class="tool-tags">
                        {% for tag in tool.tags %}
                        <span class="tag">{{ tag }}</span>
                        {% endfor %}
                    </div>
                </div>
                {% endfor %}
            {% endif %}
        </div>
        
        <div class="no-results" id="noResults">
            <h3>No tools found</h3>
            <p>Try adjusting your search terms</p>
        </div>
        
        {% if not tools %}
        <div class="empty-state">
            <h2>Welcome to Helpful Tools v2</h2>
            <p>This is a clean slate ready for your awesome tools!</p>
            <p>Start by adding your first tool to see it appear here.</p>
            <button class="add-tool-btn" onclick="showAddToolInfo()">Ready to add tools</button>
        </div>
        {% endif %}
    </div>
    
    <div class="footer">
        <p>Helpful Tools v2 - Minimal & Clean | Built with Flask</p>
    </div>

    <script>
        function openTool(path) {
            window.location.href = path;
        }
        
        function showAddToolInfo() {
            alert('Tools can be added by modifying the TOOLS list in main.py');
        }
        
        // Search functionality
        document.getElementById('searchInput').addEventListener('input', function(e) {
            const searchTerm = e.target.value.toLowerCase();
            const toolCards = document.querySelectorAll('.tool-card');
            const noResults = document.getElementById('noResults');
            let visibleCount = 0;
            
            toolCards.forEach(card => {
                const title = card.querySelector('h3').textContent.toLowerCase();
                const description = card.querySelector('p').textContent.toLowerCase();
                const tags = Array.from(card.querySelectorAll('.tag')).map(tag => tag.textContent.toLowerCase()).join(' ');
                
                if (title.includes(searchTerm) || description.includes(searchTerm) || tags.includes(searchTerm)) {
                    card.style.display = 'block';
                    visibleCount++;
                } else {
                    card.style.display = 'none';
                }
            });
            
            noResults.style.display = visibleCount === 0 && searchTerm.trim() !== '' ? 'block' : 'none';
        });
    </script>
</body>
</html>
'''

@app.route('/')
def dashboard():
    return render_template_string(DASHBOARD_TEMPLATE, tools=TOOLS)

@app.route('/api/tools')
def api_tools():
    return jsonify({'tools': TOOLS})

# History API Routes
@app.route('/api/history/<tool_name>', methods=['POST'])
def add_history(tool_name):
    if not validate_tool_name(tool_name):
        return jsonify({'error': 'Invalid tool name'}), 400
    
    try:
        data = request.json
        if not data or 'data' not in data:
            return jsonify({'error': 'Missing data field'}), 400
        
        input_data = sanitize_data(data['data'])
        operation = data.get('operation', 'process')
        
        result = history_manager.add_history_entry(tool_name, input_data, operation)
        return jsonify(result)
        
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/history/<tool_name>', methods=['GET'])
def get_history(tool_name):
    if not validate_tool_name(tool_name):
        return jsonify({'error': 'Invalid tool name'}), 400
    
    limit = request.args.get('limit', type=int)
    history = history_manager.get_history(tool_name, limit)
    
    return jsonify({
        'tool': tool_name,
        'history': history,
        'count': len(history)
    })

@app.route('/api/history/<tool_name>/<entry_id>', methods=['GET'])
def get_history_entry(tool_name, entry_id):
    if not validate_tool_name(tool_name):
        return jsonify({'error': 'Invalid tool name'}), 400
    
    entry = history_manager.get_history_entry(tool_name, entry_id)
    if not entry:
        return jsonify({'error': 'History entry not found'}), 404
    
    return jsonify(entry)

@app.route('/api/history/<tool_name>/<entry_id>', methods=['DELETE'])
def delete_history_entry(tool_name, entry_id):
    if not validate_tool_name(tool_name):
        return jsonify({'error': 'Invalid tool name'}), 400
    
    try:
        success = history_manager.delete_history_entry(tool_name, entry_id)
        if success:
            return jsonify({'success': True, 'message': 'History entry deleted'})
        else:
            return jsonify({'error': 'History entry not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/history/<tool_name>', methods=['DELETE'])
def clear_history(tool_name):
    if not validate_tool_name(tool_name):
        return jsonify({'error': 'Invalid tool name'}), 400
    
    result = history_manager.clear_history(tool_name)
    return jsonify(result)

@app.route('/api/history/stats')
def history_stats():
    return jsonify(history_manager.get_all_history_stats())

# Global history API endpoints
@app.route('/api/global-history', methods=['GET'])
def get_global_history():
    """Get global history across all tools"""
    try:
        limit = request.args.get('limit', type=int)
        history = history_manager.get_global_history(limit)
        
        return jsonify({
            "success": True,
            "history": history,
            "count": len(history)
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/global-history/<entry_id>', methods=['GET'])
def get_global_history_entry(entry_id):
    """Get specific global history entry"""
    try:
        entry = history_manager.get_global_history_entry(entry_id)
        if entry:
            return jsonify(entry)
        return jsonify({"error": "Entry not found"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/global-history/<entry_id>', methods=['DELETE'])
def delete_global_history_entry(entry_id):
    """Delete specific global history entry"""
    try:
        success = history_manager.delete_global_history_entry(entry_id)
        if success:
            return jsonify({'success': True, 'message': 'Global history entry deleted'})
        else:
            return jsonify({'error': 'Global history entry not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/global-history', methods=['POST'])
def add_global_history():
    """Add entry to global history"""
    try:
        data = request.json
        if not data:
            return jsonify({"success": False, "error": "No data provided"}), 400
        
        result = history_manager.add_global_history_entry(
            data.get('tool', 'unknown'),
            data.get('data', {}),
            data.get('timestamp')
        )
        return jsonify(result)
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/global-history', methods=['DELETE'])
def clear_global_history():
    """Clear all global history"""
    try:
        result = history_manager.clear_global_history()
        return jsonify(result)
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

# Regex API Routes
@app.route('/api/regex/explain', methods=['POST'])
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

@app.route('/api/regex/test', methods=['POST'])
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

# Text Diff API Routes
@app.route('/api/text-diff/compare', methods=['POST'])
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

def preprocess_texts(text1: str, text2: str, ignore_whitespace: bool, ignore_case: bool) -> tuple:
    """Preprocess texts based on comparison options"""
    if ignore_case:
        text1 = text1.lower()
        text2 = text2.lower()
    
    if ignore_whitespace:
        # Normalize whitespace - replace multiple spaces/tabs with single space
        import re
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

def generate_character_diff_html(text1: str, text2: str) -> (str, str):
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

# Format Conversion API Routes
@app.route('/api/convert', methods=['POST'])
def api_convert():
    """Convert data between JSON, YAML, and XML formats"""
    try:
        data = request.json
        if not data:
            return jsonify({'success': False, 'error': 'No data provided'}), 400
        
        input_data = data.get('data', '')
        input_format = data.get('input_format', 'auto')
        output_format = data.get('output_format', '')
        
        if not input_data.strip():
            return jsonify({'success': False, 'error': 'No input data provided'}), 400
        
        if not output_format:
            return jsonify({'success': False, 'error': 'Output format is required'}), 400
        
        result = convert_format(input_data, input_format, output_format)
        
        if result['success']:
            return jsonify(result)
        else:
            return jsonify(result), 400
            
    except Exception as e:
        return jsonify({'success': False, 'error': f'Server error: {str(e)}'}), 500

@app.route('/api/validate', methods=['POST'])
def api_validate():
    """Validate data format"""
    try:
        data = request.json
        if not data:
            return jsonify({'valid': False, 'error': 'No data provided'}), 400
        
        input_data = data.get('data', '')
        format_type = data.get('format', '')
        
        if not input_data.strip():
            return jsonify({'valid': False, 'error': 'No input data provided'}), 400
        
        if not format_type:
            return jsonify({'valid': False, 'error': 'Format type is required'}), 400
        
        result = validate_format(input_data, format_type)
        return jsonify(result)
        
    except Exception as e:
        return jsonify({'valid': False, 'error': f'Server error: {str(e)}'}), 500

@app.route('/api/detect-format', methods=['POST'])
def api_detect_format():
    """Detect format of input data"""
    try:
        data = request.json
        if not data:
            return jsonify({'format': 'unknown', 'error': 'No data provided'}), 400
        
        input_data = data.get('data', '')
        
        if not input_data.strip():
            return jsonify({'format': 'unknown', 'error': 'No input data provided'}), 400
        
        detected_format = converter.detect_format(input_data)
        
        return jsonify({
            'format': detected_format,
            'success': detected_format != 'unknown'
        })
        
    except Exception as e:
        return jsonify({'format': 'unknown', 'error': f'Server error: {str(e)}'}), 500

# Tool Routes
@app.route('/tools/<tool_name>')
def serve_tool(tool_name):
    # Get the directory where main.py is located
    app_dir = Path(__file__).parent.parent
    tool_file = app_dir / "frontend" / "tools" / f"{tool_name}.html"
    if not tool_file.exists():
        abort(404)
    
    with open(tool_file, 'r', encoding='utf-8') as f:
        return f.read()

# Static files are now handled automatically by Flask's built-in static file serving

@app.route('/health')
def health():
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.now().isoformat(),
        'tools_count': len(TOOLS),
        'history_stats': history_manager.get_all_history_stats()
    })

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

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=8000, debug=True)