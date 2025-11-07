/**
 * yq Query Evaluator
 * Handles yq-style expressions for YAML documents
 */

class YQEvaluator extends QueryEvaluator {
    constructor(options = {}) {
        super(options);
        this.options = {
            ...this.options,
            enablePipes: options.enablePipes !== false,
            enableFilters: options.enableFilters !== false,
            enableFunctions: options.enableFunctions !== false,
            ...options
        };
    }

    /**
     * Evaluate yq query against document
     */
    async evaluate(document, query) {
        if (this.supportsUnion() && query.includes(',')) {
            return this.evaluateUnionQuery(document, query);
        }

        return this.evaluateSingleQuery(document, query);
    }

    /**
     * Evaluate single yq expression
     */
    evaluateSingleQuery(document, query) {
        try {
            // Handle pipe operations
            if (query.includes('|') && this.options.enablePipes) {
                return this.evaluatePipeQuery(document, query);
            }

            // Basic path evaluation
            return this.evaluateBasicPath(document, query);
        } catch (error) {
            throw new Error(`yq evaluation failed: ${error.message}`);
        }
    }

    /**
     * Evaluate union (comma-separated) yq queries
     */
    evaluateUnionQuery(document, query) {
        const expressions = this.splitUnionQuery(query);
        const results = expressions.map(expr => this.evaluateSingleQuery(document, expr));
        return this.combineUnionResults(results);
    }

    /**
     * Evaluate pipe-based yq query
     */
    evaluatePipeQuery(document, query) {
        const parts = query.split('|').map(part => part.trim());
        let result = [document];

        for (const part of parts) {
            const newResults = [];
            for (const item of result) {
                const partResult = this.evaluateBasicPath(item, part);
                newResults.push(...partResult);
            }
            result = newResults;
        }

        return result;
    }

    /**
     * Evaluate basic yq path
     */
    evaluateBasicPath(document, path) {
        if (path === '.' || path === '') return [document];

        // Handle special functions
        if (path === 'keys') {
            return typeof document === 'object' && document !== null && !Array.isArray(document)
                ? [Object.keys(document)]
                : [];
        }

        if (path === 'keys[]') {
            return typeof document === 'object' && document !== null && !Array.isArray(document)
                ? Object.keys(document)
                : [];
        }

        if (path === 'length') {
            if (Array.isArray(document)) return [document.length];
            if (typeof document === 'object' && document !== null) return [Object.keys(document).length];
            if (typeof document === 'string') return [document.length];
            return [0];
        }

        if (path === 'values' || path === 'values[]') {
            if (typeof document === 'object' && document !== null && !Array.isArray(document)) {
                return path === 'values' ? [Object.values(document)] : Object.values(document);
            }
            return [];
        }

        // Handle array operations
        if (path === '.[]') {
            return Array.isArray(document) ? document : [];
        }

        // Handle select operations
        if (path.startsWith('select(')) {
            return this.evaluateSelectOperation(document, path);
        }

        // Handle map operations
        if (path.startsWith('map(')) {
            return this.evaluateMapOperation(document, path);
        }

        // Handle regular path traversal
        return this.traversePath(document, path);
    }

    /**
     * Traverse path in yq style
     */
    traversePath(document, path) {
        try {
            const cleanPath = path.replace(/^\./, '');
            if (!cleanPath) return [document];

            const parts = this.parsePath(cleanPath);
            let results = [document];

            for (const part of parts) {
                let nextResults = [];
                for (const item of results) {
                    const res = this.applyPathPart(item, part);
                    if (res !== undefined) {
                        if (Array.isArray(res) && (part.value === '[]' || part.value.includes(':'))) {
                             nextResults.push(...res);
                        } else {
                            nextResults.push(res);
                        }
                    }
                }
                results = nextResults;
            }
            return results;
        } catch (error) {
            if (error.message.startsWith("Invalid path:")) {
                throw error;
            }
            return [];
        }
    }

    /**
     * Parse yq path into components
     */
    parsePath(path) {
        if (path.includes('..')) {
            throw new Error("Invalid path: unexpected '..'");
        }
        const parts = [];
        let current = '';
        let inBrackets = false;
        let bracketDepth = 0;

        for (let i = 0; i < path.length; i++) {
            const char = path[i];

            if (char === '[') {
                if (current && !inBrackets) {
                    parts.push({ type: 'property', value: current });
                    current = '';
                }
                inBrackets = true;
                bracketDepth++;
                current += char;
            } else if (char === ']') {
                current += char;
                bracketDepth--;
                if (bracketDepth === 0) {
                    parts.push({ type: 'array', value: current });
                    current = '';
                    inBrackets = false;
                }
            } else if (char === '.' && !inBrackets) {
                if (current) {
                    parts.push({ type: 'property', value: current });
                    current = '';
                } else {
                    const lastPart = parts[parts.length - 1];
                    if (!lastPart || lastPart.type !== 'array') {
                        throw new Error("Invalid path: unexpected '..'");
                    }
                }
            } else {
                current += char;
            }
        }

        if (current) {
            parts.push({ type: inBrackets ? 'array' : 'property', value: current });
        }

        return parts;
    }

