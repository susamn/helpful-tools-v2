/**
 * Standalone History Component JavaScript
 * Extracted from JSON formatter for reusability across all tools
 * Requires: common-functions.js to be loaded first for getToolColor()
 */

class HistoryManager {
    constructor(toolName, onDataLoad = null) {
        if (!toolName) {
            throw new Error('HistoryManager requires a toolName parameter');
        }
        
        this.toolName = toolName;
        this.onDataLoad = onDataLoad; // Callback function when user clicks on history item
        this.selectedHistoryItems = new Set();
        this.historyEnabled = localStorage.getItem(`${this.toolName}-historyEnabled`) !== 'false';
        
        this.initializeElements();
        this.attachEventListeners();
        this.initializeHistoryToggle();
    }

    /**
     * Initialize DOM elements with history-specific class names
     */
    initializeElements() {
        this.elements = {
            // Local history elements
            historyBtn: document.getElementById('historyBtn'),
            historyToggleBtn: document.getElementById('historyToggleBtn'),
            historyPopup: document.getElementById('historyPopup'),
            historyList: document.getElementById('historyList'),

            // Global history elements
            globalHistoryBtn: document.getElementById('globalHistoryBtn'),
            globalHistoryPopup: document.getElementById('globalHistoryPopup'),
            globalHistoryList: document.getElementById('globalHistoryList')
        };

        // Verify required elements exist
        const requiredElements = ['historyBtn', 'historyToggleBtn', 'historyPopup', 'historyList'];
        for (const elementKey of requiredElements) {
            if (!this.elements[elementKey]) {
                console.warn(`HistoryManager: Required element '${elementKey}' not found`);
            }
        }
    }

    /**
     * Attach event listeners for history functionality
     */
    attachEventListeners() {
        // Local history controls
        if (this.elements.historyBtn) {
            this.elements.historyBtn.addEventListener('click', () => this.toggleHistory());
        }
        
        if (this.elements.historyToggleBtn) {
            this.elements.historyToggleBtn.addEventListener('click', () => this.toggleHistoryEnabled());
        }

        // Global history controls
        if (this.elements.globalHistoryBtn) {
            this.elements.globalHistoryBtn.addEventListener('click', () => this.toggleGlobalHistory());
        }

        // Handle clicks outside popups to close them
        document.addEventListener('click', (e) => this.handleOutsideClick(e));

        // History tabs (if they exist)
        document.querySelectorAll('.hist-tab').forEach(tab => {
            tab.addEventListener('click', (e) => this.switchHistoryTab(e));
        });
    }

