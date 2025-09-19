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

            // Settings
            indentType: document.getElementById('indentType'),
            indentSize: document.getElementById('indentSize'),

            // Font controls
            fontIncreaseBtn: document.getElementById('fontIncreaseBtn'),
            fontDecreaseBtn: document.getElementById('fontDecreaseBtn'),

            // YAML path search (now in toolbar)
            yamlPathInput: document.getElementById('yamlPathInput'),
            clearSearchBtn: document.getElementById('clearSearchBtn'),
            yamlPathExecuteBtn: document.getElementById('yamlPathExecuteBtn'),
            yamlPathClearBtn: document.getElementById('yamlPathClearBtn'),

            // History controls
            historyDropdown: document.getElementById('historyDropdown'),
            historyLocalBtn: document.getElementById('historyLocalBtn'),
            historyGlobalBtn: document.getElementById('historyGlobalBtn'),
            historyList: document.getElementById('historyList'),
            historyClearBtn: document.getElementById('historyClearBtn'),
            historyCloseBtn: document.getElementById('historyCloseBtn'),

            // Header history buttons
            historyToggleBtn: document.getElementById('historyToggleBtn'),
            globalHistoryBtn: document.getElementById('globalHistoryBtn'),
            globalHistoryPopup: document.getElementById('globalHistoryPopup'),

            // Validation elements
            validationControls: document.getElementById('validationControls'),
            validationStatus: document.getElementById('validationStatus'),
            validatorSelect: document.getElementById('validatorSelect'),
            validateBtn: document.getElementById('validateBtn'),

            // Status and messages
            statusMessages: document.getElementById('statusMessages'),
            errorMessage: document.getElementById('errorMessage'),
            successMessage: document.getElementById('successMessage'),
            yamlStatus: document.getElementById('yamlStatus'),
            yamlSize: document.getElementById('yamlSize'),
            yamlLines: document.getElementById('yamlLines'),
            yamlObjects: document.getElementById('yamlObjects'),
            yamlArrays: document.getElementById('yamlArrays'),
            yamlProperties: document.getElementById('yamlProperties')
        };
    }

    initializeHistoryManager() {
        console.log('Initializing history manager for:', this.toolName);
        console.log('window.createHistoryManager available:', typeof window.createHistoryManager);

        // Create history manager with callback to load data into input
        this.historyManager = window.createHistoryManager(this.toolName, (data) => {
            this.elements.yamlInput.value = data;
            this.lastInputData = data;
            this.updateStats();
        });

        console.log('History manager created:', this.historyManager);

        // Make it globally accessible for HTML onclick handlers
        window.historyManager = this.historyManager;
        console.log('window.historyManager set to:', window.historyManager);
    }

    attachEventListeners() {
        // Main action buttons
        this.elements.formatBtn.addEventListener('click', () => this.formatYaml());
        this.elements.minifyBtn.addEventListener('click', () => this.minifyYaml());
        this.elements.stringifyBtn.addEventListener('click', () => this.stringifyYaml());
        this.elements.clearBtn.addEventListener('click', () => this.clearAll());

        // Copy buttons
        this.elements.copyBtn.addEventListener('click', () => this.copyToClipboard());
        this.elements.copyFormattedBtn.addEventListener('click', () => this.copyFormattedToClipboard());

        // File operations
        this.elements.loadFromSourceBtn.addEventListener('click', () => this.loadFromSource());
        this.elements.uploadFileBtn.addEventListener('click', () => this.elements.fileInput.click());
        this.elements.fileInput.addEventListener('change', (e) => this.handleFileUpload(e));

        // Collapsible controls
        this.elements.expandAllBtn.addEventListener('click', () => this.expandAll());
        this.elements.collapseAllBtn.addEventListener('click', () => this.collapseAll());
        this.elements.toggleMarkupBtn.addEventListener('click', () => this.toggleMarkup());

        // Settings
        this.elements.indentType.addEventListener('change', (e) => this.updateIndentPrefs());
        this.elements.indentSize.addEventListener('change', (e) => this.updateIndentPrefs());

        // Font controls
        this.elements.fontIncreaseBtn.addEventListener('click', () => this.increaseFontSize());
        this.elements.fontDecreaseBtn.addEventListener('click', () => this.decreaseFontSize());

        // YAML path input handling is now managed by AutocompleteAdapter
        // Only trigger evaluation on Enter key for explicit execution
        this.elements.yamlPathInput.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') {
                this.performYamlPathLookup();
            }
        });
        if (this.elements.yamlPathExecuteBtn) {
            this.elements.yamlPathExecuteBtn.addEventListener('click', () => this.performYamlPathLookup());
        }
        if (this.elements.yamlPathClearBtn) {
            this.elements.yamlPathClearBtn.addEventListener('click', () => this.clearYamlPath());
        }
        if (this.elements.clearSearchBtn) {
            this.elements.clearSearchBtn.addEventListener('click', () => this.clearYamlPath());
        }

        // History controls
        if (this.elements.historyLocalBtn) {
            this.elements.historyLocalBtn.addEventListener('click', () => this.showLocalHistory());
        }
        if (this.elements.historyGlobalBtn) {
            this.elements.historyGlobalBtn.addEventListener('click', () => this.showGlobalHistory());
        }
        if (this.elements.historyClearBtn) {
            this.elements.historyClearBtn.addEventListener('click', () => this.clearHistory());
        }
        if (this.elements.historyCloseBtn) {
            this.elements.historyCloseBtn.addEventListener('click', () => this.closeHistory());
        }

        // Header history buttons
        if (this.elements.historyToggleBtn) {
            console.log('Attaching event listener to historyToggleBtn');
            this.elements.historyToggleBtn.addEventListener('click', () => this.toggleHistory());
        }
        if (this.elements.globalHistoryBtn) {
            console.log('Attaching event listener to globalHistoryBtn:', this.elements.globalHistoryBtn);
            this.elements.globalHistoryBtn.addEventListener('click', () => {
                console.log('Global history button clicked!');
                this.toggleGlobalHistory();
            });
        } else {
            console.error('globalHistoryBtn element not found!');
        }

        // Input changes
        this.elements.yamlInput.addEventListener('input', () => this.debounceFormatting());
        this.elements.yamlInput.addEventListener('paste', () => this.handlePaste());

        // Validation
        this.elements.validateBtn.addEventListener('click', () => this.validateYaml());

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyboardShortcuts(e));
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
            console.log('Initializing YAML autocomplete...');
            console.log('AutocompleteAdapter available:', typeof AutocompleteAdapter !== 'undefined');
            console.log('yamlPathInput element:', this.elements.yamlPathInput);

            if (typeof AutocompleteAdapter !== 'undefined' && this.elements.yamlPathInput) {
                this.autocompleteAdapter = new AutocompleteAdapter(this.elements.yamlPathInput, {
                    documentType: 'yaml',
                    queryLanguage: 'yq',
                    maxSuggestions: 10,
                    debounceMs: 300, // Reduced for better responsiveness
                    minQueryLength: 1,
                    showDescriptions: true,
                    showSampleValues: true,
                    onSelect: (suggestion) => {
                        console.log('YAML suggestion selected:', suggestion);
                        // Apply the selected suggestion and trigger path query
                        this.elements.yamlPathInput.value = suggestion.query || suggestion.text;
                        this.performYamlPathLookup();
                    },
                    onShow: () => {
                        console.log('YAML autocomplete dropdown shown');
                    },
                    onHide: () => {
                        console.log('YAML autocomplete dropdown hidden');
                    },
                    onError: (error) => {
                        console.warn('YAML autocomplete error:', error);
                    }
                });
                console.log('YAML autocomplete adapter initialized successfully:', this.autocompleteAdapter);
            } else {
                console.warn('AutocompleteAdapter not available or yamlPathInput not found');
                console.log('Available classes:', Object.keys(window).filter(k => k.includes('Autocomplete')));
            }
        } catch (error) {
            console.error('Failed to initialize YAML path autocomplete:', error);
        }
    }

    formatYaml() {
        const input = this.elements.yamlInput.value.trim();
        if (!input) {
            this.showError('Please enter YAML data to format');
            return;
        }

        try {
            // Parse YAML
            const parsed = jsyaml.load(input);

            // Format with current indent preferences
            const indentSize = this.indentPrefs.type === 'tabs' ? 1 : parseInt(this.indentPrefs.size);
            const indentChar = this.indentPrefs.type === 'tabs' ? '\t' : ' ';

            const formatted = jsyaml.dump(parsed, {
                indent: indentSize,
                lineWidth: -1, // No line wrapping
                noRefs: true,
                sortKeys: false
            });

            this.displayOutput(formatted, parsed);
            this.updateStats(formatted, parsed);
            this.hideError();
            this.showSuccess('YAML formatted successfully');

            // Add to history
            this.saveToHistory(input, 'format');

        } catch (error) {
            this.showError(`Invalid YAML: ${error.message}`);
            this.elements.yamlStatus.textContent = 'Invalid';
        }
    }

    minifyYaml() {
        const input = this.elements.yamlInput.value.trim();
        if (!input) {
            this.showError('Please enter YAML data to minify');
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
            this.hideError();
            this.showSuccess('YAML minified successfully');

            // Add to history
            this.saveToHistory(input, 'minify');

        } catch (error) {
            this.showError(`Invalid YAML: ${error.message}`);
            this.elements.yamlStatus.textContent = 'Invalid';
        }
    }

    stringifyYaml() {
        const input = this.elements.yamlInput.value.trim();
        if (!input) {
            this.showError('Please enter YAML data to stringify');
            return;
        }

        try {
            // Parse YAML first
            const parsed = jsyaml.load(input);

            // Convert to JSON string representation
            const jsonString = JSON.stringify(parsed, null, 2);

            this.displayOutput(jsonString, parsed);
            this.updateStats(jsonString, parsed);
            this.hideError();
            this.showSuccess('YAML converted to JSON string successfully');

            // Add to history
            this.saveToHistory(input, 'stringify');

        } catch (error) {
            this.showError(`Invalid YAML: ${error.message}`);
            this.elements.yamlStatus.textContent = 'Invalid';
        }
    }

    clearAll() {
        this.elements.yamlInput.value = '';
        this.elements.yamlOutput.value = '';
        this.elements.yamlOutputFormatted.innerHTML = '';
        this.elements.yamlPathInput.value = '';
        this.elements.filePathLabel.textContent = '';
        this.hideError();
        this.hideSuccess();
        this.updateStats('', null);
        this.originalOutputData = null;
        this.currentSource = null;

        if (typeof validationUtils !== 'undefined') {
            validationUtils.clearValidationStatus(this.elements.validationStatus);
        }

        this.showSuccess('All fields cleared');
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

        if (parsedData) {
            // Update autocomplete with input data, not output
            this.updateAutocompleteDocument();
        }
    }

    /**
     * Update autocomplete when YAML data changes
     */
    updateAutocompleteDocument() {
        console.log('updateAutocompleteDocument called, adapter available:', !!this.autocompleteAdapter);
        if (!this.autocompleteAdapter) {
            console.warn('No autocomplete adapter available');
            return;
        }

        try {
            // For autocomplete, we need the original input data, not the formatted output
            const inputText = this.elements.yamlInput.value.trim();
            console.log('Updating autocomplete with input text length:', inputText.length);
            if (!inputText) {
                console.log('No input text, skipping autocomplete update');
                return;
            }

            // Pass original input to autocomplete for proper parsing
            console.log('Setting document on autocomplete adapter');
            this.autocompleteAdapter.setDocument(inputText);
            console.log('Autocomplete document updated successfully');
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
                    // Key-value pairs with potential hint text
                    highlightedLine = highlightedLine.replace(/^(\s*)([^:\s][^:]*?)(\s*:\s*)(.*)$/,
                        (match, indent, key, colon, value) => {
                            const escapedKey = escapeHtml(key);
                            const escapedValue = value;

                            // Check if this key has children (objects or arrays) to add hint
                            const hint = this.generateHintText(lines, index, indent.length);
                            const hintHtml = hint ? `<span class="yaml-hint">${hint}</span>` : '';

                            return `${indent}<span class="yaml-key">${escapedKey}</span>${colon}${this.highlightYamlValue(escapedValue)}${hintHtml}`;
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

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    generateHintText(lines, currentIndex, currentIndent) {
        // Look ahead to see if this key has children
        let childObjects = 0;
        let childArrays = 0;
        let childProperties = 0;

        for (let i = currentIndex + 1; i < lines.length; i++) {
            const line = lines[i];
            const lineIndent = line.search(/\S/);

            // If we've reached the same or lesser indentation, stop
            if (lineIndent <= currentIndent && line.trim() !== '') {
                break;
            }

            // Skip empty lines
            if (line.trim() === '') continue;

            // Count direct children only (one level deeper)
            if (lineIndent === currentIndent + 2) {
                if (line.trim().startsWith('-')) {
                    childArrays++;
                } else if (line.includes(':')) {
                    childObjects++;
                    childProperties++;
                }
            }
        }

        // Generate hint text based on what we found
        if (childObjects > 0 && childArrays > 0) {
            return `${childObjects} objects, ${childArrays} items`;
        } else if (childObjects > 0) {
            return `${childObjects} objects`;
        } else if (childArrays > 0) {
            return `${childArrays} items`;
        }

        return null;
    }

    addCollapsibleBehavior() {
        // Add collapsible behavior for nested structures
        const lines = this.elements.yamlOutputFormatted.querySelectorAll('.line');
        const indentLevels = new Map();

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

        this.elements.toggleMarkupBtn.textContent = this.markupEnabled ? 'Disable Markup' : 'Enable Markup';
    }

    updateIndentPrefs() {
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


    async performYamlPathLookup() {
        const path = this.elements.yamlPathInput.value.trim();
        if (!path) {
            this.clearYamlPath();
            return;
        }

        if (!this.originalOutputData) {
            this.showError('Please format some YAML first');
            return;
        }

        try {
            // Evaluate YAML path using the YQEvaluator from the autocomplete adapter
            const result = await this.autocompleteAdapter.getEngine().evaluator.evaluate(this.originalOutputData.parsedData, path);

            if (result !== undefined && result.length > 0) {
                const resultYaml = jsyaml.dump(result.length === 1 ? result[0] : result, {
                    indent: this.indentPrefs.type === 'tabs' ? 1 : parseInt(this.indentPrefs.size),
                    lineWidth: -1,
                    noRefs: true,
                    sortKeys: false
                });

                this.displayOutput(resultYaml, result, true); // true = isYamlPathResult
                this.updateStats(resultYaml, result);
                this.hideError();
                this.showSuccess(`YAML path query executed: ${path}`);
            } else {
                this.showError('Path not found or returned no results');
            }
        } catch (error) {
            this.showError(`Invalid path expression: ${error.message}`);
        }
    }

    clearYamlPath() {
        this.elements.yamlPathInput.value = '';

        // Restore original data if available
        if (this.originalOutputData) {
            this.displayOutput(this.originalOutputData.text, this.originalOutputData.parsedData, false);
            this.updateStats(this.originalOutputData.text, this.originalOutputData.parsedData);
            this.showSuccess('Original data restored');
        }
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

    showLocalHistory() {
        if (this.historyManager) {
            this.historyManager.showHistory('local');
            if (this.elements.historyDropdown) {
                this.elements.historyDropdown.style.display = 'block';
            }
        }
    }

    showGlobalHistory() {
        if (this.historyManager) {
            this.historyManager.showHistory('global');
            if (this.elements.historyDropdown) {
                this.elements.historyDropdown.style.display = 'block';
            }
        }
    }

    clearHistory() {
        if (this.historyManager) {
            this.historyManager.clearHistory();
            this.showSuccess('History cleared');
        }
    }

    closeHistory() {
        if (this.elements.historyDropdown) {
            this.elements.historyDropdown.style.display = 'none';
        }
    }

    toggleHistory() {
        if (this.historyManager) {
            this.historyManager.toggleHistory();
        }
    }

    toggleGlobalHistory() {
        console.log('toggleGlobalHistory called, historyManager:', this.historyManager);
        if (this.historyManager) {
            console.log('Calling historyManager.toggleGlobalHistory()');
            this.historyManager.toggleGlobalHistory();
        } else {
            console.error('historyManager not available');
        }
    }

    async copyToClipboard() {
        const text = this.markupEnabled ? this.lastOutputText : this.elements.yamlOutput.value;

        if (!text) {
            this.showError('No output to copy');
            return;
        }

        try {
            await navigator.clipboard.writeText(text);
            this.showSuccess('Copied to clipboard');
        } catch (error) {
            this.showError('Failed to copy to clipboard');
        }
    }

    async copyFormattedToClipboard() {
        const formattedHtml = this.elements.yamlOutputFormatted.innerHTML;

        if (!formattedHtml) {
            this.showError('No formatted output to copy');
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

            this.showSuccess('Formatted output copied to clipboard');
        } catch (error) {
            // Fallback to plain text
            try {
                await navigator.clipboard.writeText(this.elements.yamlOutputFormatted.textContent);
                this.showSuccess('Plain text copied to clipboard');
            } catch (fallbackError) {
                this.showError('Failed to copy to clipboard');
            }
        }
    }

    loadFromSource() {
        if (this.sourceSelector) {
            this.sourceSelector.show();
        } else {
            this.showError('Source selector not available');
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
        this.showSuccess(`Data loaded from source: ${source.name}`);
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
            this.showSuccess(`File "${file.name}" loaded successfully`);
        };

        reader.onerror = () => {
            this.showError('Failed to read file');
        };

        reader.readAsText(file);
    }

    validateYaml() {
        const input = this.elements.yamlInput.value.trim();
        if (!input) {
            this.showError('Please enter YAML data to validate');
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
                this.showSuccess('YAML is syntactically valid');
            }
        } catch (error) {
            if (typeof validationUtils !== 'undefined') {
                validationUtils.showValidationResult(
                    this.elements.validationStatus,
                    false,
                    `Invalid YAML: ${error.message}`
                );
            } else {
                this.showError(`Invalid YAML: ${error.message}`);
            }
        }
    }

    debounceFormatting() {
        clearTimeout(this.formatTimeout);
        this.formatTimeout = setTimeout(() => {
            const currentInput = this.elements.yamlInput.value;
            if (currentInput !== this.lastInputData && currentInput.trim()) {
                this.lastInputData = currentInput;
                this.formatYaml();
            }
        }, 1000);
    }

    handlePaste() {
        // Small delay to let paste complete
        setTimeout(() => {
            const input = this.elements.yamlInput.value.trim();
            if (input) {
                this.formatYaml();
            }
        }, 100);
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
            this.copyToClipboard();
        }

        // Ctrl/Cmd + Shift + L: Clear
        if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'L') {
            event.preventDefault();
            this.clearAll();
        }
    }

    updateStats(yamlText, parsedData) {
        if (!yamlText && !parsedData) {
            this.elements.yamlStatus.textContent = 'Ready';
            this.elements.yamlSize.textContent = '0 chars';
            this.elements.yamlLines.textContent = '0 lines';
            this.elements.yamlObjects.textContent = '0 objects';
            this.elements.yamlArrays.textContent = '0 arrays';
            this.elements.yamlProperties.textContent = '0 properties';
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
            this.elements.yamlObjects.textContent = `${stats.objects} objects`;
            this.elements.yamlArrays.textContent = `${stats.arrays} arrays`;
            this.elements.yamlProperties.textContent = `${stats.properties} properties`;
        } else {
            this.elements.yamlObjects.textContent = '0 objects';
            this.elements.yamlArrays.textContent = '0 arrays';
            this.elements.yamlProperties.textContent = '0 properties';
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

    showError(message) {
        this.elements.errorMessage.textContent = message;
        this.elements.errorMessage.style.display = 'block';
        this.elements.successMessage.style.display = 'none';

        setTimeout(() => this.hideError(), 5000);
    }

    showSuccess(message) {
        this.elements.successMessage.textContent = message;
        this.elements.successMessage.style.display = 'block';
        this.elements.errorMessage.style.display = 'none';

        setTimeout(() => this.hideSuccess(), 3000);
    }

    hideError() {
        this.elements.errorMessage.style.display = 'none';
    }

    hideSuccess() {
        this.elements.successMessage.style.display = 'none';
    }
}

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = YamlTool;
}

// Initialize when DOM is loaded (only in browser environment)
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        console.log('DOM loaded, checking available classes:');
        console.log('DocumentQuerySuggestionEngine:', typeof DocumentQuerySuggestionEngine);
        console.log('AutocompleteAdapter:', typeof AutocompleteAdapter);
        console.log('YAMLDocumentParser:', typeof YAMLDocumentParser);
        console.log('YQEvaluator:', typeof YQEvaluator);

        window.yamlTool = new YamlTool();
    });
}