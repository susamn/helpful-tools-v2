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

        // For JSONL, return a merged schema object that represents all possible fields
        return this.createJsonlMergedSchema(objects);
    }

    /**
     * Create merged schema object from JSONL objects
     */
    createJsonlMergedSchema(objects) {
        if (objects.length === 0) {
            return {};
        }

        // Get representative objects for schema diversity
        const representativeObjects = this.getRepresentativeObjects(objects, 10);

        // Merge all fields from representative objects
        const mergedSchema = {};

        for (const obj of representativeObjects) {
            if (typeof obj === 'object' && obj !== null) {
                for (const [key, value] of Object.entries(obj)) {
                    // If we haven't seen this key, or we have a null value, use the new value
                    if (!(key in mergedSchema) || mergedSchema[key] === null) {
                        mergedSchema[key] = value;
                    }
                    // If we have different types for the same key, prefer non-null/non-undefined
                    else if (value !== null && value !== undefined) {
                        // Keep the more complex type (object > array > primitive)
                        if (typeof value === 'object' && typeof mergedSchema[key] !== 'object') {
                            mergedSchema[key] = value;
                        } else if (Array.isArray(value) && !Array.isArray(mergedSchema[key]) && typeof mergedSchema[key] !== 'object') {
                            mergedSchema[key] = value;
                        }
                    }
                }
            }
        }

        return mergedSchema;
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
        // Now all documents (including JSONL) are regular objects
        return super.extractPaths(document, maxDepth);
    }


    /**
     * Get representative objects that capture schema variations
     */
    getRepresentativeObjects(allObjects, maxSample = 10) {
        if (allObjects.length <= maxSample) {
            return allObjects;
        }

        const representative = new Set();
        const seenKeysets = new Set();

        // Always include first few objects
        for (let i = 0; i < Math.min(3, allObjects.length); i++) {
            representative.add(allObjects[i]);
            if (typeof allObjects[i] === 'object' && allObjects[i] !== null) {
                seenKeysets.add(JSON.stringify(Object.keys(allObjects[i]).sort()));
            }
        }

        // Sample more objects to find schema variations
        const sampleStep = Math.max(1, Math.floor(allObjects.length / maxSample));
        for (let i = 3; i < allObjects.length && representative.size < maxSample; i += sampleStep) {
            const obj = allObjects[i];
            if (typeof obj === 'object' && obj !== null) {
                const keyset = JSON.stringify(Object.keys(obj).sort());
                if (!seenKeysets.has(keyset)) {
                    representative.add(obj);
                    seenKeysets.add(keyset);
                }
            }
        }

        return Array.from(representative);
    }


    /**
     * Get root level suggestions for a document
     */
    getRootSuggestions(document) {
        return this.generateSuggestionsForValue(document, '$');
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