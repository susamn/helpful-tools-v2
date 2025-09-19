/**
 * Enhanced YAML Tool - JavaScript Logic
 * Features: YAML formatting, syntax highlighting, collapsible elements, YAML path lookup
 */

class YamlTool {
    constructor() {
        this.toolName = 'yaml-tool';
        this.lastInputData = '';  // Track last input to detect changes
        this.lastOutputText = '';  // Track last output for markup toggling
        this.originalOutputData = null;  // Store original data before YAML path filtering
        this.markupEnabled = true;
        this.indentPrefs = { type: 'spaces', size: 2 };
        this.fontSize = parseInt(localStorage.getItem(`${this.toolName}-fontSize`) || '12');
        this.currentSource = null;  // Track current source for validation
        this.autocompleteAdapter = null;  // Generic autocomplete adapter
        this.initializeElements();
        this.attachEventListeners();
        this.initializeHistoryManager();
        this.initializeSourceSelector(); // This is now async but we don't need to wait
        this.initializeValidation();
        this.initializeYamlPathAutocomplete();
        this.applyFontSize();
    }

    initializeElements() {
        this.elements = {
            // Core elements
            yamlInput: document.getElementById('yamlInput'),
            yamlOutput: document.getElementById('yamlOutput'),
            yamlOutputFormatted: document.getElementById('yamlOutputFormatted'),

            // Action buttons
            formatBtn: document.getElementById('formatBtn'),
            minifyBtn: document.getElementById('minifyBtn'),
            stringifyBtn: document.getElementById('stringifyBtn'),
            clearBtn: document.getElementById('clearBtn'),
            copyBtn: document.getElementById('copyBtn'),
            copyFormattedBtn: document.getElementById('copyFormattedBtn'),
            loadFromSourceBtn: document.getElementById('loadFromSourceBtn'),

            // File upload elements
            fileInput: document.getElementById('fileInput'),
            uploadFileBtn: document.getElementById('uploadFileBtn'),
            filePathLabel: document.getElementById('filePathLabel'),

            // Collapsible controls
            expandAllBtn: document.getElementById('expandAllBtn'),
            collapseAllBtn: document.getElementById('collapseAllBtn'),
            toggleMarkupBtn: document.getElementById('toggleMarkupBtn'),

            // Controls
            indentType: document.getElementById('indentType'),
            indentSize: document.getElementById('indentSize'),
            fontIncreaseBtn: document.getElementById('fontIncreaseBtn'),
            fontDecreaseBtn: document.getElementById('fontDecreaseBtn'),
            yamlPathInput: document.getElementById('yamlPathInput'),
            clearSearchBtn: document.getElementById('clearSearchBtn'),

            // Validation elements
            validationControls: document.getElementById('validationControls'),
            validationStatus: document.getElementById('validationStatus'),
            validatorSelect: document.getElementById('validatorSelect'),
            validateBtn: document.getElementById('validateBtn'),

            // Status
            statusMessages: document.getElementById('statusMessages'),
            yamlStatus: document.getElementById('yamlStatus'),
            yamlSize: document.getElementById('yamlSize'),
            yamlLines: document.getElementById('yamlLines'),
            yamlObjects: document.getElementById('yamlObjects'),
            yamlArrays: document.getElementById('yamlArrays'),
            yamlProperties: document.getElementById('yamlProperties')
        };
    }

    initializeHistoryManager() {
        // Create history manager with callback to load data into input
        this.historyManager = window.createHistoryManager(this.toolName, (data) => {
            this.elements.yamlInput.value = data;
            this.lastInputData = data;
            this.updateStats();
        });

        // Make it globally accessible for HTML onclick handlers
        window.historyManager = this.historyManager;
    }

