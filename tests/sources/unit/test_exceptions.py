"""
Tests for sources exceptions hierarchy.
"""

import pytest
import sys
import os

# Add src directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', '..', 'src'))

from sources.exceptions import (
    SourceException,
    SourceNotFoundError,
    SourceConnectionError,
    SourceConfigurationError,
    SourcePermissionError,
    SourceDataError,
    SourceTimeoutError,
    SourceAuthenticationError
)


class TestSourceException:
    """Test the base SourceException class."""
    
    def test_source_exception_creation(self):
        """Test creating a SourceException."""
        exception = SourceException("Test error message")
        assert str(exception) == "Test error message"
        assert isinstance(exception, Exception)
    
    def test_source_exception_inheritance(self):
        """Test that SourceException inherits from Exception."""
        exception = SourceException("Test")
        assert isinstance(exception, Exception)
        assert isinstance(exception, SourceException)
    
    def test_source_exception_empty_message(self):
        """Test creating SourceException with no message."""
        exception = SourceException()
        assert str(exception) == ""


class TestSourceNotFoundError:
    """Test SourceNotFoundError."""
    
    def test_creation(self):
        """Test creating SourceNotFoundError."""
        error = SourceNotFoundError("File not found")
        assert str(error) == "File not found"
        assert isinstance(error, SourceException)
        assert isinstance(error, SourceNotFoundError)
    
    def test_inheritance_chain(self):
        """Test inheritance chain."""
        error = SourceNotFoundError("Test")
        assert isinstance(error, Exception)
        assert isinstance(error, SourceException)
        assert isinstance(error, SourceNotFoundError)
    
    def test_catch_as_base_exception(self):
        """Test that it can be caught as base SourceException."""
        with pytest.raises(SourceException):
            raise SourceNotFoundError("Test error")
    
    def test_catch_as_specific_exception(self):
        """Test that it can be caught as specific exception."""
        with pytest.raises(SourceNotFoundError):
            raise SourceNotFoundError("Test error")


class TestSourceConnectionError:
    """Test SourceConnectionError."""
    
    def test_creation(self):
        """Test creating SourceConnectionError."""
        error = SourceConnectionError("Connection failed")
        assert str(error) == "Connection failed"
        assert isinstance(error, SourceException)
        assert isinstance(error, SourceConnectionError)
    
    def test_inheritance_chain(self):
        """Test inheritance chain."""
        error = SourceConnectionError("Test")
        assert isinstance(error, Exception)
        assert isinstance(error, SourceException)
        assert isinstance(error, SourceConnectionError)
    
    def test_catch_as_base_exception(self):
        """Test that it can be caught as base SourceException."""
        with pytest.raises(SourceException):
            raise SourceConnectionError("Test error")


class TestSourceConfigurationError:
    """Test SourceConfigurationError."""
    
    def test_creation(self):
        """Test creating SourceConfigurationError."""
        error = SourceConfigurationError("Invalid configuration")
        assert str(error) == "Invalid configuration"
        assert isinstance(error, SourceException)
        assert isinstance(error, SourceConfigurationError)
    
    def test_inheritance_chain(self):
        """Test inheritance chain."""
        error = SourceConfigurationError("Test")
        assert isinstance(error, Exception)
        assert isinstance(error, SourceException)
        assert isinstance(error, SourceConfigurationError)


class TestSourcePermissionError:
    """Test SourcePermissionError."""
    
    def test_creation(self):
        """Test creating SourcePermissionError."""
        error = SourcePermissionError("Access denied")
        assert str(error) == "Access denied"
        assert isinstance(error, SourceException)
        assert isinstance(error, SourcePermissionError)
    
    def test_inheritance_chain(self):
        """Test inheritance chain."""
        error = SourcePermissionError("Test")
        assert isinstance(error, Exception)
        assert isinstance(error, SourceException)
        assert isinstance(error, SourcePermissionError)


class TestSourceDataError:
    """Test SourceDataError."""
    
    def test_creation(self):
        """Test creating SourceDataError."""
        error = SourceDataError("Data corrupted")
        assert str(error) == "Data corrupted"
        assert isinstance(error, SourceException)
        assert isinstance(error, SourceDataError)
    
    def test_inheritance_chain(self):
        """Test inheritance chain."""
        error = SourceDataError("Test")
        assert isinstance(error, Exception)
        assert isinstance(error, SourceException)
        assert isinstance(error, SourceDataError)


class TestSourceTimeoutError:
    """Test SourceTimeoutError."""
    
    def test_creation(self):
        """Test creating SourceTimeoutError."""
        error = SourceTimeoutError("Operation timed out")
        assert str(error) == "Operation timed out"
        assert isinstance(error, SourceException)
        assert isinstance(error, SourceTimeoutError)
    
    def test_inheritance_chain(self):
        """Test inheritance chain."""
        error = SourceTimeoutError("Test")
        assert isinstance(error, Exception)
        assert isinstance(error, SourceException)
        assert isinstance(error, SourceTimeoutError)


class TestSourceAuthenticationError:
    """Test SourceAuthenticationError."""
    
    def test_creation(self):
        """Test creating SourceAuthenticationError."""
        error = SourceAuthenticationError("Authentication failed")
        assert str(error) == "Authentication failed"
        assert isinstance(error, SourceException)
        assert isinstance(error, SourceAuthenticationError)
    
    def test_inheritance_chain(self):
        """Test inheritance chain."""
        error = SourceAuthenticationError("Test")
        assert isinstance(error, Exception)
        assert isinstance(error, SourceException)
        assert isinstance(error, SourceAuthenticationError)


