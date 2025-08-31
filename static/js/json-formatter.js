/**
 * Enhanced JSON Formatter Tool - JavaScript Logic
 * Features: JSON/JSONL formatting, syntax highlighting, collapsible elements, JSONPath lookup
 */

class JsonFormatter {
    constructor() {
        this.toolName = 'json-formatter';
        this.lastInputData = '';  // Track last input to detect changes
        this.lastOutputText = '';  // Track last output for markup toggling
        this.originalOutputData = null;  // Store original data before JSONPath filtering
        this.markupEnabled = true;
        this.indentPrefs = { type: 'spaces', size: 2 };
        this.initializeElements();
        this.attachEventListeners();
        this.loadHistory();
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
            
            // Collapsible controls
            expandAllBtn: document.getElementById('expandAllBtn'),
            collapseAllBtn: document.getElementById('collapseAllBtn'),
            toggleMarkupBtn: document.getElementById('toggleMarkupBtn'),
            
            // Controls
            indentType: document.getElementById('indentType'),
            indentSize: document.getElementById('indentSize'),
            jsonPathInput: document.getElementById('jsonPathInput'),
            clearSearchBtn: document.getElementById('clearSearchBtn'),
            
            // History
            historyBtn: document.getElementById('historyBtn'),
            historyPopup: document.getElementById('historyPopup'),
            historyList: document.getElementById('historyList'),
            
            // Global History
            globalHistoryBtn: document.getElementById('globalHistoryBtn'),
            globalHistoryPopup: document.getElementById('globalHistoryPopup'),
            globalHistoryList: document.getElementById('globalHistoryList'),
            
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
        this.elements.jsonPathInput.addEventListener('input', () => this.performJsonPathLookup());
        this.elements.jsonPathInput.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') this.performJsonPathLookup();
        });
        this.elements.clearSearchBtn.addEventListener('click', () => this.clearSearch());

        // History functionality
        this.elements.historyBtn.addEventListener('click', () => this.toggleHistory());
        this.elements.globalHistoryBtn.addEventListener('click', () => this.toggleGlobalHistory());
        document.addEventListener('click', (e) => this.handleOutsideClick(e));

        // History tabs
        document.querySelectorAll('.history-tab').forEach(tab => {
            tab.addEventListener('click', (e) => this.switchHistoryTab(e));
        });

        // Input change detection for real-time stats
        this.elements.jsonInput.addEventListener('input', () => this.updateJsonStats());

        // Prevent form submission on Enter key
        this.elements.jsonInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
                e.preventDefault(); // Prevent default form behavior
            }
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyboardShortcuts(e));
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
                this.saveToHistoryIfChanged(input, 'format');
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
            this.saveToHistoryIfChanged(input, 'format-jsonl');
            
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
            this.saveToHistoryIfChanged(input, 'minify');
            
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
            this.saveToHistoryIfChanged(input, 'minify-jsonl');
            
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
            this.saveToHistoryIfChanged(input, 'stringify');
            
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
    displayOutput(text, parsedData = null, isJsonPathResult = false) {
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
            this.elements.jsonOutputFormatted.innerHTML = this.highlightJson(text);
        } else {
            this.elements.jsonOutput.style.display = 'block';
            this.elements.jsonOutputFormatted.style.display = 'none';
            this.elements.jsonOutput.value = text;
        }

        if (parsedData) {
            this.updateJsonStats(parsedData);
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
                    html += `<span class="json-punctuation">${token.value}</span>`;
                    indent++;
                    break;
                    
                case 'closeBrace':
                case 'closeBracket':
                    indent--;
                    html += `<span class="json-punctuation">${token.value}</span>`;
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

        const outputText = this.lastOutputText || this.elements.jsonOutput.value;
        if (!outputText) {
            this.showMessage('No JSON data to search', 'warning');
            return;
        }

        try {
            // Check if the current data is JSONL
            const inputText = this.elements.jsonInput.value.trim();
            if (this.isJsonl(inputText)) {
                this.performJsonlPathLookup(path);
            } else {
                // Regular JSON path lookup
                const parsed = JSON.parse(outputText);
                const result = this.evaluateJsonPath(parsed, path);
                
                if (result !== null) {
                    // Display result in output window
                    const formattedResult = this.formatJsonWithIndent(result);
                    this.displayOutput(formattedResult, result, true);  // Mark as JSONPath result
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
            
            jsonObjects.forEach((obj, index) => {
                const result = this.evaluateJsonPath(obj, path);
                if (result !== null) {
                    results.push({
                        objectIndex: index,
                        result: result
                    });
                }
            });
            
            if (results.length > 0) {
                // Format results for display
                let displayText = '';
                if (results.length === 1) {
                    // Single result - just show the value
                    displayText = this.formatJsonWithIndent(results[0].result);
                } else {
                    // Multiple results - show as array with object indices
                    const formattedResults = results.map(item => ({
                        from_object: item.objectIndex,
                        value: item.result
                    }));
                    displayText = this.formatJsonWithIndent(formattedResults);
                }
                
                this.displayOutput(displayText, results.length === 1 ? results[0].result : results, true);  // Mark as JSONPath result
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
            // Remove leading $ if present
            path = path.replace(/^\$\.?/, '');
            
            if (!path) return obj;
            
            // Split path into parts
            const parts = path.split(/\.|\[|\]/).filter(p => p !== '');
            
            let current = obj;
            for (const part of parts) {
                if (current === null || current === undefined) {
                    return null;
                }
                
                // Handle array indices
                if (/^\d+$/.test(part)) {
                    current = current[parseInt(part)];
                } else {
                    current = current[part];
                }
            }
            
            return current;
        } catch {
            return null;
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
        this.showMessage('Inputs cleared.', 'success');
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
     * Save input to history only if data has changed
     */
    async saveToHistoryIfChanged(data, operation) {
        // Only save if the data is different from the last saved data
        if (data !== this.lastInputData) {
            this.lastInputData = data;
            await this.saveToHistory(data, operation);
        }
    }

    /**
     * Save input to history via API
     */
    async saveToHistory(data, operation) {
        try {
            const response = await fetch(`/api/history/${this.toolName}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    data: data,
                    operation: operation
                })
            });

            if (response.ok) {
                this.loadHistory(); // Refresh history display
            }
        } catch (error) {
            console.error('Error saving history:', error);
        }
    }

    /**
     * Load history from API
     */
    async loadHistory() {
        try {
            const response = await fetch(`/api/history/${this.toolName}?limit=20`);
            const result = await response.json();
            
            this.displayHistory(result.history || []);
        } catch (error) {
            console.error('Error loading history:', error);
            this.elements.historyList.innerHTML = '<div class="history-item">Failed to load history</div>';
        }
    }

    /**
     * Display history items in the popup
     */
    displayHistory(history) {
        if (history.length === 0) {
            this.elements.historyList.innerHTML = '<div class="history-item">No history available</div>';
            return;
        }

        const historyHtml = history.map(item => `
            <div class="history-item" data-id="${item.id}">
                <div class="history-header">
                    <input type="checkbox" class="history-checkbox" data-id="${item.id}" onclick="event.stopPropagation()">
                    <div class="history-meta">
                        <span class="history-id">ID: ${item.id}</span>
                        <span class="history-date">${this.formatTimestamp(item.timestamp)} - ${item.operation}</span>
                    </div>
                </div>
                <div class="history-preview">${item.preview}</div>
            </div>
        `).join('');

        this.elements.historyList.innerHTML = historyHtml;

        // Add click listeners to history items (excluding checkbox clicks)
        this.elements.historyList.querySelectorAll('.history-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.type !== 'checkbox') {
                    this.loadHistoryEntry(item.dataset.id);
                }
            });
        });

        // Add checkbox event listeners
        this.elements.historyList.querySelectorAll('.history-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                this.handleHistorySelection(e.target.dataset.id, e.target.checked);
            });
        });
    }

    /**
     * Format timestamp for display
     */
    formatTimestamp(isoTimestamp) {
        try {
            const date = new Date(isoTimestamp);
            const now = new Date();
            const diffMs = now - date;
            const diffMins = Math.floor(diffMs / 60000);
            const diffHours = Math.floor(diffMs / 3600000);
            const diffDays = Math.floor(diffMs / 86400000);
            
            if (diffDays > 0) {
                return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
            } else if (diffHours > 0) {
                return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
            } else if (diffMins > 0) {
                return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
            } else {
                return 'Just now';
            }
        } catch (error) {
            // Fallback to basic date formatting
            try {
                return new Date(isoTimestamp).toLocaleString();
            } catch (e) {
                return 'Unknown time';
            }
        }
    }

    /**
     * Handle history item selection
     */
    handleHistorySelection(entryId, isSelected) {
        if (!this.selectedHistoryItems) {
            this.selectedHistoryItems = new Set();
        }
        
        if (isSelected) {
            this.selectedHistoryItems.add(entryId);
        } else {
            this.selectedHistoryItems.delete(entryId);
        }
        
        // Update selection UI or enable/disable bulk actions
        this.updateHistorySelectionUI();
    }

    /**
     * Update UI based on history selections
     */
    updateHistorySelectionUI() {
        const selectedCount = this.selectedHistoryItems ? this.selectedHistoryItems.size : 0;
        
        // Add/update selection counter and action buttons if needed
        let selectionInfo = document.querySelector('.history-selection-info');
        if (!selectionInfo) {
            selectionInfo = document.createElement('div');
            selectionInfo.className = 'history-selection-info';
            this.elements.historyPopup.insertBefore(selectionInfo, this.elements.historyPopup.firstChild);
        }
        
        if (selectedCount > 0) {
            selectionInfo.innerHTML = `
                <div style="padding: 8px; background: #e3f2fd; border-bottom: 1px solid #90caf9; font-size: 11px;">
                    ${selectedCount} item${selectedCount > 1 ? 's' : ''} selected
                    <button onclick="window.jsonFormatter.clearHistorySelection()" style="float: right; background: none; border: none; color: #1976d2; cursor: pointer;">Clear</button>
                </div>
            `;
        } else {
            selectionInfo.innerHTML = '';
        }
    }

    /**
     * Clear history selection
     */
    clearHistorySelection() {
        this.selectedHistoryItems?.clear();
        // Uncheck all checkboxes
        this.elements.historyList.querySelectorAll('.history-checkbox').forEach(checkbox => {
            checkbox.checked = false;
        });
        this.updateHistorySelectionUI();
    }

    /**
     * Load specific history entry
     */
    async loadHistoryEntry(entryId) {
        try {
            const response = await fetch(`/api/history/${this.toolName}/${entryId}`);
            const entry = await response.json();
            
            if (entry.data) {
                this.elements.jsonInput.value = entry.data;
                this.lastInputData = entry.data; // Update tracking to prevent duplicate save
                this.updateJsonStats();
                this.toggleHistory(); // Close history popup
                this.showMessage('History entry loaded!', 'success');
            }
        } catch (error) {
            console.error('Error loading history entry:', error);
            this.showMessage('Failed to load history entry', 'error');
        }
    }

    /**
     * Toggle history popup visibility
     */
    toggleHistory() {
        this.elements.historyPopup.classList.toggle('show');
        if (this.elements.historyPopup.classList.contains('show')) {
            this.loadHistory(); // Refresh when opening
        }
    }

    /**
     * Handle clicks outside history popup
     */
    handleOutsideClick(event) {
        if (!this.elements.historyPopup.contains(event.target) && 
            !this.elements.historyBtn.contains(event.target)) {
            this.elements.historyPopup.classList.remove('show');
        }
        
        // Also handle global history popup
        if (!this.elements.globalHistoryPopup.contains(event.target) && 
            !this.elements.globalHistoryBtn.contains(event.target)) {
            this.elements.globalHistoryPopup.classList.remove('show');
        }
    }

    /**
     * Switch between history tabs
     */
    switchHistoryTab(event) {
        const tabName = event.target.dataset.tab;
        
        // Update tab buttons
        document.querySelectorAll('.history-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        event.target.classList.add('active');

        // Update tab content
        const historyTab = document.getElementById('historyTab');
        const copyTab = document.getElementById('copyTab');
        
        if (tabName === 'history') {
            historyTab.style.display = 'block';
            copyTab.style.display = 'none';
        } else {
            historyTab.style.display = 'none';
            copyTab.style.display = 'block';
        }
    }

    /**
     * Toggle global history popup
     */
    toggleGlobalHistory() {
        if (this.elements.globalHistoryPopup.classList.contains('show')) {
            this.elements.globalHistoryPopup.classList.remove('show');
        } else {
            this.elements.globalHistoryPopup.classList.add('show');
            this.loadGlobalHistory(); // Refresh when opening
        }
    }

    /**
     * Load global history from API
     */
    async loadGlobalHistory() {
        try {
            const response = await fetch(`/api/global-history?limit=50`);
            const result = await response.json();
            
            this.displayGlobalHistory(result.history || []);
        } catch (error) {
            console.error('Error loading global history:', error);
            this.elements.globalHistoryList.innerHTML = '<div class="global-history-item">Failed to load global history</div>';
        }
    }

    /**
     * Display global history items
     */
    displayGlobalHistory(history) {
        if (history.length === 0) {
            this.elements.globalHistoryList.innerHTML = '<div class="global-history-item">No global history available</div>';
            return;
        }

        const historyHtml = history.map(item => `
            <div class="global-history-item" data-id="${item.id}" data-tool="${item.tool_name}">
                <div class="global-history-item-header">
                    <input type="checkbox" class="global-history-checkbox" data-id="${item.id}" onclick="event.stopPropagation()">
                    <div class="global-history-item-meta">
                        <div class="global-history-id-tool">
                            <span class="history-id">ID: ${item.id}</span>
                            <span class="global-history-tool-label" style="background-color: ${item.tool_color}">${item.tool_name}</span>
                        </div>
                        <span class="history-date">${this.formatTimestamp(item.timestamp)} - ${item.operation}</span>
                    </div>
                </div>
                <div class="history-preview">${item.preview}</div>
            </div>
        `).join('');

        this.elements.globalHistoryList.innerHTML = historyHtml;

        // Add click listeners to global history items
        this.elements.globalHistoryList.querySelectorAll('.global-history-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.type !== 'checkbox') {
                    this.loadGlobalHistoryEntry(item.dataset.id, item.dataset.tool);
                }
            });
        });
    }

    /**
     * Load specific global history entry
     */
    async loadGlobalHistoryEntry(entryId, toolName) {
        try {
            const response = await fetch(`/api/global-history/${entryId}`);
            const entry = await response.json();
            
            if (entry.data) {
                // Only load if it's from the same tool
                if (toolName === this.toolName) {
                    this.elements.jsonInput.value = entry.data;
                    this.lastInputData = entry.data;
                    this.updateJsonStats();
                    this.toggleGlobalHistory(); // Close popup
                    this.showMessage('Global history entry loaded!', 'success');
                } else {
                    this.showMessage(`This entry is from ${toolName}. Cannot load into ${this.toolName}.`, 'warning');
                }
            }
        } catch (error) {
            console.error('Error loading global history entry:', error);
            this.showMessage('Failed to load global history entry', 'error');
        }
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
                    this.toggleHistory();
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
}

// Global function for collapsible elements
function toggleCollapse(element) {
    const isCollapsed = element.textContent === '+';
    let nextSibling = element.nextSibling;
    
    if (isCollapsed) {
        element.textContent = '-';
        while (nextSibling && nextSibling.nodeType !== 1) {
            nextSibling = nextSibling.nextSibling;
        }
        if (nextSibling && nextSibling.classList && nextSibling.classList.contains('collapsed-content')) {
            nextSibling.style.display = 'inline';
            nextSibling.classList.remove('collapsed-content');
        }
    } else {
        element.textContent = '+';
        while (nextSibling && nextSibling.nodeType !== 1) {
            nextSibling = nextSibling.nextSibling;
        }
        if (nextSibling) {
            nextSibling.style.display = 'none';
            nextSibling.classList.add('collapsed-content');
        }
    }
}

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = JsonFormatter;
}

// Initialize when DOM is loaded (only in browser environment)
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        window.jsonFormatter = new JsonFormatter();
    });
}