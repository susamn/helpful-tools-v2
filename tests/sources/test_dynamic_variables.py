"""
Comprehensive test cases for the Sources Manager dynamic variable functionality.
Tests dynamic variable resolution, path template handling, and API endpoints.
"""

import pytest
import json
import re
import sys
import os

# Add project root to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../')))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../src')))

from src.main import app


class TestDynamicVariableResolution:
    """Test the dynamic variable resolution functions."""
    
    def setup_method(self):
        """Setup for each test."""
        self.app = app
        self.app.config['TESTING'] = True
        self.client = self.app.test_client()
    
    def extract_variables_from_path(self, path_template):
        """Helper function to extract variables from path template."""
        import re
        return re.findall(r'\$(\w+)', path_template)
    
    def resolve_dynamic_path(self, path_template, dynamic_variables):
        """Helper function to resolve dynamic variables in a path template."""
        import re
        resolved_path = path_template
        variables = re.findall(r'\$(\w+)', path_template)
        for var in variables:
            value = dynamic_variables.get(var, '')
            resolved_path = resolved_path.replace(f'${var}', value)
        return resolved_path
    
    def test_extract_single_variable(self):
        """Test extracting a single variable from path template."""
        path = "/folder/folder2/$file"
        variables = self.extract_variables_from_path(path)
        assert variables == ["file"]
    
    def test_extract_multiple_variables(self):
        """Test extracting multiple variables from path template."""
        path = "s3://$bucket/folder/$file"
        variables = self.extract_variables_from_path(path)
        assert variables == ["bucket", "file"]
    
    def test_extract_no_variables(self):
        """Test path with no variables."""
        path = "/static/folder/file.txt"
        variables = self.extract_variables_from_path(path)
        assert variables == []
    
    def test_extract_complex_variables(self):
        """Test complex path with multiple variables."""
        path = "sftp://$host:$port/$folder/$subfolder/$filename"
        variables = self.extract_variables_from_path(path)
        assert variables == ["host", "port", "folder", "subfolder", "filename"]
    
    def test_extract_duplicate_variables(self):
        """Test path with duplicate variables."""
        path = "/folder/$file/backup/$file"
        variables = self.extract_variables_from_path(path)
        assert variables == ["file", "file"]  # Should capture duplicates
    
    def test_resolve_single_variable(self):
        """Test resolving a single variable."""
        path_template = "/folder/folder2/$file"
        dynamic_vars = {"file": "test.txt"}
        resolved = self.resolve_dynamic_path(path_template, dynamic_vars)
        assert resolved == "/folder/folder2/test.txt"
    
    def test_resolve_multiple_variables(self):
        """Test resolving multiple variables."""
        path_template = "s3://$bucket/folder/$file"
        dynamic_vars = {"bucket": "my-bucket", "file": "data.csv"}
        resolved = self.resolve_dynamic_path(path_template, dynamic_vars)
        assert resolved == "s3://my-bucket/folder/data.csv"
    
    def test_resolve_missing_variables(self):
        """Test resolving with missing variables."""
        path_template = "/folder/$missing/$file"
        dynamic_vars = {"file": "test.txt"}
        resolved = self.resolve_dynamic_path(path_template, dynamic_vars)
        assert resolved == "/folder//test.txt"  # Missing var becomes empty string
    
    def test_resolve_empty_variables(self):
        """Test resolving with empty variable values."""
        path_template = "/folder/$empty/$file"
        dynamic_vars = {"empty": "", "file": "test.txt"}
        resolved = self.resolve_dynamic_path(path_template, dynamic_vars)
        assert resolved == "/folder//test.txt"
    
    def test_resolve_complex_path(self):
        """Test resolving a complex path with multiple variables."""
        path_template = "sftp://$host:$port/$folder/$subfolder/$filename"
        dynamic_vars = {
            "host": "server.example.com",
            "port": "22",
            "folder": "uploads",
            "subfolder": "2024",
            "filename": "report.pdf"
        }
        resolved = self.resolve_dynamic_path(path_template, dynamic_vars)
        expected = "sftp://server.example.com:22/uploads/2024/report.pdf"
        assert resolved == expected


