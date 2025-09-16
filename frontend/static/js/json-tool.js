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
        this.initializeElements();
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

    attachEventListeners() {
        // Main action buttons
        this.elements.formatBtn.addEventListener('click', () => this.formatJson());
        this.elements.minifyBtn.addEventListener('click', () => this.minifyJson());
        this.elements.stringifyBtn.addEventListener('click', () => this.stringifyJson());
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
        // JSONPath input handling is now managed by AutocompleteAdapter
        // Only trigger evaluation on Enter key for explicit execution
        this.elements.jsonPathInput.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') {
                this.performJsonPathLookup();
            }
        });
        this.elements.clearSearchBtn.addEventListener('click', () => this.clearSearch());


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
    formatJson() {
        const input = this.elements.jsonInput.value.trim();
        
        if (!input) {
            this.showMessage('Please enter JSON or JSONL data to format.', 'warning');
            return;
        }

        try {
            // Auto-detect format and route to appropriate handler
            if (this.isJsonl(input)) {
                this.formatJsonlData(input);
            } else {
                // Regular JSON formatting
                const parsed = JSON.parse(input);
                const formatted = this.formatJsonWithIndent(parsed);
                
                this.displayOutput(formatted, parsed);
                this.showMessage('JSON formatted successfully!', 'success');
                this.saveToHistory(input, 'format');
            }
        } catch (error) {
            this.handleJsonError(error);
        }
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
    minifySingleJson(input) {
        try {
            const parsed = JSON.parse(input);
            const minified = JSON.stringify(parsed);
            
            this.displayOutput(minified, parsed);
            this.showMessage(`JSON minified successfully! Reduced from ${input.length} to ${minified.length} characters.`, 'success');
            this.saveToHistory(input, 'minify');
            
        } catch (error) {
            this.handleJsonError(error);
        }
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
    formatJsonWithIndent(obj) {
        const indent = this.indentPrefs.type === 'tabs' ? '\t' : ' '.repeat(this.indentPrefs.size);
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
     * Perform JSONPath lookup
     */
    performJsonPathLookup() {
        const path = this.elements.jsonPathInput.value.trim();
        if (!path) {
            this.clearSearch();
            return;
        }

        if (!this.originalOutputData) {
            this.showMessage('Please format some JSON first.', 'warning');
            return;
        }

        const outputText = this.originalOutputData.text;

        try {
            // Check if the current data is JSONL
            const inputText = this.elements.jsonInput.value.trim();
            if (this.isJsonl(inputText)) {
                this.performJsonlPathLookup(path);
            } else {
                // Regular JSON path lookup
                const parsed = JSON.parse(outputText);
                const paths = path.split(',').map(p => p.trim());
                const allResults = [];
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

                console.log('JSONPath result:', allResults);
                
                if (allResults && allResults.length > 0) {
                    // Display result in output window
                    const formattedResult = this.formatJsonWithIndent(allResults);
                    this.displayOutput(formattedResult, allResults, true);  // Mark as JSONPath result
                    this.highlightJsonPath(path);
                    this.showMessage('JSONPath result displayed in output', 'success');
                } else {
                    this.showMessage(`JSONPath not found: ${path}`, 'warning');
                }
            }
        } catch (error) {
            this.showMessage(`JSONPath error: ${error.message}`, 'error');
        }
    }

    /**
     * Perform JSONPath lookup on JSONL data
     */
    performJsonlPathLookup(path) {
        try {
            const inputText = this.elements.jsonInput.value.trim();
            const jsonObjects = this.parseJsonlObjects(inputText);
            const results = [];
            const paths = path.split(',').map(p => p.trim());

            jsonObjects.forEach((obj, index) => {
                const lineResults = [];
                let error = null;
                for (const p of paths) {
                    const evalResult = this.evaluateJsonPath(obj, p);
                    if (evalResult.error) {
                        error = evalResult.error;
                        break;
                    }
                    lineResults.push(...evalResult.result);
                }

                if (error) {
                    this.showMessage(`Invalid JSONPath expression in object ${index}: ${error}`, 'error');
                    // Continue to next line
                } else if (lineResults.length > 0) {
                    results.push({
                        from_object: index,
                        value: {
                            result: lineResults
                        }
                    });
                }
            });
            
            if (results.length > 0) {
                let html = '<span class="deemphasized">[\n</span>';
                results.forEach((res, index) => {
                    html += '<span class="deemphasized">  {\n</span>';
                    html += `    <span class="deemphasized">"from_object": ${res.from_object},</span>\n`;
                    html += `    <span class="deemphasized">"value": {</span>\n`;
                    html += `      <span class="deemphasized">"result":</span> ${this.highlightJson(this.formatJsonWithIndent(res.value.result))}\n`;
                    html += `    <span class="deemphasized">}</span>\n`;
                    html += '  <span class="deemphasized">}</span>';
                    if (index < results.length - 1) {
                        html += '<span class="deemphasized">,</span>';
                    }
                    html += '\n';
                });
                html += '<span class="deemphasized">]</span>';

                this.displayOutput(html, results, true, true);
                this.showMessage(`JSONPath found in ${results.length} object${results.length > 1 ? 's' : ''}`, 'success');
            } else {
                this.showMessage(`JSONPath not found in any JSONL objects: ${path}`, 'warning');
            }
        } catch (error) {
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
     * Initialize JSONPath autocomplete using the generic library
     */
    initializeJsonPathAutocomplete() {
        if (!this.elements.jsonPathInput) return;

        try {
            // Create autocomplete adapter using the generic library
            this.autocompleteAdapter = new AutocompleteAdapter(this.elements.jsonPathInput, {
                documentType: 'json',
                queryLanguage: 'jsonpath',
                maxSuggestions: 10,
                debounceMs: 1000,
                showDescriptions: true,
                showSampleValues: true,
                onSelect: (suggestion) => {
                    console.log('JSONPath suggestion selected:', suggestion);
                },
                onError: (error) => {
                    console.error('JSONPath autocomplete error:', error);
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
        this.elements.filePathLabel.style.display = 'none';
        this.elements.filePathLabel.textContent = '';

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

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const content = e.target.result;
                
                // Validate JSON content
                JSON.parse(content);
                
                // Set the content to input
                this.elements.jsonInput.value = content;
                
                // Show truncated file path in panel header (like text diff tool)
                const truncatedPath = this.truncateFilePath(file.name);
                this.elements.filePathLabel.textContent = truncatedPath;
                this.elements.filePathLabel.style.display = 'inline';
                
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
        messageDiv.className = `status-message status-${type}`;
        messageDiv.textContent = message;
        
        this.elements.statusMessages.innerHTML = '';
        this.elements.statusMessages.appendChild(messageDiv);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (messageDiv.parentNode) {
                messageDiv.parentNode.removeChild(messageDiv);
            }
        }, 5000);
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
                    
                    const truncatedPath = this.truncateFilePath(displayPath);
                    this.elements.filePathLabel.textContent = truncatedPath;
                    this.elements.filePathLabel.style.display = 'inline';
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
            const resolvedPath = this.resolveSourcePath(source);
            this.elements.filePathLabel.textContent = this.truncateFilePath(resolvedPath);
            this.elements.filePathLabel.style.display = 'inline';

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