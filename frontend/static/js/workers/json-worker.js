/**
 * JSON Processing Web Worker
 * Handles heavy JSON operations in background thread
 */

// Import JSONPath library for worker context
importScripts('https://cdn.jsdelivr.net/npm/jsonpath@1.1.1/jsonpath.min.js');

/**
 * Message handler - receives tasks from main thread
 */
self.onmessage = function(e) {
    const { id, operation, data } = e.data;

    try {
        let result;

        switch(operation) {
            case 'format':
                result = formatJson(data);
                break;

            case 'minify':
                result = minifyJson(data);
                break;

            case 'stringify':
                result = stringifyJson(data);
                break;

            case 'parse':
                result = parseJson(data);
                break;

            case 'jsonpath':
                result = executeJsonPath(data);
                break;

            case 'jsonpath-jsonl':
                result = executeJsonPathJsonl(data);
                break;

            case 'function':
                result = executeFunction(data);
                break;

            case 'validate':
                result = validateJson(data);
                break;

            default:
                throw new Error(`Unknown operation: ${operation}`);
        }

        // Send success result back
        self.postMessage({
            id,
            success: true,
            result
        });

    } catch (error) {
        // Send error back
        self.postMessage({
            id,
            success: false,
            error: {
                message: error.message,
                stack: error.stack
            }
        });
    }
};

/**
 * Format JSON with indentation
 */
function formatJson(data) {
    const { text, indentType, indentSize } = data;

    // Parse JSON
    const parsed = JSON.parse(text);

    // Create indent string
    const indent = indentType === 'tabs' ? '\t' : ' '.repeat(indentSize);

    // Format with indentation
    const formatted = JSON.stringify(parsed, null, indent);

    return {
        formatted,
        stats: {
            size: formatted.length,
            lines: formatted.split('\n').length,
            type: Array.isArray(parsed) ? 'array' : typeof parsed
        }
    };
}

/**
 * Minify JSON
 */
function minifyJson(data) {
    const { text } = data;

    // Parse and minify
    const parsed = JSON.parse(text);
    const minified = JSON.stringify(parsed);

    return {
        minified,
        stats: {
            originalSize: text.length,
            minifiedSize: minified.length,
            reduction: Math.round((1 - minified.length / text.length) * 100)
        }
    };
}

/**
 * Stringify JSON (escape for use in strings)
 */
function stringifyJson(data) {
    const { text } = data;

    const parsed = JSON.parse(text);
    const minified = JSON.stringify(parsed);
    const stringified = JSON.stringify(minified);

    return { stringified };
}

/**
 * Parse JSON and return object
 */
function parseJson(data) {
    const { text } = data;
    const parsed = JSON.parse(text);

    return { parsed };
}

/**
 * Execute JSONPath query
 */
function executeJsonPath(data) {
    const { json, path, functions, nextPath } = data;

    // Parse JSON if string
    const obj = typeof json === 'string' ? JSON.parse(json) : json;

    // Execute JSONPath query using the imported library
    let result = jsonpath.query(obj, path);

    // Apply functions if provided
    if (functions && functions.length > 0) {
        for (const func of functions) {
            result = applyFunction(func, result);
        }
    }

    // Apply next path if provided (for chaining)
    if (nextPath && result) {
        result = jsonpath.query(result, nextPath);
    }

    return { result };
}

/**
 * Execute JSONPath on JSONL data
 */
