import json
import uuid
import re
from datetime import datetime
from pathlib import Path
from typing import Dict, Any
from sources import SourceFactory, SourceConfig

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
        created_at=datetime.fromisoformat(source_data['created_at']) if isinstance(source_data.get('created_at'), str) else (source_data.get('created_at') or datetime.now()),
        updated_at=datetime.fromisoformat(source_data['updated_at']) if isinstance(source_data.get('updated_at'), str) else (source_data.get('updated_at') or datetime.now()),
        last_accessed=datetime.fromisoformat(source_data['last_accessed']) if isinstance(source_data.get('last_accessed'), str) else source_data.get('last_accessed'),
        last_tested=datetime.fromisoformat(source_data['last_tested']) if isinstance(source_data.get('last_tested'), str) else source_data.get('last_tested'),
        status=source_data.get('status', 'created'),
        is_directory=is_directory,
        level=level
    )

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

def resolve_dynamic_path(path_template, dynamic_variables):
    """Resolve dynamic variables in a path template"""
    resolved_path = path_template

    # Find all variables in format $variableName
    variables = re.findall(r'\$(\w+)', path_template)

    for var in variables:
        value = dynamic_variables.get(var, '')
        resolved_path = resolved_path.replace(f'${var}', value)

    return resolved_path

def extract_dynamic_variables(path_template):
    """Extract dynamic variable names from a path template"""
    return re.findall(r'\$(\w+)', path_template)

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
