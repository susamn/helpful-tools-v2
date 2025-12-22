from flask import Blueprint, request, jsonify
from api.converter import convert_format, validate_format, converter

converter_bp = Blueprint('converter', __name__)

@converter_bp.route('/api/convert', methods=['POST'])
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

@converter_bp.route('/api/validate', methods=['POST'])
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

@converter_bp.route('/api/detect-format', methods=['POST'])
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