function executeJsonPathJsonl(data) {
    const { text, path, functions, nextPath } = data;

    // Parse JSONL (line by line)
    const lines = text.trim().split('\n');
    const jsonObjects = [];

    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) {
            try {
                jsonObjects.push(JSON.parse(trimmed));
            } catch (e) {
                // Skip invalid lines
                console.warn('Invalid JSON line:', e.message);
            }
        }
    }

    // Check for list() conversion
    const hasListFunction = functions.some(f =>
        (typeof f === 'string' ? f : f.name) === 'list'
    );

    if (path.trim() === '$' && hasListFunction) {
        // Convert JSONL to array
        let result = jsonObjects;

        // Apply next path if provided
        if (nextPath) {
            result = jsonpath.query(result, nextPath);
        }

        return { result };
    }

    // Process each JSONL object
    const results = [];
    const paths = path.split(',').map(p => p.trim());

    jsonObjects.forEach((obj, index) => {
        let combinedResult = {};
        let hasResults = false;

        for (const p of paths) {
            try {
                const pathResult = jsonpath.query(obj, p);

                if (pathResult && pathResult.length > 0) {
                    hasResults = true;
                    // Extract key from path
                    const key = extractPathKey(p);
                    combinedResult[key] = pathResult.length === 1 ? pathResult[0] : pathResult;
                }
            } catch (error) {
                console.error('JSONPath error:', error);
            }
        }

        if (hasResults) {
            results.push({
                from_object: index,
                result: combinedResult
            });
        }
    });

    // Apply functions if specified
    let finalResults = results;
    if (functions && functions.length > 0 && results.length > 0) {
        // Extract all values
        let allValues = [];
        results.forEach(result => {
            const values = Object.values(result.result);
            values.forEach(val => {
                if (Array.isArray(val)) {
                    allValues.push(...val);
                } else {
                    allValues.push(val);
                }
            });
        });

        // Apply functions
        for (const func of functions) {
            allValues = applyFunction(func, allValues);
        }

        // Apply nextPath if provided
        if (nextPath) {
            allValues = jsonpath.query(allValues, nextPath);
        }

        finalResults = allValues;
    }

    return { result: finalResults };
}

/**
 * Extract key from JSONPath expression
 */
function extractPathKey(path) {
    const segments = path.split(/[.\[\]]+/).filter(Boolean);
    if (segments.length > 0) {
        const lastSegment = segments[segments.length - 1];
        if (!/^\d+$/.test(lastSegment) && !/[*?@()]/.test(lastSegment)) {
            return lastSegment;
        }
    }
    return 'value';
}

/**
 * Apply function to data
 */
function applyFunction(func, data) {
    let funcName, params;

    if (typeof func === 'string') {
        funcName = func;
        params = [];
    } else {
        funcName = func.name;
        params = func.params || [];
    }

    switch(funcName.toLowerCase()) {
        case 'list':
            return functionList(data);
        case 'uniq':
        case 'unique':
            return functionUniq(data, params[0]);
        case 'count':
            return functionCount(data);
        case 'flatten':
            return functionFlatten(data);
        case 'keys':
            return functionKeys(data);
        case 'values':
            return functionValues(data);
        case 'sort':
            return functionSort(data);
        case 'reverse':
            return functionReverse(data);
        case 'first':
            return functionFirst(data);
        case 'last':
            return functionLast(data);
        case 'filter':
            return functionFilter(data, params[0]);
        default:
            throw new Error(`Unknown function: ${funcName}`);
    }
}

/**
 * Function implementations
 */
function functionList(data) {
    if (Array.isArray(data)) return data;
    return [data];
}

function functionUniq(data, key = null) {
    if (!Array.isArray(data)) return data;

    if (data.length === 0 || typeof data[0] !== 'object') {
        return [...new Set(data)];
    }

    if (key) {
        const hasKey = data.some(item =>
            typeof item === 'object' &&
            item !== null &&
            item.hasOwnProperty(key)
        );

        if (!hasKey) {
            return [];
        }
    }

    const seen = new Set();
    return data.filter(item => {
        let uniqueValue;
        if (key && typeof item === 'object' && item !== null) {
            uniqueValue = item[key];
        } else {
            uniqueValue = JSON.stringify(item);
        }

        if (seen.has(uniqueValue)) return false;
        seen.add(uniqueValue);
        return true;
    });
}

function functionCount(data) {
    if (Array.isArray(data)) {
        return { count: data.length };
    } else if (typeof data === 'object' && data !== null) {
        return { count: Object.keys(data).length };
    }
    return { count: 1 };
}

function functionFlatten(data) {
    if (!Array.isArray(data)) return data;
    return data.flat(Infinity);
}

function functionKeys(data) {
    if (Array.isArray(data)) {
        return data.map(item =>
            typeof item === 'object' && item !== null ? Object.keys(item) : []
        ).flat();
    } else if (typeof data === 'object' && data !== null) {
        return Object.keys(data);
    }
    return [];
}

function functionValues(data) {
    if (Array.isArray(data)) {
        return data.map(item =>
            typeof item === 'object' && item !== null ? Object.values(item) : item
        ).flat();
    } else if (typeof data === 'object' && data !== null) {
        return Object.values(data);
    }
    return [data];
}

function functionSort(data) {
    if (!Array.isArray(data)) return data;
    return [...data].sort((a, b) => {
        if (typeof a === 'string' && typeof b === 'string') {
            return a.localeCompare(b);
        }
        return a < b ? -1 : a > b ? 1 : 0;
    });
}

