/**
 * JSON Tool Test Suite - Basic functionality
 */

const { describe, test, expect } = require('@jest/globals');

describe('JSON Tool - Basic Functionality', () => {
  describe('JSON Parsing', () => {
    test('should parse valid simple object', () => {
      const validJson = '{"name": "test", "value": 123}';
      const parsed = JSON.parse(validJson);

      expect(parsed.name).toBe("test");
      expect(parsed.value).toBe(123);
    });

    test('should detect invalid JSON', () => {
      const invalidJsons = [
        '{"name": "test",}',    // Trailing comma
        '{name: "test"}',       // Unquoted key
        '{"name": "test"',      // Unclosed brace
      ];

      for (const invalidJson of invalidJsons) {
        expect(() => JSON.parse(invalidJson)).toThrow();
      }
    });
  });

  describe('JSON Formatting', () => {
    test('should format with consistent indentation', () => {
      const testObj = { a: 1, b: { c: 2, d: [3, 4] } };
      const formatted = JSON.stringify(testObj, null, 2);

      // Check that it uses 2-space indentation
      const lines = formatted.split('\n');
      const indentedLines = lines.filter(line => line.startsWith('  '));

      expect(indentedLines.length).toBeGreaterThan(0);
    });

    test('should minify by removing whitespace', () => {
      const testObj = { name: "test", nested: { array: [1, 2, 3], value: true } };

      const formatted = JSON.stringify(testObj, null, 2);
      const minified = JSON.stringify(testObj);

      expect(minified).not.toContain('\n');
      expect(minified).not.toContain('  ');
      expect(formatted.length).toBeGreaterThan(minified.length);
    });
  });
});
