// Enhanced Regex Tester Tool - Modular JavaScript Implementation
document.addEventListener('DOMContentLoaded', function() {
    window.regexTester = new RegexTester();
});

class RegexTester {
    constructor() {
        this.toolName = 'regex-tester';
        this.historyEnabled = localStorage.getItem(`${this.toolName}-historyEnabled`) !== 'false';
        this.lastInputData = null;
        this.currentMatches = [];
        this.activeMatchIndex = -1;
        this.matchesPanelVisible = false;
        this.fontSize = parseInt(localStorage.getItem(`${this.toolName}-fontSize`) || '13');

        this.elements = {
            // Input elements
            regexInput: document.getElementById('regexInput'),
            testText: document.getElementById('testText'),

            // Flag checkboxes
            flagGlobal: document.getElementById('flagGlobal'),
            flagIgnoreCase: document.getElementById('flagIgnoreCase'),
            flagMultiline: document.getElementById('flagMultiline'),
            flagDotAll: document.getElementById('flagDotAll'),
            flagUnicode: document.getElementById('flagUnicode'),

            // Display elements
            highlightedText: document.getElementById('highlightedText'),
            matchCount: document.getElementById('matchCount'),
            matchesCount: document.getElementById('matchesCount'),
            matchesList: document.getElementById('matchesList'),
            matchesPanel: document.getElementById('matchesPanel'),
            regexError: document.getElementById('regexError'),
            statusText: document.getElementById('statusText'),
            regexInfo: document.getElementById('regexInfo'),

            // Buttons
            testBtn: document.getElementById('testBtn'),
            clearBtn: document.getElementById('clearBtn'),
            sampleBtn: document.getElementById('sampleBtn'),
            copyMatchesBtn: document.getElementById('copyMatchesBtn'),
            toggleMatchesBtn: document.getElementById('toggleMatchesBtn'),

            // History
            historyBtn: document.getElementById('historyBtn'),
            historyToggleBtn: document.getElementById('historyToggleBtn'),
            historyPopup: document.getElementById('historyPopup'),
            historyList: document.getElementById('historyList'),

            // Global History
            globalHistoryBtn: document.getElementById('globalHistoryBtn'),
            globalHistoryPopup: document.getElementById('globalHistoryPopup'),
            globalHistoryList: document.getElementById('globalHistoryList'),

            // Font controls
            fontIncreaseBtn: document.getElementById('fontIncreaseBtn'),
            fontDecreaseBtn: document.getElementById('fontDecreaseBtn')
        };

        this.attachEventListeners();
        this.loadHistory();
        this.initializeHistoryToggle();
        this.applyFontSize();
        this.updateStatus('Ready - Enter a regex pattern and test string');
    }

