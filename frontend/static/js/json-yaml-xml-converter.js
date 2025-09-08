// Initialize converter when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Include the converter class inline to avoid external file issues
    class JsonYamlXmlConverter {
        constructor() {
            this.toolName = 'json-yaml-xml-converter';
            this.yamlIndentSize = 2;
            this.currentInputFormat = 'unknown';
            this.currentOutputFormat = 'unknown';
            this.lastInputData = '';
            this.fontSize = parseInt(localStorage.getItem(`${this.toolName}-fontSize`) || '13');

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
  version: "1.0"`
            };

            this.init();
            this.initializeHistoryManager();
            this.applyFontSize();
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


            // Font size controls
            document.getElementById('fontIncreaseBtn').addEventListener('click', () => this.increaseFontSize());
            document.getElementById('fontDecreaseBtn').addEventListener('click', () => this.decreaseFontSize());
        }

        loadExample(format) {
            const inputArea = document.getElementById('inputArea');
            inputArea.value = this.examples[format];
            this.currentInputFormat = format;
            this.updateFormatIndicators();
            this.updateCharCount();
            this.updateStatus(`${format.toUpperCase()} example loaded - try converting to other formats`);
        }

        async convertTo(targetFormat) {
            const input = document.getElementById('inputArea').value.trim();
            const output = document.getElementById('outputArea');

            if (!input) {
                this.updateStatus('Please enter some content to convert');
                return;
            }

            this.updateStatus('Converting...');

            try {
                const response = await fetch('/api/convert', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        data: input,
                        input_format: 'auto',
                        output_format: targetFormat
                    })
                });

                const result = await response.json();

                if (result.success) {
                    const highlightedResult = this.syntaxHighlight(result.result, targetFormat);
                    output.innerHTML = highlightedResult;

                    this.currentInputFormat = result.input_format;
                    this.currentOutputFormat = result.output_format;
                    this.updateFormatIndicators();

                    if (result.operation === 'convert') {
                        this.updateStatus(`Converted ${result.input_format.toUpperCase()} to ${result.output_format.toUpperCase()}`);
                        // Save to history only on actual conversions
                        this.saveToHistory(input, `${result.input_format}-to-${result.output_format}`);
                    } else {
                        this.updateStatus(`${targetFormat.toUpperCase()} formatted`);
                    }
                } else {
                    output.innerHTML = `<div class="error-display">Error: ${result.error}</div>`;
                    this.updateStatus(`Conversion error: ${result.error}`);
                }

            } catch (error) {
                output.innerHTML = `<div class="error-display">Network Error: ${error.message}</div>`;
                this.updateStatus(`Network error: ${error.message}`);
            }
        }

        async detectFormat(content) {
            if (!content.trim()) return 'unknown';

            try {
                const response = await fetch('/api/detect-format', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        data: content
                    })
                });

                const result = await response.json();
                return result.format || 'unknown';
            } catch (error) {
                console.error('Format detection error:', error);
                return 'unknown';
            }
        }

        async autoDetectFormat() {
            const input = document.getElementById('inputArea').value.trim();
            if (!input) return;

            const detectedFormat = await this.detectFormat(input);
            if (detectedFormat !== 'unknown' && detectedFormat !== this.currentInputFormat) {
                this.currentInputFormat = detectedFormat;
                this.updateFormatIndicators();
            }
        }

        // Unified syntax highlighting method
        syntaxHighlight(text, format) {
            if (format === 'json') {
                return this.syntaxHighlightJson(text);
            } else if (format === 'yaml') {
                return this.syntaxHighlightYaml(text);
            } else if (format === 'xml') {
                return this.syntaxHighlightXml(text);
            }
            return text;
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
            return yaml.replace(/^(\s*)([^:\s][^:]*?)(\s*:)(\s*)(.*)$/gm, function(match, indent, key, colon, space, value) {
                let highlightedValue = value;
                if (value.match(/^\s*(true|false)\s*$/)) {
                    highlightedValue = value.replace(/(true|false)/, '<span class="yaml-boolean">$1</span>');
                } else if (value.match(/^\s*\d+\s*$/)) {
                    highlightedValue = '<span class="yaml-number">' + value + '</span>';
                } else if (value.trim()) {
                    highlightedValue = '<span class="yaml-string">' + value + '</span>';
                }
                return indent + '<span class="yaml-key">' + key + '</span>' + colon + space + highlightedValue;
            });
        }

        syntaxHighlightXml(xml) {
            xml = xml.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            return xml.replace(/(&lt;\/?)([a-zA-Z_][\w\-]*)(.*?)(\/?&gt;)/g, '<span class="xml-tag">$1$2$3$4</span>');
        }

        // Utility functions
        async formatCurrent() {
            const input = document.getElementById('inputArea').value.trim();
            if (!input) return;

            this.updateStatus('Formatting...');

            try {
                const format = await this.detectFormat(input);
                if (format !== 'unknown') {
                    // Use the backend conversion API to format the current input
                    const response = await fetch('/api/convert', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            data: input,
                            input_format: format,
                            output_format: format
                        })
                    });

                    const result = await response.json();

                    if (result.success) {
                        document.getElementById('inputArea').value = result.result;
                        this.updateCharCount();
                        this.updateStatus(`${format.toUpperCase()} formatted`);
                    } else {
                        this.updateStatus(`Formatting error: ${result.error}`);
                    }
                } else {
                    this.updateStatus('Could not detect format to format');
                }
            } catch (error) {
                this.updateStatus(`Formatting error: ${error.message}`);
            }
        }

        swapContent() {
            const inputEl = document.getElementById('inputArea');
            const outputEl = document.getElementById('outputArea');
            const outputText = outputEl.textContent;

            if (!outputText.trim()) {
                this.updateStatus('No output content to swap');
                return;
            }

            inputEl.value = outputText;
            outputEl.innerHTML = '';

            const temp = this.currentInputFormat;
            this.currentInputFormat = this.currentOutputFormat;
            this.currentOutputFormat = 'unknown';

            this.updateFormatIndicators();
            this.updateCharCount();
            this.updateStatus('Content swapped between panels');
        }

        clearAll() {
            document.getElementById('inputArea').value = '';
            document.getElementById('outputArea').innerHTML = '';
            this.currentInputFormat = 'unknown';
            this.currentOutputFormat = 'unknown';
            this.updateFormatIndicators();
            this.updateCharCount();
            this.updateStatus('Ready - Paste JSON, YAML, or XML to auto-detect format');
        }

        copyOutput() {
            const output = document.getElementById('outputArea');
            const text = output.textContent;

            if (!text.trim()) {
                this.updateStatus('No output content to copy');
                return;
            }

            navigator.clipboard.writeText(text).then(() => {
                this.updateStatus('Copied to clipboard');
            }).catch(() => {
                this.updateStatus('Copy failed');
            });
        }

        updateYamlPreference() {
            this.yamlIndentSize = parseInt(document.getElementById('yamlIndent').value);
        }

        updateCharCount() {
            const input = document.getElementById('inputArea').value;
            document.getElementById('charCount').textContent = input.length;
        }

        updateFormatIndicators() {
            const inputIndicator = document.getElementById('inputFormat');
            const outputIndicator = document.getElementById('outputFormat');

            inputIndicator.textContent = this.currentInputFormat.toUpperCase();
            outputIndicator.textContent = this.currentOutputFormat.toUpperCase();

            inputIndicator.className = `format-indicator ${this.currentInputFormat}`;
            outputIndicator.className = `format-indicator ${this.currentOutputFormat}`;
        }

        updateStatus(message) {
            document.getElementById('statusText').textContent = message;
        }

        /**
         * Initialize history manager
         */
        initializeHistoryManager() {
            // Create history manager with callback to load data into input
            this.historyManager = window.createHistoryManager(this.toolName, (data) => {
                document.getElementById('inputArea').value = data;
                this.lastInputData = data;
                this.updateCharCount();
                this.autoDetectFormat();
            });
            
            // Make it globally accessible for HTML onclick handlers
            window.historyManager = this.historyManager;
        }

        /**
         * Save input to history
         */
        async saveToHistory(data, operation) {
            // Only save if the data is different from the last saved data
            if (data !== this.lastInputData) {
                this.lastInputData = data;
                await this.historyManager.addHistoryEntry(data, operation);
            }
        }

        /**
         * Show status message to user
         */
        showMessage(message, type = 'info') {
            // Update status text and provide user feedback
            this.updateStatus(message);
        }

        // Font size methods
        increaseFontSize() {
            if (this.fontSize < 24) {
                this.fontSize += 1;
                this.applyFontSize();
                this.saveFontSize();
            }
        }

        decreaseFontSize() {
            if (this.fontSize > 8) {
                this.fontSize -= 1;
                this.applyFontSize();
                this.saveFontSize();
            }
        }

        applyFontSize() {
            const inputArea = document.getElementById('inputArea');
            const outputArea = document.getElementById('outputArea');

            if (inputArea) inputArea.style.fontSize = `${this.fontSize}px`;
            if (outputArea) outputArea.style.fontSize = `${this.fontSize}px`;
        }

        saveFontSize() {
            localStorage.setItem(`${this.toolName}-fontSize`, this.fontSize.toString());
        }
    }

    // Initialize the converter
    window.converter = new JsonYamlXmlConverter();
});