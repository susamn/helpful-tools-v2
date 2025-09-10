"""
Custom exceptions for data sources.
"""

class SourceException(Exception):
    """Base exception for all source-related errors."""
    pass

class SourceNotFoundError(SourceException):
    """Raised when a source cannot be found."""
    pass

class SourceConnectionError(SourceException):
    """Raised when connection to a source fails."""
    pass

class SourceConfigurationError(SourceException):
    """Raised when source configuration is invalid."""
    pass

class SourcePermissionError(SourceException):
    """Raised when access to a source is denied."""
    pass

class SourceDataError(SourceException):
    """Raised when data from source is invalid or corrupted."""
    pass

class SourceTimeoutError(SourceException):
    """Raised when source operation times out."""
    pass

class SourceAuthenticationError(SourceException):
    """Raised when authentication to source fails."""
    pass

class SourceConfigurationError(SourceException):
    """Raised when source configuration is invalid."""
    pass