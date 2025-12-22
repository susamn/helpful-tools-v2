import os
import hashlib
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
from sources.base import PaginationOptions, PaginatedResult

# Import validation system
from validators import get_validator_types, create_validator, ValidationError
from validators.manager import ValidatorManager

from utils.encryption import encrypt_data, decrypt_data

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

# Load tool configuration from config.json
def load_tool_config():
    """Load tool configuration from config/config.json"""
    config_file = app_root / "config" / "config.json"
    if config_file.exists():
        try:
            with open(config_file, 'r', encoding='utf-8') as f:
                config = json.load(f)
                return config.get('tools', {})
        except (json.JSONDecodeError, IOError):
            pass
    return {}

TOOL_CONFIG = load_tool_config()

def is_tool_enabled(tool_id):
    """Check if a tool is enabled in config. Defaults to True if not specified."""
    tool_conf = TOOL_CONFIG.get(tool_id, {})
    return tool_conf.get('enabled', True)

def get_enabled_tools(tools_list):
    """Filter tools list to only include enabled tools."""
    return [tool for tool in tools_list if is_tool_enabled(tool.get('id', ''))]

# Load source types configuration
def load_source_types_config():
    """Load source types configuration from config/config.json"""
    config_file = app_root / "config" / "config.json"
    if config_file.exists():
        try:
            with open(config_file, 'r', encoding='utf-8') as f:
                config = json.load(f)
                return config.get('source_types', {})
        except (json.JSONDecodeError, IOError):
            pass
    return {}

SOURCE_TYPES_CONFIG = load_source_types_config()

def is_source_type_enabled(source_type):
    """Check if a source type is enabled in config. Defaults to True if not specified."""
    type_conf = SOURCE_TYPES_CONFIG.get(source_type, {})
    return type_conf.get('enabled', True)

