/**
 * JSONPath Query Evaluator
 * Handles JSONPath expressions with contextual suggestions
 */

class JSONPathEvaluator extends QueryEvaluator {
    constructor(options = {}) {
        super(options);
        this.options = {
            ...this.options,
            strictMode: options.strictMode || false,
            enableFilters: options.enableFilters !== false,
            enableFunctions: options.enableFunctions !== false,
            ...options
        };
    }

    /**
     * Evaluate JSONPath query against document
     */
    async evaluate(document, query) {
        if (this.supportsUnion() && query.includes(',')) {
            return this.evaluateUnionQuery(document, query);
        }

        return this.evaluateSingleQuery(document, query);
    }

    /**
     * Evaluate single JSONPath expression
     */
    evaluateSingleQuery(document, query) {
        try {
            // Use external JSONPath library if available
            if (window.jsonpath && window.jsonpath.query) {
                return window.jsonpath.query(document, query);
            }

            // Fallback to basic implementation
            return this.basicJsonPathEvaluation(document, query);
        } catch (error) {
            throw new Error(`JSONPath evaluation failed: ${error.message}`);
        }
    }

    /**
     * Evaluate union (comma-separated) JSONPath queries
     */
    evaluateUnionQuery(document, query) {
        const expressions = this.splitUnionQuery(query);
        const results = expressions.map(expr => this.evaluateSingleQuery(document, expr));
        return this.combineUnionResults(results);
    }

