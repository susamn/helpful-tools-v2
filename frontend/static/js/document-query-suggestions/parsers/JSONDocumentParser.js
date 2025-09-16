/**
 * JSON Document Parser
 * Handles JSON and JSONL (JSON Lines) formats
 */

class JSONDocumentParser extends DocumentParser {
    constructor(options = {}) {
        super(options);
        this.options = {
            ...this.options,
            supportJsonl: options.supportJsonl !== false,
            jsonlSampleSize: options.jsonlSampleSize || 3,
            ...options
        };
    }

    /**
     * Parse JSON content (supports both JSON and JSONL)
     */
    async parse(content) {
        if (!content || !content.trim()) {
            throw new Error('Empty content provided');
        }

        try {
            // Try parsing as regular JSON first
            return JSON.parse(content);
        } catch (jsonError) {
            // If JSON parsing fails, try JSONL format
            if (this.options.supportJsonl) {
                try {
                    return this.parseJsonl(content);
                } catch (jsonlError) {
                    throw new Error(`Invalid JSON: ${jsonError.message}. Also tried JSONL: ${jsonlError.message}`);
                }
            } else {
                throw new Error(`Invalid JSON: ${jsonError.message}`);
            }
        }
    }

    /**
     * Parse JSONL (JSON Lines) format
     */
    parseJsonl(content) {
        const lines = content.split('\n').filter(line => line.trim());
        if (lines.length === 0) {
            throw new Error('No valid JSON lines found');
        }

        const objects = [];
        for (let i = 0; i < lines.length; i++) {
            try {
                const parsed = JSON.parse(lines[i].trim());
                objects.push(parsed);
            } catch (error) {
                throw new Error(`Invalid JSON on line ${i + 1}: ${error.message}`);
            }
        }

        // Return metadata about JSONL format
        return {
            _jsonlFormat: true,
            _lineCount: objects.length,
            _sampleObjects: objects.slice(0, this.options.jsonlSampleSize),
            objects: objects
        };
    }

    /**
     * Check if content is JSONL format
     */
    isJsonl(content) {
        try {
            JSON.parse(content);
            return false; // Valid JSON, not JSONL
        } catch (e) {
            // Check if it could be JSONL
            const lines = content.split('\n').filter(line => line.trim());
            if (lines.length <= 1) return false;

            // Try parsing first few lines
            let validLines = 0;
            for (let i = 0; i < Math.min(3, lines.length); i++) {
                try {
                    JSON.parse(lines[i].trim());
                    validLines++;
                } catch (e) {
                    break;
                }
            }
            return validLines > 1;
        }
    }

    /**
     * Extract paths from JSON document
     */
    async extractPaths(document, maxDepth = null) {
        if (document._jsonlFormat) {
            return this.extractJsonlPaths(document, maxDepth);
        }
        return super.extractPaths(document, maxDepth);
    }

    /**
     * Extract paths from JSONL document
     */
    extractJsonlPaths(jsonlDocument, maxDepth = null) {
        const depth = maxDepth ?? this.options.maxDepth;
        const allPaths = new Set();

        // Extract paths from sample objects
        for (const obj of jsonlDocument._sampleObjects) {
            const paths = new Set();
            this.traverseDocument(obj, '', paths, 0, depth);
            paths.forEach(path => allPaths.add(path));
        }

        return Array.from(allPaths);
    }

    /**
     * Get root suggestions for JSON
     */
    getRootSuggestions(document) {
        if (document._jsonlFormat) {
            // For JSONL, use first object structure
            const firstObj = document._sampleObjects[0];
            if (!firstObj) return [];

            if (Array.isArray(firstObj)) {
                return [
                    { text: '$[0]', type: 'array_element', description: 'First element' },
                    { text: '$[*]', type: 'array_wildcard', description: 'All elements' },
                    { text: '$[(@.length-1)]', type: 'array_element', description: 'Last element' }
                ];
            } else if (typeof firstObj === 'object' && firstObj !== null) {
                return Object.keys(firstObj).map(key => ({
                    text: `$.${key}`,
                    type: 'property',
                    description: `Property: ${key}`,
                    sampleValue: this.getSampleValue(firstObj[key])
                }));
            }
        } else {
            // Regular JSON
            if (Array.isArray(document)) {
                return [
                    { text: '$[0]', type: 'array_element', description: 'First element' },
                    { text: '$[*]', type: 'array_wildcard', description: 'All elements' },
                    { text: '$[(@.length-1)]', type: 'array_element', description: 'Last element' }
                ];
            } else if (typeof document === 'object' && document !== null) {
                return Object.keys(document).map(key => ({
                    text: `$.${key}`,
                    type: 'property',
                    description: `Property: ${key}`,
                    sampleValue: this.getSampleValue(document[key])
                }));
            }
        }

        return [];
    }

