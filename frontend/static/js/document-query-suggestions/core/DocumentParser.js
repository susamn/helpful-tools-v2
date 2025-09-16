/**
 * Abstract DocumentParser interface
 * Base class for all document type parsers
 */

class DocumentParser {
    constructor(options = {}) {
        this.options = {
            maxDepth: options.maxDepth || 5,
            ignoreArrayIndices: options.ignoreArrayIndices || false,
            includeSampleValues: options.includeSampleValues || true,
            ...options
        };
    }

    /**
     * Parse document content into structured data
     * @param {string} content - Raw document content
     * @returns {Promise<Object>} Parsed document
     */
    async parse(content) {
        throw new Error('parse() method must be implemented by subclass');
    }

    /**
     * Validate document syntax
     * @param {string} content - Raw document content
     * @returns {Promise<{valid: boolean, errors: Array}>}
     */
    async validate(content) {
        try {
            await this.parse(content);
            return { valid: true, errors: [] };
        } catch (error) {
            return { valid: false, errors: [error.message] };
        }
    }

    /**
     * Extract all possible query paths from document
     * @param {Object} document - Parsed document
     * @param {number} maxDepth - Maximum traversal depth
     * @returns {Promise<Array>} Array of path objects
     */
    async extractPaths(document, maxDepth = null) {
        const depth = maxDepth ?? this.options.maxDepth;
        const paths = new Set();
        this.traverseDocument(document, '', paths, 0, depth);
        return Array.from(paths);
    }

    /**
     * Get root-level suggestions for the document
     * @param {Object} document - Parsed document
     * @returns {Array} Array of suggestion objects
     */
    getRootSuggestions(document) {
        throw new Error('getRootSuggestions() method must be implemented by subclass');
    }

    /**
     * Get suggestions for a specific path in the document
     * @param {Object} document - Parsed document
     * @param {string} path - Current path
     * @returns {Array} Array of suggestion objects
     */
    getPathSuggestions(document, path) {
        throw new Error('getPathSuggestions() method must be implemented by subclass');
    }

    /**
     * Traverse document structure to extract paths
     * @param {*} obj - Current object being traversed
     * @param {string} currentPath - Current path string
     * @param {Set} paths - Set to collect paths
     * @param {number} currentDepth - Current traversal depth
     * @param {number} maxDepth - Maximum depth to traverse
     */
    traverseDocument(obj, currentPath, paths, currentDepth, maxDepth) {
        if (currentDepth >= maxDepth || obj === null || obj === undefined) {
            return;
        }

        // Add current path if not empty
        if (currentPath) {
            paths.add({
                path: currentPath,
                type: this.getValueType(obj),
                depth: currentDepth,
                hasChildren: this.hasChildren(obj),
                sampleValue: this.options.includeSampleValues ? this.getSampleValue(obj) : null
            });
        }

        // Recursively traverse based on object type
        if (Array.isArray(obj)) {
            this.traverseArray(obj, currentPath, paths, currentDepth, maxDepth);
        } else if (typeof obj === 'object' && obj !== null) {
            this.traverseObject(obj, currentPath, paths, currentDepth, maxDepth);
        }
    }

    /**
     * Traverse array elements
     */
    traverseArray(arr, currentPath, paths, currentDepth, maxDepth) {
        if (arr.length === 0) return;

        // Add array index patterns
        if (!this.options.ignoreArrayIndices) {
            const arrayPath = currentPath || this.getRootSelector();
            paths.add({
                path: this.formatArrayPath(arrayPath, '[0]'),
                type: 'array_element',
                depth: currentDepth,
                hasChildren: this.hasChildren(arr[0]),
                sampleValue: this.options.includeSampleValues ? this.getSampleValue(arr[0]) : null
            });

            if (arr.length > 1) {
                paths.add({
                    path: this.formatArrayPath(arrayPath, '[*]'),
                    type: 'array_wildcard',
                    depth: currentDepth,
                    hasChildren: this.hasChildren(arr[0]),
                    sampleValue: 'multiple values'
                });
            }
        }

        // Traverse first element to get structure
        if (arr.length > 0) {
            const elementPath = this.formatArrayPath(currentPath, '[0]');
            this.traverseDocument(arr[0], elementPath, paths, currentDepth + 1, maxDepth);
        }
    }

    /**
     * Traverse object properties
     */
    traverseObject(obj, currentPath, paths, currentDepth, maxDepth) {
        for (const [key, value] of Object.entries(obj)) {
            const propertyPath = this.formatPropertyPath(currentPath, key);
            this.traverseDocument(value, propertyPath, paths, currentDepth + 1, maxDepth);
        }
    }

    /**
     * Utility methods to be overridden by specific parsers
     */
    getValueType(value) {
        if (value === null) return 'null';
        if (Array.isArray(value)) return 'array';
        return typeof value;
    }

    hasChildren(value) {
        if (Array.isArray(value)) return value.length > 0;
        if (typeof value === 'object' && value !== null) {
            return Object.keys(value).length > 0;
        }
        return false;
    }

    getSampleValue(value) {
        if (value === null || value === undefined) return null;
        if (typeof value === 'string') return value.length > 50 ? value.substring(0, 47) + '...' : value;
        if (typeof value === 'number' || typeof value === 'boolean') return value;
        if (Array.isArray(value)) return `Array(${value.length})`;
        if (typeof value === 'object') return `Object(${Object.keys(value).length} keys)`;
        return String(value);
    }

    /**
     * Abstract methods for path formatting - to be implemented by subclasses
     */
    getRootSelector() {
        throw new Error('getRootSelector() method must be implemented by subclass');
    }

    formatPropertyPath(currentPath, property) {
        throw new Error('formatPropertyPath() method must be implemented by subclass');
    }

    formatArrayPath(currentPath, indexExpression) {
        throw new Error('formatArrayPath() method must be implemented by subclass');
    }

    /**
     * Get parser-specific information
     */
    getParserInfo() {
        return {
            name: this.constructor.name,
            supportedTypes: this.getSupportedTypes(),
            features: this.getSupportedFeatures()
        };
    }

    getSupportedTypes() {
        return ['generic'];
    }

    getSupportedFeatures() {
        return ['basic_parsing', 'path_extraction'];
    }
}

// Export for both CommonJS and ES modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { DocumentParser };
} else if (typeof window !== 'undefined') {
    window.DocumentParser = DocumentParser;
}