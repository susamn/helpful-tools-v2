import os
import json
import uuid
import configparser
from datetime import datetime
from pathlib import Path
from typing import Dict, Any
from flask import Blueprint, request, jsonify

from sources import SourceFactory, SourceConfig
from sources.base import PaginationOptions
from validators import get_validator_types, create_validator, ValidationError
from validators.manager import ValidatorManager
from utils import source_helpers

sources_bp = Blueprint('sources', __name__)

# Initialize validator manager
validator_manager = ValidatorManager()

# Config loading for source types
app_root = Path(__file__).parent.parent.parent

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

@sources_bp.route('/api/source-types')
def api_source_types():
    """Return enabled source types and their configuration."""
    enabled_types = []
    # Reload config in case it changed
    global SOURCE_TYPES_CONFIG
    SOURCE_TYPES_CONFIG = load_source_types_config()
    
    for source_type, config in SOURCE_TYPES_CONFIG.items():
        if config.get('enabled', True):
            enabled_types.append({
                'type': source_type,
                'description': config.get('description', '')
            })
    return jsonify({'source_types': enabled_types, 'enabled': get_enabled_source_types()})

@sources_bp.route('/api/sources/aws-profiles', methods=['GET'])
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

@sources_bp.route('/api/sources/ssh-keys', methods=['GET'])
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

@sources_bp.route('/api/sources', methods=['POST'])
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
            resolved_path = source_helpers.resolve_dynamic_path(path_template, dynamic_variables)
            
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
        sources = source_helpers.get_stored_sources()
        sources[source_id] = source
        source_helpers.store_sources(sources)
        
        return jsonify({
            'success': True,
            'id': source_id,
            'source': source
        }), 201
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@sources_bp.route('/api/sources', methods=['GET'])
def get_sources():
    """Get all data sources"""
    try:
        sources = source_helpers.get_stored_sources()
        
        # Add expiry information to each source
        sources_with_expiry = []
        for source in sources.values():
            source_with_expiry = source.copy()
            source_with_expiry['expiry'] = source_helpers.get_source_expiry_info(source)
            
            # Update is_directory based on actual source logic to fix legacy config
            try:
                conf = source_helpers.convert_to_source_config(source)
                inst = SourceFactory.create_source(conf)
                source_with_expiry['is_directory'] = inst.is_directory()
            except Exception:
                pass
                
            sources_with_expiry.append(source_with_expiry)
        
        return jsonify({'success': True, 'sources': sources_with_expiry})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@sources_bp.route('/api/sources/<source_id>', methods=['GET'])
def get_source(source_id):
    """Get a specific data source"""
    try:
        sources = source_helpers.get_stored_sources()
        if source_id not in sources:
            return jsonify({'success': False, 'error': 'Source not found'}), 404
        
        source = sources[source_id].copy()
        source['expiry'] = source_helpers.get_source_expiry_info(sources[source_id])
        
        return jsonify(source)
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@sources_bp.route('/api/sources/<source_id>/expiry', methods=['GET'])
def get_source_expiry(source_id):
    """Get expiry information for a specific source"""
    try:
        sources = source_helpers.get_stored_sources()
        if source_id not in sources:
            return jsonify({'success': False, 'error': 'Source not found'}), 404
        
        expiry_info = source_helpers.get_source_expiry_info(sources[source_id])
        return jsonify({'success': True, 'expiry': expiry_info})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@sources_bp.route('/api/sources/<source_id>', methods=['DELETE'])
