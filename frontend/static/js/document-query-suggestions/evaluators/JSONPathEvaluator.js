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

            // Data history suggestions for compare() function - check BEFORE pipe functions
            if (partialQuery.includes('compare(')) {
                return await this.getDataHistorySuggestions(document, partialQuery, context);
            }

            // Key suggestions for select() function parameters
            if (partialQuery.includes('select(')) {
                return this.getSelectKeySuggestions(document, partialQuery, context);
            }

            // Pipe function suggestions (after |)
            if (partialQuery.includes('|') && this.options.enableFunctions) {
                return this.getPipeFunctionSuggestions(document, partialQuery, context);
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
                { text: '$[0]', insertText: '$[0]', type: 'array_element', description: 'First element' },
                { text: '$[*]', insertText: '$[*]', type: 'array_wildcard', description: 'All elements' },
                { text: '$[(@.length-1)]', insertText: '$[(@.length-1)]', type: 'array_last', description: 'Last element' }
            );

            if (document.length > 1) {
                suggestions.push(
                    { text: '$[1]', insertText: '$[1]', type: 'array_element', description: 'Second element' }
                );
            }
        } else if (typeof document === 'object' && document !== null) {
            Object.keys(document).forEach(key => {
                const value = document[key];
                const valueType = this.getValueType(value);
                suggestions.push({
                    text: `$.${key}`,
                    insertText: `$.${key}`,
                    type: valueType,
                    description: this.getTypeDescription(valueType, key),
                    sampleValue: this.getSampleValue(value)
                });
            });
        }

        // Add recursive descent
        suggestions.push({
            text: '$..*',
            insertText: '$..*',
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
                    {
                        text: '[0]',
                        insertText: partialQuery + '[0]',
                        type: 'array_element',
                        description: 'First element'
                    },
                    {
                        text: '[*]',
                        insertText: partialQuery + '[*]',
                        type: 'array_wildcard',
                        description: 'All elements'
                    },
                    {
                        text: '[(@.length-1)]',
                        insertText: partialQuery + '[(@.length-1)]',
                        type: 'array_last',
                        description: 'Last element'
                    }
                );
            } else if (typeof target === 'object' && target !== null) {
                Object.keys(target).forEach(key => {
                    const value = target[key];
                    const valueType = this.getValueType(value);
                    suggestions.push({
                        text: key,
                        insertText: partialQuery + key,
                        type: valueType,
                        description: this.getTypeDescription(valueType, key),
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
                    {
                        text: '*]',
                        insertText: partialQuery + '*]',
                        type: 'array_wildcard',
                        description: 'All elements'
                    },
                    {
                        text: '0]',
                        insertText: partialQuery + '0]',
                        type: 'array_element',
                        description: 'First element (index 0)'
                    }
                );

                if (target.length > 1) {
                    suggestions.push(
                        {
                            text: '1]',
                            insertText: partialQuery + '1]',
                            type: 'array_element',
                            description: 'Second element (index 1)'
                        },
                        {
                            text: '(@.length-1)]',
                            insertText: partialQuery + '(@.length-1)]',
                            type: 'array_last',
                            description: 'Last element'
                        }
                    );
                }

                // Add filter suggestions if array contains objects
                if (target.length > 0 && typeof target[0] === 'object' && target[0] !== null) {
                                        const sampleKeys = Object.keys(target[0]);
                                        sampleKeys.forEach(key => {
                                            suggestions.push({
                                                text: `?(@.${key})]`,
                                                insertText: partialQuery + `?(@.${key})]`,
                                                type: 'filter',
                                                description: `Filter by ${key} existence`
                                            });
                    
                                            const sampleValue = target[0][key];
                                            if (typeof sampleValue === 'string') {
                                                suggestions.push({
                                                    text: `?(@.${key} == '${sampleValue}')]`,
                                                    insertText: partialQuery + `?(@.${key} == '${sampleValue}')]`,
                                                    type: 'filter',
                                                    description: `Filter by ${key} equals '${sampleValue}'`
                                                });
                                                                    } else if (typeof sampleValue === 'number') {
                                                                        suggestions.push({
                                                                            text: `?(@.${key} > ${(sampleValue - 1).toFixed(2)})]`,
                                                                            insertText: partialQuery + `?(@.${key} > ${(sampleValue - 1).toFixed(2)})]`,
                                                                            type: 'filter',
                                                                            description: `Filter by ${key} greater than ${(sampleValue - 1).toFixed(2)}`
                                                                        });
                                                                    }
                                                                });
                                                            }
                                            
                                                            // Add slice suggestions
                                                            if (target.length > 2) {
                                                                suggestions.push(
                                                                    {
                                                                        text: '0:2]',
                                                                        insertText: partialQuery + '0:2]',
                                                                        type: 'slice',
                                                                        description: 'First 2 elements (slice)'
                                                                    },
                                                                    {
                                                                        text: '1:]',
                                                                        insertText: partialQuery + '1:]',
                                                                        type: 'slice',
                                                                        description: 'All except first element'
                                                                    },
                                                                    {
                                                                        text: ':3]',
                                                                        insertText: partialQuery + ':3]',
                                                                        type: 'slice',
                                                                        description: 'First 3 elements'
                                                                    }
                                                                );
                                                            }
                                                        }
                                                        return suggestions;
                                                    } catch (error) {
                                                        return [];
                                                    }
                                                }
    /**
     * Calculate fuzzy match score between input and target
     */
    calculateFuzzyScore(input, target) {
        input = input.toLowerCase();
        target = target.toLowerCase();

        // Exact match gets highest score
        if (target === input) return 100;
        if (target.startsWith(input)) return 90;

        // Character sequence matching
        let score = 0;
        let inputIndex = 0;

        for (let i = 0; i < target.length && inputIndex < input.length; i++) {
            if (target[i] === input[inputIndex]) {
                score += target.length - Math.abs(i - inputIndex);
                inputIndex++;
            }
        }

        // All characters found
        if (inputIndex === input.length) {
            score = (score / target.length) * 80;
        }

        return score;
    }

    /**
     * Get partial property name suggestions with fuzzy matching
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
            const scoredMatches = [];

            // Calculate fuzzy scores for all keys
            Object.keys(target).forEach(key => {
                const score = this.calculateFuzzyScore(partialProperty, key);
                if (score > 30) { // Relevance threshold
                    scoredMatches.push({ key, score, value: target[key] });
                }
            });

            // Sort by score (descending)
            scoredMatches.sort((a, b) => b.score - a.score);

            // Convert to suggestions
            scoredMatches.forEach(({ key, value }) => {
                const valueType = this.getValueType(value);
                suggestions.push({
                    text: key,
                    insertText: parentPath + '.' + key,
                    type: valueType,
                    description: this.getTypeDescription(valueType, key),
                    sampleValue: this.getSampleValue(value)
                });
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
     * Get data history suggestions for compare() function
     */
    async getDataHistorySuggestions(document, partialQuery, context) {
        const suggestions = [];

        try {
            // Extract what's inside compare(
            const compareMatch = partialQuery.match(/compare\(["']?([^"']*)/);
            if (!compareMatch) return suggestions;

            const partialId = compareMatch[1] || '';

            // Get the tool name from context (passed from adapter)
            const toolName = context?.toolName || 'json-tool';

            // Fetch data history for current tool
            const response = await fetch(`/api/data/${toolName}?limit=50`);
            const result = await response.json();

            if (!result.data || result.data.length === 0) {
                suggestions.push({
                    text: 'No saved data',
                    displayText: 'No saved data available',
                    type: 'data_history_empty',
                    description: 'Save data using the 💾 Save button first',
                    insertText: partialQuery
                });
                return suggestions;
            }

            // Filter based on partial ID if user started typing
            const filteredData = partialId
                ? result.data.filter(item =>
                    item.id.toLowerCase().includes(partialId.toLowerCase()) ||
                    item.description.toLowerCase().includes(partialId.toLowerCase())
                  )
                : result.data;

            // Create suggestions for each data entry
            for (const item of filteredData) {
                // Determine the insert text based on data type
                const insertText = await this.buildCompareInsertText(partialQuery, item, toolName);

                suggestions.push({
                    text: item.id,
                    displayText: item.id,
                    type: 'data_history',
                    description: item.description,
                    secondaryText: item.formatted_date,
                    insertText: insertText,
                    dataId: item.id,
                    preview: item.preview
                });
            }

            return suggestions;
        } catch (error) {
            console.error('Error fetching data history suggestions:', error);
            return suggestions;
        }
    }

    /**
     * Build smart insert text for compare() based on data type
     */
    async buildCompareInsertText(partialQuery, dataItem, toolName) {
        try {
            // Fetch the full data entry to inspect its type
            const response = await fetch(`/api/data/${toolName}/${dataItem.id}`);
            const entry = await response.json();

            if (!entry || !entry.data) {
                // Fallback: simple completion
                const beforeCompare = partialQuery.substring(0, partialQuery.indexOf('compare(') + 8);
                return `${beforeCompare}"${dataItem.id}")`;
            }

            // Parse the saved data
            let parsedData;
            try {
                parsedData = JSON.parse(entry.data);
            } catch {
                // If not valid JSON, just use simple completion
                const beforeCompare = partialQuery.substring(0, partialQuery.indexOf('compare(') + 8);
                return `${beforeCompare}"${dataItem.id}")`;
            }

            // Check if it's an array
            if (!Array.isArray(parsedData)) {
                // Not an array, simple completion
                const beforeCompare = partialQuery.substring(0, partialQuery.indexOf('compare(') + 8);
                return `${beforeCompare}"${dataItem.id}")`;
            }

            // Check if array of primitives or objects
            if (parsedData.length === 0) {
                const beforeCompare = partialQuery.substring(0, partialQuery.indexOf('compare(') + 8);
                return `${beforeCompare}"${dataItem.id}")`;
            }

            const firstItem = parsedData[0];
            const isPrimitive = typeof firstItem !== 'object' || firstItem === null;

            const beforeCompare = partialQuery.substring(0, partialQuery.indexOf('compare(') + 8);

            if (isPrimitive) {
                // Array of primitives: simple completion
                return `${beforeCompare}"${dataItem.id}")`;
            } else {
                // Array of objects: add matchBy parameter
                return `${beforeCompare}"${dataItem.id}", { matchBy: "" })`;
            }
        } catch (error) {
            console.error('Error building insert text:', error);
            // Fallback
            const beforeCompare = partialQuery.substring(0, partialQuery.indexOf('compare(') + 8);
            return `${beforeCompare}"${dataItem.id}")`;
        }
    }

    /**
     * Get key suggestions for select() function parameters
     */
    getSelectKeySuggestions(document, partialQuery, context) {
        const suggestions = [];

        try {
            // Find where select( starts
            const selectIndex = partialQuery.indexOf('select(');
            if (selectIndex === -1) return suggestions;

            // Get everything before select(
            const beforeSelect = partialQuery.substring(0, selectIndex).trim();

            // Evaluate the query before select() to get the data
            let currentData = document;

            // If there's a query before select(), evaluate it
            if (beforeSelect && beforeSelect !== '$' && beforeSelect !== '') {
                // Remove trailing pipe if present
                const queryPath = beforeSelect.replace(/\|$/, '').trim();

                try {
                    // Try to evaluate the path
                    const evalResult = this.evaluateJsonPath(currentData, queryPath);
                    if (evalResult && evalResult.length > 0) {
                        currentData = evalResult[0];
                    }
                } catch (error) {
                    console.log('Could not evaluate path before select():', error);
                    // Continue with original document
                }
            }

            // Get keys from the current data
            const keys = new Set();

            if (Array.isArray(currentData)) {
                // Get keys from first few objects in array
                const sample = currentData.slice(0, 10);
                sample.forEach(item => {
                    if (typeof item === 'object' && item !== null) {
                        Object.keys(item).forEach(key => keys.add(key));
                    }
                });
            } else if (typeof currentData === 'object' && currentData !== null) {
                // Get keys from single object
                Object.keys(currentData).forEach(key => keys.add(key));
            }

            // Extract what's already in select( to filter suggestions
            const selectContent = partialQuery.substring(selectIndex + 7); // after "select("
            const lastCommaIndex = selectContent.lastIndexOf(',');
            const partialKey = lastCommaIndex >= 0
                ? selectContent.substring(lastCommaIndex + 1).trim().replace(/["']/g, '')
                : selectContent.replace(/["']/g, '').trim();

            // Create suggestions for each key
            const keyArray = Array.from(keys).sort();
            keyArray.forEach(key => {
                // Filter based on partial input
                if (!partialKey || key.toLowerCase().includes(partialKey.toLowerCase())) {
                    const insertText = this.buildSelectInsertText(partialQuery, key, selectIndex);

                    suggestions.push({
                        text: key,
                        displayText: `"${key}"`,
                        type: 'select_key',
                        description: `Select field: ${key}`,
                        insertText: insertText
                    });
                }
            });

            return suggestions;
        } catch (error) {
            console.error('Error getting select key suggestions:', error);
            return suggestions;
        }
    }

    /**
     * Build insert text for select() key suggestion
     */
    buildSelectInsertText(partialQuery, key, selectIndex) {
        const beforeSelect = partialQuery.substring(0, selectIndex + 7); // includes "select("
        const afterSelect = partialQuery.substring(selectIndex + 7);

        // Check if there are already keys in select()
        if (afterSelect.trim() && !afterSelect.trim().startsWith(')')) {
            // There's already content, add comma before new key
            const lastCommaIndex = afterSelect.lastIndexOf(',');
            if (lastCommaIndex >= 0) {
                // Replace text after last comma
                return `${beforeSelect}${afterSelect.substring(0, lastCommaIndex + 1)} "${key}"`;
            } else {
                // No comma yet, add one
                return `${beforeSelect}"${key}"`;
            }
        } else {
            // First key in select()
            return `${beforeSelect}"${key}"`;
        }
    }

    /**
     * Parse JSONPath query structure
     */
    parseQuery(query) {
        if (query.includes('..')) {
            throw new Error("Invalid JSONPath: unexpected '..'");
        }
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
            if (expr.includes('..')) structure.hasRecursive = true; // This will now be caught by the initial check
            if (expr.includes(':')) structure.hasSlicing = true;
        });

        return structure;
    }

    /**
     * Enhanced type detection for suggestions
     */
    getValueType(value) {
        if (value === null || value === undefined) return 'null';
        if (Array.isArray(value)) return 'list';
        if (typeof value === 'object') return 'document';
        if (typeof value === 'string') return 'property';
        if (typeof value === 'number') return 'property';
        if (typeof value === 'boolean') return 'property';
        return 'property';
    }

    /**
     * Get type-appropriate description
     */
    getTypeDescription(type, key) {
        switch (type) {
            case 'list':
                return `Array: ${key}`;
            case 'document':
                return `Object: ${key}`;
            case 'property':
                return `Property: ${key}`;
            case 'null':
                return `Null: ${key}`;
            default:
                return `${type}: ${key}`;
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
     * Get pipe function suggestions
     */
    getPipeFunctionSuggestions(document, partialQuery, context) {
        const suggestions = [];

        // Extract the part after the last pipe
        const lastPipeIndex = partialQuery.lastIndexOf('|');
        const afterPipe = partialQuery.substring(lastPipeIndex + 1).trim();

        // Available functions for JSONPath piping
        const functions = [
            { name: 'list', description: 'Convert to array (useful for JSONL)' },
            { name: 'filter', description: 'Filter array elements by expression', hasParam: true },
            { name: 'compare', description: 'Compare with saved data from history', hasParam: true },
            { name: 'select', description: 'Select specific fields from objects', hasParam: true },
            { name: 'uniq', description: 'Get unique values', hasParam: false },
            { name: 'count', description: 'Count elements' },
            { name: 'flatten', description: 'Flatten nested arrays' },
            { name: 'keys', description: 'Get object keys' },
            { name: 'values', description: 'Get object values' },
            { name: 'sort', description: 'Sort array' },
            { name: 'reverse', description: 'Reverse array' },
            { name: 'first', description: 'Get first element' },
            { name: 'last', description: 'Get last element' },
            { name: 'limit', description: 'Limit to first N elements', hasParam: true }
        ];

        // If there's text after the pipe, filter functions that match
        const filtered = afterPipe
            ? functions.filter(f => f.name.toLowerCase().startsWith(afterPipe.toLowerCase()))
            : functions;

        filtered.forEach(func => {
            const funcText = func.hasParam ? `${func.name}()` : `${func.name}()`;
            suggestions.push({
                text: funcText,
                displayText: funcText,
                type: 'function',
                description: func.description,
                insertText: partialQuery.substring(0, lastPipeIndex + 1) + ' ' + funcText
            });
        });

        return suggestions;
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