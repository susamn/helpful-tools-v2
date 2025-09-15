"""
Factory for creating data source instances.
"""

from typing import Dict, Type, Any
from .base import DataSourceInterface, SourceConfig
from .exceptions import SourceConfigurationError
from .local_file import LocalFileSource
from .s3 import S3Source
from .sftp import SftpSource
from .http import HttpSource
from .samba import SambaSource


class SourceFactory:
    """Factory class for creating data source instances."""
    
    # Registry mapping source types to implementation classes
    _source_registry: Dict[str, Type[DataSourceInterface]] = {
        'local_file': LocalFileSource,
        'file': LocalFileSource,  # alias
        's3': S3Source,
        'sftp': SftpSource,
        'http': HttpSource,
        'https': HttpSource,  # same implementation
        'samba': SambaSource,
        'smb': SambaSource,  # alias
    }
    
    @classmethod
    def register_source_type(cls, source_type: str, source_class: Type[DataSourceInterface]):
        """Register a new source type."""
        cls._source_registry[source_type.lower()] = source_class
    
    @classmethod
    def get_available_types(cls) -> list[str]:
        """Get list of available source types."""
        return list(cls._source_registry.keys())
    
    @classmethod
    def create_source(cls, config: SourceConfig) -> DataSourceInterface:
        """
        Create a data source instance from configuration.
        
        Args:
            config: Source configuration object
            
        Returns:
            Data source instance
            
        Raises:
            SourceConfigurationError: If source type is not supported
        """
        source_type = config.source_type.lower()
        
        if source_type not in cls._source_registry:
            available_types = ', '.join(cls.get_available_types())
            raise SourceConfigurationError(
                f"Unsupported source type: {source_type}. "
                f"Available types: {available_types}"
            )
        
        source_class = cls._source_registry[source_type]
        return source_class(config)
    
    @classmethod
    def create_source_from_dict(cls, source_data: Dict[str, Any]) -> DataSourceInterface:
        """
        Create a data source instance from dictionary data.
        
        Args:
            source_data: Dictionary containing source configuration
            
        Returns:
            Data source instance
        """
        from datetime import datetime
        
        # Convert dictionary to SourceConfig
        config = SourceConfig(
            source_id=source_data['source_id'],
            name=source_data['name'],
            source_type=source_data['source_type'],
            static_config=source_data.get('staticConfig', source_data.get('static_config', {})),
            path_template=source_data.get('pathTemplate', source_data.get('path_template', source_data.get('path', ''))),
            dynamic_variables=source_data.get('dynamicVariables', source_data.get('dynamic_variables', {})),
            created_at=source_data.get('created_at', datetime.now()),
            updated_at=source_data.get('updated_at', datetime.now()),
            last_accessed=source_data.get('last_accessed'),
            last_tested=source_data.get('last_tested'),
            status=source_data.get('status', 'created'),
            is_directory=source_data.get('is_directory'),
            level=source_data.get('level', 0)
        )
        
        return cls.create_source(config)
    
    @classmethod
    def infer_source_type_from_path(cls, path: str) -> str:
        """
        Infer source type from path/URL.
        
        Args:
            path: Path or URL string
            
        Returns:
            Inferred source type
            
        Raises:
            SourceConfigurationError: If type cannot be inferred
        """
        path_lower = path.lower().strip()
        
        if path_lower.startswith('s3://'):
            return 's3'
        elif path_lower.startswith('sftp://'):
            return 'sftp'
        elif path_lower.startswith(('http://', 'https://')):
            return 'http'
        elif path_lower.startswith('smb://'):
            return 'samba'
        elif path_lower.startswith('/') or ':\\' in path or path_lower.startswith('./'):
            return 'local_file'
        else:
            raise SourceConfigurationError(f"Cannot infer source type from path: {path}")


# Convenience function
def create_source(config: SourceConfig) -> DataSourceInterface:
    """
    Create a data source instance from configuration.
    
    Args:
        config: Source configuration object
        
    Returns:
        Data source instance
    """
    return SourceFactory.create_source(config)