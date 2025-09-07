/**
 * JSON Formatter Test Suite
 * Tests for JSON formatting, validation, and analysis logic
 */

// Simple test framework for Node.js environment
class TestRunner {
    constructor() {
        this.tests = [];
        this.passed = 0;
        this.failed = 0;
    }

    test(description, testFunction) {
        this.tests.push({ description, testFunction });
    }

    async run() {
        console.log('🧪 Running JSON Formatter Tests\n');
        
        for (const test of this.tests) {
            try {
                await test.testFunction();
                console.log(`✅ ${test.description}`);
                this.passed++;
            } catch (error) {
                console.log(`❌ ${test.description}`);
                console.log(`   Error: ${error.message}\n`);
                this.failed++;
            }
        }

        console.log('\n📊 Test Results:');
        console.log(`   Passed: ${this.passed}`);
        console.log(`   Failed: ${this.failed}`);
        console.log(`   Total: ${this.tests.length}`);
        
        return this.failed === 0;
    }
}

// Mock DOM environment for testing
const mockDOM = {
    elements: {},
    addEventListener: () => {},
    getElementById: (id) => mockDOM.elements[id] || { 
        value: '', 
        textContent: '',
        addEventListener: () => {},
        classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false }
    },
    querySelectorAll: () => [],
    createElement: () => ({ 
        className: '', 
        textContent: '',
        appendChild: () => {},
        parentNode: { removeChild: () => {} }
    })
};

// Mock global objects
global.document = mockDOM;
global.navigator = { clipboard: { writeText: async () => {} } };
global.fetch = async () => ({ ok: true, json: async () => ({ history: [] }) });

// Load the JsonFormatter class
const JsonFormatter = require('../static/js/json-formatter.js');

// Test suite
const runner = new TestRunner();

// Test: JSON Structure Analysis
runner.test('analyzeJsonStructure - Simple object', () => {
    const formatter = new JsonFormatter();
    const testObj = { name: "test", value: 123 };
    const stats = formatter.analyzeJsonStructure(testObj);
    
    if (stats.objects !== 1 || stats.arrays !== 0 || stats.properties !== 2) {
        throw new Error(`Expected {objects: 1, arrays: 0, properties: 2}, got ${JSON.stringify(stats)}`);
    }
});

runner.test('analyzeJsonStructure - Nested objects', () => {
    const formatter = new JsonFormatter();
    const testObj = {
        user: {
            name: "John",
            details: {
                age: 30,
                city: "NYC"
            }
        },
        active: true
    };
    const stats = formatter.analyzeJsonStructure(testObj);
    
    // Root object (1) + user object (1) + details object (1) = 3 objects
    // Properties: user, active, name, details, age, city = 6 properties
    if (stats.objects !== 3 || stats.arrays !== 0 || stats.properties !== 6) {
        throw new Error(`Expected {objects: 3, arrays: 0, properties: 6}, got ${JSON.stringify(stats)}`);
    }
});

runner.test('analyzeJsonStructure - Arrays', () => {
    const formatter = new JsonFormatter();
    const testObj = {
        items: [1, 2, 3],
        nested: [
            { id: 1, tags: ["a", "b"] },
            { id: 2, tags: ["c"] }
        ]
    };
    const stats = formatter.analyzeJsonStructure(testObj);
    
    // Objects: root(1) + nested[0](1) + nested[1](1) = 3
    // Arrays: items(1) + nested(1) + tags(2) = 4 
    // Properties: items, nested, id(2), tags(2) = 6
    if (stats.objects !== 3 || stats.arrays !== 4 || stats.properties !== 6) {
        throw new Error(`Expected {objects: 3, arrays: 4, properties: 6}, got ${JSON.stringify(stats)}`);
    }
});

