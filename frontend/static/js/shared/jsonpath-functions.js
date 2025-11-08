/**
 * Shared JSONPath Pipe Functions
 * Pure data transformation functions used by both main thread and web workers
 *
 * NOTE: These functions must be pure (no side effects, no `this` context)
 * Functions requiring API calls or UI updates must stay in the main thread
 */

/**
 * list() - Ensure result is an array
 */
function functionList(data) {
    if (Array.isArray(data)) return data;
    return [data];
}

/**
 * uniq(key?) - Get unique values
 * @param {Array} data - The data to filter
 * @param {string} key - Optional key to use for uniqueness in objects
 */
function functionUniq(data, key = null) {
    if (!Array.isArray(data)) return data;

    // Handle arrays of primitives
    if (data.length === 0 || typeof data[0] !== 'object') {
        return [...new Set(data)];
    }

    // If key is provided, validate it exists in at least one object
    if (key) {
        const hasKey = data.some(item =>
            typeof item === 'object' &&
            item !== null &&
            item.hasOwnProperty(key)
        );

        if (!hasKey) {
            console.warn(`uniq('${key}'): Key '${key}' does not exist in any objects. Returning empty array.`);
            return [];
        }
    }

    // Handle arrays of objects
    const seen = new Set();
    return data.filter(item => {
        // If key is provided and item is an object, use that key for uniqueness
        let uniqueValue;
        if (key && typeof item === 'object' && item !== null) {
            uniqueValue = item[key];
        } else {
            // Otherwise compare by entire object (JSON string)
            uniqueValue = JSON.stringify(item);
        }

        if (seen.has(uniqueValue)) return false;
        seen.add(uniqueValue);
        return true;
    });
}

/**
 * count() - Count elements
 */
function functionCount(data) {
    if (Array.isArray(data)) {
        return { count: data.length };
    } else if (typeof data === 'object' && data !== null) {
        return { count: Object.keys(data).length };
    }
    return { count: 1 };
}

/**
 * flatten() - Flatten nested arrays
 */
function functionFlatten(data) {
    if (!Array.isArray(data)) return data;
    return data.flat(Infinity);
}

/**
 * keys() - Get object keys
 */
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

/**
 * values() - Get object values
 */
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

/**
 * sort() - Sort array
 */
function functionSort(data) {
    if (!Array.isArray(data)) return data;
    return [...data].sort((a, b) => {
        if (typeof a === 'string' && typeof b === 'string') {
            return a.localeCompare(b);
        }
        return a < b ? -1 : a > b ? 1 : 0;
    });
}

/**
 * reverse() - Reverse array
 */
function functionReverse(data) {
    if (!Array.isArray(data)) return data;
    return [...data].reverse();
}

/**
 * first() - Get first element
 */
function functionFirst(data) {
    if (Array.isArray(data) && data.length > 0) {
        return data[0];
    }
    return data;
}

/**
 * last() - Get last element
 */
function functionLast(data) {
    if (Array.isArray(data) && data.length > 0) {
        return data[data.length - 1];
    }
    return data;
}

// Export for both CommonJS (worker) and ES modules (browser)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        functionList,
        functionUniq,
        functionCount,
        functionFlatten,
        functionKeys,
        functionValues,
        functionSort,
        functionReverse,
        functionFirst,
        functionLast
    };
}
