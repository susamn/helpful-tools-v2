/**
 * Minimal JSON Tool Test Suite - Essential functionality only
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
        console.log('🧪 Running JSON Tool Tests\n');
        
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

// Mock global objects for testing
global.document = {
    getElementById: () => ({ value: '', textContent: '', addEventListener: () => {} })
};
global.fetch = async () => ({ ok: true, json: async () => ({ history: [] }) });

// Test suite
const runner = new TestRunner();

// Test: JSON parsing and validation
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

runner.test('JSON parsing - Invalid JSON detection', () => {
    const invalidJsons = [
        '{"name": "test",}',    // Trailing comma
        '{name: "test"}',       // Unquoted key
        '{"name": "test"',      // Unclosed brace
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
});

runner.test('JSON minification - Removes whitespace', () => {
    const testObj = { name: "test", nested: { array: [1, 2, 3], value: true } };
    
    const formatted = JSON.stringify(testObj, null, 2);
    const minified = JSON.stringify(testObj);
    
    if (minified.includes('\n') || minified.includes('  ')) {
        throw new Error('Minified JSON should not contain newlines or double spaces');
    }
    
    if (formatted.length <= minified.length) {
        throw new Error('Formatted JSON should be longer than minified JSON');
    }
});

// Run all tests
if (require.main === module) {
    runner.run().then(success => {
        process.exit(success ? 0 : 1);
    });
}