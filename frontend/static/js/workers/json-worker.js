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