    /**
     * Get suggestions for a specific path
     */
    getPathSuggestions(document, path) {
        try {
            // Use JSONPath to evaluate the path
            let result;
            if (document._jsonlFormat) {
                // For JSONL, evaluate against first sample object
                result = this.evaluateJsonPath(document._sampleObjects[0], path);
            } else {
                result = this.evaluateJsonPath(document, path);
            }

            if (result.length === 0) return [];

            const target = result[0];
            return this.generateSuggestionsForValue(target, path);
        } catch (error) {
            return [];
        }
    }

    /**
     * Generate suggestions for a given value
     */
    generateSuggestionsForValue(value, currentPath) {
        const suggestions = [];

        if (Array.isArray(value)) {
            suggestions.push(
                { text: '[0]', type: 'array_element', description: 'First element' },
                { text: '[*]', type: 'array_wildcard', description: 'All elements' }
            );

            if (value.length > 1) {
                suggestions.push(
                    { text: '[1]', type: 'array_element', description: 'Second element' },
                    { text: '[(@.length-1)]', type: 'array_element', description: 'Last element' }
                );
            }

            // Add filter suggestions if array contains objects
            if (value.length > 0 && typeof value[0] === 'object' && value[0] !== null) {
                const sampleKeys = Object.keys(value[0]).slice(0, 3);
                sampleKeys.forEach(key => {
                    suggestions.push({
                        text: `[?(@.${key})]`,
                        type: 'filter',
                        description: `Filter by ${key}`
                    });
                });
            }
        } else if (typeof value === 'object' && value !== null) {
            Object.keys(value).forEach(key => {
                suggestions.push({
                    text: key,
                    type: 'property',
                    description: `Property: ${key}`,
                    sampleValue: this.getSampleValue(value[key])
                });
            });
        }

        return suggestions;
    }

    /**
     * Simple JSONPath evaluation (basic implementation)
     */
    evaluateJsonPath(obj, path) {
        if (window.jsonpath && window.jsonpath.query) {
            return window.jsonpath.query(obj, path);
        }

        // Fallback basic implementation
        try {
            if (path === '$') return [obj];

            // Very basic path parsing - for production use proper JSONPath library
            const parts = path.replace(/^\$\.?/, '').split('.');
            let result = obj;

            for (const part of parts) {
                if (!part) continue;
                if (result === null || result === undefined) return [];
                result = result[part];
            }

            return result !== undefined ? [result] : [];
        } catch (error) {
            return [];
        }
    }

    /**
     * JSONPath-specific path formatting
     */
    getRootSelector() {
        return '$';
    }

    formatPropertyPath(currentPath, property) {
        if (!currentPath || currentPath === '$') {
            return `$.${property}`;
        }
        return `${currentPath}.${property}`;
    }

    formatArrayPath(currentPath, indexExpression) {
        if (!currentPath || currentPath === '$') {
            return `$${indexExpression}`;
        }
        return `${currentPath}${indexExpression}`;
    }

    /**
     * Parser information
     */
    getSupportedTypes() {
        return ['json', 'jsonl'];
    }

    getSupportedFeatures() {
        return [
            'basic_parsing',
            'path_extraction',
            'jsonl_support',
            'array_indexing',
            'object_properties',
            'nested_traversal',
            'filter_expressions'
        ];
    }

    /**
     * Validate JSON content
     */
    async validate(content) {
        try {
            await this.parse(content);
            const isJsonl = this.isJsonl(content);
            return {
                valid: true,
                errors: [],
                metadata: {
                    format: isJsonl ? 'jsonl' : 'json',
                    lineCount: isJsonl ? content.split('\n').filter(l => l.trim()).length : 1
                }
            };
        } catch (error) {
            return {
                valid: false,
                errors: [error.message],
                metadata: { format: 'unknown' }
            };
        }
    }
}

// Export for both CommonJS and ES modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { JSONDocumentParser };
} else if (typeof window !== 'undefined') {
    window.JSONDocumentParser = JSONDocumentParser;
}