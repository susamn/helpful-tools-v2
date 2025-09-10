"""
Comprehensive test cases for the Sources Manager API endpoints.
Tests all CRUD operations, dynamic variable handling, and integration scenarios.
"""

import pytest
import json
import tempfile
import os
import sys
from unittest.mock import patch, MagicMock

# Add project root to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../')))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../src')))

from src.main import app


class TestSourcesAPI:
    """Test Sources API endpoints."""
    
    def setup_method(self):
        """Setup for each test."""
        self.app = app
        self.app.config['TESTING'] = True
        self.client = self.app.test_client()
        
        # Clean up any existing sources
        try:
            response = self.client.get('/api/sources')
            if response.status_code == 200:
                sources = json.loads(response.data)
                if isinstance(sources, list):
                    for source in sources:
                        if 'id' in source:
                            self.client.delete(f'/api/sources/{source["id"]}')
        except:
            pass  # Ignore cleanup errors
    
    def test_get_sources_empty(self):
        """Test getting sources when none exist."""
        response = self.client.get('/api/sources')
        assert response.status_code == 200
        
        data = json.loads(response.data)
        assert isinstance(data, list)
        assert len(data) == 0
    
    def test_create_local_file_source(self):
        """Test creating a local file source with dynamic variables."""
        source_data = {
            "name": "Test Local File",
            "type": "local_file",
            "staticConfig": {},
            "pathTemplate": "/data/files/$date/$filename",
            "dynamicVariables": {
                "date": "2024-01-01",
                "filename": "report.csv"
            }
        }
        
        response = self.client.post('/api/sources',
                                  data=json.dumps(source_data),
                                  content_type='application/json')
        
        assert response.status_code == 201
        data = json.loads(response.data)
        assert data["success"] == True
        assert "id" in data
        
        # Verify source was created
        source_id = data["id"]
        get_response = self.client.get(f'/api/sources/{source_id}')
        assert get_response.status_code == 200
        
        source = json.loads(get_response.data)
        assert source["name"] == "Test Local File"
        assert source["type"] == "local_file"
        assert source["pathTemplate"] == "/data/files/$date/$filename"
        assert source["dynamicVariables"]["date"] == "2024-01-01"
        assert source["dynamicVariables"]["filename"] == "report.csv"
    
    def test_create_s3_source_with_static_config(self):
        """Test creating S3 source with static configuration."""
        source_data = {
            "name": "S3 Data Source",
            "type": "s3",
            "staticConfig": {
                "profile": "default",
                "region": "us-west-2"
            },
            "pathTemplate": "s3://$bucket/$environment/$filename",
            "dynamicVariables": {
                "bucket": "company-data",
                "environment": "prod",
                "filename": "daily_report.json"
            }
        }
        
        response = self.client.post('/api/sources',
                                  data=json.dumps(source_data),
                                  content_type='application/json')
        
        assert response.status_code == 201
        data = json.loads(response.data)
        assert data["success"] == True
        
        # Verify static config was saved correctly
        source_id = data["id"]
        get_response = self.client.get(f'/api/sources/{source_id}')
        source = json.loads(get_response.data)
        
        assert source["staticConfig"]["profile"] == "default"
        assert source["staticConfig"]["region"] == "us-west-2"
    
    def test_create_sftp_source(self):
        """Test creating SFTP source with authentication."""
        source_data = {
            "name": "SFTP Server",
            "type": "sftp",
            "staticConfig": {
                "host": "ftp.example.com",
                "port": "22",
                "username": "ftpuser",
                "password": "secure_pass"
            },
            "pathTemplate": "/uploads/$year/$month/$filename",
            "dynamicVariables": {
                "year": "2024",
                "month": "01",
                "filename": "data.txt"
            }
        }
        
        response = self.client.post('/api/sources',
                                  data=json.dumps(source_data),
                                  content_type='application/json')
        
        assert response.status_code == 201
        data = json.loads(response.data)
        assert data["success"] == True
    
    def test_create_http_source(self):
        """Test creating HTTP source."""
        source_data = {
            "name": "REST API",
            "type": "http",
            "staticConfig": {
                "method": "GET",
                "headers": {"Authorization": "Bearer token123"}
            },
            "pathTemplate": "https://api.example.com/$version/data/$resource",
            "dynamicVariables": {
                "version": "v1",
                "resource": "users"
            }
        }
        
        response = self.client.post('/api/sources',
                                  data=json.dumps(source_data),
                                  content_type='application/json')
        
        assert response.status_code == 201
    
    def test_create_source_validation_errors(self):
        """Test source creation validation."""
        # Missing required fields
        invalid_data = {"name": "Invalid Source"}
        
        response = self.client.post('/api/sources',
                                  data=json.dumps(invalid_data),
                                  content_type='application/json')
        
        assert response.status_code == 400
        data = json.loads(response.data)
        assert data["success"] == False
        assert "error" in data
    
    def test_update_source_dynamic_variables(self):
        """Test updating source dynamic variables."""
        # Create source first
        create_data = {
            "name": "Updatable Source",
            "type": "local_file",
            "staticConfig": {},
            "pathTemplate": "/data/$filename",
            "dynamicVariables": {"filename": "old.txt"}
        }
        
        create_response = self.client.post('/api/sources',
                                         data=json.dumps(create_data),
                                         content_type='application/json')
        
        source_id = json.loads(create_response.data)["id"]
        
        # Update the source
        update_data = {
            "name": "Updated Source Name",
            "type": "local_file",
            "staticConfig": {},
            "pathTemplate": "/data/$year/$filename",
            "dynamicVariables": {
                "year": "2024",
                "filename": "new.txt"
            }
        }
        
        update_response = self.client.put(f'/api/sources/{source_id}',
                                        data=json.dumps(update_data),
                                        content_type='application/json')
        
        assert update_response.status_code == 200
        
        # Verify update
        get_response = self.client.get(f'/api/sources/{source_id}')
        source = json.loads(get_response.data)
        
        assert source["name"] == "Updated Source Name"
        assert source["pathTemplate"] == "/data/$year/$filename"
        assert source["dynamicVariables"]["year"] == "2024"
        assert source["dynamicVariables"]["filename"] == "new.txt"
    
    def test_update_nonexistent_source(self):
        """Test updating a non-existent source."""
        update_data = {
            "name": "Non-existent",
            "type": "local_file",
            "staticConfig": {},
            "pathTemplate": "/test",
            "dynamicVariables": {}
        }
        
        response = self.client.put('/api/sources/nonexistent-id',
                                 data=json.dumps(update_data),
                                 content_type='application/json')
        
        assert response.status_code == 404
    
    def test_delete_source(self):
        """Test deleting a source."""
        # Create source first
        create_data = {
            "name": "Deletable Source",
            "type": "local_file",
            "staticConfig": {},
            "pathTemplate": "/temp/$file",
            "dynamicVariables": {"file": "temp.txt"}
        }
        
        create_response = self.client.post('/api/sources',
                                         data=json.dumps(create_data),
                                         content_type='application/json')
        
        source_id = json.loads(create_response.data)["id"]
        
        # Delete the source
        delete_response = self.client.delete(f'/api/sources/{source_id}')
        assert delete_response.status_code == 200
        
        # Verify deletion
        get_response = self.client.get(f'/api/sources/{source_id}')
        assert get_response.status_code == 404
    
    def test_delete_nonexistent_source(self):
        """Test deleting a non-existent source."""
        response = self.client.delete('/api/sources/nonexistent-id')
        assert response.status_code == 404
    
    def test_get_specific_source(self):
        """Test getting a specific source by ID."""
        # Create source first
        create_data = {
            "name": "Specific Source",
            "type": "s3",
            "staticConfig": {"region": "us-east-1"},
            "pathTemplate": "s3://$bucket/$key",
            "dynamicVariables": {"bucket": "test", "key": "data.json"}
        }
        
        create_response = self.client.post('/api/sources',
                                         data=json.dumps(create_data),
                                         content_type='application/json')
        
        source_id = json.loads(create_response.data)["id"]
        
        # Get the source
        get_response = self.client.get(f'/api/sources/{source_id}')
        assert get_response.status_code == 200
        
        source = json.loads(get_response.data)
        assert source["id"] == source_id
        assert source["name"] == "Specific Source"
        assert source["type"] == "s3"
    
    def test_get_nonexistent_source(self):
        """Test getting a non-existent source."""
        response = self.client.get('/api/sources/nonexistent-id')
        assert response.status_code == 404
    
    def test_list_multiple_sources(self):
        """Test listing multiple sources."""
        # Create multiple sources
        sources_data = [
            {
                "name": "Source 1",
                "type": "local_file",
                "staticConfig": {},
                "pathTemplate": "/data1/$file",
                "dynamicVariables": {"file": "file1.txt"}
            },
            {
                "name": "Source 2",
                "type": "s3",
                "staticConfig": {"region": "us-west-2"},
                "pathTemplate": "s3://$bucket/$key",
                "dynamicVariables": {"bucket": "bucket2", "key": "key2"}
            }
        ]
        
        created_ids = []
        for source_data in sources_data:
            response = self.client.post('/api/sources',
                                      data=json.dumps(source_data),
                                      content_type='application/json')
            created_ids.append(json.loads(response.data)["id"])
        
        # List all sources
        list_response = self.client.get('/api/sources')
        assert list_response.status_code == 200
        
        sources = json.loads(list_response.data)
        assert len(sources) == 2
        
        source_names = [s["name"] for s in sources]
        assert "Source 1" in source_names
        assert "Source 2" in source_names


