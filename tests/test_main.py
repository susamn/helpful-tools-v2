
import unittest
import json
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'src')))

from main import app

class TestMain(unittest.TestCase):
    def setUp(self):
        self.app = app.test_client()

    def test_dashboard(self):
        response = self.app.get('/')
        self.assertEqual(response.status_code, 200)
        self.assertIn(b'Helpful Tools v2', response.data)

    def test_api_tools(self):
        response = self.app.get('/api/tools')
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertIn('tools', data)
        self.assertIsInstance(data['tools'], list)

    def test_health(self):
        response = self.app.get('/health')
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertEqual(data['status'], 'healthy')
        self.assertIn('timestamp', data)
        self.assertIn('tools_count', data)
        self.assertIn('history_stats', data)

    def test_history_stats(self):
        response = self.app.get('/api/history/stats')
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertIn('tools', data)
        self.assertIn('total_entries', data)
        self.assertIn('tools_count', data)

    def test_api_convert_json_to_yaml(self):
        response = self.app.post('/api/convert', json={
            'data': '{"hello": "world"}',
            'input_format': 'json',
            'output_format': 'yaml'
        })
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertTrue(data['success'])
        self.assertIn('hello: world', data['result'])

    def test_api_convert_no_data(self):
        response = self.app.post('/api/convert', json={})
        self.assertEqual(response.status_code, 400)
        data = json.loads(response.data)
        self.assertFalse(data['success'])
        self.assertEqual(data['error'], 'No data provided')

    def test_api_convert_no_input_data(self):
        response = self.app.post('/api/convert', json={
            'data': '',
            'input_format': 'json',
            'output_format': 'yaml'
        })
        self.assertEqual(response.status_code, 400)
        data = json.loads(response.data)
        self.assertFalse(data['success'])
        self.assertEqual(data['error'], 'No input data provided')

    def test_api_convert_no_output_format(self):
        response = self.app.post('/api/convert', json={
            'data': '{"hello": "world"}',
            'input_format': 'json',
            'output_format': ''
        })
        self.assertEqual(response.status_code, 400)
        data = json.loads(response.data)
        self.assertFalse(data['success'])
        self.assertEqual(data['error'], 'Output format is required')

    def test_api_convert_invalid_json(self):
        response = self.app.post('/api/convert', json={
            'data': '{"hello": "world\'}',
            'input_format': 'json',
            'output_format': 'yaml'
        })
        self.assertEqual(response.status_code, 400)
        data = json.loads(response.data)
        self.assertFalse(data['success'])
        self.assertIn('JSON to YAML conversion failed', data['error'])

if __name__ == '__main__':
    unittest.main()
