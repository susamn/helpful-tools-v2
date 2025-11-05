/**
 * Scratchpad Tool - JavaScript Logic
 */

class ScratchpadTool {
    constructor() {
        // Initialize elements
        this.elements = {
            scratchpadInput: document.getElementById('scratchpadInput'),
            saveBtn: document.getElementById('saveBtn'),
            clearBtn: document.getElementById('clearBtn'),
            copyBtn: document.getElementById('copyBtn'),
            uploadFileBtn: document.getElementById('uploadFileBtn'),
            loadFromSourceBtn: document.getElementById('loadFromSourceBtn'),
            fileInput: document.getElementById('fileInput'),
            filePathLabel: document.getElementById('filePathLabel'),
            filePathTooltip: document.getElementById('filePathTooltip'),
            status: document.getElementById('status'),
            size: document.getElementById('size'),
            lines: document.getElementById('lines'),
            words: document.getElementById('words'),
            fontIncreaseBtn: document.getElementById('fontIncreaseBtn'),
            fontDecreaseBtn: document.getElementById('fontDecreaseBtn'),
            historyToggleBtn: document.getElementById('historyToggleBtn'),
            globalHistoryBtn: document.getElementById('globalHistoryBtn'),
            historyBtn: document.getElementById('historyBtn')
        };

        // State
        this.lastInputData = '';
        this.currentFilePath = null;
        this.historyEnabled = true;
        this.fontSize = 13; // Default font size

        // Initialize history manager
        this.historyManager = new HistoryManager('scratchpad');

        // Make history manager globally accessible for popup callbacks
        window.historyManager = this.historyManager;

        // Initialize source selector
        this.sourceSelector = null;
        this.initializeSourceSelector();

        // Attach event listeners
        this.attachEventListeners();

        // Update stats on page load
        this.updateStats();

        // Load last saved content if available
        this.loadLastContent();
    }

    /**
     * Initialize source selector
     */
    async initializeSourceSelector() {
        try {
            this.sourceSelector = await createSourceSelector({
                containerId: 'scratchpadSourceSelector',
                onFetch: (data, source) => this.loadSourceData(data, source),
                onEdit: (source) => this.onSourceEdit(source),
                showEditButton: true,
                showFetchButton: true
            });
        } catch (error) {
            console.error('Failed to initialize source selector:', error);
            // Fallback to old method if the new loader fails
            this.sourceSelector = new SourceSelector({
                containerId: 'scratchpadSourceSelector',
                onFetch: (data, source) => this.loadSourceData(data, source),
                onEdit: (source) => this.onSourceEdit(source),
                showEditButton: true,
                showFetchButton: true
            });
        }
    }

    /**
     * Attach event listeners
     */
    attachEventListeners() {
        // Input change
        this.elements.scratchpadInput.addEventListener('input', () => {
            this.updateStats();
            this.autoSave();
        });

        // Buttons
        this.elements.saveBtn.addEventListener('click', () => this.save());
        this.elements.clearBtn.addEventListener('click', () => this.clear());
        this.elements.copyBtn.addEventListener('click', () => this.copy());
        this.elements.loadFromSourceBtn.addEventListener('click', () => this.showSourceSelector());
        this.elements.fileInput.addEventListener('change', (e) => this.handleFileUpload(e));

        // Font size controls
        this.elements.fontIncreaseBtn.addEventListener('click', () => this.changeFontSize(1));
        this.elements.fontDecreaseBtn.addEventListener('click', () => this.changeFontSize(-1));

        // History toggle
        this.elements.historyToggleBtn.addEventListener('click', () => this.toggleHistory());

        // Global history button (handled by history manager)
        // No need to attach listener - history.js handles it

        // File path label hover
        if (this.elements.filePathLabel) {
            this.elements.filePathLabel.addEventListener('mouseenter', () => this.showFilePathTooltip());
            this.elements.filePathLabel.addEventListener('mouseleave', () => this.hideFilePathTooltip());
        }

        // History button setup (handled by history manager)
        this.historyManager.initHistoryUI(
            this.elements.historyBtn,
            (data) => this.loadFromHistory(data)
        );
    }

    /**
     * Update statistics
     */
    updateStats() {
        const content = this.elements.scratchpadInput.value;
        const chars = content.length;
        const lines = content.split('\n').length;
        const words = content.trim() ? content.trim().split(/\s+/).length : 0;

        this.elements.size.textContent = `${chars.toLocaleString()} chars`;
        this.elements.lines.textContent = lines;
        this.elements.words.textContent = words;
    }

    /**
     * Auto-save with debouncing
     */
    autoSave() {
        clearTimeout(this.autoSaveTimer);
        this.autoSaveTimer = setTimeout(() => {
            this.save(true); // Silent save
        }, 2000);
    }

    /**
     * Save content
     */
    async save(silent = false) {
        const content = this.elements.scratchpadInput.value;

        // Save to history
        if (this.historyEnabled && content !== this.lastInputData) {
            this.lastInputData = content;
            await this.historyManager.addHistoryEntry(content, 'save');
        }

        // Save to localStorage for quick restore
        localStorage.setItem('scratchpad_last_content', content);

        if (!silent) {
            this.showMessage('Content saved', 'success');
            this.elements.status.textContent = 'Saved';
            setTimeout(() => {
                this.elements.status.textContent = 'Ready';
            }, 2000);
        }
    }