function functionReverse(data) {
    if (!Array.isArray(data)) return data;
    return [...data].reverse();
}

function functionFirst(data) {
    if (Array.isArray(data) && data.length > 0) {
        return data[0];
    }
    return data;
}

function functionLast(data) {
    if (Array.isArray(data) && data.length > 0) {
        return data[data.length - 1];
    }
    return data;
}

/**
 * filter(expression) - Filter array elements based on an expression
 * In the expression, $ refers to each individual object in the array
 * @param {Array} data - The array to filter
 * @param {string} expression - The filter expression (e.g., "$.pin == null", "$.pin[?].customer == 'John'")
 */
function functionFilter(data, expression) {
    // Check if data is an array
    if (!Array.isArray(data)) {
        console.warn('filter() can only be applied to arrays/lists. Current result is not an array.');
        return data;
    }

    // Check if expression is provided
    if (!expression) {
        console.warn('filter() requires an expression parameter. Example: filter($.pin == null)');
        return data;
    }

    try {
        // Filter the array by testing each object against the expression
        return data.filter(item => {
            try {
                // Evaluate the expression with $ referring to the current item
                return evaluateFilterExpression(expression, item);
            } catch (error) {
                console.warn('Filter expression evaluation error for item:', item, error);
                return false;
            }
        });
    } catch (error) {
        console.error('filter() error:', error.message);
        return data;
    }
}

/**
 * Evaluate a filter expression against an object
 * @param {string} expression - The filter expression
 * @param {*} context - The object to test ($ refers to this)
 * @returns {boolean} - Whether the expression evaluates to true
 */
