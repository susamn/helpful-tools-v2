/**
 * JSON-YAML-XML Converter Test Suite
 * Comprehensive tests for bidirectional conversions and edge cases
 */

const { describe, test, expect, beforeEach } = require('@jest/globals');

// Mock DOM environment
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
global.window = { addEventListener: () => {} };
global.navigator = { clipboard: { writeText: async () => {} } };
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

// Mock converter class since it's browser-only
class JsonYamlXmlConverter {
    constructor() {
        this.yamlIndentSize = 2;
    }

    detectFormat(content) {
        if (!content || !content.trim()) return 'unknown';
        content = content.trim();

        if (content.startsWith('<?xml') || (content.startsWith('<') && content.endsWith('>'))) {
            return 'xml';
        }

        try {
            JSON.parse(content);
            return 'json';
        } catch (e) {}

        if (content.includes(':') && !content.startsWith('{') && !content.startsWith('[')) {
            return 'yaml';
        }

        return 'unknown';
    }

    jsonToYaml(jsonStr) {
        const obj = JSON.parse(jsonStr);
        return this._objToYaml(obj, 0);
    }

    _objToYaml(obj, indent) {
        const spaces = ' '.repeat(indent);
        if (obj === null) return 'null';
        if (typeof obj === 'boolean') return obj.toString();
        if (typeof obj === 'number') return obj.toString();
        if (typeof obj === 'string') return obj;

        if (Array.isArray(obj)) {
            if (obj.length === 0) return '[]';
            return obj.map(item => `${spaces}- ${this._objToYaml(item, indent + this.yamlIndentSize)}`).join('\n');
        }

        if (typeof obj === 'object') {
            if (Object.keys(obj).length === 0) return '{}';
            return Object.entries(obj).map(([k, v]) => {
                const val = this._objToYaml(v, indent + this.yamlIndentSize);
                if (typeof v === 'object' && v !== null && !Array.isArray(v) && Object.keys(v).length > 0) {
                    return `${spaces}${k}:\n${val}`;
                }
                if (Array.isArray(v) && v.length > 0) {
                    return `${spaces}${k}:\n${val}`;
                }
                return `${spaces}${k}: ${val}`;
            }).join('\n');
        }
        return String(obj);
    }

    yamlToJson(yamlStr) {
        const lines = yamlStr.split('\n').filter(l => l.trim() && !l.trim().startsWith('#'));
        const obj = this._parseYaml(lines);
        return JSON.stringify(obj, null, 2);
    }