    /**
     * Add a new history entry
     * @param {string} data - The data to save
     * @param {string} operation - The operation performed (e.g., 'format', 'minify')
     */
    async addHistoryEntry(data, operation = 'process') {
        if (!this.historyEnabled) {
            return;
        }

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
     * Load and display local history
     */
    async loadHistory() {
        if (!this.elements.historyList) return;

        try {
            const response = await fetch(`/api/history/${this.toolName}?limit=20`);
            const result = await response.json();
            
            this.displayHistory(result.history || []);
        } catch (error) {
            console.error('Error loading history:', error);
            this.elements.historyList.innerHTML = '<div class="hist-item">Failed to load history</div>';
        }
    }

    /**
     * Display history items in the local history popup
     */
    displayHistory(history) {
        if (!this.elements.historyList) return;

        if (history.length === 0) {
            this.elements.historyList.innerHTML = '<div class="hist-item hist-empty">No history available</div>';
            return;
        }

        const historyHtml = history.map(item => `
            <div class="hist-item" data-id="${item.id}">
                <div class="hist-item-header">
                    <div class="hist-item-content">
                        <input type="checkbox" class="hist-checkbox" data-id="${item.id}" onclick="event.stopPropagation()">
                        <div class="hist-meta">
                            <span class="hist-id">ID: ${item.id}${item.starred ? ' ⭐' : ''}</span>
                            <span class="hist-date">${this.formatTimestamp(item.timestamp)} - ${item.operation}</span>
                        </div>
                    </div>
                    <div class="hist-actions">
                        <button class="hist-star-btn ${item.starred ? 'starred' : ''}"
                                onclick="window.historyManager.toggleStarHistoryItem('${item.id}', ${!item.starred}); event.stopPropagation();"
                                title="${item.starred ? 'Remove star' : 'Add star'}">
                            ${item.starred ? '⭐' : '☆'}
                        </button>
                        <button class="hist-delete-btn" onclick="window.historyManager.deleteHistoryItem('${item.id}'); event.stopPropagation();">×</button>
                    </div>
                </div>
                <div class="hist-preview">${item.preview}</div>
            </div>
        `).join('');

        this.elements.historyList.innerHTML = historyHtml;

        // Add click listeners to history items (excluding checkbox clicks)
        this.elements.historyList.querySelectorAll('.hist-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.type !== 'checkbox' && !e.target.classList.contains('hist-delete-btn')) {
                    this.loadHistoryEntry(item.dataset.id);
                }
            });
        });

        // Add checkbox event listeners
        this.elements.historyList.querySelectorAll('.hist-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                this.handleHistorySelection(e.target.dataset.id, e.target.checked);
            });
        });
    }

    /**
     * Load and display global history
     */
    async loadGlobalHistory() {
        if (!this.elements.globalHistoryList) return;

        try {
            const response = await fetch(`/api/global-history?limit=50`);
            const result = await response.json();
            
            this.displayGlobalHistory(result.history || []);
        } catch (error) {
            console.error('Error loading global history:', error);
            this.elements.globalHistoryList.innerHTML = '<div class="hist-global-item hist-error">Failed to load global history</div>';
        }
    }

    /**
     * Display global history items
     */
    displayGlobalHistory(history) {
        if (!this.elements.globalHistoryList) return;

        if (history.length === 0) {
            this.elements.globalHistoryList.innerHTML = '<div class="hist-global-item hist-empty">No global history available</div>';
            return;
        }

        const historyHtml = history.map(item => `
            <div class="hist-global-item" data-id="${item.id}" data-tool="${item.tool_name}">
                <div class="hist-global-item-header">
                    <input type="checkbox" class="hist-global-checkbox" data-id="${item.id}" onclick="event.stopPropagation()">
                    <div class="hist-global-item-meta">
                        <div class="hist-global-id-tool">
                            <span class="hist-id">ID: ${item.id}${item.starred ? ' ⭐' : ''}</span>
                            <span class="hist-global-tool-label" style="background-color: ${getToolColor(item.tool_name)}">${item.tool_name}</span>
                        </div>
                        <span class="hist-date">${this.formatTimestamp(item.timestamp)} - ${item.operation}</span>
                    </div>
                    <div class="hist-actions">
                        <button class="hist-star-btn ${item.starred ? 'starred' : ''}"
                                onclick="window.historyManager.toggleStarGlobalHistoryItem('${item.id}', ${!item.starred}); event.stopPropagation();"
                                title="${item.starred ? 'Remove star' : 'Add star'}">
                            ${item.starred ? '⭐' : '☆'}
                        </button>
                        <button class="hist-delete-btn" onclick="window.historyManager.deleteGlobalHistoryItem('${item.id}'); event.stopPropagation();">×</button>
                    </div>
                </div>
                <div class="hist-preview">${item.preview}</div>
            </div>
        `).join('');

        this.elements.globalHistoryList.innerHTML = historyHtml;

        // Add click listeners to global history items (allow cross-tool loading)
        this.elements.globalHistoryList.querySelectorAll('.hist-global-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.type !== 'checkbox' && !e.target.classList.contains('hist-delete-btn')) {
                    this.loadGlobalHistoryEntry(item.dataset.id, item.dataset.tool);
                }
            });
        });
    }

    /**
     * Load specific history entry and populate input
     */
    async loadHistoryEntry(entryId) {
        try {
            const response = await fetch(`/api/history/${this.toolName}/${entryId}`);
            const entry = await response.json();
            
            if (entry.data && this.onDataLoad) {
                this.onDataLoad(entry.data);
                this.toggleHistory(); // Close history popup
                this.showMessage('History entry loaded!', 'success');
            }
        } catch (error) {
            console.error('Error loading history entry:', error);
            this.showMessage('Failed to load history entry', 'error');
        }
    }

    /**
     * Load specific global history entry
     */
    async loadGlobalHistoryEntry(entryId, toolName) {
        try {
            const response = await fetch(`/api/global-history/${entryId}`);
            const entry = await response.json();
            
            if (entry.data && this.onDataLoad) {
                this.onDataLoad(entry.data);
                this.toggleGlobalHistory(); // Close popup
                
                if (toolName === this.toolName) {
                    this.showMessage('Global history entry loaded!', 'success');
                } else {
                    this.showMessage(`Loaded ${toolName} data into ${this.toolName}`, 'success');
                }
            }
        } catch (error) {
            console.error('Error loading global history entry:', error);
            this.showMessage('Failed to load global history entry', 'error');
        }
    }

    /**
     * Delete individual local history item
     */
    async deleteHistoryItem(entryId) {
        try {
            const response = await fetch(`/api/history/${this.toolName}/${entryId}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                this.showMessage('History item deleted', 'success');
                this.loadHistory(); // Refresh local history list
                this.loadGlobalHistory(); // Refresh global history list
            } else {
                const result = await response.json();
                this.showMessage(result.error || 'Failed to delete history item', 'error');
            }
        } catch (error) {
            console.error('Error deleting history item:', error);
            this.showMessage('Failed to delete history item', 'error');
        }
    }

    /**
     * Delete individual global history item
     */
    async deleteGlobalHistoryItem(entryId) {
        try {
            const response = await fetch(`/api/global-history/${entryId}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                this.showMessage('History item deleted', 'success');
                this.loadHistory(); // Refresh local history list
                this.loadGlobalHistory(); // Refresh global history list
            } else {
                const result = await response.json();
                this.showMessage(result.error || 'Failed to delete history item', 'error');
            }
        } catch (error) {
            console.error('Error deleting global history item:', error);
            this.showMessage('Failed to delete history item', 'error');
        }
    }

    /**
     * Toggle local history popup visibility
     */
    toggleHistory() {
        if (!this.elements.historyPopup) return;

        this.elements.historyPopup.classList.toggle('show');
        if (this.elements.historyPopup.classList.contains('show')) {
            this.loadHistory(); // Refresh when opening
        }
    }

    /**
     * Toggle global history popup visibility
     */
    toggleGlobalHistory() {
        if (!this.elements.globalHistoryPopup) return;

        if (this.elements.globalHistoryPopup.classList.contains('show')) {
            this.elements.globalHistoryPopup.classList.remove('show');
        } else {
            this.elements.globalHistoryPopup.classList.add('show');
            this.loadGlobalHistory(); // Refresh when opening
        }
    }

    /**
     * Toggle history enabled/disabled state
     */
    toggleHistoryEnabled() {
        this.historyEnabled = !this.historyEnabled;
        localStorage.setItem(`${this.toolName}-historyEnabled`, this.historyEnabled.toString());
        
        const btn = this.elements.historyToggleBtn;
        if (!btn) return;

        if (this.historyEnabled) {
            btn.textContent = '📝 History On';
            btn.classList.remove('disabled');
            btn.title = 'History Enabled - Click to Disable';
            this.showMessage('History enabled', 'success');
        } else {
            btn.textContent = '📝 History Off';
            btn.classList.add('disabled');
            btn.title = 'History Disabled - Click to Enable';
            this.showMessage('History disabled - operations will not be saved', 'warning');
        }
    }

    /**
     * Initialize history toggle button state
     */
    initializeHistoryToggle() {
        const btn = this.elements.historyToggleBtn;
        if (!btn) return;

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

    /**
     * Handle history item selection for bulk operations
     */
    handleHistorySelection(entryId, isSelected) {
        if (isSelected) {
            this.selectedHistoryItems.add(entryId);
        } else {
            this.selectedHistoryItems.delete(entryId);
        }
        
        this.updateHistorySelectionUI();
    }

    /**
     * Update UI based on history selections
     */
    updateHistorySelectionUI() {
        const selectedCount = this.selectedHistoryItems.size;
        
        // Add/update selection counter and action buttons if needed
        let selectionInfo = document.querySelector('.hist-selection-info');
        if (!selectionInfo && this.elements.historyPopup) {
            selectionInfo = document.createElement('div');
            selectionInfo.className = 'hist-selection-info';
            this.elements.historyPopup.insertBefore(selectionInfo, this.elements.historyPopup.firstChild);
        }
        
        if (selectionInfo) {
            if (selectedCount > 0) {
                selectionInfo.innerHTML = `
                    <span>${selectedCount} item${selectedCount > 1 ? 's' : ''} selected</span>
                    <button class="hist-clear-selection" onclick="window.historyManager.clearHistorySelection()">Clear</button>
                `;
                selectionInfo.style.display = 'flex';
            } else {
                selectionInfo.style.display = 'none';
            }
        }
    }

    /**
     * Clear history selection
     */
    clearHistorySelection() {
        this.selectedHistoryItems.clear();
        
        // Uncheck all checkboxes
        if (this.elements.historyList) {
            this.elements.historyList.querySelectorAll('.hist-checkbox').forEach(checkbox => {
                checkbox.checked = false;
            });
        }
        
        this.updateHistorySelectionUI();
    }

    /**
     * Handle clicks outside history popups to close them
     */
    handleOutsideClick(event) {
        // Close local history popup
        if (this.elements.historyPopup && this.elements.historyBtn &&
            !this.elements.historyPopup.contains(event.target) && 
            !this.elements.historyBtn.contains(event.target)) {
            this.elements.historyPopup.classList.remove('show');
        }
        
        // Close global history popup
        if (this.elements.globalHistoryPopup && this.elements.globalHistoryBtn &&
            !this.elements.globalHistoryPopup.contains(event.target) && 
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
        document.querySelectorAll('.hist-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        event.target.classList.add('active');

        // Update tab content
        const historyTab = document.getElementById('historyTab');
        const dataTab = document.getElementById('dataTab');

        if (historyTab && dataTab) {
            if (tabName === 'history') {
                historyTab.style.display = 'block';
                dataTab.style.display = 'none';
            } else if (tabName === 'data') {
                historyTab.style.display = 'none';
                dataTab.style.display = 'block';
                // Load data when tab is opened
                this.loadData();
            }
        }
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
     * Generate a preview of text with whitespace normalization and truncation
     */
    generatePreview(text, maxLength = 100) {
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
     * Show status message (uses common-functions.js if available, fallback otherwise)
     */
    showMessage(message, type = 'info') {
        // Try to use the common showStatusMessage function
        if (typeof showStatusMessage === 'function') {
            showStatusMessage(message, type, 3000);
        } else {
            // Fallback implementation
            console.log(`[${type.toUpperCase()}] ${message}`);
            
            // Simple toast implementation
            const toast = document.createElement('div');
            toast.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                padding: 12px 20px;
                background: ${type === 'success' ? '#4CAF50' : type === 'error' ? '#F44336' : '#2196F3'};
                color: white;
                border-radius: 4px;
                z-index: 10000;
                box-shadow: 0 2px 8px rgba(0,0,0,0.2);
            `;
            toast.textContent = message;
            document.body.appendChild(toast);
            
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 3000);
        }
    }

    /**
     * Check if history is enabled
     */
    isHistoryEnabled() {
        return this.historyEnabled;
    }

    /**
     * Get the tool name
     */
    getToolName() {
        return this.toolName;
    }

    /**
     * Toggle star status for local history item
     */
    async toggleStarHistoryItem(entryId, shouldStar) {
        try {
            const response = await fetch(`/api/history/${this.toolName}/${entryId}/star`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    starred: shouldStar
                })
            });

            if (response.ok) {
                this.showMessage(shouldStar ? 'Item starred' : 'Star removed', 'success');
                this.loadHistory(); // Refresh local history display
                this.loadGlobalHistory(); // Refresh global history display (if open)
            } else {
                this.showMessage('Failed to update star status', 'error');
            }
        } catch (error) {
            console.error('Error updating star status:', error);
            this.showMessage('Failed to update star status', 'error');
        }
    }

    /**
     * Toggle star status for global history item
     */
    async toggleStarGlobalHistoryItem(entryId, shouldStar) {
        try {
            const response = await fetch(`/api/global-history/${entryId}/star`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    starred: shouldStar
                })
            });

            if (response.ok) {
                this.showMessage(shouldStar ? 'Item starred' : 'Star removed', 'success');
                this.loadHistory(); // Refresh local history display
                this.loadGlobalHistory(); // Refresh global history display
            } else {
                this.showMessage('Failed to update star status', 'error');
            }
        } catch (error) {
            console.error('Error updating star status:', error);
            this.showMessage('Failed to update star status', 'error');
        }
    }

    /**
     * Clear all local history for this tool
     */
    async clearHistory() {
        try {
            const response = await fetch(`/api/history/${this.toolName}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                this.showMessage('History cleared successfully', 'success');
                this.loadHistory(); // Refresh display
            } else {
                this.showMessage('Failed to clear history', 'error');
            }
        } catch (error) {
            console.error('Error clearing history:', error);
            this.showMessage('Failed to clear history', 'error');
        }
    }

    // ========== Data Storage Methods ==========

    /**
     * Add a new data entry with description
     * @param {string} data - The data to save
     * @param {string} description - User-provided description
     */
    async addDataEntry(data, description) {
        try {
            const response = await fetch(`/api/data/${this.toolName}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    data: data,
                    description: description
                })
            });

            if (response.ok) {
                this.showMessage('Data saved successfully!', 'success');
                this.loadData(); // Refresh data display
                return true;
            } else {
                const error = await response.json();
                this.showMessage(error.error || 'Failed to save data', 'error');
                return false;
            }
        } catch (error) {
            console.error('Error saving data:', error);
            this.showMessage('Failed to save data', 'error');
            return false;
        }
    }

    /**
     * Load and display saved data entries
     */
    async loadData() {
        const dataList = document.getElementById('dataList');
        if (!dataList) return;

        try {
            const response = await fetch(`/api/data/${this.toolName}?limit=20`);
            const result = await response.json();

            this.displayData(result.data || []);
        } catch (error) {
            console.error('Error loading data:', error);
            dataList.innerHTML = '<div class="hist-item">Failed to load data</div>';
        }
    }

    /**
     * Display data items in the data tab
     */
    displayData(dataItems) {
        const dataList = document.getElementById('dataList');
        if (!dataList) return;

        if (dataItems.length === 0) {
            dataList.innerHTML = '<div class="hist-item hist-empty">No saved data available</div>';
            return;
        }

        const dataHtml = dataItems.map(item => `
            <div class="hist-item" data-id="${item.id}">
                <div class="hist-item-header">
                    <div class="hist-item-content">
                        <div class="hist-meta">
                            <span class="hist-id">ID: ${item.id}</span>
                            <span class="hist-date">${this.formatTimestamp(item.timestamp)}</span>
                        </div>
                        <div class="hist-description">${this.escapeHtml(item.description)}</div>
                    </div>
                    <div class="hist-actions">
                        <button class="hist-delete-btn" onclick="window.historyManager.deleteDataItem('${item.id}'); event.stopPropagation();">×</button>
                    </div>
                </div>
                <div class="hist-preview">${this.escapeHtml(item.preview)}</div>
            </div>
        `).join('');

        dataList.innerHTML = dataHtml;

        // Add click handlers for loading data
        dataList.querySelectorAll('.hist-item').forEach(item => {
            item.addEventListener('click', () => {
                this.loadDataEntry(item.dataset.id);
            });
        });
    }

    /**
     * Get a specific data entry (without loading into UI)
     * Used by compare() function
     */
    async getDataEntry(toolName, entryId) {
        const response = await fetch(`/api/data/${toolName}/${entryId}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch data entry: ${response.statusText}`);
        }
        return await response.json();
    }

    /**
     * Load a specific data entry
     */
    async loadDataEntry(entryId) {
        try {
            const response = await fetch(`/api/data/${this.toolName}/${entryId}`);
            const entry = await response.json();

            if (entry.data && this.onDataLoad) {
                this.onDataLoad(entry.data);
                this.showMessage('Data loaded!', 'success');
                // Close the popup
                if (this.elements.historyPopup) {
                    this.elements.historyPopup.classList.remove('show');
                }
            }
        } catch (error) {
            console.error('Error loading data entry:', error);
            this.showMessage('Failed to load data', 'error');
        }
    }

    /**
     * Delete a specific data entry
     */
    async deleteDataItem(entryId) {
        try {
            const response = await fetch(`/api/data/${this.toolName}/${entryId}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                this.showMessage('Data deleted', 'success');
                this.loadData(); // Refresh display
            } else {
                this.showMessage('Failed to delete data', 'error');
            }
        } catch (error) {
            console.error('Error deleting data:', error);
            this.showMessage('Failed to delete data', 'error');
        }
    }

    /**
     * Clear all saved data for this tool
     */
    async clearData() {
        try {
            const response = await fetch(`/api/data/${this.toolName}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                this.showMessage('All data cleared successfully', 'success');
                this.loadData(); // Refresh display
            } else {
                this.showMessage('Failed to clear data', 'error');
            }
        } catch (error) {
            console.error('Error clearing data:', error);
            this.showMessage('Failed to clear data', 'error');
        }
    }

    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Export for module environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = HistoryManager;
}

// Global function to create history manager instance
window.createHistoryManager = function(toolName, onDataLoadCallback) {
    return new HistoryManager(toolName, onDataLoadCallback);
};