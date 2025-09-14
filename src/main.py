import os
import json
import uuid
import configparser
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

# Import sources package
from sources import SourceFactory, SourceConfig, create_source

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

# Helper function to convert legacy source data to new SourceConfig format
def convert_to_source_config(source_data: Dict[str, Any]) -> SourceConfig:
    """Convert legacy source data format to new SourceConfig format."""
    # Handle both old and new structure
    if 'staticConfig' in source_data and 'pathTemplate' in source_data:
        # New structure with dynamic variables
        static_config = source_data.get('staticConfig', {})
        path_template = source_data.get('pathTemplate', '')
        dynamic_variables = source_data.get('dynamicVariables', {})
    else:
        # Old structure - backward compatibility
        # Try to infer static config and path from config
        config = source_data.get('config', {})
        source_type = source_data.get('type', source_data.get('source_type', ''))
        
        # Extract path/URL based on source type
        if source_type == 'local_file':
            path_template = config.get('path', '')
        elif source_type == 's3':
            bucket = config.get('bucket', '')
            key = config.get('key', '')
            path_template = f"s3://{bucket}/{key}" if bucket and key else config.get('url', '')
        elif source_type == 'sftp':
            host = config.get('host', '')
            path = config.get('path', '')
            path_template = f"sftp://{host}{path}" if host else path
        elif source_type == 'samba':
            host = config.get('host', '')
            share = config.get('share', '')
            path = config.get('path', '')
            path_template = f"smb://{host}/{share}{path}" if host and share else path
        elif source_type == 'http':
            path_template = config.get('url', config.get('path', ''))
        else:
            path_template = config.get('path', config.get('url', ''))
        
        # Static config excludes the path/url
        static_config = {k: v for k, v in config.items() 
                        if k not in ['path', 'url', 'bucket', 'key']}
        dynamic_variables = {}

    # Handle level - only valid if is_directory is True, max 5 levels
    is_directory = source_data.get('is_directory', False)
    level = 0
    if is_directory:
        level = min(max(source_data.get('level', 0), 0), 5)  # Clamp between 0 and 5
    
    return SourceConfig(
        source_id=source_data.get('source_id', source_data.get('id', str(uuid.uuid4()))),
        name=source_data.get('name', 'Untitled Source'),
        source_type=source_data.get('type', source_data.get('source_type', '')),
        static_config=static_config,
        path_template=path_template,
        dynamic_variables=dynamic_variables,
        created_at=datetime.fromisoformat(source_data['created_at']) if source_data.get('created_at') else datetime.now(),
        updated_at=datetime.fromisoformat(source_data['updated_at']) if source_data.get('updated_at') else datetime.now(),
        last_accessed=datetime.fromisoformat(source_data['last_accessed']) if source_data.get('last_accessed') else None,
        last_tested=datetime.fromisoformat(source_data['last_tested']) if source_data.get('last_tested') else None,
        status=source_data.get('status', 'created'),
        is_directory=is_directory,
        level=level
    )

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
    },
    {
        "name": "Sources Manager",
        "description": "Manage data sources from various locations: local files, S3, SFTP, Samba, HTTP URLs with secure credential management",
        "path": "/tools/sources",
        "tags": ["sources", "data", "s3", "sftp", "samba", "http", "files", "credentials"],
        "has_history": True,
        "icon": "🗄️"
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

# Component routes
@app.route('/components/<component_name>')
def serve_component(component_name):
    """Serve reusable component files"""
    # Get the directory where main.py is located
    app_dir = Path(__file__).parent.parent
    component_file = app_dir / "frontend" / "components" / component_name
    if not component_file.exists():
        abort(404)
    
    with open(component_file, 'r', encoding='utf-8') as f:
        return f.read()

# Sources API Routes
@app.route('/api/sources/aws-profiles', methods=['GET'])
def get_aws_profiles():
    """Get AWS profiles from ~/.aws/credentials"""
    try:
        credentials_path = Path.home() / '.aws' / 'credentials'
        if not credentials_path.exists():
            return jsonify({'profiles': [], 'error': 'AWS credentials file not found'})
        
        config = configparser.ConfigParser()
        config.read(credentials_path)
        
        profiles = []
        for section in config.sections():
            profiles.append({
                'name': section,
                'has_access_key': 'aws_access_key_id' in config[section],
                'region': config[section].get('region', 'us-east-1')
            })
        
        return jsonify({'profiles': profiles})
        
    except Exception as e:
        return jsonify({'profiles': [], 'error': str(e)})

@app.route('/api/sources/ssh-keys', methods=['GET'])
def get_ssh_keys():
    """Get SSH keys from ~/.ssh directory"""
    try:
        ssh_path = Path.home() / '.ssh'
        if not ssh_path.exists():
            return jsonify({'keys': [], 'error': 'SSH directory not found'})
        
        keys = []
        for key_file in ssh_path.glob('*'):
            if key_file.is_file() and not key_file.name.endswith('.pub'):
                # Check if it's likely a private key
                try:
                    with open(key_file, 'r') as f:
                        first_line = f.readline().strip()
                        if 'PRIVATE KEY' in first_line:
                            keys.append({
                                'name': key_file.name,
                                'path': str(key_file),
                                'type': 'rsa' if 'RSA' in first_line else 'other'
                            })
                except:
                    continue
        
        return jsonify({'keys': keys})
        
    except Exception as e:
        return jsonify({'keys': [], 'error': str(e)})

@app.route('/api/sources', methods=['POST'])
def create_source():
    """Create a new data source"""
    try:
        data = request.json
        if not data:
            return jsonify({'success': False, 'error': 'No data provided'}), 400
        
        source_type = data.get('type')
        if not source_type:
            return jsonify({'success': False, 'error': 'Source type is required'}), 400
            
        source_name = data.get('name')
        if not source_name:
            return jsonify({'success': False, 'error': 'Source name is required'}), 400
        
        # Handle both old and new structure
        if 'staticConfig' in data and 'pathTemplate' in data:
            # New structure with dynamic variables
            static_config = data.get('staticConfig', {})
            path_template = data.get('pathTemplate', '')
            dynamic_variables = data.get('dynamicVariables', {})
            
            # Resolve the path template with dynamic variables
            resolved_path = resolve_dynamic_path(path_template, dynamic_variables)
            
            # Merge static config with resolved path based on source type
            config = static_config.copy()
            if source_type == 'local_file':
                config['path'] = resolved_path
            elif source_type == 's3':
                # Parse s3://bucket/key format
                if resolved_path.startswith('s3://'):
                    parts = resolved_path[5:].split('/', 1)
                    config['bucket'] = parts[0] if parts else ''
                    config['key'] = parts[1] if len(parts) > 1 else ''
                else:
                    config['key'] = resolved_path
            elif source_type == 'sftp':
                config['path'] = resolved_path
            elif source_type == 'samba':
                config['path'] = resolved_path  
            elif source_type == 'http':
                config['url'] = resolved_path
        else:
            # Old structure - backward compatibility
            config = data.get('config', {})
            path_template = config.get('path', config.get('url', config.get('key', '')))
            dynamic_variables = {}
            static_config = {}
        
        # Generate unique ID
        source_id = str(uuid.uuid4())[:8]
        
        # Handle directory and level attributes
        is_directory = data.get('is_directory', False)
        level = 0
        if is_directory:
            level = min(max(data.get('level', 0), 0), 5)  # Clamp between 0 and 5
        
        source = {
            'id': source_id,
            'type': source_type,
            'name': source_name,
            'config': config,
            'staticConfig': static_config,
            'pathTemplate': path_template,
            'dynamicVariables': dynamic_variables,
            'created_at': datetime.now().isoformat(),
            'updated_at': datetime.now().isoformat(),
            'last_accessed': None,
            'last_tested': None,
            'status': 'created',
            'is_directory': is_directory,
            'level': level
        }
        
        # Store source
        sources = get_stored_sources()
        sources[source_id] = source
        store_sources(sources)
        
        return jsonify({
            'success': True,
            'id': source_id,
            'source': source
        }), 201
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/sources', methods=['GET'])
def get_sources():
    """Get all data sources"""
    try:
        sources = get_stored_sources()
        
        # Add expiry information to each source
        sources_with_expiry = []
        for source in sources.values():
            source_with_expiry = source.copy()
            source_with_expiry['expiry'] = get_source_expiry_info(source)
            sources_with_expiry.append(source_with_expiry)
        
        return jsonify({'success': True, 'sources': sources_with_expiry})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/sources/<source_id>', methods=['GET'])
def get_source(source_id):
    """Get a specific data source"""
    try:
        sources = get_stored_sources()
        if source_id not in sources:
            return jsonify({'success': False, 'error': 'Source not found'}), 404
        
        source = sources[source_id].copy()
        source['expiry'] = get_source_expiry_info(sources[source_id])
        
        return jsonify(source)
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/sources/<source_id>/expiry', methods=['GET'])
def get_source_expiry(source_id):
    """Get expiry information for a specific source"""
    try:
        sources = get_stored_sources()
        if source_id not in sources:
            return jsonify({'success': False, 'error': 'Source not found'}), 404
        
        expiry_info = get_source_expiry_info(sources[source_id])
        return jsonify({'success': True, 'expiry': expiry_info})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/sources/<source_id>', methods=['DELETE'])
def delete_source(source_id):
    """Delete a data source"""
    try:
        sources = get_stored_sources()
        if source_id not in sources:
            return jsonify({'success': False, 'error': 'Source not found'}), 404
        
        del sources[source_id]
        store_sources(sources)
        
        return jsonify({'success': True, 'message': 'Source deleted'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/sources/<source_id>/duplicate', methods=['POST'])
def duplicate_source(source_id):
    """Duplicate an existing data source"""
    try:
        sources = get_stored_sources()
        if source_id not in sources:
            return jsonify({'success': False, 'error': 'Source not found'}), 404

        original_source = sources[source_id]
        
        new_source = original_source.copy()
        new_source['id'] = str(uuid.uuid4())[:8]
        new_source['name'] = f"{original_source.get('name', 'Source')} (copy)"
        new_source['created_at'] = datetime.now().isoformat()
        new_source['updated_at'] = datetime.now().isoformat()
        new_source['last_accessed'] = None
        new_source['last_tested'] = None
        new_source['status'] = 'created'

        sources[new_source['id']] = new_source
        store_sources(sources)

        return jsonify({'success': True, 'source': new_source}), 201

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/sources/<source_id>', methods=['PUT'])
def update_source(source_id):
    """Update an existing data source"""
    try:
        data = request.get_json()
        
        # Validate required fields
        if not data.get('name') or not data.get('type'):
            return jsonify({'success': False, 'error': 'Missing required fields: name and type'}), 400
        
        sources = get_stored_sources()
        if source_id not in sources:
            return jsonify({'success': False, 'error': 'Source not found'}), 404
        
        source_type = data['type']
        
        # Handle both old and new structure
        if 'staticConfig' in data and 'pathTemplate' in data:
            # New structure with dynamic variables
            static_config = data.get('staticConfig', {})
            path_template = data.get('pathTemplate', '')
            dynamic_variables = data.get('dynamicVariables', {})
            
            # Resolve the path template with dynamic variables
            resolved_path = resolve_dynamic_path(path_template, dynamic_variables)
            
            # Merge static config with resolved path based on source type
            config = static_config.copy()
            if source_type == 'local_file':
                config['path'] = resolved_path
            elif source_type == 's3':
                # Parse s3://bucket/key format
                if resolved_path.startswith('s3://'):
                    parts = resolved_path[5:].split('/', 1)
                    config['bucket'] = parts[0] if parts else ''
                    config['key'] = parts[1] if len(parts) > 1 else ''
                else:
                    config['key'] = resolved_path
            elif source_type == 'sftp':
                config['path'] = resolved_path
            elif source_type == 'samba':
                config['path'] = resolved_path  
            elif source_type == 'http':
                config['url'] = resolved_path
        else:
            # Old structure - backward compatibility
            config = data.get('config', {})
            path_template = config.get('path', config.get('url', config.get('key', '')))
            dynamic_variables = {}
            static_config = {}
        
        # Handle directory and level attributes
        is_directory = data.get('is_directory', False)
        level = 0
        if is_directory:
            level = min(max(data.get('level', 0), 0), 5)  # Clamp between 0 and 5
        
        # Update the source
        updated_source = {
            'id': source_id,
            'name': data['name'],
            'type': source_type,
            'config': config,
            'staticConfig': static_config,
            'pathTemplate': path_template,
            'dynamicVariables': dynamic_variables,
            'status': 'created',  # Reset status when updated
            'created_at': sources[source_id]['created_at'],  # Keep original creation time
            'updated_at': datetime.now().isoformat(),
            'last_tested': None,  # Reset test status
            'is_directory': is_directory,
            'level': level
        }
        
        sources[source_id] = updated_source
        store_sources(sources)
        
        return jsonify({
            'success': True, 
            'message': 'Source updated successfully',
            'source': updated_source
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/sources/<source_id>/test', methods=['POST'])
def test_source_endpoint(source_id):
    """Test connection to a data source"""
    try:
        sources = get_stored_sources()
        if source_id not in sources:
            return jsonify({'success': False, 'error': 'Source not found'}), 404
        
        source = sources[source_id]
        source_type = source['type']
        config = source['config']
        
        # Test based on source type using the new source package
        test_result = test_source_connection(source_type, config, source)
        
        # Update source status
        sources[source_id]['status'] = 'connected' if test_result['success'] else 'error'
        sources[source_id]['last_tested'] = datetime.now().isoformat()
        store_sources(sources)
        
        return jsonify(test_result)
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

def test_source_connection(source_type, config, source_data=None):
    """Test connection using the new source package"""
    try:
        # Convert source data to SourceConfig format
        if source_data:
            source_config = convert_to_source_config(source_data)
        else:
            # Create a minimal SourceConfig from the old format
            source_config = SourceConfig(
                source_id=str(uuid.uuid4()),
                name='Test Source',
                source_type=source_type,
                static_config=config,
                path_template=config.get('path', config.get('url', '')),
                dynamic_variables={},
                created_at=datetime.now(),
                updated_at=datetime.now()
            )
        
        # Create source instance and test connection
        source = SourceFactory.create_source(source_config)
        test_result = source.test_connection()
        
        # Convert ConnectionTestResult to dictionary format expected by the API
        return {
            'success': test_result.success,
            'status': test_result.status,
            'message': test_result.message,
            'response_time': test_result.response_time,
            'error': test_result.error,
            'metadata': test_result.metadata.__dict__ if test_result.metadata else None
        }
    except Exception as e:
        return {'success': False, 'error': f'Test failed: {str(e)}'}

# NOTE: Vestigial connection test functions removed - now handled by sources package

def resolve_dynamic_path(path_template, dynamic_variables):
    """Resolve dynamic variables in a path template"""
    import re
    resolved_path = path_template

    # Find all variables in format $variableName
    variables = re.findall(r'\$(\w+)', path_template)

    for var in variables:
        value = dynamic_variables.get(var, '')
        resolved_path = resolved_path.replace(f'${var}', value)

    return resolved_path

def extract_dynamic_variables(path_template):
    """Extract dynamic variable names from a path template"""
    import re
    return re.findall(r'\$(\w+)', path_template)

@app.route('/api/sources/resolve-variables', methods=['POST'])
def resolve_variables():
    """Extract dynamic variables from a path template"""
    try:
        try:
            data = request.get_json(force=True)
        except Exception:
            return jsonify({'success': False, 'error': 'Invalid JSON format'}), 400
            
        if not data:
            return jsonify({'success': False, 'error': 'No data provided'}), 400
            
        path_template = data.get('pathTemplate')
        if path_template is None:
            return jsonify({'success': False, 'error': 'pathTemplate field is required'}), 400
            
        if not path_template.strip():
            return jsonify({'success': False, 'error': 'pathTemplate cannot be empty'}), 400
        
        variables = extract_dynamic_variables(path_template)
        
        return jsonify({
            'success': True,
            'variables': variables
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

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

def get_stored_sources():
    """Get sources from storage file"""
    try:
        sources_file = Path.home() / '.helpful-tools' / 'sources.json'
        if not sources_file.exists():
            return {}
        
        with open(sources_file, 'r') as f:
            return json.load(f)
    except:
        return {}

def store_sources(sources):
    """Store sources to storage file"""
    try:
        storage_dir = Path.home() / '.helpful-tools'
        storage_dir.mkdir(exist_ok=True)
        
        sources_file = storage_dir / 'sources.json'
        with open(sources_file, 'w') as f:
            json.dump(sources, f, indent=2)
    except Exception as e:
        print(f"Error storing sources: {e}")

def get_source_expiry_info(source_data):
    """Get expiry information for a source"""
    try:
        # Convert to SourceConfig and create source instance
        source_config = convert_to_source_config(source_data)
        source_instance = SourceFactory.create_source(source_config)
        
        # Check if source supports expiry
        supports_expiry = source_instance.supports_expiry()
        
        if not supports_expiry:
            return {
                'supports_expiry': False,
                'status': 'not_supported'
            }
        
        # Get expiry time
        expiry_time = source_instance.get_expiry_time()
        
        if expiry_time is None:
            return {
                'supports_expiry': True,
                'status': 'no_expiration',
                'expiry_time': None
            }
        
        # Return expiry information
        return {
            'supports_expiry': True,
            'status': 'expires',
            'expiry_time': expiry_time.isoformat(),
            'expiry_timestamp': expiry_time.timestamp()
        }
        
    except Exception as e:
        return {
            'supports_expiry': False,
            'status': 'error',
            'error': str(e)
        }

@app.route('/api/sources/<source_id>/browse', methods=['GET'])
def browse_source_directory(source_id):
    """Browse directory structure for local file sources"""
    try:
        sources = get_stored_sources()
        if source_id not in sources:
            return jsonify({'success': False, 'error': 'Source not found'}), 404

        source = sources[source_id]
        source_type = source.get('type')
        config = source.get('config', {})
        
        # Support local file and S3 sources
        if source_type not in ['local_file', 's3']:
            return jsonify({'success': False, 'error': 'Directory browsing only supported for local file and S3 sources'}), 400
        
        # Convert to SourceConfig and create source instance
        source_config = convert_to_source_config(source)
        source_instance = SourceFactory.create_source(source_config)
        
        base_path = source_config.get_resolved_path()
        
        if source_type == 'local_file':
            # Handle local file sources
            if not base_path:
                return jsonify({'success': False, 'error': 'No path specified in source'}), 400
            
            # Expand user path
            base_path = os.path.expanduser(base_path)
            
            if not os.path.exists(base_path):
                return jsonify({'success': False, 'error': f'Path does not exist: {base_path}'}), 404
            
            if not os.path.isdir(base_path):
                return jsonify({'success': False, 'error': 'Source path is not a directory'}), 400
            
            # Get requested path from query parameter (for lazy loading)
            requested_path = request.args.get('path', '')
            current_path = os.path.join(base_path, requested_path) if requested_path else base_path
            current_path = os.path.normpath(current_path)
            
            # Security check - ensure we don't go outside base path
            # Normalize base_path for proper comparison
            normalized_base_path = os.path.normpath(base_path)
            if not current_path.startswith(normalized_base_path):
                return jsonify({'success': False, 'error': 'Access denied'}), 403
            
            # Get directory contents using source-specific level configuration
            # For local file sources, we need to pass the full current_path when browsing subdirectories
            if requested_path:
                tree_data = source_instance.explore_directory_tree(current_path)
            else:
                tree_data = source_instance.explore_directory_tree(None)
            
        elif source_type == 's3':
            # Handle S3 sources
            if not source_instance.is_directory():
                return jsonify({'success': False, 'error': 'S3 source is not a directory/prefix'}), 400
            
            # Get requested prefix from query parameter
            requested_prefix = request.args.get('path', '')
            current_path = base_path  # For S3, base_path is the S3 URL
            
            # Get S3 directory contents using source-specific level configuration
            tree_data = source_instance.explore_directory_tree(requested_prefix if requested_prefix else None)
        
        return jsonify({
            'success': True,
            'base_path': base_path,
            'current_path': current_path,
            'tree': tree_data
        })
        
    except Exception as e:
        # Provide more user-friendly error messages for common directory browsing issues
        error_message = str(e)
        if 'permission denied' in error_message.lower():
            error_message = 'Permission denied accessing the directory'
        elif 'no such file or directory' in error_message.lower():
            error_message = 'Directory path not found'
        elif 'connection' in error_message.lower() or 'timeout' in error_message.lower():
            error_message = 'Failed to connect to the source'
        elif 'credentials' in error_message.lower() or 'unauthorized' in error_message.lower():
            error_message = 'Invalid or expired credentials'
        return jsonify({'success': False, 'error': error_message}), 500

# NOTE: Directory tree functions removed - now handled by sources package

@app.route('/api/sources/<source_id>/file', methods=['GET'])
def get_source_file_data(source_id):
    """Get data from a specific file within a source directory"""
    try:
        sources = get_stored_sources()
        if source_id not in sources:
            return jsonify({'success': False, 'error': 'Source not found'}), 404

        source = sources[source_id]
        source_type = source.get('type')
        
        # Support local file and S3 sources
        if source_type not in ['local_file', 's3']:
            return jsonify({'success': False, 'error': 'File browsing only supported for local file and S3 sources'}), 400
        
        # Get the specific file path from query parameter
        file_path = request.args.get('path')
        if not file_path:
            return jsonify({'success': False, 'error': 'File path parameter required'}), 400
        
        # Convert to SourceConfig and create source instance
        source_config = convert_to_source_config(source)
        source_instance = SourceFactory.create_source(source_config)
        
        if source_type == 'local_file':
            base_path = source_config.get_resolved_path()
            
            # Expand user path and construct full path
            base_path = os.path.expanduser(base_path)
            full_path = os.path.normpath(os.path.join(base_path, file_path))
            
            # Security check - ensure we don't go outside base path
            normalized_base_path = os.path.normpath(base_path)
            if not full_path.startswith(normalized_base_path):
                return jsonify({'success': False, 'error': 'Access denied'}), 403
            
            if not os.path.exists(full_path):
                return jsonify({'success': False, 'error': 'File not found'}), 404
            
            if os.path.isdir(full_path):
                return jsonify({'success': False, 'error': 'Path is a directory, not a file'}), 400
            
            # Read and return file content
            try:
                with open(full_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                return content, 200, {'Content-Type': 'text/plain'}
            except UnicodeDecodeError:
                # Handle binary files
                try:
                    with open(full_path, 'rb') as f:
                        content = f.read()
                    return content, 200, {'Content-Type': 'application/octet-stream'}
                except Exception:
                    return jsonify({'success': False, 'error': 'Failed to read file'}), 500
                
        elif source_type == 's3':
            # Handle S3 file reading
            try:
                # Parse the S3 path from the source configuration
                base_s3_path = source_config.get_resolved_path()
                if not base_s3_path.startswith('s3://'):
                    return jsonify({'success': False, 'error': 'Invalid S3 path in source'}), 400

                # Create a new S3 source for the specific file
                file_source_config = SourceConfig(
                    source_id=source_config.source_id,
                    name=source_config.name,
                    source_type='s3',
                    static_config=source_config.static_config,
                    path_template=file_path,
                    dynamic_variables={},
                    created_at=source_config.created_at,
                    updated_at=source_config.updated_at
                )
                
                file_source = SourceFactory.create_source(file_source_config)
                
                # Check if it's a file (not directory)
                if not file_source.is_file():
                    return jsonify({'success': False, 'error': 'Path is not a file'}), 400
                
                # Read file content
                content = file_source.read_data(mode='text')
                return content, 200, {'Content-Type': 'text/plain'}
                
            except Exception as e:
                if 'decode' in str(e).lower():
                    # Try binary mode for non-text files
                    try:
                        content = file_source.read_data(mode='binary')
                        return content, 200, {'Content-Type': 'application/octet-stream'}
                    except:
                        pass
                return jsonify({'success': False, 'error': f'Failed to read S3 file: {str(e)}'}), 500
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/sources/<source_id>/fetch', methods=['GET'])
def fetch_source_data(source_id):
    """Fetch data from a source - auto-detects files vs directories"""
    try:
        sources = get_stored_sources()
        if source_id not in sources:
            return jsonify({'success': False, 'error': 'Source not found'}), 404

        source = sources[source_id]
        
        # Convert to SourceConfig and create source instance
        source_config = convert_to_source_config(source)
        source_instance = SourceFactory.create_source(source_config)
        
        # Check if source is a directory
        if source_instance.is_directory():
            # Return directory tree structure for browsing
            try:
                base_path = source_config.get_resolved_path()
                
                # Use source-specific level configuration for directory exploration
                if source_instance.is_listable():
                    tree_data = source_instance.explore_directory_tree()
                else:
                    # Fallback for sources that don't support directory listing
                    tree_data = []
                
                return jsonify({
                    'success': True,
                    'type': 'directory',
                    'base_path': base_path,
                    'tree': tree_data
                })
            except Exception as e:
                return jsonify({'success': False, 'error': f'Error reading directory: {str(e)}'}), 500
        
        elif source_instance.is_file():
            # Return file content directly
            try:
                data = source_instance.read_data(mode='text')
                return data, 200, {'Content-Type': 'text/plain'}
            except Exception as e:
                return jsonify({'success': False, 'error': f'Error reading file: {str(e)}'}), 500
        
        else:
            return jsonify({'success': False, 'error': 'Source is neither a file nor directory'}), 400
        
    except Exception as e:
        # Provide more user-friendly error messages for common file access issues
        error_message = str(e)
        if 'permission denied' in error_message.lower():
            error_message = 'Permission denied accessing the file or directory'
        elif 'no such file or directory' in error_message.lower():
            error_message = 'File or directory not found'
        elif 'connection' in error_message.lower() or 'timeout' in error_message.lower():
            error_message = 'Failed to connect to the source'
        elif 'credentials' in error_message.lower() or 'unauthorized' in error_message.lower():
            error_message = 'Invalid or expired credentials'
        return jsonify({'success': False, 'error': error_message}), 500

@app.route('/api/sources/<source_id>/data', methods=['GET'])
def get_source_data(source_id):
    """Get data from a specific source"""
    try:
        sources = get_stored_sources()
        if source_id not in sources:
            return jsonify({'success': False, 'error': 'Source not found'}), 404

        source = sources[source_id]
        source_type = source.get('type')
        config = source.get('config', {})

        # Use the new source system for all source types
        try:
            source_config = convert_to_source_config(source)
            source_instance = SourceFactory.create_source(source_config)
            
            # Read data using the source implementation
            data = source_instance.read_data(mode='text')
            
            if not data:
                return jsonify({'success': False, 'error': 'Source returned empty data'}), 400
                
        except Exception as source_error:
            # Fallback to legacy local file handling for backward compatibility
            if source_type == 'local_file':
                file_path = config.get('path')
                if file_path:
                    file_path = os.path.expanduser(file_path)
                if file_path and os.path.exists(file_path):
                    with open(file_path, 'r', encoding='utf-8') as f:
                        data = f.read()
                    if not data:
                        return jsonify({'success': False, 'error': 'Source file is empty'}), 400
                else:
                    return jsonify({'success': False, 'error': 'File not found'}), 404
            else:
                return jsonify({'success': False, 'error': f'Error reading {source_type} source: {str(source_error)}'}), 500

        return data, 200, {'Content-Type': 'text/plain'}

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=8000, debug=True)