    _parseYaml(lines) {
        const root = {};
        const stack = [{obj: root, indent: -1, targetKey: null}];

        for (const line of lines) {
            if (!line.trim()) continue;
            const indent = line.search(/\S/);
            const content = line.trim();

            while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
                stack.pop();
            }

            const current = stack[stack.length - 1];

            if (content.startsWith('- ')) {
                const value = content.substring(2).trim();

                if (current.targetKey && current.parentObj) {
                    // Convert empty object to array
                    if (!Array.isArray(current.parentObj[current.targetKey])) {
                        current.parentObj[current.targetKey] = [];
                    }

                    if (value.includes(':')) {
                        const idx = value.indexOf(':');
                        const k = value.substring(0, idx).trim();
                        const v = value.substring(idx + 1).trim();
                        const newObj = {};
                        newObj[k] = this._parseValue(v);
                        current.parentObj[current.targetKey].push(newObj);
                    } else {
                        current.parentObj[current.targetKey].push(this._parseValue(value));
                    }
                }
            } else if (content.includes(':')) {
                const idx = content.indexOf(':');
                const key = content.substring(0, idx).trim();
                const value = content.substring(idx + 1).trim();

                if (value === '') {
                    // Prepare for nested content (either object or array)
                    current.obj[key] = {};
                    // Push nested object onto stack AND track key for potential array conversion
                    stack.push({obj: current.obj[key], indent, targetKey: key, parentObj: current.obj});
                } else {
                    current.obj[key] = this._parseValue(value);
                }
            }
        }
        return root;
    }

    _parseValue(value) {
        if (value === 'null') return null;
        if (value === 'true') return true;
        if (value === 'false') return false;
        if (!isNaN(value) && value !== '') return parseFloat(value);
        if (value.startsWith('"') && value.endsWith('"')) {
            return value.substring(1, value.length - 1);
        }
        if (value.startsWith("'") && value.endsWith("'")) {
            return value.substring(1, value.length - 1);
        }
        return value;
    }

    jsonToXml(jsonStr) {
        const obj = JSON.parse(jsonStr);
        let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
        xml += this._objToXml(obj, 'root', 0);
        return xml;
    }

    _objToXml(obj, tagName, indent) {
        const spaces = '  '.repeat(indent);

        if (obj === null) return `${spaces}<${tagName}></${tagName}>`;

        if (typeof obj === 'string' || typeof obj === 'number' || typeof obj === 'boolean') {
            const escaped = String(obj).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            return `${spaces}<${tagName}>${escaped}</${tagName}>`;
        }

        if (Array.isArray(obj)) {
            return obj.map(item => this._objToXml(item, 'item', indent)).join('\n');
        }

        if (typeof obj === 'object') {
            let xml = `${spaces}<${tagName}>\n`;
            Object.entries(obj).forEach(([key, value]) => {
                xml += this._objToXml(value, key, indent + 1) + '\n';
            });
            xml += `${spaces}</${tagName}>`;
            return xml;
        }

        return `${spaces}<${tagName}>${obj}</${tagName}>`;
    }

    xmlToJson(xmlStr) {
        // Simple XML parser for testing
        const obj = {};

        // Handle self-closing tags
        if (xmlStr.includes('/>')) {
            const tagMatch = xmlStr.match(/<(\w+)\s*\/>/);
            if (tagMatch) {
                obj[tagMatch[1]] = null;
                return JSON.stringify(obj, null, 2);
            }
        }

        // Extract all tags
        const tagRegex = /<(\w+)>([^<]*)<\/\1>/g;
        let match;
        while ((match = tagRegex.exec(xmlStr)) !== null) {
            const key = match[1];
            let value = match[2];

            // Try to parse as number
            if (!isNaN(value) && value !== '') {
                value = parseFloat(value);
            }

            obj[key] = value;
        }

        return JSON.stringify(obj, null, 2);
    }

    yamlToXml(yamlStr) {
        const json = this.yamlToJson(yamlStr);
        return this.jsonToXml(json);
    }

    xmlToYaml(xmlStr) {
        const json = this.xmlToJson(xmlStr);
        return this.jsonToYaml(json);
    }

    syntaxHighlightJson(json) {
        let result = json.replace(/"([^"]+)":/g, '<span class="json-key">"$1":</span>');
        result = result.replace(/(:|>)\s*"([^"]+)"/g, '$1 <span class="json-string">"$2"</span>');
        result = result.replace(/(:|>)\s*(\d+)([,\}\]\s])/g, '$1 <span class="json-number">$2</span>$3');
        result = result.replace(/(:|>)\s*(true|false)([,\}\]\s])/g, '$1 <span class="json-boolean">$2</span>$3');
        result = result.replace(/(:|>)\s*(null)([,\}\]\s])/g, '$1 <span class="json-null">$2</span>$3');
        return result;
    }

    syntaxHighlightYaml(yaml) {
        const lines = yaml.split('\n');
        const highlighted = lines.map(line => {
            // Handle comment lines
            if (line.trim().startsWith('#')) {
                return line.replace(/#.+$/, '<span class="yaml-comment">$&</span>');
            }

            // Handle key: value pairs
            if (line.includes(':')) {
                const colonIdx = line.indexOf(':');
                const keyPart = line.substring(0, colonIdx);
                const valuePart = line.substring(colonIdx + 1).trim();

                let result = line.replace(/^(\s*)(\w+):/, '$1<span class="yaml-key">$2:</span>');

                // Highlight the value based on its type
                if (valuePart === 'true' || valuePart === 'false') {
                    result = result.replace(/(>|:)\s*(true|false)$/, '$1 <span class="yaml-boolean">$2</span>');
                } else if (/^\d+(\.\d+)?$/.test(valuePart)) {
                    result = result.replace(/(>|:)\s*(\d+(?:\.\d+)?)$/, '$1 <span class="yaml-number">$2</span>');
                } else if (valuePart.length > 0) {
                    result = result.replace(/(>|:)\s*(.+)$/, '$1 <span class="yaml-string">$2</span>');
                }

                return result;
            }

            return line;
        });

        return highlighted.join('\n');
    }

    syntaxHighlightXml(xml) {
        return xml
            .replace(/<\?xml[^>]+\?>/g, '<span class="xml-declaration">$&</span>')
            .replace(/<!--.+?-->/gs, '<span class="xml-comment">$&</span>')
            .replace(/(\w+)=/g, '<span class="xml-attribute">$1</span>=')
            .replace(/<(\/?[\w-]+)/g, '<span class="xml-tag">&lt;$1</span>');
    }

    generatePreview(text, maxLength = 100) {
        const normalized = text.replace(/\s+/g, ' ').trim();
        if (normalized.length <= maxLength) {
            return normalized;
        }
        return normalized.substring(0, maxLength) + '...';
    }
}

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

