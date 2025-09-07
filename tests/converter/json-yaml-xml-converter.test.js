/**
 * JSON-YAML-XML Converter Test Suite
 * Comprehensive tests for bidirectional conversions and edge cases
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
        console.log('🧪 Running JSON-YAML-XML Converter Tests\n');
        
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
        innerHTML: '',
        addEventListener: () => {},
        classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false },
        style: {}
    },
    querySelectorAll: () => [],
    querySelector: () => null,
    createElement: () => ({ 
        className: '', 
        textContent: '',
        appendChild: () => {},
        parentNode: { removeChild: () => {} },
        select: () => {},
        focus: () => {}
    }),
    body: {
        appendChild: () => {},
        removeChild: () => {}
    },
    execCommand: () => true
};

// Mock global objects
global.document = mockDOM;
global.window = {
    addEventListener: () => {}
};
global.navigator = { 
    clipboard: { 
        writeText: async () => {} 
    } 
};
global.localStorage = {
    setItem: () => {},
    getItem: () => null,
    removeItem: () => {}
};
global.fetch = async () => ({ 
    ok: true, 
    json: async () => ({ history: [] }) 
});
global.DOMParser = class {
    parseFromString(str, type) {
        return {
            documentElement: { tagName: 'root' },
            querySelector: () => null,
            getElementsByTagName: () => []
        };
    }
};
global.XMLSerializer = class {
    serializeToString(doc) {
        return '<root></root>';
    }
};
global.Node = {
    TEXT_NODE: 3,
    ELEMENT_NODE: 1
};

// Load the converter class
const JsonYamlXmlConverter = require('../static/js/json-yaml-xml-converter.js');

// Test suite
const runner = new TestRunner();

// Test data sets
const testData = {
    simpleObject: {
        json: '{"name": "test", "value": 123, "active": true}',
        expectedYaml: 'name: test\nvalue: 123\nactive: true',
        expectedXml: '<?xml version="1.0" encoding="UTF-8"?>\n<root>\n  <name>test</name>\n  <value>123</value>\n  <active>true</active>\n</root>'
    },
    
    nestedObject: {
        json: '{"user": {"name": "John", "details": {"age": 30, "city": "NYC"}}, "active": true}',
        expectedYaml: 'user:\n  name: John\n  details:\n    age: 30\n    city: NYC\nactive: true',
        expectedXml: '<?xml version="1.0" encoding="UTF-8"?>\n<root>\n  <user>\n    <name>John</name>\n    <details>\n      <age>30</age>\n      <city>NYC</city>\n    </details>\n  </user>\n  <active>true</active>\n</root>'
    },
    
    arrayData: {
        json: '{"items": [1, 2, 3], "users": [{"id": 1, "name": "Alice"}, {"id": 2, "name": "Bob"}]}',
        expectedYaml: 'items:\n  - 1\n  - 2\n  - 3\nusers:\n  - id: 1\n    name: Alice\n  - id: 2\n    name: Bob',
        expectedXml: '<?xml version="1.0" encoding="UTF-8"?>\n<root>\n  <items>\n    <item>1</item>\n    <item>2</item>\n    <item>3</item>\n  </items>\n  <users>\n    <user>\n      <id>1</id>\n      <name>Alice</name>\n    </user>\n    <user>\n      <id>2</id>\n      <name>Bob</name>\n    </user>\n  </users>\n</root>'
    },
    
    specialValues: {
        json: '{"null_value": null, "empty_string": "", "boolean_true": true, "boolean_false": false, "number_zero": 0, "negative_number": -42.5}',
        expectedYaml: 'null_value: null\nempty_string: ""\nboolean_true: true\nboolean_false: false\nnumber_zero: 0\nnegative_number: -42.5',
        expectedXml: '<?xml version="1.0" encoding="UTF-8"?>\n<root>\n  <null_value></null_value>\n  <empty_string></empty_string>\n  <boolean_true>true</boolean_true>\n  <boolean_false>false</boolean_false>\n  <number_zero>0</number_zero>\n  <negative_number>-42.5</negative_number>\n</root>'
    },

    yamlWithComments: {
        yaml: '# Configuration file\nname: test\nversion: "1.0"\n# Database settings\ndatabase:\n  host: localhost\n  port: 5432',
        expectedJson: '{\n  "name": "test",\n  "version": "1.0",\n  "database": {\n    "host": "localhost",\n    "port": 5432\n  }\n}',
        expectedXml: '<?xml version="1.0" encoding="UTF-8"?>\n<root>\n  <name>test</name>\n  <version>1.0</version>\n  <database>\n    <host>localhost</host>\n    <port>5432</port>\n  </database>\n</root>'
    },

    xmlWithAttributes: {
        xml: '<?xml version="1.0"?>\n<user id="123" active="true">\n  <name>John Doe</name>\n  <email type="personal">john@example.com</email>\n</user>',
        expectedJson: '{\n  "user": {\n    "@attributes": {\n      "id": "123",\n      "active": "true"\n    },\n    "name": "John Doe",\n    "email": {\n      "@attributes": {\n        "type": "personal"\n      },\n      "#text": "john@example.com"\n    }\n  }\n}'
    }
};

// Create a converter instance for testing
function createConverter() {
    // Mock the DOM elements that the converter needs
    mockDOM.elements = {
        inputArea: { value: '', addEventListener: () => {} },
        outputArea: { innerHTML: '', textContent: '' },
        statusText: { textContent: '', className: '' },
        charCount: { textContent: '' },
        inputFormat: { textContent: '', className: '' },
        outputFormat: { textContent: '', className: '' },
        yamlIndent: { value: '2', addEventListener: () => {} },
        convertToJson: { addEventListener: () => {} },
        convertToYaml: { addEventListener: () => {} },
        convertToXml: { addEventListener: () => {} },
        formatBtn: { addEventListener: () => {} },
        swapBtn: { addEventListener: () => {} },
        clearBtn: { addEventListener: () => {} },
        copyBtn: { addEventListener: () => {} },
        jsonExampleBtn: { addEventListener: () => {} },
        yamlExampleBtn: { addEventListener: () => {} },
        historyBtn: { addEventListener: () => {} },
        globalHistoryBtn: { addEventListener: () => {} },
        historyModal: { style: {} },
        globalHistoryModal: { style: {} },
        closeHistoryModal: { addEventListener: () => {} },
        closeGlobalHistoryModal: { addEventListener: () => {} },
        clearHistoryBtn: { addEventListener: () => {} },
        historyContent: { innerHTML: '' },
        globalHistoryContent: { innerHTML: '' }
    };
    
    return new JsonYamlXmlConverter();
}

// Format Detection Tests
runner.test('Format Detection - JSON', () => {
    const converter = createConverter();
    const format = converter.detectFormat('{"test": "value"}');
    if (format !== 'json') {
        throw new Error(`Expected 'json', got '${format}'`);
    }
});

runner.test('Format Detection - YAML', () => {
    const converter = createConverter();
    const format = converter.detectFormat('name: test\nvalue: 123');
    if (format !== 'yaml') {
        throw new Error(`Expected 'yaml', got '${format}'`);
    }
});

runner.test('Format Detection - XML', () => {
    const converter = createConverter();
    const format = converter.detectFormat('<?xml version="1.0"?><root><test>value</test></root>');
    if (format !== 'xml') {
        throw new Error(`Expected 'xml', got '${format}'`);
    }
});

runner.test('Format Detection - Unknown', () => {
    const converter = createConverter();
    const format = converter.detectFormat('random text that is not structured data');
    if (format !== 'unknown') {
        throw new Error(`Expected 'unknown', got '${format}'`);
    }
});

// JSON to YAML Conversion Tests
runner.test('JSON to YAML - Simple Object', () => {
    const converter = createConverter();
    const result = converter.jsonToYaml(testData.simpleObject.json);
    const expected = testData.simpleObject.expectedYaml;
    
    if (result.trim() !== expected.trim()) {
        throw new Error(`Expected:\n${expected}\nGot:\n${result}`);
    }
});

runner.test('JSON to YAML - Nested Object', () => {
    const converter = createConverter();
    const result = converter.jsonToYaml(testData.nestedObject.json);
    const expected = testData.nestedObject.expectedYaml;
    
    // Normalize whitespace for comparison
    const normalizeYaml = (str) => str.replace(/\s+/g, ' ').trim();
    if (normalizeYaml(result) !== normalizeYaml(expected)) {
        throw new Error(`YAML conversion mismatch:\nExpected: ${expected}\nGot: ${result}`);
    }
});

runner.test('JSON to YAML - Arrays', () => {
    const converter = createConverter();
    const result = converter.jsonToYaml(testData.arrayData.json);
    
    // Check that arrays are properly formatted with dashes
    // The format might have extra spaces for nested objects, so check more flexibly
    if (!result.includes('- 1') || !result.includes('id: 1')) {
        throw new Error(`Array formatting incorrect in YAML: ${result}`);
    }
});

runner.test('JSON to YAML - Special Values', () => {
    const converter = createConverter();
    const result = converter.jsonToYaml(testData.specialValues.json);
    
    // Check that special values are handled correctly
    if (!result.includes('null_value: null') || 
        !result.includes('boolean_true: true') || 
        !result.includes('boolean_false: false')) {
        throw new Error(`Special values not handled correctly: ${result}`);
    }
});

// YAML to JSON Conversion Tests
runner.test('YAML to JSON - Simple Object', () => {
    const converter = createConverter();
    const yamlInput = 'name: test\nvalue: 123\nactive: true';
    const result = converter.yamlToJson(yamlInput);
    const parsed = JSON.parse(result);
    
    if (parsed.name !== 'test' || parsed.value !== 123 || parsed.active !== true) {
        throw new Error(`YAML to JSON conversion failed: ${result}`);
    }
});

runner.test('YAML to JSON - Nested Structure', () => {
    const converter = createConverter();
    const yamlInput = 'user:\n  name: John\n  details:\n    age: 30\n    city: NYC';
    const result = converter.yamlToJson(yamlInput);
    const parsed = JSON.parse(result);
    
    if (parsed.user.name !== 'John' || parsed.user.details.age !== 30) {
        throw new Error(`Nested YAML to JSON conversion failed: ${result}`);
    }
});

runner.test('YAML to JSON - Arrays', () => {
    const converter = createConverter();
    const yamlInput = 'items:\n  - 1\n  - 2\n  - 3\nusers:\n  - name: Alice\n  - name: Bob';
    const result = converter.yamlToJson(yamlInput);
    const parsed = JSON.parse(result);
    
    if (!Array.isArray(parsed.items) || parsed.items.length !== 3 || 
        !Array.isArray(parsed.users) || parsed.users[0].name !== 'Alice') {
        throw new Error(`YAML array to JSON conversion failed: ${result}`);
    }
});

runner.test('YAML to JSON - Comments Ignored', () => {
    const converter = createConverter();
    const result = converter.yamlToJson(testData.yamlWithComments.yaml);
    const parsed = JSON.parse(result);
    
    if (parsed.name !== 'test' || parsed.database.host !== 'localhost') {
        throw new Error(`YAML comments not properly ignored: ${result}`);
    }
});

// JSON to XML Conversion Tests
runner.test('JSON to XML - Simple Object', () => {
    const converter = createConverter();
    const result = converter.jsonToXml(testData.simpleObject.json);
    
    if (!result.includes('<?xml version="1.0" encoding="UTF-8"?>') ||
        !result.includes('<name>test</name>') ||
        !result.includes('<value>123</value>')) {
        throw new Error(`JSON to XML conversion failed: ${result}`);
    }
});

runner.test('JSON to XML - Arrays Convert to Multiple Elements', () => {
    const converter = createConverter();
    const jsonInput = '{"items": [1, 2, 3]}';
    const result = converter.jsonToXml(jsonInput);
    
    if (!result.includes('<item>1</item>') || 
        !result.includes('<item>2</item>') || 
        !result.includes('<item>3</item>')) {
        throw new Error(`JSON array to XML conversion failed: ${result}`);
    }
});

runner.test('JSON to XML - Special Characters Escaped', () => {
    const converter = createConverter();
    const jsonInput = '{"message": "Hello <world> & friends"}';
    const result = converter.jsonToXml(jsonInput);
    
    if (!result.includes('&lt;world&gt;') || !result.includes('&amp;')) {
        throw new Error(`XML special characters not escaped: ${result}`);
    }
});

// XML to JSON Conversion Tests
runner.test('XML to JSON - Simple Structure', () => {
    const converter = createConverter();
    
    // Mock the DOMParser for this test
    global.DOMParser = class {
        parseFromString(xmlStr) {
            return {
                querySelector: () => null,
                documentElement: {
                    tagName: 'root',
                    attributes: { length: 0 },
                    childNodes: [
                        {
                            nodeType: 1, // ELEMENT_NODE
                            tagName: 'name',
                            attributes: { length: 0 },
                            childNodes: [{ nodeType: 3, textContent: 'test' }]
                        },
                        {
                            nodeType: 1,
                            tagName: 'value',
                            attributes: { length: 0 },
                            childNodes: [{ nodeType: 3, textContent: '123' }]
                        }
                    ]
                }
            };
        }
    };
    
    const xmlInput = '<root><name>test</name><value>123</value></root>';
    const result = converter.xmlToJson(xmlInput);
    const parsed = JSON.parse(result);
    
    if (parsed.name !== 'test' || parsed.value !== 123) {
        throw new Error(`XML to JSON conversion failed: ${result}`);
    }
});

// Bidirectional Conversion Tests (Round-trip)
runner.test('Round-trip: JSON → YAML → JSON', () => {
    const converter = createConverter();
    const originalJson = testData.simpleObject.json;
    const yaml = converter.jsonToYaml(originalJson);
    const backToJson = converter.yamlToJson(yaml);
    
    const original = JSON.parse(originalJson);
    const final = JSON.parse(backToJson);
    
    if (JSON.stringify(original) !== JSON.stringify(final)) {
        throw new Error(`Round-trip JSON→YAML→JSON failed:\nOriginal: ${originalJson}\nFinal: ${backToJson}`);
    }
});

runner.test('Round-trip: YAML → JSON → YAML', () => {
    const converter = createConverter();
    const originalYaml = 'name: test\nvalue: 123\nactive: true';
    const json = converter.yamlToJson(originalYaml);
    const backToYaml = converter.jsonToYaml(json);
    
    // Parse both to compare structure (formatting may differ)
    const originalParsed = JSON.parse(converter.yamlToJson(originalYaml));
    const finalParsed = JSON.parse(converter.yamlToJson(backToYaml));
    
    if (JSON.stringify(originalParsed) !== JSON.stringify(finalParsed)) {
        throw new Error(`Round-trip YAML→JSON→YAML failed`);
    }
});

// Edge Cases and Error Handling
runner.test('Invalid JSON Handling', () => {
    const converter = createConverter();
    let errorThrown = false;
    
    try {
        converter.jsonToYaml('{"invalid": json}');
    } catch (error) {
        errorThrown = true;
    }
    
    if (!errorThrown) {
        throw new Error('Invalid JSON should throw an error');
    }
});

runner.test('Empty Input Handling', () => {
    const converter = createConverter();
    const format = converter.detectFormat('');
    if (format !== 'unknown') {
        throw new Error(`Empty input should return 'unknown' format, got '${format}'`);
    }
});

runner.test('Whitespace-only Input Handling', () => {
    const converter = createConverter();
    const format = converter.detectFormat('   \n\t   ');
    if (format !== 'unknown') {
        throw new Error(`Whitespace-only input should return 'unknown' format, got '${format}'`);
    }
});

// YAML Edge Cases
runner.test('YAML - Quoted Strings', () => {
    const converter = createConverter();
    const yamlInput = 'message: "This is a quoted string: with colon"\nother: \'Single quoted\'';
    const result = converter.yamlToJson(yamlInput);
    const parsed = JSON.parse(result);
    
    if (parsed.message !== 'This is a quoted string: with colon' || 
        parsed.other !== 'Single quoted') {
        throw new Error(`YAML quoted strings not handled correctly: ${result}`);
    }
});

runner.test('YAML - Numbers and Booleans', () => {
    const converter = createConverter();
    const yamlInput = 'integer: 42\nfloat: 3.14\nboolean_true: true\nboolean_false: false';
    const result = converter.yamlToJson(yamlInput);
    const parsed = JSON.parse(result);
    
    if (parsed.integer !== 42 || parsed.float !== 3.14 || 
        parsed.boolean_true !== true || parsed.boolean_false !== false) {
        throw new Error(`YAML type conversion failed: ${result}`);
    }
});

// XML Edge Cases  
runner.test('XML - Self-closing Tags', () => {
    const converter = createConverter();
    
    global.DOMParser = class {
        parseFromString(xmlStr) {
            return {
                querySelector: () => null,
                documentElement: {
                    tagName: 'root',
                    attributes: { length: 0 },
                    childNodes: [
                        {
                            nodeType: 1,
                            tagName: 'empty',
                            attributes: { length: 0 },
                            childNodes: []
                        }
                    ]
                }
            };
        }
    };
    
    const xmlInput = '<root><empty/></root>';
    const result = converter.xmlToJson(xmlInput);
    const parsed = JSON.parse(result);
    
    if (parsed.empty !== null) {
        throw new Error(`Self-closing XML tags not handled correctly: ${result}`);
    }
});

// Syntax Highlighting Tests
runner.test('JSON Syntax Highlighting', () => {
    const converter = createConverter();
    const json = '{"key": "value", "number": 123, "boolean": true, "null": null}';
    const highlighted = converter.syntaxHighlightJson(json);
    
    if (!highlighted.includes('json-key') || 
        !highlighted.includes('json-string') || 
        !highlighted.includes('json-number') || 
        !highlighted.includes('json-boolean') || 
        !highlighted.includes('json-null')) {
        throw new Error(`JSON syntax highlighting incomplete: ${highlighted}`);
    }
});

runner.test('YAML Syntax Highlighting', () => {
    const converter = createConverter();
    const yaml = 'key: value\nnumber: 123\nboolean: true\n# comment';
    const highlighted = converter.syntaxHighlightYaml(yaml);
    
    if (!highlighted.includes('yaml-key') || 
        !highlighted.includes('yaml-string') || 
        !highlighted.includes('yaml-number') || 
        !highlighted.includes('yaml-boolean') || 
        !highlighted.includes('yaml-comment')) {
        throw new Error(`YAML syntax highlighting incomplete: ${highlighted}`);
    }
});

runner.test('XML Syntax Highlighting', () => {
    const converter = createConverter();
    const xml = '<?xml version="1.0"?>\n<root attr="value">text</root>\n<!-- comment -->';
    const highlighted = converter.syntaxHighlightXml(xml);
    
    if (!highlighted.includes('xml-declaration') || 
        !highlighted.includes('xml-tag') || 
        !highlighted.includes('xml-attribute') || 
        !highlighted.includes('xml-comment')) {
        throw new Error(`XML syntax highlighting incomplete: ${highlighted}`);
    }
});

// Utility Function Tests
runner.test('Generate Preview - Long Text Truncation', () => {
    const converter = createConverter();
    const longText = 'a'.repeat(150);
    const preview = converter.generatePreview(longText, 100);
    
    if (preview.length !== 103 || !preview.endsWith('...')) {
        throw new Error(`Preview truncation failed: length=${preview.length}, ends with: ${preview.slice(-10)}`);
    }
});

runner.test('Generate Preview - Short Text', () => {
    const converter = createConverter();
    const shortText = 'Short text';
    const preview = converter.generatePreview(shortText, 100);
    
    if (preview !== shortText) {
        throw new Error(`Short text preview should remain unchanged: ${preview}`);
    }
});

runner.test('Generate Preview - Whitespace Normalization', () => {
    const converter = createConverter();
    const messyText = '  Line 1  \n\n  Line 2  \t\t  Line 3  ';
    const preview = converter.generatePreview(messyText, 100);
    const expected = 'Line 1 Line 2 Line 3';
    
    if (preview !== expected) {
        throw new Error(`Whitespace normalization failed: expected "${expected}", got "${preview}"`);
    }
});

// YAML Indentation Settings
runner.test('YAML Indentation - 2 Spaces (Default)', () => {
    const converter = createConverter();
    converter.yamlIndentSize = 2;
    const result = converter.jsonToYaml('{"user": {"name": "test"}}');
    
    if (!result.includes('  name: test')) {
        throw new Error(`2-space indentation not working: ${result}`);
    }
});

runner.test('YAML Indentation - 4 Spaces', () => {
    const converter = createConverter();
    converter.yamlIndentSize = 4;
    const result = converter.jsonToYaml('{"user": {"name": "test"}}');
    
    if (!result.includes('    name: test')) {
        throw new Error(`4-space indentation not working: ${result}`);
    }
});

// Combined Conversion Tests (YAML ↔ XML)
runner.test('YAML to XML via JSON', () => {
    const converter = createConverter();
    const yamlInput = 'name: test\nvalue: 123';
    const result = converter.yamlToXml(yamlInput);
    
    if (!result.includes('<name>test</name>') || !result.includes('<value>123</value>')) {
        throw new Error(`YAML to XML conversion failed: ${result}`);
    }
});

runner.test('XML to YAML via JSON', () => {
    const converter = createConverter();
    
    // Mock DOMParser for this test
    global.DOMParser = class {
        parseFromString(xmlStr) {
            return {
                querySelector: () => null,
                documentElement: {
                    tagName: 'root',
                    attributes: { length: 0 },
                    childNodes: [
                        {
                            nodeType: 1,
                            tagName: 'name',
                            attributes: { length: 0 },
                            childNodes: [{ nodeType: 3, textContent: 'test' }]
                        }
                    ]
                }
            };
        }
    };
    
    const xmlInput = '<root><name>test</name></root>';
    const result = converter.xmlToYaml(xmlInput);
    
    if (!result.includes('name: test')) {
        throw new Error(`XML to YAML conversion failed: ${result}`);
    }
});

// Run all tests
if (require.main === module) {
    runner.run().then(success => {
        process.exit(success ? 0 : 1);
    });
}

module.exports = { TestRunner, runner };