    /**
     * Basic JSONPath evaluation (fallback when library not available)
     */
    basicJsonPathEvaluation(document, query) {
        if (query === '$') return [document];

        // Very basic implementation - in production use proper JSONPath library
        const path = query.replace(/^\$\.?/, '');
        const parts = path.split(/[\.\[]/);
        let result = document;

        for (let part of parts) {
            if (!part) continue;

            // Handle array indices
            if (part.includes(']')) {
                const index = part.replace(']', '');
                if (index === '*') {
                    result = Array.isArray(result) ? result : [];
                } else if (!isNaN(index)) {
                    result = Array.isArray(result) ? result[parseInt(index)] : undefined;
                }
            } else {
                result = result && typeof result === 'object' ? result[part] : undefined;
            }

            if (result === undefined) break;
        }

        return result !== undefined ? [result] : [];
    }

    /**
     * Get contextual suggestions for JSONPath
     */
    async getSuggestions(document, partialQuery, context, availablePaths) {
        const suggestions = [];

        try {
            // Root suggestions
            if (!partialQuery || partialQuery === '$') {
                return this.getRootSuggestions(document);
            }

            // Property access (ends with .)
            if (partialQuery.endsWith('.')) {
                return this.getPropertySuggestions(document, partialQuery, context);
            }

            // Array access (ends with [)
            if (partialQuery.endsWith('[')) {
                return this.getArraySuggestions(document, partialQuery, context);
            }

            // Partial property name
            const lastDotIndex = partialQuery.lastIndexOf('.');
            if (lastDotIndex > 0) {
                return this.getPartialPropertySuggestions(document, partialQuery, context, lastDotIndex);
            }

            // Filter expressions
            if (partialQuery.includes('?') && this.options.enableFilters) {
                return this.getFilterSuggestions(document, partialQuery, context);
            }

            return suggestions;
        } catch (error) {
            console.error('Error generating JSONPath suggestions:', error);
            return [];
        }
    }

    /**
     * Get root-level suggestions
     */
    getRootSuggestions(document) {
        const suggestions = [];

        if (Array.isArray(document)) {
            suggestions.push(
                { text: '$[0]', type: 'array_element', description: 'First element' },
                { text: '$[*]', type: 'array_wildcard', description: 'All elements' },
                { text: '$[(@.length-1)]', type: 'array_last', description: 'Last element' }
            );

            if (document.length > 1) {
                suggestions.push(
                    { text: '$[1]', type: 'array_element', description: 'Second element' }
                );
            }
        } else if (typeof document === 'object' && document !== null) {
            Object.keys(document).forEach(key => {
                suggestions.push({
                    text: `$.${key}`,
                    type: 'property',
                    description: `Property: ${key}`,
                    sampleValue: this.getSampleValue(document[key])
                });
            });
        }

        // Add recursive descent
        suggestions.push({
            text: '$..*',
            type: 'recursive',
            description: 'Recursive descent (all values)'
        });

        return suggestions;
    }

    /**
     * Get property suggestions (after .)
     */
    getPropertySuggestions(document, partialQuery, context) {
        const basePath = partialQuery.slice(0, -1); // Remove trailing dot

        try {
            const result = this.evaluateSingleQuery(document, basePath);
            if (result.length === 0) return [];

            const target = result[0];
            const suggestions = [];

            if (Array.isArray(target)) {
                suggestions.push(
                    { text: '[0]', type: 'array_element', description: 'First element' },
                    { text: '[*]', type: 'array_wildcard', description: 'All elements' },
                    { text: '[(@.length-1)]', type: 'array_last', description: 'Last element' }
                );
            } else if (typeof target === 'object' && target !== null) {
                Object.keys(target).forEach(key => {
                    suggestions.push({
                        text: key,
                        type: 'property',
                        description: `Property: ${key}`,
                        sampleValue: this.getSampleValue(target[key])
                    });
                });
            }

            return suggestions;
        } catch (error) {
            return [];
        }
    }

    /**
     * Get array access suggestions (after [)
     */
    getArraySuggestions(document, partialQuery, context) {
        const basePath = partialQuery.slice(0, -1); // Remove trailing [

        try {
            const result = this.evaluateSingleQuery(document, basePath);
            if (result.length === 0) return [];

            const target = result[0];
            const suggestions = [];

            if (Array.isArray(target)) {
                suggestions.push(
                    { text: '*', type: 'array_wildcard', description: 'All elements' },
                    { text: '0', type: 'array_element', description: 'First element (index 0)' }
                );

                if (target.length > 1) {
                    suggestions.push(
                        { text: '1', type: 'array_element', description: 'Second element (index 1)' },
                        { text: '(@.length-1)', type: 'array_last', description: 'Last element' }
                    );
                }

                // Add filter suggestions if array contains objects
                if (target.length > 0 && typeof target[0] === 'object' && target[0] !== null) {
                    const sampleKeys = Object.keys(target[0]).slice(0, 3);
                    sampleKeys.forEach(key => {
                        suggestions.push({
                            text: `?(@.${key})`,
                            type: 'filter',
                            description: `Filter by ${key} existence`
                        });

                        const sampleValue = target[0][key];
                        if (typeof sampleValue === 'string') {
                            suggestions.push({
                                text: `?(@.${key} == '${sampleValue}')`,
                                type: 'filter',
                                description: `Filter by ${key} equals '${sampleValue}'`
                            });
                        } else if (typeof sampleValue === 'number') {
                            suggestions.push({
                                text: `?(@.${key} > ${sampleValue - 1})`,
                                type: 'filter',
                                description: `Filter by ${key} greater than ${sampleValue - 1}`
                            });
                        }
                    });
                }

                // Add slice suggestions
                if (target.length > 2) {
                    suggestions.push(
                        { text: '0:2', type: 'slice', description: 'First 2 elements (slice)' },
                        { text: '1:', type: 'slice', description: 'All except first element' },
                        { text: ':3', type: 'slice', description: 'First 3 elements' }
                    );
                }
            }

            return suggestions;
        } catch (error) {
            return [];
        }
    }

    /**
     * Get partial property name suggestions
     */
    getPartialPropertySuggestions(document, partialQuery, context, lastDotIndex) {
        const parentPath = partialQuery.substring(0, lastDotIndex);
        const partialProperty = partialQuery.substring(lastDotIndex + 1);

        try {
            const result = this.evaluateSingleQuery(document, parentPath);
            if (result.length === 0) return [];

            const target = result[0];
            if (typeof target !== 'object' || target === null) return [];

            const suggestions = [];
            Object.keys(target).forEach(key => {
                if (key.toLowerCase().startsWith(partialProperty.toLowerCase())) {
                    suggestions.push({
                        text: key,
                        type: 'property',
                        description: `Property: ${key}`,
                        sampleValue: this.getSampleValue(target[key])
                    });
                }
            });

            return suggestions;
        } catch (error) {
            return [];
        }
    }

    /**
     * Get filter expression suggestions
     */
    getFilterSuggestions(document, partialQuery, context) {
        // This is a simplified implementation
        // In a full implementation, you'd parse the filter expression more carefully
        const suggestions = [];

        suggestions.push(
            { text: '(@.id)', type: 'filter_field', description: 'Filter by id field' },
            { text: '(@.name)', type: 'filter_field', description: 'Filter by name field' },
            { text: '(@.length > 0)', type: 'filter_condition', description: 'Non-empty arrays' },
            { text: "(@.type == 'value')", type: 'filter_condition', description: 'String equality' }
        );

        return suggestions;
    }

    /**
     * Parse JSONPath query structure
     */
    parseQuery(query) {
        const structure = {
            original: query,
            expressions: [],
            isUnion: false,
            hasFilters: false,
            hasRecursive: false,
            hasSlicing: false
        };

        if (query.includes(',')) {
            structure.isUnion = true;
            structure.expressions = this.splitUnionQuery(query);
        } else {
            structure.expressions = [query];
        }

        // Analyze each expression
        structure.expressions.forEach(expr => {
            if (expr.includes('?')) structure.hasFilters = true;
            if (expr.includes('..')) structure.hasRecursive = true;
            if (expr.includes(':')) structure.hasSlicing = true;
        });

        return structure;
    }

    /**
     * Get sample value for display
     */
    getSampleValue(value) {
        if (value === null || value === undefined) return null;
        if (typeof value === 'string') return value.length > 30 ? value.substring(0, 27) + '...' : value;
        if (typeof value === 'number' || typeof value === 'boolean') return value;
        if (Array.isArray(value)) return `Array(${value.length})`;
        if (typeof value === 'object') return `Object(${Object.keys(value).length} keys)`;
        return String(value);
    }

    /**
     * JSONPath-specific operators
     */
    getSupportedOperators() {
        return [
            { symbol: '$', description: 'Root element' },
            { symbol: '.', description: 'Child operator' },
            { symbol: '..', description: 'Recursive descent' },
            { symbol: '*', description: 'Wildcard' },
            { symbol: '[*]', description: 'Array wildcard' },
            { symbol: '[n]', description: 'Array index' },
            { symbol: '[start:end]', description: 'Array slice' },
            { symbol: '?(@.field)', description: 'Filter expression' },
            { symbol: '(@.length-1)', description: 'Last array element' }
        ];
    }

    /**
     * JSONPath-specific functions
     */
    getSupportedFunctions() {
        return [
            { name: 'length', description: 'Array/object length' },
            { name: 'keys', description: 'Object keys' },
            { name: 'values', description: 'Object values' }
        ];
    }

    /**
     * Example JSONPath queries
     */
    getExamples() {
        return [
            { query: '$.store.book[0].title', description: 'First book title' },
            { query: '$.store.book[*].author', description: 'All book authors' },
            { query: '$.store.book[?(@.price < 10)]', description: 'Books under $10' },
            { query: '$..author', description: 'All authors (recursive)' },
            { query: '$.store.book[0:2]', description: 'First two books' },
            { query: '$.metadata.id,$.users[0].name', description: 'Union query (multiple paths)' }
        ];
    }

    /**
     * JSONPath-specific features
     */
    getSupportedFeatures() {
        return [
            'root_selection',
            'property_access',
            'array_indexing',
            'array_slicing',
            'wildcard_selection',
            'recursive_descent',
            'filter_expressions',
            'union_queries',
            'comparison_operators',
            'array_functions'
        ];
    }

    /**
     * Get language name
     */
    getLanguageName() {
        return 'JSONPath';
    }
}

// Export for both CommonJS and ES modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { JSONPathEvaluator };
} else if (typeof window !== 'undefined') {
    window.JSONPathEvaluator = JSONPathEvaluator;
}