    /**
     * Apply a single path part
     */
    applyPathPart(obj, part) {
        if (part.type === 'property') {
            if (Array.isArray(obj)) {
                return obj.map(item => this.applyPathPart(item, part)).filter(i => i !== undefined);
            }
            return obj && typeof obj === 'object' ? obj[part.value] : undefined;
        } else if (part.type === 'array') {
            const indexStr = part.value.slice(1, -1); // Remove brackets

            if (indexStr === '') {
                // .[] - return all elements
                return Array.isArray(obj) ? obj : undefined;
            }

            if (indexStr.includes(':')) {
                // Slice operation
                return this.applySlice(obj, indexStr);
            }

            if (!isNaN(indexStr)) {
                // Numeric index
                const index = parseInt(indexStr);
                if (Array.isArray(obj)) {
                    return index >= 0 ? obj[index] : obj[obj.length + index];
                }
            }
        }

        return undefined;
    }

    /**
     * Apply slice operation
     */
    applySlice(array, sliceStr) {
        if (!Array.isArray(array)) return undefined;

        const [start, end] = sliceStr.split(':').map(s => s === '' ? undefined : parseInt(s));
        return array.slice(start, end);
    }

    /**
     * Evaluate select operation
     */
    evaluateSelectOperation(document, selectExpr) {
        // Simplified select implementation
        // In production, you'd need a proper expression parser
        if (Array.isArray(document)) {
            return document.filter(() => true); // Placeholder
        }
        return [document];
    }

    /**
     * Evaluate map operation
     */
    evaluateMapOperation(document, mapExpr) {
        // Simplified map implementation
        if (Array.isArray(document)) {
            return document; // Placeholder
        }
        return [document];
    }

    /**
     * Get contextual suggestions for yq
     */
    async getSuggestions(document, partialQuery, context, availablePaths) {
        try {
            // Handle empty or root queries
            if (!partialQuery || partialQuery === '.') {
                return this.getRootSuggestions(document);
            }

            // Handle pipe operations
            if (partialQuery.includes('|')) {
                return this.getPipeSuggestions(document, partialQuery, context);
            }

            // Handle property access (ends with .)
            if (partialQuery.endsWith('.')) {
                return this.getPropertySuggestions(document, partialQuery, context);
            }

            // Handle array access (ends with [)
            if (partialQuery.endsWith('[')) {
                return this.getArraySuggestions(document, partialQuery, context);
            }

            // Handle function suggestions
            if (this.isFunctionContext(partialQuery)) {
                return this.getFunctionSuggestions(document, partialQuery, context);
            }

            // Handle partial property names
            const lastDotIndex = partialQuery.lastIndexOf('.');
            if (lastDotIndex >= 0) {
                return this.getPartialPropertySuggestions(document, partialQuery, context, lastDotIndex);
            }

            return [];
        } catch (error) {
            console.error('Error generating yq suggestions:', error);
            return [];
        }
    }

    /**
     * Get root suggestions for yq
     */
    getRootSuggestions(document) {
        const suggestions = [];

        if (Array.isArray(document)) {
            suggestions.push(
                { text: '.[0]', type: 'array_element', description: 'First element' },
                { text: '.[]', type: 'array_wildcard', description: 'All elements' },
                { text: '.[-1]', type: 'array_last', description: 'Last element' }
            );
        } else if (typeof document === 'object' && document !== null) {
            Object.keys(document).forEach(key => {
                suggestions.push({
                    text: `.${key}`,
                    type: 'property',
                    description: `Property: ${key}`,
                    sampleValue: this.getSampleValue(document[key])
                });
            });

            // Add yq-specific functions
            suggestions.push(
                { text: '.keys', type: 'function', description: 'Get object keys' },
                { text: '.keys[]', type: 'function', description: 'Get keys as array elements' },
                { text: '.values', type: 'function', description: 'Get object values' },
                { text: '.length', type: 'function', description: 'Get object length' }
            );
        }

        // Add general yq operations
        suggestions.push(
            { text: '. | keys', type: 'pipe', description: 'Pipe to keys function' },
            { text: '. | length', type: 'pipe', description: 'Pipe to length function' }
        );

        return suggestions;
    }

    /**
     * Get pipe operation suggestions
     */
    getPipeSuggestions(document, partialQuery, context) {
        const suggestions = [];

        // Common pipe operations
        suggestions.push(
            { text: 'keys', type: 'function', description: 'Get keys' },
            { text: 'keys[]', type: 'function', description: 'Get keys as elements' },
            { text: 'values', type: 'function', description: 'Get values' },
            { text: 'length', type: 'function', description: 'Get length' },
            { text: 'select(.)', type: 'filter', description: 'Select items' },
            { text: 'map(.)', type: 'transform', description: 'Map transformation' },
            { text: 'sort', type: 'function', description: 'Sort array' },
            { text: 'reverse', type: 'function', description: 'Reverse array' },
            { text: 'unique', type: 'function', description: 'Get unique values' }
        );

        return suggestions;
    }

