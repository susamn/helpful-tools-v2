/**
 * YAML Document Parser
 * Handles YAML format with yq-style querying
 */

class YAMLDocumentParser extends DocumentParser {
    constructor(options = {}) {
        super(options);
        this.options = {
            ...this.options,
            strictYaml: options.strictYaml || false,
            multiDocument: options.multiDocument || false,
            preserveComments: options.preserveComments || false,
            ...options
        };
    }

    /**
     * Parse YAML content
     */
    async parse(content) {
        if (!content || !content.trim()) {
            throw new Error('Empty YAML content provided');
        }

        try {
            // Try to use js-yaml if available
            if (window.jsyaml || (typeof require !== 'undefined' && require)) {
                return this.parseWithJsYaml(content);
            }

            // Fallback to simple YAML parsing
            return this.parseBasicYaml(content);
        } catch (error) {
            throw new Error(`Invalid YAML: ${error.message}`);
        }
    }

    /**
     * Parse YAML using js-yaml library
     */
    parseWithJsYaml(content) {
        const yaml = window.jsyaml || require('js-yaml');

        if (this.options.multiDocument) {
            const documents = [];
            yaml.loadAll(content, (doc) => {
                documents.push(doc);
            });
            return {
                _yamlMultiDoc: true,
                _documentCount: documents.length,
                documents: documents
            };
        } else {
            return yaml.load(content);
        }
    }

    /**
     * Basic YAML parsing (very limited - for fallback only)
     */
    parseBasicYaml(content) {
        // This is a very basic YAML parser for fallback
        // In production, always use a proper YAML library
        const lines = content.split('\n');
        const result = {};
        let currentPath = [];
        let currentObj = result;

        for (let line of lines) {
            line = line.trim();
            if (!line || line.startsWith('#')) continue;

            const colonIndex = line.indexOf(':');
            if (colonIndex === -1) continue;

            const key = line.substring(0, colonIndex).trim();
            const value = line.substring(colonIndex + 1).trim();

            if (value) {
                // Try to parse value
                let parsedValue = value;
                if (value === 'true' || value === 'false') {
                    parsedValue = value === 'true';
                } else if (!isNaN(value) && value !== '') {
                    parsedValue = parseFloat(value);
                } else if (value.startsWith('"') && value.endsWith('"')) {
                    parsedValue = value.slice(1, -1);
                } else if (value.startsWith("'") && value.endsWith("'")) {
                    parsedValue = value.slice(1, -1);
                }

                currentObj[key] = parsedValue;
            } else {
                // Object/array start
                currentObj[key] = {};
                currentPath.push(key);
                currentObj = currentObj[key];
            }
        }

        return result;
    }

    /**
     * Extract paths from YAML document
     */
    async extractPaths(document, maxDepth = null) {
        if (document._yamlMultiDoc) {
            return this.extractMultiDocPaths(document, maxDepth);
        }
        return super.extractPaths(document, maxDepth);
    }

    /**
     * Extract paths from multi-document YAML
     */
    extractMultiDocPaths(yamlDocument, maxDepth = null) {
        const depth = maxDepth ?? this.options.maxDepth;
        const allPaths = new Set();

        // Extract paths from each document
        yamlDocument.documents.forEach((doc, index) => {
            const paths = new Set();
            this.traverseDocument(doc, '', paths, 0, depth);
            paths.forEach(path => {
                // Add document index to path
                const modifiedPath = {
                    ...path,
                    path: `.[${index}]${path.path ? '.' + path.path : ''}`,
                    documentIndex: index
                };
                allPaths.add(modifiedPath);
            });
        });

        return Array.from(allPaths);
    }

