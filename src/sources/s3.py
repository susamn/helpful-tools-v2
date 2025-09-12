"""
AWS S3 data source implementation.
"""

import hashlib
from datetime import datetime
from typing import Union, Iterator, List, Dict, Any, Optional
from urllib.parse import urlparse
import time

from .base import BaseDataSource, SourceMetadata, ConnectionTestResult
from .exceptions import (
    SourceNotFoundError, SourceConnectionError, SourcePermissionError, 
    SourceDataError, SourceTimeoutError, SourceAuthenticationError, SourceConfigurationError
)


class S3Source(BaseDataSource):
    """Implementation for AWS S3 sources."""
    
    def __init__(self, config):
        super().__init__(config)
        self._resolved_path = config.get_resolved_path()
        self._bucket, self._key = self._parse_s3_path()
        self._s3_client = None
        self._session = None
    
    def _parse_s3_path(self) -> tuple[str, str]:
        """Parse S3 path to extract bucket and key."""
        if not self._resolved_path.startswith('s3://'):
            raise SourceConfigurationError("S3 path must start with 's3://'")
        
        parsed = urlparse(self._resolved_path)
        bucket = parsed.netloc
        key = parsed.path.lstrip('/')
        
        if not bucket:
            raise SourceConfigurationError("S3 bucket name is required")
        
        return bucket, key
    
    def _get_s3_client(self):
        """Get boto3 S3 client with configuration."""
        if self._s3_client:
            return self._s3_client
        
        try:
            import boto3
            from botocore.exceptions import NoCredentialsError, ClientError
        except ImportError:
            raise SourceConnectionError("boto3 library is required for S3 sources")
        
        try:
            # Get configuration
            profile = self.config.static_config.get('aws_profile')
            region = self.config.static_config.get('region', 'us-east-1')
            
            # Create session with profile if specified
            if profile:
                self._session = boto3.Session(profile_name=profile)
            else:
                self._session = boto3.Session()
            
            # Create S3 client
            self._s3_client = self._session.client('s3', region_name=region)
            
            return self._s3_client
            
        except NoCredentialsError:
            raise SourceAuthenticationError("AWS credentials not found")
        except Exception as e:
            raise SourceConnectionError(f"Failed to create S3 client: {str(e)}")
    
    def test_connection(self) -> ConnectionTestResult:
        """Test S3 connection and object/bucket access."""
        start_time = datetime.now()
        
        try:
            s3_client = self._get_s3_client()
            
            # Test bucket access
            try:
                s3_client.head_bucket(Bucket=self._bucket)
            except Exception as e:
                error_code = getattr(e, 'response', {}).get('Error', {}).get('Code', 'Unknown')
                if error_code in ['403', 'Forbidden']:
                    return self._cache_test_result(ConnectionTestResult(
                        success=False,
                        status='unauthorized',
                        message=f'Access denied to bucket: {self._bucket}',
                        response_time=(datetime.now() - start_time).total_seconds(),
                        error='Permission denied'
                    ))
                elif error_code in ['404', 'NoSuchBucket']:
                    return self._cache_test_result(ConnectionTestResult(
                        success=False,
                        status='error',
                        message=f'Bucket not found: {self._bucket}',
                        response_time=(datetime.now() - start_time).total_seconds(),
                        error='Bucket not found'
                    ))
                else:
                    raise e
            
            # If key is specified, test object access
            if self._key:
                try:
                    response = s3_client.head_object(Bucket=self._bucket, Key=self._key)
                    metadata = self._parse_s3_metadata(response)
                    
                    return self._cache_test_result(ConnectionTestResult(
                        success=True,
                        status='connected',
                        message=f'Successfully accessed S3 object: {self._resolved_path}',
                        response_time=(datetime.now() - start_time).total_seconds(),
                        metadata=metadata
                    ))
                    
                except Exception as e:
                    error_code = getattr(e, 'response', {}).get('Error', {}).get('Code', 'Unknown')
                    if error_code in ['404', 'NoSuchKey']:
                        return self._cache_test_result(ConnectionTestResult(
                            success=False,
                            status='error',
                            message=f'Object not found: {self._key}',
                            response_time=(datetime.now() - start_time).total_seconds(),
                            error='Object not found'
                        ))
                    else:
                        raise e
            else:
                # Just bucket access test
                return self._cache_test_result(ConnectionTestResult(
                    success=True,
                    status='connected',
                    message=f'Successfully accessed S3 bucket: {self._bucket}',
                    response_time=(datetime.now() - start_time).total_seconds()
                ))
                
        except SourceAuthenticationError as e:
            return self._cache_test_result(ConnectionTestResult(
                success=False,
                status='unauthorized',
                message=str(e),
                response_time=(datetime.now() - start_time).total_seconds(),
                error=str(e)
            ))
        except Exception as e:
            return self._cache_test_result(ConnectionTestResult(
                success=False,
                status='error',
                message=f'S3 connection failed: {str(e)}',
                response_time=(datetime.now() - start_time).total_seconds(),
                error=str(e)
            ))
    
    def _parse_s3_metadata(self, response: Dict[str, Any]) -> SourceMetadata:
        """Parse S3 head_object response to metadata."""
        return SourceMetadata(
            size=response.get('ContentLength'),
            last_modified=response.get('LastModified'),
            content_type=response.get('ContentType'),
            encoding=response.get('ContentEncoding'),
            checksum=response.get('ETag', '').strip('"'),
            extra={
                'storage_class': response.get('StorageClass'),
                'server_side_encryption': response.get('ServerSideEncryption'),
                'metadata': response.get('Metadata', {}),
                'version_id': response.get('VersionId')
            }
        )
    
    def get_metadata(self) -> SourceMetadata:
        """Get metadata about the S3 object."""
        if not self._key:
            raise SourceDataError("Cannot get metadata for bucket without object key")
        
        try:
            s3_client = self._get_s3_client()
            response = s3_client.head_object(Bucket=self._bucket, Key=self._key)
            return self._parse_s3_metadata(response)
            
        except Exception as e:
            error_code = getattr(e, 'response', {}).get('Error', {}).get('Code', 'Unknown')
            if error_code in ['404', 'NoSuchKey']:
                raise SourceNotFoundError(f"S3 object not found: {self._resolved_path}")
            elif error_code in ['403', 'Forbidden']:
                raise SourcePermissionError(f"Access denied to S3 object: {self._resolved_path}")
            else:
                raise SourceConnectionError(f"Failed to get S3 metadata: {str(e)}")
    
    def exists(self) -> bool:
        """Check if the S3 object exists."""
        if not self._key:
            # Check bucket exists
            try:
                s3_client = self._get_s3_client()
                s3_client.head_bucket(Bucket=self._bucket)
                return True
            except Exception:
                return False
        else:
            # Check object exists
            try:
                s3_client = self._get_s3_client()
                s3_client.head_object(Bucket=self._bucket, Key=self._key)
                return True
            except Exception:
                return False
    
    def read_data(self, **kwargs) -> Union[str, bytes]:
        """Read data from S3 object."""
        if not self._key:
            raise SourceDataError("Cannot read data from bucket without object key")
        
        try:
            s3_client = self._get_s3_client()
            
            # Handle range requests
            range_header = None
            if 'limit' in kwargs:
                range_header = f"bytes=0-{kwargs['limit'] - 1}"
            
            get_kwargs = {'Bucket': self._bucket, 'Key': self._key}
            if range_header:
                get_kwargs['Range'] = range_header
            
            response = s3_client.get_object(**get_kwargs)
            data = response['Body'].read()
            
            # Handle text/binary mode
            mode = kwargs.get('mode', 'binary')
            if mode == 'text':
                encoding = kwargs.get('encoding', 'utf-8')
                try:
                    return data.decode(encoding)
                except UnicodeDecodeError as e:
                    raise SourceDataError(f"Failed to decode S3 object: {str(e)}")
            
            return data
            
        except Exception as e:
            error_code = getattr(e, 'response', {}).get('Error', {}).get('Code', 'Unknown')
            if error_code in ['404', 'NoSuchKey']:
                raise SourceNotFoundError(f"S3 object not found: {self._resolved_path}")
            elif error_code in ['403', 'Forbidden']:
                raise SourcePermissionError(f"Access denied to S3 object: {self._resolved_path}")
            else:
                raise SourceConnectionError(f"Failed to read S3 object: {str(e)}")
    
    def read_stream(self, **kwargs) -> Iterator[Union[str, bytes]]:
        """Read S3 object as a stream."""
        if not self._key:
            raise SourceDataError("Cannot read data from bucket without object key")
        
        try:
            s3_client = self._get_s3_client()
            response = s3_client.get_object(Bucket=self._bucket, Key=self._key)
            
            chunk_size = kwargs.get('chunk_size', 8192)
            mode = kwargs.get('mode', 'binary')
            encoding = kwargs.get('encoding', 'utf-8')
            
            body = response['Body']
            try:
                while True:
                    chunk = body.read(chunk_size)
                    if not chunk:
                        break
                    
                    if mode == 'text':
                        try:
                            chunk = chunk.decode(encoding)
                        except UnicodeDecodeError as e:
                            raise SourceDataError(f"Failed to decode S3 object: {str(e)}")
                    
                    yield chunk
            finally:
                body.close()
                
        except Exception as e:
            error_code = getattr(e, 'response', {}).get('Error', {}).get('Code', 'Unknown')
            if error_code in ['404', 'NoSuchKey']:
                raise SourceNotFoundError(f"S3 object not found: {self._resolved_path}")
            elif error_code in ['403', 'Forbidden']:
                raise SourcePermissionError(f"Access denied to S3 object: {self._resolved_path}")
            else:
                raise SourceConnectionError(f"Failed to read S3 object: {str(e)}")
    
    def write_data(self, data: Union[str, bytes], **kwargs) -> bool:
        """Write data to S3 object."""
        if not self._key:
            raise SourceDataError("Cannot write data to bucket without object key")
        
        try:
            s3_client = self._get_s3_client()
            
            # Convert string to bytes if needed
            if isinstance(data, str):
                encoding = kwargs.get('encoding', 'utf-8')
                data = data.encode(encoding)
            
            # Prepare put_object arguments
            put_kwargs = {
                'Bucket': self._bucket,
                'Key': self._key,
                'Body': data
            }
            
            # Add optional parameters
            if 'content_type' in kwargs:
                put_kwargs['ContentType'] = kwargs['content_type']
            
            if 'metadata' in kwargs:
                put_kwargs['Metadata'] = kwargs['metadata']
            
            s3_client.put_object(**put_kwargs)
            return True
            
        except Exception as e:
            error_code = getattr(e, 'response', {}).get('Error', {}).get('Code', 'Unknown')
            if error_code in ['403', 'Forbidden']:
                raise SourcePermissionError(f"Access denied to write S3 object: {self._resolved_path}")
            else:
                raise SourceConnectionError(f"Failed to write S3 object: {str(e)}")
    
    def list_contents(self, path: Optional[str] = None) -> List[Dict[str, Any]]:
        """List contents of S3 bucket or prefix."""
        try:
            s3_client = self._get_s3_client()
            
            # Determine prefix to list
            prefix = path if path else self._key
            if prefix and not prefix.endswith('/'):
                prefix += '/'
            
            paginator = s3_client.get_paginator('list_objects_v2')
            page_iterator = paginator.paginate(
                Bucket=self._bucket,
                Prefix=prefix or '',
                Delimiter='/'
            )
            
            contents = []
            
            for page in page_iterator:
                # Add directories (common prefixes)
                for prefix_info in page.get('CommonPrefixes', []):
                    prefix_name = prefix_info['Prefix'].rstrip('/')
                    directory_name = prefix_name.split('/')[-1] if '/' in prefix_name else prefix_name
                    
                    # Skip empty directory names
                    if not directory_name:
                        continue
                    
                    contents.append({
                        'name': directory_name,
                        'path': f"s3://{self._bucket}/{prefix_info['Prefix']}",
                        'type': 'directory',
                        'is_directory': True,
                        'prefix': prefix_info['Prefix'],
                        'size': None,
                        'modified': None
                    })
                
                # Add files
                for obj in page.get('Contents', []):
                    # Skip the prefix itself and empty keys
                    if obj['Key'] == prefix or not obj['Key'].strip() or obj['Key'].endswith('/'):
                        continue
                    
                    file_name = obj['Key'].split('/')[-1] if '/' in obj['Key'] else obj['Key']
                    
                    # Skip empty file names
                    if not file_name:
                        continue
                    
                    # Use base class method for consistent timestamp formatting
                    time_data = self.format_last_modified(obj['LastModified'])
                    
                    item_info = {
                        'name': file_name,
                        'path': f"s3://{self._bucket}/{obj['Key']}",
                        'type': 'file',
                        'is_directory': False,
                        'size': obj['Size'],
                        'etag': obj['ETag'].strip('"'),
                        'storage_class': obj.get('StorageClass', 'STANDARD'),
                        'key': obj['Key']
                    }
                    # Add standardized time fields
                    item_info.update(time_data)
                    
                    contents.append(item_info)
            
            return contents
            
        except Exception as e:
            error_code = getattr(e, 'response', {}).get('Error', {}).get('Code', 'Unknown')
            if error_code in ['404', 'NoSuchBucket']:
                raise SourceNotFoundError(f"S3 bucket not found: {self._bucket}")
            elif error_code in ['403', 'Forbidden']:
                raise SourcePermissionError(f"Access denied to list S3 bucket: {self._bucket}")
            else:
                raise SourceConnectionError(f"Failed to list S3 contents: {str(e)}")
    
    def is_writable(self) -> bool:
        """S3 sources support writing."""
        return True
    
    def is_listable(self) -> bool:
        """S3 sources support listing."""
        return True
    
    def is_directory(self) -> bool:
        """Check if S3 source points to a directory (prefix)."""
        # If no key specified, it's a bucket (directory)
        if not self._key:
            return self.exists()
        
        # If key ends with '/', it's a prefix (directory)
        if self._key.endswith('/'):
            return self.exists()
        
        # Check if there are objects with this key as a prefix
        try:
            s3_client = self._get_s3_client()
            response = s3_client.list_objects_v2(
                Bucket=self._bucket,
                Prefix=self._key + '/',
                MaxKeys=1
            )
            # If there are objects with this prefix, it's a directory
            return response.get('KeyCount', 0) > 0
        except Exception:
            return False
    
    def is_file(self) -> bool:
        """Check if S3 source points to a single object (file)."""
        # If no key specified, it's a bucket (not a file)
        if not self._key:
            return False
        
        # If key ends with '/', it's a prefix (not a file)
        if self._key.endswith('/'):
            return False
        
        # Check if the exact object exists
        try:
            s3_client = self._get_s3_client()
            s3_client.head_object(Bucket=self._bucket, Key=self._key)
            return True
        except Exception:
            return False
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Clean up S3 client connections."""
        if self._s3_client:
            # boto3 clients don't need explicit closing
            self._s3_client = None
        if self._session:
            self._session = None
        super().__exit__(exc_type, exc_val, exc_tb)