    /**
     * Check if we're in a function context
     */
    isFunctionContext(partialQuery) {
        return partialQuery.includes('select(') ||
               partialQuery.includes('map(') ||
               partialQuery.includes('has(');
    }

    /**
     * Get function-specific suggestions
     */
    getFunctionSuggestions(document, partialQuery, context) {
        const suggestions = [];

        if (partialQuery.includes('select(')) {
            suggestions.push(
                { text: '.key', type: 'property', description: 'Check property' },
                { text: '.key == "value"', type: 'condition', description: 'Equality check' },
                { text: '.key > 0', type: 'condition', description: 'Numeric comparison' }
            );
        }

        if (partialQuery.includes('has(')) {
            if (typeof document === 'object' && document !== null) {
                Object.keys(document).forEach(key => {
                    suggestions.push({
                        text: `"${key}"`,
                        type: 'property',
                        description: `Check for property: ${key}`
                    });
                });
            }
        }

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
                    { text: '[]', insertText: '[]', type: 'array_wildcard', description: 'All elements' },
                    { text: '[0]', insertText: '[0]', type: 'array_element', description: 'First element' }
                );
            } else if (typeof target === 'object' && target !== null) {
                Object.keys(target).forEach(key => {
                    const value = target[key];
                    suggestions.push({
                        text: key,
                        insertText: key,
                        type: 'property',
                        description: `Property: ${key}`,
                        sampleValue: this.getSampleValue(value)
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
                    { text: ']', insertText: ']', type: 'array_wildcard', description: 'All elements' },
                    { text: '0]', insertText: '0]', type: 'array_element', description: 'First element' }
                );

                if (target.length > 1) {
                    suggestions.push(
                        { text: '1]', insertText: '1]', type: 'array_element', description: 'Second element' },
                        { text: '-1]', insertText: '-1]', type: 'array_last', description: 'Last element' }
                    );
                }

                // Add slice suggestions
                if (target.length > 2) {
                    suggestions.push(
                        { text: '0:2]', insertText: '0:2]', type: 'slice', description: 'First 2 elements' },
                        { text: '1:]', insertText: '1:]', type: 'slice', description: 'All except first' }
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
                    const value = target[key];
                    suggestions.push({
                        text: key,
                        insertText: key,
                        type: 'property',
                        description: `Property: ${key}`,
                        sampleValue: this.getSampleValue(value),
                        replaceStart: context.expressionStart + lastDotIndex + 1,
                        replaceEnd: context.cursorPosition
                    });
                }
            });

            return suggestions;
        } catch (error) {
            return [];
        }
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
     * yq-specific operators
     */
    getSupportedOperators() {
        return [
            { symbol: '.', description: 'Identity/root' },
            { symbol: '.key', description: 'Property access' },
            { symbol: '.[]', description: 'Array/object iterator' },
            { symbol: '.[n]', description: 'Array index' },
            { symbol: '.[-n]', description: 'Negative array index' },
            { symbol: '.[n:m]', description: 'Array slice' },
            { symbol: '|', description: 'Pipe operator' },
            { symbol: ',', description: 'Union operator' }
        ];
    }

    /**
     * yq-specific functions
     */
    getSupportedFunctions() {
        return [
            { name: 'keys', description: 'Get object keys' },
            { name: 'keys[]', description: 'Get keys as array elements' },
            { name: 'values', description: 'Get object values' },
            { name: 'length', description: 'Get length' },
            { name: 'select()', description: 'Filter elements' },
            { name: 'map()', description: 'Transform elements' },
            { name: 'has()', description: 'Check property existence' },
            { name: 'sort', description: 'Sort array' },
            { name: 'reverse', description: 'Reverse array' },
            { name: 'unique', description: 'Get unique values' },
            { name: 'group_by()', description: 'Group by expression' },
            { name: 'min', description: 'Minimum value' },
            { name: 'max', description: 'Maximum value' }
        ];
    }

    /**
     * Example yq queries
     */
    getExamples() {
        return [
            { query: '.name', description: 'Get name property' },
            { query: '.users[]', description: 'Get all users' },
            { query: '.users[0]', description: 'First user' },
            { query: '.users[-1]', description: 'Last user' },
            { query: '.users | length', description: 'Number of users' },
            { query: '.users[] | .name', description: 'All user names' },
            { query: '.users[] | select(.age > 18)', description: 'Adult users' },
            { query: '.metadata.tags[1:3]', description: 'Slice of tags' }
        ];
    }

    /**
     * yq-specific features
     */
    getSupportedFeatures() {
        return [
            'property_access',
            'array_indexing',
            'array_slicing',
            'negative_indexing',
            'array_iteration',
            'pipe_operations',
            'filter_expressions',
            'map_transformations',
            'built_in_functions',
            'union_queries',
            'conditional_expressions'
        ];
    }

    /**
     * Get language name
     */
    getLanguageName() {
        return 'yq';
    }
}

// Export for both CommonJS and ES modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { YQEvaluator };
} else if (typeof window !== 'undefined') {
    window.YQEvaluator = YQEvaluator;
}