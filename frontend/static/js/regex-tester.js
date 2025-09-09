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
            performanceInfo: document.getElementById('performanceInfo'),
            explanationPopup: document.getElementById('explanationPopup'),
            explanationContent: document.getElementById('explanationContent'),
            explanationPattern: document.getElementById('explanationPattern'),
            explanationTiming: document.getElementById('explanationTiming'),
            detailsPopup: document.getElementById('detailsPopup'),
            detailsContent: document.getElementById('detailsContent'),
            detailsPattern: document.getElementById('detailsPattern'),
            detailsTiming: document.getElementById('detailsTiming'),
            popupOverlay: document.getElementById('popupOverlay'),
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
        document.getElementById('showExplanationBtn').onclick = () => this.showExplanationPopup();
        document.getElementById('explanationCloseBtn').onclick = () => this.hideExplanationPopup();
        document.getElementById('detailsCloseBtn').onclick = () => this.hideDetailsPopup();
        
        // Close popups when clicking outside (on overlay)
        this.els.popupOverlay.addEventListener('click', (e) => {
            this.hideExplanationPopup();
            this.hideDetailsPopup();
        });
        
        // Close popups with Escape key
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.hideExplanationPopup();
                this.hideDetailsPopup();
            }
        });

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

    async testRegex() {
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
            
            // Test with backend for performance metrics
            const response = await fetch('/api/regex/test', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({pattern, text, flags})
            });
            
            if (response.ok) {
                const result = await response.json();
                if (result.success) {
                    this.currentMatches = result.matches;
                    this.displayMatches(result.matches, text);
                    this.displayPerformanceMetrics(result.performance);
                    this.updateStatus(`Found ${result.matches.length} match${result.matches.length !== 1 ? 'es' : ''}`);
                } else {
                    this.showError(result.error);
                }
            } else {
                // Fallback to client-side testing
                const regex = new RegExp(pattern, flags);
                const matches = this.findMatches(regex, text);
                
                this.currentMatches = matches;
                this.displayMatches(matches, text);
                this.updateStatus(`Found ${matches.length} match${matches.length !== 1 ? 'es' : ''} (client-side)`);
            }
            
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
        if (!matches.length) {
            this.els.highlightedText.innerHTML = this.escapeHtml(text);
            return;
        }
    
        let html = '';
        let lastIndex = 0;
        let legend = new Set();
    
        matches.forEach((match, i) => {
            html += this.escapeHtml(text.slice(lastIndex, match.index));
            
            // Enhanced highlighting with nested groups
            const matchHtml = this.highlightMatchWithGroups(match, i);
            html += matchHtml.html;
            
            // Collect group info for legend
            if (match.groups && match.groups.length) {
                match.groups.forEach((group, groupIndex) => {
                    if (group !== undefined) {
                        legend.add(groupIndex + 1);
                    }
                });
            }
            legend.add(0); // Main match
            
            lastIndex = match.end || (match.index + match.text.length);
        });
    
        html += this.escapeHtml(text.slice(lastIndex));
        
        // Add group legend
        if (legend.size > 1) {
            html += this.generateGroupLegend(legend);
        }
        
        this.els.highlightedText.innerHTML = html;
    }
    
    highlightMatchWithGroups(match, matchIndex) {
        const text = match.text;
        let html = '';
        
        if (!match.groups || match.groups.length === 0) {
            // Simple match without groups
            html = `<span class="regex-match group-0" title="Match ${matchIndex + 1}: ${this.escapeHtml(text)}">${this.escapeHtml(text)}</span>`;
        } else {
            // Complex highlighting for matches with groups
            // For now, use the main match highlighting
            // TODO: Implement proper nested group highlighting
            html = `<span class="regex-match group-0" title="Match ${matchIndex + 1}: ${this.escapeHtml(text)} | Groups: ${match.groups.join(', ')}">${this.escapeHtml(text)}</span>`;
        }
        
        return { html };
    }
    
    generateGroupLegend(groups) {
        const colors = [
            { bg: '#ffeb3b', border: '#ff9800' },
            { bg: '#e1f5fe', border: '#0277bd' },
            { bg: '#f3e5f5', border: '#7b1fa2' },
            { bg: '#e8f5e8', border: '#2e7d32' },
            { bg: '#fff3e0', border: '#ef6c00' },
            { bg: '#fce4ec', border: '#c2185b' },
            { bg: '#f1f8e9', border: '#689f38' },
            { bg: '#e8eaf6', border: '#5e35b1' },
            { bg: '#fff8e1', border: '#fbc02d' },
            { bg: '#fafafa', border: '#616161' }
        ];
        
        let legendHtml = '<div class="group-legend"><strong>Groups:</strong> ';
        
        Array.from(groups).sort((a, b) => a - b).forEach(groupNum => {
            const color = colors[groupNum % colors.length];
            const label = groupNum === 0 ? 'Match' : `Group ${groupNum}`;
            legendHtml += `<span class="legend-item">`;
            legendHtml += `<span class="legend-color" style="background: ${color.bg}; border-color: ${color.border};"></span>`;
            legendHtml += `<span class="legend-text">${label}</span>`;
            legendHtml += `</span>`;
        });
        
        legendHtml += '</div>';
        return legendHtml;
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
        this.hideExplanationPopup();
        this.hideDetailsPopup();
        this.els.performanceInfo.style.display = 'none';
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
        this.showDetailsPopup();
    }
    
    showDetailsPopup() {
        if (this.currentMatches.length === 0) {
            alert('No matches to show details for');
            return;
        }
        
        const pattern = this.els.regexInput.value.trim();
        
        // Update popup info
        this.els.detailsPattern.textContent = pattern;
        this.els.detailsTiming.innerHTML = this.els.performanceInfo.innerHTML || 'No timing info';
        
        // Generate match details content
        this.displayMatchDetailsInPopup(this.currentMatches);
        
        this.els.popupOverlay.classList.add('show');
        this.els.detailsPopup.classList.add('show');
    }
    
    hideDetailsPopup() {
        this.els.detailsPopup.classList.remove('show');
        if (!this.els.explanationPopup.classList.contains('show')) {
            this.els.popupOverlay.classList.remove('show');
        }
    }
    
    displayMatchDetailsInPopup(matches) {
        const html = matches.map((match, i) => `
            <div class="match-item-popup">
                <div>
                    <span class="match-index">#${i + 1}</span>
                    <span class="match-text">${this.escapeHtml(match.text)}</span>
                    <span class="match-position">at position ${match.index}</span>
                </div>
                ${match.groups && match.groups.length ? this.formatGroupsForPopup(match.groups) : ''}
            </div>
        `).join('');

        this.els.detailsContent.innerHTML = html || '<div class="no-details">No matches to display</div>';
    }
    
    formatGroupsForPopup(groups) {
        const html = groups.map((group, i) => 
            group !== undefined ? 
            `<span class="group-match group-${i + 1}">$${i + 1}: "${this.escapeHtml(group)}"</span>` : ''
        ).filter(Boolean).join(' ');
        
        return html ? `<div class="group-matches"><strong>Groups:</strong> ${html}</div>` : '';
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
    
    displayPerformanceMetrics(performance) {
        if (performance) {
            const info = `⚡ ${performance.total_time_ms}ms | ${performance.steps} steps`;
            this.els.performanceInfo.textContent = info;
            this.els.performanceInfo.style.display = 'block';
        } else {
            this.els.performanceInfo.style.display = 'none';
        }
    }
    
    async showExplanationPopup() {
        const pattern = this.els.regexInput.value.trim();
        
        if (!pattern) {
            alert('Enter a regex pattern first');
            return;
        }
        
        // Update popup info
        this.els.explanationPattern.textContent = pattern;
        this.els.explanationTiming.innerHTML = this.els.performanceInfo.innerHTML || 'No timing info';
        
        // Show popup and start loading
        this.els.popupOverlay.classList.add('show');
        this.els.explanationPopup.classList.add('show');
        this.els.explanationContent.innerHTML = '<div class="explanation-loading">Analyzing pattern...</div>';
        
        try {
            const response = await fetch('/api/regex/explain', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({pattern})
            });
            
            if (response.ok) {
                const result = await response.json();
                if (result.success) {
                    this.displayExplanation(result.explanation);
                } else {
                    this.els.explanationContent.innerHTML = `<div class="explanation-loading">Error: ${result.error}</div>`;
                }
            } else {
                this.els.explanationContent.innerHTML = '<div class="explanation-loading">Failed to fetch explanation</div>';
            }
        } catch (error) {
            this.els.explanationContent.innerHTML = `<div class="explanation-loading">Error: ${error.message}</div>`;
        }
    }
    
    hideExplanationPopup() {
        this.els.explanationPopup.classList.remove('show');
        if (!this.els.detailsPopup.classList.contains('show')) {
            this.els.popupOverlay.classList.remove('show');
        }
    }
    
    displayExplanation(explanation) {
        let html = '';
        
        explanation.forEach(item => {
            html += '<div class="explanation-item">';
            html += `<span class="explanation-component">${this.escapeHtml(item.component)}</span>`;
            html += `<span class="explanation-description">${this.escapeHtml(item.description)}</span>`;
            html += '</div>';
        });
        
        this.els.explanationContent.innerHTML = html;
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