    /**
     * Clear content
     */
    clear() {
        if (this.elements.scratchpadInput.value && !confirm('Clear all content?')) {
            return;
        }

        this.elements.scratchpadInput.value = '';
        this.currentFilePath = null;
        this.elements.filePathLabel.style.display = 'none';
        this.updateStats();
        this.showMessage('Content cleared', 'success');
    }

    /**
     * Copy to clipboard
     */
    async copy() {
        const content = this.elements.scratchpadInput.value;

        if (!content) {
            this.showMessage('Nothing to copy', 'warning');
            return;
        }

        try {
            await navigator.clipboard.writeText(content);
            this.showMessage('Copied to clipboard', 'success');
        } catch (error) {
            // Fallback method
            this.elements.scratchpadInput.select();
            document.execCommand('copy');
            this.showMessage('Copied to clipboard', 'success');
        }
    }

    /**
     * Handle file upload
     */
    async handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        try {
            const content = await file.text();
            this.elements.scratchpadInput.value = content;
            this.currentFilePath = file.name;
            this.elements.filePathLabel.textContent = file.name;
            this.elements.filePathLabel.style.display = 'inline-block';
            this.elements.filePathTooltip.textContent = file.name;
            this.updateStats();
            this.save();
            this.showMessage(`Loaded: ${file.name}`, 'success');
        } catch (error) {
            console.error('Error reading file:', error);
            this.showMessage('Error reading file', 'error');
        }

        // Clear file input
        event.target.value = '';
    }

    /**
     * Show source selector
     */
    async showSourceSelector() {
        if (!this.sourceSelector) {
            console.warn('Source selector not initialized yet, trying to initialize...');
            await this.initializeSourceSelector();
        }
        if (this.sourceSelector) {
            this.sourceSelector.show();
        } else {
            this.showMessage('Source selector not available', 'error');
        }
    }

    /**
     * Handle source data loading
     */
    loadSourceData(data, source) {
        try {
            // Set the data in the input area
            this.elements.scratchpadInput.value = data;

            // Show the source URL/path in the file path label
            let displayPath = '';
            if (source.pathDisplay) {
                displayPath = source.pathDisplay;
            } else if (source.selectedFile) {
                displayPath = `${source.name}/${source.selectedFile}`;
            } else if (source.path) {
                displayPath = source.path;
            } else {
                displayPath = source.name;
            }

            this.currentFilePath = displayPath;
            this.elements.filePathLabel.textContent = displayPath;
            this.elements.filePathLabel.style.display = 'inline-block';
            this.elements.filePathTooltip.textContent = displayPath;

            this.updateStats();
            this.save();
            this.showMessage(`Loaded from ${source.name}`, 'success');
        } catch (error) {
            console.error('Error loading source data:', error);
            this.showMessage('Error loading data', 'error');
        }
    }

    /**
     * Handle source edit
     */
    onSourceEdit(source) {
        console.log('Edit source:', source);
    }

    /**
     * Load from history
     */
    loadFromHistory(data) {
        this.elements.scratchpadInput.value = data;
        this.updateStats();
        this.showMessage('Loaded from history', 'success');
    }

    /**
     * Load last saved content
     */
    loadLastContent() {
        const lastContent = localStorage.getItem('scratchpad_last_content');
        if (lastContent) {
            this.elements.scratchpadInput.value = lastContent;
            this.lastInputData = lastContent;
            this.updateStats();
        }
    }

    /**
     * Change font size
     */
    changeFontSize(delta) {
        this.fontSize = Math.max(8, Math.min(24, this.fontSize + delta));
        this.elements.scratchpadInput.style.fontSize = this.fontSize + 'px';
        localStorage.setItem('scratchpad_font_size', this.fontSize);
    }

    /**
     * Toggle history
     */
    toggleHistory() {
        this.historyEnabled = !this.historyEnabled;

        if (this.historyEnabled) {
            this.elements.historyToggleBtn.textContent = '📝 History On';
            this.elements.historyToggleBtn.classList.remove('off');
            this.showMessage('History enabled', 'success');
        } else {
            this.elements.historyToggleBtn.textContent = '📝 History Off';
            this.elements.historyToggleBtn.classList.add('off');
            this.showMessage('History disabled', 'warning');
        }
    }


    /**
     * Show file path tooltip
     */
    showFilePathTooltip() {
        if (this.currentFilePath) {
            const label = this.elements.filePathLabel;
            const tooltip = this.elements.filePathTooltip;
            const rect = label.getBoundingClientRect();
            tooltip.style.top = (rect.bottom + 5) + 'px';
            tooltip.style.left = rect.left + 'px';
            tooltip.style.display = 'block';
        }
    }

    /**
     * Hide file path tooltip
     */
    hideFilePathTooltip() {
        this.elements.filePathTooltip.style.display = 'none';
    }

    /**
     * Show message
     */
    showMessage(message, type = 'info') {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}`;
        messageDiv.textContent = message;
        document.body.appendChild(messageDiv);

        setTimeout(() => {
            if (messageDiv.parentNode) {
                messageDiv.parentNode.removeChild(messageDiv);
            }
        }, 2000);
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    window.scratchpadTool = new ScratchpadTool();
});