class TestResolveVariablesAPI:
    """Test the resolve variables API endpoint."""
    
    def setup_method(self):
        """Setup for each test."""
        self.app = app
        self.app.config['TESTING'] = True
        self.client = self.app.test_client()
    
    def test_resolve_variables_single(self):
        """Test resolve variables API with single variable."""
        response = self.client.post('/api/sources/resolve-variables',
                                  data=json.dumps({"pathTemplate": "/folder/$file"}),
                                  content_type='application/json')
        
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data["success"] == True
        assert data["variables"] == ["file"]
    
    def test_resolve_variables_multiple(self):
        """Test resolve variables API with multiple variables."""
        response = self.client.post('/api/sources/resolve-variables',
                                  data=json.dumps({"pathTemplate": "s3://$bucket/folder/$file"}),
                                  content_type='application/json')
        
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data["success"] == True
        assert data["variables"] == ["bucket", "file"]
    
    def test_resolve_variables_none(self):
        """Test resolve variables API with no variables."""
        response = self.client.post('/api/sources/resolve-variables',
                                  data=json.dumps({"pathTemplate": "/static/folder/file.txt"}),
                                  content_type='application/json')
        
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data["success"] == True
        assert data["variables"] == []
    
    def test_resolve_variables_empty_path(self):
        """Test resolve variables API with empty path."""
        response = self.client.post('/api/sources/resolve-variables',
                                  data=json.dumps({"pathTemplate": ""}),
                                  content_type='application/json')
        
        assert response.status_code == 400
        data = json.loads(response.data)
        assert data["success"] == False
        assert "error" in data
    
    def test_resolve_variables_invalid_json(self):
        """Test resolve variables API with invalid JSON."""
        response = self.client.post('/api/sources/resolve-variables',
                                  data='{"invalid": json}',
                                  content_type='application/json')
        
        assert response.status_code == 400
    
    def test_resolve_variables_missing_path(self):
        """Test resolve variables API with missing pathTemplate."""
        response = self.client.post('/api/sources/resolve-variables',
                                  data=json.dumps({"otherField": "value"}),
                                  content_type='application/json')
        
        assert response.status_code == 400
        data = json.loads(response.data)
        assert data["success"] == False
    
    def test_resolve_variables_complex(self):
        """Test resolve variables API with complex path."""
        path = "sftp://$user@$host:$port/$folder/$year/$month/$day/$filename.$ext"
        response = self.client.post('/api/sources/resolve-variables',
                                  data=json.dumps({"pathTemplate": path}),
                                  content_type='application/json')
        
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data["success"] == True
        expected_vars = ["user", "host", "port", "folder", "year", "month", "day", "filename", "ext"]
        assert data["variables"] == expected_vars


class TestSourceCRUDWithDynamicVariables:
    """Test source CRUD operations with dynamic variables."""

    def setup_method(self):
        """Setup for each test."""
        self.app = app
        self.app.config['TESTING'] = True
        self.client = self.app.test_client()
    
    def test_create_source_with_dynamic_variables(self, clean_sources):
        """Test creating a source with dynamic variables."""
        source_data = {
            "name": "Test Dynamic Source",
            "type": "local_file",
            "staticConfig": {},
            "pathTemplate": "/folder/$file",
            "dynamicVariables": {"file": "test.txt"}
        }
        
        response = self.client.post('/api/sources',
                                  data=json.dumps(source_data),
                                  content_type='application/json')
        
        assert response.status_code == 201
        data = json.loads(response.data)
        assert data["success"] == True
        assert "id" in data
        
        # Verify the source was created with correct structure
        source_id = data["id"]
        get_response = self.client.get(f'/api/sources/{source_id}')
        assert get_response.status_code == 200
        
        source_data = json.loads(get_response.data)
        assert source_data["pathTemplate"] == "/folder/$file"
        assert source_data["dynamicVariables"]["file"] == "test.txt"
    
    def test_create_s3_source_with_multiple_variables(self, clean_sources):
        """Test creating S3 source with multiple dynamic variables."""
        source_data = {
            "name": "S3 Dynamic Source",
            "type": "s3",
            "staticConfig": {
                "profile": "default",
                "region": "us-east-1"
            },
            "pathTemplate": "s3://$bucket/$folder/$file",
            "dynamicVariables": {
                "bucket": "my-data-bucket",
                "folder": "uploads",
                "file": "data.csv"
            }
        }
        
        response = self.client.post('/api/sources',
                                  data=json.dumps(source_data),
                                  content_type='application/json')
        
        assert response.status_code == 201
        data = json.loads(response.data)
        assert data["success"] == True
    
    def test_update_source_dynamic_variables(self, clean_sources):
        """Test updating a source's dynamic variables."""
        # First create a source
        create_data = {
            "name": "Test Source",
            "type": "local_file",
            "staticConfig": {},
            "pathTemplate": "/folder/$file",
            "dynamicVariables": {"file": "old.txt"}
        }
        
        create_response = self.client.post('/api/sources',
                                         data=json.dumps(create_data),
                                         content_type='application/json')
        
        source_id = json.loads(create_response.data)["id"]
        
        # Update the dynamic variables
        update_data = {
            "name": "Updated Test Source",
            "type": "local_file",
            "staticConfig": {},
            "pathTemplate": "/folder/$file",
            "dynamicVariables": {"file": "new.txt"}
        }
        
        update_response = self.client.put(f'/api/sources/{source_id}',
                                        data=json.dumps(update_data),
                                        content_type='application/json')
        
        assert update_response.status_code == 200
        
        # Verify the update
        get_response = self.client.get(f'/api/sources/{source_id}')
        source_data = json.loads(get_response.data)
        assert source_data["dynamicVariables"]["file"] == "new.txt"
    
    def test_create_source_without_dynamic_variables(self, clean_sources):
        """Test creating a source without dynamic variables (backward compatibility)."""
        source_data = {
            "name": "Static Source",
            "type": "local_file",
            "config": {"path": "/static/folder/file.txt"}
        }
        
        response = self.client.post('/api/sources',
                                  data=json.dumps(source_data),
                                  content_type='application/json')
        
        # Should still work for backward compatibility
        assert response.status_code == 201


