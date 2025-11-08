/**
 * Enhanced JSON Tool - JavaScript Logic
 * Features: JSON/JSONL formatting, syntax highlighting, collapsible elements, JSONPath lookup
 */

class JsonTool {
    constructor() {
        this.toolName = 'json-tool';
        this.lastInputData = '';  // Track last input to detect changes
        this.lastOutputText = '';  // Track last output for markup toggling
        this.originalOutputData = null;  // Store original data before JSONPath filtering
        this.markupEnabled = true;
        this.indentPrefs = { type: 'spaces', size: 2 };
        this.fontSize = parseInt(localStorage.getItem(`${this.toolName}-fontSize`) || '12');
        this.currentSource = null;  // Track current source for validation
        this.autocompleteAdapter = null;  // Generic autocomplete adapter

        // Initialize web worker for heavy processing
        this.workerManager = null;
        this.useWorker = true; // Enable/disable worker usage
        this.workerThreshold = 500000; // Characters threshold to use worker (500KB)
        this.maxFileSize = 20000000; // Maximum file size to process (20MB)
        this.initializeWorker();

        this.initializeElements();
        this.overrideGlobalNotifications(); // Override big notifications with small ones
        this.attachEventListeners();
        this.initializeHistoryManager();
        this.initializeSourceSelector(); // This is now async but we don't need to wait
        this.initializeValidation();
        this.initializeJsonPathAutocomplete();
        this.applyFontSize();
    }

    initializeElements() {
        this.elements = {
            // Core elements
            jsonInput: document.getElementById('jsonInput'),
            jsonOutput: document.getElementById('jsonOutput'),
            jsonOutputFormatted: document.getElementById('jsonOutputFormatted'),

            // Action buttons
            formatBtn: document.getElementById('formatBtn'),
            minifyBtn: document.getElementById('minifyBtn'),
            stringifyBtn: document.getElementById('stringifyBtn'),
            clearBtn: document.getElementById('clearBtn'),
            saveBtn: document.getElementById('saveBtn'),
            saveTooltip: document.getElementById('saveTooltip'),
            saveDescriptionInput: document.getElementById('saveDescriptionInput'),
            saveTooltipSave: document.getElementById('saveTooltipSave'),
            saveTooltipCancel: document.getElementById('saveTooltipCancel'),
            copyBtn: document.getElementById('copyBtn'),
            copyFormattedBtn: document.getElementById('copyFormattedBtn'),
            loadFromSourceBtn: document.getElementById('loadFromSourceBtn'),

            // File upload elements
            fileInput: document.getElementById('fileInput'),
            uploadFileBtn: document.getElementById('uploadFileBtn'),
            filePathLabel: document.getElementById('filePathLabel'),
            filePathTooltip: document.getElementById('filePathTooltip'),

            // Collapsible controls
            expandAllBtn: document.getElementById('expandAllBtn'),
            collapseAllBtn: document.getElementById('collapseAllBtn'),
            toggleMarkupBtn: document.getElementById('toggleMarkupBtn'),

            // Controls
            indentType: document.getElementById('indentType'),
            indentSize: document.getElementById('indentSize'),
            fontIncreaseBtn: document.getElementById('fontIncreaseBtn'),
            fontDecreaseBtn: document.getElementById('fontDecreaseBtn'),
            jsonPathInput: document.getElementById('jsonPathInput'),
            clearSearchBtn: document.getElementById('clearSearchBtn'),

            // Validation elements
            validationControls: document.getElementById('validationControls'),
            validationStatus: document.getElementById('validationStatus'),
            validatorSelect: document.getElementById('validatorSelect'),
            validateBtn: document.getElementById('validateBtn'),

            // Status
            statusMessages: document.getElementById('statusMessages'),
            jsonStatus: document.getElementById('jsonStatus'),
            jsonSize: document.getElementById('jsonSize'),
            jsonLines: document.getElementById('jsonLines'),
            jsonObjects: document.getElementById('jsonObjects'),
            jsonArrays: document.getElementById('jsonArrays'),
            jsonProperties: document.getElementById('jsonProperties')
        };
    }

    /**
     * Override global notification system to use small notifications
     */
    overrideGlobalNotifications() {
        // Store reference to this instance for the global override
        const jsonTool = this;

        // Override the global showStatusMessage function
        window.showStatusMessage = function(message, type = 'info', duration = 3000) {
            jsonTool.showMessage(message, type);
        };
    }

    /**
     * Initialize web worker for heavy processing
     */
    initializeWorker() {
        try {
            if (typeof WorkerManager !== 'undefined') {
                this.workerManager = new WorkerManager('/static/js/workers/json-worker.js');
                console.log('Web Worker initialized for JSON processing');
            } else {
                console.warn('WorkerManager not available, using synchronous processing');
                this.useWorker = false;
            }
        } catch (error) {
            console.error('Failed to initialize worker:', error);
            this.useWorker = false;
        }
    }

    /**
     * Check if worker should be used for given data size
     */
    shouldUseWorker(dataSize) {
        return this.useWorker &&
               this.workerManager &&
               this.workerManager.isReady() &&
               dataSize > this.workerThreshold;
    }

    /**
     * Check if file is too large to process safely
     */
    isFileTooLarge(dataSize) {
        if (dataSize > this.maxFileSize) {
            const sizeMB = (dataSize / 1024 / 1024).toFixed(2);
            const maxSizeMB = (this.maxFileSize / 1024 / 1024).toFixed(2);
            this.showMessage(`File too large (${sizeMB}MB). Maximum supported size is ${maxSizeMB}MB. Please use a smaller file.`, 'error');
            return true;
        }
        return false;
    }

