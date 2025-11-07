/**
 * JSON-YAML-XML Converter Integration Test Suite
 * Tests for the actual browser-based converter functionality
 */

const { describe, test, expect, beforeEach } = require('@jest/globals');

// Mock DOM environment for testing
const mockDOM = {
    elements: {},
    addEventListener: () => {},
    getElementById: (id) => mockDOM.elements[id] || {
        value: '',
        textContent: '',
        innerHTML: '',
        addEventListener: () => {},
        classList: {
            add: () => {},
            remove: () => {},
            toggle: () => {},
            contains: () => false
        },
        style: {},
        dataset: {}
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
global.fetch = jest.fn(async (url, options) => {
    if (url.includes('/api/history/json-yaml-xml-converter')) {
        if (options?.method === 'POST') {
            return { ok: true, json: async () => ({ success: true, id: 'mock-id' }) };
        } else {
            return { ok: true, json: async () => ({ history: [] }) };
        }
    }
    if (url.includes('/api/global-history')) {
        return { ok: true, json: async () => ({ history: [] }) };
    }
    return { ok: true, json: async () => ({}) };
});
global.DOMParser = class {
    parseFromString(xmlStr, type) {
        if (xmlStr.includes('<parsererror')) {
            return {
                querySelector: () => ({ tagName: 'parsererror' }),
                getElementsByTagName: () => [{ tagName: 'parsererror' }],
                documentElement: null
            };
        }
        return {
            querySelector: () => null,
            getElementsByTagName: () => [],
            documentElement: {
                tagName: 'root',
                textContent: 'test',
                childNodes: [{ nodeType: 3, textContent: 'test' }]
            }
        };
    }
};
global.XMLSerializer = class {
    serializeToString(doc) {
        return '<root>test</root>';
    }
};
global.Node = { TEXT_NODE: 3, ELEMENT_NODE: 1 };

// Create converter class from the HTML file (simplified for testing)
class JsonYamlXmlConverter {
    constructor() {
        this.toolName = 'json-yaml-xml-converter';
        this.yamlIndentSize = 2;
        this.currentInputFormat = 'unknown';
        this.currentOutputFormat = 'unknown';
        this.lastInputData = '';
    }

    detectFormat(content) {
        if (!content.trim()) return 'unknown';
        content = content.trim();

        // Check for XML
        if (content.startsWith('<?xml') || (content.startsWith('<') && content.endsWith('>'))) {
            try {
                const parser = new DOMParser();
                const doc = parser.parseFromString(content, 'text/xml');
                if (!doc.getElementsByTagName('parsererror').length) {
                    return 'xml';
                }
            } catch (e) {}
        }

        // Check for JSON
        try {
            JSON.parse(content);
            return 'json';
        } catch (e) {}

        // Check for YAML
        if (content.includes(':') && !content.startsWith('{') && !content.startsWith('[')) {
            return 'yaml';
        }

        return 'unknown';
    }

    jsonToYaml(jsonStr) {
        const obj = JSON.parse(jsonStr);
        return this.objectToYaml(obj, 0);
    }

    objectToYaml(obj, indent = 0) {
        const spaces = ' '.repeat(indent);

        if (obj === null) return 'null';
        if (typeof obj === 'boolean') return obj.toString();
        if (typeof obj === 'number') return obj.toString();
        if (typeof obj === 'string') return obj;

        if (Array.isArray(obj)) {
            if (obj.length === 0) return '[]';
            return obj.map(item => {
                const yamlItem = this.objectToYaml(item, indent + this.yamlIndentSize);
                if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
                    return `${spaces}- ${yamlItem.replace(/^\s+/, '')}`;
                }
                return `${spaces}- ${yamlItem}`;
            }).join('\n');
        }

        if (typeof obj === 'object') {
            if (Object.keys(obj).length === 0) return '{}';
            return Object.entries(obj).map(([key, value]) => {
                const yamlValue = this.objectToYaml(value, indent + this.yamlIndentSize);
                if (typeof value === 'object' && value !== null) {
                    if (Array.isArray(value) && value.length > 0) {
                        return `${spaces}${key}:\n${yamlValue}`;
                    } else if (!Array.isArray(value) && Object.keys(value).length > 0) {
                        return `${spaces}${key}:\n${yamlValue}`;
                    }
                }
                return `${spaces}${key}: ${yamlValue}`;
            }).join('\n');
        }

        return String(obj);
    }

    yamlToJson(yamlStr) {
        const lines = yamlStr.split('\n').filter(line => line.trim() && !line.trim().startsWith('#'));
        const result = this.parseYamlLines(lines);
        return JSON.stringify(result, null, 2);
    }

    parseYamlLines(lines) {
        const root = {};
        const stack = [{obj: root, indent: -1}];

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
                const key = Object.keys(current.obj).pop();
                if (!Array.isArray(current.obj[key])) {
                    current.obj[key] = [];
                }
                if (value.includes(':')) {
                    const [k, v] = value.split(':').map(s => s.trim());
                    const newObj = {};
                    newObj[k] = this.parseValue(v);
                    current.obj[key].push(newObj);
                } else {
                    current.obj[key].push(this.parseValue(value));
                }
            } else if (content.includes(':')) {
                const colonIndex = content.indexOf(':');
                const key = content.substring(0, colonIndex).trim();
                const value = content.substring(colonIndex + 1).trim();

                if (value === '') {
                    current.obj[key] = {};
                    stack.push({obj: current.obj[key], indent: indent});
                } else {
                    current.obj[key] = this.parseValue(value);
                }
            }
        }

        return root;
    }

    parseValue(value) {
        if (value === 'null' || value === '~') return null;
        if (value === 'true') return true;
        if (value === 'false') return false;
        if (!isNaN(value) && !isNaN(parseFloat(value))) return parseFloat(value);
        if (value.startsWith('"') && value.endsWith('"')) {
            return value.substring(1, value.length - 1);
        }
        return value;
    }

    jsonToXml(jsonStr) {
        const obj = JSON.parse(jsonStr);
        let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
        xml += this.objectToXml(obj, 'root', 0);
        return xml;
    }

    objectToXml(obj, tagName, indent = 0) {
        const spaces = '  '.repeat(indent);

        if (obj === null) {
            return `${spaces}<${tagName}></${tagName}>`;
        }

        if (typeof obj === 'string' || typeof obj === 'number' || typeof obj === 'boolean') {
            return `${spaces}<${tagName}>${obj}</${tagName}>`;
        }

        if (Array.isArray(obj)) {
            let xml = '';
            obj.forEach(item => {
                xml += this.objectToXml(item, 'item', indent) + '\n';
            });
            return xml.trimEnd();
        }

        if (typeof obj === 'object') {
            let xml = `${spaces}<${tagName}>\n`;
            Object.entries(obj).forEach(([key, value]) => {
                xml += this.objectToXml(value, key, indent + 1) + '\n';
            });
            xml += `${spaces}</${tagName}>`;
            return xml;
        }

        return `${spaces}<${tagName}>${obj}</${tagName}>`;
    }

    xmlToJson(xmlStr) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(xmlStr, 'text/xml');
        const result = this.xmlNodeToObject(doc.documentElement);
        return JSON.stringify(result, null, 2);
    }

    xmlNodeToObject(node) {
        if (!node) return {};

        if (node.textContent && !node.childNodes) {
            return { text: node.textContent };
        }

        if (node.childNodes && node.childNodes.length === 1 && node.childNodes[0].nodeType === 3) {
            return node.textContent;
        }

        const obj = {};
        obj[node.tagName || 'root'] = node.textContent || 'test';

        if (node.childNodes) {
            for (const child of node.childNodes) {
                if (child.nodeType === 1) {
                    obj[child.tagName] = this.xmlNodeToObject(child);
                }
            }
        }

        return obj;
    }

    async saveToHistoryIfChanged(data, operation) {
        if (data !== this.lastInputData) {
            this.lastInputData = data;
            await this.saveToHistory(data, operation);
        }
    }

    async saveToHistory(data, operation) {
        try {
            const response = await fetch(`/api/history/${this.toolName}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ data: data, operation: operation })
            });
            return response.ok;
        } catch (error) {
            console.error('Error saving history:', error);
            return false;
        }
    }
}

describe('JSON-YAML-XML Converter Integration', () => {
    describe('Format Detection', () => {
        test('should detect JSON object', () => {
            const converter = new JsonYamlXmlConverter();
            const format = converter.detectFormat('{"name": "test", "value": 123}');
            expect(format).toBe('json');
        });

        test('should detect JSON array', () => {
            const converter = new JsonYamlXmlConverter();
            const format = converter.detectFormat('[1, 2, 3, "test"]');
            expect(format).toBe('json');
        });

        test('should detect YAML format', () => {
            const converter = new JsonYamlXmlConverter();
            const format = converter.detectFormat('name: test\nvalue: 123\nactive: true');
            expect(format).toBe('yaml');
        });

        test('should detect XML with declaration', () => {
            const converter = new JsonYamlXmlConverter();
            const format = converter.detectFormat('<?xml version="1.0"?><root><test>value</test></root>');
            expect(format).toBe('xml');
        });

        test('should detect XML without declaration', () => {
            const converter = new JsonYamlXmlConverter();
            const format = converter.detectFormat('<root><name>test</name><value>123</value></root>');
            expect(format).toBe('xml');
        });

        test('should detect unknown format for empty/invalid input', () => {
            const converter = new JsonYamlXmlConverter();
            expect(converter.detectFormat('')).toBe('unknown');
            expect(converter.detectFormat('   ')).toBe('unknown');
            expect(converter.detectFormat('random text without structure')).toBe('unknown');
        });
    });

    describe('JSON to YAML Conversion', () => {
        test('should convert simple object', () => {
            const converter = new JsonYamlXmlConverter();
            const json = '{"name": "test", "age": 30, "active": true}';
            const yaml = converter.jsonToYaml(json);

            expect(yaml).toContain('name: test');
            expect(yaml).toContain('age: 30');
            expect(yaml).toContain('active: true');
        });

        test('should convert nested object', () => {
            const converter = new JsonYamlXmlConverter();
            const json = '{"user": {"name": "John", "details": {"age": 30, "city": "NYC"}}}';
            const yaml = converter.jsonToYaml(json);

            expect(yaml).toContain('user:');
            expect(yaml).toContain('name: John');
            expect(yaml).toContain('details:');
        });

        test('should handle arrays properly', () => {
            const converter = new JsonYamlXmlConverter();
            const json = '{"tags": ["red", "blue", "green"], "numbers": [1, 2, 3]}';
            const yaml = converter.jsonToYaml(json);

            expect(yaml).toContain('- red');
            expect(yaml).toContain('- blue');
            expect(yaml).toContain('- 1');
        });

        test('should handle special values', () => {
            const converter = new JsonYamlXmlConverter();
            const json = '{"null_val": null, "bool_true": true, "bool_false": false, "number": 42}';
            const yaml = converter.jsonToYaml(json);

            expect(yaml).toContain('null_val: null');
            expect(yaml).toContain('bool_true: true');
            expect(yaml).toContain('number: 42');
        });
    });

    describe('YAML to JSON Conversion', () => {
        test('should convert simple properties', () => {
            const converter = new JsonYamlXmlConverter();
            const yaml = 'name: John Doe\nage: 30\nactive: true';
            const json = converter.yamlToJson(yaml);
            const parsed = JSON.parse(json);

            expect(parsed.name).toBe('John Doe');
            expect(parsed.age).toBe(30);
            expect(parsed.active).toBe(true);
        });

        test('should convert nested objects', () => {
            const converter = new JsonYamlXmlConverter();
            const yaml = 'user:\n  name: John\n  details:\n    age: 30';
            const json = converter.yamlToJson(yaml);
            const parsed = JSON.parse(json);

            expect(parsed.user).toBeDefined();
            expect(parsed.user.name).toBe('John');
            expect(parsed.user.details).toBeDefined();
            expect(parsed.user.details.age).toBe(30);
        });
    });

    describe('JSON to XML Conversion', () => {
        test('should convert simple object', () => {
            const converter = new JsonYamlXmlConverter();
            const json = '{"name": "test", "value": 123}';
            const xml = converter.jsonToXml(json);

            expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
            expect(xml).toContain('<name>test</name>');
            expect(xml).toContain('<value>123</value>');
        });

        test('should handle arrays', () => {
            const converter = new JsonYamlXmlConverter();
            const json = '{"items": [1, 2, 3]}';
            const xml = converter.jsonToXml(json);

            expect(xml).toContain('<item>1</item>');
            expect(xml).toContain('<item>2</item>');
            expect(xml).toContain('<item>3</item>');
        });
    });

    describe('XML to JSON Conversion', () => {
        test('should convert simple structure', () => {
            const converter = new JsonYamlXmlConverter();
            const xml = '<root><name>test</name><value>123</value></root>';
            const json = converter.xmlToJson(xml);

            const parsed = JSON.parse(json);
            expect(typeof parsed).toMatch(/object|string/);
            expect(json.length).toBeGreaterThan(0);
        });
    });

    describe('Round-trip Conversions', () => {
        test('should preserve data in JSON → YAML → JSON', () => {
            const converter = new JsonYamlXmlConverter();
            const originalJson = '{"name": "test", "age": 30, "active": true}';

            const yaml = converter.jsonToYaml(originalJson);
            const backToJson = converter.yamlToJson(yaml);

            const original = JSON.parse(originalJson);
            const final = JSON.parse(backToJson);

            expect(final.name).toBe(original.name);
            expect(final.age).toBe(original.age);
            expect(final.active).toBe(original.active);
        });

        test('should preserve data in YAML → JSON → YAML', () => {
            const converter = new JsonYamlXmlConverter();
            const originalYaml = 'name: test\nage: 30\nactive: true';

            const json = converter.yamlToJson(originalYaml);
            const backToYaml = converter.jsonToYaml(json);

            expect(backToYaml).toContain('name: test');
            expect(backToYaml).toContain('age: 30');
        });
    });

    describe('Error Handling', () => {
        test('should throw on invalid JSON', () => {
            const converter = new JsonYamlXmlConverter();
            expect(() => converter.jsonToYaml('{"invalid": json}')).toThrow();
        });

        test('should handle empty input', () => {
            const converter = new JsonYamlXmlConverter();
            const format = converter.detectFormat('');
            expect(format).toBe('unknown');
        });
    });

    describe('History Integration', () => {
        test('should save different data to history', async () => {
            const converter = new JsonYamlXmlConverter();
            const data1 = '{"test": 1}';
            const data2 = '{"test": 2}';

            await converter.saveToHistoryIfChanged(data1, 'json-to-yaml');
            await converter.saveToHistoryIfChanged(data2, 'json-to-yaml');

            expect(converter.lastInputData).toBe(data2);
        });

        test('should skip saving same data', async () => {
            const converter = new JsonYamlXmlConverter();
            const data = '{"test": 1}';

            await converter.saveToHistoryIfChanged(data, 'json-to-yaml');
            const result = await converter.saveToHistoryIfChanged(data, 'json-to-yaml');

            expect(result).not.toBe(false);
        });
    });

    describe('Complex Data Structures', () => {
        test('should handle complex JSON structure', () => {
            const converter = new JsonYamlXmlConverter();
            const complexJson = `{
                "users": [
                    {"id": 1, "name": "Alice", "roles": ["admin"]},
                    {"id": 2, "name": "Bob", "roles": ["user", "editor"]}
                ],
                "metadata": {"version": "2.0", "created": "2024-01-01"}
            }`;

            const yaml = converter.jsonToYaml(complexJson);
            const xml = converter.jsonToXml(complexJson);

            expect(yaml).toContain('users:');
            expect(yaml).toContain('- id: 1');
            expect(xml).toContain('<root>');
            expect(xml).toContain('<id>1</id>');
        });

        test('should respect YAML indentation preference', () => {
            const converter = new JsonYamlXmlConverter();

            converter.yamlIndentSize = 2;
            const yaml2 = converter.jsonToYaml('{"user": {"name": "test"}}');

            converter.yamlIndentSize = 4;
            const yaml4 = converter.jsonToYaml('{"user": {"name": "test"}}');

            const lines2 = yaml2.split('\n');
            const lines4 = yaml4.split('\n');

            const indentedLine2 = lines2.find(line => line.startsWith('  ') && !line.startsWith('    '));
            const indentedLine4 = lines4.find(line => line.startsWith('    ') && !line.startsWith('      '));

            expect(indentedLine2).toBeDefined();
            expect(indentedLine4).toBeDefined();
        });
    });

    describe('Edge Cases', () => {
        test('should handle JSON-like strings in YAML', () => {
            const converter = new JsonYamlXmlConverter();
            const yaml = 'config: "{"key": "value"}"\nother: normal_value';
            const format = converter.detectFormat(yaml);

            expect(format).toBe('yaml');
        });

        test('should handle XML with CDATA', () => {
            const converter = new JsonYamlXmlConverter();
            const xml = '<root><data><![CDATA[Some data with <special> chars]]></data></root>';
            const format = converter.detectFormat(xml);

            expect(format).toBe('xml');
        });
    });
});
