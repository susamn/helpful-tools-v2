/**
 * Document Query Suggestions Evaluators Test Suite
 * Tests for query evaluators supporting JSONPath and YQ query languages
 */

const { describe, test, expect } = require('@jest/globals');

// Mock QueryEvaluator since it's a dependency
const { QueryEvaluator } = require('../../frontend/static/js/document-query-suggestions/core/QueryEvaluator.js');
global.QueryEvaluator = QueryEvaluator;

const { JSONPathEvaluator } = require('../../frontend/static/js/document-query-suggestions/evaluators/JSONPathEvaluator.js');
const { YQEvaluator } = require('../../frontend/static/js/document-query-suggestions/evaluators/YQEvaluator.js');

describe('Document Query Suggestions - Evaluators', () => {
  let document;

  beforeEach(() => {
    document = {
      store: {
        book: [
          {
            category: 'reference',
            author: 'Nigel Rees',
            title: 'Sayings of the Century',
            price: 8.95,
          },
          {
            category: 'fiction',
            author: 'Evelyn Waugh',
            title: 'Sword of Honour',
            price: 12.99,
          },
          {
            category: 'fiction',
            author: 'Herman Melville',
            title: 'Moby Dick',
            isbn: '0-553-21311-3',
            price: 8.99,
          },
          {
            category: 'fiction',
            author: 'J. R. R. Tolkien',
            title: 'The Lord of the Rings',
            isbn: '0-395-19395-8',
            price: 22.99,
          },
        ],
        bicycle: {
          color: 'red',
          price: 19.95,
        },
      },
    };
  });

  describe('JSONPathEvaluator', () => {
    let evaluator;
    beforeEach(() => {
        evaluator = new JSONPathEvaluator();
    });

    test('should evaluate JSONPath expressions', async () => {
      // Mock the external library
      global.window = {
        jsonpath: {
          query: (obj, path) => {
            if (path === '$.store.book[*].author') {
              return ['Nigel Rees', 'Evelyn Waugh', 'Herman Melville', 'J. R. R. Tolkien'];
            }
            return [];
          }
        }
      };

      const result = await evaluator.evaluate(document, '$.store.book[*].author');
      expect(result).toEqual(['Nigel Rees', 'Evelyn Waugh', 'Herman Melville', 'J. R. R. Tolkien']);
    });

    test('should support JSONPath filters', async () => {
        // Mock the external library with filter support
        global.window = {
            jsonpath: {
                query: (obj, path) => {
                    if (path === '$.store.book[?(@.price < 10)]') {
                        return [document.store.book[0], document.store.book[2]];
                    }
                    return [];
                }
            }
        };

        const result = await evaluator.evaluate(document, '$.store.book[?(@.price < 10)]');
        expect(result).toHaveLength(2);
        expect(result[0].title).toBe('Sayings of the Century');
        expect(result[1].title).toBe('Moby Dick');
    });

    test('should handle recursive descent', async () => {
        // Mock the external library for recursive descent
        global.window = {
            jsonpath: {
                query: (obj, path) => {
                    if (path === '$..author') {
                        return document.store.book.map(b => b.author);
                    }
                    return [];
                }
            }
        };

        const result = await evaluator.evaluate(document, '$..author');
        expect(result).toHaveLength(4);
        expect(result).toContain('Herman Melville');
    });

    test('should fall back to basic evaluation if external library is not present', async () => {
        global.window = {}; // No jsonpath library

        const result = await evaluator.evaluate(document, '$.store.bicycle.color');
        expect(result).toEqual(['red']);

        const result2 = await evaluator.evaluate(document, '$.store.book[1].title');
        expect(result2).toEqual(['Sword of Honour']);
    });

    test('should return empty array for invalid path in basic evaluation', async () => {
        global.window = {}; // No jsonpath library

        const result = await evaluator.evaluate(document, '$.store.book[10].title');
        expect(result).toEqual([]);
    });

    test('should handle union queries', async () => {
        global.window = {
            jsonpath: {
                query: (obj, path) => {
                    if (path === '$.store.book[0].title') return ['Sayings of the Century'];
                    if (path === '$.store.bicycle.price') return [19.95];
                    return [];
                }
            }
        };

        const result = await evaluator.evaluate(document, '$.store.book[0].title, $.store.bicycle.price');
        expect(result).toHaveLength(2);
        expect(result).toContain('Sayings of the Century');
        expect(result).toContain(19.95);
    });

    test('should throw error for invalid syntax when library is present', async () => {
        global.window = {
            jsonpath: {
                query: () => {
                    throw new Error('Lexical error on line 1. Unrecognized text.');
                }
            }
        };
        await expect(evaluator.evaluate(document, '$.store..invalid-path')).rejects.toThrow('JSONPath evaluation failed: Lexical error on line 1. Unrecognized text.');
    });

    describe('getSuggestions', () => {
        test('should provide root suggestions for an object', async () => {
            const suggestions = await evaluator.getSuggestions(document, '$');
            const suggestionTexts = suggestions.map(s => s.text);
            expect(suggestionTexts).toContain('$.store');
            expect(suggestionTexts).toContain('$..*');
        });

        test('should provide property suggestions after a dot', async () => {
            const suggestions = await evaluator.getSuggestions(document, '$.store.');
            const suggestionTexts = suggestions.map(s => s.text);
            expect(suggestionTexts).toContain('book');
            expect(suggestionTexts).toContain('bicycle');
        });

        test('should provide array suggestions after a bracket', async () => {
            const suggestions = await evaluator.getSuggestions(document, '$.store.book[');
            const suggestionTexts = suggestions.map(s => s.text);
            expect(suggestionTexts).toContain('*]');
            expect(suggestionTexts).toContain('0]');
            expect(suggestionTexts).toContain('?(@.price > 7.95)]');
        });

        test('should provide partial property suggestions', async () => {
            const suggestions = await evaluator.getSuggestions(document, '$.store.b');
            const suggestionTexts = suggestions.map(s => s.text);
            expect(suggestionTexts).toContain('book');
            expect(suggestionTexts).toContain('bicycle');

            const suggestions2 = await evaluator.getSuggestions(document, '$.store.book[0].auth');
            const suggestionTexts2 = suggestions2.map(s => s.text);
            expect(suggestionTexts2).toContain('author');
        });

        test('should provide pipe function suggestions', async () => {
            const suggestions = await evaluator.getSuggestions(document, '$.store.book | ');
            const suggestionTexts = suggestions.map(s => s.text);
            expect(suggestionTexts).toContain('filter()');
            expect(suggestionTexts).toContain('sort()');
        });
    });

    describe('Metadata functions', () => {
        test('should return syntax info', () => {
            const syntaxInfo = evaluator.getSyntaxInfo();
            expect(syntaxInfo.name).toBe('JSONPathEvaluator');
            expect(syntaxInfo.operators).toBeInstanceOf(Array);
            expect(syntaxInfo.examples).toBeInstanceOf(Array);
        });
    });

    describe('Coverage Improvement', () => {
        test('should calculate fuzzy score correctly', () => {
            const score1 = evaluator.calculateFuzzyScore('auth', 'author');
            const score2 = evaluator.calculateFuzzyScore('author', 'author');
            expect(score1).toBeGreaterThan(50);
            expect(score2).toBe(100);
        });

        test('should parse query correctly', () => {
            const parsed = evaluator.parseQuery('$.store.book[*].author');
            expect(parsed.original).toBe('$.store.book[*].author');
            expect(parsed.expressions).toEqual(['$.store.book[*].author']);
        });

        test('should get type description for various types', () => {
            expect(evaluator.getTypeDescription('list', 'items')).toBe('Array: items');
            expect(evaluator.getTypeDescription('document', 'user')).toBe('Object: user');
            expect(evaluator.getTypeDescription('property', 'name')).toBe('Property: name');
            expect(evaluator.getTypeDescription('null', 'value')).toBe('Null: value');
        });

        test('should get sample value for various types', () => {
            expect(evaluator.getSampleValue(null)).toBe(null);
            expect(evaluator.getSampleValue([1, 2, 3])).toBe('Array(3)');
            expect(evaluator.getSampleValue({a: 1, b: 2})).toBe('Object(2 keys)');
            expect(evaluator.getSampleValue('a_long_string_that_should_be_truncated')).toContain('...');
            expect(evaluator.getSampleValue(123)).toBe(123);
            expect(evaluator.getSampleValue(true)).toBe(true);
        });

        test('should parse union query correctly', () => {
            const parsed = evaluator.parseQuery('$.a, $.b');
            expect(parsed.isUnion).toBe(true);
            expect(parsed.expressions).toEqual(['$.a', '$.b']);
        });

        test('should filter pipe function suggestions', async () => {
            const suggestions = await evaluator.getSuggestions(document, '$.store.book | fil');
            const suggestionTexts = suggestions.map(s => s.text);
            expect(suggestionTexts).toContain('filter()');
        });

        test('should get supported operators', () => {
            const operators = evaluator.getSupportedOperators();
            expect(operators.length).toBeGreaterThan(0);
        });

        test('should get language name', () => {
            const name = evaluator.getLanguageName();
            expect(name).toBe('JSONPath');
        });
    });
  });

  describe('YQEvaluator', () => {
    let evaluator;
    beforeEach(() => {
        evaluator = new YQEvaluator();
    });

    test('should evaluate basic yq expressions', async () => {
        const result = await evaluator.evaluate(document, '.store.book[0].author');
        expect(result).toEqual(['Nigel Rees']);
    });

    test('should handle pipe operations', async () => {
        const result = await evaluator.evaluate(document, '.store.book | .[0].author');
        expect(result).toEqual(['Nigel Rees']);
    });

    test('should support array iteration', async () => {
        const result = await evaluator.evaluate(document, '.store.book[].author');
        expect(result).toEqual(['Nigel Rees', 'Evelyn Waugh', 'Herman Melville', 'J. R. R. Tolkien']);
    });

    test('should support yq functions like "keys"', async () => {
        const result = await evaluator.evaluate(document, '.store.bicycle | keys');
        expect(result).toEqual([['color', 'price']]);
    });

    test('should throw an error for invalid yq syntax', async () => {
        // This tests a parsing failure in the custom parser
        await expect(evaluator.evaluate(document, '.store.book[0]..title')).rejects.toThrow();
    });

    test('should support yq filters and transformations (placeholder)', async () => {
        const result = await evaluator.evaluate(document, '.store.book | select(length > 0)');
        expect(result).toBeDefined();
    });

    test('should handle YAML-specific queries (pipes)', async () => {
        const result = await evaluator.evaluate(document, '.store.book | .[].author');
        expect(result).toEqual(['Nigel Rees', 'Evelyn Waugh', 'Herman Melville', 'J. R. R. Tolkien']);
    });

    test('should validate YQ syntax', async () => {
        // The current implementation does not have a dedicated validation method that is easy to test separately
        // from evaluation. We test validation by expecting evaluation to fail on invalid syntax.
        await expect(evaluator.evaluate(document, '.store.book[0]..title')).rejects.toThrow();
    });

    test('should handle union queries', async () => {
        const result = await evaluator.evaluate(document, '.store.bicycle.color, .store.book[0].price');
        expect(result).toHaveLength(2);
        expect(result).toContain('red');
        expect(result).toContain(8.95);
    });

    test('should handle keys[] to get keys as array elements', async () => {
        const result = await evaluator.evaluate(document, '.store.bicycle | keys[]');
        expect(result).toEqual(['color', 'price']);
    });

    test('should get length of arrays and objects', async () => {
        const arrayLength = await evaluator.evaluate(document, '.store.book | length');
        expect(arrayLength).toEqual([4]);
        const objectLength = await evaluator.evaluate(document, '.store.bicycle | length');
        expect(objectLength).toEqual([2]);
    });

    test('should get values of an object', async () => {
        const result = await evaluator.evaluate(document, '.store.bicycle | values');
        expect(result).toEqual([['red', 19.95]]);
        const result2 = await evaluator.evaluate(document, '.store.bicycle | values[]');
        expect(result2).toEqual(['red', 19.95]);
    });

    test('should support array slicing', async () => {
        const result = await evaluator.evaluate(document, '.store.book[1:3]');
        expect(result).toHaveLength(2);
        expect(result[0].title).toBe('Sword of Honour');
        expect(result[1].title).toBe('Moby Dick');
    });

    test('should support negative array indices', async () => {
        const result = await evaluator.evaluate(document, '.store.book[-1].title');
        expect(result).toEqual(['The Lord of the Rings']);
    });

    test('should handle root path query', async () => {
        const result = await evaluator.evaluate(document, '.');
        expect(result[0]).toEqual(document);
    });
    describe('getSuggestions', () => {
        test('should provide root suggestions for an object', async () => {
            const suggestions = await evaluator.getSuggestions(document, '.');
            const suggestionTexts = suggestions.map(s => s.text);
            expect(suggestionTexts).toContain('.store');
            expect(suggestionTexts).toContain('.keys');
        });

        test('should provide property suggestions after a dot', async () => {
            const suggestions = await evaluator.getSuggestions(document, '.store.');
            const suggestionTexts = suggestions.map(s => s.text);
            expect(suggestionTexts).toContain('book');
            expect(suggestionTexts).toContain('bicycle');
        });

        test('should provide array suggestions after a bracket', async () => {
            const suggestions = await evaluator.getSuggestions(document, '.store.book[');
            const suggestionTexts = suggestions.map(s => s.text);
            expect(suggestionTexts).toContain(']');
            expect(suggestionTexts).toContain('0]');
            expect(suggestionTexts).toContain('-1]');
        });

        test('should provide partial property suggestions', async () => {
            const context = { expressionStart: 0, cursorPosition: 9 };
            const suggestions = await evaluator.getSuggestions(document, '.store.b', context);
            const suggestionTexts = suggestions.map(s => s.text);
            expect(suggestionTexts).toContain('book');
            expect(suggestionTexts).toContain('bicycle');
        });

        test('should provide pipe suggestions', async () => {
            const suggestions = await evaluator.getSuggestions(document, '.store.book |');
            const suggestionTexts = suggestions.map(s => s.text);
            expect(suggestionTexts).toContain('keys');
            expect(suggestionTexts).toContain('length');
        });

        test('should provide function context suggestions', async () => {
            const suggestions = await evaluator.getSuggestions(document, '.store.book | select(');
            const suggestionTexts = suggestions.map(s => s.text);
            expect(suggestionTexts).toContain('.key');
            expect(suggestionTexts).toContain('.key == "value"');
        });
    });
  });

  describe('Query Result Formatting', () => {
    test.todo('should format results as JSON');
    test.todo('should format results as YAML');
    test.todo('should highlight matched paths');
  });
});
''