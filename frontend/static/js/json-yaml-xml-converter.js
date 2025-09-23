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
            this.lastOutputText = '';
            this.markupEnabled = true;
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
            this.initializeSourceSelector();
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
            document.getElementById('expandAllBtn').addEventListener('click', () => this.expandAll());
            document.getElementById('collapseAllBtn').addEventListener('click', () => this.collapseAll());
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

            // File upload and source selector
            document.getElementById('loadFromSourceBtn').addEventListener('click', () => this.openSourceSelector());
            document.getElementById('fileInput').addEventListener('change', (e) => this.handleFileUpload(e));

            // Toggle markup button
            document.getElementById('toggleMarkupBtn').addEventListener('click', () => this.toggleMarkup());

            // File path tooltip events
            this.initializeFilePathTooltip();
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
                    // Store the raw output text
                    this.lastOutputText = result.result;

                    // Display the output using the dual-view approach
                    this.displayOutput(result.result, targetFormat);

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
                    this.displayError(`Error: ${result.error}`);
                    this.updateStatus(`Conversion error: ${result.error}`);
                }

            } catch (error) {
                this.displayError(`Network Error: ${error.message}`);
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


        // Syntax highlighting with collapsible functionality
        syntaxHighlightJson(jsonStr) {
            // Use a more reliable tokenizer approach
            const tokens = this.tokenizeJson(jsonStr);
            let html = '';
            let indent = 0;

            for (let i = 0; i < tokens.length; i++) {
                const token = tokens[i];

                switch (token.type) {
                case 'string':
                    if (i + 1 < tokens.length && tokens[i + 1].type === 'colon') {
                        html += `<span class="json-key">${token.value}</span>`;
                    } else {
                        html += `<span class="json-string">${token.value}</span>`;
                    }
                    break;

                case 'number':
                    html += `<span class="json-number">${token.value}</span>`;
                    break;

                case 'boolean':
                    html += `<span class="json-boolean">${token.value}</span>`;
                    break;

                case 'null':
                    html += `<span class="json-null">${token.value}</span>`;
                    break;

                case 'openBrace':
                case 'openBracket':
                    html += `<span class="expand-collapse-btn" onclick="toggleCollapse(this)" data-level="${indent}">-</span>`;
                    html += `<span class="json-punctuation">${token.value}</span><span class="collapsible-content">`;
                    indent++;
                    break;

                case 'closeBrace':
                case 'closeBracket':
                    indent--;
                    html += `</span><span class="json-punctuation">${token.value}</span>`;
                    break;

                case 'colon':
                    html += `<span class="json-punctuation">${token.value}</span>`;
                    break;

                case 'comma':
                    html += `<span class="json-punctuation">${token.value}</span>`;
                    break;

                case 'whitespace':
                    html += token.value;
                    break;

                default:
                    html += token.value;
                    break;
                }
            }

            return html;
        }

        tokenizeJson(jsonStr) {
            const tokens = [];
            let i = 0;

            while (i < jsonStr.length) {
                const char = jsonStr[i];

                if (char === '"') {
                    // String literal
                    let value = '"';
                    i++;
                    while (i < jsonStr.length && jsonStr[i] !== '"') {
                        if (jsonStr[i] === '\\') {
                            value += jsonStr[i++] + (jsonStr[i] || '');
                        } else {
                            value += jsonStr[i];
                        }
                        i++;
                    }
                    if (i < jsonStr.length) {
                        value += '"';
                        i++;
                    }
                    tokens.push({ type: 'string', value: this.escapeHtml(value) });
                } else if (char === '{') {
                    tokens.push({ type: 'openBrace', value: char });
                    i++;
                } else if (char === '}') {
                    tokens.push({ type: 'closeBrace', value: char });
                    i++;
                } else if (char === '[') {
                    tokens.push({ type: 'openBracket', value: char });
                    i++;
                } else if (char === ']') {
                    tokens.push({ type: 'closeBracket', value: char });
                    i++;
                } else if (char === ':') {
                    tokens.push({ type: 'colon', value: char });
                    i++;
                } else if (char === ',') {
                    tokens.push({ type: 'comma', value: char });
                    i++;
                } else if (/\s/.test(char)) {
                    // Whitespace
                    let value = '';
                    while (i < jsonStr.length && /\s/.test(jsonStr[i])) {
                        value += jsonStr[i];
                        i++;
                    }
                    tokens.push({ type: 'whitespace', value });
                } else if (char === 't' && jsonStr.substr(i, 4) === 'true') {
                    tokens.push({ type: 'boolean', value: 'true' });
                    i += 4;
                } else if (char === 'f' && jsonStr.substr(i, 5) === 'false') {
                    tokens.push({ type: 'boolean', value: 'false' });
                    i += 5;
                } else if (char === 'n' && jsonStr.substr(i, 4) === 'null') {
                    tokens.push({ type: 'null', value: 'null' });
                    i += 4;
                } else if (/[-\d]/.test(char)) {
                    // Number
                    let value = '';
                    while (i < jsonStr.length && /[-\d.eE+]/.test(jsonStr[i])) {
                        value += jsonStr[i];
                        i++;
                    }
                    tokens.push({ type: 'number', value });
                } else {
                    i++;
                }
            }

            return tokens;
        }

        escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        syntaxHighlightYaml(yaml) {
            // Split into lines and process each line
            const lines = yaml.split('\n');
            let html = '';

            lines.forEach((line, index) => {
                let processedLine = line;

                // Process key-value pairs
                processedLine = processedLine.replace(/^(\s*)([^:\s][^:]*?)(\s*:)(\s*)(.*)$/gm, function(match, indent, key, colon, space, value) {
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

                // Wrap each line in a div for collapsible functionality
                html += `<div class="line">${processedLine}</div>`;
            });

            // Set up collapsible behavior after a short delay to allow DOM to update
            setTimeout(() => this.addYamlCollapsibleBehavior(), 100);

            return html;
        }

        addYamlCollapsibleBehavior() {
            const outputAreaFormatted = document.getElementById('outputAreaFormatted');
            if (!outputAreaFormatted) return;

            const lines = outputAreaFormatted.querySelectorAll('.line');

            lines.forEach((line, index) => {
                const text = line.textContent;
                const indent = text.search(/\S/);
                const hasChildren = index < lines.length - 1 &&
                    lines[index + 1].textContent.search(/\S/) > indent;

                if (hasChildren && (text.includes(':') || text.includes('-'))) {
                    line.classList.add('collapsible');
                    line.style.cursor = 'pointer';
                    line.addEventListener('click', () => this.toggleYamlCollapse(line));
                }
            });
        }

        toggleYamlCollapse(element) {
            element.classList.toggle('collapsed');
            const isCollapsed = element.classList.contains('collapsed');
            const currentIndent = element.textContent.search(/\S/);

            let nextElement = element.nextElementSibling;
            while (nextElement && nextElement.classList.contains('line')) {
                const nextIndent = nextElement.textContent.search(/\S/);
                if (nextIndent <= currentIndent) break;

                nextElement.style.display = isCollapsed ? 'none' : 'block';
                nextElement = nextElement.nextElementSibling;
            }
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
            const outputAreaFormatted = document.getElementById('outputAreaFormatted');

            if (inputArea) inputArea.style.fontSize = `${this.fontSize}px`;
            if (outputArea) outputArea.style.fontSize = `${this.fontSize}px`;
            if (outputAreaFormatted) outputAreaFormatted.style.fontSize = `${this.fontSize}px`;
        }

        saveFontSize() {
            localStorage.setItem(`${this.toolName}-fontSize`, this.fontSize.toString());
        }

        /**
         * Display output in both plain text and formatted views
         */
        displayOutput(text, format) {
            const outputArea = document.getElementById('outputArea');
            const outputAreaFormatted = document.getElementById('outputAreaFormatted');

            if (this.markupEnabled) {
                outputArea.style.display = 'none';
                outputAreaFormatted.style.display = 'block';
                outputArea.value = text; // Keep textarea in sync
                outputAreaFormatted.innerHTML = this.syntaxHighlight(text, format);
            } else {
                outputArea.style.display = 'block';
                outputAreaFormatted.style.display = 'none';
                outputArea.value = text;
            }
        }

        /**
         * Display error in both views
         */
        displayError(message) {
            const outputArea = document.getElementById('outputArea');
            const outputAreaFormatted = document.getElementById('outputAreaFormatted');

            if (this.markupEnabled) {
                outputArea.style.display = 'none';
                outputAreaFormatted.style.display = 'block';
                outputArea.value = message;
                outputAreaFormatted.innerHTML = `<div class="error-display">${message}</div>`;
            } else {
                outputArea.style.display = 'block';
                outputAreaFormatted.style.display = 'none';
                outputArea.value = message;
            }
        }

        /**
         * Toggle between plain text and formatted markup view
         */
        toggleMarkup() {
            this.markupEnabled = !this.markupEnabled;
            const toggleBtn = document.getElementById('toggleMarkupBtn');

            if (this.markupEnabled) {
                toggleBtn.textContent = '📝 Plain Text';
            } else {
                toggleBtn.textContent = '🎨 Enhanced View';
            }

            // Re-display current output with new view mode
            if (this.lastOutputText) {
                this.displayOutput(this.lastOutputText, this.currentOutputFormat);
            }
        }

        /**
         * Expand all collapsible elements
         */
        expandAll() {
            // Handle JSON collapsible elements
            document.querySelectorAll('.expand-collapse-btn').forEach(btn => {
                btn.textContent = '-';
                const content = btn.nextSibling;
                if (content && content.classList && content.classList.contains('collapsed-content')) {
                    content.style.display = 'inline';
                    content.classList.remove('collapsed-content');
                }
            });

            // Handle YAML collapsible lines
            const outputAreaFormatted = document.getElementById('outputAreaFormatted');
            if (outputAreaFormatted) {
                const collapsibles = outputAreaFormatted.querySelectorAll('.line.collapsible.collapsed');
                collapsibles.forEach(element => {
                    element.classList.remove('collapsed');
                    let nextElement = element.nextElementSibling;
                    const currentIndent = element.textContent.search(/\S/);

                    while (nextElement && nextElement.classList.contains('line')) {
                        const nextIndent = nextElement.textContent.search(/\S/);
                        if (nextIndent <= currentIndent) break;

                        nextElement.style.display = 'block';
                        nextElement = nextElement.nextElementSibling;
                    }
                });
            }
        }

        /**
         * Collapse all collapsible elements
         */
        collapseAll() {
            // Handle JSON collapsible elements
            document.querySelectorAll('.expand-collapse-btn').forEach(btn => {
                btn.textContent = '+';
                const content = btn.nextSibling;
                if (content) {
                    content.style.display = 'none';
                    content.classList.add('collapsed-content');
                }
            });

            // Handle YAML collapsible lines
            const outputAreaFormatted = document.getElementById('outputAreaFormatted');
            if (outputAreaFormatted) {
                const collapsibles = outputAreaFormatted.querySelectorAll('.line.collapsible:not(.collapsed)');
                collapsibles.forEach(element => {
                    element.classList.add('collapsed');
                    let nextElement = element.nextElementSibling;
                    const currentIndent = element.textContent.search(/\S/);

                    while (nextElement && nextElement.classList.contains('line')) {
                        const nextIndent = nextElement.textContent.search(/\S/);
                        if (nextIndent <= currentIndent) break;

                        nextElement.style.display = 'none';
                        nextElement = nextElement.nextElementSibling;
                    }
                });
            }
        }

        /**
         * Handle file upload for JSON, YAML, and XML files
         */
        handleFileUpload(event) {
            const file = event.target.files[0];
            if (!file) return;

            // Validate file type
            const validExtensions = ['.json', '.yaml', '.yml', '.xml'];
            const fileName = file.name.toLowerCase();
            const isValidFile = validExtensions.some(ext => fileName.endsWith(ext));

            if (!isValidFile) {
                this.showMessage('Please select a valid JSON, YAML, or XML file', 'error');
                return;
            }

            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const content = e.target.result;

                    // Set the content to input
                    document.getElementById('inputArea').value = content;

                    // Show file path in tooltip
                    this.setFilePath(file.name);

                    // Auto-detect format and update indicators
                    this.autoDetectFormat();
                    this.updateCharCount();

                    this.showMessage(`Loaded file: ${file.name}`, 'success');

                } catch (error) {
                    this.showMessage(`Error reading file: ${error.message}`, 'error');
                }
            };

            reader.onerror = () => {
                this.showMessage('Error reading file', 'error');
            };

            reader.readAsText(file);
        }

        /**
         * Initialize source selector
         */
        async initializeSourceSelector() {
            try {
                // Try the createSourceSelector function first
                this.sourceSelector = await createSourceSelector({
                    containerId: 'jsonYamlXmlConverterSourceSelector',
                    onFetch: (data, source) => this.loadSourceData(data, source),
                    onEdit: (source) => this.onSourceEdit(source),
                    showEditButton: true,
                    showFetchButton: true
                });
            } catch (error) {
                console.error('Failed to initialize source selector with createSourceSelector, trying SourceSelector:', error);
                // Fallback to direct SourceSelector instantiation
                try {
                    this.sourceSelector = new SourceSelector({
                        containerId: 'jsonYamlXmlConverterSourceSelector',
                        onFetch: (data, source) => this.loadSourceData(data, source),
                        onEdit: (source) => this.onSourceEdit(source),
                        showEditButton: true,
                        showFetchButton: true
                    });
                } catch (fallbackError) {
                    console.error('Error initializing source selector:', fallbackError);
                }
            }
        }

        /**
         * Open the source selector
         */
        async openSourceSelector() {
            if (!this.sourceSelector) {
                console.warn('Source selector not initialized yet, trying to initialize...');
                await this.initializeSourceSelector();
            }
            this.sourceSelector.show();
        }

        /**
         * Handle source data loading
         */
        loadSourceData(data, source) {
            try {
                // Set the data in the input area
                document.getElementById('inputArea').value = data;

                // Show the source URL/path in the file path label
                let displayPath = '';
                if (source.pathDisplay) {
                    displayPath = source.pathDisplay;
                } else if (source.selectedFile) {
                    displayPath = `${source.name}/${source.selectedFile}`;
                } else if (source.path) {
                    displayPath = `${source.name}: ${source.path}`;
                } else {
                    displayPath = source.name;
                }
                this.setFilePath(displayPath);

                // Auto-detect format and update
                this.autoDetectFormat();
                this.updateCharCount();

                this.showMessage(`Loaded data from source: ${source.name}`, 'success');

            } catch (error) {
                console.error('Error loading source data:', error);
                this.showMessage(`Error loading source data: ${error.message}`, 'error');
            }
        }

        /**
         * Handle source editing
         */
        onSourceEdit(source) {
            console.log('Source edited:', source);
        }

        /**
         * Initialize file path tooltip functionality
         */
        initializeFilePathTooltip() {
            const filePathLabel = document.getElementById('filePathLabel');
            const filePathTooltip = document.getElementById('filePathTooltip');

            if (!filePathLabel || !filePathTooltip) return;

            filePathLabel.addEventListener('click', (e) => {
                if (this.currentFilePath) {
                    this.showPathTooltip(e, this.currentFilePath);
                }
            });

            // Hide tooltip when clicking outside
            document.addEventListener('click', (e) => {
                if (!filePathLabel.contains(e.target) &&
                    !filePathTooltip.contains(e.target)) {
                    this.hidePathTooltip();
                }
            });
        }

        /**
         * Show path tooltip at click position
         */
        showPathTooltip(event, path) {
            const filePathTooltip = document.getElementById('filePathTooltip');
            const filePathLabel = document.getElementById('filePathLabel');

            filePathTooltip.textContent = path;
            filePathTooltip.style.display = 'block';

            // Position tooltip near click point
            const rect = filePathLabel.getBoundingClientRect();
            filePathTooltip.style.left = rect.left + 'px';
            filePathTooltip.style.top = (rect.bottom + 5) + 'px';
        }

        /**
         * Hide path tooltip
         */
        hidePathTooltip() {
            const filePathTooltip = document.getElementById('filePathTooltip');
            filePathTooltip.style.display = 'none';
        }

        /**
         * Set file path and store for tooltip
         */
        setFilePath(path) {
            this.currentFilePath = path;
            const filePathLabel = document.getElementById('filePathLabel');
            filePathLabel.style.display = 'inline';
            filePathLabel.textContent = '[path]';
        }

        /**
         * Clear file path
         */
        clearFilePath() {
            this.currentFilePath = '';
            const filePathLabel = document.getElementById('filePathLabel');
            filePathLabel.style.display = 'none';
            this.hidePathTooltip();
        }
    }

    // Initialize the converter
    window.converter = new JsonYamlXmlConverter();
});

// Global function for collapsible elements
function toggleCollapse(element) {
    const content = element.nextElementSibling.nextElementSibling;
    if (content.style.display === 'none') {
        content.style.display = 'inline';
        element.textContent = '-';
    } else {
        content.style.display = 'none';
        element.textContent = '+';
    }
}