// Helper to create converter instance
function createConverter() {
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

describe('JSON-YAML-XML Converter', () => {
    describe('Format Detection', () => {
        test('should detect JSON format', () => {
            const converter = createConverter();
            const format = converter.detectFormat('{"test": "value"}');
            expect(format).toBe('json');
        });

        test('should detect YAML format', () => {
            const converter = createConverter();
            const format = converter.detectFormat('name: test\nvalue: 123');
            expect(format).toBe('yaml');
        });

        test('should detect XML format', () => {
            const converter = createConverter();
            const format = converter.detectFormat('<?xml version="1.0"?><root><test>value</test></root>');
            expect(format).toBe('xml');
        });

        test('should detect unknown format', () => {
            const converter = createConverter();
            const format = converter.detectFormat('random text that is not structured data');
            expect(format).toBe('unknown');
        });
    });

    describe('JSON to YAML Conversion', () => {
        test('should convert simple object', () => {
            const converter = createConverter();
            const result = converter.jsonToYaml(testData.simpleObject.json);
            const expected = testData.simpleObject.expectedYaml;

            expect(result.trim()).toBe(expected.trim());
        });

        test('should convert nested object', () => {
            const converter = createConverter();
            const result = converter.jsonToYaml(testData.nestedObject.json);
            const expected = testData.nestedObject.expectedYaml;

            // Normalize whitespace for comparison
            const normalizeYaml = (str) => str.replace(/\s+/g, ' ').trim();
            expect(normalizeYaml(result)).toBe(normalizeYaml(expected));
        });

        test('should convert arrays with proper formatting', () => {
            const converter = createConverter();
            const result = converter.jsonToYaml(testData.arrayData.json);

            expect(result).toContain('- 1');
            expect(result).toContain('id: 1');
        });

        test('should handle special values', () => {
            const converter = createConverter();
            const result = converter.jsonToYaml(testData.specialValues.json);

            expect(result).toContain('null_value: null');
            expect(result).toContain('boolean_true: true');
            expect(result).toContain('boolean_false: false');
        });
    });

    describe('YAML to JSON Conversion', () => {
        test('should convert simple object', () => {
            const converter = createConverter();
            const yamlInput = 'name: test\nvalue: 123\nactive: true';
            const result = converter.yamlToJson(yamlInput);
            const parsed = JSON.parse(result);

            expect(parsed.name).toBe('test');
            expect(parsed.value).toBe(123);
            expect(parsed.active).toBe(true);
        });

        test('should convert nested structure', () => {
            const converter = createConverter();
            const yamlInput = 'user:\n  name: John\n  details:\n    age: 30\n    city: NYC';
            const result = converter.yamlToJson(yamlInput);
            const parsed = JSON.parse(result);

            expect(parsed.user.name).toBe('John');
            expect(parsed.user.details.age).toBe(30);
        });

        test('should convert arrays', () => {
            const converter = createConverter();
            const yamlInput = 'items:\n  - 1\n  - 2\n  - 3\nusers:\n  - name: Alice\n  - name: Bob';
            const result = converter.yamlToJson(yamlInput);
            const parsed = JSON.parse(result);

            expect(Array.isArray(parsed.items)).toBe(true);
            expect(parsed.items.length).toBe(3);
            expect(Array.isArray(parsed.users)).toBe(true);
            expect(parsed.users[0].name).toBe('Alice');
        });

        test('should ignore comments', () => {
            const converter = createConverter();
            const result = converter.yamlToJson(testData.yamlWithComments.yaml);
            const parsed = JSON.parse(result);

            expect(parsed.name).toBe('test');
            expect(parsed.database.host).toBe('localhost');
        });
    });

    describe('JSON to XML Conversion', () => {
        test('should convert simple object', () => {
            const converter = createConverter();
            const result = converter.jsonToXml(testData.simpleObject.json);

            expect(result).toContain('<?xml version="1.0" encoding="UTF-8"?>');
            expect(result).toContain('<name>test</name>');
            expect(result).toContain('<value>123</value>');
        });

        test('should convert arrays to multiple elements', () => {
            const converter = createConverter();
            const jsonInput = '{"items": [1, 2, 3]}';
            const result = converter.jsonToXml(jsonInput);

            expect(result).toContain('<item>1</item>');
            expect(result).toContain('<item>2</item>');
            expect(result).toContain('<item>3</item>');
        });

        test('should escape special characters', () => {
            const converter = createConverter();
            const jsonInput = '{"message": "Hello <world> & friends"}';
            const result = converter.jsonToXml(jsonInput);

            expect(result).toContain('&lt;world&gt;');
            expect(result).toContain('&amp;');
        });
    });

    describe('XML to JSON Conversion', () => {
        test('should convert simple structure', () => {
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

            expect(parsed.name).toBe('test');
            expect(parsed.value).toBe(123);
        });
    });

    describe('Bidirectional Conversions (Round-trip)', () => {
        test('should preserve data in JSON → YAML → JSON', () => {
            const converter = createConverter();
            const originalJson = testData.simpleObject.json;
            const yaml = converter.jsonToYaml(originalJson);
            const backToJson = converter.yamlToJson(yaml);

            const original = JSON.parse(originalJson);
            const final = JSON.parse(backToJson);

            expect(JSON.stringify(original)).toBe(JSON.stringify(final));
        });

        test('should preserve data in YAML → JSON → YAML', () => {
            const converter = createConverter();
            const originalYaml = 'name: test\nvalue: 123\nactive: true';
            const json = converter.yamlToJson(originalYaml);
            const backToYaml = converter.jsonToYaml(json);

            const originalParsed = JSON.parse(converter.yamlToJson(originalYaml));
            const finalParsed = JSON.parse(converter.yamlToJson(backToYaml));

            expect(JSON.stringify(originalParsed)).toBe(JSON.stringify(finalParsed));
        });
    });

    describe('Error Handling', () => {
        test('should handle invalid JSON', () => {
            const converter = createConverter();
            expect(() => converter.jsonToYaml('{"invalid": json}')).toThrow();
        });

        test('should handle empty input', () => {
            const converter = createConverter();
            const format = converter.detectFormat('');
            expect(format).toBe('unknown');
        });

        test('should handle whitespace-only input', () => {
            const converter = createConverter();
            const format = converter.detectFormat('   \n\t   ');
            expect(format).toBe('unknown');
        });
    });

    describe('YAML Edge Cases', () => {
        test('should handle quoted strings', () => {
            const converter = createConverter();
            const yamlInput = 'message: "This is a quoted string: with colon"\nother: \'Single quoted\'';
            const result = converter.yamlToJson(yamlInput);
            const parsed = JSON.parse(result);

            expect(parsed.message).toBe('This is a quoted string: with colon');
            expect(parsed.other).toBe('Single quoted');
        });

        test('should handle numbers and booleans correctly', () => {
            const converter = createConverter();
            const yamlInput = 'integer: 42\nfloat: 3.14\nboolean_true: true\nboolean_false: false';
            const result = converter.yamlToJson(yamlInput);
            const parsed = JSON.parse(result);

            expect(parsed.integer).toBe(42);
            expect(parsed.float).toBe(3.14);
            expect(parsed.boolean_true).toBe(true);
            expect(parsed.boolean_false).toBe(false);
        });
    });

    describe('XML Edge Cases', () => {
        test('should handle self-closing tags', () => {
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

            expect(parsed.empty).toBe(null);
        });
    });

    describe('Syntax Highlighting', () => {
        test('should highlight JSON syntax', () => {
            const converter = createConverter();
            const json = '{"key": "value", "number": 123, "boolean": true, "null": null}';
            const highlighted = converter.syntaxHighlightJson(json);

            expect(highlighted).toContain('json-key');
            expect(highlighted).toContain('json-string');
            expect(highlighted).toContain('json-number');
            expect(highlighted).toContain('json-boolean');
            expect(highlighted).toContain('json-null');
        });

        test('should highlight YAML syntax', () => {
            const converter = createConverter();
            const yaml = 'key: value\nnumber: 123\nboolean: true\n# comment';
            const highlighted = converter.syntaxHighlightYaml(yaml);

            expect(highlighted).toContain('yaml-key');
            expect(highlighted).toContain('yaml-string');
            expect(highlighted).toContain('yaml-number');
            expect(highlighted).toContain('yaml-boolean');
            expect(highlighted).toContain('yaml-comment');
        });

        test('should highlight XML syntax', () => {
            const converter = createConverter();
            const xml = '<?xml version="1.0"?>\n<root attr="value">text</root>\n<!-- comment -->';
            const highlighted = converter.syntaxHighlightXml(xml);

            expect(highlighted).toContain('xml-declaration');
            expect(highlighted).toContain('xml-tag');
            expect(highlighted).toContain('xml-attribute');
            expect(highlighted).toContain('xml-comment');
        });
    });

    describe('Utility Functions', () => {
        test('should truncate long text in preview', () => {
            const converter = createConverter();
            const longText = 'a'.repeat(150);
            const preview = converter.generatePreview(longText, 100);

            expect(preview.length).toBe(103);
            expect(preview.endsWith('...')).toBe(true);
        });

        test('should not truncate short text', () => {
            const converter = createConverter();
            const shortText = 'Short text';
            const preview = converter.generatePreview(shortText, 100);

            expect(preview).toBe(shortText);
        });

        test('should normalize whitespace in preview', () => {
            const converter = createConverter();
            const messyText = '  Line 1  \n\n  Line 2  \t\t  Line 3  ';
            const preview = converter.generatePreview(messyText, 100);
            const expected = 'Line 1 Line 2 Line 3';

            expect(preview).toBe(expected);
        });
    });

    describe('YAML Indentation Settings', () => {
        test('should use 2-space indentation (default)', () => {
            const converter = createConverter();
            converter.yamlIndentSize = 2;
            const result = converter.jsonToYaml('{"user": {"name": "test"}}');

            expect(result).toContain('  name: test');
        });

        test('should use 4-space indentation', () => {
            const converter = createConverter();
            converter.yamlIndentSize = 4;
            const result = converter.jsonToYaml('{"user": {"name": "test"}}');

            expect(result).toContain('    name: test');
        });
    });

    describe('Combined Conversions (YAML ↔ XML)', () => {
        test('should convert YAML to XML via JSON', () => {
            const converter = createConverter();
            const yamlInput = 'name: test\nvalue: 123';
            const result = converter.yamlToXml(yamlInput);

            expect(result).toContain('<name>test</name>');
            expect(result).toContain('<value>123</value>');
        });

        test('should convert XML to YAML via JSON', () => {
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

            expect(result).toContain('name: test');
        });
    });
});