class TestSourceTesting:
    """Test source testing functionality."""
    
    def setup_method(self):
        """Setup for each test."""
        self.app = app
        self.app.config['TESTING'] = True
        self.client = self.app.test_client()
    
    @patch('os.path.exists')
    def test_test_local_file_source_success(self, mock_exists):
        """Test successful local file source testing."""
        mock_exists.return_value = True
        
        # Create a local file source
        create_data = {
            "name": "Test File Source",
            "type": "local_file",
            "staticConfig": {},
            "pathTemplate": "/data/$filename",
            "dynamicVariables": {"filename": "test.txt"}
        }
        
        create_response = self.client.post('/api/sources',
                                         data=json.dumps(create_data),
                                         content_type='application/json')
        
        source_id = json.loads(create_response.data)["id"]
        
        # Test the source
        test_response = self.client.post(f'/api/sources/{source_id}/test')
        assert test_response.status_code == 200
        
        data = json.loads(test_response.data)
        assert data["success"] == True
        assert data["status"] == "connected"
    
    @patch('os.path.exists')
    def test_test_local_file_source_failure(self, mock_exists):
        """Test failed local file source testing."""
        mock_exists.return_value = False
        
        # Create a local file source
        create_data = {
            "name": "Failed Test Source",
            "type": "local_file",
            "staticConfig": {},
            "pathTemplate": "/nonexistent/$filename",
            "dynamicVariables": {"filename": "missing.txt"}
        }
        
        create_response = self.client.post('/api/sources',
                                         data=json.dumps(create_data),
                                         content_type='application/json')
        
        source_id = json.loads(create_response.data)["id"]
        
        # Test the source
        test_response = self.client.post(f'/api/sources/{source_id}/test')
        assert test_response.status_code == 200
        
        data = json.loads(test_response.data)
        assert data["success"] == False
        assert data["status"] == "error"
        assert "error" in data
    
    def test_test_nonexistent_source(self):
        """Test testing a non-existent source."""
        response = self.client.post('/api/sources/nonexistent-id/test')
        assert response.status_code == 404