    attachEventListeners() {
        // Main action buttons
        this.elements.formatBtn.addEventListener('click', () => this.formatJson());
        this.elements.minifyBtn.addEventListener('click', () => this.minifyJson());
        this.elements.stringifyBtn.addEventListener('click', () => this.stringifyJson());
        this.elements.clearBtn.addEventListener('click', () => this.clearInputs());
        this.elements.saveBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.showSaveTooltip();
        });
        this.elements.saveTooltipSave.addEventListener('click', () => this.saveOutput());
        this.elements.saveTooltipCancel.addEventListener('click', () => this.hideSaveTooltip());
        this.elements.saveDescriptionInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.saveOutput();
            } else if (e.key === 'Escape') {
                this.hideSaveTooltip();
            }
        });
        this.elements.copyBtn.addEventListener('click', () => this.copyOutput());
        this.elements.copyFormattedBtn.addEventListener('click', () => this.copyFormatted());

        // Collapsible controls
        this.elements.expandAllBtn.addEventListener('click', () => this.expandAll());
        this.elements.collapseAllBtn.addEventListener('click', () => this.collapseAll());
        this.elements.toggleMarkupBtn.addEventListener('click', () => this.toggleMarkup());

        // File path tooltip functionality
        this.setupFilePathTooltip();

        // Controls
        this.elements.indentType.addEventListener('change', () => this.updateIndentPreference());
        this.elements.indentSize.addEventListener('change', () => this.updateIndentPreference());
        this.elements.fontIncreaseBtn.addEventListener('click', () => this.increaseFontSize());
        this.elements.fontDecreaseBtn.addEventListener('click', () => this.decreaseFontSize());
        // JSONPath input handling is now managed by AutocompleteAdapter
        // Only trigger evaluation on Enter key for explicit execution
        this.elements.jsonPathInput.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') {
                this.performJsonPathLookup();
            }
        });
        this.elements.clearSearchBtn.addEventListener('click', () => this.clearSearch());

        // Functions help button
        const functionsHelpBtn = document.getElementById('functionsHelpBtn');
        if (functionsHelpBtn) {
            functionsHelpBtn.addEventListener('click', () => this.showFunctionsHelp());
        }

        // Patterns button
        const patternsBtn = document.getElementById('patternsBtn');
        if (patternsBtn) {
            patternsBtn.addEventListener('click', () => this.showPatternsHelp());
        }

        // Input change detection for real-time stats
        this.elements.jsonInput.addEventListener('input', () => this.updateJsonStats());

        let formatTimeout;
        this.elements.jsonInput.addEventListener('keyup', () => {
            clearTimeout(formatTimeout);
            formatTimeout = setTimeout(() => {
                this.formatJson();
            }, 1000);
        });

        // Prevent form submission on Enter key
        this.elements.jsonInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
                e.preventDefault(); // Prevent default form behavior
            }
        });

        // Close save tooltip when clicking outside
        document.addEventListener('click', (e) => {
            if (this.elements.saveTooltip &&
                this.elements.saveTooltip.style.display !== 'none' &&
                !this.elements.saveTooltip.contains(e.target) &&
                !this.elements.saveBtn.contains(e.target)) {
                this.hideSaveTooltip();
            }
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
     * Format JSON with proper indentation and validation
     */
    async formatJson() {
        const input = this.elements.jsonInput.value.trim();

        if (!input) {
            this.showMessage('Please enter JSON or JSONL data to format.', 'warning');
            return;
        }

        // Check file size limit
        if (this.isFileTooLarge(input.length)) {
            return;
        }

        try {
            // Auto-detect format and route to appropriate handler
            if (this.isJsonl(input)) {
                this.formatJsonlData(input);
            } else {
                // Check if we should use worker for large files
                if (this.shouldUseWorker(input.length)) {
                    this.showMessage('Processing large file...', 'info');

                    try {
                        const result = await this.workerManager.execute('format', {
                            text: input,
                            indentType: this.indentPrefs.type,
                            indentSize: this.indentPrefs.size
                        });

                        // Parse the result to get the object for storage
                        const parsed = JSON.parse(input);
                        this.displayOutput(result.formatted, parsed);
                        this.showMessage(`JSON formatted successfully! (${result.stats.lines} lines, ${result.stats.size} chars)`, 'success');
                        this.saveToHistory(input, 'format');
                    } catch (workerError) {
                        console.warn('Worker failed, falling back to synchronous:', workerError);
                        // Fall back to synchronous processing
                        this.formatJsonSync(input);
                    }
                } else {
                    // Small files use synchronous processing
                    this.formatJsonSync(input);
                }
            }
        } catch (error) {
            this.handleJsonError(error);
        }
    }

    /**
     * Synchronous JSON formatting (fallback and for small files)
     */
    formatJsonSync(input) {
        const parsed = JSON.parse(input);
        const formatted = this.formatJsonWithIndent(parsed);

        this.displayOutput(formatted, parsed);
        this.showMessage('JSON formatted successfully!', 'success');
        this.saveToHistory(input, 'format');
    }

    /**
     * Format JSONL (JSON Lines) data
     */
    formatJsonlData(input) {
        if (!input) {
            this.showMessage('Please enter JSONL data to format.', 'warning');
            return;
        }

        try {
            // Parse complete JSON objects from the input (handles both compact and formatted JSONL)
            const jsonObjects = this.parseJsonlObjects(input);
            
            if (jsonObjects.length === 0) {
                this.showMessage('No valid JSON objects found.', 'warning');
                return;
            }

            // Format each complete JSON object
            const formattedLines = [];
            
            for (const jsonObj of jsonObjects) {
                formattedLines.push(this.formatJsonWithIndent(jsonObj));
            }

            const formatted = formattedLines.join('\n\n');
            
            // Calculate combined stats for all objects
            const combinedStats = this.analyzeCombinedJsonStructure(jsonObjects);
            this.displayOutput(formatted, { combined: true, stats: combinedStats });
            this.showMessage(`JSONL formatted successfully! ${jsonObjects.length} objects processed.`, 'success');
            this.saveToHistory(input, 'format-jsonl');
            
        } catch (error) {
            this.handleJsonError(error);
        }
    }

    /**
     * Analyze combined JSON structure for JSONL
     */
    analyzeCombinedJsonStructure(jsonArray) {
        let totalObjects = 0;
        let totalArrays = 0;
        let totalProperties = 0;

        jsonArray.forEach(obj => {
            const stats = this.analyzeJsonStructure(obj);
            totalObjects += stats.objects;
            totalArrays += stats.arrays;
            totalProperties += stats.properties;
        });

        return {
            objects: totalObjects,
            arrays: totalArrays,
            properties: totalProperties,
            lines: jsonArray.length
        };
    }

    /**
     * Minify JSON by removing whitespace (auto-detects JSON vs JSONL)
     */
    minifyJson() {
        const input = this.elements.jsonInput.value.trim();

        if (!input) {
            this.showMessage('Please enter JSON data to minify.', 'warning');
            return;
        }

        // Check file size limit
        if (this.isFileTooLarge(input.length)) {
            return;
        }

        // Auto-detect if it's JSONL
        if (this.isJsonl(input)) {
            this.minifyJsonl();
        } else {
            this.minifySingleJson(input);
        }
    }

    /**
     * Check if input is JSONL format
     */
    isJsonl(input) {
        // Check if input contains multiple JSON objects
        try {
            // First, try to parse as single JSON - if successful, it's not JSONL
            JSON.parse(input);
            return false;
        } catch (e) {
            // If it fails as single JSON, check if it's JSONL
        }
        
        // Split by lines and try to parse line by line first (for compact JSONL)
        const lines = input.split('\n').filter(line => line.trim());
        if (lines.length <= 1) return false;
        
        // Check if each line is valid JSON (compact JSONL)
        let validLines = 0;
        for (const line of lines) {
            try {
                JSON.parse(line.trim());
                validLines++;
            } catch (e) {
                // If line parsing fails, break and try formatted JSONL detection
                break;
            }
        }
        
        // If all lines parsed successfully as individual JSON objects, it's JSONL
        if (validLines === lines.length && validLines > 1) {
            return true;
        }
        
        // Try to detect formatted JSONL (multiple complete JSON objects)
        const jsonObjectsFound = this.detectFormattedJsonl(input);
        return jsonObjectsFound > 1;
    }

    /**
     * Detect formatted JSONL by trying to parse complete JSON objects
     */
    detectFormattedJsonl(input) {
        const lines = input.split('\n');
        let jsonObjectsFound = 0;
        let currentJson = '';
        let braceDepth = 0;
        let inString = false;
        let escapeNext = false;
        
        for (const line of lines) {
            currentJson += line + '\n';
            
            // Track brace depth to find complete JSON objects
            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                
                if (escapeNext) {
                    escapeNext = false;
                    continue;
                }
                
                if (char === '\\') {
                    escapeNext = true;
                    continue;
                }
                
                if (char === '"' && !escapeNext) {
                    inString = !inString;
                }
                
                if (!inString) {
                    if (char === '{') {
                        braceDepth++;
                    } else if (char === '}') {
                        braceDepth--;
                        
                        // When we reach depth 0, we might have a complete JSON object
                        if (braceDepth === 0 && currentJson.trim()) {
                            try {
                                JSON.parse(currentJson.trim());
                                jsonObjectsFound++;
                                currentJson = '';
                            } catch (e) {
                                // Not a valid JSON object yet, continue
                            }
                        }
                    }
                }
            }
        }
        
        return jsonObjectsFound;
    }

    /**
     * Parse complete JSON objects from JSONL input (handles both compact and formatted)
     */
    parseJsonlObjects(input) {
        const lines = input.split('\n');
        const jsonObjects = [];
        let currentJson = '';
        let braceDepth = 0;
        let inString = false;
        let escapeNext = false;
        
        for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
            const line = lines[lineIndex];
            currentJson += line + '\n';
            
            // Track brace depth to find complete JSON objects
            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                
                if (escapeNext) {
                    escapeNext = false;
                    continue;
                }
                
                if (char === '\\') {
                    escapeNext = true;
                    continue;
                }
                
                if (char === '"' && !escapeNext) {
                    inString = !inString;
                }
                
                if (!inString) {
                    if (char === '{') {
                        braceDepth++;
                    } else if (char === '}') {
                        braceDepth--;
                        
                        // When we reach depth 0, we have a complete JSON object
                        if (braceDepth === 0 && currentJson.trim()) {
                            try {
                                const parsed = JSON.parse(currentJson.trim());
                                jsonObjects.push(parsed);
                                currentJson = '';
                            } catch (e) {
                                throw new Error(`Invalid JSON object ending at line ${lineIndex + 1}: ${e.message}`);
                            }
                        }
                    }
                }
            }
        }
        
        // Handle any remaining JSON that might be incomplete
        if (currentJson.trim() && braceDepth !== 0) {
            throw new Error(`Incomplete JSON object found. Unmatched braces (depth: ${braceDepth})`);
        }
        
        return jsonObjects;
    }

    /**
     * Minify single JSON object
     */
    async minifySingleJson(input) {
        try {
            // Check if we should use worker for large files
            if (this.shouldUseWorker(input.length)) {
                this.showMessage('Minifying large file...', 'info');

                try {
                    const result = await this.workerManager.execute('minify', {
                        text: input
                    });

                    const parsed = JSON.parse(input);
                    this.displayOutput(result.minified, parsed);
                    this.showMessage(`JSON minified successfully! Reduced from ${result.stats.originalSize} to ${result.stats.minifiedSize} characters (${result.stats.reduction}% reduction).`, 'success');
                    this.saveToHistory(input, 'minify');
                } catch (workerError) {
                    console.warn('Worker failed, falling back to synchronous:', workerError);
                    this.minifySingleJsonSync(input);
                }
            } else {
                this.minifySingleJsonSync(input);
            }
        } catch (error) {
            this.handleJsonError(error);
        }
    }

    /**
     * Synchronous minify (fallback and for small files)
     */
    minifySingleJsonSync(input) {
        const parsed = JSON.parse(input);
        const minified = JSON.stringify(parsed);

        this.displayOutput(minified, parsed);
        this.showMessage(`JSON minified successfully! Reduced from ${input.length} to ${minified.length} characters.`, 'success');
        this.saveToHistory(input, 'minify');
    }

    /**
     * Minify JSONL data (handles both compact and formatted JSONL)
     */
    minifyJsonl() {
        const input = this.elements.jsonInput.value.trim();
        
        try {
            // Parse complete JSON objects from the input (handles formatted JSONL)
            const jsonObjects = this.parseJsonlObjects(input);
            
            if (jsonObjects.length === 0) {
                this.showMessage('No valid JSON objects found.', 'warning');
                return;
            }

            // Minify each complete JSON object
            const minifiedLines = [];
            const allParsed = [];
            
            for (const jsonObj of jsonObjects) {
                allParsed.push(jsonObj);
                const minified = JSON.stringify(jsonObj);
                minifiedLines.push(minified);
            }

            const minified = minifiedLines.join('\n');
            const combinedStats = this.analyzeCombinedJsonStructure(allParsed);
            
            this.displayOutput(minified, { combined: true, stats: combinedStats });
            this.showMessage(`JSONL minified successfully! ${jsonObjects.length} objects processed. Reduced from ${input.length} to ${minified.length} characters.`, 'success');
            this.saveToHistory(input, 'minify-jsonl');
            
        } catch (error) {
            this.handleJsonError(error);
        }
    }

    /**
     * Stringify JSON (escape for use in strings)
     */
    stringifyJson() {
        const input = this.elements.jsonInput.value.trim();

        if (!input) {
            this.showMessage('Please enter JSON data to stringify.', 'warning');
            return;
        }

        // Check file size limit
        if (this.isFileTooLarge(input.length)) {
            return;
        }

        try {
            const parsed = JSON.parse(input);
            const minified = JSON.stringify(parsed);
            const stringified = JSON.stringify(minified);
            
            this.displayOutput(stringified, parsed);
            this.showMessage('JSON stringified successfully!', 'success');
            this.saveToHistory(input, 'stringify');
            
        } catch (error) {
            this.handleJsonError(error);
        }
    }

    /**
     * Format JSON with current indent preferences
     */
    formatJsonWithIndent(obj, customIndentSize = null) {
        let indent;
        if (customIndentSize !== null) {
            indent = ' '.repeat(customIndentSize);
        } else {
            indent = this.indentPrefs.type === 'tabs' ? '\t' : ' '.repeat(this.indentPrefs.size);
        }
        return JSON.stringify(obj, null, indent);
    }

    /**
     * Display output with syntax highlighting if markup is enabled
     */
    displayOutput(text, parsedData = null, isJsonPathResult = false, preformatted = false) {
        // Store the raw text for toggling
        this.lastOutputText = text;
        
        // Store original data if this is not a JSONPath result
        if (!isJsonPathResult && parsedData !== null) {
            this.originalOutputData = { text: text, parsedData: parsedData };
        }
        
        if (this.markupEnabled) {
            this.elements.jsonOutput.style.display = 'none';
            this.elements.jsonOutputFormatted.style.display = 'block';
            this.elements.jsonOutput.value = text; // Keep textarea in sync
            if (preformatted) {
                this.elements.jsonOutputFormatted.innerHTML = text;
            } else {
                this.elements.jsonOutputFormatted.innerHTML = this.highlightJson(text);
            }
        } else {
            this.elements.jsonOutput.style.display = 'block';
            this.elements.jsonOutputFormatted.style.display = 'none';
            this.elements.jsonOutput.value = text;
        }

        if (parsedData) {
            this.updateJsonStats(parsedData);
            // Update autocomplete with new data
            this.updateAutocompleteDocument();
        }
    }

    /**
     * Highlight JSON syntax with colors and collapsible elements
     */
    highlightJson(jsonStr) {
        // Use a more reliable tokenizer approach
        const tokens = this.tokenizeJson(jsonStr);
        let html = '';
        let indent = 0;
        
        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            
            switch (token.type) {
                case 'string':
                    // Determine if it's a key by looking ahead for colon (skip whitespace)
                    let isKey = false;
                    for (let j = i + 1; j < tokens.length; j++) {
                        if (tokens[j].type === 'whitespace') continue;
                        if (tokens[j].type === 'colon') {
                            isKey = true;
                        }
                        break;
                    }
                    html += `<span class="json-${isKey ? 'key' : 'string'}">"${this.escapeHtml(token.value)}"</span>`;
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
                    
                case 'comma':
                case 'colon':
                    html += `<span class="json-punctuation">${token.value}</span>`;
                    break;
                    
                case 'whitespace':
                    html += token.value;
                    break;
                    
                default:
                    html += this.escapeHtml(token.value);
            }
        }
        
        return html;
    }

    /**
     * Tokenize JSON string into typed tokens
     */
    tokenizeJson(jsonStr) {
        const tokens = [];
        let i = 0;
        
        while (i < jsonStr.length) {
            const char = jsonStr[i];
            
            // Handle strings
            if (char === '"') {
                let value = '';
                i++; // Skip opening quote
                
                while (i < jsonStr.length && jsonStr[i] !== '"') {
                    if (jsonStr[i] === '\\' && i + 1 < jsonStr.length) {
                        value += jsonStr[i] + jsonStr[i + 1];
                        i += 2;
                    } else {
                        value += jsonStr[i];
                        i++;
                    }
                }
                i++; // Skip closing quote
                tokens.push({ type: 'string', value: value });
                continue;
            }
            
            // Handle whitespace
            if (/\s/.test(char)) {
                let whitespace = '';
                while (i < jsonStr.length && /\s/.test(jsonStr[i])) {
                    whitespace += jsonStr[i];
                    i++;
                }
                tokens.push({ type: 'whitespace', value: whitespace });
                continue;
            }
            
            // Handle punctuation
            if (char === '{') {
                tokens.push({ type: 'openBrace', value: char });
                i++;
                continue;
            }
            if (char === '}') {
                tokens.push({ type: 'closeBrace', value: char });
                i++;
                continue;
            }
            if (char === '[') {
                tokens.push({ type: 'openBracket', value: char });
                i++;
                continue;
            }
            if (char === ']') {
                tokens.push({ type: 'closeBracket', value: char });
                i++;
                continue;
            }
            if (char === ':') {
                tokens.push({ type: 'colon', value: char });
                i++;
                continue;
            }
            if (char === ',') {
                tokens.push({ type: 'comma', value: char });
                i++;
                continue;
            }
            
            // Handle values (numbers, booleans, null)
            let value = '';
            while (i < jsonStr.length && !/[\s,\}\]\:]/.test(jsonStr[i])) {
                value += jsonStr[i];
                i++;
            }
            
            if (value === 'true' || value === 'false') {
                tokens.push({ type: 'boolean', value: value });
            } else if (value === 'null') {
                tokens.push({ type: 'null', value: value });
            } else if (/^-?\d+\.?\d*$/.test(value)) {
                tokens.push({ type: 'number', value: value });
            } else {
                tokens.push({ type: 'unknown', value: value });
            }
        }
        
        return tokens;
    }


    /**
     * Escape HTML characters
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Generate a preview of text with whitespace normalization and truncation
     */
    _generatePreview(text, maxLength = 100) {
        if (!text) return '';
        
        // Normalize whitespace - collapse multiple whitespace into single spaces
        const normalized = text.replace(/\s+/g, ' ').trim();
        
        // Truncate if too long
        if (normalized.length > maxLength) {
            return normalized.substring(0, maxLength) + '...';
        }
        
        return normalized;
    }

    /**
     * Toggle between markup and plain text display
     */
    toggleMarkup() {
        this.markupEnabled = !this.markupEnabled;
        this.elements.toggleMarkupBtn.textContent = this.markupEnabled ? 'Remove Markup' : 'Add Markup';
        
        // Use the stored raw text to avoid corruption
        if (this.lastOutputText) {
            if (this.markupEnabled) {
                this.elements.jsonOutput.style.display = 'none';
                this.elements.jsonOutputFormatted.style.display = 'block';
                this.elements.jsonOutputFormatted.innerHTML = this.highlightJson(this.lastOutputText);
            } else {
                this.elements.jsonOutput.style.display = 'block';
                this.elements.jsonOutputFormatted.style.display = 'none';
                this.elements.jsonOutput.value = this.lastOutputText;
            }
        }
    }

    /**
     * Expand all collapsible elements
     */
    expandAll() {
        document.querySelectorAll('.expand-collapse-btn').forEach(btn => {
            btn.textContent = '-';
            const content = btn.nextSibling;
            if (content && content.classList && content.classList.contains('collapsed-content')) {
                content.style.display = 'inline';
                content.classList.remove('collapsed-content');
            }
        });
    }

    /**
     * Collapse all collapsible elements
     */
    collapseAll() {
        document.querySelectorAll('.expand-collapse-btn').forEach(btn => {
            btn.textContent = '+';
            const content = btn.nextSibling;
            if (content) {
                content.style.display = 'none';
                content.classList.add('collapsed-content');
            }
        });
    }

    /**
     * Update indent preferences
     */
    updateIndentPreference() {
        this.indentPrefs.type = this.elements.indentType.value;
        this.indentPrefs.size = parseInt(this.elements.indentSize.value);
        this.formatJson();
    }

    /**
     * Increase font size
     */
    increaseFontSize() {
        if (this.fontSize < 24) {
            this.fontSize += 1;
            this.applyFontSize();
            this.saveFontSize();
        }
    }

    /**
     * Decrease font size
     */
    decreaseFontSize() {
        if (this.fontSize > 8) {
            this.fontSize -= 1;
            this.applyFontSize();
            this.saveFontSize();
        }
    }

    /**
     * Apply font size to textarea elements
     */
    applyFontSize() {
        this.elements.jsonInput.style.fontSize = `${this.fontSize}px`;
        this.elements.jsonOutput.style.fontSize = `${this.fontSize}px`;
        if (this.elements.jsonOutputFormatted) {
            this.elements.jsonOutputFormatted.style.fontSize = `${this.fontSize}px`;
        }
    }

    /**
     * Save font size to localStorage
     */
    saveFontSize() {
        localStorage.setItem(`${this.toolName}-fontSize`, this.fontSize.toString());
    }

    /**
     * Parse JSONPath expression with functions
     * Supports syntax: $.path | function() or function($.path)
     */
    parseJsonPathWithFunctions(expression) {
        expression = expression.trim();
        console.log('Parsing expression:', expression);

        // Check for chained functions FIRST: $.path | func1() | func2('param') | $.nextPath
        // This needs to be checked before single pipe to avoid incorrect matching
        if (expression.includes('|')) {
            const parts = expression.split('|').map(p => p.trim());

            // Separate functions from paths
            const path = parts[0];
            const functions = [];
            let nextPath = null;

            for (let i = 1; i < parts.length; i++) {
                const part = parts[i];
                // Check if this part is a function (has function pattern with parentheses)
                // Use a more sophisticated approach to handle nested parentheses
                const funcNameMatch = part.match(/^(\w+)\s*\(/);
                if (funcNameMatch) {
                    const funcName = funcNameMatch[1].trim();
                    // Extract parameters by counting parentheses
                    let parenCount = 0;
                    let paramStart = part.indexOf('(') + 1;
                    let paramEnd = paramStart;

                    for (let j = paramStart; j < part.length; j++) {
                        if (part[j] === '(') parenCount++;
                        else if (part[j] === ')') {
                            if (parenCount === 0) {
                                paramEnd = j;
                                break;
                            }
                            parenCount--;
                        }
                    }

                    const funcParams = part.substring(paramStart, paramEnd).trim();
                    // Parse parameters - handle quoted strings
                    const params = funcParams ? this.parseFunctionParams(funcParams) : [];
                    functions.push({ name: funcName, params });
                } else {
                    // This is a JSONPath, not a function
                    // Everything from here onwards is the next path
                    nextPath = parts.slice(i).join('|').trim();
                    break;
                }
            }

            if (functions.length > 0 || nextPath) {
                const result = { path, functions, nextPath };
                console.log('Matched pipe syntax:', result);
                return result;
            }
        }

        // Check for function syntax: function($.path)
        const funcMatch = expression.match(/^(\w+)\s*\(\s*(.+?)\s*\)$/);
        if (funcMatch) {
            const result = {
                path: funcMatch[2].trim(),
                functions: [{ name: funcMatch[1], params: [] }],
                nextPath: null
            };
            console.log('Matched function syntax:', result);
            return result;
        }

        // No functions, just a path
        const result = {
            path: expression,
            functions: [],
            nextPath: null
        };
        console.log('No functions, plain path:', result);
        return result;
    }

    /**
     * Parse function parameters for multi-parameter functions like contains()
     * Handles nested parentheses, brackets, and quoted strings
     */
    parseFunctionParameters(paramsStr) {
        if (!paramsStr) return [];

        const params = [];
        let currentParam = '';
        let parenCount = 0;
        let bracketCount = 0;
        let inString = false;
        let stringChar = null;

        for (let i = 0; i < paramsStr.length; i++) {
            const char = paramsStr[i];

            // Handle string boundaries
            if ((char === '"' || char === "'") && (i === 0 || paramsStr[i - 1] !== '\\')) {
                if (!inString) {
                    inString = true;
                    stringChar = char;
                } else if (char === stringChar) {
                    inString = false;
                    stringChar = null;
                }
                currentParam += char;
                continue;
            }

            // If inside string, add character and continue
            if (inString) {
                currentParam += char;
                continue;
            }

            // Handle parentheses and brackets
            if (char === '(') parenCount++;
            else if (char === ')') parenCount--;
            else if (char === '[') bracketCount++;
            else if (char === ']') bracketCount--;

            // Check for comma separator at top level
            if (char === ',' && parenCount === 0 && bracketCount === 0) {
                params.push(currentParam.trim());
                currentParam = '';
                continue;
            }

            currentParam += char;
        }

        // Add the last parameter
        if (currentParam.trim()) {
            params.push(currentParam.trim());
        }

        return params;
    }

    /**
     * Parse function parameters from string
     * Handles quoted strings like 'key' or "key"
     * Uses parseFunctionParameters for proper nested parentheses handling
     */
    parseFunctionParams(paramsStr) {
        if (!paramsStr) return [];

        paramsStr = paramsStr.trim();

        // Special handling for filter expressions: if the param contains comparison operators
        // and no commas (not a multi-param call), treat the whole string as a single parameter
        if (paramsStr.match(/[=!<>]{1,3}/) && !paramsStr.includes(',')) {
            return [paramsStr];
        }

        // Check if params contain parentheses (nested function calls like filter(contains(...)))
        // If so, use the more robust parseFunctionParameters method
        if (paramsStr.includes('(')) {
            return this.parseFunctionParameters(paramsStr);
        }

        const params = [];
        // Match quoted strings or unquoted values
        const matches = paramsStr.match(/(['"])([^\1]*?)\1|([^,\s]+)/g);

        if (matches) {
            matches.forEach(match => {
                // Remove quotes if present
                if ((match.startsWith("'") && match.endsWith("'")) ||
                    (match.startsWith('"') && match.endsWith('"'))) {
                    params.push(match.slice(1, -1));
                } else {
                    params.push(match);
                }
            });
        }

        return params;
    }

    /**
     * Apply function to JSONPath results
     * Handles both old format (string) and new format (object with name and params)
     */
    async applyFunction(func, data) {
        // Handle both old string format and new object format
        let funcName, params;
        if (typeof func === 'string') {
            funcName = func;
            params = [];
        } else {
            funcName = func.name;
            params = func.params || [];
        }

        switch(funcName.toLowerCase()) {
            case 'list':
                return this.functionList(data);
            case 'uniq':
            case 'unique':
                return this.functionUniq(data, params[0]);
            case 'count':
                return this.functionCount(data);
            case 'flatten':
                return this.functionFlatten(data);
            case 'keys':
                return this.functionKeys(data);
            case 'values':
                return this.functionValues(data);
            case 'sort':
                return this.functionSort(data);
            case 'reverse':
                return this.functionReverse(data);
            case 'first':
                return this.functionFirst(data);
            case 'last':
                return this.functionLast(data);
            case 'filter':
                return this.functionFilter(data, params[0]);
            case 'compare':
                return await this.functionCompare(data, params[0], params[1]);
            default:
                throw new Error(`Unknown function: ${funcName}`);
        }
    }

    /**
     * list() - Ensure result is an array
     */
    functionList(data) {
        if (Array.isArray(data)) return data;
        return [data];
    }

    /**
     * uniq(key?) - Get unique values
     * @param {Array} data - The data to filter
     * @param {string} key - Optional key to use for uniqueness in objects
     */
    functionUniq(data, key = null) {
        if (!Array.isArray(data)) return data;

        // Handle arrays of primitives
        if (data.length === 0 || typeof data[0] !== 'object') {
            return [...new Set(data)];
        }

        // If key is provided, validate it exists in at least one object
        if (key) {
            const hasKey = data.some(item =>
                typeof item === 'object' &&
                item !== null &&
                item.hasOwnProperty(key)
            );

            if (!hasKey) {
                console.warn(`uniq('${key}'): Key '${key}' does not exist in any objects. Returning empty array.`);
                return [];
            }
        }

        // Handle arrays of objects
        const seen = new Set();
        return data.filter(item => {
            // If key is provided and item is an object, use that key for uniqueness
            let uniqueValue;
            if (key && typeof item === 'object' && item !== null) {
                uniqueValue = item[key];
            } else {
                // Otherwise compare by entire object (JSON string)
                uniqueValue = JSON.stringify(item);
            }

            if (seen.has(uniqueValue)) return false;
            seen.add(uniqueValue);
            return true;
        });
    }

    /**
     * count() - Count elements
     */
    functionCount(data) {
        if (Array.isArray(data)) {
            return { count: data.length };
        } else if (typeof data === 'object' && data !== null) {
            return { count: Object.keys(data).length };
        }
        return { count: 1 };
    }

    /**
     * flatten() - Flatten nested arrays
     */
    functionFlatten(data) {
        if (!Array.isArray(data)) return data;
        return data.flat(Infinity);
    }

    /**
     * keys() - Get object keys
     */
    functionKeys(data) {
        if (Array.isArray(data)) {
            return data.map(item =>
                typeof item === 'object' && item !== null ? Object.keys(item) : []
            ).flat();
        } else if (typeof data === 'object' && data !== null) {
            return Object.keys(data);
        }
        return [];
    }

    /**
     * values() - Get object values
     */
    functionValues(data) {
        if (Array.isArray(data)) {
            return data.map(item =>
                typeof item === 'object' && item !== null ? Object.values(item) : item
            ).flat();
        } else if (typeof data === 'object' && data !== null) {
            return Object.values(data);
        }
        return [data];
    }

    /**
     * sort() - Sort array
     */
    functionSort(data) {
        if (!Array.isArray(data)) return data;
        return [...data].sort((a, b) => {
            if (typeof a === 'string' && typeof b === 'string') {
                return a.localeCompare(b);
            }
            return a < b ? -1 : a > b ? 1 : 0;
        });
    }

    /**
     * reverse() - Reverse array
     */
    functionReverse(data) {
        if (!Array.isArray(data)) return data;
        return [...data].reverse();
    }

    /**
     * first() - Get first element
     */
    functionFirst(data) {
        if (Array.isArray(data) && data.length > 0) {
            return data[0];
        }
        return data;
    }

    /**
     * last() - Get last element
     */
    functionLast(data) {
        if (Array.isArray(data) && data.length > 0) {
            return data[data.length - 1];
        }
        return data;
    }

    /**
     * filter(expression) - Filter array elements based on an expression
     * In the expression, $ refers to each individual object in the array
     * @param {Array} data - The array to filter
     * @param {string} expression - The filter expression (e.g., "$.pin == null", "$.pin[?].customer == 'John'")
     */
    functionFilter(data, expression) {
        // Check if data is an array
        if (!Array.isArray(data)) {
            this.showMessage('filter() can only be applied to arrays/lists. Current result is not an array.', 'warning');
            return data;
        }

        // Check if expression is provided
        if (!expression) {
            this.showMessage('filter() requires an expression parameter. Example: filter($.pin == null)', 'warning');
            return data;
        }

        try {
            // Filter the array by testing each object against the expression
            const filtered = data.filter(item => {
                try {
                    // Evaluate the expression with $ referring to the current item
                    return this.evaluateFilterExpression(expression, item);
                } catch (error) {
                    console.warn('Filter expression evaluation error for item:', item, error);
                    return false;
                }
            });
            return filtered;
        } catch (error) {
            this.showMessage(`filter() error: ${error.message}`, 'error');
            return data;
        }
    }

    /**
     * compare() - Compare current data with saved data from history
     * @param {Array|Object} data - Current data
     * @param {string} dataId - ID of saved data from history
     * @param {Object|string} options - Optional comparison options (can be object or JSON string)
     */
    async functionCompare(data, dataId, options) {
        // Validate dataId
        if (!dataId || typeof dataId !== 'string') {
            this.showMessage('compare() requires a data history ID as first parameter', 'error');
            return data;
        }

        try {
            // Fetch saved data from history using the historyManager
            const savedEntry = await this.historyManager.getDataEntry(this.toolName, dataId);

            if (!savedEntry || !savedEntry.data) {
                this.showMessage(`Data with ID "${dataId}" not found in history`, 'error');
                return data;
            }

            // Parse saved data
            let savedData;
            try {
                savedData = JSON.parse(savedEntry.data);
            } catch (error) {
                this.showMessage(`Failed to parse saved data: ${error.message}`, 'error');
                return data;
            }

            // Parse options if it's a string
            let parsedOptions = {};
            if (options) {
                if (typeof options === 'string') {
                    try {
                        parsedOptions = JSON.parse(options);
                    } catch (e) {
                        // Try parsing as object literal
                        try {
                            parsedOptions = eval('(' + options + ')');
                        } catch (err) {
                            console.warn('Could not parse options:', options);
                        }
                    }
                } else if (typeof options === 'object') {
                    parsedOptions = options;
                }
            }

            // Determine comparison type
            const currentIsArray = Array.isArray(data);
            const savedIsArray = Array.isArray(savedData);

            if (currentIsArray && savedIsArray) {
                return this.compareArrays(data, savedData, parsedOptions);
            } else if (!currentIsArray && !savedIsArray && typeof data === 'object' && typeof savedData === 'object') {
                return this.compareObjects(data, savedData, parsedOptions);
            } else {
                return this.comparePrimitives(data, savedData);
            }
        } catch (error) {
            this.showMessage(`compare() error: ${error.message}`, 'error');
            return data;
        }
    }

    /**
     * Compare two arrays
     */
    compareArrays(current, saved, options) {
        const matchBy = options.matchBy || null;

        const added = [];
        const removed = [];
        const common = [];
        const modified = [];

        // Find added and common/modified items
        current.forEach(currentItem => {
            const match = this.findMatchInArray(currentItem, saved, matchBy);
            if (!match) {
                added.push(currentItem);
            } else if (!this.isDeepEqual(currentItem, match)) {
                modified.push({
                    current: currentItem,
                    saved: match
                });
            } else {
                common.push(currentItem);
            }
        });

        // Find removed items
        saved.forEach(savedItem => {
            const match = this.findMatchInArray(savedItem, current, matchBy);
            if (!match) {
                removed.push(savedItem);
            }
        });

        return {
            type: "array_comparison",
            current_count: current.length,
            saved_count: saved.length,
            added,
            removed,
            common,
            modified,
            summary: {
                added_count: added.length,
                removed_count: removed.length,
                common_count: common.length,
                modified_count: modified.length
            }
        };
    }

    /**
     * Compare two objects
     */
    compareObjects(current, saved, options) {
        const addedKeys = [];
        const removedKeys = [];
        const modifiedKeys = {};
        const unchangedKeys = [];

        const allKeys = new Set([...Object.keys(current), ...Object.keys(saved)]);

        allKeys.forEach(key => {
            const inCurrent = key in current;
            const inSaved = key in saved;

            if (inCurrent && !inSaved) {
                addedKeys.push(key);
            } else if (!inCurrent && inSaved) {
                removedKeys.push(key);
            } else if (!this.isDeepEqual(current[key], saved[key])) {
                modifiedKeys[key] = {
                    current: current[key],
                    saved: saved[key]
                };
            } else {
                unchangedKeys.push(key);
            }
        });

        return {
            type: "object_comparison",
            added_keys: addedKeys,
            removed_keys: removedKeys,
            modified_keys: modifiedKeys,
            unchanged_keys: unchangedKeys
        };
    }

    /**
     * Compare primitives
     */
    comparePrimitives(current, saved) {
        return {
            type: "primitive_comparison",
            current,
            saved,
            equal: current === saved
        };
    }

    /**
     * Find matching item in array
     */
    findMatchInArray(item, array, matchBy) {
        if (!matchBy) {
            // Try to auto-detect matchBy field
            if (typeof item === 'object' && item !== null) {
                if ('id' in item) matchBy = 'id';
                else if ('_id' in item) matchBy = '_id';
                else if ('key' in item) matchBy = 'key';
            }
        }

        if (matchBy && typeof item === 'object' && item !== null) {
            return array.find(arrItem =>
                typeof arrItem === 'object' && arrItem !== null && arrItem[matchBy] === item[matchBy]
            );
        }

        // Fallback: compare by full object
        return array.find(arrItem => this.isDeepEqual(arrItem, item));
    }

    /**
     * Deep equality check
     */
    isDeepEqual(obj1, obj2) {
        if (obj1 === obj2) return true;
        if (obj1 == null || obj2 == null) return false;
        if (typeof obj1 !== 'object' || typeof obj2 !== 'object') return false;

        const keys1 = Object.keys(obj1);
        const keys2 = Object.keys(obj2);

        if (keys1.length !== keys2.length) return false;

        for (const key of keys1) {
            if (!keys2.includes(key)) return false;
            if (!this.isDeepEqual(obj1[key], obj2[key])) return false;
        }

        return true;
    }

    /**
     * Evaluate a filter expression against an object
     * @param {string} expression - The filter expression
     * @param {*} context - The object to test ($ refers to this)
     * @returns {boolean} - Whether the expression evaluates to true
     */
    evaluateFilterExpression(expression, context) {
        // Replace $ with the actual path through the context
        let processedExpr = expression.trim();

        // Check for function-wrapped expressions first: len(...), present(...), absent(...)
        const funcNameMatch = processedExpr.match(/^(\w+)\s*\(/);

        if (funcNameMatch) {
            const funcName = funcNameMatch[1];

            // Extract the JSONPath by counting parentheses
            let parenCount = 1;
            let startIdx = processedExpr.indexOf('(') + 1;
            let endIdx = startIdx;

            for (let i = startIdx; i < processedExpr.length && parenCount > 0; i++) {
                if (processedExpr[i] === '(') parenCount++;
                else if (processedExpr[i] === ')') {
                    parenCount--;
                    if (parenCount === 0) {
                        endIdx = i;
                        break;
                    }
                }
            }

            if (parenCount !== 0) {
                console.warn('Unmatched parentheses in filter expression:', processedExpr);
                return false;
            }

            const funcContent = processedExpr.substring(startIdx, endIdx).trim();
            const remainingExpr = processedExpr.substring(endIdx + 1).trim();

            try {
                // Special handling for contains() which takes two parameters: expression and value
                if (funcName.toLowerCase() === 'contains') {
                    // Parse two parameters separated by comma
                    // Need to handle nested parentheses and commas in strings
                    const params = this.parseFunctionParameters(funcContent);

                    if (params.length !== 2) {
                        console.warn('contains() requires exactly 2 parameters: expression and value');
                        return false;
                    }

                    const pathToEval = params[0].trim();
                    const searchValue = this.parseCompareValue(params[1].trim());

                    // Validate the JSONPath
                    if (!pathToEval.startsWith('$')) {
                        console.warn('Invalid JSONPath in contains() (must start with $):', pathToEval);
                        return false;
                    }

                    // Query the context with the JSONPath
                    let result;
                    try {
                        result = jsonpath.query(context, pathToEval);
                    } catch (jsonPathError) {
                        console.warn('JSONPath query error:', jsonPathError.message, 'Path:', pathToEval);
                        return false;
                    }

                    // Check if the value exists in the result array
                    return this.filterFunctionContains(result, searchValue);
                }

                // For other functions, treat content as JSONPath
                const pathToEval = funcContent;

                // Validate the JSONPath
                if (!pathToEval.startsWith('$')) {
                    console.warn('Invalid JSONPath in filter function (must start with $):', pathToEval);
                    return false;
                }

                // Query the context with the JSONPath
                let result;
                try {
                    result = jsonpath.query(context, pathToEval);
                } catch (jsonPathError) {
                    console.warn('JSONPath query error:', jsonPathError.message, 'Path:', pathToEval);
                    return false;
                }

                // Apply function
                result = this.applyFilterFunction(funcName, result, pathToEval, context);

                // If there's a comparison operator after the function
                if (remainingExpr) {
                    const operatorMatch = remainingExpr.match(/^\s*(===|!==|==|!=|<=|>=|<|>)\s*(.+)$/);

                    if (!operatorMatch) {
                        console.warn('Invalid operator in filter expression:', remainingExpr);
                        return false;
                    }

                    const operator = operatorMatch[1];
                    let compareValue = operatorMatch[2].trim();

                    // Parse the comparison value
                    compareValue = this.parseCompareValue(compareValue);

                    // Perform comparison
                    return this.compareValues(result, operator, compareValue);
                }

                // No comparison, just return the boolean result of the function
                return Boolean(result);
            } catch (error) {
                console.warn('Filter function evaluation error:', error.message);
                return false;
            }
        }

        // Handle regular JSONPath queries (no function wrapper)
        const jsonPathMatch = processedExpr.match(/^\$[^\s==!=<>]*/);

        if (jsonPathMatch) {
            let jsonPathPart = jsonPathMatch[0];

            // If it's just "$", return the whole context
            if (jsonPathPart === '$') {
                // Replace $ with 'context' for evaluation
                processedExpr = processedExpr.replace(/\$/g, 'context');
            } else {
                let pathToEval = jsonPathPart;

                try {
                    // Query the context with the JSONPath
                    let result = jsonpath.query(context, pathToEval);

                    // Handle the comparison operators (longer operators first to match correctly)
                    const operatorMatch = processedExpr.match(/^\$[^\s==!=<>]*\s*(===|!==|==|!=|<=|>=|<|>)\s*(.+)$/);

                    if (operatorMatch) {
                        const operator = operatorMatch[1];
                        let compareValue = operatorMatch[2].trim();

                        // Parse the comparison value
                        compareValue = this.parseCompareValue(compareValue);

                        // Check if we're using [*] which returns multiple values
                        // In that case, check if ANY value matches (for == or ===)
                        // or if ALL values don't match (for != or !==)
                        const isWildcard = pathToEval.includes('[*]');

                        if (isWildcard && Array.isArray(result) && result.length > 0) {
                            // For wildcards:
                            // - Equality (==, ===): check if ANY element matches
                            // - Inequality (!=, !==): check if NONE match (ALL are different)
                            // - Comparisons (<, >, etc.): check if ANY element satisfies
                            switch (operator) {
                                case '==':
                                case '===':
                                    return result.some(val => val == compareValue);
                                case '!=':
                                case '!==':
                                    // Return true if NONE of the elements match (all are different)
                                    return !result.some(val => val == compareValue);
                                case '<':
                                    return result.some(val => val < compareValue);
                                case '>':
                                    return result.some(val => val > compareValue);
                                case '<=':
                                    return result.some(val => val <= compareValue);
                                case '>=':
                                    return result.some(val => val >= compareValue);
                                default:
                                    return false;
                            }
                        } else {
                            // For specific indices, check the single result
                            // If result is empty array (property doesn't exist), treat as undefined
                            const actualValue = Array.isArray(result) && result.length > 0 ? result[0] : undefined;

                            // Perform the comparison
                            switch (operator) {
                                case '==':
                                case '===':
                                    return actualValue == compareValue;
                                case '!=':
                                case '!==':
                                    return actualValue != compareValue;
                                case '<':
                                    return actualValue < compareValue;
                                case '>':
                                    return actualValue > compareValue;
                                case '<=':
                                    return actualValue <= compareValue;
                                case '>=':
                                    return actualValue >= compareValue;
                                default:
                                    return false;
                            }
                        }
                    } else {
                        // No operator, just check if the result is truthy
                        if (funcName) {
                            // Function result is already the boolean or value
                            return Boolean(result);
                        }
                        // No function, check if the path exists and is truthy
                        return Array.isArray(result) && result.length > 0 && result[0];
                    }
                } catch (error) {
                    console.warn('JSONPath evaluation error:', error);
                    return false;
                }
            }
        }

        // Fallback: try to evaluate as a JavaScript expression (with context)
        try {
            const func = new Function('context', `return ${processedExpr}`);
            return Boolean(func(context));
        } catch (error) {
            console.warn('Expression evaluation error:', error.message);
            return false;
        }
    }

    /**
     * Parse a comparison value from string to its proper type
     */
    parseCompareValue(valueStr) {
        valueStr = valueStr.trim();

        if (valueStr === 'null') return null;
        if (valueStr === 'undefined') return undefined;
        if (valueStr === 'true') return true;
        if (valueStr === 'false') return false;
        if (valueStr.match(/^["'].*["']$/)) return valueStr.slice(1, -1);
        if (!isNaN(valueStr) && valueStr !== '') return Number(valueStr);

        return valueStr;
    }

    /**
     * Compare two values using an operator
     */
    compareValues(left, operator, right) {
        switch (operator) {
            case '==':
            case '===':
                return left == right;
            case '!=':
            case '!==':
                return left != right;
            case '<':
                return left < right;
            case '>':
                return left > right;
            case '<=':
                return left <= right;
            case '>=':
                return left >= right;
            default:
                console.warn('Unknown operator:', operator);
                return false;
        }
    }

    /**
     * Apply filter-specific functions to JSONPath results
     * @param {string} funcName - The function name (e.g., 'len', 'present', 'absent')
     * @param {*} result - The JSONPath query result (usually an array)
     * @param {string} path - The original JSONPath for context
     * @param {*} context - The object being filtered (for parent path queries)
     * @returns {*} - The function result
     */
    applyFilterFunction(funcName, result, path, context) {
        const isWildcard = path.includes('[*]');
        funcName = funcName.toLowerCase();

        try {
            switch (funcName) {
                case 'len':
                case 'length':
                    return this.filterFunctionLen(result);

                case 'present':
                case 'exists':
                    return this.filterFunctionPresent(result, path, context, isWildcard);

                case 'absent':
                case 'missing':
                    return this.filterFunctionAbsent(result, path, context, isWildcard);

                case 'empty':
                    return this.filterFunctionEmpty(result);

                case 'notempty':
                case 'notEmpty':
                    return this.filterFunctionNotEmpty(result);

                default:
                    console.warn(`Unknown filter function: ${funcName}`);
                    return false;
            }
        } catch (error) {
            console.warn(`Error in filter function ${funcName}:`, error.message);
            return false;
        }
    }

    /**
     * len() - Get length of array, object, or string
     */
    filterFunctionLen(result) {
        // JSONPath wraps results in an array
        if (!Array.isArray(result) || result.length === 0) {
            return 0;
        }

        const actualValue = result[0]; // Unwrap

        if (Array.isArray(actualValue)) {
            return actualValue.length;
        } else if (typeof actualValue === 'object' && actualValue !== null) {
            return Object.keys(actualValue).length;
        } else if (typeof actualValue === 'string') {
            return actualValue.length;
        }

        return 0;
    }

    /**
     * present() - Check if property exists on all array elements
     */
    filterFunctionPresent(result, path, context, isWildcard) {
        if (!Array.isArray(result)) {
            return result !== null && result !== undefined;
        }

        if (!isWildcard) {
            // Single value check
            return result.length > 0 && result[0] !== null && result[0] !== undefined;
        }

        // For wildcards, compare with parent array length
        const parentPath = this.getParentPath(path);
        if (!parentPath) {
            // Fallback: check if any value is present
            return result.some(val => val !== null && val !== undefined);
        }

        try {
            const parentResult = jsonpath.query(context, parentPath);
            if (Array.isArray(parentResult) && parentResult.length > 0) {
                const parentArray = parentResult[0];
                if (Array.isArray(parentArray)) {
                    // ALL elements must have the property
                    return result.length === parentArray.length &&
                           result.every(val => val !== null && val !== undefined);
                }
            }
        } catch (error) {
            console.warn('Error querying parent path:', error.message);
        }

        // Fallback
        return result.some(val => val !== null && val !== undefined);
    }

    /**
     * absent() - Check if property is missing from any array element
     */
    filterFunctionAbsent(result, path, context, isWildcard) {
        if (!Array.isArray(result)) {
            return result === null || result === undefined;
        }

        if (!isWildcard) {
            // Single value check
            return result.length === 0 || result[0] === null || result[0] === undefined;
        }

        // For wildcards, compare with parent array length
        const parentPath = this.getParentPath(path);
        if (!parentPath) {
            // Fallback: check if all values are absent
            return result.length === 0 || result.every(val => val === null || val === undefined);
        }

        try {
            const parentResult = jsonpath.query(context, parentPath);
            if (Array.isArray(parentResult) && parentResult.length > 0) {
                const parentArray = parentResult[0];
                if (Array.isArray(parentArray)) {
                    // ANY element missing the property
                    return result.length < parentArray.length;
                }
            }
        } catch (error) {
            console.warn('Error querying parent path:', error.message);
        }

        // Fallback
        return result.length === 0 || result.every(val => val === null || val === undefined);
    }

    /**
     * empty() - Check if array/object is empty
     */
    filterFunctionEmpty(result) {
        if (!Array.isArray(result) || result.length === 0) {
            return true;
        }

        const val = result[0];
        if (Array.isArray(val)) return val.length === 0;
        if (typeof val === 'object' && val !== null) return Object.keys(val).length === 0;

        return false;
    }

    /**
     * notEmpty() - Check if array/object is not empty
     */
    filterFunctionNotEmpty(result) {
        return !this.filterFunctionEmpty(result);
    }

    /**
     * contains() - Check if a specific value exists in the result array
     * For strings: checks if the string contains the substring (case-insensitive)
     * For other types: checks for exact match
     */
    filterFunctionContains(result, searchValue) {
        if (!Array.isArray(result) || result.length === 0) {
            return false;
        }

        // Check if any element in the result array matches the search value
        return result.some(val => {
            // Handle null/undefined
            if (val == null) {
                return val == searchValue;
            }

            // For string values, do substring matching (case-insensitive)
            if (typeof val === 'string' && typeof searchValue === 'string') {
                return val.toLowerCase().includes(searchValue.toLowerCase());
            }

            // For other types, use exact equality
            return val == searchValue;
        });
    }

    /**
     * Extract parent path from wildcard path
     * e.g., $.products[*].code -> $.products
     */
    getParentPath(path) {
        const match = path.match(/^(.+)\[\*\]/);
        return match ? match[1] : null;
    }

    /**
     * Perform JSONPath lookup
     */
    async performJsonPathLookup() {
        const expression = this.elements.jsonPathInput.value.trim();
        if (!expression) {
            this.clearSearch();
            return;
        }

        if (!this.originalOutputData) {
            this.showMessage('Please format some JSON first.', 'warning');
            return;
        }

        const outputText = this.originalOutputData.text;

        // Check file size limit
        if (this.isFileTooLarge(outputText.length)) {
            return;
        }

        try {
            // Parse expression for functions
            const { path, functions, nextPath } = this.parseJsonPathWithFunctions(expression);

            // Check if the current data is JSONL
            const inputText = this.elements.jsonInput.value.trim();
            if (this.isJsonl(inputText)) {
                await this.performJsonlPathLookup(path, functions, nextPath);
            } else {
                // Check if functions include 'compare' - if so, disable worker as it requires async API calls
                const hasCompare = functions.some(f => {
                    const funcName = typeof f === 'string' ? f : f.name;
                    return funcName.toLowerCase() === 'compare';
                });

                // Check if we should use worker for large files (but not for compare function)
                if (!hasCompare && this.shouldUseWorker(outputText.length)) {
                    this.showMessage('Processing JSONPath query on large file...', 'info');

                    try {
                        const result = await this.workerManager.execute('jsonpath', {
                            json: outputText,
                            path,
                            functions,
                            nextPath
                        });

                        console.log('JSONPath result:', result.result);

                        if (result.result !== undefined && result.result !== null) {
                            const formattedResult = this.formatJsonWithIndent(result.result);
                            const funcNames = functions.map(f => typeof f === 'string' ? f : `${f.name}(${f.params.map(p => `'${p}'`).join(', ')})`);
                            const funcInfo = functions.length > 0 ? ` (with ${funcNames.join(', ')})` : '';
                            this.displayOutput(formattedResult, result.result, true);
                            this.highlightJsonPath(path);
                            this.showMessage(`JSONPath result displayed${funcInfo}`, 'success');
                        } else {
                            this.showMessage(`JSONPath not found: ${path}`, 'warning');
                        }
                    } catch (workerError) {
                        console.warn('Worker failed, falling back to synchronous:', workerError);
                        await this.performJsonPathLookupSync(outputText, path, functions, nextPath);
                    }
                } else {
                    await this.performJsonPathLookupSync(outputText, path, functions, nextPath);
                }
            }
        } catch (error) {
            this.showMessage(`JSONPath error: ${error.message}`, 'error');
        }
    }

    /**
     * Synchronous JSONPath lookup (fallback and for small files)
     */
    async performJsonPathLookupSync(outputText, path, functions, nextPath) {
        // Regular JSON path lookup
        const parsed = JSON.parse(outputText);
        const paths = path.split(',').map(p => p.trim());
        let allResults = [];
        let error = null;

        for (const p of paths) {
            const evalResult = this.evaluateJsonPath(parsed, p);
            if (evalResult.error) {
                error = evalResult.error;
                break;
            }
            allResults.push(...evalResult.result);
        }

        if (error) {
            this.showMessage(`Invalid JSONPath expression: ${error}`, 'error');
            return;
        }

        // Apply functions to results
        try {
            for (const func of functions) {
                allResults = await this.applyFunction(func, allResults);
            }
        } catch (funcError) {
            this.showMessage(`Function error: ${funcError.message}`, 'error');
            return;
        }

        console.log('JSONPath result:', allResults);

        if (allResults !== undefined && allResults !== null) {
            // Display result in output window
            const formattedResult = this.formatJsonWithIndent(allResults);
            const funcNames = functions.map(f => typeof f === 'string' ? f : `${f.name}(${f.params.map(p => `'${p}'`).join(', ')})`);
            const funcInfo = functions.length > 0 ? ` (with ${funcNames.join(', ')})` : '';
            this.displayOutput(formattedResult, allResults, true);  // Mark as JSONPath result
            this.highlightJsonPath(path);
            this.showMessage(`JSONPath result displayed${funcInfo}`, 'success');
        } else {
            this.showMessage(`JSONPath not found: ${path}`, 'warning');
        }
    }

    /**
     * Extract key from JSONPath expression
     */
    extractJsonPathKey(jsonPath) {
        // Handle different JSONPath patterns
        const path = jsonPath.trim();

        // Remove $ prefix if present
        const cleanPath = path.startsWith('$') ? path.substring(1) : path;

        // Split by dots and brackets to get path segments
        const segments = cleanPath.split(/[.\[\]]+/).filter(Boolean);

        // Return the last segment as the key, or 'value' if complex expression
        if (segments.length > 0) {
            const lastSegment = segments[segments.length - 1];
            // Skip numeric indices and special characters
            if (!/^\d+$/.test(lastSegment) && !/[*?@()]/.test(lastSegment)) {
                return lastSegment;
            }
        }

        // Fallback for complex expressions
        return 'value';
    }

    /**
     * Build result object based on JSONPath and result values
     */
    buildResultObject(jsonPath, resultValues) {
        const key = this.extractJsonPathKey(jsonPath);

        if (resultValues.length === 0) {
            return {};
        } else if (resultValues.length === 1) {
            // Single result - create object with key-value pair
            const resultObj = {};
            resultObj[key] = resultValues[0];
            return resultObj;
        } else {
            // Multiple results - create object with key containing array
            const resultObj = {};
            resultObj[key] = resultValues;
            return resultObj;
        }
    }

    /**
     * Apply deemphasis to result keys while keeping values emphasized
     */
    highlightJsonWithDeemphasizedKeys(jsonText) {
        // Parse the JSON text line by line to identify keys vs values
        const lines = jsonText.split('\n');
        let highlighted = '';

        for (let line of lines) {
            const trimmedLine = line.trim();

            // Check if this line contains a key-value pair
            const keyValueMatch = line.match(/^(\s*)"([^"]+)":\s*(.+)$/);

            if (keyValueMatch) {
                const indent = keyValueMatch[1];
                const key = keyValueMatch[2];
                const value = keyValueMatch[3];

                // Deemphasize the key, emphasize the value
                highlighted += `${indent}<span class="deemphasized">"${key}":</span> ${this.highlightJson(value)}\n`;
            } else {
                // Regular line (brackets, arrays, etc.) - apply normal highlighting
                highlighted += this.highlightJson(line) + '\n';
            }
        }

        return highlighted.trimEnd(); // Remove trailing newline
    }

    /**
     * Format JSONL JSONPath results with proper indentation and highlighting
     */
    formatJsonlPathResults(results) {
        let html = '<span class="deemphasized">[\n</span>';

        results.forEach((res, index) => {
            // Format each result object
            html += '<span class="deemphasized">  {\n</span>';

            // from_object field
            html += '    <span class="deemphasized">"from_object":</span> ';
            html += `<span class="json-number">${res.from_object}</span>`;
            html += '<span class="deemphasized">,</span>\n';

            // result field
            html += '    <span class="deemphasized">"result":</span> ';

            // Format the result object with proper indentation
            const resultJson = this.formatJsonWithIndent(res.result, 2);
            const resultLines = resultJson.split('\n');

            if (resultLines.length === 1) {
                // Single line result - deemphasize keys
                html += this.highlightJsonWithDeemphasizedKeys(resultJson);
            } else {
                // Multi-line result - add proper indentation and deemphasize keys
                html += '{\n';
                for (let i = 1; i < resultLines.length - 1; i++) {
                    const line = resultLines[i];
                    // Add 6 spaces for proper alignment (4 for object + 2 for result)
                    html += '      ' + this.highlightJsonWithDeemphasizedKeys(line) + '\n';
                }
                html += '    }';
            }

            html += '\n  <span class="deemphasized">}</span>';

            // Add comma if not last item
            if (index < results.length - 1) {
                html += '<span class="deemphasized">,</span>';
            }
            html += '\n';
        });

        html += '<span class="deemphasized">]</span>';
        return html;
    }

    /**
     * Perform JSONPath lookup on JSONL data
     */
    async performJsonlPathLookup(path, functions = [], nextPath = null) {
        try {
            const inputText = this.elements.jsonInput.value.trim();
            const jsonObjects = this.parseJsonlObjects(inputText);
            const results = [];
            const paths = path.split(',').map(p => p.trim());

            console.log('JSONL Lookup - Path:', path, 'Functions:', functions, 'NextPath:', nextPath);
            console.log('JSONL Objects count:', jsonObjects.length);

            // Check if user wants to convert JSONL to array first with list($)
            const hasListFunction = functions.some(f => (typeof f === 'string' ? f : f.name) === 'list');
            if (path.trim() === '$' && hasListFunction) {
                console.log('Converting JSONL to array with list($)');

                // Start with the array of JSON objects
                let result = jsonObjects;

                // Apply all functions EXCEPT list() (which we just handled)
                const otherFunctions = functions.filter(f => {
                    const funcName = typeof f === 'string' ? f : f.name;
                    return funcName.toLowerCase() !== 'list';
                });

                console.log('Applying remaining functions:', otherFunctions);

                // Apply each function in sequence
                for (const func of otherFunctions) {
                    result = await this.applyFunction(func, result);
                }

                // If there's a nextPath, apply it to the result
                if (nextPath) {
                    console.log('Applying nextPath to result:', nextPath);
                    const evalResult = this.evaluateJsonPath(result, nextPath);

                    if (evalResult.error) {
                        this.showMessage(`Invalid JSONPath expression: ${evalResult.error}`, 'error');
                        return;
                    }

                    result = evalResult.result && evalResult.result.length > 0 ? evalResult.result : [];
                }

                // Display the final result
                const formattedResult = this.formatJsonWithIndent(result);
                this.displayOutput(formattedResult, result, true);
                this.showMessage(`JSONL processed successfully (${Array.isArray(result) ? result.length : 1} items)`, 'success');
                return;
            }

            jsonObjects.forEach((obj, index) => {
                let combinedResult = {};
                let hasResults = false;
                let error = null;

                for (const p of paths) {
                    const evalResult = this.evaluateJsonPath(obj, p);
                    console.log(`Object ${index}, Path ${p}:`, evalResult);

                    if (evalResult.error) {
                        error = evalResult.error;
                        break;
                    }

                    if (evalResult.result && evalResult.result.length > 0) {
                        hasResults = true;
                        const pathResult = this.buildResultObject(p, evalResult.result);
                        // Merge results from multiple paths
                        combinedResult = { ...combinedResult, ...pathResult };
                    }
                }

                if (error) {
                    console.error(`Error in object ${index}:`, error);
                    this.showMessage(`Invalid JSONPath expression in object ${index}: ${error}`, 'error');
                    // Continue to next line
                } else if (hasResults) {
                    results.push({
                        from_object: index,
                        result: combinedResult
                    });
                }
            });

            console.log('Results before functions:', results);

            // Apply functions if specified
            let finalResults = results;
            if (functions.length > 0 && results.length > 0) {
                // Extract all values from all objects
                let allValues = [];
                results.forEach(result => {
                    const values = Object.values(result.result);
                    values.forEach(val => {
                        if (Array.isArray(val)) {
                            allValues.push(...val);
                        } else {
                            allValues.push(val);
                        }
                    });
                });

                console.log('All extracted values:', allValues);

                // Apply functions to combined values
                try {
                    for (const func of functions) {
                        const funcName = typeof func === 'string' ? func : func.name;
                        const funcParams = typeof func === 'string' ? [] : func.params;
                        console.log(`Applying function: ${funcName}`, funcParams.length > 0 ? `with params: ${funcParams}` : '');
                        allValues = await this.applyFunction(func, allValues);
                        console.log('Result after function:', allValues);
                    }
                    finalResults = allValues;

                    // Apply nextPath if provided (for cases like $.products | list() | $[*].price)
                    if (nextPath) {
                        console.log('Applying nextPath to function results:', nextPath);
                        const evalResult = this.evaluateJsonPath(finalResults, nextPath);

                        if (evalResult.error) {
                            this.showMessage(`Invalid nextPath expression: ${evalResult.error}`, 'error');
                            return;
                        }

                        finalResults = evalResult.result && evalResult.result.length > 0 ? evalResult.result : [];
                        console.log('Result after nextPath:', finalResults);
                    }
                } catch (funcError) {
                    console.error('Function error:', funcError);
                    this.showMessage(`Function error: ${funcError.message}`, 'error');
                    return;
                }
            }

            console.log('Final results:', finalResults);

            if (finalResults && (Array.isArray(finalResults) ? finalResults.length > 0 : finalResults !== null)) {
                const funcNames = functions.map(f => typeof f === 'string' ? f : `${f.name}(${f.params.map(p => `'${p}'`).join(', ')})`);
                const pathInfo = nextPath ? ` | ${nextPath}` : '';
                const funcInfo = functions.length > 0 ? ` (with ${funcNames.join(', ')}${pathInfo})` : '';

                if (functions.length > 0 || nextPath) {
                    // Display simplified result when functions or nextPath are applied
                    const formattedResult = this.formatJsonWithIndent(finalResults);
                    this.displayOutput(formattedResult, finalResults, true);
                    this.showMessage(`JSONPath result displayed${funcInfo}`, 'success');
                } else {
                    // Display per-object results when no functions
                    const formattedResults = this.formatJsonlPathResults(finalResults);
                    this.displayOutput(formattedResults, finalResults, true, true);
                    this.showMessage(`JSONPath found in ${finalResults.length} object${finalResults.length > 1 ? 's' : ''}`, 'success');
                }
            } else {
                console.error('No results found');
                this.showMessage(`JSONPath not found in any JSONL objects: ${path}`, 'warning');
            }
        } catch (error) {
            console.error('JSONL JSONPath error:', error);
            this.showMessage(`JSONL JSONPath error: ${error.message}`, 'error');
        }
    }

    /**
     * Simple JSONPath evaluator (basic implementation)
     */
    evaluateJsonPath(obj, path) {
        try {
            return { result: jsonpath.query(obj, path) };
        } catch (e) {
            return { error: e.message };
        }
    }

    /**
     * Highlight matching JSONPath in output
     */
    highlightJsonPath(path) {
        if (!this.markupEnabled) return;
        
        // Simple highlighting - would need more sophisticated implementation
        const content = this.elements.jsonOutputFormatted.innerHTML;
        // This is a simplified version - real implementation would be more complex
        this.showMessage(`Highlighting path: ${path}`, 'success');
    }

    /**
     * Clear JSONPath search
     */
    clearSearch() {
        this.elements.jsonPathInput.value = '';

        // Restore original data if available
        if (this.originalOutputData) {
            this.displayOutput(this.originalOutputData.text, this.originalOutputData.parsedData, false);
            this.showMessage('Original data restored', 'success');
        } else {
            // Fallback: just remove search highlighting
            if (this.markupEnabled) {
                const content = this.elements.jsonOutputFormatted.innerHTML;
                const cleaned = content.replace(/class="search-match"/g, '').replace(/class="search-path"/g, '');
                this.elements.jsonOutputFormatted.innerHTML = cleaned;
            }
        }
    }

    /**
     * Show functions help dialog
     */
    showFunctionsHelp() {
        const helpText = `
<div style="font-family: 'Segoe UI', sans-serif; padding: 20px; max-width: 600px;">
    <h2 style="margin-top: 0; color: #333; font-size: 18px;">JSONPath Functions</h2>
    <p style="color: #666; font-size: 13px; margin-bottom: 20px;">
        Apply functions to JSONPath results using pipe syntax or function syntax:
    </p>

    <div style="background: #f5f5f5; padding: 10px; border-radius: 4px; margin-bottom: 20px; font-family: monospace; font-size: 12px;">
        <strong>Pipe Syntax:</strong> $.path | function()<br>
        <strong>Function Syntax:</strong> function($.path)<br>
        <strong>Chained:</strong> $.path | func1() | func2()
    </div>

    <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
        <thead>
            <tr style="background: #f0f0f0; text-align: left;">
                <th style="padding: 8px; border: 1px solid #ddd;">Function</th>
                <th style="padding: 8px; border: 1px solid #ddd;">Description</th>
                <th style="padding: 8px; border: 1px solid #ddd;">Example</th>
            </tr>
        </thead>
        <tbody>
            <tr>
                <td style="padding: 8px; border: 1px solid #ddd;"><code>list()</code></td>
                <td style="padding: 8px; border: 1px solid #ddd;">Ensure result is an array</td>
                <td style="padding: 8px; border: 1px solid #ddd; font-family: monospace; font-size: 11px;">$.user | list()</td>
            </tr>
            <tr style="background: #fafafa;">
                <td style="padding: 8px; border: 1px solid #ddd;"><code>uniq()</code></td>
                <td style="padding: 8px; border: 1px solid #ddd;">Get unique values</td>
                <td style="padding: 8px; border: 1px solid #ddd; font-family: monospace; font-size: 11px;">$..name | uniq()</td>
            </tr>
            <tr>
                <td style="padding: 8px; border: 1px solid #ddd;"><code>uniq('key')</code></td>
                <td style="padding: 8px; border: 1px solid #ddd;">Get unique objects by key field</td>
                <td style="padding: 8px; border: 1px solid #ddd; font-family: monospace; font-size: 11px;">$.products | uniq('code')</td>
            </tr>
            <tr style="background: #fafafa;">
                <td style="padding: 8px; border: 1px solid #ddd;"><code>count()</code></td>
                <td style="padding: 8px; border: 1px solid #ddd;">Count elements or object keys</td>
                <td style="padding: 8px; border: 1px solid #ddd; font-family: monospace; font-size: 11px;">$.items | count()</td>
            </tr>
            <tr>
                <td style="padding: 8px; border: 1px solid #ddd;"><code>flatten()</code></td>
                <td style="padding: 8px; border: 1px solid #ddd;">Flatten nested arrays</td>
                <td style="padding: 8px; border: 1px solid #ddd; font-family: monospace; font-size: 11px;">$.data | flatten()</td>
            </tr>
            <tr style="background: #fafafa;">
                <td style="padding: 8px; border: 1px solid #ddd;"><code>keys()</code></td>
                <td style="padding: 8px; border: 1px solid #ddd;">Get object keys</td>
                <td style="padding: 8px; border: 1px solid #ddd; font-family: monospace; font-size: 11px;">$.object | keys()</td>
            </tr>
            <tr>
                <td style="padding: 8px; border: 1px solid #ddd;"><code>values()</code></td>
                <td style="padding: 8px; border: 1px solid #ddd;">Get object values</td>
                <td style="padding: 8px; border: 1px solid #ddd; font-family: monospace; font-size: 11px;">$.object | values()</td>
            </tr>
            <tr style="background: #fafafa;">
                <td style="padding: 8px; border: 1px solid #ddd;"><code>sort()</code></td>
                <td style="padding: 8px; border: 1px solid #ddd;">Sort array</td>
                <td style="padding: 8px; border: 1px solid #ddd; font-family: monospace; font-size: 11px;">$.items | sort()</td>
            </tr>
            <tr>
                <td style="padding: 8px; border: 1px solid #ddd;"><code>reverse()</code></td>
                <td style="padding: 8px; border: 1px solid #ddd;">Reverse array</td>
                <td style="padding: 8px; border: 1px solid #ddd; font-family: monospace; font-size: 11px;">$.items | reverse()</td>
            </tr>
            <tr style="background: #fafafa;">
                <td style="padding: 8px; border: 1px solid #ddd;"><code>first()</code></td>
                <td style="padding: 8px; border: 1px solid #ddd;">Get first element</td>
                <td style="padding: 8px; border: 1px solid #ddd; font-family: monospace; font-size: 11px;">$.items | first()</td>
            </tr>
            <tr>
                <td style="padding: 8px; border: 1px solid #ddd;"><code>last()</code></td>
                <td style="padding: 8px; border: 1px solid #ddd;">Get last element</td>
                <td style="padding: 8px; border: 1px solid #ddd; font-family: monospace; font-size: 11px;">$.items | last()</td>
            </tr>
        </tbody>
    </table>
</div>
        `;

        // Use the existing message/alert system or create a simple modal
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        `;

        const content = document.createElement('div');
        content.style.cssText = `
            background: white;
            border-radius: 8px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
            max-width: 90%;
            max-height: 90%;
            overflow: auto;
            position: relative;
        `;
        content.innerHTML = helpText;

        const closeBtn = document.createElement('button');
        closeBtn.textContent = '× Close';
        closeBtn.style.cssText = `
            position: sticky;
            top: 0;
            right: 0;
            float: right;
            margin: 10px;
            padding: 8px 16px;
            background: #f0f0f0;
            border: 1px solid #ccc;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            font-weight: bold;
        `;
        closeBtn.onclick = () => modal.remove();

        content.prepend(closeBtn);
        modal.appendChild(content);
        modal.onclick = (e) => {
            if (e.target === modal) modal.remove();
        };

        document.body.appendChild(modal);
    }

    /**
     * Show common JSONPath patterns dialog
     */
    showPatternsHelp() {
        const helpText = `
<div style="font-family: 'Segoe UI', sans-serif; padding: 20px; max-width: 700px;">
    <h2 style="margin-top: 0; color: #333; font-size: 18px;">Common JSONPath Patterns</h2>
    <p style="color: #666; font-size: 13px; margin-bottom: 20px;">
        Quick reference for frequently used JSONPath expressions
    </p>

    <div style="margin-bottom: 30px;">
        <h3 style="color: #555; font-size: 15px; margin-bottom: 10px; border-bottom: 2px solid #e0e0e0; padding-bottom: 5px;">📌 Basic Selection</h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 15px;">
            <tr style="background: #f5f5f5;">
                <td style="padding: 8px; border: 1px solid #ddd; font-family: monospace; width: 40%;">$.property</td>
                <td style="padding: 8px; border: 1px solid #ddd;">Select a property</td>
            </tr>
            <tr>
                <td style="padding: 8px; border: 1px solid #ddd; font-family: monospace;">$.parent.child</td>
                <td style="padding: 8px; border: 1px solid #ddd;">Nested property</td>
            </tr>
            <tr style="background: #f5f5f5;">
                <td style="padding: 8px; border: 1px solid #ddd; font-family: monospace;">$[0]</td>
                <td style="padding: 8px; border: 1px solid #ddd;">First element of array</td>
            </tr>
            <tr>
                <td style="padding: 8px; border: 1px solid #ddd; font-family: monospace;">$[-1]</td>
                <td style="padding: 8px; border: 1px solid #ddd;">Last element of array</td>
            </tr>
            <tr style="background: #f5f5f5;">
                <td style="padding: 8px; border: 1px solid #ddd; font-family: monospace;">$[0:3]</td>
                <td style="padding: 8px; border: 1px solid #ddd;">First three elements (slice)</td>
            </tr>
        </table>
    </div>

    <div style="margin-bottom: 30px;">
        <h3 style="color: #555; font-size: 15px; margin-bottom: 10px; border-bottom: 2px solid #e0e0e0; padding-bottom: 5px;">🔄 Wildcards & Recursion</h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 15px;">
            <tr style="background: #f5f5f5;">
                <td style="padding: 8px; border: 1px solid #ddd; font-family: monospace; width: 40%;">$[*]</td>
                <td style="padding: 8px; border: 1px solid #ddd;">All array elements</td>
            </tr>
            <tr>
                <td style="padding: 8px; border: 1px solid #ddd; font-family: monospace;">$.items[*].name</td>
                <td style="padding: 8px; border: 1px solid #ddd;">All names in items array</td>
            </tr>
            <tr style="background: #f5f5f5;">
                <td style="padding: 8px; border: 1px solid #ddd; font-family: monospace;">$..name</td>
                <td style="padding: 8px; border: 1px solid #ddd;">All 'name' properties recursively</td>
            </tr>
            <tr>
                <td style="padding: 8px; border: 1px solid #ddd; font-family: monospace;">$..*</td>
                <td style="padding: 8px; border: 1px solid #ddd;">All values recursively</td>
            </tr>
        </table>
    </div>

    <div style="margin-bottom: 30px;">
        <h3 style="color: #555; font-size: 15px; margin-bottom: 10px; border-bottom: 2px solid #e0e0e0; padding-bottom: 5px;">🎯 Multiple Fields</h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 15px;">
            <tr style="background: #f5f5f5;">
                <td style="padding: 8px; border: 1px solid #ddd; font-family: monospace; width: 40%;">$.name,$.email</td>
                <td style="padding: 8px; border: 1px solid #ddd;">Select multiple fields (comma-separated)</td>
            </tr>
            <tr>
                <td style="padding: 8px; border: 1px solid #ddd; font-family: monospace;">$[0,2,4]</td>
                <td style="padding: 8px; border: 1px solid #ddd;">Select specific array indices</td>
            </tr>
            <tr style="background: #f5f5f5;">
                <td style="padding: 8px; border: 1px solid #ddd; font-family: monospace;">$['name','email']</td>
                <td style="padding: 8px; border: 1px solid #ddd;">Select multiple properties (bracket notation)</td>
            </tr>
        </table>
    </div>

    <div style="margin-bottom: 30px;">
        <h3 style="color: #555; font-size: 15px; margin-bottom: 10px; border-bottom: 2px solid #e0e0e0; padding-bottom: 5px;">🔍 Filtering</h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 15px;">
            <tr style="background: #f5f5f5;">
                <td style="padding: 8px; border: 1px solid #ddd; font-family: monospace; width: 40%;">$[?(@.price < 10)]</td>
                <td style="padding: 8px; border: 1px solid #ddd;">Items where price less than 10</td>
            </tr>
            <tr>
                <td style="padding: 8px; border: 1px solid #ddd; font-family: monospace;">$[?(@.active == true)]</td>
                <td style="padding: 8px; border: 1px solid #ddd;">Items where active is true</td>
            </tr>
            <tr style="background: #f5f5f5;">
                <td style="padding: 8px; border: 1px solid #ddd; font-family: monospace;">$[?(@.name)]</td>
                <td style="padding: 8px; border: 1px solid #ddd;">Items that have 'name' property</td>
            </tr>
            <tr>
                <td style="padding: 8px; border: 1px solid #ddd; font-family: monospace;">$[?(!@.email)]</td>
                <td style="padding: 8px; border: 1px solid #ddd;">Items WITHOUT 'email' property</td>
            </tr>
            <tr style="background: #f5f5f5;">
                <td style="padding: 8px; border: 1px solid #ddd; font-family: monospace;">$[?(@.type != 'work')]</td>
                <td style="padding: 8px; border: 1px solid #ddd;">Items where type is NOT 'work'</td>
            </tr>
            <tr>
                <td style="padding: 8px; border: 1px solid #ddd; font-family: monospace;">$[?(@.name =~ /^A/)]</td>
                <td style="padding: 8px; border: 1px solid #ddd;">Items where name starts with 'A' (regex)</td>
            </tr>
        </table>
    </div>

    <div style="margin-bottom: 30px;">
        <h3 style="color: #555; font-size: 15px; margin-bottom: 10px; border-bottom: 2px solid #e0e0e0; padding-bottom: 5px;">🔗 Parent-Child Selection</h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 15px;">
            <tr style="background: #f5f5f5;">
                <td style="padding: 8px; border: 1px solid #ddd; font-family: monospace; width: 40%;">$[?(@.addresses[?(@.state=='CO')])]</td>
                <td style="padding: 8px; border: 1px solid #ddd;">Objects with Colorado addresses</td>
            </tr>
            <tr>
                <td style="padding: 8px; border: 1px solid #ddd; font-family: monospace;">$.addresses[?(@.type=='work')]</td>
                <td style="padding: 8px; border: 1px solid #ddd;">Only work addresses</td>
            </tr>
            <tr style="background: #f5f5f5;">
                <td style="padding: 8px; border: 1px solid #ddd; font-family: monospace;">$.users[?(@.age > 18)].name</td>
                <td style="padding: 8px; border: 1px solid #ddd;">Names of users older than 18</td>
            </tr>
        </table>
    </div>

    <div style="margin-bottom: 20px;">
        <h3 style="color: #555; font-size: 15px; margin-bottom: 10px; border-bottom: 2px solid #e0e0e0; padding-bottom: 5px;">✨ With Functions</h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
            <tr style="background: #f5f5f5;">
                <td style="padding: 8px; border: 1px solid #ddd; font-family: monospace; width: 40%;">$.items[*].name | uniq()</td>
                <td style="padding: 8px; border: 1px solid #ddd;">Unique names</td>
            </tr>
            <tr>
                <td style="padding: 8px; border: 1px solid #ddd; font-family: monospace;">$ | list() | $.products[*] | flatten() | uniq('code')</td>
                <td style="padding: 8px; border: 1px solid #ddd;">Unique products by code (JSONL)</td>
            </tr>
            <tr style="background: #f5f5f5;">
                <td style="padding: 8px; border: 1px solid #ddd; font-family: monospace;">$[?(!@.email)] | count()</td>
                <td style="padding: 8px; border: 1px solid #ddd;">Count items without email</td>
            </tr>
            <tr>
                <td style="padding: 8px; border: 1px solid #ddd; font-family: monospace;">$.prices[*] | sort() | first()</td>
                <td style="padding: 8px; border: 1px solid #ddd;">Lowest price</td>
            </tr>
            <tr style="background: #f5f5f5;">
                <td style="padding: 8px; border: 1px solid #ddd; font-family: monospace;">$..city | uniq() | sort()</td>
                <td style="padding: 8px; border: 1px solid #ddd;">All unique cities, sorted</td>
            </tr>
        </table>
    </div>

    <div style="background: #fff3e0; padding: 12px; border-radius: 4px; margin-top: 20px; margin-bottom: 15px;">
        <strong style="color: #e65100;">🔄 JSONL Workflow:</strong>
        <div style="color: #555; font-size: 12px; margin-top: 8px; line-height: 1.6;">
            <strong>Two-step approach:</strong><br>
            <strong>Step 1:</strong> Convert JSONL to array: <code style="background: #fff; padding: 2px 6px; border-radius: 2px;">$ | list()</code><br>
            <strong>Step 2:</strong> Then apply filters on the array: <code style="background: #fff; padding: 2px 6px; border-radius: 2px;">$[?(!@.email)]</code><br>
            <br>
            <strong>Single-line approach:</strong><br>
            Chain it all together: <code style="background: #fff; padding: 2px 6px; border-radius: 2px;">$ | list() | $.order_id</code><br>
            Or with filters: <code style="background: #fff; padding: 2px 6px; border-radius: 2px;">$ | list() | $[?(!@.email)]</code><br>
            <span style="font-style: italic; color: #777; display: block; margin-top: 4px;">
                This converts independent JSONL documents into a single JSON array for powerful filtering and querying!
            </span>
        </div>
    </div>

    <div style="background: #e3f2fd; padding: 12px; border-radius: 4px; margin-top: 20px;">
        <strong style="color: #1976d2;">💡 Tip:</strong>
        <span style="color: #555; font-size: 12px;">Click on any pattern to copy it to your clipboard!</span>
    </div>
</div>
        `;

        // Use the existing message/alert system or create a simple modal
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        `;

        const content = document.createElement('div');
        content.style.cssText = `
            background: white;
            border-radius: 8px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
            max-width: 90%;
            max-height: 90%;
            overflow: auto;
            position: relative;
        `;
        content.innerHTML = helpText;

        const closeBtn = document.createElement('button');
        closeBtn.textContent = '× Close';
        closeBtn.style.cssText = `
            position: sticky;
            top: 0;
            right: 0;
            float: right;
            margin: 10px;
            padding: 8px 16px;
            background: #f0f0f0;
            border: 1px solid #ccc;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            font-weight: bold;
        `;
        closeBtn.onclick = () => modal.remove();

        content.prepend(closeBtn);
        modal.appendChild(content);
        modal.onclick = (e) => {
            if (e.target === modal) modal.remove();
        };

        // Add click-to-copy functionality for pattern cells
        content.querySelectorAll('td[style*="monospace"]').forEach(cell => {
            cell.style.cursor = 'pointer';
            cell.title = 'Click to copy';
            cell.addEventListener('click', async () => {
                const pattern = cell.textContent.trim();
                try {
                    await navigator.clipboard.writeText(pattern);
                    const originalBg = cell.style.background;
                    cell.style.background = '#4caf50';
                    cell.style.color = 'white';
                    setTimeout(() => {
                        cell.style.background = originalBg;
                        cell.style.color = '';
                    }, 500);
                } catch (err) {
                    console.error('Failed to copy:', err);
                }
            });
        });

        document.body.appendChild(modal);
    }

    /**
     * Get available function suggestions
     */
    getFunctionSuggestions() {
        return [
            { name: 'list()', description: 'Ensure result is an array' },
            { name: 'uniq()', description: 'Get unique values' },
            { name: "uniq('key')", description: 'Get unique objects by key field' },
            { name: 'unique()', description: 'Get unique values (alias)' },
            { name: 'count()', description: 'Count elements' },
            { name: 'flatten()', description: 'Flatten nested arrays' },
            { name: 'keys()', description: 'Get object keys' },
            { name: 'values()', description: 'Get object values' },
            { name: 'sort()', description: 'Sort array' },
            { name: 'reverse()', description: 'Reverse array' },
            { name: 'first()', description: 'Get first element' },
            { name: 'last()', description: 'Get last element' }
        ];
    }

    /**
     * Show function suggestions
     */
    showFunctionSuggestions(inputElement) {
        const functions = this.getFunctionSuggestions();
        const inputValue = inputElement.value;

        // Get the part after the last pipe
        const lastPipeIndex = inputValue.lastIndexOf('|');
        const searchTerm = inputValue.substring(lastPipeIndex + 1).trim().toLowerCase();

        // Filter functions based on search term
        const filtered = searchTerm
            ? functions.filter(f => f.name.toLowerCase().startsWith(searchTerm))
            : functions;

        // Create or get suggestions dropdown
        let dropdown = document.getElementById('function-suggestions-dropdown');
        if (!dropdown) {
            dropdown = document.createElement('div');
            dropdown.id = 'function-suggestions-dropdown';
            dropdown.className = 'func-dropdown';
            document.body.appendChild(dropdown);
        }

        if (filtered.length === 0) {
            dropdown.style.display = 'none';
            return;
        }

        // Position dropdown below input (using fixed positioning like dqs-dropdown)
        const rect = inputElement.getBoundingClientRect();
        dropdown.style.position = 'fixed';
        dropdown.style.left = rect.left + 'px';
        dropdown.style.top = (rect.bottom + 2) + 'px';
        dropdown.style.minWidth = rect.width + 'px';

        // Build suggestions HTML with classes matching dqs styles
        dropdown.innerHTML = filtered.map((func, index) => `
            <div class="func-item" data-index="${index}">
                <div class="func-suggestion-content">
                    <div class="func-suggestion-text">${func.name}</div>
                    <div class="func-suggestion-description">${func.description}</div>
                </div>
            </div>
        `).join('');

        dropdown.style.display = 'block';

        // Track selected index (-1 means nothing selected)
        let selectedIndex = -1;

        const updateSelection = () => {
            dropdown.querySelectorAll('.func-item').forEach((item, idx) => {
                if (idx === selectedIndex) {
                    item.classList.add('selected');
                } else {
                    item.classList.remove('selected');
                }
            });
        };

        // No initial selection - user must use arrow keys to select

        // Add click handlers
        dropdown.querySelectorAll('.func-item').forEach((item, index) => {
            item.addEventListener('mouseenter', () => {
                selectedIndex = index;
                updateSelection();
            });
            item.addEventListener('click', () => {
                const func = filtered[index];
                // Replace text after last pipe with selected function
                const beforePipe = inputValue.substring(0, lastPipeIndex + 1);
                inputElement.value = beforePipe + ' ' + func.name;
                dropdown.style.display = 'none';
                inputElement.focus();
            });
        });
    }

    /**
     * Hide function suggestions
     */
    hideFunctionSuggestions() {
        const dropdown = document.getElementById('function-suggestions-dropdown');
        if (dropdown) {
            dropdown.style.display = 'none';
        }
    }

    /**
     * Initialize JSONPath autocomplete using the generic library
     */
    initializeJsonPathAutocomplete() {
        if (!this.elements.jsonPathInput) return;

        try {
            // Create autocomplete adapter using the generic library
            this.autocompleteAdapter = new AutocompleteAdapter(this.elements.jsonPathInput, {
                documentType: 'json',
                queryLanguage: 'jsonpath',
                toolName: this.toolName, // Pass toolName for data history suggestions
                maxSuggestions: 10,
                debounceMs: 500,
                showDescriptions: true,
                showSampleValues: true,
                onSelect: (suggestion) => {
                    console.log('JSONPath suggestion selected:', suggestion);
                },
                onError: (error) => {
                    console.error('JSONPath autocomplete error:', error);
                }
            });

            // Add input listener to detect pipe and show function suggestions
            this.elements.jsonPathInput.addEventListener('input', (e) => {
                const value = e.target.value;
                const hasPipe = value.includes('|');

                if (hasPipe) {
                    // Disable JSONPath autocomplete
                    if (this.autocompleteAdapter && this.autocompleteAdapter.disable) {
                        this.autocompleteAdapter.disable();
                    }
                    // Show function suggestions
                    this.showFunctionSuggestions(e.target);
                } else {
                    // Enable JSONPath autocomplete
                    if (this.autocompleteAdapter && this.autocompleteAdapter.enable) {
                        this.autocompleteAdapter.enable();
                    }
                    // Hide function suggestions
                    this.hideFunctionSuggestions();
                }
            });

            // Add keyboard navigation for function suggestions
            this.elements.jsonPathInput.addEventListener('keydown', (e) => {
                const dropdown = document.getElementById('function-suggestions-dropdown');
                if (!dropdown || dropdown.style.display === 'none') return;

                const items = dropdown.querySelectorAll('.func-item');
                if (items.length === 0) return;

                let currentIndex = -1;
                items.forEach((item, index) => {
                    if (item.classList.contains('selected')) {
                        currentIndex = index;
                    }
                });

                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    const nextIndex = (currentIndex + 1) % items.length;
                    items.forEach((item, idx) => {
                        if (idx === nextIndex) {
                            item.classList.add('selected');
                        } else {
                            item.classList.remove('selected');
                        }
                    });
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    const prevIndex = currentIndex <= 0 ? items.length - 1 : currentIndex - 1;
                    items.forEach((item, idx) => {
                        if (idx === prevIndex) {
                            item.classList.add('selected');
                        } else {
                            item.classList.remove('selected');
                        }
                    });
                } else if (e.key === 'Enter') {
                    if (currentIndex >= 0 && currentIndex < items.length) {
                        e.preventDefault();
                        items[currentIndex].click();
                    }
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    this.hideFunctionSuggestions();
                }
            });

            // Hide function suggestions when clicking outside
            document.addEventListener('click', (e) => {
                const dropdown = document.getElementById('function-suggestions-dropdown');
                if (dropdown && e.target !== this.elements.jsonPathInput && !dropdown.contains(e.target)) {
                    this.hideFunctionSuggestions();
                }
            });

            console.log('JSONPath autocomplete initialized with generic library');
        } catch (error) {
            console.error('Failed to initialize JSONPath autocomplete:', error);
        }
    }

    /**
     * Update autocomplete when JSON data changes
     */
    updateAutocompleteDocument() {
        if (!this.autocompleteAdapter) return;

        try {
            // For autocomplete, we need the original input data, not the formatted output
            const inputText = this.elements.jsonInput.value.trim();
            if (!inputText) return;

            // Pass original input to autocomplete for proper parsing
            this.autocompleteAdapter.setDocument(inputText);
        } catch (error) {
            console.error('Failed to update autocomplete document:', error);
        }
    }

    /**
     * Copy formatted output to clipboard
     */
    async copyFormatted() {
        // Always copy the raw text without markup
        const output = this.lastOutputText || this.elements.jsonOutput.value;
            
        if (!output) {
            this.showMessage('No output to copy. Please format some JSON first.', 'warning');
            return;
        }

        try {
            await navigator.clipboard.writeText(output);
            this.showMessage('Formatted output copied to clipboard (markup removed)!', 'success');
        } catch (error) {
            // Fallback for older browsers
            try {
                // Create a temporary textarea with the plain text
                const textarea = document.createElement('textarea');
                textarea.value = output;
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
                this.showMessage('Formatted output copied to clipboard (markup removed)!', 'success');
            } catch (fallbackError) {
                this.showMessage('Failed to copy to clipboard', 'error');
            }
        }
    }

    /**
     * Clear all inputs and outputs
     */
    clearInputs() {
        this.elements.jsonInput.value = '';
        this.elements.jsonOutput.value = '';
        this.elements.jsonOutputFormatted.innerHTML = '';
        this.elements.jsonPathInput.value = '';
        this.lastOutputText = '';
        this.resetJsonStats();

        // Clear file path label
        this.clearFilePath();

        // Disable validation
        this.disableValidation();

        this.showMessage('Inputs cleared.', 'success');
    }

    /**
     * Handle file upload for JSON files
     */
    handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        // Validate file type
        if (!file.name.toLowerCase().endsWith('.json')) {
            this.showMessage('Please select a valid JSON file (.json extension)', 'error');
            return;
        }

        // Check file size (20MB limit for safe browser handling)
        const maxUploadSize = 20 * 1024 * 1024; // 20MB
        if (file.size > maxUploadSize) {
            const sizeMB = (file.size / 1024 / 1024).toFixed(2);
            this.showMessage(`File too large (${sizeMB}MB). Maximum upload size is 20MB to prevent browser issues.`, 'error');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const content = e.target.result;
                
                // Validate JSON content
                JSON.parse(content);
                
                // Set the content to input
                this.elements.jsonInput.value = content;
                
                // Show file path in tooltip
                this.setFilePath(file.name);
                
                // Auto-format the JSON
                this.formatJson();
                
                this.showMessage(`Loaded JSON file: ${file.name}`, 'success');
                
            } catch (error) {
                this.showMessage(`Invalid JSON file: ${error.message}`, 'error');
            }
        };

        reader.onerror = () => {
            this.showMessage('Error reading file', 'error');
        };

        reader.readAsText(file);
    }

    /**
     * Show the save tooltip for entering description
     */
    showSaveTooltip() {
        const output = this.elements.jsonOutput.value;

        if (!output) {
            this.showMessage('No output to save. Please format some JSON first.', 'warning');
            return;
        }

        this.elements.saveTooltip.style.display = 'flex';
        this.elements.saveDescriptionInput.value = '';
        this.elements.saveDescriptionInput.focus();
    }

    /**
     * Hide the save tooltip
     */
    hideSaveTooltip() {
        this.elements.saveTooltip.style.display = 'none';
        this.elements.saveDescriptionInput.value = '';
    }

    /**
     * Save output to data storage with description
     */
    async saveOutput() {
        const output = this.elements.jsonOutput.value;
        const description = this.elements.saveDescriptionInput.value.trim();

        if (!output) {
            this.showMessage('No output to save. Please format some JSON first.', 'warning');
            return;
        }

        if (!description) {
            this.showMessage('Description is required to save data', 'warning');
            this.elements.saveDescriptionInput.focus();
            return;
        }

        // Save to data storage using history manager
        if (this.historyManager) {
            const success = await this.historyManager.addDataEntry(output, description);
            if (success) {
                this.hideSaveTooltip();
            }
        } else {
            this.showMessage('History manager not initialized', 'error');
        }
    }

    /**
     * Copy regular output to clipboard
     */
    async copyOutput() {
        const output = this.elements.jsonOutput.value;
        
        if (!output) {
            this.showMessage('No output to copy. Please format some JSON first.', 'warning');
            return;
        }

        try {
            await navigator.clipboard.writeText(output);
            this.showMessage('Output copied to clipboard!', 'success');
        } catch (error) {
            // Fallback for older browsers
            this.elements.jsonOutput.select();
            document.execCommand('copy');
            this.showMessage('Output copied to clipboard!', 'success');
        }
    }

    /**
     * Handle JSON parsing errors with detailed information
     */
    handleJsonError(error) {
        let errorMessage = 'Invalid JSON: ';
        
        if (error.message.includes('position')) {
            const match = error.message.match(/position (\d+)/);
            if (match) {
                const position = parseInt(match[1]);
                const lines = this.elements.jsonInput.value.substring(0, position).split('\n');
                const line = lines.length;
                const column = lines[lines.length - 1].length + 1;
                errorMessage += `Error at line ${line}, column ${column}. ${error.message}`;
            } else {
                errorMessage += error.message;
            }
        } else {
            errorMessage += error.message;
        }

        this.showMessage(errorMessage, 'error');
        this.elements.jsonStatus.textContent = 'Invalid';
        this.displayOutput('');
    }

    /**
     * Update JSON statistics display
     */
    updateJsonStats(parsedJson = null) {
        const input = this.elements.jsonInput.value;
        
        this.elements.jsonSize.textContent = `${input.length} chars`;
        this.elements.jsonLines.textContent = input.split('\n').length;

        if (parsedJson !== null) {
            if (parsedJson.combined && parsedJson.stats) {
                // Handle JSONL combined stats
                const stats = parsedJson.stats;
                this.elements.jsonStatus.textContent = `Valid JSONL (${stats.lines} lines)`;
                this.elements.jsonObjects.textContent = stats.objects;
                this.elements.jsonArrays.textContent = stats.arrays;
                this.elements.jsonProperties.textContent = stats.properties;
            } else {
                // Handle single JSON object
                const stats = this.analyzeJsonStructure(parsedJson);
                this.elements.jsonStatus.textContent = 'Valid';
                this.elements.jsonObjects.textContent = stats.objects;
                this.elements.jsonArrays.textContent = stats.arrays;
                this.elements.jsonProperties.textContent = stats.properties;
            }
        }
    }

    /**
     * Reset JSON statistics to default
     */
    resetJsonStats() {
        this.elements.jsonStatus.textContent = 'Ready';
        this.elements.jsonSize.textContent = '0 chars';
        this.elements.jsonLines.textContent = '0';
        this.elements.jsonObjects.textContent = '0';
        this.elements.jsonArrays.textContent = '0';
        this.elements.jsonProperties.textContent = '0';
    }

    /**
     * Analyze JSON structure for statistics
     */
    analyzeJsonStructure(obj) {
        let objects = 0;
        let arrays = 0;
        let properties = 0;

        const analyze = (item) => {
            if (Array.isArray(item)) {
                arrays++;
                item.forEach(analyze);
            } else if (item !== null && typeof item === 'object') {
                objects++;
                for (const key in item) {
                    if (item.hasOwnProperty(key)) {
                        properties++;
                        analyze(item[key]);
                    }
                }
            }
        };

        analyze(obj);
        return { objects, arrays, properties };
    }

    /**
     * Initialize history manager
     */
    initializeHistoryManager() {
        // Create history manager with callback to load data into input
        this.historyManager = window.createHistoryManager(this.toolName, (data) => {
            this.elements.jsonInput.value = data;
            this.lastInputData = data;
            this.updateJsonStats();
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
        const messageDiv = document.createElement('div');
        messageDiv.className = `status-message status-${type} output-notification`;
        messageDiv.textContent = message;

        // Find the output panel content area
        const outputPanel = document.querySelector('.panel:nth-child(2) .panel-content');
        if (outputPanel) {
            // Remove any existing notifications
            const existingNotifications = outputPanel.querySelectorAll('.output-notification');
            existingNotifications.forEach(notification => notification.remove());

            // Add the new notification
            outputPanel.appendChild(messageDiv);
        } else {
            // Fallback to global status messages if panel not found
            this.elements.statusMessages.innerHTML = '';
            this.elements.statusMessages.appendChild(messageDiv);
        }

        // Auto-remove after 2.5 seconds (same as YAML tool)
        setTimeout(() => {
            if (messageDiv.parentNode) {
                messageDiv.parentNode.removeChild(messageDiv);
            }
        }, 2500);
    }





















    /**
     * Handle keyboard shortcuts
     */
    handleKeyboardShortcuts(event) {
        if (event.ctrlKey || event.metaKey) {
            switch (event.key.toLowerCase()) {
                case 'enter':
                    event.preventDefault();
                    this.formatJson();
                    break;
                case 'm':
                    event.preventDefault();
                    this.minifyJson();
                    break;
                case 'l':
                    event.preventDefault();
                    this.clearInputs();
                    break;
                case 'h':
                    event.preventDefault();
                    this.historyManager?.toggleHistory();
                    break;
                case 'f':
                    if (event.shiftKey) {
                        event.preventDefault();
                        this.copyFormatted();
                    }
                    break;
            }
        }
    }

    async openSourcePopup() {
        this.elements.sourcePopupOverlay.style.display = 'block';
        this.elements.sourcePopup.style.display = 'block';
        this.elements.sourceList.innerHTML = '<div>Loading sources...</div>';

        try {
            const response = await fetch('/api/sources');
            const result = await response.json();
            const sources = result.sources;

            if (sources && sources.length > 0) {
                this.elements.sourceList.innerHTML = '';
                sources.forEach(source => {
                    const sourceItem = document.createElement('div');
                    sourceItem.className = 'source-item';
                    sourceItem.dataset.id = source.id;
                    sourceItem.innerHTML = `
                        <span class="source-name">${source.name}</span>
                        <span class="source-type">${source.type}</span>
                    `;
                    sourceItem.addEventListener('click', () => this.loadSourceData(source.id));
                    this.elements.sourceList.appendChild(sourceItem);
                });
            } else {
                this.elements.sourceList.innerHTML = '<div>No sources found.</div>';
            }
        } catch (error) {
            this.elements.sourceList.innerHTML = '<div>Error loading sources.</div>';
            console.error('Error fetching sources:', error);
        }
    }

    closeSourcePopup() {
        this.elements.sourcePopupOverlay.style.display = 'none';
        this.elements.sourcePopup.style.display = 'none';
    }

    async loadSourceData(sourceId) {
        this.closeSourcePopup();
        this.showMessage('Loading source data...', 'info');

        try {
            // First get source information for URL display
            const sourceResponse = await fetch(`/api/sources/${sourceId}`);
            let sourceInfo = null;
            if (sourceResponse.ok) {
                sourceInfo = await sourceResponse.json();
            }

            // Then load the data
            const response = await fetch(`/api/sources/${sourceId}/data`);
            if (response.ok) {
                const data = await response.text();
                this.elements.jsonInput.value = data;
                
                // Show source URL/path in panel header
                if (sourceInfo) {
                    let displayPath = '';
                    if (sourceInfo.config?.url) {
                        displayPath = sourceInfo.config.url;
                    } else if (sourceInfo.config?.path) {
                        displayPath = sourceInfo.config.path;
                    } else if (sourceInfo.config?.bucket && sourceInfo.config?.key) {
                        displayPath = `s3://${sourceInfo.config.bucket}/${sourceInfo.config.key}`;
                    } else {
                        displayPath = sourceInfo.name || 'Source';
                    }
                    
                    this.setFilePath(displayPath);
                }
                
                this.showMessage('Source data loaded successfully.', 'success');
                this.updateJsonStats();
            } else {
                const error = await response.json();
                this.showMessage(`Error loading source data: ${error.error}`, 'error');
            }
        } catch (error) {
            this.showMessage('Error loading source data.', 'error');
            console.error('Error fetching source data:', error);
        }
    }

    /**
     * Initialize the SourceSelector component
     */
    async initializeSourceSelector() {
        try {
            this.sourceSelector = await createSourceSelector({
                containerId: 'jsonToolSourceSelector',
                onFetch: (data, source) => this.loadSourceData(data, source),
                onEdit: (source) => this.onSourceEdit(source),
                showEditButton: true,
                showFetchButton: true
            });
        } catch (error) {
            console.error('Failed to initialize source selector:', error);
            // Fallback to old method if the new loader fails
            this.sourceSelector = new SourceSelector({
                containerId: 'jsonToolSourceSelector',
                onFetch: (data, source) => this.loadSourceData(data, source),
                onEdit: (source) => this.onSourceEdit(source),
                showEditButton: true,
                showFetchButton: true
            });
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
            this.elements.jsonInput.value = data;

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

            // Auto-format the JSON if it's valid
            this.formatJson();

            // Update stats
            this.updateJsonStats();

            // Enable validation for this source
            this.enableValidationForSource(source);

            // Save to history
            this.saveToHistory(data, `load-from-source-${source.type}`);

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
        // This callback is triggered when a source is edited
        // You can add additional logic here if needed
        console.log('Source edited:', source);
    }

    /**
     * Resolve source path with dynamic variables
     */
    resolveSourcePath(source) {
        let path = source.pathTemplate || source.config?.path || source.config?.url || '';
        
        if (source.dynamicVariables) {
            Object.entries(source.dynamicVariables).forEach(([key, value]) => {
                const placeholder = `$${key}`;
                path = path.replace(new RegExp('\\' + placeholder, 'g'), value || placeholder);
            });
        }

        return path;
    }

    /**
     * Truncate file path for display (similar to text diff tool)
     */
    truncateFilePath(filePath) {
        if (filePath.length <= 20) {
            return filePath;
        }
        
        // Find the last slash to get the filename
        const lastSlashIndex = filePath.lastIndexOf('/');
        if (lastSlashIndex === -1) {
            // No path separator, just filename
            return '...' + filePath.slice(-17);
        }
        
        const fileName = filePath.slice(lastSlashIndex + 1);
        const pathPart = filePath.slice(0, lastSlashIndex + 1);
        
        // If filename itself is too long, just truncate it
        if (fileName.length > 17) {
            return '...' + fileName.slice(-17);
        }
        
        // Calculate how much path we can show
        const availableForPath = 20 - fileName.length - 3; // 3 for "..."
        
        if (availableForPath <= 0) {
            return '...' + fileName;
        }
        
        // Get the end of the path
        const truncatedPath = '...' + pathPart.slice(-(availableForPath));
        return truncatedPath + fileName;
    }

    /**
     * Initialize validation utilities
     */
    initializeValidation() {
        if (window.validationUtils) {
            this.validationUtils = window.validationUtils;
        } else {
            console.warn('ValidationUtils not available - validation features disabled');
        }
    }

    /**
     * Handle validator selection change
     */
    onValidatorChanged() {
        if (this.elements.validatorSelect.value) {
            this.elements.validateBtn.disabled = false;
        } else {
            this.elements.validateBtn.disabled = true;
            this.validationUtils?.clearValidationStatus(this.elements.validationStatus);
        }
    }

    /**
     * Validate the current JSON data
     */
    async validateData() {
        if (!this.validationUtils) {
            this.showMessage('Validation not available', 'error');
            return;
        }

        const validatorId = this.elements.validatorSelect.value;
        if (!validatorId) {
            this.showMessage('Please select a validator', 'warning');
            return;
        }

        const jsonData = this.elements.jsonInput.value.trim();
        if (!jsonData) {
            this.showMessage('No data to validate', 'warning');
            return;
        }

        // Show validation in progress
        this.validationUtils.showValidationInProgress(this.elements.validationStatus);
        this.elements.validateBtn.disabled = true;

        try {
            const result = await this.validationUtils.validateData(validatorId, jsonData, this.currentSource?.id);

            // Get validator info for display
            const validator = this.validationUtils.getValidator(validatorId);
            const validatorName = validator?.name || 'Unknown';
            const validatorType = validator?.type || 'unknown';

            // Update validation status display
            this.validationUtils.updateValidationStatus(
                this.elements.validationStatus,
                result,
                validatorName,
                validatorType
            );

            // Show message
            if (result.success && result.valid) {
                this.showMessage(`✅ Data is valid according to ${validatorName}`, 'success');
            } else {
                const errors = result.errors || ['Validation failed'];
                this.showMessage(`❌ Validation failed: ${errors.join(', ')}`, 'error');
            }

        } catch (error) {
            console.error('Validation error:', error);
            this.showMessage(`Validation error: ${error.message}`, 'error');
            this.validationUtils.clearValidationStatus(this.elements.validationStatus);
        } finally {
            this.elements.validateBtn.disabled = false;
        }
    }

    /**
     * Enable validation controls for a source
     */
    async enableValidationForSource(source) {
        this.currentSource = source;

        if (!this.validationUtils) {
            return;
        }

        // Show validation controls
        if (this.elements.validationControls) {
            this.elements.validationControls.style.display = 'flex';
        }

        // Load validators for this source
        try {
            const hasValidators = await this.validationUtils.populateValidatorSelect(
                this.elements.validatorSelect,
                source.id
            );

            if (hasValidators) {
                this.showMessage(`Validation available for source: ${source.name}`, 'info');
            } else {
                this.showMessage(`No validators configured for source: ${source.name}`, 'warning');
            }
        } catch (error) {
            console.error('Error loading validators:', error);
            this.showMessage('Error loading validators', 'error');
        }
    }

    /**
     * Disable validation controls
     */
    disableValidation() {
        this.currentSource = null;

        if (this.elements.validationControls) {
            this.elements.validationControls.style.display = 'none';
        }

        if (this.validationUtils) {
            this.validationUtils.clearValidationStatus(this.elements.validationStatus);
        }

        if (this.elements.validatorSelect) {
            this.elements.validatorSelect.innerHTML = '<option value="">Select validator...</option>';
            this.elements.validatorSelect.disabled = true;
        }

        if (this.elements.validateBtn) {
            this.elements.validateBtn.disabled = true;
        }
    }

    /**
     * Set up file path tooltip functionality
     */
    setupFilePathTooltip() {
        if (!this.elements.filePathLabel || !this.elements.filePathTooltip) {
            return;
        }

        this.currentFilePath = '';

        // Show tooltip on click
        this.elements.filePathLabel.addEventListener('click', (e) => {
            if (this.currentFilePath) {
                this.showPathTooltip(e, this.currentFilePath);
            }
        });

        // Hide tooltip when clicking outside
        document.addEventListener('click', (e) => {
            if (!this.elements.filePathLabel.contains(e.target) &&
                !this.elements.filePathTooltip.contains(e.target)) {
                this.hidePathTooltip();
            }
        });
    }

    /**
     * Show path tooltip at click position
     */
    showPathTooltip(event, path) {
        this.elements.filePathTooltip.textContent = path;
        this.elements.filePathTooltip.style.display = 'block';

        // Position tooltip near click point
        const rect = this.elements.filePathLabel.getBoundingClientRect();
        this.elements.filePathTooltip.style.left = rect.left + 'px';
        this.elements.filePathTooltip.style.top = (rect.bottom + 5) + 'px';
    }

    /**
     * Hide path tooltip
     */
    hidePathTooltip() {
        this.elements.filePathTooltip.style.display = 'none';
    }

    /**
     * Set file path and store for tooltip
     */
    setFilePath(path) {
        this.currentFilePath = path;
        this.elements.filePathLabel.style.display = 'inline';
        this.elements.filePathLabel.textContent = '[path]';
    }

    /**
     * Clear file path
     */
    clearFilePath() {
        this.currentFilePath = '';
        this.elements.filePathLabel.style.display = 'none';
        this.hidePathTooltip();
    }
}

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

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = JsonTool;
}

// Initialize when DOM is loaded (only in browser environment)
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        window.jsonTool = new JsonTool();
    });
}