runner.test('analyzeJsonStructure - Empty structures', () => {
    const formatter = new JsonFormatter();
    const testObj = { empty_obj: {}, empty_array: [] };
    const stats = formatter.analyzeJsonStructure(testObj);
    
    // Objects: root(1) + empty_obj(1) = 2
    // Arrays: empty_array(1) = 1
    // Properties: empty_obj, empty_array = 2
    if (stats.objects !== 2 || stats.arrays !== 1 || stats.properties !== 2) {
        throw new Error(`Expected {objects: 2, arrays: 1, properties: 2}, got ${JSON.stringify(stats)}`);
    }
});

runner.test('analyzeJsonStructure - Null and primitive values', () => {
    const formatter = new JsonFormatter();
    const testObj = {
        str: "test",
        num: 42,
        bool: true,
        null_val: null,
        undef_val: undefined
    };
    const stats = formatter.analyzeJsonStructure(testObj);
    
    // Only root object counts
    if (stats.objects !== 1 || stats.arrays !== 0 || stats.properties !== 5) {
        throw new Error(`Expected {objects: 1, arrays: 0, properties: 5}, got ${JSON.stringify(stats)}`);
    }
});

runner.test('_generatePreview - Long text truncation', () => {
    const formatter = new JsonFormatter();
    const longText = "a".repeat(150);
    const preview = formatter._generatePreview(longText, 100);
    
    if (preview.length !== 103 || !preview.endsWith('...')) { // 100 chars + "..."
        throw new Error(`Preview should be 103 chars ending with '...', got ${preview.length} chars: "${preview.slice(-10)}"`);
    }
});

runner.test('_generatePreview - Short text', () => {
    const formatter = new JsonFormatter();
    const shortText = "Short text";
    const preview = formatter._generatePreview(shortText, 100);
    
    if (preview !== shortText) {
        throw new Error(`Short text should remain unchanged, got "${preview}"`);
    }
});

runner.test('_generatePreview - Whitespace normalization', () => {
    const formatter = new JsonFormatter();
    const messyText = "  Line 1  \n\n  Line 2  \t\t  Line 3  ";
    const preview = formatter._generatePreview(messyText, 100);
    const expected = "Line 1 Line 2 Line 3";
    
    if (preview !== expected) {
        throw new Error(`Expected "${expected}", got "${preview}"`);
    }
});

// Test JSON validation scenarios (would need actual JSON.parse)
runner.test('JSON parsing - Valid simple object', () => {
    const validJson = '{"name": "test", "value": 123}';
    let parsed;
    
    try {
        parsed = JSON.parse(validJson);
    } catch (error) {
        throw new Error(`Valid JSON should parse successfully: ${error.message}`);
    }
    
    if (parsed.name !== "test" || parsed.value !== 123) {
        throw new Error('Parsed JSON does not match expected values');
    }
});

runner.test('JSON parsing - Valid array', () => {
    const validJson = '[1, "two", {"three": 3}, null]';
    let parsed;
    
    try {
        parsed = JSON.parse(validJson);
    } catch (error) {
        throw new Error(`Valid JSON array should parse successfully: ${error.message}`);
    }
    
    if (!Array.isArray(parsed) || parsed.length !== 4) {
        throw new Error('Parsed JSON array does not match expected structure');
    }
});

runner.test('JSON parsing - Invalid JSON detection', () => {
    const invalidJsons = [
        '{"name": "test",}', // Trailing comma
        '{name: "test"}',    // Unquoted key
        '{"name": "test"',   // Unclosed brace
        '{"name": undefined}', // Undefined value
        '{123: "test"}',     // Numeric key without quotes
    ];
    
    for (const invalidJson of invalidJsons) {
        try {
            JSON.parse(invalidJson);
            throw new Error(`Should have thrown error for: ${invalidJson}`);
        } catch (error) {
            // Expected to throw
            if (error.message.includes('Should have thrown')) {
                throw error; // Re-throw our test error
            }
        }
    }
});