class TestBackwardCompatibility:
    """Test backward compatibility with old source format."""
    
    def setup_method(self):
        """Setup for each test."""
        self.app = app
        self.app.config['TESTING'] = True
        self.client = self.app.test_client()
    
    def test_create_legacy_source_format(self):
        """Test creating source with legacy format."""
        legacy_data = {
            "name": "Legacy Source",
            "type": "local_file",
            "config": {"path": "/static/legacy/file.txt"}
        }
        
        response = self.client.post('/api/sources',
                                  data=json.dumps(legacy_data),
                                  content_type='application/json')
        
        # Should work for backward compatibility
        assert response.status_code == 201
        
        data = json.loads(response.data)
        assert data["success"] == True
    
    def test_update_legacy_to_dynamic(self):
        """Test updating legacy source to use dynamic variables."""
        # Create legacy source
        legacy_data = {
            "name": "Legacy to Dynamic",
            "type": "local_file",
            "config": {"path": "/legacy/static.txt"}
        }
        
        create_response = self.client.post('/api/sources',
                                         data=json.dumps(legacy_data),
                                         content_type='application/json')
        
        source_id = json.loads(create_response.data)["id"]
        
        # Update to dynamic format
        dynamic_data = {
            "name": "Now Dynamic",
            "type": "local_file",
            "staticConfig": {},
            "pathTemplate": "/dynamic/$filename",
            "dynamicVariables": {"filename": "dynamic.txt"}
        }
        
        update_response = self.client.put(f'/api/sources/{source_id}',
                                        data=json.dumps(dynamic_data),
                                        content_type='application/json')
        
        assert update_response.status_code == 200
        
        # Verify the update
        get_response = self.client.get(f'/api/sources/{source_id}')
        source = json.loads(get_response.data)
        
        assert source["name"] == "Now Dynamic"
        assert "pathTemplate" in source
        assert "dynamicVariables" in source


