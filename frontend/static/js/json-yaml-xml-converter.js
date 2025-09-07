/**
 * JSON-YAML-XML Converter v2
 * Bidirectional conversion between JSON, YAML, and XML formats
 */

class JsonYamlXmlConverter {
    constructor() {
        this.yamlIndentSize = 2;
        this.currentInputFormat = 'unknown';
        this.currentOutputFormat = 'unknown';
        this.history = [];
        this.maxHistoryItems = 40; // From config.json
        
        this.examples = {
            json: `{
  "users": [
    {
      "id": 1,
      "name": "John Doe",
      "email": "john@example.com",
      "active": true,
      "roles": ["admin", "user"],
      "settings": {
        "theme": "dark",
        "notifications": true
      }
    },
    {
      "id": 2,
      "name": "Jane Smith",
      "email": "jane@example.com",
      "active": false,
      "roles": ["user"],
      "settings": null
    }
  ],
  "metadata": {
    "total": 2,
    "version": "1.0"
  }
}`,
            yaml: `users:
  - id: 1
    name: John Doe
    email: john@example.com
    active: true
    roles:
      - admin
      - user
    settings:
      theme: dark
      notifications: true
  - id: 2
    name: Jane Smith
    email: jane@example.com
    active: false
    roles:
      - user
    settings: null
metadata:
  total: 2
  version: "1.0"`,
            xml: `<?xml version="1.0" encoding="UTF-8"?>
<root>
  <users>
    <user>
      <id>1</id>
      <name>John Doe</name>
      <email>john@example.com</email>
      <active>true</active>
      <roles>
        <role>admin</role>
        <role>user</role>
      </roles>
      <settings>
        <theme>dark</theme>
        <notifications>true</notifications>
      </settings>
    </user>
    <user>
      <id>2</id>
      <name>Jane Smith</name>
      <email>jane@example.com</email>
      <active>false</active>
      <roles>
        <role>user</role>
      </roles>
      <settings></settings>
    </user>
  </users>
  <metadata>
    <total>2</total>
    <version>1.0</version>
  </metadata>
</root>`
        };
        
        this.init();
        this.loadHistory();
    }

    init() {
        this.bindEvents();
        this.updateCharCount();
        this.updateFormatIndicators();
    }

    bindEvents() {
        // Main conversion buttons
        document.getElementById('convertToJson').addEventListener('click', () => this.convertTo('json'));
        document.getElementById('convertToYaml').addEventListener('click', () => this.convertTo('yaml'));
        document.getElementById('convertToXml').addEventListener('click', () => this.convertTo('xml'));
        
        // Utility buttons
        document.getElementById('formatBtn').addEventListener('click', () => this.formatCurrent());
        document.getElementById('swapBtn').addEventListener('click', () => this.swapContent());
        document.getElementById('clearBtn').addEventListener('click', () => this.clearAll());
        document.getElementById('copyBtn').addEventListener('click', () => this.copyOutput());
        
        // Example buttons
        document.getElementById('jsonExampleBtn').addEventListener('click', () => this.loadExample('json'));
        document.getElementById('yamlExampleBtn').addEventListener('click', () => this.loadExample('yaml'));
        
        // Settings
        document.getElementById('yamlIndent').addEventListener('change', () => this.updateYamlPreference());
        
        // Input handling
        const inputArea = document.getElementById('inputArea');
        inputArea.addEventListener('input', () => {
            this.updateCharCount();
            clearTimeout(this.detectTimer);
            this.detectTimer = setTimeout(() => this.autoDetectFormat(), 500);
        });

        // History buttons
        document.getElementById('historyBtn').addEventListener('click', () => this.showHistory());
        document.getElementById('globalHistoryBtn').addEventListener('click', () => this.showGlobalHistory());
        
        // History modal events
        this.setupHistoryModals();
    }

