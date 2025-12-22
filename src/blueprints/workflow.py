import os
import hashlib
import json
import uuid
import time
import io
import csv
import html
from pathlib import Path
from flask import Blueprint, request, jsonify, send_file, abort
from api.converter import converter
from utils.encryption import encrypt_data, decrypt_data
from sources import SourceFactory
from utils import source_helpers

workflow_bp = Blueprint('workflow', __name__)

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

@workflow_bp.route('/api/workflow/clear', methods=['DELETE'])
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

@workflow_bp.route('/api/workflow/run', methods=['POST'])
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
            
        sources = source_helpers.get_stored_sources()
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
            source_config = source_helpers.convert_to_source_config(source_data)
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

@workflow_bp.route('/api/workflow/result/<result_id>', methods=['GET'])
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

@workflow_bp.route('/api/workflow/suggest', methods=['POST'])
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
            
        sources = source_helpers.get_stored_sources()
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
            source_config = source_helpers.convert_to_source_config(source_data)
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