class TestVariableValidation:
    """Test validation of dynamic variables."""
    
    def setup_method(self):
        """Setup for each test."""
        self.app = app
        self.app.config['TESTING'] = True
        self.client = self.app.test_client()
    
    def test_invalid_variable_names(self):
        """Test invalid variable name patterns."""
        invalid_patterns = [
            "/folder/$123invalid",  # Starting with number
            "/folder/$-invalid",    # Starting with dash
            "/folder/$ invalid",    # Space in name
            "/folder/$invalid-name" # Dash in name
        ]
        
        for pattern in invalid_patterns:
            response = self.client.post('/api/sources/resolve-variables',
                                      data=json.dumps({"pathTemplate": pattern}),
                                      content_type='application/json')
            
            # Should still work but might not capture invalid variable names
            assert response.status_code == 200
    
    def test_variable_case_sensitivity(self):
        """Test that variable names are case sensitive."""
        path1 = "/folder/$File"
        path2 = "/folder/$file"
        
        response1 = self.client.post('/api/sources/resolve-variables',
                                   data=json.dumps({"pathTemplate": path1}),
                                   content_type='application/json')
        
        response2 = self.client.post('/api/sources/resolve-variables',
                                   data=json.dumps({"pathTemplate": path2}),
                                   content_type='application/json')
        
        data1 = json.loads(response1.data)
        data2 = json.loads(response2.data)
        
        assert data1["variables"] == ["File"]
        assert data2["variables"] == ["file"]
        assert data1["variables"] != data2["variables"]


class TestEdgeCases:
    """Test edge cases and error conditions."""
    
    def setup_method(self):
        """Setup for each test."""
        self.app = app
        self.app.config['TESTING'] = True
        self.client = self.app.test_client()
    
    def test_malformed_variables(self):
        """Test malformed variable patterns."""
        malformed_patterns = [
            "/folder/$$double",     # Double dollar
            "/folder/$",            # Dollar at end
            "/folder/$ ",           # Dollar with space
            "/folder/${bracket}",   # Curly brackets
            "/folder/$var$var2"     # Adjacent variables
        ]
        
        for pattern in malformed_patterns:
            response = self.client.post('/api/sources/resolve-variables',
                                      data=json.dumps({"pathTemplate": pattern}),
                                      content_type='application/json')
            
            # Should handle gracefully
            assert response.status_code in [200, 400]
    
    def test_very_long_path_template(self):
        """Test with very long path template."""
        long_path = "/" + "/".join([f"folder{i}" for i in range(100)]) + "/$file"
        
        response = self.client.post('/api/sources/resolve-variables',
                                  data=json.dumps({"pathTemplate": long_path}),
                                  content_type='application/json')
        
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data["variables"] == ["file"]
    
    def test_unicode_in_variables(self):
        """Test unicode characters in variable context."""
        path = "/folder/ünïcödé/$file"
        
        response = self.client.post('/api/sources/resolve-variables',
                                  data=json.dumps({"pathTemplate": path}),
                                  content_type='application/json')
        
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data["variables"] == ["file"]
    
    def test_many_variables(self):
        """Test path with many variables."""
        variables = [f"var{i}" for i in range(20)]
        path = "/" + "/".join([f"${var}" for var in variables])
        
        response = self.client.post('/api/sources/resolve-variables',
                                  data=json.dumps({"pathTemplate": path}),
                                  content_type='application/json')
        
        assert response.status_code == 200
        data = json.loads(response.data)
        assert len(data["variables"]) == 20
        assert all(f"var{i}" in data["variables"] for i in range(20))


if __name__ == "__main__":
    pytest.main([__file__, "-v"])