def delete_source(source_id):
    """Delete a data source"""
    try:
        sources = source_helpers.get_stored_sources()
        if source_id not in sources:
            return jsonify({'success': False, 'error': 'Source not found'}), 404
        
        del sources[source_id]
        source_helpers.store_sources(sources)
        
        return jsonify({'success': True, 'message': 'Source deleted'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@sources_bp.route('/api/sources/<source_id>/duplicate', methods=['POST'])
def duplicate_source(source_id):
    """Duplicate an existing data source"""
    try:
        sources = source_helpers.get_stored_sources()
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
        source_helpers.store_sources(sources)

        return jsonify({'success': True, 'source': new_source}), 201

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@sources_bp.route('/api/sources/<source_id>', methods=['PUT'])
def update_source(source_id):
    """Update an existing data source"""
    try:
        data = request.get_json()
        
        # Validate required fields
        if not data.get('name') or not data.get('type'):
            return jsonify({'success': False, 'error': 'Missing required fields: name and type'}), 400
        
        sources = source_helpers.get_stored_sources()
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
            resolved_path = source_helpers.resolve_dynamic_path(path_template, dynamic_variables)
            
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
        source_helpers.store_sources(sources)
        
        return jsonify({
            'success': True, 
            'message': 'Source updated successfully',
            'source': updated_source
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@sources_bp.route('/api/sources/<source_id>/test', methods=['POST'])
def test_source_endpoint(source_id):
    """Test connection to a data source"""
    try:
        sources = source_helpers.get_stored_sources()
        if source_id not in sources:
            return jsonify({'success': False, 'error': 'Source not found'}), 404
        
        source = sources[source_id]
        source_type = source['type']
        config = source['config']
        
        # Test based on source type using the new source package
        test_result = source_helpers.check_source_connection(source_type, config, source)
        
        # Update source status
        sources[source_id]['status'] = 'connected' if test_result['success'] else 'error'
        sources[source_id]['last_tested'] = datetime.now().isoformat()
        source_helpers.store_sources(sources)
        
        return jsonify(test_result)
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@sources_bp.route('/api/sources/resolve-variables', methods=['POST'])
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
        
        variables = source_helpers.extract_dynamic_variables(path_template)
        
        return jsonify({
            'success': True,
            'variables': variables
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@sources_bp.route('/api/sources/<source_id>/browse', methods=['GET'])
def browse_source_directory(source_id):
    """Browse directory structure for local file sources"""
    try:
        sources = source_helpers.get_stored_sources()
        if source_id not in sources:
            return jsonify({'success': False, 'error': 'Source not found'}), 404

        source = sources[source_id]
        source_type = source.get('type')
        config = source.get('config', {})
        
        # Support local file and S3 sources
        if source_type not in ['local_file', 's3']:
            return jsonify({'success': False, 'error': 'Directory browsing only supported for local file and S3 sources'}), 400
        
        # Convert to SourceConfig and create source instance
        source_config = source_helpers.convert_to_source_config(source)
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

@sources_bp.route('/api/sources/<source_id>/browse-paginated', methods=['GET'])
def browse_source_directory_paginated(source_id):
    """Browse directory structure with pagination and lazy loading support."""
    try:
        sources = source_helpers.get_stored_sources()
        if source_id not in sources:
            return jsonify({'success': False, 'error': 'Source not found'}), 404

        source = sources[source_id]

        # Convert to SourceConfig and create source instance
        source_config = source_helpers.convert_to_source_config(source)
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

@sources_bp.route('/api/sources/<source_id>/file', methods=['GET'])
def get_source_file_data(source_id):
    """Get data from a specific file within a source directory"""
    try:
        sources = source_helpers.get_stored_sources()
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
        source_config = source_helpers.convert_to_source_config(source)
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

@sources_bp.route('/api/sources/<source_id>/fetch', methods=['GET'])
def fetch_source_data(source_id):
    """Fetch data from a source - auto-detects files vs directories"""
    try:
        sources = source_helpers.get_stored_sources()
        if source_id not in sources:
            return jsonify({'success': False, 'error': 'Source not found'}), 404

        source = sources[source_id]
        
        # Convert to SourceConfig and create source instance
        source_config = source_helpers.convert_to_source_config(source)
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

@sources_bp.route('/api/sources/<source_id>/data', methods=['GET'])
def get_source_data(source_id):
    """Get data from a specific source"""
    try:
        sources = source_helpers.get_stored_sources()
        if source_id not in sources:
            return jsonify({'success': False, 'error': 'Source not found'}), 404

        source = sources[source_id]
        source_type = source.get('type')
        config = source.get('config', {})

        # Use the new source system for all source types
        try:
            source_config = source_helpers.convert_to_source_config(source)
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

@sources_bp.route('/api/validators/types', methods=['GET'])
def get_available_validator_types():
    """Get list of available validator types."""
    try:
        types = get_validator_types()
        return jsonify({'success': True, 'types': types})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@sources_bp.route('/api/sources/<source_id>/validators', methods=['GET'])
def list_source_validators(source_id):
    """List all validators for a source."""
    try:
        validators = validator_manager.list_validators(source_id)
        return jsonify({'success': True, 'validators': validators})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@sources_bp.route('/api/sources/<source_id>/validators', methods=['POST'])
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


@sources_bp.route('/api/sources/<source_id>/validators/<validator_id>', methods=['GET'])
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


@sources_bp.route('/api/sources/<source_id>/validators/<validator_id>', methods=['PUT'])
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


@sources_bp.route('/api/sources/<source_id>/validators/<validator_id>', methods=['DELETE'])
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


@sources_bp.route('/api/sources/<source_id>/validate', methods=['POST'])
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


@sources_bp.route('/api/sources/<source_id>/validate-file', methods=['POST'])
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