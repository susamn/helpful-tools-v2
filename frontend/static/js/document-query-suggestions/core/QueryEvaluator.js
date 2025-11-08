/**
 * Abstract QueryEvaluator interface
 * Base class for all query language evaluators
 */

class QueryEvaluator {
    constructor(options = {}) {
        this.options = {
            enableUnion: options.enableUnion !== false,
            maxResults: options.maxResults || 1000,
            timeout: options.timeout || 5000,
            ...options
        };
    }

    /**
     * Evaluate a query against a document
     * @param {Object} document - Parsed document
     * @param {string} query - Query string
     * @returns {Promise<Array>} Query results
     */
    async evaluate(document, query) {
        throw new Error('evaluate() method must be implemented by subclass');
    }

    /**
     * Get contextual suggestions for a partial query
     * @param {Object} document - Parsed document
     * @param {string} partialQuery - Partial query being typed
     * @param {Object} context - Query context information
     * @param {Array} availablePaths - Pre-extracted document paths
     * @returns {Promise<Array>} Array of suggestion objects
     */
    async getSuggestions(document, partialQuery, context, availablePaths) {
        throw new Error('getSuggestions() method must be implemented by subclass');
    }

    /**
     * Validate query syntax
     * @param {string} query - Query to validate
     * @returns {Promise<{valid: boolean, errors: Array}>}
     */
    async validateQuery(query) {
        try {
            await this.parseQuery(query);
            return { valid: true, errors: [] };
        } catch (error) {
            return { valid: false, errors: [error.message] };
        }
    }

    /**
     * Parse query into its components
     * @param {string} query - Query string
     * @returns {Object} Parsed query structure
     */
    parseQuery(query) {
        console.log('QueryEvaluator.parseQuery is about to throw an error for query:', query);
        throw new Error('parseQuery() method must be implemented by subclass');
    }

    /**
     * Get query language syntax information
     * @returns {Object} Syntax information and examples
     */
    getSyntaxInfo() {
        return {
            name: this.constructor.name,
            operators: this.getSupportedOperators(),
            functions: this.getSupportedFunctions(),
            examples: this.getExamples(),
            features: this.getSupportedFeatures()
        };
    }

    /**
     * Get supported operators for the query language
     */
    getSupportedOperators() {
        return [];
    }

    /**
     * Get supported functions for the query language
     */
    getSupportedFunctions() {
        return [];
    }

    /**
     * Get example queries
     */
    getExamples() {
        return [];
    }

    /**
     * Get supported features
     */
    getSupportedFeatures() {
        return ['basic_querying'];
    }

    /**
     * Check if query language supports union operations
     */
    supportsUnion() {
        return this.options.enableUnion;
    }

    /**
     * Split union query into individual expressions
     * @param {string} query - Union query
     * @returns {Array<string>} Individual query expressions
     */
    splitUnionQuery(query) {
        if (!this.supportsUnion()) {
            return [query];
        }

        // Default implementation - comma-separated
        return query.split(',').map(expr => expr.trim()).filter(expr => expr.length > 0);
    }

    /**
     * Combine multiple query results from union
     * @param {Array<Array>} results - Array of result arrays
     * @returns {Array} Combined results
     */
    combineUnionResults(results) {
        const combined = [];
        const seen = new Set();

        for (const resultSet of results) {
            for (const item of resultSet) {
                const key = typeof item === 'object' ? JSON.stringify(item) : String(item);
                if (!seen.has(key)) {
                    seen.add(key);
                    combined.push(item);
                }
            }
        }

        return combined;
    }

    /**
     * Utility method to determine suggestion type based on context
     */
    getSuggestionType(partialQuery, context) {
        if (!partialQuery) return 'root';
        if (partialQuery.endsWith('.')) return 'property';
        if (partialQuery.endsWith('[')) return 'array';
        if (partialQuery.includes('?')) return 'filter';
        return 'continuation';
    }

    /**
     * Filter suggestions based on partial input
     */
    filterSuggestions(suggestions, partialInput) {
        if (!partialInput) return suggestions;

        const input = partialInput.toLowerCase();
        return suggestions.filter(suggestion => {
            const text = (suggestion.text || suggestion).toLowerCase();
            const displayText = (suggestion.displayText || suggestion.text || suggestion).toLowerCase();
            return text.includes(input) || displayText.includes(input);
        });
    }

    /**
     * Sort suggestions by relevance
     */
    sortSuggestionsByRelevance(suggestions, partialInput) {
        if (!partialInput) return suggestions;

        const input = partialInput.toLowerCase();
        return suggestions.sort((a, b) => {
            const aText = (a.text || a).toLowerCase();
            const bText = (b.text || b).toLowerCase();

            // Exact matches first
            if (aText === input && bText !== input) return -1;
            if (bText === input && aText !== input) return 1;

            // Starts with matches next
            const aStarts = aText.startsWith(input);
            const bStarts = bText.startsWith(input);
            if (aStarts && !bStarts) return -1;
            if (bStarts && !aStarts) return 1;

            // Shorter matches preferred
            return aText.length - bText.length;
        });
    }

    /**
     * Limit number of suggestions returned
     */
    limitSuggestions(suggestions, maxCount = 10) {
        return suggestions.slice(0, maxCount);
    }

    /**
     * Enhanced suggestion processing pipeline
     */
    processSuggestions(suggestions, partialInput, maxCount = 10) {
        let processed = suggestions;

        // Filter based on input
        if (partialInput) {
            processed = this.filterSuggestions(processed, partialInput);
        }

        // Sort by relevance
        processed = this.sortSuggestionsByRelevance(processed, partialInput);

        // Limit results
        processed = this.limitSuggestions(processed, maxCount);

        return processed;
    }

    /**
     * Get evaluator information
     */
    getEvaluatorInfo() {
        return {
            name: this.constructor.name,
            language: this.getLanguageName(),
            features: this.getSupportedFeatures(),
            operators: this.getSupportedOperators(),
            functions: this.getSupportedFunctions(),
            supportsUnion: this.supportsUnion()
        };
    }

    /**
     * Get the query language name
     */
    getLanguageName() {
        return 'generic';
    }
}

// Export for both CommonJS and ES modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { QueryEvaluator };
} else if (typeof window !== 'undefined') {
    window.QueryEvaluator = QueryEvaluator;
}