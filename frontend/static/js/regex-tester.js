// Regex Tester Tool - Simplified Implementation
document.addEventListener('DOMContentLoaded', function() {
    window.regexTester = new RegexTester();
});

class RegexTester {
    constructor() {
        this.toolName = 'regex-tester';
        this.historyEnabled = localStorage.getItem(`${this.toolName}-historyEnabled`) !== 'false';
        this.fontSize = parseInt(localStorage.getItem(`${this.toolName}-fontSize`) || '13');
        this.currentMatches = [];
        this.testTimeout = null;
        
        this.initElements();
        this.attachEvents();
        this.initializeHistoryManager();
        this.applyFontSize();
    }

    initElements() {
        this.els = {
            regexInput: document.getElementById('regexInput'),
            testText: document.getElementById('testText'),
            flagGlobal: document.getElementById('flagGlobal'),
            flagIgnoreCase: document.getElementById('flagIgnoreCase'),
            flagMultiline: document.getElementById('flagMultiline'),
            flagDotAll: document.getElementById('flagDotAll'),
            flagUnicode: document.getElementById('flagUnicode'),
            highlightedText: document.getElementById('highlightedText'),
            matchCount: document.getElementById('matchCount'),
            matchesPanel: document.getElementById('matchesPanel'),
            matchesList: document.getElementById('matchesList'),
            regexError: document.getElementById('regexError'),
            statusText: document.getElementById('statusText'),
            historyPopup: document.getElementById('historyPopup'),
            historyList: document.getElementById('historyList'),
            globalHistoryPopup: document.getElementById('globalHistoryPopup')
        };
    }

    attachEvents() {
        // Core functionality
        document.getElementById('testBtn').onclick = () => this.testRegex();
        document.getElementById('clearBtn').onclick = () => this.clearAll();
        document.getElementById('sampleBtn').onclick = () => this.loadSample();
        document.getElementById('copyMatchesBtn').onclick = () => this.copyMatches();
        document.getElementById('toggleMatchesBtn').onclick = () => this.toggleDetails();

        // Auto-test on input
        this.els.regexInput.oninput = () => this.debounceTest();
        this.els.testText.oninput = () => this.debounceTest();
        [this.els.flagGlobal, this.els.flagIgnoreCase, this.els.flagMultiline, 
         this.els.flagDotAll, this.els.flagUnicode].forEach(flag => {
            flag.onchange = () => this.debounceTest();
        });

        // Examples
        document.querySelectorAll('.example-btn[data-pattern]').forEach(btn => {
            btn.onclick = (e) => this.loadExample(e.target);
        });

        // History is handled by HistoryManager class

        // Font controls
        document.getElementById('fontIncreaseBtn').onclick = () => this.changeFontSize(1);
        document.getElementById('fontDecreaseBtn').onclick = () => this.changeFontSize(-1);

        // Outside clicks handled by HistoryManager
    }

    /**
     * Initialize history manager
     */
    initializeHistoryManager() {
        // Create history manager with callback to load data into inputs
        this.historyManager = new HistoryManager(this.toolName, (data) => {
            try {
                const parsedData = JSON.parse(data);
                this.els.regexInput.value = parsedData.pattern || '';
                this.els.testText.value = parsedData.testText || '';
                
                // Set flags
                this.els.flagGlobal.checked = parsedData.flags?.includes('g') || false;
                this.els.flagIgnoreCase.checked = parsedData.flags?.includes('i') || false;
                this.els.flagMultiline.checked = parsedData.flags?.includes('m') || false;
                this.els.flagDotAll.checked = parsedData.flags?.includes('s') || false;
                this.els.flagUnicode.checked = parsedData.flags?.includes('u') || false;
                
                // Test the regex
                this.testRegex();
            } catch (error) {
                console.warn('Failed to load history entry:', error);
            }
        });
    }

    debounceTest() {
        clearTimeout(this.testTimeout);
        this.testTimeout = setTimeout(() => {
            if (this.els.regexInput.value && this.els.testText.value) {
                this.testRegex();
            }
        }, 300);
    }

    testRegex() {
        const pattern = this.els.regexInput.value.trim();
        const text = this.els.testText.value;
        
        this.clearError();
        
        if (!pattern) {
            this.showMessage('Enter a regex pattern');
            return;
        }
        
        if (!text) {
            this.showMessage('Enter test text');
            return;
        }

        try {
            const flags = this.getFlags();
            const regex = new RegExp(pattern, flags);
            const matches = this.findMatches(regex, text);
            
            this.currentMatches = matches;
            this.displayMatches(matches, text);
            this.updateStatus(`Found ${matches.length} match${matches.length !== 1 ? 'es' : ''}`);
            
            // Save to history using HistoryManager
            this.historyManager?.addHistoryEntry(JSON.stringify({
                pattern: pattern,
                testText: text,
                flags: flags
            }), 'test');
            
        } catch (error) {
            this.showError(error.message);
        }
    }

    findMatches(regex, text) {
        const matches = [];
        let match;
        
        if (regex.flags.includes('g')) {
            while ((match = regex.exec(text)) !== null) {
                matches.push({
                    text: match[0],
                    index: match.index,
                    groups: match.slice(1)
                });
                
                // Prevent infinite loop
                if (match.index === regex.lastIndex) {
                    regex.lastIndex++;
                }
            }
        } else {
            match = regex.exec(text);
            if (match) {
                matches.push({
                    text: match[0],
                    index: match.index,
                    groups: match.slice(1)
                });
            }
        }
        
        return matches;
    }