class TestIntegrationScenarios:
    """Test integration scenarios and complex workflows."""
    
    def setup_method(self):
        """Setup for each test."""
        self.app = app
        self.app.config['TESTING'] = True
        self.client = self.app.test_client()
    
    def test_complete_workflow(self):
        """Test complete workflow: create, update, test, delete."""
        # 1. Create source
        create_data = {
            "name": "Workflow Test",
            "type": "local_file",
            "staticConfig": {},
            "pathTemplate": "/workflow/$stage/$filename",
            "dynamicVariables": {
                "stage": "dev",
                "filename": "workflow.txt"
            }
        }
        
        create_response = self.client.post('/api/sources',
                                         data=json.dumps(create_data),
                                         content_type='application/json')
        
        assert create_response.status_code == 201
        source_id = json.loads(create_response.data)["id"]
        
        # 2. Update source
        update_data = {
            "name": "Updated Workflow Test",
            "type": "local_file",
            "staticConfig": {},
            "pathTemplate": "/workflow/$stage/$version/$filename",
            "dynamicVariables": {
                "stage": "prod",
                "version": "v2",
                "filename": "workflow_v2.txt"
            }
        }
        
        update_response = self.client.put(f'/api/sources/{source_id}',
                                        data=json.dumps(update_data),
                                        content_type='application/json')
        
        assert update_response.status_code == 200
        
        # 3. Test source (will likely fail since path doesn't exist)
        test_response = self.client.post(f'/api/sources/{source_id}/test')
        assert test_response.status_code == 200
        # Result depends on whether file exists, but endpoint should work
        
        # 4. Delete source
        delete_response = self.client.delete(f'/api/sources/{source_id}')
        assert delete_response.status_code == 200
        
        # 5. Verify deletion
        get_response = self.client.get(f'/api/sources/{source_id}')
        assert get_response.status_code == 404
    
    def test_multiple_sources_same_template(self):
        """Test multiple sources with same template but different variables."""
        template = "/shared/$environment/$service/$filename"
        
        sources = [
            {
                "name": "Development Service A",
                "type": "local_file",
                "staticConfig": {},
                "pathTemplate": template,
                "dynamicVariables": {
                    "environment": "dev",
                    "service": "service-a",
                    "filename": "config.json"
                }
            },
            {
                "name": "Production Service A",
                "type": "local_file",
                "staticConfig": {},
                "pathTemplate": template,
                "dynamicVariables": {
                    "environment": "prod",
                    "service": "service-a",
                    "filename": "config.json"
                }
            }
        ]
        
        created_ids = []
        for source_data in sources:
            response = self.client.post('/api/sources',
                                      data=json.dumps(source_data),
                                      content_type='application/json')
            assert response.status_code == 201
            created_ids.append(json.loads(response.data)["id"])
        
        # Verify both sources were created correctly
        list_response = self.client.get('/api/sources')
        sources_list = json.loads(list_response.data)
        
        assert len(sources_list) == 2
        dev_source = next(s for s in sources_list if s["dynamicVariables"]["environment"] == "dev")
        prod_source = next(s for s in sources_list if s["dynamicVariables"]["environment"] == "prod")
        
        assert dev_source["name"] == "Development Service A"
        assert prod_source["name"] == "Production Service A"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])