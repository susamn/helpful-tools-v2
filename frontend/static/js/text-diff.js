/**
 * Text Diff Tool - JavaScript Logic
 * Features: Side-by-side text comparison with character-level diff highlighting
 */

// Initialize text diff tool when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    class TextDiffTool {
        constructor() {
            this.toolName = 'text-diff';
            this.historyEnabled = localStorage.getItem(`${this.toolName}-historyEnabled`) !== 'false';
            this.lastInputData = '';
            this.fontSize = parseInt(localStorage.getItem(`${this.toolName}-fontSize`) || '13');
            this.initializeElements();
            this.attachEventListeners();
            this.initializeHistoryManager();
            this.applyFontSize();
        }

        initializeElements() {
            this.elements = {
                text1: document.getElementById('text1'),
                text2: document.getElementById('text2'),
                leftDiff: document.getElementById('leftDiff'),
                rightDiff: document.getElementById('rightDiff'),
                statusText: document.getElementById('statusText'),
                diffStats: document.getElementById('diffStats'),
                leftStats: document.getElementById('leftStats'),
                rightStats: document.getElementById('rightStats'),
                equalCount: document.getElementById('equalCount'),
                addedCount: document.getElementById('addedCount'),
                deletedCount: document.getElementById('deletedCount'),
                modifiedCount: document.getElementById('modifiedCount'),
                
                // Buttons
                compareBtn: document.getElementById('compareBtn'),
                clearBtn: document.getElementById('clearBtn'),
                swapBtn: document.getElementById('swapBtn'),
                copyLeftBtn: document.getElementById('copyLeftBtn'),
                copyRightBtn: document.getElementById('copyRightBtn'),
                collapseBtn: document.getElementById('collapseBtn'),
                prevDiffBtn: document.getElementById('prevDiffBtn'),
                nextDiffBtn: document.getElementById('nextDiffBtn'),
                diffCounter: document.getElementById('diffCounter'),
                inputSection1: document.getElementById('inputSection1'),
                inputSection2: document.getElementById('inputSection2'),
                
                // Font controls
                fontIncreaseBtn: document.getElementById('fontIncreaseBtn'),
                fontDecreaseBtn: document.getElementById('fontDecreaseBtn')
            };
            
            this.inputsCollapsed = false;
            this.diffLines = [];
            this.currentDiffIndex = -1;
            this.diffCount = 0;
            this.syncingScroll = false;
            this.syncTimeout = null;
        }

        attachEventListeners() {
            // Main functionality
            this.elements.compareBtn.addEventListener('click', () => this.compareTexts());
            this.elements.clearBtn.addEventListener('click', () => this.clearAll());
            this.elements.swapBtn.addEventListener('click', () => this.swapTexts());
            this.elements.copyLeftBtn.addEventListener('click', () => this.copyToClipboard(this.elements.text1.value));
            this.elements.copyRightBtn.addEventListener('click', () => this.copyToClipboard(this.elements.text2.value));
            
            // New functionality
            this.elements.collapseBtn.addEventListener('click', () => this.toggleInputCollapse());
            this.elements.prevDiffBtn.addEventListener('click', () => this.navigateToPreviousDiff());
            this.elements.nextDiffBtn.addEventListener('click', () => this.navigateToNextDiff());
            
            // Font size controls
            this.elements.fontIncreaseBtn.addEventListener('click', () => this.increaseFontSize());
            this.elements.fontDecreaseBtn.addEventListener('click', () => this.decreaseFontSize());
            
            // Text input listeners
            this.elements.text1.addEventListener('input', () => this.updateLineCount());
            this.elements.text2.addEventListener('input', () => this.updateLineCount());
            
            // Synchronized scrolling between diff panels with passive listeners for better performance
            this.elements.leftDiff.addEventListener('scroll', (e) => this.syncScroll('left', e), { passive: true });
            this.elements.rightDiff.addEventListener('scroll', (e) => this.syncScroll('right', e), { passive: true });
            
            // Outside click handler
            document.addEventListener('click', (e) => this.handleOutsideClick(e));
            
            // Keyboard shortcuts
            document.addEventListener('keydown', (e) => this.handleKeydown(e));
        }

        /**
         * Initialize history manager
         */
        initializeHistoryManager() {
            // Create history manager with callback to load data into inputs
            this.historyManager = new HistoryManager(this.toolName, (data) => {
                try {
                    const parsedData = JSON.parse(data);
                    this.elements.text1.value = parsedData.text1 || '';
                    this.elements.text2.value = parsedData.text2 || '';
                    this.updateLineCount();
                } catch (error) {
                    // Fallback for single text data
                    this.elements.text1.value = data;
                    this.elements.text2.value = '';
                    this.updateLineCount();
                }
            });
            
            // Make it globally accessible for HTML onclick handlers
            window.historyManager = this.historyManager;
        }

        async compareTexts() {
            const text1 = this.elements.text1.value;
            const text2 = this.elements.text2.value;
            
            if (!text1 && !text2) {
                this.updateStatus('Please enter text in at least one field');
                return;
            }

            this.elements.leftDiff.innerHTML = '<div class="loading">Comparing texts...</div>';
            this.elements.rightDiff.innerHTML = '<div class="loading">Comparing texts...</div>';
            this.updateStatus('Comparing texts...');

            try {
                const response = await fetch('/api/text-diff/compare', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ text1, text2 })
                });

                const result = await response.json();

                if (result.success) {
                    this.displayDiff(result.diff, result.stats);
                    await this.saveToHistory(JSON.stringify({ text1, text2 }), 'compare');
                } else {
                    this.updateStatus('Error: ' + result.error);
                    this.elements.leftDiff.innerHTML = '<div class="loading">Error occurred</div>';
                    this.elements.rightDiff.innerHTML = '<div class="loading">Error occurred</div>';
                }
            } catch (error) {
                console.error('Error:', error);
                this.updateStatus('Network error occurred');
                this.elements.leftDiff.innerHTML = '<div class="loading">Network error</div>';
                this.elements.rightDiff.innerHTML = '<div class="loading">Network error</div>';
            }
        }

        /**
         * Save to history using history manager
         */
        async saveToHistory(data, operation) {
            if (this.historyManager) {
                await this.historyManager.addHistoryEntry(data, operation);
            }
        }

        displayDiff(diffData, stats) {
            this.elements.leftDiff.innerHTML = '';
            this.elements.rightDiff.innerHTML = '';
            this.diffLines = [];
            this.currentDiffIndex = -1;

            diffData.forEach((item, index) => {
                const leftLine = this.createDiffLine(item, 'left', index);
                const rightLine = this.createDiffLine(item, 'right', index);
                
                this.elements.leftDiff.appendChild(leftLine);
                this.elements.rightDiff.appendChild(rightLine);
                
                // Track diff lines for navigation
                if (item.type !== 'equal') {
                    this.diffLines.push({
                        index: index,
                        leftLine: leftLine,
                        rightLine: rightLine,
                        type: item.type
                    });
                }
            });

            this.diffCount = this.diffLines.length;
            this.updateNavigationState();
            
            // Jump to first diff if any exist
            if (this.diffCount > 0) {
                this.currentDiffIndex = 0;
                this.highlightCurrentDiff();
            }
            
            this.updateDiffStats(stats);
            this.updateStatus(`Comparison complete - ${diffData.length} lines compared, ${this.diffCount} differences found`);
        }

        createDiffLine(item, side, index) {
            const line = document.createElement('div');
            line.className = `diff-line ${item.type}`;
            line.dataset.diffIndex = index;
            
            const lineNumber = document.createElement('div');
            lineNumber.className = 'line-number';
            
            const content = document.createElement('div');
            content.className = 'line-content';
            
            if (item.type === 'equal') {
                const num = side === 'left' ? item.line_num_1 : item.line_num_2;
                lineNumber.textContent = num || '';
                content.textContent = item.content;
            } else if (item.type === 'delete') {
                if (side === 'left') {
                    lineNumber.textContent = item.line_num_1 || '';
                    content.textContent = item.content;
                } else {
                    lineNumber.textContent = '';
                    content.innerHTML = '<em>--- deleted ---</em>';
                    line.classList.add('empty');
                }
            } else if (item.type === 'insert') {
                if (side === 'left') {
                    lineNumber.textContent = '';
                    content.innerHTML = '<em>--- added ---</em>';
                    line.classList.add('empty');
                } else {
                    lineNumber.textContent = item.line_num_2 || '';
                    content.textContent = item.content;
                }
            } else if (item.type === 'modify') {
                const num = side === 'left' ? item.line_num_1 : item.line_num_2;
                const charDiff = item.char_diff_html;
                lineNumber.textContent = num || '';
                content.innerHTML = charDiff || (side === 'left' ? item.content_1 : item.content_2);
            }
            
            line.appendChild(lineNumber);
            line.appendChild(content);
            return line;
        }

        updateDiffStats(stats) {
            this.elements.equalCount.textContent = stats.equal || 0;
            this.elements.addedCount.textContent = stats.additions || 0;
            this.elements.deletedCount.textContent = stats.deletions || 0;
            this.elements.modifiedCount.textContent = stats.modifications || 0;
            this.elements.diffStats.style.display = 'flex';
        }

        updateLineCount() {
            const lines1 = this.elements.text1.value.split('\n').length;
            const lines2 = this.elements.text2.value.split('\n').length;
            this.elements.leftStats.textContent = `${lines1} lines`;
            this.elements.rightStats.textContent = `${lines2} lines`;
        }

        updateStatus(message) {
            this.elements.statusText.textContent = message;
        }

        clearAll() {
            this.elements.text1.value = '';
            this.elements.text2.value = '';
            this.elements.leftDiff.innerHTML = '<div class="loading">Enter text above and click Compare to see differences</div>';
            this.elements.rightDiff.innerHTML = '<div class="loading">Enter text above and click Compare to see differences</div>';
            this.elements.diffStats.style.display = 'none';
            this.updateLineCount();
            this.updateStatus('Ready to compare texts');
        }

        swapTexts() {
            const temp = this.elements.text1.value;
            this.elements.text1.value = this.elements.text2.value;
            this.elements.text2.value = temp;
            this.updateLineCount();
            this.updateStatus('Texts swapped');
        }

        async copyToClipboard(text) {
            try {
                await navigator.clipboard.writeText(text);
                this.updateStatus('Text copied to clipboard');
            } catch (err) {
                console.error('Failed to copy text: ', err);
                this.updateStatus('Failed to copy text');
            }
        }

        handleOutsideClick(event) {
            // History manager handles its own outside click logic
        }
        
        // New functionality methods
        toggleInputCollapse() {
            this.inputsCollapsed = !this.inputsCollapsed;
            
            if (this.inputsCollapsed) {
                this.elements.inputSection1.classList.add('collapsed');
                this.elements.inputSection2.classList.add('collapsed');
                this.elements.collapseBtn.innerHTML = '▼ Expand Inputs';
                this.elements.collapseBtn.title = 'Show input boxes';
            } else {
                this.elements.inputSection1.classList.remove('collapsed');
                this.elements.inputSection2.classList.remove('collapsed');
                this.elements.collapseBtn.innerHTML = '▲ Collapse Inputs';
                this.elements.collapseBtn.title = 'Hide input boxes';
            }
        }
        
        navigateToPreviousDiff() {
            if (this.diffLines.length === 0) return;
            
            if (this.currentDiffIndex > 0) {
                this.currentDiffIndex--;
            } else {
                this.currentDiffIndex = this.diffLines.length - 1; // Wrap to last
            }
            
            this.highlightCurrentDiff();
            this.updateNavigationState();
        }
        
        navigateToNextDiff() {
            if (this.diffLines.length === 0) return;
            
            if (this.currentDiffIndex < this.diffLines.length - 1) {
                this.currentDiffIndex++;
            } else {
                this.currentDiffIndex = 0; // Wrap to first
            }
            
            this.highlightCurrentDiff();
            this.updateNavigationState();
        }
        
        highlightCurrentDiff() {
            // Remove previous highlight
            document.querySelectorAll('.diff-line.current-diff').forEach(line => {
                line.classList.remove('current-diff');
            });
            
            if (this.currentDiffIndex >= 0 && this.currentDiffIndex < this.diffLines.length) {
                const currentDiff = this.diffLines[this.currentDiffIndex];
                currentDiff.leftLine.classList.add('current-diff');
                currentDiff.rightLine.classList.add('current-diff');
                
                // Scroll to show the highlighted difference
                this.scrollToLine(currentDiff.leftLine);
            }
        }
        
        scrollToLine(line) {
            const leftContainer = this.elements.leftDiff;
            const rightContainer = this.elements.rightDiff;
            
            // Calculate the position within the container
            const lineTop = line.offsetTop;
            const containerHeight = leftContainer.clientHeight;
            
            // Center the line in the view
            const scrollTop = lineTop - (containerHeight / 2) + (line.offsetHeight / 2);
            const targetScrollTop = Math.max(0, scrollTop);
            
            // Cancel any pending sync operations
            if (this.syncTimeout) {
                clearTimeout(this.syncTimeout);
            }
            
            // Disable sync temporarily to avoid infinite loop
            this.syncingScroll = true;
            
            // Scroll both containers simultaneously
            leftContainer.scrollTo({
                top: targetScrollTop,
                behavior: 'smooth'
            });
            
            rightContainer.scrollTo({
                top: targetScrollTop,
                behavior: 'smooth'
            });
            
            // Re-enable sync after animation
            this.syncTimeout = setTimeout(() => {
                this.syncingScroll = false;
            }, 500);
        }
        
        syncScroll(source, event) {
            if (this.syncingScroll) return;
            
            const sourceContainer = event.target;
            const targetContainer = source === 'left' ? this.elements.rightDiff : this.elements.leftDiff;
            
            // Cancel any pending sync operations
            if (this.syncTimeout) {
                clearTimeout(this.syncTimeout);
            }
            
            // Set sync flag to prevent infinite loop
            this.syncingScroll = true;
            
            // Sync immediately without animation for smooth scrolling
            targetContainer.scrollTop = sourceContainer.scrollTop;
            
            // Reset sync flag after a minimal delay
            this.syncTimeout = setTimeout(() => {
                this.syncingScroll = false;
            }, 10);
        }
        
        updateNavigationState() {
            const prevBtn = this.elements.prevDiffBtn;
            const nextBtn = this.elements.nextDiffBtn;
            const counter = this.elements.diffCounter;
            
            if (this.diffCount === 0) {
                prevBtn.disabled = true;
                nextBtn.disabled = true;
                counter.textContent = '0/0';
            } else {
                prevBtn.disabled = false;
                nextBtn.disabled = false;
                counter.textContent = `${this.currentDiffIndex + 1}/${this.diffCount}`;
            }
        }
        
        handleKeydown(e) {
            // Only handle navigation when not typing in text areas
            if (document.activeElement === this.elements.text1 || 
                document.activeElement === this.elements.text2) {
                return;
            }
            
            switch(e.key) {
                case 'ArrowUp':
                    e.preventDefault();
                    this.navigateToPreviousDiff();
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    this.navigateToNextDiff();
                    break;
                case 'c':
                case 'C':
                    if (e.ctrlKey || e.metaKey) return; // Don't interfere with copy
                    e.preventDefault();
                    this.toggleInputCollapse();
                    break;
                case 'Enter':
                    if (e.ctrlKey) {
                        e.preventDefault();
                        this.compareTexts();
                    }
                    break;
                case 'h':
                    e.preventDefault();
                    if (this.historyManager) {
                        this.historyManager.toggleHistory();
                    }
                    break;
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
            this.elements.text1.style.fontSize = `${this.fontSize}px`;
            this.elements.text2.style.fontSize = `${this.fontSize}px`;
            this.elements.leftDiff.style.fontSize = `${this.fontSize}px`;
            this.elements.rightDiff.style.fontSize = `${this.fontSize}px`;
        }
        
        saveFontSize() {
            localStorage.setItem(`${this.toolName}-fontSize`, this.fontSize.toString());
        }
    }

    // Initialize the text diff tool
    window.textDiffTool = new TextDiffTool();
});