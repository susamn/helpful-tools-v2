#!/usr/bin/env python3
"""
JWT Decoder validation script.
Validates all JWT decoder functionality including routing, API, and integration.
"""

import requests
import json
import time
import base64
import hashlib
import hmac
from datetime import datetime, timedelta


class JWTDecoderValidator:
    def __init__(self, base_url="http://127.0.0.1:8000"):
        self.base_url = base_url
        self.errors = []
        self.passed = []
    
    def create_test_jwt(self, payload=None, header=None, secret="test_secret"):
        """Create a test JWT token"""
        if header is None:
            header = {"alg": "HS256", "typ": "JWT"}
        
        if payload is None:
            payload = {
                "sub": "1234567890",
                "name": "John Doe",
                "iat": int(time.time()),
                "exp": int(time.time()) + 3600  # Expires in 1 hour
            }
        
        # Encode header and payload
        header_b64 = base64.urlsafe_b64encode(json.dumps(header).encode()).rstrip(b'=').decode()
        payload_b64 = base64.urlsafe_b64encode(json.dumps(payload).encode()).rstrip(b'=').decode()
        
        # Create signature
        message = f"{header_b64}.{payload_b64}".encode()
        signature = hmac.new(secret.encode(), message, hashlib.sha256).digest()
        signature_b64 = base64.urlsafe_b64encode(signature).rstrip(b'=').decode()
        
        return f"{header_b64}.{payload_b64}.{signature_b64}"
    
    def test_route_accessibility(self):
        """Test that JWT decoder route is accessible"""
        try:
            response = requests.get(f"{self.base_url}/tools/jwt-decoder")
            if response.status_code == 200 and "JWT Decoder" in response.text:
                self.passed.append("✅ JWT decoder route accessible")
            else:
                self.errors.append(f"❌ JWT decoder route failed: {response.status_code}")
        except Exception as e:
            self.errors.append(f"❌ JWT decoder route error: {e}")
    
    def test_static_files(self):
        """Test that static JavaScript file is accessible"""
        try:
            response = requests.get(f"{self.base_url}/static/js/jwt-decoder.js")
            if response.status_code == 200 and "parseJWT" in response.text:
                self.passed.append("✅ JWT decoder JavaScript file accessible")
            else:
                self.errors.append(f"❌ JWT decoder JS file failed: {response.status_code}")
        except Exception as e:
            self.errors.append(f"❌ JWT decoder JS file error: {e}")
    
    def test_tools_api_integration(self):
        """Test that JWT decoder appears in tools API"""
        try:
            response = requests.get(f"{self.base_url}/api/tools")
            if response.status_code == 200:
                data = response.json()
                jwt_tool = next((tool for tool in data['tools'] if tool['name'] == 'JWT Decoder'), None)
                if jwt_tool and jwt_tool['path'] == '/tools/jwt-decoder':
                    self.passed.append("✅ JWT decoder in tools API")
                else:
                    self.errors.append("❌ JWT decoder not found in tools API")
            else:
                self.errors.append(f"❌ Tools API failed: {response.status_code}")
        except Exception as e:
            self.errors.append(f"❌ Tools API error: {e}")
    
    def test_history_api_functionality(self):
        """Test JWT decoder history API"""
        try:
            # Create a test JWT
            test_jwt = self.create_test_jwt()
            
            # Test adding history entry
            history_data = {
                'data': {
                    'token': test_jwt,
                    'timestamp': datetime.now().isoformat()
                },
                'operation': 'decode'
            }
            
            response = requests.post(
                f"{self.base_url}/api/history/jwt-decoder",
                json=history_data,
                headers={'Content-Type': 'application/json'}
            )
            
            if response.status_code == 200:
                self.passed.append("✅ JWT decoder history POST works")
            else:
                self.errors.append(f"❌ History POST failed: {response.status_code}")
            
            # Test retrieving history
            response = requests.get(f"{self.base_url}/api/history/jwt-decoder")
            if response.status_code == 200:
                data = response.json()
                if 'history' in data and len(data['history']) > 0:
                    self.passed.append("✅ JWT decoder history GET works")
                else:
                    self.errors.append("❌ History GET returned empty results")
            else:
                self.errors.append(f"❌ History GET failed: {response.status_code}")
                
        except Exception as e:
            self.errors.append(f"❌ History API error: {e}")
    
    def test_global_history_integration(self):
        """Test global history integration"""
        try:
            response = requests.get(f"{self.base_url}/api/global-history")
            if response.status_code == 200:
                data = response.json()
                if 'history' in data:
                    self.passed.append("✅ Global history integration works")
                else:
                    self.errors.append("❌ Global history missing 'history' field")
            else:
                self.errors.append(f"❌ Global history failed: {response.status_code}")
        except Exception as e:
            self.errors.append(f"❌ Global history error: {e}")
    
    def test_jwt_token_validation(self):
        """Test JWT token validation with various scenarios"""
        try:
            # Test valid JWT
            valid_jwt = self.create_test_jwt()
            parts = valid_jwt.split('.')
            if len(parts) == 3:
                self.passed.append("✅ Valid JWT creation works")
            else:
                self.errors.append("❌ Valid JWT creation failed")
            
            # Test expired JWT
            expired_payload = {
                "sub": "1234567890",
                "name": "John Doe",
                "iat": int(time.time()) - 7200,  # Issued 2 hours ago
                "exp": int(time.time()) - 3600   # Expired 1 hour ago
            }
            expired_jwt = self.create_test_jwt(payload=expired_payload)
            parts = expired_jwt.split('.')
            payload_decoded = json.loads(base64.urlsafe_b64decode(parts[1] + '=='))
            if payload_decoded['exp'] < int(time.time()):
                self.passed.append("✅ Expired JWT detection works")
            else:
                self.errors.append("❌ Expired JWT detection failed")
            
            # Test JWT with additional claims
            rich_payload = {
                "sub": "1234567890",
                "name": "John Doe",
                "iat": int(time.time()),
                "exp": int(time.time()) + 3600,
                "iss": "test-issuer",
                "aud": ["test-audience", "another-audience"],
                "nbf": int(time.time()) - 300  # Not before 5 minutes ago
            }
            rich_jwt = self.create_test_jwt(payload=rich_payload)
            parts = rich_jwt.split('.')
            payload_decoded = json.loads(base64.urlsafe_b64decode(parts[1] + '=='))
            if 'iss' in payload_decoded and 'aud' in payload_decoded and 'nbf' in payload_decoded:
                self.passed.append("✅ JWT with additional claims works")
            else:
                self.errors.append("❌ JWT with additional claims failed")
                
        except Exception as e:
            self.errors.append(f"❌ JWT validation error: {e}")
    
    def test_ui_consistency(self):
        """Test UI consistency with other v2 tools"""
        try:
            response = requests.get(f"{self.base_url}/tools/jwt-decoder")
            if response.status_code == 200:
                content = response.text
                
                # Check for v2 UI elements
                ui_elements = [
                    'class="header"',
                    'class="toolbar"',
                    'class="main-container"',
                    'class="panel-header"',
                    'class="status-bar"',
                    'class="history-container"',
                    'class="history-popup"',
                    'Back to Tools'
                ]
                
                missing_elements = []
                for element in ui_elements:
                    if element not in content:
                        missing_elements.append(element)
                
                if not missing_elements:
                    self.passed.append("✅ UI consistency with v2 tools")
                else:
                    self.errors.append(f"❌ Missing UI elements: {', '.join(missing_elements)}")
            else:
                self.errors.append(f"❌ UI consistency check failed: {response.status_code}")
        except Exception as e:
            self.errors.append(f"❌ UI consistency error: {e}")
    
    def run_all_tests(self):
        """Run all validation tests"""
        print("🔍 Running JWT Decoder validation tests...")
        print("-" * 50)
        
        self.test_route_accessibility()
        self.test_static_files()
        self.test_tools_api_integration()
        self.test_history_api_functionality()
        self.test_global_history_integration()
        self.test_jwt_token_validation()
        self.test_ui_consistency()
        
        print("\n📋 Test Results:")
        print("-" * 50)
        
        for passed in self.passed:
            print(passed)
        
        for error in self.errors:
            print(error)
        
        print(f"\n📊 Summary: {len(self.passed)} passed, {len(self.errors)} failed")
        
        if self.errors:
            print("\n❌ JWT Decoder validation FAILED")
            return False
        else:
            print("\n✅ JWT Decoder validation PASSED")
            return True


if __name__ == "__main__":
    validator = JWTDecoderValidator()
    success = validator.run_all_tests()
    exit(0 if success else 1)