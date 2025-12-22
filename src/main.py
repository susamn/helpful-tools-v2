import os
import json
from datetime import datetime
from pathlib import Path
from flask import Flask, render_template_string, jsonify, abort

# Import history manager
from api.history import history_manager

# Import blueprints
from blueprints.workflow import workflow_bp
from blueprints.regex import regex_bp
from blueprints.text_diff import text_diff_bp
from blueprints.converter import converter_bp
from blueprints.history import history_bp
from blueprints.sources import sources_bp
from config.template import DASHBOARD_TEMPLATE
from config.tools import TOOLS

# Configure Flask to use the correct static folder with absolute path
static_dir = Path(__file__).parent.parent / "frontend" / "static"
app = Flask(__name__, 
            static_folder=str(static_dir),
            static_url_path='/static')

# Register blueprints
app.register_blueprint(workflow_bp)
app.register_blueprint(regex_bp)
app.register_blueprint(text_diff_bp)
app.register_blueprint(converter_bp)
app.register_blueprint(history_bp)
app.register_blueprint(sources_bp)

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


@app.route('/')
def dashboard():
    return render_template_string(DASHBOARD_TEMPLATE, tools=get_enabled_tools(TOOLS))

@app.route('/api/tools')
def api_tools():
    return jsonify({'tools': get_enabled_tools(TOOLS)})

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