    /**
     * Get root suggestions for YAML
     */
    getRootSuggestions(document) {
        if (document._yamlMultiDoc) {
            // Multi-document YAML
            const suggestions = [];
            document.documents.forEach((doc, index) => {
                suggestions.push({
                    text: `.[${index}]`,
                    type: 'document',
                    description: `Document ${index + 1}`,
                    sampleValue: this.getSampleValue(doc)
                });
            });

            // Add all documents selector
            suggestions.push({
                text: '.[]',
                type: 'document_wildcard',
                description: 'All documents'
            });

            return suggestions;
        } else {
            // Single document YAML
            if (Array.isArray(document)) {
                return [
                    { text: '.[0]', type: 'array_element', description: 'First element' },
                    { text: '.[]', type: 'array_wildcard', description: 'All elements' },
                    { text: '.[-1]', type: 'array_last', description: 'Last element' }
                ];
            } else if (typeof document === 'object' && document !== null) {
                return Object.keys(document).map(key => ({
                    text: `.${key}`,
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
            // Use yq-style evaluation if available
            let result;
            if (document._yamlMultiDoc) {
                // Handle multi-document paths
                result = this.evaluateYqPath(document, path);
            } else {
                result = this.evaluateYqPath(document, path);
            }

            if (result.length === 0) return [];

            const target = result[0];
            return this.generateSuggestionsForValue(target, path);
        } catch (error) {
            return [];
        }
    }

    /**
     * Generate suggestions for a given value (yq-style)
     */
    generateSuggestionsForValue(value, currentPath) {
        const suggestions = [];

        if (Array.isArray(value)) {
            suggestions.push(
                { text: '[0]', type: 'array_element', description: 'First element' },
                { text: '[]', type: 'array_wildcard', description: 'All elements' }
            );

            if (value.length > 1) {
                suggestions.push(
                    { text: '[1]', type: 'array_element', description: 'Second element' },
                    { text: '[-1]', type: 'array_last', description: 'Last element' }
                );
            }

            // Add slice suggestions
            if (value.length > 2) {
                suggestions.push(
                    { text: '[0:2]', type: 'slice', description: 'First 2 elements' },
                    { text: '[1:]', type: 'slice', description: 'All except first' }
                );
            }

            // Add filter suggestions for object arrays
            if (value.length > 0 && typeof value[0] === 'object' && value[0] !== null) {
                const sampleKeys = Object.keys(value[0]).slice(0, 3);
                sampleKeys.forEach(key => {
                    suggestions.push({
                        text: `[] | select(.${key})`,
                        type: 'filter',
                        description: `Filter by ${key} existence`
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

            // Add yq-specific operations
            suggestions.push(
                { text: 'keys', type: 'function', description: 'Get object keys' },
                { text: 'keys[]', type: 'function', description: 'Get object keys as array' },
                { text: 'length', type: 'function', description: 'Get object length' }
            );
        }

        return suggestions;
    }

    /**
     * Simple yq path evaluation (basic implementation)
     */
    evaluateYqPath(document, path) {
        if (path === '.') return [document];

        // Handle multi-document access
        if (document._yamlMultiDoc && path.startsWith('.[')) {
            const match = path.match(/^\.\[(\d+)\](.*)/);
            if (match) {
                const docIndex = parseInt(match[1]);
                const remainingPath = match[2] || '.';
                if (docIndex < document.documents.length) {
                    return this.evaluateYqPath(document.documents[docIndex], remainingPath);
                }
            }
        }

        // Basic path evaluation (simplified)
        try {
            const pathParts = path.replace(/^\./, '').split('.');
            let result = document;

            for (const part of pathParts) {
                if (!part) continue;

                // Handle array access
                if (part.includes('[') && part.includes(']')) {
                    const key = part.substring(0, part.indexOf('['));
                    const indexPart = part.substring(part.indexOf('[') + 1, part.indexOf(']'));

                    if (key) {
                        result = result[key];
                    }

                    if (Array.isArray(result)) {
                        if (indexPart === '') {
                            // .[] - return all elements
                            return result;
                        } else if (!isNaN(indexPart)) {
                            const index = parseInt(indexPart);
                            result = index >= 0 ? result[index] : result[result.length + index];
                        }
                    }
                } else {
                    result = result && typeof result === 'object' ? result[part] : undefined;
                }

                if (result === undefined) break;
            }

            return result !== undefined ? [result] : [];
        } catch (error) {
            return [];
        }
    }

    /**
     * YAML/yq-specific path formatting
     */
    getRootSelector() {
        return '.';
    }

    formatPropertyPath(currentPath, property) {
        if (!currentPath || currentPath === '.') {
            return `.${property}`;
        }
        return `${currentPath}.${property}`;
    }

    formatArrayPath(currentPath, indexExpression) {
        if (!currentPath || currentPath === '.') {
            return `.${indexExpression}`;
        }
        return `${currentPath}${indexExpression}`;
    }

    /**
     * Parser information
     */
    getSupportedTypes() {
        return ['yaml', 'yml'];
    }

    getSupportedFeatures() {
        return [
            'basic_parsing',
            'path_extraction',
            'multi_document',
            'array_indexing',
            'object_properties',
            'nested_traversal',
            'yq_style_queries',
            'slice_operations'
        ];
    }

    /**
     * Validate YAML content
     */
    async validate(content) {
        try {
            const result = await this.parse(content);
            return {
                valid: true,
                errors: [],
                metadata: {
                    format: 'yaml',
                    isMultiDocument: result._yamlMultiDoc || false,
                    documentCount: result._yamlMultiDoc ? result._documentCount : 1
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
    module.exports = { YAMLDocumentParser };
} else if (typeof window !== 'undefined') {
    window.YAMLDocumentParser = YAMLDocumentParser;
}