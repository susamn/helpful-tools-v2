"""
XML Schema (XSD) validator implementation using xmlschema package.
"""

from typing import Any, Dict, Optional
from xml.etree import ElementTree as ET
try:
    import xmlschema
    XMLSCHEMA_AVAILABLE = True
except ImportError:
    XMLSCHEMA_AVAILABLE = False

from .base import BaseValidator, ValidationResult, ValidationError


class XmlSchemaValidator(BaseValidator):
    """
    Validator for XML Schema (XSD) validation.

    Validates XML data against XML Schema Definition (XSD) files using the xmlschema package.
    """

    def __init__(self, validator_id: str, name: str, schema_content: str, config: Optional[Dict[str, Any]] = None):
        """Initialize XML Schema validator."""
        if not XMLSCHEMA_AVAILABLE:
            raise ValidationError("xmlschema package is not installed. Please install it: pip install xmlschema")

        super().__init__(validator_id, name, schema_content, config)

    def _initialize_schema(self) -> None:
        """Initialize the XML schema."""
        try:
            # Parse the XSD schema using xmlschema
            self._schema = xmlschema.XMLSchema(self.schema_content)
        except xmlschema.XMLSchemaException as e:
            raise ValidationError(f"Invalid XML Schema: {str(e)}")
        except Exception as e:
            raise ValidationError(f"Error parsing XML Schema: {str(e)}")

    def validate_data(self, data: Any) -> ValidationResult:
        """
        Validate XML data against the schema.

        Args:
            data: The XML data to validate (string or ElementTree)

        Returns:
            ValidationResult with validation outcome
        """
        result = ValidationResult(is_valid=True, errors=[], warnings=[])

        try:
            # Convert data to string if needed
            if isinstance(data, str):
                xml_string = data
            elif hasattr(data, 'getroot'):  # ElementTree
                xml_string = ET.tostring(data.getroot(), encoding='unicode')
            elif hasattr(data, 'tag'):  # Element
                xml_string = ET.tostring(data, encoding='unicode')
            else:
                result.add_error(f"Unsupported data type for XML validation: {type(data)}")
                return result

            # Validate against schema
            try:
                # This will raise an exception if validation fails
                self._schema.validate(xml_string)

                # If we get here, validation passed
                result.details = {
                    'schema_namespace': self._get_schema_namespace(),
                    'root_element': self._get_root_element(xml_string),
                    'validated_against': self.name,
                    'schema_version': getattr(self._schema, 'version', 'unknown')
                }

            except xmlschema.XMLSchemaException as e:
                result.is_valid = False
                result.add_error(f"Schema validation failed: {str(e)}")
            except ET.ParseError as e:
                result.is_valid = False
                result.add_error(f"XML parsing error: {str(e)}")

        except Exception as e:
            result.add_error(f"Validation error: {str(e)}")

        return result

    def validate_string(self, data_string: str) -> ValidationResult:
        """
        Validate XML string data.

        Args:
            data_string: XML string to validate

        Returns:
            ValidationResult with validation outcome
        """
        return self.validate_data(data_string)

    def get_validator_type(self) -> str:
        """Return the validator type identifier."""
        return 'xml_schema'

    def _get_schema_namespace(self) -> str:
        """Get the target namespace of the schema."""
        try:
            return getattr(self._schema, 'target_namespace', '') or ''
        except:
            return ''

    def _get_root_element(self, xml_string: str) -> str:
        """Get the root element name from XML string."""
        try:
            root = ET.fromstring(xml_string)
            return root.tag
        except:
            return 'unknown'

    def get_schema_info(self) -> Dict[str, Any]:
        """Get detailed schema information."""
        info = super().get_schema_info()

        try:
            info.update({
                'target_namespace': self._get_schema_namespace(),
                'schema_version': getattr(self._schema, 'version', ''),
                'element_form_default': getattr(self._schema, 'element_form_default', ''),
                'elements_count': len(getattr(self._schema, 'elements', {})),
                'types_count': len(getattr(self._schema, 'types', {}))
            })
        except:
            pass

        return info