    setupHistoryModals() {
        // Local history modal
        const historyModal = document.getElementById('historyModal');
        const closeHistoryModal = document.getElementById('closeHistoryModal');
        const clearHistoryBtn = document.getElementById('clearHistoryBtn');

        closeHistoryModal.addEventListener('click', () => {
            historyModal.style.display = 'none';
        });

        clearHistoryBtn.addEventListener('click', () => {
            this.clearHistory();
            this.renderHistory();
        });

        // Global history modal
        const globalHistoryModal = document.getElementById('globalHistoryModal');
        const closeGlobalHistoryModal = document.getElementById('closeGlobalHistoryModal');

        closeGlobalHistoryModal.addEventListener('click', () => {
            globalHistoryModal.style.display = 'none';
        });

        // Close modals when clicking outside
        window.addEventListener('click', (event) => {
            if (event.target === historyModal) {
                historyModal.style.display = 'none';
            }
            if (event.target === globalHistoryModal) {
                globalHistoryModal.style.display = 'none';
            }
        });
    }

    loadExample(format) {
        const inputArea = document.getElementById('inputArea');
        inputArea.value = this.examples[format];
        this.currentInputFormat = format;
        this.updateFormatIndicators();
        this.updateCharCount();
        this.updateStatus(`${format.toUpperCase()} example loaded - try converting to other formats`, 'success');
    }