    attachEventListeners() {
        // Main action buttons
        this.elements.formatBtn.addEventListener('click', () => this.formatYaml());
        this.elements.minifyBtn.addEventListener('click', () => this.minifyYaml());
        this.elements.stringifyBtn.addEventListener('click', () => this.stringifyYaml());
        this.elements.clearBtn.addEventListener('click', () => this.clearInputs());
        this.elements.copyBtn.addEventListener('click', () => this.copyOutput());
        this.elements.copyFormattedBtn.addEventListener('click', () => this.copyFormatted());

        // Collapsible controls
        this.elements.expandAllBtn.addEventListener('click', () => this.expandAll());
        this.elements.collapseAllBtn.addEventListener('click', () => this.collapseAll());
        this.elements.toggleMarkupBtn.addEventListener('click', () => this.toggleMarkup());

        // Controls
        this.elements.indentType.addEventListener('change', () => this.updateIndentPreference());
        this.elements.indentSize.addEventListener('change', () => this.updateIndentPreference());
        this.elements.fontIncreaseBtn.addEventListener('click', () => this.increaseFontSize());
        this.elements.fontDecreaseBtn.addEventListener('click', () => this.decreaseFontSize());

        // YAMLPath input handling
        this.elements.yamlPathInput.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') {
                this.performYamlPathLookup();
            }
        });
        this.elements.clearSearchBtn.addEventListener('click', () => this.clearSearch());

        // Input change detection for real-time stats
        this.elements.yamlInput.addEventListener('input', () => this.updateYamlStats());

        let formatTimeout;
        this.elements.yamlInput.addEventListener('keyup', () => {
            clearTimeout(formatTimeout);
            formatTimeout = setTimeout(() => {
                this.formatYaml();
            }, 1000);
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyboardShortcuts(e));

        // Source selector
        this.elements.loadFromSourceBtn.addEventListener('click', () => this.openSourceSelector());

        // File upload
        this.elements.fileInput.addEventListener('change', (e) => this.handleFileUpload(e));

        // Validation controls
        if (this.elements.validateBtn) {
            this.elements.validateBtn.addEventListener('click', () => this.validateData());
        }
        if (this.elements.validatorSelect) {
            this.elements.validatorSelect.addEventListener('change', () => this.onValidatorChanged());
        }
    }

    /**
     * Initialize the SourceSelector component
     */
    async initializeSourceSelector() {
        try {
            this.sourceSelector = await createSourceSelector({
                containerId: 'yamlToolSourceSelector',
                onFetch: (data, source) => this.loadSourceData(data, source),
                onEdit: (source) => this.onSourceEdit(source),
                showEditButton: true,
                showFetchButton: true
            });
        } catch (error) {
            console.error('Failed to initialize source selector:', error);
            // Fallback to old method if the new loader fails
            this.sourceSelector = new SourceSelector({
                containerId: 'yamlToolSourceSelector',
                onFetch: (data, source) => this.loadSourceData(data, source),
                onEdit: (source) => this.onSourceEdit(source),
                showEditButton: true,
                showFetchButton: true
            });
        }
    }

    /**
     * Initialize validation utilities
     */
    initializeValidation() {
        try {
            if (typeof validationUtils !== 'undefined') {
                validationUtils.populateValidatorSelect(this.elements.validatorSelect, 'yaml');
                this.elements.validationControls.style.display = 'flex';
                this.elements.validateBtn.disabled = false;
            } else {
                console.warn('Validation utilities not available');
            }
        } catch (error) {
            console.error('Failed to initialize validation:', error);
        }
    }

    /**
     * Initialize YAML path autocomplete
     */
    initializeYamlPathAutocomplete() {
        try {
            if (typeof AutocompleteAdapter !== 'undefined' && this.elements.yamlPathInput) {
                this.autocompleteAdapter = new AutocompleteAdapter(this.elements.yamlPathInput, {
                    documentType: 'yaml',
                    queryLanguage: 'yq',
                    maxSuggestions: 10,
                    debounceMs: 300,
                    minQueryLength: 1,
                    showDescriptions: true,
                    showSampleValues: true,
                    onSelect: (suggestion) => {
                        this.elements.yamlPathInput.value = suggestion.query || suggestion.text;
                        this.performYamlPathLookup();
                    }
                });
            }
        } catch (error) {
            console.error('Failed to initialize YAML path autocomplete:', error);
        }
    }

    /**
     * Format YAML with proper indentation and validation
     */
    formatYaml() {
        const input = this.elements.yamlInput.value.trim();

        if (!input) {
            this.showMessage('Please enter YAML data to format.', 'warning');
            this.updateStats('', null);
            this.clearOutput();
            return;
        }

        try {
            // Parse YAML
            const parsed = jsyaml.load(input);

            // Format with current indent preferences
            const indentSize = this.indentPrefs.type === 'tabs' ? 1 : parseInt(this.indentPrefs.size);

            const formatted = jsyaml.dump(parsed, {
                indent: indentSize,
                lineWidth: -1, // No line wrapping
                noRefs: true,
                sortKeys: false
            });

            this.displayOutput(formatted, parsed);
            this.updateStats(formatted, parsed);
            this.showMessage('YAML formatted successfully', 'success');

            // Add to history
            this.saveToHistory(input, 'format');

        } catch (error) {
            this.showMessage(`Invalid YAML: ${error.message}`, 'error');
            this.elements.yamlStatus.textContent = 'Invalid';
            this.clearOutput();
        }
    }

    /**
     * Minify YAML
     */
    minifyYaml() {
        const input = this.elements.yamlInput.value.trim();

        if (!input) {
            this.showMessage('Please enter YAML data to minify.', 'warning');
            return;
        }

        try {
            // Parse YAML
            const parsed = jsyaml.load(input);

            // Minify - use flow style and minimal spacing
            const minified = jsyaml.dump(parsed, {
                flowLevel: 0,
                indent: 1,
                lineWidth: -1,
                noRefs: true,
                sortKeys: false
            }).replace(/\n\s*\n/g, '\n').trim();

            this.displayOutput(minified, parsed);
            this.updateStats(minified, parsed);
            this.showMessage('YAML minified successfully', 'success');

            // Add to history
            this.saveToHistory(input, 'minify');

        } catch (error) {
            this.showMessage(`Invalid YAML: ${error.message}`, 'error');
            this.elements.yamlStatus.textContent = 'Invalid';
        }
    }

    /**
     * Convert YAML to JSON string
     */
    stringifyYaml() {
        const input = this.elements.yamlInput.value.trim();

        if (!input) {
            this.showMessage('Please enter YAML data to stringify.', 'warning');
            return;
        }

        try {
            // Parse YAML first
            const parsed = jsyaml.load(input);

            // Convert to JSON string representation
            const jsonString = JSON.stringify(parsed, null, 2);

            this.displayOutput(jsonString, parsed);
            this.updateStats(jsonString, parsed);
            this.showMessage('YAML converted to JSON string successfully', 'success');

            // Add to history
            this.saveToHistory(input, 'stringify');

        } catch (error) {
            this.showMessage(`Invalid YAML: ${error.message}`, 'error');
            this.elements.yamlStatus.textContent = 'Invalid';
        }
    }

    displayOutput(yamlText, parsedData = null, isYamlPathResult = false) {
        // Store the raw text for toggling
        this.lastOutputText = yamlText;

        // Store original data if this is not a YAML path result
        if (!isYamlPathResult && parsedData !== null) {
            this.originalOutputData = { text: yamlText, parsedData: parsedData };
        }

        if (this.markupEnabled) {
            this.elements.yamlOutput.style.display = 'none';
            this.elements.yamlOutputFormatted.style.display = 'block';
            this.elements.yamlOutput.value = yamlText; // Keep textarea in sync
            this.elements.yamlOutputFormatted.innerHTML = this.highlightYaml(yamlText);
            this.addCollapsibleBehavior();
        } else {
            this.elements.yamlOutput.style.display = 'block';
            this.elements.yamlOutputFormatted.style.display = 'none';
            this.elements.yamlOutput.value = yamlText;
        }

        if (parsedData && this.autocompleteAdapter) {
            // Update autocomplete with input data
            this.updateAutocompleteDocument();
        }
    }

    /**
     * Update autocomplete when YAML data changes
     */
    updateAutocompleteDocument() {
        if (!this.autocompleteAdapter) {
            return;
        }

        try {
            const inputText = this.elements.yamlInput.value.trim();
            if (!inputText) {
                return;
            }

            this.autocompleteAdapter.setDocument(inputText);
        } catch (error) {
            console.error('Failed to update autocomplete document:', error);
        }
    }

    highlightYaml(yamlText) {
        const lines = yamlText.split('\n');

        return lines
            .map((line, index) => {
                let highlightedLine = line;

                // Escape HTML characters in the content
                const escapeHtml = (str) => {
                    return str.replace(/&/g, '&amp;')
                              .replace(/</g, '&lt;')
                              .replace(/>/g, '&gt;')
                              .replace(/"/g, '&quot;')
                              .replace(/'/g, '&#x27;');
                };

                // Comments (apply first)
                highlightedLine = highlightedLine.replace(/#(.*)$/, (match, comment) => {
                    return `#<span class="yaml-comment">${escapeHtml(comment)}</span>`;
                });

                // Skip processing if the line is mostly a comment
                const hasComment = highlightedLine.includes('yaml-comment');

                if (!hasComment) {
                    // Key-value pairs
                    highlightedLine = highlightedLine.replace(/^(\s*)([^:\s][^:]*?)(\s*:\s*)(.*)$/,
                        (match, indent, key, colon, value) => {
                            const escapedKey = escapeHtml(key);
                            const escapedValue = value;

                            return `${indent}<span class="yaml-key">${escapedKey}</span>${colon}${this.highlightYamlValue(escapedValue)}`;
                        });

                    // Array items
                    highlightedLine = highlightedLine.replace(/^(\s*-\s+)(.*)$/,
                        (match, bullet, content) => {
                            return `${bullet}${this.highlightYamlValue(content)}`;
                        });
                }

                return `<div class="line" data-line="${index + 1}">${highlightedLine}</div>`;
            })
            .join('');
    }

    highlightYamlValue(value) {
        if (!value || value.trim() === '') return value;

        const escapeHtml = (str) => {
            return str.replace(/&/g, '&amp;')
                      .replace(/</g, '&lt;')
                      .replace(/>/g, '&gt;')
                      .replace(/"/g, '&quot;')
                      .replace(/'/g, '&#x27;');
        };

        // String values (quoted)
        if (/^["'].*["']$/.test(value.trim())) {
            return `<span class="yaml-string">${escapeHtml(value)}</span>`;
        }

        // Numbers
        if (/^-?\d+(\.\d+)?$/.test(value.trim())) {
            return `<span class="yaml-number">${escapeHtml(value)}</span>`;
        }

        // Booleans
        if (/^(true|false|yes|no|on|off)$/i.test(value.trim())) {
            return `<span class="yaml-boolean">${escapeHtml(value)}</span>`;
        }

        // Null values
        if (/^(null|~)$/i.test(value.trim())) {
            return `<span class="yaml-null">${escapeHtml(value)}</span>`;
        }

        // Arrays in bracket notation
        if (/^\[.*\]$/.test(value.trim())) {
            return `<span class="yaml-array">${escapeHtml(value)}</span>`;
        }

        // Anchors and aliases
        value = value.replace(/(&\w+)/g, `<span class="yaml-anchor">${escapeHtml('$1')}</span>`);
        value = value.replace(/(\*\w+)/g, `<span class="yaml-alias">${escapeHtml('$1')}</span>`);

        // Default: escape and return
        return escapeHtml(value);
    }

    addCollapsibleBehavior() {
        // Add collapsible behavior for nested structures
        const lines = this.elements.yamlOutputFormatted.querySelectorAll('.line');

        lines.forEach((line, index) => {
            const text = line.textContent;
            const indent = text.search(/\S/);
            const hasChildren = index < lines.length - 1 &&
                lines[index + 1].textContent.search(/\S/) > indent;

            if (hasChildren && (text.includes(':') || text.includes('-'))) {
                line.classList.add('collapsible');
                line.addEventListener('click', () => this.toggleCollapse(line));
            }
        });
    }

    toggleCollapse(element) {
        element.classList.toggle('collapsed');
        const isCollapsed = element.classList.contains('collapsed');
        const currentIndent = element.textContent.search(/\S/);

        let nextElement = element.nextElementSibling;
        while (nextElement) {
            const nextIndent = nextElement.textContent.search(/\S/);
            if (nextIndent <= currentIndent) break;

            nextElement.style.display = isCollapsed ? 'none' : 'block';
            nextElement = nextElement.nextElementSibling;
        }
    }

    expandAll() {
        const collapsibles = this.elements.yamlOutputFormatted.querySelectorAll('.collapsible.collapsed');
        collapsibles.forEach(element => {
            element.classList.remove('collapsed');
            let nextElement = element.nextElementSibling;
            const currentIndent = element.textContent.search(/\S/);

            while (nextElement) {
                const nextIndent = nextElement.textContent.search(/\S/);
                if (nextIndent <= currentIndent) break;

                nextElement.style.display = 'block';
                nextElement = nextElement.nextElementSibling;
            }
        });
    }

    collapseAll() {
        const collapsibles = this.elements.yamlOutputFormatted.querySelectorAll('.collapsible:not(.collapsed)');
        collapsibles.forEach(element => {
            element.classList.add('collapsed');
            let nextElement = element.nextElementSibling;
            const currentIndent = element.textContent.search(/\S/);

            while (nextElement) {
                const nextIndent = nextElement.textContent.search(/\S/);
                if (nextIndent <= currentIndent) break;

                nextElement.style.display = 'none';
                nextElement = nextElement.nextElementSibling;
            }
        });
    }

    toggleMarkup() {
        this.markupEnabled = !this.markupEnabled;

        if (this.lastOutputText) {
            if (this.markupEnabled) {
                this.elements.yamlOutputFormatted.innerHTML = this.highlightYaml(this.lastOutputText);
                this.elements.yamlOutputFormatted.style.display = 'block';
                this.elements.yamlOutput.style.display = 'none';
                this.addCollapsibleBehavior();
            } else {
                this.elements.yamlOutput.value = this.lastOutputText;
                this.elements.yamlOutputFormatted.style.display = 'none';
                this.elements.yamlOutput.style.display = 'block';
            }
        }

        this.elements.toggleMarkupBtn.textContent = this.markupEnabled ? 'Remove Markup' : 'Enable Markup';
    }

    async performYamlPathLookup() {
        const path = this.elements.yamlPathInput.value.trim();
        if (!path) {
            this.clearSearch();
            return;
        }

        if (!this.originalOutputData) {
            this.showMessage('Please format some YAML first', 'error');
            return;
        }

        try {
            // Use the YQ evaluator if available
            if (this.autocompleteAdapter && this.autocompleteAdapter.getEngine) {
                const result = await this.autocompleteAdapter.getEngine().evaluator.evaluate(this.originalOutputData.parsedData, path);

                if (result !== undefined && result.length > 0) {
                    const resultYaml = jsyaml.dump(result.length === 1 ? result[0] : result, {
                        indent: this.indentPrefs.type === 'tabs' ? 1 : parseInt(this.indentPrefs.size),
                        lineWidth: -1,
                        noRefs: true,
                        sortKeys: false
                    });

                    this.displayOutput(resultYaml, result, true);
                    this.updateStats(resultYaml, result);
                    this.showMessage(`YAML path query executed: ${path}`, 'success');
                } else {
                    this.showMessage('Path not found or returned no results', 'error');
                }
            } else {
                this.showMessage('YAML path evaluation not available', 'error');
            }
        } catch (error) {
            this.showMessage(`Invalid path expression: ${error.message}`, 'error');
        }
    }

    clearSearch() {
        this.elements.yamlPathInput.value = '';

        // Restore original data if available
        if (this.originalOutputData) {
            this.displayOutput(this.originalOutputData.text, this.originalOutputData.parsedData, false);
            this.updateStats(this.originalOutputData.text, this.originalOutputData.parsedData);
            this.showMessage('Original data restored', 'success');
        }
    }

    clearInputs() {
        this.elements.yamlInput.value = '';
        this.clearOutput();
        this.elements.yamlPathInput.value = '';
        this.elements.filePathLabel.textContent = '';
        this.originalOutputData = null;
        this.currentSource = null;
        this.updateStats('', null);
        this.showMessage('All inputs cleared', 'success');

        if (typeof validationUtils !== 'undefined') {
            validationUtils.clearValidationStatus(this.elements.validationStatus);
        }
    }

    clearOutput() {
        this.elements.yamlOutput.value = '';
        this.elements.yamlOutputFormatted.innerHTML = '';
        this.lastOutputText = '';
    }

    updateIndentPreference() {
        this.indentPrefs.type = this.elements.indentType.value;
        this.indentPrefs.size = parseInt(this.elements.indentSize.value);

        // Re-format if there's output
        if (this.elements.yamlInput.value.trim()) {
            this.formatYaml();
        }
    }

    increaseFontSize() {
        this.fontSize = Math.min(this.fontSize + 1, 24);
        this.applyFontSize();
    }

    decreaseFontSize() {
        this.fontSize = Math.max(this.fontSize - 1, 8);
        this.applyFontSize();
    }

    applyFontSize() {
        const elements = [
            this.elements.yamlInput,
            this.elements.yamlOutput,
            this.elements.yamlOutputFormatted
        ];

        elements.forEach(el => {
            if (el) el.style.fontSize = `${this.fontSize}px`;
        });

        localStorage.setItem(`${this.toolName}-fontSize`, this.fontSize.toString());
    }

    /**
     * Save input to history
     */
    async saveToHistory(data, operation) {
        // Only save if the data is different from the last saved data
        if (data !== this.lastInputData) {
            this.lastInputData = data;
            if (this.historyManager) {
                await this.historyManager.addHistoryEntry(data, operation);
            }
        }
    }

    async copyOutput() {
        const text = this.markupEnabled ? this.lastOutputText : this.elements.yamlOutput.value;

        if (!text) {
            this.showMessage('No output to copy', 'error');
            return;
        }

        try {
            await navigator.clipboard.writeText(text);
            this.showMessage('Copied to clipboard', 'success');
        } catch (error) {
            this.showMessage('Failed to copy to clipboard', 'error');
        }
    }

    async copyFormatted() {
        const formattedHtml = this.elements.yamlOutputFormatted.innerHTML;

        if (!formattedHtml) {
            this.showMessage('No formatted output to copy', 'error');
            return;
        }

        try {
            // Copy both HTML and plain text
            const plainText = this.elements.yamlOutputFormatted.textContent;

            await navigator.clipboard.write([
                new ClipboardItem({
                    'text/html': new Blob([formattedHtml], { type: 'text/html' }),
                    'text/plain': new Blob([plainText], { type: 'text/plain' })
                })
            ]);

            this.showMessage('Formatted output copied to clipboard', 'success');
        } catch (error) {
            // Fallback to plain text
            try {
                await navigator.clipboard.writeText(this.elements.yamlOutputFormatted.textContent);
                this.showMessage('Plain text copied to clipboard', 'success');
            } catch (fallbackError) {
                this.showMessage('Failed to copy to clipboard', 'error');
            }
        }
    }

    openSourceSelector() {
        if (this.sourceSelector) {
            this.sourceSelector.show();
        } else {
            this.showMessage('Source selector not available', 'error');
        }
    }

    loadSourceData(data, source) {
        this.elements.yamlInput.value = data;
        this.currentSource = source;

        // Update file path label
        if (source.pathDisplay) {
            this.elements.filePathLabel.textContent = `Source: ${source.pathDisplay}`;
        } else if (source.selectedFile) {
            this.elements.filePathLabel.textContent = `Source: ${source.name}/${source.selectedFile}`;
        } else {
            this.elements.filePathLabel.textContent = `Source: ${source.name}`;
        }

        // Auto-format the loaded data
        this.formatYaml();
        this.showMessage(`Data loaded from source: ${source.name}`, 'success');
    }

    onSourceEdit(source) {
        console.log('Source edited:', source);
        // Optionally reload data if the current source was edited
        if (this.currentSource && this.currentSource.id === source.id) {
            this.currentSource = source;
        }
    }

    handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            this.elements.yamlInput.value = e.target.result;
            this.elements.filePathLabel.textContent = `File: ${file.name}`;
            this.formatYaml();
            this.showMessage(`File "${file.name}" loaded successfully`, 'success');
        };

        reader.onerror = () => {
            this.showMessage('Failed to read file', 'error');
        };

        reader.readAsText(file);
    }

    validateData() {
        const input = this.elements.yamlInput.value.trim();
        if (!input) {
            this.showMessage('Please enter YAML data to validate', 'error');
            return;
        }

        try {
            // Basic YAML validation
            const parsed = jsyaml.load(input);

            if (typeof validationUtils !== 'undefined') {
                const selectedValidator = this.elements.validatorSelect.value;
                if (selectedValidator) {
                    validationUtils.validateWithSchema(input, selectedValidator, this.elements.validationStatus);
                } else {
                    validationUtils.showValidationResult(
                        this.elements.validationStatus,
                        true,
                        'YAML is syntactically valid'
                    );
                }
            } else {
                this.showMessage('YAML is syntactically valid', 'success');
            }
        } catch (error) {
            if (typeof validationUtils !== 'undefined') {
                validationUtils.showValidationResult(
                    this.elements.validationStatus,
                    false,
                    `Invalid YAML: ${error.message}`
                );
            } else {
                this.showMessage(`Invalid YAML: ${error.message}`, 'error');
            }
        }
    }

    onValidatorChanged() {
        // Clear previous validation status when validator changes
        if (typeof validationUtils !== 'undefined') {
            validationUtils.clearValidationStatus(this.elements.validationStatus);
        }
    }

    updateYamlStats() {
        const input = this.elements.yamlInput.value;
        this.updateStats(input, null);
    }

    updateStats(yamlText, parsedData) {
        if (!yamlText && !parsedData) {
            this.elements.yamlStatus.textContent = 'Ready';
            this.elements.yamlSize.textContent = '0 chars';
            this.elements.yamlLines.textContent = '0';
            this.elements.yamlObjects.textContent = '0';
            this.elements.yamlArrays.textContent = '0';
            this.elements.yamlProperties.textContent = '0';
            return;
        }

        // Basic stats
        const size = yamlText.length;
        const lines = yamlText.split('\n').length;

        this.elements.yamlStatus.textContent = 'Valid';
        this.elements.yamlSize.textContent = `${size} chars`;
        this.elements.yamlLines.textContent = lines;

        // Analyze structure if we have parsed data
        if (parsedData) {
            const stats = this.analyzeYamlStructure(parsedData);
            this.elements.yamlObjects.textContent = `${stats.objects}`;
            this.elements.yamlArrays.textContent = `${stats.arrays}`;
            this.elements.yamlProperties.textContent = `${stats.properties}`;
        } else {
            this.elements.yamlObjects.textContent = '0';
            this.elements.yamlArrays.textContent = '0';
            this.elements.yamlProperties.textContent = '0';
        }
    }

    analyzeYamlStructure(data) {
        let objects = 0;
        let arrays = 0;
        let properties = 0;

        const analyze = (obj) => {
            if (Array.isArray(obj)) {
                arrays++;
                obj.forEach(analyze);
            } else if (obj && typeof obj === 'object') {
                objects++;
                properties += Object.keys(obj).length;
                Object.values(obj).forEach(analyze);
            }
        };

        analyze(data);
        return { objects, arrays, properties };
    }

    handleKeyboardShortcuts(event) {
        // Ctrl/Cmd + Enter: Format
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            event.preventDefault();
            this.formatYaml();
        }

        // Ctrl/Cmd + Shift + C: Copy
        if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'C') {
            event.preventDefault();
            this.copyOutput();
        }

        // Ctrl/Cmd + Shift + L: Clear
        if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'L') {
            event.preventDefault();
            this.clearInputs();
        }
    }

    showMessage(message, type = 'info') {
        // Try to use the common showStatusMessage function
        if (typeof showStatusMessage === 'function') {
            showStatusMessage(message, type, 3000);
        } else {
            console.log(`[${type.toUpperCase()}] ${message}`);
        }
    }
}

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = YamlTool;
}

// Initialize when DOM is loaded (only in browser environment)
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        window.yamlTool = new YamlTool();
    });
}