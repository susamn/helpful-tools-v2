import os
import json
from datetime import datetime
from pathlib import Path
from flask import Flask, render_template_string, request, jsonify, send_file, abort

# Import history manager
from api.history import history_manager, validate_tool_name, sanitize_data
import difflib
from typing import List, Dict, Any

app = Flask(__name__)

# Create directories
os.makedirs("static", exist_ok=True)
os.makedirs("static/css", exist_ok=True)
os.makedirs("static/js", exist_ok=True)
os.makedirs("logs", exist_ok=True)
os.makedirs("tools", exist_ok=True)

# Store for tools configuration
TOOLS = [
    {
        "name": "JSON Formatter",
        "description": "Format, validate, and minify JSON data with history tracking",
        "path": "/tools/json-formatter",
        "tags": ["formatter", "json", "validator"],
        "has_history": True
    },
    {
        "name": "JSON-YAML-XML Converter",
        "description": "Bidirectional conversion between JSON, YAML, and XML formats with syntax highlighting",
        "path": "/tools/json-yaml-xml-converter",
        "tags": ["converter", "json", "yaml", "xml", "format"],
        "has_history": True
    },
    {
        "name": "Text Diff Tool",
        "description": "Compare two text files side-by-side with inline highlighting of differences",
        "path": "/tools/text-diff",
        "tags": ["diff", "compare", "text", "files"],
        "has_history": True
    },
    {
        "name": "Regex Tester",
        "description": "Interactive regex testing tool with live highlighting, group visualization, and match details",
        "path": "/tools/regex-tester",
        "tags": ["regex", "pattern", "match", "test", "validation"],
        "has_history": True
    },
    {
        "name": "Cron Parser",
        "description": "Parse and analyze cron expressions with human-readable descriptions and next execution times",
        "path": "/tools/cron-parser",
        "tags": ["cron", "scheduler", "parser", "time", "unix"],
        "has_history": True
    },
    {
        "name": "Scientific Calculator",
        "description": "Advanced calculator with scientific functions and interactive graph plotter for mathematical expressions",
        "path": "/tools/scientific-calculator",
        "tags": ["calculator", "math", "science", "graph", "plotter", "functions"],
        "has_history": True
    },
    {
        "name": "JWT Decoder",
        "description": "Decode and analyze JWT (JSON Web Tokens) with syntax highlighting, validation, and timestamp formatting",
        "path": "/tools/jwt-decoder",
        "tags": ["jwt", "decoder", "token", "security", "json", "auth"],
        "has_history": True
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
                    <h3>{{ tool.name }}</h3>
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

# Text Diff API Routes
@app.route('/api/text-diff/compare', methods=['POST'])
def compare_texts():
    """Compare two texts and return diff with character-level changes"""
    try:
        data = request.json
        if not data or 'text1' not in data or 'text2' not in data:
            return jsonify({'success': False, 'error': 'Missing text1 or text2'}), 400
            
        text1 = data['text1']
        text2 = data['text2']
        
        # Generate line-by-line diff with character-level changes
        diff_result = generate_diff(text1, text2)
        
        return jsonify({
            'success': True,
            'diff': diff_result['lines'],
            'stats': diff_result['stats']
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

def generate_character_diff_html(text1: str, text2: str) -> (str, str):
    """Generate character-level diff as an HTML string."""
    res1 = []
    res2 = []
    i = 0
    j = 0
    while i < len(text1) or j < len(text2):
        if i < len(text1) and j < len(text2) and text1[i] == text2[j]:
            res1.append(text1[i])
            res2.append(text2[j])
            i += 1
            j += 1
        else:
            if i < len(text1):
                res1.append(f'<span class="char-delete">{text1[i]}</span>')
                i += 1
            if j < len(text2):
                res2.append(f'<span class="char-insert">{text2[j]}</span>')
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

def generate_character_diff(text1: str, text2: str) -> List[Dict[str, Any]]:
    """Generate character-level diff as a list of dictionaries."""
    matcher = difflib.SequenceMatcher(None, text1, text2)
    
    result = []
    
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == 'equal':
            result.append({'type': 'equal', 'content': text1[i1:i2]})
        elif tag == 'delete':
            result.append({'type': 'delete', 'content': text1[i1:i2]})
        elif tag == 'insert':
            result.append({'type': 'insert', 'content': text2[j1:j2]})
        elif tag == 'replace':
            result.append({'type': 'delete', 'content': text1[i1:i2]})
            result.append({'type': 'insert', 'content': text2[j1:j2]})
            
    return result

# Tool Routes
@app.route('/tools/<tool_name>')
def serve_tool(tool_name):
    # Get the directory where main.py is located
    app_dir = Path(__file__).parent
    tool_file = app_dir / "tools" / f"{tool_name}.html"
    if not tool_file.exists():
        abort(404)
    
    with open(tool_file, 'r', encoding='utf-8') as f:
        return f.read()

# Static file routes
@app.route('/static/<path:filename>')
def static_files(filename):
    return send_file(f"static/{filename}")

@app.route('/health')
def health():
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.now().isoformat(),
        'tools_count': len(TOOLS),
        'history_stats': history_manager.get_all_history_stats()
    })

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=8000, debug=True)