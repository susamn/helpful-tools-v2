/**
 * Jest tests for Shared JSONPath Functions
 * These functions are used by both main thread and web workers
 */

const {
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
} = require('../../frontend/static/js/shared/jsonpath-functions.js');

describe('Shared JSONPath Functions', () => {

    describe('functionList', () => {
        test('returns array as-is', () => {
            expect(functionList([1, 2, 3])).toEqual([1, 2, 3]);
        });

        test('wraps non-array value in array', () => {
            expect(functionList(5)).toEqual([5]);
        });

        test('wraps object in array', () => {
            const obj = { name: 'test' };
            expect(functionList(obj)).toEqual([obj]);
        });

        test('wraps string in array', () => {
            expect(functionList('hello')).toEqual(['hello']);
        });

        test('handles empty array', () => {
            expect(functionList([])).toEqual([]);
        });

        test('handles null', () => {
            expect(functionList(null)).toEqual([null]);
        });
    });

    describe('functionUniq', () => {
        test('removes duplicates from primitive array', () => {
            expect(functionUniq([1, 2, 2, 3, 1])).toEqual([1, 2, 3]);
        });

        test('removes duplicate strings', () => {
            expect(functionUniq(['a', 'b', 'a', 'c', 'b'])).toEqual(['a', 'b', 'c']);
        });

        test('handles empty array', () => {
            expect(functionUniq([])).toEqual([]);
        });

        test('handles array with single element', () => {
            expect(functionUniq([1])).toEqual([1]);
        });

        test('removes duplicates from array of objects by key', () => {
            const data = [
                { id: 1, name: 'John' },
                { id: 2, name: 'Jane' },
                { id: 1, name: 'John Duplicate' }
            ];
            expect(functionUniq(data, 'id')).toEqual([
                { id: 1, name: 'John' },
                { id: 2, name: 'Jane' }
            ]);
        });

        test('removes duplicates from array of objects without key', () => {
            const data = [
                { id: 1, name: 'John' },
                { id: 2, name: 'Jane' },
                { id: 1, name: 'John' }
            ];
            const result = functionUniq(data);
            expect(result).toHaveLength(2);
        });

        test('returns empty array when key does not exist in any object', () => {
            const data = [
                { id: 1, name: 'John' },
                { id: 2, name: 'Jane' }
            ];
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
            const result = functionUniq(data, 'nonexistent');
            expect(result).toEqual([]);
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining("Key 'nonexistent' does not exist")
            );
            consoleSpy.mockRestore();
        });

        test('handles mixed primitive types', () => {
            expect(functionUniq([1, '1', 2, '2', 1, 2])).toEqual([1, '1', 2, '2']);
        });

        test('returns non-array as-is', () => {
            expect(functionUniq('test')).toBe('test');
            expect(functionUniq(42)).toBe(42);
        });
    });

    describe('functionCount', () => {
        test('counts array elements', () => {
            expect(functionCount([1, 2, 3, 4, 5])).toEqual({ count: 5 });
        });

        test('counts empty array', () => {
            expect(functionCount([])).toEqual({ count: 0 });
        });

        test('counts object keys', () => {
            expect(functionCount({ a: 1, b: 2, c: 3 })).toEqual({ count: 3 });
        });

        test('counts empty object', () => {
            expect(functionCount({})).toEqual({ count: 0 });
        });

        test('returns 1 for primitive values', () => {
            expect(functionCount(42)).toEqual({ count: 1 });
            expect(functionCount('test')).toEqual({ count: 1 });
            expect(functionCount(null)).toEqual({ count: 1 });
        });
    });

    describe('functionFlatten', () => {
        test('flattens nested arrays', () => {
            expect(functionFlatten([[1, 2], [3, 4]])).toEqual([1, 2, 3, 4]);
        });

        test('flattens deeply nested arrays', () => {
            expect(functionFlatten([1, [2, [3, [4, [5]]]]])).toEqual([1, 2, 3, 4, 5]);
        });

        test('handles empty nested arrays', () => {
            expect(functionFlatten([[], [1], [], [2, 3]])).toEqual([1, 2, 3]);
        });

        test('handles already flat array', () => {
            expect(functionFlatten([1, 2, 3])).toEqual([1, 2, 3]);
        });

        test('handles empty array', () => {
            expect(functionFlatten([])).toEqual([]);
        });

        test('returns non-array as-is', () => {
            expect(functionFlatten('test')).toBe('test');
            expect(functionFlatten(42)).toBe(42);
        });

        test('flattens mixed types', () => {
            expect(functionFlatten([1, ['a', 'b'], [true, [null]]])).toEqual([1, 'a', 'b', true, null]);
        });
    });

    describe('functionKeys', () => {
        test('returns keys from object', () => {
            expect(functionKeys({ a: 1, b: 2, c: 3 })).toEqual(['a', 'b', 'c']);
        });

        test('returns keys from array of objects', () => {
            const data = [
                { id: 1, name: 'John' },
                { age: 30, city: 'NYC' }
            ];
            expect(functionKeys(data)).toEqual(['id', 'name', 'age', 'city']);
        });

        test('handles empty object', () => {
            expect(functionKeys({})).toEqual([]);
        });

        test('handles empty array', () => {
            expect(functionKeys([])).toEqual([]);
        });

        test('handles array with primitives', () => {
            expect(functionKeys([1, 2, 3])).toEqual([]);
        });

        test('handles null', () => {
            expect(functionKeys(null)).toEqual([]);
        });

        test('handles mixed array with objects and primitives', () => {
            const data = [{ a: 1 }, 'test', { b: 2 }];
            expect(functionKeys(data)).toEqual(['a', 'b']);
        });
    });

    describe('functionValues', () => {
        test('returns values from object', () => {
            expect(functionValues({ a: 1, b: 2, c: 3 })).toEqual([1, 2, 3]);
        });

        test('returns values from array of objects', () => {
            const data = [
                { id: 1, name: 'John' },
                { age: 30, city: 'NYC' }
            ];
            expect(functionValues(data)).toEqual([1, 'John', 30, 'NYC']);
        });

        test('handles empty object', () => {
            expect(functionValues({})).toEqual([]);
        });

        test('handles empty array', () => {
            expect(functionValues([])).toEqual([]);
        });

        test('handles array with primitives', () => {
            expect(functionValues([1, 2, 3])).toEqual([1, 2, 3]);
        });

        test('wraps non-array primitive in array', () => {
            expect(functionValues(42)).toEqual([42]);
            expect(functionValues('test')).toEqual(['test']);
        });

        test('handles null in object', () => {
            expect(functionValues({ a: null, b: undefined })).toEqual([null, undefined]);
        });
    });

    describe('functionSort', () => {
        test('sorts numeric array ascending', () => {
            expect(functionSort([3, 1, 4, 1, 5, 9])).toEqual([1, 1, 3, 4, 5, 9]);
        });

        test('sorts string array alphabetically', () => {
            expect(functionSort(['banana', 'apple', 'cherry'])).toEqual(['apple', 'banana', 'cherry']);
        });

        test('handles empty array', () => {
            expect(functionSort([])).toEqual([]);
        });

        test('handles single element', () => {
            expect(functionSort([42])).toEqual([42]);
        });

        test('returns non-array as-is', () => {
            expect(functionSort('test')).toBe('test');
        });

        test('does not modify original array', () => {
            const original = [3, 1, 2];
            const sorted = functionSort(original);
            expect(sorted).toEqual([1, 2, 3]);
            expect(original).toEqual([3, 1, 2]);
        });

        test('handles mixed case strings', () => {
            expect(functionSort(['Zebra', 'apple', 'Banana'])).toEqual(['apple', 'Banana', 'Zebra']);
        });
    });

    describe('functionReverse', () => {
        test('reverses array', () => {
            expect(functionReverse([1, 2, 3, 4, 5])).toEqual([5, 4, 3, 2, 1]);
        });

        test('reverses string array', () => {
            expect(functionReverse(['a', 'b', 'c'])).toEqual(['c', 'b', 'a']);
        });

        test('handles empty array', () => {
            expect(functionReverse([])).toEqual([]);
        });

        test('handles single element', () => {
            expect(functionReverse([42])).toEqual([42]);
        });

        test('returns non-array as-is', () => {
            expect(functionReverse('test')).toBe('test');
        });

        test('does not modify original array', () => {
            const original = [1, 2, 3];
            const reversed = functionReverse(original);
            expect(reversed).toEqual([3, 2, 1]);
            expect(original).toEqual([1, 2, 3]);
        });
    });

    describe('functionFirst', () => {
        test('returns first element of array', () => {
            expect(functionFirst([1, 2, 3])).toBe(1);
        });

        test('returns first element of string array', () => {
            expect(functionFirst(['a', 'b', 'c'])).toBe('a');
        });

        test('handles single element array', () => {
            expect(functionFirst([42])).toBe(42);
        });

        test('returns data as-is for empty array', () => {
            expect(functionFirst([])).toEqual([]);
        });

        test('returns non-array as-is', () => {
            expect(functionFirst('test')).toBe('test');
            expect(functionFirst(42)).toBe(42);
        });

        test('handles array of objects', () => {
            const data = [{ id: 1 }, { id: 2 }];
            expect(functionFirst(data)).toEqual({ id: 1 });
        });
    });

    describe('functionLast', () => {
        test('returns last element of array', () => {
            expect(functionLast([1, 2, 3])).toBe(3);
        });

        test('returns last element of string array', () => {
            expect(functionLast(['a', 'b', 'c'])).toBe('c');
        });

        test('handles single element array', () => {
            expect(functionLast([42])).toBe(42);
        });

        test('returns data as-is for empty array', () => {
            expect(functionLast([])).toEqual([]);
        });

        test('returns non-array as-is', () => {
            expect(functionLast('test')).toBe('test');
            expect(functionLast(42)).toBe(42);
        });

        test('handles array of objects', () => {
            const data = [{ id: 1 }, { id: 2 }];
            expect(functionLast(data)).toEqual({ id: 2 });
        });
    });

    describe('Integration: Function Chaining', () => {
        test('list -> uniq -> sort', () => {
            const data = [3, 1, 2, 1, 3];
            const listed = functionList(data);
            const uniqued = functionUniq(listed);
            const sorted = functionSort(uniqued);
            expect(sorted).toEqual([1, 2, 3]);
        });

        test('flatten -> uniq -> count', () => {
            const data = [[1, 2], [2, 3], [3, 4]];
            const flattened = functionFlatten(data);
            const uniqued = functionUniq(flattened);
            const counted = functionCount(uniqued);
            expect(counted).toEqual({ count: 4 });
        });

        test('keys -> uniq -> sort', () => {
            const data = [
                { id: 1, name: 'A' },
                { id: 2, age: 30 },
                { name: 'B', city: 'NYC' }
            ];
            const keys = functionKeys(data);
            const uniqued = functionUniq(keys);
            const sorted = functionSort(uniqued);
            expect(sorted).toEqual(['age', 'city', 'id', 'name']);
        });
    });
});

describe('Worker Compatibility', () => {
    test('all functions are exported for CommonJS', () => {
        expect(typeof functionList).toBe('function');
        expect(typeof functionUniq).toBe('function');
        expect(typeof functionCount).toBe('function');
        expect(typeof functionFlatten).toBe('function');
        expect(typeof functionKeys).toBe('function');
        expect(typeof functionValues).toBe('function');
        expect(typeof functionSort).toBe('function');
        expect(typeof functionReverse).toBe('function');
        expect(typeof functionFirst).toBe('function');
        expect(typeof functionLast).toBe('function');
    });

    test('functions are pure (no side effects)', () => {
        const original = [3, 1, 2];

        // Test that functions don't modify original data
        functionList(original);
        functionUniq(original);
        functionSort(original);
        functionReverse(original);
        functionFlatten(original);

        expect(original).toEqual([3, 1, 2]);
    });

    test('functions handle undefined gracefully', () => {
        expect(functionList(undefined)).toEqual([undefined]);
        expect(functionCount(undefined)).toEqual({ count: 1 });
        expect(functionFirst(undefined)).toBe(undefined);
        expect(functionLast(undefined)).toBe(undefined);
    });
});