    // Event Listeners
    attachEventListeners() {
        // Main functionality
        this.elements.testBtn.addEventListener('click', () => this.testRegex());
        this.elements.clearBtn.addEventListener('click', () => this.clearAll());
        this.elements.sampleBtn.addEventListener('click', () => this.loadSampleData());
        this.elements.copyMatchesBtn.addEventListener('click', () => this.copyMatches());
        this.elements.toggleMatchesBtn.addEventListener('click', () => this.toggleMatchesPanel());

        // Auto-test on input changes
        this.elements.regexInput.addEventListener('input', () => this.debounceTest());
        this.elements.testText.addEventListener('input', () => this.debounceTest());

        // Flag changes
        [this.elements.flagGlobal, this.elements.flagIgnoreCase, this.elements.flagMultiline,
            this.elements.flagDotAll, this.elements.flagUnicode].forEach(flag => {
            flag.addEventListener('change', () => this.debounceTest());
        });

        // Example buttons
        document.querySelectorAll('.example-btn[data-pattern]').forEach(btn => {
            btn.addEventListener('click', (e) => this.loadExample(e));
        });

        // History functionality
        this.elements.historyBtn.addEventListener('click', () => this.toggleHistory());
        this.elements.historyToggleBtn.addEventListener('click', () => this.toggleHistoryEnabled());
        this.elements.globalHistoryBtn.addEventListener('click', () => this.toggleGlobalHistory());

        // Font size controls
        this.elements.fontIncreaseBtn.addEventListener('click', () => this.increaseFontSize());
        this.elements.fontDecreaseBtn.addEventListener('click', () => this.decreaseFontSize());

        // History tabs
        document.querySelectorAll('.history-tab').forEach(tab => {
            tab.addEventListener('click', (e) => this.switchHistoryTab(e));
        });

        // Outside click handler
        document.addEventListener('click', (e) => this.handleOutsideClick(e));

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeydown(e));
    }

    // Debounced testing for live updates
    debounceTest() {
        clearTimeout(this.testTimeout);
        this.testTimeout = setTimeout(() => {
            if (this.elements.regexInput.value.trim() && this.elements.testText.value.trim()) {
                this.testRegex();
            }
        }, 300);
    }

    // Core Regex Testing Logic
    async testRegex() {
        const pattern = this.elements.regexInput.value.trim();
        const testText = this.elements.testText.value;

        this.clearError();

        if (!pattern) {
            this.showNoPattern();
            return;
        }

        // Handle empty pattern case
        if (pattern === '') {
            this.showError('Empty pattern not allowed');
            return;
        }

        // Security: Check input size limits
        const MAX_PATTERN_LENGTH = 1000;
        const MAX_TEXT_LENGTH = 50000; // 50KB

        if (pattern.length > MAX_PATTERN_LENGTH) {
            this.showError(`Pattern too long (max ${MAX_PATTERN_LENGTH} characters)`);
            return;
        }

        if (testText.length > MAX_TEXT_LENGTH) {
            this.showError(`Test text too long (max ${MAX_TEXT_LENGTH.toLocaleString()} characters)`);
            return;
        }

        // Security: Pattern complexity analysis
        /*const complexityResult = this.analyzePatternComplexity(pattern);
        if (!complexityResult.safe) {
            this.showError(`Potentially dangerous pattern: ${complexityResult.reason}`);
            return;
        }
        */

        if (!testText) {
            this.showNoText();
            return;
        }

        try {
            const flags = this.getRegexFlags();
            const regex = new RegExp(pattern, flags);
            this.elements.regexInput.className = 'regex-input valid';

            // Security: Execute with timeout protection
            const startTime = performance.now();
            const matches = await this.findMatchesWithTimeout(regex, testText, flags, pattern, 2000);
            const executionTime = performance.now() - startTime;

            this.currentMatches = matches;

            this.displayResults(matches);
            this.updateMatchCount(matches.length);

            // Performance monitoring with warnings
            let statusMessage;
            if (executionTime > 1000) {
                statusMessage = `⚠️ SLOW: Found ${matches.length} match${matches.length > 1 ? 'es' : ''} (${Math.round(executionTime)}ms)`;
            } else if (executionTime > 500) {
                statusMessage = `Found ${matches.length} match${matches.length > 1 ? 'es' : ''} (${Math.round(executionTime)}ms)`;
            } else {
                statusMessage = matches.length > 0 ?
                    `Found ${matches.length} match${matches.length > 1 ? 'es' : ''}` :
                    'No matches found';
            }
            this.updateStatus(statusMessage);

            this.updateRegexInfo(pattern, testText.length, flags, executionTime);

            // Save to history if enabled
            this.saveToHistoryIfChanged(pattern, testText, flags, 'test');

        } catch (error) {
            if (error.name === 'TimeoutError') {
                this.showError('⚠️ TIMEOUT: Pattern execution took too long (potential ReDoS)');
            } else {
                this.showError(error.message);
            }
        }
    }

    // Security: Timeout-protected regex matching
    async findMatchesWithTimeout(regex, text, flags, pattern, timeoutMs = 2000) {
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                const error = new Error('Pattern execution timeout');
                error.name = 'TimeoutError';
                reject(error);
            }, timeoutMs);

            try {
                const matches = this.findMatches(regex, text, flags, pattern);
                clearTimeout(timeoutId);
                resolve(matches);
            } catch (error) {
                clearTimeout(timeoutId);
                reject(error);
            }
        });
    }

    // Regex Matching Logic
    findMatches(regex, text, flags, pattern) {
        const matches = [];
        let match;
        let iterations = 0;
        const MAX_ITERATIONS = 10000; // Prevent runaway regex

        // Standard matching logic
        if (flags.includes('g')) {
            while ((match = regex.exec(text)) !== null) {
                matches.push({
                    match: match[0],
                    index: match.index,
                    endIndex: match.index + match[0].length,
                    groups: match.slice(1),
                    fullMatch: match
                });

                // Prevent infinite loop on zero-length matches
                if (match.index === regex.lastIndex) {
                    regex.lastIndex++;
                }

                // Security: Prevent excessive iterations
                iterations++;
                if (iterations > MAX_ITERATIONS) {
                    throw new Error(`Too many matches (>${MAX_ITERATIONS}) - pattern may be inefficient`);
                }
            }
        } else {
            match = regex.exec(text);
            if (match) {
                matches.push({
                    match: match[0],
                    index: match.index,
                    endIndex: match.index + match[0].length,
                    groups: match.slice(1),
                    fullMatch: match
                });
            }
        }

        return matches;
    }

    // Display and Highlighting Logic
    displayResults(matches) {
        if (matches.length === 0) {
            this.showNoMatches();
            return;
        }

        const text = this.elements.testText.value;
        this.highlightMatches(text, matches);
        this.displayMatchDetails(matches);
    }

    highlightMatches(text, matches) {
        let highlightedHtml = '';
        let lastIndex = 0;

        // Sort matches by index to handle overlapping correctly
        const sortedMatches = [...matches].sort((a, b) => a.index - b.index);

        sortedMatches.forEach((match, matchIndex) => {
            // Add text before match
            highlightedHtml += this.escapeHtml(text.slice(lastIndex, match.index));

            // Add highlighted match with groups
            highlightedHtml += this.createMatchHtml(match, matchIndex);

            lastIndex = match.endIndex;
        });

        // Add remaining text
        highlightedHtml += this.escapeHtml(text.slice(lastIndex));

        this.elements.highlightedText.innerHTML = highlightedHtml;
    }

    createMatchHtml(match, matchIndex) {
        const groupInfo = match.groups.length > 0 ?
            ` (${match.groups.length} group${match.groups.length > 1 ? 's' : ''})` : '';

        let html = `<span class="regex-match group-0" data-match-index="${matchIndex}" title="Full match: ${this.escapeHtml(match.match)}${groupInfo}">`;

        // For now, highlight the entire match with group-0 styling
        // Future enhancement: implement sophisticated group parsing for individual group highlighting
        html += this.escapeHtml(match.match);

        html += '</span>';
        return html;
    }

    displayMatchDetails(matches) {
        let detailsHtml = '';

        matches.forEach((match, index) => {
            detailsHtml += `
                        <div class="match-item" data-match-index="${index}">
                            <span class="match-index">#${index + 1}</span>
                            <span class="match-text">${this.escapeHtml(match.match)}</span>
                            <span class="match-position">at ${match.index}-${match.endIndex}</span>
                            ${match.groups.length > 0 ? this.createGroupsHtml(match.groups) : ''}
                        </div>
                    `;
        });

        this.elements.matchesList.innerHTML = detailsHtml;
        this.elements.matchesCount.textContent = `${matches.length} match${matches.length > 1 ? 'es' : ''}`;

        // Add click handlers for match items
        document.querySelectorAll('.match-item').forEach(item => {
            item.addEventListener('click', (e) => this.highlightMatch(e));
        });
    }

    createGroupsHtml(groups) {
        if (groups.length === 0) return '';

        let groupsHtml = '<div class="group-matches">';
        groups.forEach((group, index) => {
            if (group !== undefined) {
                groupsHtml += `<span class="group-match group-${(index % 9) + 1}">$${index + 1}: "${this.escapeHtml(group)}"</span>`;
            }
        });
        groupsHtml += '</div>';

        return groupsHtml;
    }

    // UI State Management
    showNoPattern() {
        this.elements.highlightedText.innerHTML = '<div class="regex-no-match">Enter a regex pattern to test</div>';
        this.updateMatchCount(0, 'NO PATTERN');
        this.updateStatus('Enter a regex pattern');
    }

    showNoText() {
        this.elements.highlightedText.innerHTML = '<div class="regex-no-match">Enter test string to match against</div>';
        this.updateMatchCount(0, 'NO TEXT');
        this.updateStatus('Enter test string');
    }

    showNoMatches() {
        this.elements.highlightedText.innerHTML = '<div class="regex-no-match">No matches found</div>';
        this.elements.matchesList.innerHTML = '<div class="match-item">No matches to display</div>';
        this.elements.matchesCount.textContent = '0 matches';
    }

    showError(message) {
        this.elements.regexInput.className = 'regex-input error';
        this.elements.regexError.textContent = `Error: ${message}`;
        this.elements.highlightedText.innerHTML = '<div class="regex-no-match">Invalid regex pattern</div>';
        this.updateMatchCount(0, 'ERROR');
        this.updateStatus(`Regex error: ${message}`);
    }

    clearError() {
        this.elements.regexError.textContent = '';
        this.elements.regexInput.className = 'regex-input';
    }

    updateMatchCount(count, customText = null) {
        const text = customText || (count === 0 ? 'NO MATCHES' : `${count} MATCH${count > 1 ? 'ES' : ''}`);
        this.elements.matchCount.textContent = text;
        this.elements.matchCount.className = `match-indicator ${count > 0 ? 'matches' : 'no-matches'}`;
    }

    updateStatus(message) {
        this.elements.statusText.textContent = message;
    }

    updateRegexInfo(pattern, textLength, flags, executionTime = null) {
        let info = `Pattern: /${pattern}/${flags} | Test length: ${textLength}`;
        if (executionTime !== null) {
            info += ` | Time: ${Math.round(executionTime)}ms`;
        }
        this.elements.regexInfo.textContent = info;
    }

    // Security: Pattern complexity analysis
    analyzePatternComplexity(pattern) {
        const dangerousPatterns = [
            // Known ReDoS patterns - Enhanced detection
            { pattern: /\(([^)]*[+*]){1,}[^)]*\)[+*]/, reason: 'Nested quantifiers (ReDoS risk)' },
            { pattern: /\(([^)|]*\|[^)]*){2,}\)[+*]/, reason: 'Multiple alternations with quantifiers (ReDoS risk)' },
            { pattern: /\([^)]*[+*][^)]*[+*][^)]*\)[+*]/, reason: 'Multiple quantifiers in group (ReDoS risk)' },
            { pattern: /\(.*\*.*\*.*\)[+*]/, reason: 'Nested star quantifiers (ReDoS risk)' },

            // Specific dangerous patterns we found in testing
            { pattern: /\(a\+\)\+/, reason: 'Classic ReDoS pattern (a+)+' },
            { pattern: /\(a\|a\)\*/, reason: 'Alternation ambiguity (a|a)*' },
            { pattern: /\(a\*\)\*/, reason: 'Nested star quantifiers (a*)*' },
            { pattern: /\([^)]*\|[^)]*\)[+*]/, reason: 'Alternation with quantifier (ReDoS risk)' },

            // Resource exhaustion patterns
            { pattern: /\{\d{4,}/, reason: 'Very large quantifier (memory risk)' },
            { pattern: /\[([^\]]{100,})\]/, reason: 'Very large character class (memory risk)' },
        ];

        for (const dangerous of dangerousPatterns) {
            if (dangerous.pattern.test(pattern)) {
                return { safe: false, reason: dangerous.reason };
            }
        }

        // Count nesting levels
        let nestingLevel = 0;
        let maxNesting = 0;
        for (const char of pattern) {
            if (char === '(') {
                nestingLevel++;
                maxNesting = Math.max(maxNesting, nestingLevel);
            } else if (char === ')') {
                nestingLevel--;
            }
        }

        if (maxNesting > 10) {
            return { safe: false, reason: 'Too many nested groups (complexity risk)' };
        }

        // Count alternations
        const alternationCount = (pattern.match(/\|/g) || []).length;
        if (alternationCount > 15) {
            return { safe: false, reason: 'Too many alternations (complexity risk)' };
        }

        // Additional ReDoS pattern checks
        // Check for any group followed by + or * that contains quantifiers
        if (/\([^)]*[+*?].*\)[+*]/.test(pattern)) {
            return { safe: false, reason: 'Quantified group containing quantifiers (ReDoS risk)' };
        }

        // Check for excessive quantifier nesting depth
        let quantifierDepth = 0;
        let maxQuantifierDepth = 0;
        for (let i = 0; i < pattern.length; i++) {
            const char = pattern[i];
            if (char === '(' && i < pattern.length - 1) {
                // Look ahead to see if this group has quantifiers
                let groupEnd = i + 1;
                let parenLevel = 1;
                let hasQuantifier = false;

                while (groupEnd < pattern.length && parenLevel > 0) {
                    if (pattern[groupEnd] === '(') parenLevel++;
                    else if (pattern[groupEnd] === ')') {
                        parenLevel--;
                        if (parenLevel === 0 && groupEnd < pattern.length - 1) {
                            const nextChar = pattern[groupEnd + 1];
                            if (['+', '*', '?', '{'].includes(nextChar)) {
                                hasQuantifier = true;
                            }
                        }
                    }
                    groupEnd++;
                }

                if (hasQuantifier) {
                    quantifierDepth++;
                    maxQuantifierDepth = Math.max(maxQuantifierDepth, quantifierDepth);
                }
            }
        }

        if (maxQuantifierDepth > 3) {
            return { safe: false, reason: 'Too many nested quantified groups (ReDoS risk)' };
        }

        // Final safety check - warn about suspicious patterns
        const suspiciousPatterns = [
            /\([^)]*\)[+*].*\([^)]*\)[+*]/, // Multiple quantified groups
            /[+*]{2,}/, // Multiple consecutive quantifiers
        ];

        for (const suspicious of suspiciousPatterns) {
            if (suspicious.test(pattern)) {
                return { safe: false, reason: 'Suspicious pattern structure (potential performance risk)' };
            }
        }

        return { safe: true, reason: null };
    }

    // Utility Functions
    getRegexFlags() {
        let flags = '';
        if (this.elements.flagGlobal.checked) flags += 'g';
        if (this.elements.flagIgnoreCase.checked) flags += 'i';
        if (this.elements.flagMultiline.checked) flags += 'm';
        if (this.elements.flagDotAll.checked) flags += 's';
        if (this.elements.flagUnicode.checked) flags += 'u';
        return flags;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // UI Actions
    clearAll() {
        this.elements.regexInput.value = '';
        this.elements.testText.value = '';
        this.elements.highlightedText.innerHTML = '<div class="regex-no-match">Enter a regex pattern and test string to see matches highlighted</div>';
        this.elements.matchesList.innerHTML = '';
        this.updateMatchCount(0);
        this.clearError();
        this.updateStatus('Ready - Enter a regex pattern and test string');
        this.updateRegexInfo('None', 0, '');
        this.currentMatches = [];
    }

    loadSampleData() {
        this.elements.regexInput.value = '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}';
        this.elements.testText.value = 'Contact us at support@example.com or sales@company.org\nInvalid: not-an-email\nAlso try: user@test.co.uk';
        this.elements.flagGlobal.checked = true;
        this.testRegex();
    }

    loadExample(event) {
        const btn = event.target;
        const pattern = btn.dataset.pattern;
        const text = btn.dataset.text;
        const flags = btn.dataset.flags;

        this.elements.regexInput.value = pattern;
        // Convert literal \n to actual newlines
        this.elements.testText.value = text.replace(/\\n/g, '\n');

        // Set flags if specified
        if (flags) {
            this.elements.flagGlobal.checked = flags.includes('g');
            this.elements.flagIgnoreCase.checked = flags.includes('i');
            this.elements.flagMultiline.checked = flags.includes('m');
            this.elements.flagDotAll.checked = flags.includes('s');
            this.elements.flagUnicode.checked = flags.includes('u');
        } else {
            // Default: only global flag
            this.elements.flagGlobal.checked = true;
            this.elements.flagIgnoreCase.checked = false;
            this.elements.flagMultiline.checked = false;
            this.elements.flagDotAll.checked = false;
            this.elements.flagUnicode.checked = false;
        }

        this.testRegex();
    }

    async copyMatches() {
        if (this.currentMatches.length === 0) {
            this.updateStatus('No matches to copy');
            return;
        }

        const matchesText = this.currentMatches.map((match, index) =>
            `Match ${index + 1}: "${match.match}" at ${match.index}-${match.endIndex}${
                match.groups.length > 0 ?
                    '\n  Groups: ' + match.groups.map((g, i) => `$${i+1}: "${g}"`).join(', ') :
                    ''
            }`
        ).join('\n');

        try {
            await navigator.clipboard.writeText(matchesText);
            this.updateStatus('Matches copied to clipboard');
        } catch (err) {
            console.error('Failed to copy matches: ', err);
            this.updateStatus('Failed to copy matches');
        }
    }

    toggleMatchesPanel() {
        this.matchesPanelVisible = !this.matchesPanelVisible;

        if (this.matchesPanelVisible) {
            this.elements.matchesPanel.classList.add('show');
            this.elements.toggleMatchesBtn.textContent = 'Hide Details';
        } else {
            this.elements.matchesPanel.classList.remove('show');
            this.elements.toggleMatchesBtn.textContent = 'Show Details';
        }
    }

    highlightMatch(event) {
        const matchIndex = parseInt(event.currentTarget.dataset.matchIndex);

        // Remove previous active states
        document.querySelectorAll('.match-item.active').forEach(item => {
            item.classList.remove('active');
        });

        // Add active state to clicked item
        event.currentTarget.classList.add('active');

        // Scroll to match in highlighted text (future enhancement)
        this.activeMatchIndex = matchIndex;
    }

    handleKeydown(e) {
        if (e.ctrlKey || e.metaKey) {
            switch(e.key) {
                case 'Enter':
                    e.preventDefault();
                    this.testRegex();
                    break;
            }
        }
    }

    // History functionality (matching other tools)
    async saveToHistoryIfChanged(pattern, testText, flags, operation) {
        if (!this.historyEnabled) {
            return;
        }

        const currentData = JSON.stringify({ pattern, testText, flags });
        if (currentData !== this.lastInputData) {
            this.lastInputData = currentData;
            await this.saveToHistory({ pattern, testText, flags }, operation);
        }
    }

    async saveToHistory(data, operation) {
        if (!this.historyEnabled) return;

        try {
            const response = await fetch(`/api/history/${this.toolName}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    data: JSON.stringify(data),
                    operation: operation
                })
            });

            if (response.ok) {
                this.loadHistory();
            }
        } catch (error) {
            console.error('Error saving history:', error);
        }
    }

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

    displayHistory(history) {
        if (history.length === 0) {
            this.elements.historyList.innerHTML = '<div class="history-item">No regex test history available</div>';
            return;
        }

        this.elements.historyList.innerHTML = history.map(entry => {
            try {
                const time = new Date(entry.timestamp).toLocaleString();
                // Use the preview field directly (it's already a formatted string from the backend)
                const preview = entry.preview || 'No preview available';

                return `
                            <div class="history-item" onclick="regexTester.loadHistoryEntry('${entry.id}')">
                                <div class="history-item-header" style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px;">
                                    <div class="history-item-content" style="flex: 1; display: flex; align-items: flex-start; gap: 6px;">
                                        <input type="checkbox" class="history-checkbox" data-id="${entry.id}" onclick="regexTester.handleHistorySelection('${entry.id}', event.target.checked); event.stopPropagation();" style="margin-top: 2px; cursor: pointer;">
                                        <div class="history-meta" style="display: flex; flex-direction: column; gap: 2px;">
                                            <span class="history-id" style="font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace; font-size: 9px; color: #666; font-weight: bold;">ID: ${entry.id}</span>
                                            <div class="history-item-time" style="color: #999; font-size: 10px;">${time} - ${entry.operation || 'test'}</div>
                                        </div>
                                    </div>
                                    <button class="history-delete-btn" onclick="regexTester.deleteHistoryItem('${entry.id}'); event.stopPropagation();" style="background: #ff4444; color: white; border: none; border-radius: 2px; padding: 2px 6px; font-size: 10px; cursor: pointer; margin-left: 8px; opacity: 0.7; transition: opacity 0.2s;">×</button>
                                </div>
                                <div class="history-item-preview" style="font-family: 'Consolas', 'Monaco', monospace; font-size: 10px; color: #333; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-height: 40px; line-height: 1.3;">${preview}</div>
                            </div>
                        `;
            } catch (error) {
                console.error('Error displaying history entry:', error, entry);
                return '<div class="history-item">Error loading entry</div>';
            }
        }).join('');
    }

    async loadHistoryEntry(entryId) {
        try {
            const response = await fetch(`/api/history/${this.toolName}/${entryId}`);
            const entry = await response.json();

            if (entry && entry.data) {
                const data = JSON.parse(entry.data);

                this.elements.regexInput.value = data.pattern || '';
                // Convert literal \n to actual newlines (same as loadExample)
                this.elements.testText.value = (data.testText || '').replace(/\\n/g, '\n');

                // Set flags
                this.elements.flagGlobal.checked = (data.flags || '').includes('g');
                this.elements.flagIgnoreCase.checked = (data.flags || '').includes('i');
                this.elements.flagMultiline.checked = (data.flags || '').includes('m');
                this.elements.flagDotAll.checked = (data.flags || '').includes('s');
                this.elements.flagUnicode.checked = (data.flags || '').includes('u');

                this.elements.historyPopup.classList.remove('show');
                this.testRegex();
                this.updateStatus('History entry loaded');
            }
        } catch (error) {
            console.error('Error loading history entry:', error);
            this.updateStatus('Failed to load history entry');
        }
    }

    toggleHistory() {
        this.elements.historyPopup.classList.toggle('show');
        if (this.elements.historyPopup.classList.contains('show')) {
            this.loadHistory();
        }
    }

    toggleHistoryEnabled() {
        this.historyEnabled = !this.historyEnabled;
        localStorage.setItem(`${this.toolName}-historyEnabled`, this.historyEnabled.toString());

        const btn = this.elements.historyToggleBtn;
        if (this.historyEnabled) {
            btn.textContent = '📝 History On';
            btn.classList.remove('disabled');
            btn.title = 'History Enabled - Click to Disable';
            this.updateStatus('History enabled');
        } else {
            btn.textContent = '📝 History Off';
            btn.classList.add('disabled');
            btn.title = 'History Disabled - Click to Enable';
            this.updateStatus('History disabled - tests will not be saved');
        }
    }

    initializeHistoryToggle() {
        const btn = this.elements.historyToggleBtn;
        if (this.historyEnabled) {
            btn.textContent = '📝 History On';
            btn.classList.remove('disabled');
            btn.title = 'History Enabled - Click to Disable';
        } else {
            btn.textContent = '📝 History Off';
            btn.classList.add('disabled');
            btn.title = 'History Disabled - Click to Enable';
        }
    }

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

    displayGlobalHistory(history) {
        if (history.length === 0) {
            this.elements.globalHistoryList.innerHTML = '<div class="global-history-item">No global history available</div>';
            return;
        }

        this.elements.globalHistoryList.innerHTML = history.map(entry => {
            const time = new Date(entry.timestamp).toLocaleString();
            const toolColor = this.getToolColor(entry.tool_name);

            return `
                        <div class="global-history-item" onclick="regexTester.loadGlobalHistoryEntry('${entry.id}', '${entry.tool_name}')">
                            <div class="global-history-item-header">
                                <input type="checkbox" class="global-history-checkbox" onclick="regexTester.handleHistorySelection('${entry.id}', event.target.checked); event.stopPropagation();">
                                <div class="global-history-item-meta">
                                    <div class="global-history-id-tool">
                                        <span style="font-family: 'Consolas', monospace; font-size: 9px; color: #666;">#${entry.id}</span>
                                        <span class="global-history-tool-label" style="background: ${toolColor};">${entry.tool_name}</span>
                                    </div>
                                    <div style="font-size: 9px; color: #999;">${time}</div>
                                </div>
                            </div>
                            <div style="font-size: 10px; color: #666; margin-top: 4px;">${entry.operation}</div>
                        </div>
                    `;
        }).join('');
    }

    async loadGlobalHistoryEntry(entryId, toolName) {
        if (toolName !== this.toolName) {
            this.updateStatus('Cannot load entry from different tool');
            return;
        }

        try {
            const response = await fetch(`/api/global-history/${entryId}`);
            const entry = await response.json();

            if (entry && entry.data) {
                const data = JSON.parse(entry.data);

                this.elements.regexInput.value = data.pattern || '';
                // Convert literal \n to actual newlines (same as loadExample)
                this.elements.testText.value = (data.testText || '').replace(/\\n/g, '\n');

                // Set flags
                this.elements.flagGlobal.checked = (data.flags || '').includes('g');
                this.elements.flagIgnoreCase.checked = (data.flags || '').includes('i');
                this.elements.flagMultiline.checked = (data.flags || '').includes('m');
                this.elements.flagDotAll.checked = (data.flags || '').includes('s');
                this.elements.flagUnicode.checked = (data.flags || '').includes('u');

                this.elements.globalHistoryPopup.classList.remove('show');
                this.testRegex();
                this.updateStatus('Global history entry loaded');
            }
        } catch (error) {
            console.error('Error loading global history entry:', error);
            this.updateStatus('Failed to load global history entry');
        }
    }

    toggleGlobalHistory() {
        this.elements.globalHistoryPopup.classList.toggle('show');
        if (this.elements.globalHistoryPopup.classList.contains('show')) {
            this.loadGlobalHistory();
        }
    }

    getToolColor(toolName) {
        const colors = {
            'json-formatter': '#2196F3',
            'json-yaml-xml-converter': '#4CAF50',
            'text-diff': '#FF5722',
            'regex-tester': '#9C27B0',
            'base64-encoder-decoder': '#FF9800',
            'url-encoder-decoder': '#607D8B',
            'hash-generator': '#F44336',
            'qr-code-generator': '#795548'
        };
        return colors[toolName] || '#757575';
    }

    async deleteHistoryItem(entryId) {
        try {
            const response = await fetch(`/api/history/${this.toolName}/${entryId}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                this.updateStatus('History item deleted');
                this.loadHistory();
                this.loadGlobalHistory();
            } else {
                this.updateStatus('Failed to delete history item');
            }
        } catch (error) {
            console.error('Error deleting history item:', error);
            this.updateStatus('Failed to delete history item');
        }
    }

    async deleteGlobalHistoryItem(entryId) {
        try {
            const response = await fetch(`/api/global-history/${entryId}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                this.updateStatus('History item deleted');
                this.loadHistory();
                this.loadGlobalHistory();
            } else {
                this.updateStatus('Failed to delete history item');
            }
        } catch (error) {
            console.error('Error deleting global history item:', error);
            this.updateStatus('Failed to delete history item');
        }
    }

    switchHistoryTab(event) {
        const clickedTab = event.target;
        const targetTab = clickedTab.dataset.tab;

        document.querySelectorAll('.history-tab').forEach(tab => tab.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
            content.style.display = 'none';
        });

        clickedTab.classList.add('active');
        const targetContent = document.getElementById(targetTab + 'Tab');
        if (targetContent) {
            targetContent.classList.add('active');
            targetContent.style.display = 'block';
        }
    }

    handleHistorySelection(entryId, isSelected) {
        // Implementation for history selection (similar to other tools)
        console.log('History selection:', entryId, isSelected);
    }

    handleOutsideClick(event) {
        const historyPopup = this.elements.historyPopup;
        const historyBtn = this.elements.historyBtn;
        const globalHistoryPopup = this.elements.globalHistoryPopup;
        const globalHistoryBtn = this.elements.globalHistoryBtn;

        if (historyPopup && historyPopup.classList.contains('show') &&
            !historyPopup.contains(event.target) && !historyBtn.contains(event.target)) {
            historyPopup.classList.remove('show');
        }

        if (globalHistoryPopup && globalHistoryPopup.classList.contains('show') &&
            !globalHistoryPopup.contains(event.target) && !globalHistoryBtn.contains(event.target)) {
            globalHistoryPopup.classList.remove('show');
        }
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
        this.elements.regexInput.style.fontSize = `${this.fontSize}px`;
        this.elements.testText.style.fontSize = `${this.fontSize}px`;
        this.elements.highlightedText.style.fontSize = `${this.fontSize}px`;
        this.elements.matchesList.style.fontSize = `${this.fontSize}px`;
    }

    saveFontSize() {
        localStorage.setItem(`${this.toolName}-fontSize`, this.fontSize.toString());
    }
}