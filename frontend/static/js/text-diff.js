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
            this.initializeSourceSelectors();
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
                collapseBtn: document.getElementById('collapseBtn'),
                prevDiffBtn: document.getElementById('prevDiffBtn'),
                nextDiffBtn: document.getElementById('nextDiffBtn'),
                diffCounter: document.getElementById('diffCounter'),
                inputSection1: document.getElementById('inputSection1'),
                inputSection2: document.getElementById('inputSection2'),
                
                // Summary Stats
                summaryStats: document.getElementById('summaryStats'),
                summaryEqual: document.getElementById('summaryEqual'),
                summaryAdded: document.getElementById('summaryAdded'),
                summaryDeleted: document.getElementById('summaryDeleted'),
                summaryModified: document.getElementById('summaryModified'),
                
                // File upload elements
                file1Input: document.getElementById('file1Input'),
                file2Input: document.getElementById('file2Input'),
                leftFilePath: document.getElementById('leftFilePath'),
                rightFilePath: document.getElementById('rightFilePath'),
                
                // Font controls
                fontIncreaseBtn: document.getElementById('fontIncreaseBtn'),
                fontDecreaseBtn: document.getElementById('fontDecreaseBtn'),
                
                // Source selector buttons
                loadSource1Btn: document.getElementById('loadSource1Btn'),
                loadSource2Btn: document.getElementById('loadSource2Btn')
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
            
            // New functionality
            this.elements.collapseBtn.addEventListener('click', () => this.toggleInputCollapse());
            this.elements.prevDiffBtn.addEventListener('click', () => this.navigateToPreviousDiff());
            this.elements.nextDiffBtn.addEventListener('click', () => this.navigateToNextDiff());
            
            // Font size controls
            this.elements.fontIncreaseBtn.addEventListener('click', () => this.increaseFontSize());
            this.elements.fontDecreaseBtn.addEventListener('click', () => this.decreaseFontSize());
            
            // File upload listeners
            this.elements.file1Input.addEventListener('change', (e) => this.handleFileUpload(e, 'text1'));
            this.elements.file2Input.addEventListener('change', (e) => this.handleFileUpload(e, 'text2'));
            
            // Source selector listeners
            this.elements.loadSource1Btn.addEventListener('click', () => this.showSourceSelector1());
            this.elements.loadSource2Btn.addEventListener('click', () => this.showSourceSelector2());
            
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
            // Update existing stats display
            this.elements.equalCount.textContent = stats.equal || 0;
            this.elements.addedCount.textContent = stats.additions || 0;
            this.elements.deletedCount.textContent = stats.deletions || 0;
            this.elements.modifiedCount.textContent = stats.modifications || 0;
            this.elements.diffStats.style.display = 'flex';
            
            // Update summary banner
            this.updateSummaryBanner(stats);
        }
        
        updateSummaryBanner(stats) {
            const equal = stats.equal || 0;
            const added = stats.additions || 0;
            const deleted = stats.deletions || 0;
            const modified = stats.modifications || 0;
            const total = equal + added + deleted + modified;
            
            // Update summary stats
            this.elements.summaryEqual.textContent = equal;
            this.elements.summaryAdded.textContent = added;
            this.elements.summaryDeleted.textContent = deleted;
            this.elements.summaryModified.textContent = modified;
            
            // Show the stats when there are results
            if (total > 0) {
                this.elements.summaryStats.style.display = 'flex';
            }
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
            this.elements.summaryStats.style.display = 'none';
            
            // Hide file path labels
            this.elements.leftFilePath.style.display = 'none';
            this.elements.rightFilePath.style.display = 'none';
            
            this.updateLineCount();
            this.updateStatus('Ready to compare texts');
        }

        swapTexts() {
            const temp = this.elements.text1.value;
            this.elements.text1.value = this.elements.text2.value;
            this.elements.text2.value = temp;
            
            // Also swap file path labels if they exist
            const leftPathLabel = this.elements.leftFilePath;
            const rightPathLabel = this.elements.rightFilePath;
            
            if (leftPathLabel && rightPathLabel) {
                const leftPath = leftPathLabel.textContent;
                const rightPath = rightPathLabel.textContent;
                leftPathLabel.textContent = rightPath;
                rightPathLabel.textContent = leftPath;
                
                // Swap display states
                const leftDisplay = leftPathLabel.style.display;
                const rightDisplay = rightPathLabel.style.display;
                leftPathLabel.style.display = rightDisplay;
                rightPathLabel.style.display = leftDisplay;
            }
            
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

        /**
         * Handle file upload and read content into text area
         */
        handleFileUpload(event, targetTextArea) {
            const file = event.target.files[0];
            if (!file) return;
            
            // Check file size (limit to 10MB)
            const maxSize = 10 * 1024 * 1024; // 10MB
            if (file.size > maxSize) {
                this.updateStatus('File too large. Please select a file under 10MB.');
                event.target.value = ''; // Clear the input
                return;
            }
            
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const content = e.target.result;
                    
                    // Check if content appears to be binary (contains null bytes or too many non-printable characters)
                    if (content.includes('\0') || this.isBinaryContent(content)) {
                        this.updateStatus(`Cannot read "${file.name}" - appears to be a binary file. Please select a text file.`);
                        event.target.value = '';
                        return;
                    }
                    
                    this.elements[targetTextArea].value = content;
                    this.updateLineCount();
                    this.updateStatus(`File "${file.name}" loaded successfully (${this.formatFileSize(file.size)})`);
                    
                    // Show file path label
                    const isLeftPanel = targetTextArea === 'text1';
                    const filePathElement = isLeftPanel ? this.elements.leftFilePath : this.elements.rightFilePath;
                    
                    // Use file.name as the path (browsers don't expose full path for security)
                    const truncatedPath = this.truncateFilePath(file.name);
                    filePathElement.textContent = truncatedPath;
                    filePathElement.style.display = 'inline';
                    
                    // Clear the file input to allow uploading the same file again
                    event.target.value = '';
                } catch (error) {
                    console.error('Error reading file:', error);
                    this.updateStatus(`Could not read "${file.name}" - file may be corrupted or in an unsupported format.`);
                    event.target.value = '';
                }
            };
            
            reader.onerror = () => {
                this.updateStatus(`Failed to read "${file.name}" - file may be corrupted or inaccessible.`);
                event.target.value = '';
            };
            
            // Read as text with UTF-8 encoding
            reader.readAsText(file, 'UTF-8');
        }
        
        /**
         * Check if content appears to be binary by analyzing character patterns
         */
        isBinaryContent(content) {
            if (!content || content.length === 0) return false;
            
            // Check first 8KB for binary patterns
            const sampleSize = Math.min(content.length, 8192);
            const sample = content.substring(0, sampleSize);
            
            let nonPrintableCount = 0;
            for (let i = 0; i < sample.length; i++) {
                const charCode = sample.charCodeAt(i);
                // Count non-printable characters (excluding common whitespace)
                if (charCode < 32 && charCode !== 9 && charCode !== 10 && charCode !== 13) {
                    nonPrintableCount++;
                }
            }
            
            // If more than 5% of characters are non-printable, likely binary
            return (nonPrintableCount / sample.length) > 0.05;
        }

        /**
         * Format file size for display
         */
        formatFileSize(bytes) {
            if (bytes === 0) return '0 Bytes';
            
            const k = 1024;
            const sizes = ['Bytes', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        }

        /**
         * Initialize source selectors for both text inputs
         */
        initializeSourceSelectors() {
            // Source selector for Text 1
            this.sourceSelector1 = new SourceSelector({
                containerId: 'textDiffSourceSelector1',
                onFetch: (data, source) => this.loadSourceData(data, source, 'text1'),
                onEdit: (source) => console.log('Source 1 edited:', source)
            });

            // Source selector for Text 2
            this.sourceSelector2 = new SourceSelector({
                containerId: 'textDiffSourceSelector2',
                onFetch: (data, source) => this.loadSourceData(data, source, 'text2'),
                onEdit: (source) => console.log('Source 2 edited:', source)
            });
        }

        /**
         * Show source selector for text input 1
         */
        showSourceSelector1() {
            this.sourceSelector1.show();
        }

        /**
         * Show source selector for text input 2
         */
        showSourceSelector2() {
            this.sourceSelector2.show();
        }

        /**
         * Load data from source into specified text input
         */
        loadSourceData(data, source, targetTextArea) {
            const textElement = this.elements[targetTextArea];
            if (textElement) {
                textElement.value = data;
                this.updateLineCount();
                
                // Show source path in file label
                const isText1 = targetTextArea === 'text1';
                const filePathElement = isText1 ? this.elements.leftFilePath : this.elements.rightFilePath;
                
                if (filePathElement) {
                    const sourcePath = this.resolveSourcePath(source);
                    filePathElement.textContent = this.truncateFilePath(sourcePath);
                    filePathElement.style.display = 'inline';
                }
            }
        }

        /**
         * Resolve source path with dynamic variables (same as JSON formatter)
         */
        resolveSourcePath(source) {
            let path = source.pathTemplate || source.path || '';
            
            if (source.dynamicVariables) {
                Object.entries(source.dynamicVariables).forEach(([key, value]) => {
                    const placeholder = `$${key}`;
                    path = path.replace(new RegExp('\\' + placeholder, 'g'), value || placeholder);
                });
            }
            
            return path;
        }

        /**
         * Truncate file path if longer than 20 characters
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


    }

    // Initialize the text diff tool
    window.textDiffTool = new TextDiffTool();
});