runner.test('JSON formatting - Consistent indentation', () => {
    const testObj = { a: 1, b: { c: 2, d: [3, 4] } };
    const formatted = JSON.stringify(testObj, null, 2);
    
    // Check that it uses 2-space indentation
    const lines = formatted.split('\n');
    const indentedLines = lines.filter(line => line.startsWith('  '));
    
    if (indentedLines.length === 0) {
        throw new Error('Formatted JSON should have indented lines');
    }
    
    // Check that nested indentation uses multiples of 2 spaces
    const deeplyNestedLine = lines.find(line => line.includes('"c": 2'));
    if (!deeplyNestedLine || !deeplyNestedLine.startsWith('    ')) {
        throw new Error('Deeply nested properties should have 4-space indentation');
    }
});

runner.test('JSON minification - Removes whitespace', () => {
    const testObj = { 
        name: "test", 
        nested: { 
            array: [1, 2, 3], 
            value: true 
        } 
    };
    
    const formatted = JSON.stringify(testObj, null, 2);
    const minified = JSON.stringify(testObj);
    
    if (minified.includes('\n') || minified.includes('  ')) {
        throw new Error('Minified JSON should not contain newlines or double spaces');
    }
    
    if (formatted.length <= minified.length) {
        throw new Error('Formatted JSON should be longer than minified JSON');
    }
    
    // Both should parse to the same object
    const parsedFormatted = JSON.parse(formatted);
    const parsedMinified = JSON.parse(minified);
    
    if (JSON.stringify(parsedFormatted) !== JSON.stringify(parsedMinified)) {
        throw new Error('Formatted and minified JSON should parse to identical objects');
    }
});

runner.test('JSONL formatting - Compact JSONL input', () => {
    const formatter = new JsonFormatter();
    formatter.indentPrefs = { type: 'spaces', size: 2 };
    
    const compactJsonl = `{"id":1,"name":"Alice","age":28}
{"id":2,"name":"Bob","age":34}
{"id":3,"name":"Carol","age":29}`;
    
    const jsonObjects = formatter.parseJsonlObjects(compactJsonl);
    
    if (jsonObjects.length !== 3) {
        throw new Error(`Expected 3 JSON objects, got ${jsonObjects.length}`);
    }
    
    if (jsonObjects[0].name !== 'Alice' || jsonObjects[1].name !== 'Bob') {
        throw new Error('JSON objects not parsed correctly');
    }
});

runner.test('JSONL formatting - Formatted JSONL input (user case)', () => {
    const formatter = new JsonFormatter();
    formatter.indentPrefs = { type: 'spaces', size: 2 };
    
    const formattedJsonl = `{
  "id": 1,
  "name": "Alice Johnson",
  "occupation": "Software Engineer"
}

{
  "id": 2,
  "name": "Bob Smith", 
  "occupation": "Data Scientist"
}`;
    
    const jsonObjects = formatter.parseJsonlObjects(formattedJsonl);
    
    if (jsonObjects.length !== 2) {
        throw new Error(`Expected 2 JSON objects, got ${jsonObjects.length}`);
    }
    
    if (jsonObjects[0].name !== 'Alice Johnson' || jsonObjects[1].name !== 'Bob Smith') {
        throw new Error('Formatted JSONL objects not parsed correctly');
    }
    
    // Test that we can format them back
    const formatted = jsonObjects.map(obj => formatter.formatJsonWithIndent(obj));
    if (formatted.length !== 2) {
        throw new Error('Failed to format parsed JSONL objects');
    }
});

runner.test('JSONL parsing - Mixed compact and formatted', () => {
    const formatter = new JsonFormatter();
    
    const mixedJsonl = `{"simple": "object"}
{
  "complex": {
    "nested": {
      "value": 123
    }
  }
}
{"another": "simple"}`;
    
    const jsonObjects = formatter.parseJsonlObjects(mixedJsonl);
    
    if (jsonObjects.length !== 3) {
        throw new Error(`Expected 3 JSON objects, got ${jsonObjects.length}`);
    }
    
    if (jsonObjects[0].simple !== 'object' || jsonObjects[1].complex.nested.value !== 123) {
        throw new Error('Mixed JSONL not parsed correctly');
    }
});

// Run all tests
if (require.main === module) {
    runner.run().then(success => {
        process.exit(success ? 0 : 1);
    });
}

module.exports = { TestRunner, runner };