function evaluateFilterExpression(expression, context) {
    // Replace $ with the actual path through the context
    let processedExpr = expression.trim();

    // Check for function-wrapped expressions first: len(...), present(...), absent(...), contains(...)
    const funcNameMatch = processedExpr.match(/^(\w+)\s*\(/);

    if (funcNameMatch) {
        const funcName = funcNameMatch[1];

        // Extract the content by counting parentheses
        let parenCount = 1;
        let startIdx = processedExpr.indexOf('(') + 1;
        let endIdx = startIdx;

        for (let i = startIdx; i < processedExpr.length && parenCount > 0; i++) {
            if (processedExpr[i] === '(') parenCount++;
            else if (processedExpr[i] === ')') {
                parenCount--;
                if (parenCount === 0) {
                    endIdx = i;
                    break;
                }
            }
        }

        if (parenCount !== 0) {
            console.warn('Unmatched parentheses in filter expression:', processedExpr);
            return false;
        }

        const funcContent = processedExpr.substring(startIdx, endIdx).trim();
        const remainingExpr = processedExpr.substring(endIdx + 1).trim();

        try {
            // Special handling for contains() which takes two parameters: expression and value
            if (funcName.toLowerCase() === 'contains') {
                // Parse two parameters separated by comma
                const params = parseFunctionParameters(funcContent);

                if (params.length !== 2) {
                    console.warn('contains() requires exactly 2 parameters: expression and value');
                    return false;
                }

                const pathToEval = params[0].trim();
                const searchValue = parseCompareValue(params[1].trim());

                // Validate the JSONPath
                if (!pathToEval.startsWith('$')) {
                    console.warn('Invalid JSONPath in contains() (must start with $):', pathToEval);
                    return false;
                }

                // Query the context with the JSONPath
                let result;
                try {
                    result = jsonpath.query(context, pathToEval);
                } catch (jsonPathError) {
                    console.warn('JSONPath query error:', jsonPathError.message, 'Path:', pathToEval);
                    return false;
                }

                // Check if the value exists in the result array
                return filterFunctionContains(result, searchValue);
            }

            // For other functions, treat content as JSONPath
            const pathToEval = funcContent;

            // Validate the JSONPath
            if (!pathToEval.startsWith('$')) {
                console.warn('Invalid JSONPath in filter function (must start with $):', pathToEval);
                return false;
            }

            // Query the context with the JSONPath
            let result;
            try {
                result = jsonpath.query(context, pathToEval);
            } catch (jsonPathError) {
                console.warn('JSONPath query error:', jsonPathError.message, 'Path:', pathToEval);
                return false;
            }

            // Apply function
            result = applyFilterFunction(funcName, result, pathToEval, context);

            // If there's a comparison operator after the function
            if (remainingExpr) {
                const operatorMatch = remainingExpr.match(/^\s*(===|!==|==|!=|<=|>=|<|>)\s*(.+)$/);

                if (operatorMatch) {
                    const operator = operatorMatch[1];
                    let compareValue = operatorMatch[2].trim();

                    // Parse the comparison value
                    if (compareValue === 'null') {
                        compareValue = null;
                    } else if (compareValue === 'undefined') {
                        compareValue = undefined;
                    } else if (compareValue === 'true') {
                        compareValue = true;
                    } else if (compareValue === 'false') {
                        compareValue = false;
                    } else if (compareValue.match(/^["'].*["']$/)) {
                        compareValue = compareValue.slice(1, -1);
                    } else if (!isNaN(compareValue) && compareValue !== '') {
                        compareValue = Number(compareValue);
                    }

                    // Perform comparison
                    switch (operator) {
                        case '==':
                        case '===':
                            return result == compareValue;
                        case '!=':
                        case '!==':
                            return result != compareValue;
                        case '<':
                            return result < compareValue;
                        case '>':
                            return result > compareValue;
                        case '<=':
                            return result <= compareValue;
                        case '>=':
                            return result >= compareValue;
                        default:
                            return false;
                    }
                }
            }

            // No comparison, just return the boolean result of the function
            return Boolean(result);
        } catch (error) {
            console.warn('Function evaluation error:', error);
            return false;
        }
    }

    // Handle regular JSONPath queries (no function wrapper)
    const jsonPathMatch = processedExpr.match(/^\$[^\s==!=<>]*/);

    if (jsonPathMatch) {
        let jsonPathPart = jsonPathMatch[0];

        // If it's just "$", return the whole context
        if (jsonPathPart === '$') {
            // Replace $ with 'context' for evaluation
            processedExpr = processedExpr.replace(/\$/g, 'context');
        } else {
            let pathToEval = jsonPathPart;

            try {
                // Query the context with the JSONPath
                let result = jsonpath.query(context, pathToEval);

                // Handle the comparison operators (longer operators first to match correctly)
                const operatorMatch = processedExpr.match(/^\$[^\s==!=<>]*\s*(===|!==|==|!=|<=|>=|<|>)\s*(.+)$/);

                if (operatorMatch) {
                    const operator = operatorMatch[1];
                    let compareValue = operatorMatch[2].trim();

                    // Parse the comparison value
                    if (compareValue === 'null') {
                        compareValue = null;
                    } else if (compareValue === 'undefined') {
                        compareValue = undefined;
                    } else if (compareValue === 'true') {
                        compareValue = true;
                    } else if (compareValue === 'false') {
                        compareValue = false;
                    } else if (compareValue.match(/^["'].*["']$/)) {
                        // Remove quotes from string
                        compareValue = compareValue.slice(1, -1);
                    } else if (!isNaN(compareValue) && compareValue !== '') {
                        // Convert to number
                        compareValue = Number(compareValue);
                    }

                    // Check if we're using [*] which returns multiple values
                    // In that case, check if ANY value matches (for == or ===)
                    // or if ALL values don't match (for != or !==)
                    const isWildcard = pathToEval.includes('[*]');

                    if (isWildcard && Array.isArray(result) && result.length > 0) {
                        // For wildcards:
                        // - Equality (==, ===): check if ANY element matches
                        // - Inequality (!=, !==): check if NONE match (ALL are different)
                        // - Comparisons (<, >, etc.): check if ANY element satisfies
                        switch (operator) {
                            case '==':
                            case '===':
                                return result.some(val => val == compareValue);
                            case '!=':
                            case '!==':
                                // Return true if NONE of the elements match (all are different)
                                return !result.some(val => val == compareValue);
                            case '<':
                                return result.some(val => val < compareValue);
                            case '>':
                                return result.some(val => val > compareValue);
                            case '<=':
                                return result.some(val => val <= compareValue);
                            case '>=':
                                return result.some(val => val >= compareValue);
                            default:
                                return false;
                        }
                    } else {
                        // For specific indices, check the single result
                        // If result is empty array (property doesn't exist), treat as undefined
                        const actualValue = Array.isArray(result) && result.length > 0 ? result[0] : undefined;

                        // Perform the comparison
                        switch (operator) {
                            case '==':
                            case '===':
                                return actualValue == compareValue;
                            case '!=':
                            case '!==':
                                return actualValue != compareValue;
                            case '<':
                                return actualValue < compareValue;
                            case '>':
                                return actualValue > compareValue;
                            case '<=':
                                return actualValue <= compareValue;
                            case '>=':
                                return actualValue >= compareValue;
                            default:
                                return false;
                        }
                    }
                } else {
                    // No operator, just check if the result is truthy
                    return Array.isArray(result) && result.length > 0 && result[0];
                }
            } catch (error) {
                console.warn('JSONPath evaluation error:', error);
                return false;
            }
        }
    }

    // Fallback: try to evaluate as a JavaScript expression (with context)
    try {
        const func = new Function('context', `return ${processedExpr}`);
        return Boolean(func(context));
    } catch (error) {
        console.warn('Expression evaluation error:', error);
        return false;
    }
}

/**
 * Parse function parameters for multi-parameter functions like contains()
 * Handles nested parentheses, brackets, and quoted strings
 */
function parseFunctionParameters(paramsStr) {
    if (!paramsStr) return [];

    const params = [];
    let currentParam = '';
    let parenCount = 0;
    let bracketCount = 0;
    let inString = false;
    let stringChar = null;

    for (let i = 0; i < paramsStr.length; i++) {
        const char = paramsStr[i];

        // Handle string boundaries
        if ((char === '"' || char === "'") && (i === 0 || paramsStr[i - 1] !== '\\')) {
            if (!inString) {
                inString = true;
                stringChar = char;
            } else if (char === stringChar) {
                inString = false;
                stringChar = null;
            }
            currentParam += char;
            continue;
        }

        // If inside string, add character and continue
        if (inString) {
            currentParam += char;
            continue;
        }

        // Handle parentheses and brackets
        if (char === '(') parenCount++;
        else if (char === ')') parenCount--;
        else if (char === '[') bracketCount++;
        else if (char === ']') bracketCount--;

        // Check for comma separator at top level
        if (char === ',' && parenCount === 0 && bracketCount === 0) {
            params.push(currentParam.trim());
            currentParam = '';
            continue;
        }

        currentParam += char;
    }

    // Add the last parameter
    if (currentParam.trim()) {
        params.push(currentParam.trim());
    }

    return params;
}

/**
 * Parse comparison value from string to its proper type
 */
function parseCompareValue(valueStr) {
    valueStr = valueStr.trim();

    if (valueStr === 'null') return null;
    if (valueStr === 'undefined') return undefined;
    if (valueStr === 'true') return true;
    if (valueStr === 'false') return false;
    if (valueStr.match(/^["'].*["']$/)) return valueStr.slice(1, -1);
    if (!isNaN(valueStr) && valueStr !== '') return Number(valueStr);
    return valueStr;
}

/**
 * contains() - Check if a specific value exists in the result array
 * For strings: checks if the string contains the substring (case-insensitive)
 * For other types: checks for exact match
 */
function filterFunctionContains(result, searchValue) {
    if (!Array.isArray(result) || result.length === 0) {
        return false;
    }

    // Check if any element in the result array matches the search value
    return result.some(val => {
        // Handle null/undefined
        if (val == null) {
            return val == searchValue;
        }

        // For string values, do substring matching (case-insensitive)
        if (typeof val === 'string' && typeof searchValue === 'string') {
            return val.toLowerCase().includes(searchValue.toLowerCase());
        }

        // For other types, use exact equality
        return val == searchValue;
    });
}

/**
 * Apply filter-specific functions to JSONPath results
 */
function applyFilterFunction(funcName, result, path, context) {
    const isWildcard = path.includes('[*]');
    funcName = funcName.toLowerCase();

    switch (funcName) {
        case 'len':
        case 'length':
            // JSONPath query results are wrapped in an array
            // So $.products returns [[product1, product2, ...]]
            // We need to unwrap and get the length of the actual value
            if (Array.isArray(result) && result.length > 0) {
                const actualValue = result[0]; // Unwrap the JSONPath result

                if (Array.isArray(actualValue)) {
                    // It's an array, return its length
                    return actualValue.length;
                } else if (typeof actualValue === 'object' && actualValue !== null) {
                    // It's an object, return the number of keys
                    return Object.keys(actualValue).length;
                } else if (typeof actualValue === 'string') {
                    // It's a string, return its length
                    return actualValue.length;
                }
                // For other primitives, length doesn't make sense
                return 0;
            }
            return 0;

        case 'present':
        case 'exists':
            // Check if value exists (not null/undefined)
            // IMPORTANT: For wildcards like $.products[*].code, JSONPath only returns
            // values that exist, so we need to compare against the parent array length
            if (Array.isArray(result)) {
                if (isWildcard) {
                    // For wildcards, check if ALL elements have this property
                    // Extract the parent path (e.g., $.products from $.products[*].code)
                    const parentMatch = path.match(/^(.+)\[\*\]/);
                    if (parentMatch) {
                        const parentPath = parentMatch[1];
                        try {
                            // Get the parent array (e.g., $.products)
                            const parentResult = jsonpath.query(context, parentPath);
                            if (Array.isArray(parentResult) && parentResult.length > 0) {
                                const parentArray = parentResult[0];
                                if (Array.isArray(parentArray)) {
                                    // If the number of results equals parent array length,
                                    // it means ALL elements have this property
                                    // Also check that all values are not null/undefined
                                    return result.length === parentArray.length &&
                                           result.every(val => val !== null && val !== undefined);
                                }
                            }
                        } catch (e) {
                            console.warn('Error checking parent array:', e);
                        }
                    }
                    // Fallback: check if ANY value is present
                    return result.some(val => val !== null && val !== undefined);
                } else {
                    // For single results, check if the value is present
                    return result.length > 0 && result[0] !== null && result[0] !== undefined;
                }
            }
            return result !== null && result !== undefined;

        case 'absent':
        case 'missing':
            // Check if value is absent (null/undefined)
            // IMPORTANT: For wildcards like $.products[*].code, JSONPath only returns
            // values that exist, so we need to compare against the parent array length
            if (Array.isArray(result)) {
                if (isWildcard) {
                    // For wildcards, we need to check if ANY is missing
                    // Extract the parent path (e.g., $.products from $.products[*].code)
                    const parentMatch = path.match(/^(.+)\[\*\]/);
                    if (parentMatch) {
                        const parentPath = parentMatch[1];
                        try {
                            // Get the parent array (e.g., $.products)
                            const parentResult = jsonpath.query(context, parentPath);
                            if (Array.isArray(parentResult) && parentResult.length > 0) {
                                const parentArray = parentResult[0];
                                if (Array.isArray(parentArray)) {
                                    // If the number of results is less than parent array length,
                                    // it means some elements are missing this property
                                    return result.length < parentArray.length;
                                }
                            }
                        } catch (e) {
                            console.warn('Error checking parent array:', e);
                        }
                    }
                    // Fallback: check if ALL values are absent
                    return result.length === 0 || result.every(val => val === null || val === undefined);
                } else {
                    // For single results, check if the value is absent
                    return result.length === 0 || result[0] === null || result[0] === undefined;
                }
            }
            return result === null || result === undefined;

        case 'empty':
            // Check if array/object is empty
            if (Array.isArray(result)) {
                if (result.length === 0) return true;
                if (result.length === 1) {
                    const val = result[0];
                    if (Array.isArray(val)) return val.length === 0;
                    if (typeof val === 'object' && val !== null) return Object.keys(val).length === 0;
                }
            }
            return false;

        case 'notempty':
        case 'notEmpty':
            // Check if array/object is not empty
            if (Array.isArray(result)) {
                if (result.length === 0) return false;
                if (result.length === 1) {
                    const val = result[0];
                    if (Array.isArray(val)) return val.length > 0;
                    if (typeof val === 'object' && val !== null) return Object.keys(val).length > 0;
                }
                return true;
            }
            return false;

        default:
            console.warn(`Unknown filter function: ${funcName}`);
            return false;
    }
}

/**
 * Execute function operation
 */
function executeFunction(data) {
    const { func, input } = data;
    const result = applyFunction(func, input);
    return { result };
}

/**
 * Validate JSON
 */
function validateJson(data) {
    const { text } = data;

    try {
        const parsed = JSON.parse(text);
        return {
            valid: true,
            parsed,
            stats: {
                type: Array.isArray(parsed) ? 'array' : typeof parsed,
                size: text.length
            }
        };
    } catch (error) {
        return {
            valid: false,
            error: {
                message: error.message,
                line: extractErrorLine(error.message)
            }
        };
    }
}

/**
 * Extract line number from JSON parse error
 */
function extractErrorLine(errorMessage) {
    const match = errorMessage.match(/position (\d+)/);
    if (match) {
        return parseInt(match[1]);
    }
    return null;
}

// Log that worker is ready
console.log('JSON Worker initialized and ready');
