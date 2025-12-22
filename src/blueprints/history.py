from flask import Blueprint, request, jsonify
from api.history import history_manager, validate_tool_name, sanitize_data

history_bp = Blueprint('history', __name__)

# History API Routes
@history_bp.route('/api/history/<tool_name>', methods=['POST'])
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

@history_bp.route('/api/history/<tool_name>', methods=['GET'])
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

@history_bp.route('/api/history/<tool_name>/<entry_id>', methods=['GET'])
def get_history_entry(tool_name, entry_id):
    if not validate_tool_name(tool_name):
        return jsonify({'error': 'Invalid tool name'}), 400
    
    entry = history_manager.get_history_entry(tool_name, entry_id)
    if not entry:
        return jsonify({'error': 'History entry not found'}), 404
    
    return jsonify(entry)

@history_bp.route('/api/history/<tool_name>/<entry_id>', methods=['DELETE'])
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

@history_bp.route('/api/history/<tool_name>', methods=['DELETE'])
def clear_history(tool_name):
    if not validate_tool_name(tool_name):
        return jsonify({'error': 'Invalid tool name'}), 400
    
    result = history_manager.clear_history(tool_name)
    return jsonify(result)

@history_bp.route('/api/history/stats')
def history_stats():
    return jsonify(history_manager.get_all_history_stats())

@history_bp.route('/api/history/<tool_name>/<entry_id>/star', methods=['PUT'])
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
@history_bp.route('/api/global-history', methods=['GET'])
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

@history_bp.route('/api/global-history/<entry_id>', methods=['GET'])
def get_global_history_entry(entry_id):
    """Get specific global history entry"""
    try:
        entry = history_manager.get_global_history_entry(entry_id)
        if entry:
            return jsonify(entry)
        return jsonify({"error": "Entry not found"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@history_bp.route('/api/global-history/<entry_id>', methods=['DELETE'])
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

@history_bp.route('/api/global-history/<entry_id>/star', methods=['PUT'])
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

@history_bp.route('/api/global-history', methods=['POST'])
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

@history_bp.route('/api/global-history', methods=['DELETE'])
def clear_global_history():
    """Clear all global history"""
    try:
        result = history_manager.clear_global_history()
        return jsonify(result)
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

# Data Storage API Routes
@history_bp.route('/api/data/<tool_name>', methods=['POST'])
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

@history_bp.route('/api/data/<tool_name>', methods=['GET'])
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

@history_bp.route('/api/data/<tool_name>/<entry_id>', methods=['GET'])
def get_data_entry(tool_name, entry_id):
    """Get specific data entry"""
    if not validate_tool_name(tool_name):
        return jsonify({'error': 'Invalid tool name'}), 400

    entry = history_manager.get_data_entry(tool_name, entry_id)
    if not entry:
        return jsonify({'error': 'Data entry not found'}), 404

    return jsonify(entry)

@history_bp.route('/api/data/<tool_name>/<entry_id>', methods=['DELETE'])
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

@history_bp.route('/api/data/<tool_name>', methods=['DELETE'])
def clear_data(tool_name):
    """Clear all data for a tool"""
    if not validate_tool_name(tool_name):
        return jsonify({'error': 'Invalid tool name'}), 400

    result = history_manager.clear_data(tool_name)
    return jsonify(result)