class TestExceptionHierarchy:
    """Test the overall exception hierarchy."""
    
    def test_all_exceptions_inherit_from_source_exception(self):
        """Test that all specific exceptions inherit from SourceException."""
        exception_classes = [
            SourceNotFoundError,
            SourceConnectionError,
            SourceConfigurationError,
            SourcePermissionError,
            SourceDataError,
            SourceTimeoutError,
            SourceAuthenticationError
        ]
        
        for exception_class in exception_classes:
            instance = exception_class("Test message")
            assert isinstance(instance, SourceException)
            assert isinstance(instance, Exception)
    
    def test_exception_distinction(self):
        """Test that different exceptions are distinct types."""
        exceptions = [
            SourceNotFoundError("Not found"),
            SourceConnectionError("Connection failed"),
            SourceConfigurationError("Config invalid"),
            SourcePermissionError("Access denied"),
            SourceDataError("Data corrupted"),
            SourceTimeoutError("Timeout"),
            SourceAuthenticationError("Auth failed")
        ]
        
        # Each exception should only be an instance of its own type
        # (plus base types)
        for i, exc1 in enumerate(exceptions):
            for j, exc2 in enumerate(exceptions):
                if i != j:
                    assert type(exc1) != type(exc2)
    
    def test_catch_all_with_base_exception(self):
        """Test catching all source exceptions with base exception."""
        exception_classes = [
            SourceNotFoundError,
            SourceConnectionError,
            SourceConfigurationError,
            SourcePermissionError,
            SourceDataError,
            SourceTimeoutError,
            SourceAuthenticationError
        ]
        
        for exception_class in exception_classes:
            with pytest.raises(SourceException):
                raise exception_class("Test error")
    
    def test_specific_exception_catching(self):
        """Test catching specific exceptions."""
        # Test that we can catch specific exceptions without catching others
        
        # Should catch SourceNotFoundError but not others
        with pytest.raises(SourceNotFoundError):
            try:
                raise SourceNotFoundError("Not found")
            except SourceConnectionError:
                pytest.fail("Should not catch SourceConnectionError")
            except SourceConfigurationError:
                pytest.fail("Should not catch SourceConfigurationError")
        
        # Should catch SourceConnectionError but not others
        with pytest.raises(SourceConnectionError):
            try:
                raise SourceConnectionError("Connection failed")
            except SourceNotFoundError:
                pytest.fail("Should not catch SourceNotFoundError")
            except SourceConfigurationError:
                pytest.fail("Should not catch SourceConfigurationError")
    
    def test_exception_messages_preserved(self):
        """Test that exception messages are preserved."""
        test_message = "This is a test error message with special chars: äöü"
        
        exception_classes = [
            SourceException,
            SourceNotFoundError,
            SourceConnectionError,
            SourceConfigurationError,
            SourcePermissionError,
            SourceDataError,
            SourceTimeoutError,
            SourceAuthenticationError
        ]
        
        for exception_class in exception_classes:
            exception = exception_class(test_message)
            assert str(exception) == test_message
    
    def test_exception_args_preserved(self):
        """Test that exception args are preserved."""
        args = ("arg1", "arg2", 123)
        
        exception_classes = [
            SourceException,
            SourceNotFoundError,
            SourceConnectionError,
            SourceConfigurationError,
            SourcePermissionError,
            SourceDataError,
            SourceTimeoutError,
            SourceAuthenticationError
        ]
        
        for exception_class in exception_classes:
            exception = exception_class(*args)
            assert exception.args == args
    
    def test_common_error_scenarios(self):
        """Test common error handling scenarios."""
        
        # Scenario 1: Handling file not found
        def simulate_file_operation():
            raise SourceNotFoundError("File '/path/to/file.txt' not found")
        
        with pytest.raises(SourceNotFoundError) as exc_info:
            simulate_file_operation()
        
        assert "not found" in str(exc_info.value).lower()
        
        # Scenario 2: Handling connection errors
        def simulate_network_operation():
            raise SourceConnectionError("Failed to connect to server example.com:443")
        
        with pytest.raises(SourceConnectionError) as exc_info:
            simulate_network_operation()
        
        assert "connect" in str(exc_info.value).lower()
        
        # Scenario 3: Handling configuration errors
        def simulate_config_validation():
            raise SourceConfigurationError("Missing required field 'username'")
        
        with pytest.raises(SourceConfigurationError) as exc_info:
            simulate_config_validation()
        
        assert "username" in str(exc_info.value)
    
    def test_exception_chaining(self):
        """Test exception chaining (from clause)."""
        original_error = ValueError("Original error")
        
        # Test that we can chain exceptions
        try:
            try:
                raise original_error
            except ValueError as e:
                raise SourceConnectionError("Connection failed due to configuration") from e
        except SourceConnectionError as wrapped_error:
            assert wrapped_error.__cause__ is original_error
            assert isinstance(wrapped_error.__cause__, ValueError)
    
    def test_exception_repr(self):
        """Test exception representations."""
        exception_classes = [
            (SourceException, "SourceException"),
            (SourceNotFoundError, "SourceNotFoundError"),
            (SourceConnectionError, "SourceConnectionError"),
            (SourceConfigurationError, "SourceConfigurationError"),
            (SourcePermissionError, "SourcePermissionError"),
            (SourceDataError, "SourceDataError"),
            (SourceTimeoutError, "SourceTimeoutError"),
            (SourceAuthenticationError, "SourceAuthenticationError")
        ]
        
        for exception_class, expected_name in exception_classes:
            exception = exception_class("Test message")
            repr_str = repr(exception)
            assert expected_name in repr_str
            assert "Test message" in repr_str