def get_enabled_source_types():
    """Get list of enabled source types."""
    return [st for st, conf in SOURCE_TYPES_CONFIG.items() if conf.get('enabled', True)]

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
        "id": "workflow-processor",
        "name": "Workflow Processor",
        "description": "Process large files with a workflow of operators (format, minify, etc.) on the backend",
        "path": "/tools/workflow-processor",
        "tags": ["workflow", "process", "backend", "large-files"],
        "has_history": False,
        "icon": "⚙️"
    },
    {
        "id": "scratchpad",
        "name": "Scratchpad",
        "description": "Simple note-taking tool for viewing and storing data with history tracking",
        "path": "/tools/scratchpad",
        "tags": ["notes", "text", "viewer", "scratchpad"],
        "has_history": True,
        "icon": "📝"
    },
    {
        "id": "json-tool",
        "name": "JSON Tool",
        "description": "Format, validate, and minify JSON data with history tracking",
        "path": "/tools/json-tool",
        "tags": ["formatter", "json", "validator"],
        "has_history": True,
        "icon": "📄"
    },
    {
        "id": "yaml-tool",
        "name": "YAML Tool",
        "description": "Format, validate, and minify YAML data with syntax highlighting",
        "path": "/tools/yaml-tool",
        "tags": ["formatter", "yaml", "validator"],
        "has_history": True,
        "icon": "📋"
    },
    {
        "id": "json-yaml-xml-converter",
        "name": "JSON-YAML-XML Converter",
        "description": "Bidirectional conversion between JSON, YAML, and XML formats with syntax highlighting",
        "path": "/tools/json-yaml-xml-converter",
        "tags": ["converter", "json", "yaml", "xml", "format"],
        "has_history": True,
        "icon": "🔄"
    },
    {
        "id": "text-diff",
        "name": "Text Diff Tool",
        "description": "Compare two text files side-by-side with inline highlighting of differences",
        "path": "/tools/text-diff",
        "tags": ["diff", "compare", "text", "files"],
        "has_history": True,
        "icon": "⚖️"
    },
    {
        "id": "regex-tester",
        "name": "Regex Tester",
        "description": "Interactive regex testing tool with live highlighting, group visualization, and match details",
        "path": "/tools/regex-tester",
        "tags": ["regex", "pattern", "match", "test", "validation"],
        "has_history": True,
        "icon": "🔍"
    },
    {
        "id": "cron-parser",
        "name": "Cron Parser",
        "description": "Parse and analyze cron expressions with human-readable descriptions and next execution times",
        "path": "/tools/cron-parser",
        "tags": ["cron", "scheduler", "parser", "time", "unix"],
        "has_history": True,
        "icon": "⏰"
    },
    {
        "id": "scientific-calculator",
        "name": "Scientific Calculator",
        "description": "Advanced calculator with scientific functions and interactive graph plotter for mathematical expressions",
        "path": "/tools/scientific-calculator",
        "tags": ["calculator", "math", "science", "graph", "plotter", "functions"],
        "has_history": True,
        "icon": "🧮"
    },
    {
        "id": "jwt-decoder",
        "name": "JWT Decoder",
        "description": "Decode and analyze JWT (JSON Web Tokens) with syntax highlighting, validation, and timestamp formatting",
        "path": "/tools/jwt-decoder",
        "tags": ["jwt", "decoder", "token", "security", "json", "auth"],
        "has_history": True,
        "icon": "🔑"
    },
    {
        "id": "sources",
        "name": "Sources Manager",
        "description": "Manage data sources from various locations: local files, S3, SFTP, Samba, HTTP URLs with secure credential management",
        "path": "/tools/sources",
        "tags": ["sources", "data", "s3", "sftp", "samba", "http", "files", "credentials"],
        "has_history": True,
        "icon": "🗄️"
    },
    {
        "id": "aws-sf-viewer",
        "name": "AWS Step Functions Viewer",
        "description": "Visualize AWS Step Functions state machines with interactive graph rendering, state details, and multiple layout options",
        "path": "/tools/aws-sf-viewer",
        "tags": ["aws", "step-functions", "state-machine", "visualization", "graph", "workflow"],
        "has_history": False,
        "icon": "🔀"
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
    return render_template_string(DASHBOARD_TEMPLATE, tools=get_enabled_tools(TOOLS))

@app.route('/api/tools')
def api_tools():
    return jsonify({'tools': get_enabled_tools(TOOLS)})

@app.route('/api/source-types')
def api_source_types():
    """Return enabled source types and their configuration."""
    enabled_types = []
    for source_type, config in SOURCE_TYPES_CONFIG.items():
        if config.get('enabled', True):
            enabled_types.append({
                'type': source_type,
                'description': config.get('description', '')
            })
    return jsonify({'source_types': enabled_types, 'enabled': get_enabled_source_types()})

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
        # Check if entry is starred before attempting delete
        entry = history_manager.get_history_entry(tool_name, entry_id)
        if entry:
            # Get the full entry to check starred status
            full_entry = None
            if tool_name in history_manager.history_data:
                for e in history_manager.history_data[tool_name]:
                    if e["id"] == entry_id:
                        full_entry = e
                        break

            if full_entry and full_entry.get("starred", False):
                return jsonify({'error': 'Cannot delete starred items. Remove the star first.'}), 403

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

@app.route('/api/history/<tool_name>/<entry_id>/star', methods=['PUT'])
def toggle_star_history_entry(tool_name, entry_id):
    """Toggle star status for a local history entry"""
    if not validate_tool_name(tool_name):
        return jsonify({'error': 'Invalid tool name'}), 400

    try:
        data = request.get_json()
        if data is None or 'starred' not in data:
            return jsonify({'error': 'Missing starred field'}), 400

        starred = bool(data['starred'])
        success = history_manager.update_star_status(tool_name, entry_id, starred)

        if success:
            return jsonify({
                'success': True,
                'message': f'Entry {"starred" if starred else "unstarred"} successfully'
            })
        else:
            return jsonify({'error': 'Entry not found'}), 404

    except Exception as e:
        return jsonify({'error': str(e)}), 500

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
        # Check if entry is starred before attempting delete
        entry = history_manager.get_global_history_entry(entry_id)
        if entry:
            # Get the full entry to check starred status
            full_entry = None
            for e in history_manager.global_history:
                if e["id"] == entry_id:
                    full_entry = e
                    break

            if full_entry and full_entry.get("starred", False):
                return jsonify({'error': 'Cannot delete starred items. Remove the star first.'}), 403

        success = history_manager.delete_global_history_entry(entry_id)
        if success:
            return jsonify({'success': True, 'message': 'Global history entry deleted'})
        else:
            return jsonify({'error': 'Global history entry not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/global-history/<entry_id>/star', methods=['PUT'])
def toggle_star_global_history_entry(entry_id):
    """Toggle star status for a global history entry"""
    try:
        data = request.get_json()
        if data is None or 'starred' not in data:
            return jsonify({'error': 'Missing starred field'}), 400

        starred = bool(data['starred'])
        success = history_manager.update_global_star_status(entry_id, starred)

        if success:
            return jsonify({
                'success': True,
                'message': f'Entry {"starred" if starred else "unstarred"} successfully'
            })
        else:
            return jsonify({'error': 'Entry not found'}), 404

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

# Data Storage API Routes
@app.route('/api/data/<tool_name>', methods=['POST'])
def add_data(tool_name):
    """Add a new data entry with description"""
    if not validate_tool_name(tool_name):
        return jsonify({'error': 'Invalid tool name'}), 400

    try:
        data = request.json
        if not data or 'data' not in data or 'description' not in data:
            return jsonify({'error': 'Missing data or description field'}), 400

        input_data = sanitize_data(data['data'])
        description = data['description'].strip()

        if not description:
            return jsonify({'error': 'Description cannot be empty'}), 400

        result = history_manager.add_data_entry(tool_name, input_data, description)
        return jsonify(result)

    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/data/<tool_name>', methods=['GET'])
def get_data(tool_name):
    """Get all data entries for a tool"""
    if not validate_tool_name(tool_name):
        return jsonify({'error': 'Invalid tool name'}), 400

    limit = request.args.get('limit', type=int)
    data_list = history_manager.get_data(tool_name, limit)

    return jsonify({
        'tool': tool_name,
        'data': data_list,
        'count': len(data_list)
    })

@app.route('/api/data/<tool_name>/<entry_id>', methods=['GET'])
def get_data_entry(tool_name, entry_id):
    """Get specific data entry"""
    if not validate_tool_name(tool_name):
        return jsonify({'error': 'Invalid tool name'}), 400

    entry = history_manager.get_data_entry(tool_name, entry_id)
    if not entry:
        return jsonify({'error': 'Data entry not found'}), 404

    return jsonify(entry)

@app.route('/api/data/<tool_name>/<entry_id>', methods=['DELETE'])
def delete_data_entry(tool_name, entry_id):
    """Delete specific data entry"""
    if not validate_tool_name(tool_name):
        return jsonify({'error': 'Invalid tool name'}), 400

    try:
        success = history_manager.delete_data_entry(tool_name, entry_id)
        if success:
            return jsonify({'success': True, 'message': 'Data entry deleted'})
        else:
            return jsonify({'error': 'Data entry not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/data/<tool_name>', methods=['DELETE'])
def clear_data(tool_name):
    """Clear all data for a tool"""
    if not validate_tool_name(tool_name):
        return jsonify({'error': 'Invalid tool name'}), 400

    result = history_manager.clear_data(tool_name)
    return jsonify(result)

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

import csv
import io
try:
    import tomllib
except ImportError:
    # Fallback for older Python versions
    try:
        import tomli as tomllib
    except ImportError:
        tomllib = None

try:
    import tomli_w
except ImportError:
    tomli_w = None

CONFIG_DIR = Path.home() / ".config" / "helpful-tools"
CONFIG_DIR.mkdir(parents=True, exist_ok=True)

FILE_CACHE_DIR = CONFIG_DIR / "file_cache"
FILE_CACHE_DIR.mkdir(parents=True, exist_ok=True)

WORKFLOW_RESULT_DIR = CONFIG_DIR / "workflow_results"
WORKFLOW_RESULT_DIR.mkdir(parents=True, exist_ok=True)

def get_cached_file_path(source_id: str, file_path: str) -> Path:
    """Generate a cache file path based on source and file path"""
    # Create a unique key
    key = f"{source_id}:{file_path}"
    filename = hashlib.md5(key.encode()).hexdigest()
    return FILE_CACHE_DIR / filename

# Workflow Processor API Routes
@app.route('/api/workflow/clear', methods=['DELETE'])
def clear_workflow():
    """Clear workflow cache (downloaded files) and results"""
    try:
        # Clear file cache
        if FILE_CACHE_DIR.exists():
            for f in FILE_CACHE_DIR.glob('*'):
                if f.is_file():
                    try:
                        f.unlink()
                    except Exception as e:
                        print(f"Failed to delete {f}: {e}")
        
        # Clear result cache
        if WORKFLOW_RESULT_DIR.exists():
            for f in WORKFLOW_RESULT_DIR.glob('*'):
                if f.is_file():
                    try:
                        f.unlink()
                    except Exception as e:
                        print(f"Failed to delete {f}: {e}")
                        
        return jsonify({'success': True, 'message': 'Workflow cache cleared'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/workflow/run', methods=['POST'])
def run_workflow():
    """Run a processing workflow on a file from a source"""
    try:
        data = request.json
        if not data:
            return jsonify({'success': False, 'error': 'No data provided'}), 400
        
        source_id = data.get('source_id')
        workflow = data.get('workflow', [])
        enable_pagination = data.get('enable_pagination', True)
        
        # This might be a full path for local files or a key for S3
        file_path = data.get('file_path') 
        
        if not source_id:
            return jsonify({'success': False, 'error': 'Source ID is required'}), 400
            
        sources = get_stored_sources()
        if source_id not in sources:
            return jsonify({'success': False, 'error': 'Source not found'}), 404
            
        source_data = sources[source_id]
        
        # If file_path is provided, we need to adjust the source config to point to this specific file
        if file_path:
            # Create a copy to avoid modifying the stored source
            import copy
            source_data = copy.deepcopy(source_data)
            
            # Update path/key based on source type
            source_type = source_data.get('type')
            config = source_data.get('config', {})
            
            if source_type == 'local_file':
                config['path'] = file_path
            elif source_type == 's3':
                if file_path.startswith('s3://'):
                     parts = file_path[5:].split('/', 1)
                     if len(parts) == 2:
                         config['bucket'] = parts[0]
                         config['key'] = parts[1]
                else:
                     config['key'] = file_path
            
            # Update the config in source_data
            source_data['config'] = config
            if 'staticConfig' in source_data:
                 if source_type == 'local_file':
                     source_data['pathTemplate'] = file_path
                 elif source_type == 's3':
                     source_data['pathTemplate'] = file_path if file_path.startswith('s3://') else f"s3://{config.get('bucket')}/{file_path}"
            
            # Important: Set is_directory to False because we are targeting a specific file
            source_data['is_directory'] = False

        # Create source instance
        try:
            source_config = convert_to_source_config(source_data)
            source_instance = SourceFactory.create_source(source_config)
        except Exception as e:
             return jsonify({'success': False, 'error': f'Failed to initialize source: {str(e)}'}), 500

        # Read content with caching (encrypted)
        try:
            cache_path = get_cached_file_path(source_id, file_path or 'main')
            
            # Check cache (valid for 1 hour)
            if cache_path.exists() and (time.time() - cache_path.stat().st_mtime < 3600):
                # Read from cache
                try:
                    with open(cache_path, 'rb') as f:
                        encrypted_content = f.read()
                    
                    decrypted_content = decrypt_data(encrypted_content)
                    
                    try:
                        content = decrypted_content.decode('utf-8')
                    except UnicodeDecodeError:
                        content = decrypted_content
                except Exception as cache_read_err:
                    print(f"Cache read/decrypt failed, re-fetching: {cache_read_err}")
                    # Fallback to fetch if cache corrupted/decryption fails
                    content = source_instance.read_data()
                    try:
                        data_to_encrypt = content.encode('utf-8') if isinstance(content, str) else content
                        encrypted = encrypt_data(data_to_encrypt)
                        with open(cache_path, 'wb') as f:
                            f.write(encrypted)
                    except Exception:
                        pass
            else:
                content = source_instance.read_data()
                try:
                    data_to_encrypt = content.encode('utf-8') if isinstance(content, str) else content
                    encrypted = encrypt_data(data_to_encrypt)
                    with open(cache_path, 'wb') as f:
                        f.write(encrypted)
                except Exception as cache_err:
                    print(f"Warning: Failed to write to cache: {cache_err}")
                    
        except Exception as e:
            return jsonify({'success': False, 'error': f'Failed to read file: {str(e)}'}), 500
            
        # Process workflow
        run_id = str(uuid.uuid4())
        
        # Save initial content
        initial_result_id = f"{run_id}_initial"
        initial_file = WORKFLOW_RESULT_DIR / f"{initial_result_id}.txt"
        try:
            mode = 'w' if isinstance(content, str) else 'wb'
            encoding = 'utf-8' if isinstance(content, str) else None
            with open(initial_file, mode, encoding=encoding) as f:
                f.write(content)
        except Exception as save_err:
            print(f"Failed to save initial result: {save_err}")

        process_result = process_workflow_logic(content, workflow, run_id=run_id)
        
        if 'error' in process_result:
             return jsonify({'success': False, 'error': process_result['error'], 'step_index': process_result.get('step_index')}), 400
             
        result_content = process_result['result']
        step_results = process_result.get('step_results', [])
        
        # Handle large results
        # Threshold: 50KB
        CHUNK_SIZE = 50 * 1024 
        
        # Convert to string if it's an object (it should be string from process_workflow_logic usually, but let's be safe)
        if not isinstance(result_content, str) and not isinstance(result_content, bytes):
             result_content = json.dumps(result_content, indent=2)
             
        content_len = len(result_content)
        
        response_data = {
            'success': True,
            'result_id': run_id, # Use run_id as the base for the final result too
            'initial_result_id': initial_result_id,
            'initial_size': len(content),
            'step_results': step_results,
            'has_more': False
        }
        
        if enable_pagination and content_len > CHUNK_SIZE:
            # Save final result to result cache using run_id
            result_file = WORKFLOW_RESULT_DIR / f"{run_id}.txt"
            
            mode = 'w' if isinstance(result_content, str) else 'wb'
            encoding = 'utf-8' if isinstance(result_content, str) else None
            
            with open(result_file, mode, encoding=encoding) as f:
                f.write(result_content)
                
            # Return first chunk
            first_chunk = result_content[:CHUNK_SIZE]
            
            response_data['result'] = first_chunk
            response_data['has_more'] = True
            response_data['offset'] = CHUNK_SIZE
            response_data['total_size'] = content_len
        else:
            response_data['result'] = result_content
            
        return jsonify(response_data)

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/workflow/result/<result_id>', methods=['GET'])
def get_workflow_result(result_id):
    """Get a chunk of a workflow result"""
    try:
        offset = request.args.get('offset', type=int, default=0)
        limit = request.args.get('limit', type=int, default=50 * 1024) # 50KB default
        
        result_file = WORKFLOW_RESULT_DIR / f"{result_id}.txt"
        
        if not result_file.exists():
            return jsonify({'success': False, 'error': 'Result expired or not found'}), 404
            
        # Determine if file is text or binary (try text first)
        try:
            with open(result_file, 'r', encoding='utf-8') as f:
                f.seek(0, 2) # Seek end
                total_size = f.tell()
                f.seek(offset)
                chunk = f.read(limit)
                
            return jsonify({
                'success': True,
                'chunk': chunk,
                'has_more': (offset + len(chunk)) < total_size,
                'offset': offset + len(chunk),
                'total_size': total_size
            })
        except UnicodeDecodeError:
             # Binary fallback
             with open(result_file, 'rb') as f:
                f.seek(0, 2)
                total_size = f.tell()
                f.seek(offset)
                chunk = f.read(limit)
                
                # Convert bytes to base64 or string for JSON
                # For simplicity in this tool context, we decode latin-1 or handle as text if possible
                # But workflow output is usually text (JSON/XML/YAML).
                return jsonify({
                    'success': True,
                    'chunk': chunk.decode('utf-8', errors='replace'),
                    'has_more': (offset + len(chunk)) < total_size,
                    'offset': offset + len(chunk),
                    'total_size': total_size
                })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/workflow/suggest', methods=['POST'])
def suggest_workflow_jsonpath():
    """Get JSONPath suggestions for a file"""
    try:
        data = request.json
        if not data:
            return jsonify({'success': False, 'error': 'No data provided'}), 400
            
        source_id = data.get('source_id')
        file_path = data.get('file_path')
        query = data.get('query', '')
        
        if not source_id:
            return jsonify({'success': False, 'error': 'Source ID is required'}), 400
            
        sources = get_stored_sources()
        if source_id not in sources:
            return jsonify({'success': False, 'error': 'Source not found'}), 404
            
        source_data = sources[source_id]
        
        # Configure source to point to specific file if needed
        if file_path:
            import copy
            source_data = copy.deepcopy(source_data)
            source_type = source_data.get('type')
            config = source_data.get('config', {})
            
            if source_type == 'local_file':
                config['path'] = file_path
            elif source_type == 's3':
                if file_path.startswith('s3://'):
                     parts = file_path[5:].split('/', 1)
                     if len(parts) == 2:
                         config['bucket'] = parts[0]
                         config['key'] = parts[1]
                else:
                     config['key'] = file_path
            
            source_data['config'] = config
            if 'staticConfig' in source_data:
                 if source_type == 'local_file':
                     source_data['pathTemplate'] = file_path
                 elif source_type == 's3':
                     source_data['pathTemplate'] = file_path if file_path.startswith('s3://') else f"s3://{config.get('bucket')}/{file_path}"
            
            source_data['is_directory'] = False

        # Create source instance and read data
        try:
            source_config = convert_to_source_config(source_data)
            source_instance = SourceFactory.create_source(source_config)
            
            # Read first N bytes/chars to avoid loading massive files just for suggestions
            # For accurate suggestions we might need full structure, but for huge files it's a tradeoff.
            # Let's try reading full file but with a size limit or handle it gracefully.
            # For now, read full (as per "download the file in backend" instruction).
            content = source_instance.read_data(mode='text')
            
            # Parse JSON
            json_data = json.loads(content)
            
            # Generate suggestions
            suggestions = get_jsonpath_suggestions(json_data, query)
            
            return jsonify({'success': True, 'suggestions': suggestions})
            
        except Exception as e:
            # If parsing fails or file read fails, return empty suggestions or error
            # print(f"Suggestion error: {e}")
            return jsonify({'success': False, 'suggestions': [], 'error': str(e)})

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

def get_jsonpath_suggestions(data, query):
    """Generate JSONPath suggestions based on partial query"""
    suggestions = []
    query = query.strip()
    
    try:
        import jsonpath_ng
        from jsonpath_ng import parse
    except ImportError:
        return [{'text': 'Error: jsonpath-ng not installed', 'value': ''}]

    # Handle root
    if not query or query == '$':
        if isinstance(data, dict):
            return [{'text': k, 'displayText': k, 'type': 'property'} for k in data.keys()]
        return []

    # Determine parent path and prefix
    # Simple heuristic: split by last dot or bracket
    # This is a basic implementation and might not cover all edge cases
    
    # Check if we are typing a property after dot
    if query.endswith('.'):
        parent_path = query[:-1]
        prefix = ""
    else:
        # Find last dot
        last_dot = query.rfind('.')
        last_bracket = query.rfind('[')
        
        sep_index = max(last_dot, last_bracket)
        
        if sep_index == -1:
            # Maybe just starting? e.g. "st" -> match root keys
            parent_path = '$'
            prefix = query if query.startswith('$') else query # if query is "$st", parent is $, prefix is st. Wait.
            # If query is "store", we assume relative to root $
            if not query.startswith('$'):
                 parent_path = '$'
                 prefix = query
            elif query == '$':
                 parent_path = '$'
                 prefix = ""
            else:
                 # query starts with $ but has no separators?? "$store"
                 # parent is root, prefix is "store" (minus $)
                 parent_path = '$'
                 prefix = query[1:]
        else:
            parent_path = query[:sep_index]
            prefix = query[sep_index+1:]
            
            # If separator was '[', we might be inside a string like ['foo
            # This is complex to parse with simple string ops.
            # Let's support dot notation primarily for now.
    
    # Clean up parent path
    if not parent_path: parent_path = '$'
    
    try:
        # Evaluate parent path
        jsonpath_expr = parse(parent_path)
        matches = [match.value for match in jsonpath_expr.find(data)]
        
        seen_keys = set()
        
        for match in matches:
            if isinstance(match, dict):
                for key in match.keys():
                    if key.startswith(prefix) and key not in seen_keys:
                        suggestions.append({
                            'text': key,
                            'displayText': key,
                            'type': 'property',
                            'insertText': key[len(prefix):] # Append the rest of the key
                        })
                        seen_keys.add(key)
            elif isinstance(match, list):
                # Suggest array indices or wildcard
                if not prefix:
                    if '[*]' not in seen_keys:
                        suggestions.append({
                            'text': '[*]',
                            'displayText': '[*] (All items)',
                            'type': 'array_wildcard',
                            'insertText': '[*]'
                        })
                        seen_keys.add('[*]')
                    # Maybe suggest first few indices
                    for i in range(min(len(match), 3)):
                        s_text = f'[{i}]'
                        if s_text not in seen_keys:
                            suggestions.append({
                                'text': s_text,
                                'displayText': s_text,
                                'type': 'array_element',
                                'insertText': s_text
                            })
                            seen_keys.add(s_text)
                            
    except Exception as e:
        # print(f"Path evaluation error: {e}")
        pass
        
    return suggestions

def process_workflow_logic(content, workflow, run_id=None):
    current_data = content
    step_results = []
    
    # Ensure initial data is string if possible, or handle bytes
    if isinstance(current_data, bytes):
        try:
            current_data = current_data.decode('utf-8')
        except UnicodeDecodeError:
            pass # Keep as bytes if it's binary
            
    for i, step in enumerate(workflow):
        operator = step.get('operator')
        param = step.get('param')
        
        try:
            if operator == 'json_format':
                try:
                    # Try standard JSON first
                    obj = json.loads(current_data)
                    current_data = json.dumps(obj, indent=2)
                except json.JSONDecodeError:
                    # Try JSONL
                    try:
                        lines = [line for line in current_data.strip().split('\n') if line.strip()]
                        if not lines: raise ValueError("Empty data")
                        
                        formatted_rows = []
                        for line in lines:
                            obj = json.loads(line)
                            formatted_rows.append(json.dumps(obj, indent=2))
                        
                        # Join with an empty line between rows (\n\n)
                        current_data = '\n\n'.join(formatted_rows)
                    except (json.JSONDecodeError, ValueError) as e:
                        # If JSONL parsing fails, re-raise the original error or a generic one
                        return {'error': f'Data is not valid JSON or JSONL: {str(e)}', 'step_index': i}
                
            elif operator == 'json_minify':
                try:
                    obj = json.loads(current_data)
                    current_data = json.dumps(obj, separators=(',', ':'))
                except json.JSONDecodeError:
                    # Try JSONL
                    try:
                        lines = [line for line in current_data.strip().split('\n') if line.strip()]
                        if not lines: raise ValueError("Empty data")
                        
                        minified_rows = []
                        for line in lines:
                            obj = json.loads(line)
                            minified_rows.append(json.dumps(obj, separators=(',', ':')))
                        
                        # Join with double newline (\n\n) to always leave an empty row between rows
                        current_data = '\n\n'.join(minified_rows)
                    except (json.JSONDecodeError, ValueError) as e:
                        return {'error': f'Data is not valid JSON or JSONL: {str(e)}', 'step_index': i}
                
            elif operator == 'json_stringify':
                current_data = json.dumps(current_data)
                
            elif operator == 'xml_to_json':
                current_data = converter.xml_to_json(current_data)
                
            elif operator == 'yaml_to_json':
                current_data = converter.yaml_to_json(current_data)

            elif operator == 'csv_to_json':
                f = io.StringIO(current_data)
                reader = csv.DictReader(f)
                rows = list(reader)
                current_data = json.dumps(rows, indent=2)
                
            elif operator == 'csv_to_yaml':
                f = io.StringIO(current_data)
                reader = csv.DictReader(f)
                rows = list(reader)
                # Need to use yaml from converter, but main.py doesn't import yaml directly usually
                # converter.json_to_yaml takes string.
                current_data = converter.json_to_yaml(json.dumps(rows))
                
            elif operator == 'csv_to_xml':
                f = io.StringIO(current_data)
                reader = csv.DictReader(f)
                rows = list(reader)
                current_data = converter.json_to_xml(json.dumps(rows))

            elif operator == 'json_to_xml':
                current_data = converter.json_to_xml(current_data)
                
            elif operator == 'json_to_yaml':
                current_data = converter.json_to_yaml(current_data)
                
            elif operator == 'json_to_toml':
                if not tomli_w:
                    return {'error': 'tomli-w library not installed', 'step_index': i}
                obj = json.loads(current_data)
                current_data = tomli_w.dumps(obj)
                
            elif operator == 'toml_to_json':
                if not tomllib:
                    return {'error': 'tomllib (or tomli) library not installed', 'step_index': i}
                obj = tomllib.loads(current_data)
                current_data = json.dumps(obj, indent=2)
                
            elif operator == 'jsonpath':
                # Basic JSONPath implementation if jsonpath-ng is missing
                try:
                    import jsonpath_ng
                    from jsonpath_ng import parse
                    
                    json_data = None
                    is_jsonl = False
                    
                    # Try parsing as standard JSON first
                    try:
                        json_data = json.loads(current_data)
                    except json.JSONDecodeError:
                        # Try parsing as JSONL
                        try:
                            lines = current_data.strip().split('\n')
                            json_data = [json.loads(line) for line in lines if line.strip()]
                            if len(json_data) > 1: # Heuristic: single line might just be JSON
                                is_jsonl = True
                        except json.JSONDecodeError:
                            return {'error': 'Data is not valid JSON or JSONL', 'step_index': i}

                    jsonpath_expr = parse(param)
                    
                    if is_jsonl:
                        # Apply to each row
                        all_matches = []
                        for row in json_data:
                            matches = [match.value for match in jsonpath_expr.find(row)]
                            if matches:
                                all_matches.extend(matches)
                        current_data = json.dumps(all_matches, indent=2)
                    else:
                        # Apply to single object
                        matches = [match.value for match in jsonpath_expr.find(json_data)]
                        current_data = json.dumps(matches, indent=2)
                        
                except ImportError:
                    return {'error': 'JSONPath library (jsonpath-ng) not installed on server', 'step_index': i}
            
            elif operator == 'custom_function':
                # Handle custom functions: uniq, sort, keys, values, etc.
                try:
                    json_data = json.loads(current_data)
                    
                    if param == 'uniq':
                        # Unique elements in list
                        if isinstance(json_data, list):
                            # Handle unhashable types (dicts) by serializing
                            seen = set()
                            new_list = []
                            for item in json_data:
                                # Simple serialization for comparison
                                s_item = json.dumps(item, sort_keys=True)
                                if s_item not in seen:
                                    seen.add(s_item)
                                    new_list.append(item)
                            json_data = new_list
                            
                    elif param == 'sort':
                        # Sort list
                        if isinstance(json_data, list):
                            # Basic sort - might fail for mixed types
                            try:
                                json_data.sort()
                            except TypeError:
                                # Fallback: sort by string representation
                                json_data.sort(key=lambda x: str(x))
                                
                    elif param == 'keys':
                        if isinstance(json_data, dict):
                            json_data = list(json_data.keys())
                        elif isinstance(json_data, list):
                            # Collect keys from all objects in list
                            keys = set()
                            for item in json_data:
                                if isinstance(item, dict):
                                    keys.update(item.keys())
                            json_data = list(keys)
                            
                    elif param == 'values':
                        if isinstance(json_data, dict):
                            json_data = list(json_data.values())
                        elif isinstance(json_data, list):
                            vals = []
                            for item in json_data:
                                if isinstance(item, dict):
                                    vals.extend(item.values())
                            json_data = vals
                            
                    elif param == 'flatten':
                        if isinstance(json_data, list):
                            # Simple one-level flatten
                            flat = []
                            for item in json_data:
                                if isinstance(item, list):
                                    flat.extend(item)
                                else:
                                    flat.append(item)
                            json_data = flat
                            
                    elif param == 'count':
                        if isinstance(json_data, list):
                            json_data = len(json_data)
                        elif isinstance(json_data, dict):
                            json_data = len(json_data)
                        else:
                            json_data = 1
                            
                    elif param == 'first':
                        if isinstance(json_data, list) and len(json_data) > 0:
                            json_data = json_data[0]
                            
                    elif param == 'last':
                        if isinstance(json_data, list) and len(json_data) > 0:
                            json_data = json_data[-1]
                            
                    elif param == 'reverse':
                        if isinstance(json_data, list):
                            json_data.reverse()
                            
                    else:
                        return {'error': f'Unknown custom function: {param}', 'step_index': i}
                        
                    current_data = json.dumps(json_data, indent=2)
                    
                except json.JSONDecodeError:
                    return {'error': 'Data is not valid JSON, cannot apply custom function', 'step_index': i}
            
            # Save intermediate result
            if run_id:
                step_result_id = f"{run_id}_step_{i}"
                step_file = WORKFLOW_RESULT_DIR / f"{step_result_id}.txt"
                
                try:
                    mode = 'w' if isinstance(current_data, str) else 'wb'
                    encoding = 'utf-8' if isinstance(current_data, str) else None
                    with open(step_file, mode, encoding=encoding) as f:
                        f.write(current_data)
                    
                    step_results.append({
                        'step_index': i,
                        'result_id': step_result_id,
                        'size': len(current_data)
                    })
                except Exception as save_err:
                    print(f"Failed to save step result: {save_err}")

        except Exception as e:
            return {'error': f'Step {operator} ({param}) failed: {str(e)}', 'step_index': i}
            
    return {'result': current_data, 'step_results': step_results}

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
    # Check if tool is enabled in config
    if not is_tool_enabled(tool_name):
        abort(404)

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
            
            # Update is_directory based on actual source logic to fix legacy config
            try:
                conf = convert_to_source_config(source)
                inst = SourceFactory.create_source(conf)
                source_with_expiry['is_directory'] = inst.is_directory()
            except Exception:
                pass
                
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
        test_result = check_source_connection(source_type, config, source)
        
        # Update source status
        sources[source_id]['status'] = 'connected' if test_result['success'] else 'error'
        sources[source_id]['last_tested'] = datetime.now().isoformat()
        store_sources(sources)
        
        return jsonify(test_result)
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

def check_source_connection(source_type, config, source_data=None):
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

        # Additional validation for directory sources
        additional_warnings = []
        if source_config.is_directory:
            # Check if source supports directory listing when configured as directory
            if not source.is_listable():
                additional_warnings.append(f"Warning: Source type '{source_type}' does not support directory listing but is configured as a directory")

            # For local files, check if path actually exists and is a directory
            if source_type == 'local_file' and test_result.success:
                try:
                    resolved_path = source_config.get_resolved_path()
                    if resolved_path:
                        import os
                        expanded_path = os.path.expanduser(resolved_path)
                        if not os.path.exists(expanded_path):
                            additional_warnings.append(f"Warning: Path does not exist: {expanded_path}")
                        elif not os.path.isdir(expanded_path):
                            additional_warnings.append(f"Warning: Path is not a directory: {expanded_path}")
                except Exception as e:
                    additional_warnings.append(f"Warning: Could not validate directory path: {str(e)}")

        # Convert ConnectionTestResult to dictionary format expected by the API
        result = {
            'success': test_result.success,
            'status': test_result.status,
            'message': test_result.message,
            'response_time': test_result.response_time,
            'error': test_result.error,
            'metadata': test_result.metadata.__dict__ if test_result.metadata else None
        }

        # Add warnings to the message if any
        if additional_warnings:
            warning_text = "\n".join(additional_warnings)
            if result['message']:
                result['message'] += f"\n\n{warning_text}"
            else:
                result['message'] = warning_text

        return result
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

@app.route('/api/sources/<source_id>/browse-paginated', methods=['GET'])
def browse_source_directory_paginated(source_id):
    """Browse directory structure with pagination and lazy loading support."""
    try:
        sources = get_stored_sources()
        if source_id not in sources:
            return jsonify({'success': False, 'error': 'Source not found'}), 404

        source = sources[source_id]

        # Convert to SourceConfig and create source instance
        source_config = convert_to_source_config(source)
        source_instance = SourceFactory.create_source(source_config)

        # Extract pagination parameters from query string
        page = int(request.args.get('page', 1))
        limit = int(request.args.get('limit', 50))
        sort_by = request.args.get('sort_by', 'name')
        sort_order = request.args.get('sort_order', 'asc')
        filter_type = request.args.get('filter_type')  # 'files', 'directories', or None
        path = request.args.get('path', '')
        refresh = request.args.get('refresh')  # Cache-busting parameter

        # Validate pagination parameters
        page = max(1, page)
        limit = max(1, min(limit, 500))  # Limit max items per page
        if sort_by not in ['name', 'size', 'modified']:
            sort_by = 'name'
        if sort_order not in ['asc', 'desc']:
            sort_order = 'asc'
        if filter_type not in ['files', 'directories', None]:
            filter_type = None

        # Create pagination options
        pagination = PaginationOptions(
            page=page,
            limit=limit,
            sort_by=sort_by,
            sort_order=sort_order,
            filter_type=filter_type
        )

        # Check if source supports listing
        if not source_instance.is_listable():
            source_type = source_config.source_type
            if source_config.is_directory:
                error_msg = f"Source type '{source_type}' does not support directory listing. Consider changing the source configuration to 'file' type instead of 'directory' type."
            else:
                error_msg = f"Source type '{source_type}' does not support directory listing."
            return jsonify({'success': False, 'error': error_msg}), 400

        # If refresh parameter is present, clear cache for the specific path
        if refresh:
            if path:
                # Clear cache only for the specific folder path
                source_instance.refresh_folder(path)
            else:
                # Clear all cache if refreshing root
                source_instance._cache.clear()

        # Get paginated results using lazy loading
        paginated_result = source_instance.explore_directory_lazy(path if path else None, pagination)

        # Convert result to JSON-serializable format
        result_data = {
            'success': True,
            'items': paginated_result.items,
            'pagination': {
                'page': paginated_result.page,
                'limit': paginated_result.limit,
                'total_count': paginated_result.total_count,
                'total_pages': paginated_result.total_pages,
                'has_next': paginated_result.has_next,
                'has_previous': paginated_result.has_previous,
                'sort_by': paginated_result.sort_by,
                'sort_order': paginated_result.sort_order
            },
            'path': path,
            'source_id': source_id,
            'source_type': source_config.source_type
        }

        return jsonify(result_data)

    except Exception as e:
        # Provide user-friendly error messages
        error_message = str(e)
        if 'permission denied' in error_message.lower():
            error_message = 'Permission denied accessing the directory'
        elif 'not found' in error_message.lower():
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


# ===== VALIDATION API ENDPOINTS =====

# Initialize validator manager
validator_manager = ValidatorManager()

@app.route('/api/validators/types', methods=['GET'])
def get_available_validator_types():
    """Get list of available validator types."""
    try:
        types = get_validator_types()
        return jsonify({'success': True, 'types': types})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/sources/<source_id>/validators', methods=['GET'])
def list_source_validators(source_id):
    """List all validators for a source."""
    try:
        validators = validator_manager.list_validators(source_id)
        return jsonify({'success': True, 'validators': validators})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/sources/<source_id>/validators', methods=['POST'])
def create_source_validator(source_id):
    """Create a new validator for a source."""
    try:
        data = request.get_json()

        # Validate required fields
        required_fields = ['name', 'type', 'schema_content']
        for field in required_fields:
            if not data.get(field):
                return jsonify({'success': False, 'error': f'Missing required field: {field}'}), 400

        # Generate validator ID
        validator_id = validator_manager.create_validator_id()

        # Add metadata to config
        config = data.get('config', {})
        config['created_at'] = datetime.now().isoformat()
        config['updated_at'] = datetime.now().isoformat()

        # Create validator instance
        validator = create_validator(
            validator_type=data['type'],
            validator_id=validator_id,
            name=data['name'],
            schema_content=data['schema_content'],
            config=config
        )

        # Save validator
        validator_path = validator_manager.save_validator(source_id, validator)

        return jsonify({
            'success': True,
            'validator_id': validator_id,
            'message': 'Validator created successfully',
            'path': validator_path
        }), 201

    except ValidationError as e:
        return jsonify({'success': False, 'error': str(e)}), 400
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/sources/<source_id>/validators/<validator_id>', methods=['GET'])
def get_source_validator(source_id, validator_id):
    """Get details of a specific validator."""
    try:
        validator = validator_manager.load_validator(source_id, validator_id)
        validator_info = validator.get_schema_info()
        validator_info['schema_content'] = validator.schema_content

        return jsonify({'success': True, 'validator': validator_info})
    except ValidationError as e:
        return jsonify({'success': False, 'error': str(e)}), 404
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/sources/<source_id>/validators/<validator_id>', methods=['PUT'])
def update_source_validator(source_id, validator_id):
    """Update an existing validator."""
    try:
        data = request.get_json()

        # Load existing validator
        existing_validator = validator_manager.load_validator(source_id, validator_id)

        # Update fields
        name = data.get('name', existing_validator.name)
        schema_content = data.get('schema_content', existing_validator.schema_content)
        config = data.get('config', existing_validator.config.copy())

        # Update timestamp
        config['updated_at'] = datetime.now().isoformat()

        # Create updated validator
        updated_validator = create_validator(
            validator_type=existing_validator.get_validator_type(),
            validator_id=validator_id,
            name=name,
            schema_content=schema_content,
            config=config
        )

        # Save updated validator
        validator_path = validator_manager.save_validator(source_id, updated_validator)

        return jsonify({
            'success': True,
            'message': 'Validator updated successfully',
            'path': validator_path
        })

    except ValidationError as e:
        return jsonify({'success': False, 'error': str(e)}), 400
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/sources/<source_id>/validators/<validator_id>', methods=['DELETE'])
def delete_source_validator(source_id, validator_id):
    """Delete a validator."""
    try:
        deleted = validator_manager.delete_validator(source_id, validator_id)

        if deleted:
            return jsonify({'success': True, 'message': 'Validator deleted successfully'})
        else:
            return jsonify({'success': False, 'error': 'Validator not found'}), 404

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/sources/<source_id>/validate', methods=['POST'])
def validate_source_data(source_id):
    """Validate data against source validators."""
    try:
        data = request.get_json()

        # Get data to validate
        validate_data = data.get('data')
        if validate_data is None:
            return jsonify({'success': False, 'error': 'No data provided for validation'}), 400

        # Optional: specific validator to use
        validator_id = data.get('validator_id')

        # Perform validation
        results = validator_manager.validate_source_data(source_id, validate_data, validator_id)

        return jsonify({
            'success': True,
            'validation': results
        })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/sources/<source_id>/validate-file', methods=['POST'])
def validate_source_file(source_id):
    """Validate a file against source validators."""
    try:
        # Check if file was uploaded
        if 'file' not in request.files:
            return jsonify({'success': False, 'error': 'No file uploaded'}), 400

        file = request.files['file']
        if file.filename == '':
            return jsonify({'success': False, 'error': 'No file selected'}), 400

        # Read file content
        content = file.read().decode('utf-8')

        # Optional: specific validator to use
        validator_id = request.form.get('validator_id')

        # Perform validation
        results = validator_manager.validate_source_data(source_id, content, validator_id)

        return jsonify({
            'success': True,
            'validation': results,
            'filename': file.filename
        })

    except UnicodeDecodeError:
        return jsonify({'success': False, 'error': 'File is not valid UTF-8 text'}), 400
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


if __name__ == '__main__':
    app.run(host='127.0.0.1', port=8000, debug=True)