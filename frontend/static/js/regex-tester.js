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
        this.loadHistory();
        this.updateHistoryToggle();
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
            globalHistoryPopup: document.getElementById('globalHistoryPopup'),
            globalHistoryList: document.getElementById('globalHistoryList')
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

        // History
        document.getElementById('historyBtn').onclick = () => this.toggleHistory();
        document.getElementById('historyToggleBtn').onclick = () => this.toggleHistoryEnabled();
        document.getElementById('globalHistoryBtn').onclick = () => this.toggleGlobalHistory();

        // Font controls
        document.getElementById('fontIncreaseBtn').onclick = () => this.changeFontSize(1);
        document.getElementById('fontDecreaseBtn').onclick = () => this.changeFontSize(-1);

        // Outside clicks
        document.onclick = (e) => this.handleOutsideClick(e);
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
            this.saveToHistory(pattern, text, flags);
            
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

    // History functionality
    async saveToHistory(pattern, text, flags) {
        if (!this.historyEnabled) return;
        
        try {
            await fetch(`/api/history/${this.toolName}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    data: JSON.stringify({ pattern, testText: text, flags }),
                    operation: 'test'
                })
            });
        } catch (error) {
            console.error('History save failed:', error);
        }
    }

    async loadHistory() {
        try {
            const response = await fetch(`/api/history/${this.toolName}?limit=20`);
            const result = await response.json();
            this.displayHistory(result.history || []);
        } catch (error) {
            this.els.historyList.innerHTML = '<div class="history-item">Failed to load history</div>';
        }
    }

    displayHistory(history) {
        if (history.length === 0) {
            this.els.historyList.innerHTML = '<div class="history-item">No history available</div>';
            return;
        }

        this.els.historyList.innerHTML = history.map(entry => {
            const time = new Date(entry.timestamp).toLocaleString();
            return `
                <div class="history-item" onclick="regexTester.loadHistoryEntry('${entry.id}')">
                    <div class="history-item-header">
                        <span class="history-id">ID: ${entry.id}</span>
                        <button class="history-delete-btn" onclick="regexTester.deleteHistoryItem('${entry.id}'); event.stopPropagation();">×</button>
                    </div>
                    <div class="history-time">${time}</div>
                    <div class="history-preview">${entry.preview || 'No preview'}</div>
                </div>
            `;
        }).join('');
    }

    async loadHistoryEntry(entryId) {
        try {
            const response = await fetch(`/api/history/${this.toolName}/${entryId}`);
            const entry = await response.json();
            
            if (entry?.data) {
                const data = JSON.parse(entry.data);
                this.els.regexInput.value = data.pattern || '';
                this.els.testText.value = (data.testText || '').replace(/\\n/g, '\n');
                
                const flags = data.flags || '';
                this.els.flagGlobal.checked = flags.includes('g');
                this.els.flagIgnoreCase.checked = flags.includes('i');
                this.els.flagMultiline.checked = flags.includes('m');
                this.els.flagDotAll.checked = flags.includes('s');
                this.els.flagUnicode.checked = flags.includes('u');
                
                this.els.historyPopup.classList.remove('show');
                this.testRegex();
            }
        } catch (error) {
            this.updateStatus('Failed to load history entry');
        }
    }

    async deleteHistoryItem(entryId) {
        try {
            const response = await fetch(`/api/history/${this.toolName}/${entryId}`, { method: 'DELETE' });
            if (response.ok) {
                this.loadHistory();
                this.updateStatus('History item deleted');
            }
        } catch (error) {
            this.updateStatus('Failed to delete history item');
        }
    }

    toggleHistory() {
        this.els.historyPopup.classList.toggle('show');
        if (this.els.historyPopup.classList.contains('show')) {
            this.loadHistory();
        }
    }

    toggleHistoryEnabled() {
        this.historyEnabled = !this.historyEnabled;
        localStorage.setItem(`${this.toolName}-historyEnabled`, this.historyEnabled);
        this.updateHistoryToggle();
    }

    updateHistoryToggle() {
        const btn = document.getElementById('historyToggleBtn');
        btn.textContent = this.historyEnabled ? '📝 History On' : '📝 History Off';
        btn.classList.toggle('disabled', !this.historyEnabled);
    }

    async loadGlobalHistory() {
        try {
            const response = await fetch('/api/global-history?limit=50');
            const result = await response.json();
            this.displayGlobalHistory(result.history || []);
        } catch (error) {
            this.els.globalHistoryList.innerHTML = '<div class="global-history-item">Failed to load</div>';
        }
    }

    displayGlobalHistory(history) {
        this.els.globalHistoryList.innerHTML = history.length ? 
            history.map(entry => `
                <div class="global-history-item" onclick="regexTester.loadGlobalEntry('${entry.id}', '${entry.tool_name}')">
                    <span class="global-history-tool-label" style="background: ${getToolColor(entry.tool_name)}">${entry.tool_name}</span>
                    <div>${new Date(entry.timestamp).toLocaleString()}</div>
                    <div>${entry.operation}</div>
                </div>
            `).join('') :
            '<div class="global-history-item">No global history</div>';
    }

    async loadGlobalEntry(entryId, toolName) {
        if (toolName === this.toolName) {
            await this.loadHistoryEntry(entryId);
            this.els.globalHistoryPopup.classList.remove('show');
        }
    }

    toggleGlobalHistory() {
        this.els.globalHistoryPopup.classList.toggle('show');
        if (this.els.globalHistoryPopup.classList.contains('show')) {
            this.loadGlobalHistory();
        }
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

    handleOutsideClick(event) {
        const popups = [
            { popup: this.els.historyPopup, btn: document.getElementById('historyBtn') },
            { popup: this.els.globalHistoryPopup, btn: document.getElementById('globalHistoryBtn') }
        ];

        popups.forEach(({ popup, btn }) => {
            if (popup?.classList.contains('show') && 
                !popup.contains(event.target) && 
                !btn.contains(event.target)) {
                popup.classList.remove('show');
            }
        });
    }
}