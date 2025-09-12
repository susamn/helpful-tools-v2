"""
Data sources package for the helpful-tools application.
"""

from .base import DataSourceInterface, BaseDataSource, SourceConfig, SourceMetadata, ConnectionTestResult
from .exceptions import *
from .local_file import LocalFileSource
from .s3 import S3Source
from .sftp import SftpSource
from .http import HttpSource
from .samba import SambaSource
from .factory import SourceFactory, create_source

__all__ = [
    # Base classes
    'DataSourceInterface', 'BaseDataSource', 'SourceConfig', 'SourceMetadata', 'ConnectionTestResult',
    
    # Exceptions
    'SourceException', 'SourceNotFoundError', 'SourceConnectionError', 
    'SourceConfigurationError', 'SourcePermissionError', 'SourceDataError',
    'SourceTimeoutError', 'SourceAuthenticationError',
    
    # Source implementations
    'LocalFileSource', 'S3Source', 'SftpSource', 'HttpSource', 'SambaSource',
    
    # Factory
    'SourceFactory', 'create_source'
]