    displayMatches(matches, text) {
        // Update match count
        this.els.matchCount.textContent = matches.length ? 
            `${matches.length} MATCH${matches.length > 1 ? 'ES' : ''}` : 'NO MATCHES';
        this.els.matchCount.className = `match-indicator ${matches.length ? 'matches' : 'no-matches'}`;

        // Show highlighted text
        if (matches.length === 0) {
            this.els.highlightedText.innerHTML = '<div class="regex-no-match">No matches found</div>';
            this.els.matchesList.innerHTML = '<div class="match-item">No matches to display</div>';
            return;
        }

        this.highlightText(text, matches);
        this.showMatchDetails(matches);
    }

    highlightText(text, matches) {
        let html = '';
        let lastIndex = 0;

        matches.forEach((match, i) => {
            html += this.escapeHtml(text.slice(lastIndex, match.index));
            html += `<span class="regex-match" title="Match ${i + 1}: ${this.escapeHtml(match.text)}">${this.escapeHtml(match.text)}</span>`;
            lastIndex = match.index + match.text.length;
        });

        html += this.escapeHtml(text.slice(lastIndex));
        this.els.highlightedText.innerHTML = html;
    }

    showMatchDetails(matches) {
        const html = matches.map((match, i) => `
            <div class="match-item">
                <span class="match-index">#${i + 1}</span>
                <span class="match-text">${this.escapeHtml(match.text)}</span>
                <span class="match-position">at ${match.index}</span>
                ${match.groups.length ? this.formatGroups(match.groups) : ''}
            </div>
        `).join('');

        this.els.matchesList.innerHTML = html;
    }

    formatGroups(groups) {
        const html = groups.map((group, i) => 
            group !== undefined ? 
            `<span class="group-match">$${i + 1}: "${this.escapeHtml(group)}"</span>` : ''
        ).join('');
        
        return html ? `<div class="group-matches">${html}</div>` : '';
    }

    getFlags() {
        let flags = '';
        if (this.els.flagGlobal.checked) flags += 'g';
        if (this.els.flagIgnoreCase.checked) flags += 'i';
        if (this.els.flagMultiline.checked) flags += 'm';
        if (this.els.flagDotAll.checked) flags += 's';
        if (this.els.flagUnicode.checked) flags += 'u';
        return flags;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    clearAll() {
        this.els.regexInput.value = '';
        this.els.testText.value = '';
        this.els.highlightedText.innerHTML = '<div class="regex-no-match">Enter a regex pattern and test string</div>';
        this.els.matchesList.innerHTML = '';
        this.clearError();
        this.updateStatus('Ready');
        this.els.matchCount.textContent = 'NO MATCHES';
        this.els.matchCount.className = 'match-indicator no-matches';
    }

    loadSample() {
        this.els.regexInput.value = '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}';
        this.els.testText.value = 'Email: test@example.com\nAlso: user@domain.org\nInvalid: notanemail';
        this.els.flagGlobal.checked = true;
        this.testRegex();
    }

    loadExample(btn) {
        this.els.regexInput.value = btn.dataset.pattern;
        this.els.testText.value = btn.dataset.text.replace(/\\n/g, '\n');
        
        const flags = btn.dataset.flags || 'g';
        this.els.flagGlobal.checked = flags.includes('g');
        this.els.flagIgnoreCase.checked = flags.includes('i');
        this.els.flagMultiline.checked = flags.includes('m');
        this.els.flagDotAll.checked = flags.includes('s');
        this.els.flagUnicode.checked = flags.includes('u');
        
        this.testRegex();
    }

    async copyMatches() {
        if (this.currentMatches.length === 0) return;
        
        const text = this.currentMatches.map((match, i) => 
            `Match ${i + 1}: "${match.text}" at ${match.index}` +
            (match.groups.length ? `\n  Groups: ${match.groups.map((g, j) => `$${j + 1}: "${g}"`).join(', ')}` : '')
        ).join('\n');
        
        try {
            await navigator.clipboard.writeText(text);
            this.updateStatus('Matches copied to clipboard');
        } catch (err) {
            this.updateStatus('Failed to copy matches');
        }
    }

    toggleDetails() {
        const panel = this.els.matchesPanel;
        const btn = document.getElementById('toggleMatchesBtn');
        
        if (panel.classList.contains('show')) {
            panel.classList.remove('show');
            btn.textContent = 'Show Details';
        } else {
            panel.classList.add('show');
            btn.textContent = 'Hide Details';
        }
    }

    showError(message) {
        this.els.regexError.textContent = `Error: ${message}`;
        this.els.regexInput.classList.add('error');
        this.els.highlightedText.innerHTML = '<div class="regex-no-match">Invalid regex pattern</div>';
        this.updateStatus(`Error: ${message}`);
    }

    clearError() {
        this.els.regexError.textContent = '';
        this.els.regexInput.classList.remove('error');
    }

    showMessage(message) {
        this.els.highlightedText.innerHTML = `<div class="regex-no-match">${message}</div>`;
        this.updateStatus(message);
    }

    updateStatus(message) {
        this.els.statusText.textContent = message;
    }



    changeFontSize(delta) {
        this.fontSize = Math.max(8, Math.min(24, this.fontSize + delta));
        this.applyFontSize();
        localStorage.setItem(`${this.toolName}-fontSize`, this.fontSize);
    }

    applyFontSize() {
        const elements = [this.els.regexInput, this.els.testText, this.els.highlightedText, this.els.matchesList];
        elements.forEach(el => el.style.fontSize = `${this.fontSize}px`);
    }

}