    convertTo(targetFormat) {
        const input = document.getElementById('inputArea').value.trim();
        const output = document.getElementById('outputArea');
        
        if (!input) {
            this.updateStatus('Please enter some content to convert', 'warning');
            return;
        }

        try {
            const inputFormat = this.detectFormat(input);
            
            if (inputFormat === 'unknown') {
                this.updateStatus('Could not detect input format', 'error');
                return;
            }

            let result = '';
            let highlightedResult = '';

            // If same format, just format it nicely
            if (inputFormat === targetFormat) {
                if (targetFormat === 'json') {
                    const parsed = JSON.parse(input);
                    result = JSON.stringify(parsed, null, 2);
                    highlightedResult = this.syntaxHighlightJson(result);
                } else if (targetFormat === 'yaml') {
                    const jsonResult = this.yamlToJson(input);
                    const parsed = JSON.parse(jsonResult);
                    result = this.objectToYaml(parsed, 0);
                    highlightedResult = this.syntaxHighlightYaml(result);
                } else if (targetFormat === 'xml') {
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(input, 'text/xml');
                    const serializer = new XMLSerializer();
                    result = this.formatXml(serializer.serializeToString(doc));
                    highlightedResult = this.syntaxHighlightXml(result);
                }
                this.updateStatus(`${targetFormat.toUpperCase()} formatted`, 'success');
            } else {
                // Convert between formats
                if (inputFormat === 'json' && targetFormat === 'yaml') {
                    result = this.jsonToYaml(input);
                    highlightedResult = this.syntaxHighlightYaml(result);
                } else if (inputFormat === 'yaml' && targetFormat === 'json') {
                    result = this.yamlToJson(input);
                    highlightedResult = this.syntaxHighlightJson(result);
                } else if (inputFormat === 'json' && targetFormat === 'xml') {
                    result = this.jsonToXml(input);
                    highlightedResult = this.syntaxHighlightXml(result);
                } else if (inputFormat === 'xml' && targetFormat === 'json') {
                    result = this.xmlToJson(input);
                    highlightedResult = this.syntaxHighlightJson(result);
                } else if (inputFormat === 'yaml' && targetFormat === 'xml') {
                    result = this.yamlToXml(input);
                    highlightedResult = this.syntaxHighlightXml(result);
                } else if (inputFormat === 'xml' && targetFormat === 'yaml') {
                    result = this.xmlToYaml(input);
                    highlightedResult = this.syntaxHighlightYaml(result);
                }
                this.updateStatus(`Converted ${inputFormat.toUpperCase()} to ${targetFormat.toUpperCase()}`, 'success');
            }

            output.innerHTML = `<div class="syntax-${targetFormat}">${highlightedResult}</div>`;
            this.currentInputFormat = inputFormat;
            this.currentOutputFormat = targetFormat;
            this.updateFormatIndicators();

            // Add to history
            this.addToHistory({
                input: input,
                output: result,
                inputFormat: inputFormat,
                outputFormat: targetFormat,
                timestamp: new Date().toISOString()
            });

            // Add to global history
            this.addToGlobalHistory('json-yaml-xml-converter', {
                action: `Convert ${inputFormat.toUpperCase()} to ${targetFormat.toUpperCase()}`,
                inputPreview: this.generatePreview(input),
                outputPreview: this.generatePreview(result),
                formats: `${inputFormat} → ${targetFormat}`
            });

        } catch (error) {
            output.innerHTML = `<div class="error-display">Error: ${error.message}</div>`;
            this.updateStatus('Conversion error', 'error');
        }
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
            } catch (e) {
                // Continue to other checks
            }
        }

        // Check for JSON
        try {
            JSON.parse(content);
            return 'json';
        } catch (e) {
            // Continue to YAML check
        }

        // Check for YAML
        if (content.includes(':') && !content.startsWith('{') && !content.startsWith('[')) {
            return 'yaml';
        }

        return 'unknown';
    }

    autoDetectFormat() {
        const input = document.getElementById('inputArea').value.trim();
        if (!input) return;

        const detectedFormat = this.detectFormat(input);
        if (detectedFormat !== 'unknown' && detectedFormat !== this.currentInputFormat) {
            this.currentInputFormat = detectedFormat;
            this.updateFormatIndicators();
        }
    }

    // JSON to YAML conversion
    jsonToYaml(jsonStr) {
        const obj = JSON.parse(jsonStr);
        return this.objectToYaml(obj, 0);
    }

    objectToYaml(obj, indent = 0) {
        const spaces = ' '.repeat(indent);
        
        if (obj === null) return 'null';
        if (typeof obj === 'boolean') return obj.toString();
        if (typeof obj === 'number') return obj.toString();
        if (typeof obj === 'string') {
            if (obj.includes('\n') || obj.includes(':') || obj.includes('#') ||
                obj.match(/^\s/) || obj.match(/\s$/) || obj === '' ||
                obj.toLowerCase() === 'true' || obj.toLowerCase() === 'false' ||
                obj.toLowerCase() === 'null' || !isNaN(obj)) {
                return `"${obj.replace(/"/g, '\\"')}"`;
            }
            return obj;
        }

        if (Array.isArray(obj)) {
            if (obj.length === 0) return '[]';
            return obj.map(item => {
                const yamlItem = this.objectToYaml(item, indent + this.yamlIndentSize);
                if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
                    return `${spaces}- ${yamlItem.substring(this.yamlIndentSize)}`;
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

    // YAML to JSON conversion
    yamlToJson(yamlStr) {
        const lines = yamlStr.split('\n');
        const result = this.parseYamlLines(lines);
        return JSON.stringify(result, null, 2);
    }

    parseYamlLines(lines) {
        const root = {};
        const stack = [{obj: root, indent: -1, isArray: false}];
        let currentArrayKey = null;
        
        for (let i = 0; i < lines.length; i++) {
            let line = lines[i].replace(/\r$/, '');
            if (!line.trim() || line.trim().startsWith('#')) continue;
            
            const indent = line.search(/\S/);
            const content = line.trim();
            
            // Pop stack for decreasing indentation
            while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
                stack.pop();
            }
            
            const current = stack[stack.length - 1];
            
            if (content.startsWith('- ')) {
                const value = content.substring(2).trim();
                
                // Create array if it doesn't exist
                if (currentArrayKey && !Array.isArray(current.obj[currentArrayKey])) {
                    current.obj[currentArrayKey] = [];
                }
                
                let targetArray = current.isArray ? current.obj : current.obj[currentArrayKey];
                
                if (value === '') {
                    // Array item that will have nested properties
                    const newObj = {};
                    targetArray.push(newObj);
                    stack.push({obj: newObj, indent: indent, isArray: false});
                } else if (value.includes(':')) {
                    // Array item with inline key-value
                    const colonIndex = value.indexOf(':');
                    const key = value.substring(0, colonIndex).trim();
                    const val = value.substring(colonIndex + 1).trim();
                    const newObj = {};
                    newObj[key] = this.parseYamlValue(val);
                    targetArray.push(newObj);
                    stack.push({obj: newObj, indent: indent, isArray: false});
                } else {
                    // Simple array item
                    targetArray.push(this.parseYamlValue(value));
                }
            } else if (content.includes(':')) {
                const colonIndex = content.indexOf(':');
                let key = content.substring(0, colonIndex).trim();
                const value = content.substring(colonIndex + 1).trim();
                
                if (value === '') {
                    // Check if next lines are array items
                    let isNextArray = false;
                    for (let j = i + 1; j < lines.length; j++) {
                        const nextLine = lines[j].trim();
                        if (!nextLine || nextLine.startsWith('#')) continue;
                        const nextIndent = lines[j].search(/\S/);
                        if (nextIndent <= indent) break;
                        if (nextLine.startsWith('- ')) {
                            isNextArray = true;
                            break;
                        }
                        if (nextLine.includes(':')) break;
                    }
                    
                    if (isNextArray) {
                        current.obj[key] = [];
                        currentArrayKey = key;
                        stack.push({obj: current.obj[key], indent: indent, isArray: true});
                    } else {
                        current.obj[key] = {};
                        currentArrayKey = null;
                        stack.push({obj: current.obj[key], indent: indent, isArray: false});
                    }
                } else {
                    // Key with immediate value
                    current.obj[key] = this.parseYamlValue(value);
                }
            }
        }
        
        return root;
    }

    parseYamlValue(value) {
        if (value === 'null' || value === '~') return null;
        if (value === 'true') return true;
        if (value === 'false') return false;
        if (!isNaN(value) && !isNaN(parseFloat(value))) return parseFloat(value);
        if (value.startsWith('"') && value.endsWith('"')) {
            return value.substring(1, value.length - 1).replace(/\\"/g, '"');
        }
        if (value.startsWith("'") && value.endsWith("'")) {
            return value.substring(1, value.length - 1);
        }
        return value;
    }

    // JSON to XML conversion
    jsonToXml(jsonStr) {
        const obj = JSON.parse(jsonStr);
        let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
        xml += this.objectToXml(obj, 'root', 0);
        return xml;
    }

    objectToXml(obj, tagName, indent = 0) {
        const spaces = '  '.repeat(indent);

        if (obj === null || obj === undefined) {
            return `${spaces}<${tagName}></${tagName}>`;
        }

        if (typeof obj === 'string' || typeof obj === 'number' || typeof obj === 'boolean') {
            return `${spaces}<${tagName}>${this.escapeXml(String(obj))}</${tagName}>`;
        }

        if (Array.isArray(obj)) {
            if (obj.length === 0) {
                return `${spaces}<${tagName}></${tagName}>`;
            }

            let xml = '';
            obj.forEach(item => {
                xml += this.objectToXml(item, this.getArrayItemTagName(tagName), indent) + '\n';
            });
            return xml.trimEnd();
        }

        if (typeof obj === 'object') {
            if (Object.keys(obj).length === 0) {
                return `${spaces}<${tagName}></${tagName}>`;
            }

            let xml = `${spaces}<${tagName}>\n`;
            Object.entries(obj).forEach(([key, value]) => {
                xml += this.objectToXml(value, key, indent + 1) + '\n';
            });
            xml += `${spaces}</${tagName}>`;
            return xml;
        }

        return `${spaces}<${tagName}>${this.escapeXml(String(obj))}</${tagName}>`;
    }

    getArrayItemTagName(parentTag) {
        if (parentTag.endsWith('s')) {
            return parentTag.slice(0, -1);
        }
        return parentTag + '_item';
    }

    escapeXml(text) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#x27;');
    }

    // XML to JSON conversion
    xmlToJson(xmlStr) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(xmlStr, 'text/xml');

        const errorNode = doc.querySelector('parsererror');
        if (errorNode) {
            throw new Error('Invalid XML format');
        }

        const result = this.xmlNodeToObject(doc.documentElement);
        return JSON.stringify(result, null, 2);
    }

    xmlNodeToObject(node) {
        const obj = {};

        // Handle attributes
        if (node.attributes && node.attributes.length > 0) {
            obj['@attributes'] = {};
            for (let i = 0; i < node.attributes.length; i++) {
                const attr = node.attributes[i];
                obj['@attributes'][attr.name] = attr.value;
            }
        }

        // Handle child nodes
        const children = Array.from(node.childNodes);
        const textContent = children
            .filter(child => child.nodeType === Node.TEXT_NODE)
            .map(child => child.textContent.trim())
            .join('')
            .trim();

        const elementChildren = children.filter(child => child.nodeType === Node.ELEMENT_NODE);

        if (elementChildren.length === 0) {
            if (textContent) {
                return this.parseXmlValue(textContent);
            }
            return obj['@attributes'] ? obj : null;
        }

        // Group children by tag name
        const childGroups = {};
        elementChildren.forEach(child => {
            const tagName = child.tagName;
            if (!childGroups[tagName]) {
                childGroups[tagName] = [];
            }
            childGroups[tagName].push(this.xmlNodeToObject(child));
        });

        // Convert grouped children to object properties
        Object.entries(childGroups).forEach(([tagName, items]) => {
            if (items.length === 1) {
                obj[tagName] = items[0];
            } else {
                obj[tagName] = items;
            }
        });

        if (Object.keys(obj).length === 0 && textContent) {
            return this.parseXmlValue(textContent);
        }

        return obj;
    }

    parseXmlValue(value) {
        if (value === 'true') return true;
        if (value === 'false') return false;
        if (value === 'null') return null;
        if (!isNaN(value) && !isNaN(parseFloat(value))) return parseFloat(value);
        return value;
    }

    // Combined conversions
    yamlToXml(yamlStr) {
        const jsonStr = this.yamlToJson(yamlStr);
        return this.jsonToXml(jsonStr);
    }

    xmlToYaml(xmlStr) {
        const jsonStr = this.xmlToJson(xmlStr);
        const obj = JSON.parse(jsonStr);
        return this.objectToYaml(obj, 0);
    }

    // Syntax highlighting
    syntaxHighlightJson(json) {
        json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function (match) {
            let cls = 'json-number';
            if (/^"/.test(match)) {
                if (/:$/.test(match)) {
                    cls = 'json-key';
                } else {
                    cls = 'json-string';
                }
            } else if (/true|false/.test(match)) {
                cls = 'json-boolean';
            } else if (/null/.test(match)) {
                cls = 'json-null';
            }
            return '<span class="' + cls + '">' + match + '</span>';
        });
    }

    syntaxHighlightYaml(yaml) {
        yaml = yaml.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return yaml.split('\n').map(line => {
            line = line.replace(/(#.*)$/, '<span class="yaml-comment">$1</span>');
            line = line.replace(/^(\s*)([^:\s][^:]*?)(\s*:)(\s*)(.*)$/, function(match, indent, key, colon, space, value) {
                let highlightedValue = value;
                if (value.match(/^\s*(true|false)\s*$/)) {
                    highlightedValue = value.replace(/(true|false)/, '<span class="yaml-boolean">$1</span>');
                } else if (value.match(/^\s*null\s*$/)) {
                    highlightedValue = value.replace(/null/, '<span class="yaml-null">null</span>');
                } else if (value.match(/^\s*-?\d+(\.\d+)?\s*$/)) {
                    highlightedValue = value.replace(/(-?\d+(?:\.\d+)?)/, '<span class="yaml-number">$1</span>');
                } else if (value.match(/^\s*".*"\s*$/) || value.match(/^\s*'.*'\s*$/)) {
                    highlightedValue = value.replace(/(["'].*["'])/, '<span class="yaml-string">$1</span>');
                } else if (value.trim() && !value.includes('<span')) {
                    highlightedValue = value.replace(/(.+)/, '<span class="yaml-string">$1</span>');
                }
                return indent + '<span class="yaml-key">' + key + '</span>' + colon + space + highlightedValue;
            });
            line = line.replace(/^(\s*-\s+)(.*)$/, function(match, dash, value) {
                let highlightedValue = value;
                if (value.match(/^(true|false)$/)) {
                    highlightedValue = '<span class="yaml-boolean">' + value + '</span>';
                } else if (value.match(/^null$/)) {
                    highlightedValue = '<span class="yaml-null">null</span>';
                } else if (value.match(/^-?\d+(\.\d+)?$/)) {
                    highlightedValue = '<span class="yaml-number">' + value + '</span>';
                } else if (value.match(/^".*"$/) || value.match(/^'.*'$/)) {
                    highlightedValue = '<span class="yaml-string">' + value + '</span>';
                } else if (value.trim() && !value.includes('<span')) {
                    highlightedValue = '<span class="yaml-string">' + value + '</span>';
                }
                return '<span class="yaml-punctuation">' + dash + '</span>' + highlightedValue;
            });
            return line;
        }).join('\n');
    }

    syntaxHighlightXml(xml) {
        xml = xml.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        // Highlight XML declaration
        xml = xml.replace(/(&lt;\?xml[^&gt;]*\?&gt;)/g, '<span class="xml-declaration">$1</span>');

        // Highlight comments
        xml = xml.replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="xml-comment">$1</span>');

        // Highlight tags with attributes
        xml = xml.replace(/(&lt;\/?)([a-zA-Z_][\w\-]*)((?:\s+[a-zA-Z_][\w\-]*\s*=\s*"[^"]*")*)\s*(\/?&gt;)/g, function(match, openBracket, tagName, attributes, closeBracket) {
            let result = '<span class="xml-tag">' + openBracket + tagName;

            if (attributes) {
                result += attributes.replace(/([a-zA-Z_][\w\-]*)\s*=\s*("[^"]*")/g, function(attrMatch, attrName, attrValue) {
                    return ' <span class="xml-attribute">' + attrName + '</span>=<span class="xml-value">' + attrValue + '</span>';
                });
            }

            result += closeBracket + '</span>';
            return result;
        });

        return xml;
    }

    // Utility methods
    formatCurrent() {
        const input = document.getElementById('inputArea').value.trim();
        if (!input) return;

        const format = this.detectFormat(input);
        const inputArea = document.getElementById('inputArea');

        if (format === 'json') {
            try {
                const parsed = JSON.parse(input);
                const formatted = JSON.stringify(parsed, null, 2);
                inputArea.value = formatted;
                this.updateCharCount();
                this.updateStatus('JSON formatted', 'success');
            } catch (e) {
                this.updateStatus('Invalid JSON format', 'error');
            }
        } else if (format === 'xml') {
            try {
                const parser = new DOMParser();
                const doc = parser.parseFromString(input, 'text/xml');
                const serializer = new XMLSerializer();
                const formatted = this.formatXml(serializer.serializeToString(doc));
                inputArea.value = formatted;
                this.updateCharCount();
                this.updateStatus('XML formatted', 'success');
            } catch (e) {
                this.updateStatus('Invalid XML format', 'error');
            }
        }
    }

    formatXml(xml) {
        let formatted = '';
        let indent = 0;
        const tab = '  ';
        xml.split(/>\s*</).forEach(function(node) {
            if (node.match(/^\/\w/)) indent--;
            formatted += tab.repeat(indent) + '<' + node + '>\n';
            if (node.match(/^<?\w[^>]*[^\/]$/)) indent++;
        });
        return formatted.substring(1, formatted.length - 3);
    }

    swapContent() {
        const inputEl = document.getElementById('inputArea');
        const outputEl = document.getElementById('outputArea');
        const outputText = outputEl.textContent;
        
        if (!outputText.trim()) {
            this.updateStatus('No output content to swap', 'warning');
            return;
        }

        inputEl.value = outputText;
        outputEl.innerHTML = '';
        
        const temp = this.currentInputFormat;
        this.currentInputFormat = this.currentOutputFormat;
        this.currentOutputFormat = 'unknown';
        
        this.updateFormatIndicators();
        this.updateCharCount();
        this.updateStatus('Content swapped between panels', 'success');
    }

    clearAll() {
        document.getElementById('inputArea').value = '';
        document.getElementById('outputArea').innerHTML = '';
        this.currentInputFormat = 'unknown';
        this.currentOutputFormat = 'unknown';
        this.updateFormatIndicators();
        this.updateCharCount();
        this.updateStatus('Ready - Paste JSON, YAML, or XML to auto-detect format', 'info');
    }

    copyOutput() {
        const output = document.getElementById('outputArea');
        const text = output.textContent;
        
        if (!text.trim()) {
            this.updateStatus('No output content to copy', 'warning');
            return;
        }

        navigator.clipboard.writeText(text).then(() => {
            this.updateStatus('Copied to clipboard', 'success');
        }).catch(() => {
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = text;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            this.updateStatus('Copied to clipboard', 'success');
        });
    }

    updateYamlPreference() {
        this.yamlIndentSize = parseInt(document.getElementById('yamlIndent').value);
        const input = document.getElementById('inputArea').value.trim();
        if (input && this.currentInputFormat === 'json') {
            this.convertTo('yaml');
        }
    }

    updateCharCount() {
        const input = document.getElementById('inputArea').value;
        document.getElementById('charCount').textContent = `Characters: ${input.length}`;
    }

    updateFormatIndicators() {
        const inputIndicator = document.getElementById('inputFormat');
        const outputIndicator = document.getElementById('outputFormat');
        
        inputIndicator.textContent = this.currentInputFormat.toUpperCase();
        outputIndicator.textContent = this.currentOutputFormat.toUpperCase();
        
        // Update indicator classes
        inputIndicator.className = `format-indicator ${this.currentInputFormat}`;
        outputIndicator.className = `format-indicator ${this.currentOutputFormat}`;
    }

    updateStatus(message, type = 'info') {
        const statusText = document.getElementById('statusText');
        statusText.textContent = message;
        statusText.className = `status-${type}`;
    }

    generatePreview(text, maxLength = 100) {
        if (!text) return '';
        const normalized = text.replace(/\s+/g, ' ').trim();
        return normalized.length > maxLength ? 
            normalized.substring(0, maxLength) + '...' : normalized;
    }

    // History management
    addToHistory(item) {
        this.history.unshift(item);
        if (this.history.length > this.maxHistoryItems) {
            this.history = this.history.slice(0, this.maxHistoryItems);
        }
        this.saveHistory();
    }

    saveHistory() {
        try {
            localStorage.setItem('jsonYamlXmlConverter_history', JSON.stringify(this.history));
        } catch (error) {
            console.error('Error saving history:', error);
        }
    }

    loadHistory() {
        try {
            const saved = localStorage.getItem('jsonYamlXmlConverter_history');
            if (saved) {
                this.history = JSON.parse(saved);
            }
        } catch (error) {
            console.error('Error loading history:', error);
            this.history = [];
        }
    }

    clearHistory() {
        this.history = [];
        this.saveHistory();
    }

    showHistory() {
        const modal = document.getElementById('historyModal');
        modal.style.display = 'block';
        this.renderHistory();
    }

    renderHistory() {
        const container = document.getElementById('historyContent');
        
        if (this.history.length === 0) {
            container.innerHTML = '<div class="no-history">No conversion history available</div>';
            return;
        }

        container.innerHTML = this.history.map((item, index) => `
            <div class="history-item ${item.inputFormat}" onclick="converter.loadHistoryItem(${index})">
                <div class="history-header">
                    <span class="conversion-info">${item.inputFormat.toUpperCase()} → ${item.outputFormat.toUpperCase()}</span>
                    <span class="timestamp">${new Date(item.timestamp).toLocaleString()}</span>
                </div>
                <div class="history-preview">
                    <div class="input-preview">Input: ${this.generatePreview(item.input, 80)}</div>
                    <div class="output-preview">Output: ${this.generatePreview(item.output, 80)}</div>
                </div>
            </div>
        `).join('');
    }

    loadHistoryItem(index) {
        const item = this.history[index];
        document.getElementById('inputArea').value = item.input;
        document.getElementById('outputArea').innerHTML = `<div class="syntax-${item.outputFormat}">${
            item.outputFormat === 'json' ? this.syntaxHighlightJson(item.output) :
            item.outputFormat === 'yaml' ? this.syntaxHighlightYaml(item.output) :
            this.syntaxHighlightXml(item.output)
        }</div>`;
        
        this.currentInputFormat = item.inputFormat;
        this.currentOutputFormat = item.outputFormat;
        this.updateFormatIndicators();
        this.updateCharCount();
        
        document.getElementById('historyModal').style.display = 'none';
        this.updateStatus('History item loaded', 'success');
    }

    // Global history integration
    async addToGlobalHistory(tool, data) {
        try {
            const response = await fetch('/api/global-history', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    tool: tool,
                    data: data,
                    timestamp: new Date().toISOString()
                })
            });

            if (!response.ok) {
                console.error('Failed to add to global history');
            }
        } catch (error) {
            console.error('Error adding to global history:', error);
        }
    }

    async showGlobalHistory() {
        const modal = document.getElementById('globalHistoryModal');
        modal.style.display = 'block';
        
        try {
            const response = await fetch('/api/global-history');
            if (response.ok) {
                const history = await response.json();
                this.renderGlobalHistory(history);
            } else {
                document.getElementById('globalHistoryContent').innerHTML = 
                    '<div class="no-history">Failed to load global history</div>';
            }
        } catch (error) {
            console.error('Error loading global history:', error);
            document.getElementById('globalHistoryContent').innerHTML = 
                '<div class="no-history">Error loading global history</div>';
        }
    }

    renderGlobalHistory(history) {
        const container = document.getElementById('globalHistoryContent');
        
        if (history.length === 0) {
            container.innerHTML = '<div class="no-history">No global history available</div>';
            return;
        }

        container.innerHTML = history.map(item => `
            <div class="history-item global-item">
                <div class="history-header">
                    <span class="tool-name">${item.tool}</span>
                    <span class="timestamp">${new Date(item.timestamp).toLocaleString()}</span>
                </div>
                <div class="history-data">
                    <div class="action">${item.data.action}</div>
                    ${item.data.formats ? `<div class="formats">${item.data.formats}</div>` : ''}
                    ${item.data.inputPreview ? `<div class="preview">Input: ${item.data.inputPreview}</div>` : ''}
                </div>
            </div>
        `).join('');
    }
}

// Initialize the converter when the DOM is loaded
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        window.converter = new JsonYamlXmlConverter();
    });
}

// Export for Node.js testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = JsonYamlXmlConverter;
}