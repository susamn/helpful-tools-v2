/**
 * Reusable SourceSelector Component
 * 
 * A modal-based source selector with Edit and Fetch functionality.
 * Supports dynamic variables editing and data fetching from various source types.
 */

class SourceSelector {
    constructor(options = {}) {
        this.options = {
            containerId: 'sourceSelector',
            onFetch: null, // Callback when data is fetched: (data, source) => {}
            onEdit: null, // Callback when source is edited: (source) => {}
            showEditButton: true,
            showFetchButton: true,
            allowMultiSelect: false,
            ...options
        };
        
        this.isVisible = false;
        this.sources = [];
        this.selectedSources = [];
        this.templateHTML = null;
        this.initialized = false;
        
        // Initialize asynchronously
        this.initializeComponent().then(() => {
            this.initialized = true;
        }).catch(error => {
            console.error('Failed to initialize SourceSelector:', error);
        });

        // Register this instance globally for inline form callbacks
        if (!window.sourceSelectors) {
            window.sourceSelectors = {};
        }
        window.sourceSelectors[this.options.containerId] = this;
    }

    /**
     * Initialize the source selector component
     */
    async initializeComponent() {
        await this.loadTemplate();
        this.createModalStructure();
        this.attachEventListeners();
        this.loadSources();
    }

    /**
     * Load the HTML template
     */
    async loadTemplate() {
        if (!this.templateHTML) {
            try {
                const response = await fetch('/components/source-selector.html');
                if (response.ok) {
                    this.templateHTML = await response.text();
                } else {
                    console.warn('Could not load source selector template, falling back to inline HTML');
                    this.templateHTML = this.getFallbackHTML();
                }
            } catch (error) {
                console.warn('Could not load source selector template, falling back to inline HTML:', error);
                this.templateHTML = this.getFallbackHTML();
            }
        }
    }

    /**
     * Create the modal structure
     */
    createModalStructure() {
        // Remove existing component if present
        const existing = document.getElementById(this.options.containerId);
        if (existing) {
            existing.remove();
        }

        // Create a temporary div to hold the template
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = this.templateHTML;

        // Update IDs to match the containerId option
        this.updateTemplateIds(tempDiv);

        // Add to body
        document.body.appendChild(tempDiv);
    }

    /**
     * Update template IDs to match the containerId option
     */
    updateTemplateIds(container) {
        // Update all IDs that contain "sourceSelector" to use the actual containerId
        const elements = container.querySelectorAll('[id*="sourceSelector"]');
        elements.forEach(element => {
            element.id = element.id.replace('sourceSelector', this.options.containerId);
        });
    }

    /**
     * Fallback HTML template if external file cannot be loaded
     */
    getFallbackHTML() {
        return `
            <div class="source-selector-overlay" id="${this.options.containerId}-overlay" style="display: none;"></div>
            <div class="source-selector-modal" id="${this.options.containerId}" style="display: none;">
                <div class="modal-header">
                    <h2>Select a Source</h2>
                    <button class="close-btn">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="sources-panel">
                        <div class="sources-search">
                            <input type="text" class="search-input" id="${this.options.containerId}-search" placeholder="🔍 Search sources..." autocomplete="off">
                        </div>
                        <div class="loading-state" id="${this.options.containerId}-loading" style="display: none;">Loading sources...</div>
                        <div class="empty-state" id="${this.options.containerId}-empty" style="display: none;">
                            No sources available. <a href="/sources" target="_blank">Create a source</a> to get started.
                        </div>
                        <div class="no-results-state" id="${this.options.containerId}-no-results" style="display: none;">
                            No sources match your search. Try different keywords.
                        </div>
                        <div class="sources-list" id="${this.options.containerId}-list"></div>
                    </div>
                    <div class="explorer-panel" id="${this.options.containerId}-explorer" style="display: none;">
                        <div class="panel-header">
                            <h3>Explorer</h3>
                            <button class="close-explorer" id="${this.options.containerId}-close-explorer">&times;</button>
                        </div>
                        <div class="explorer-content" id="${this.options.containerId}-explorer-content"></div>
                    </div>
                </div>
            </div>
            
            <!-- Dynamic Variables Edit Modal -->
            <div class="vars-overlay" id="${this.options.containerId}-vars-overlay" style="display: none;"></div>
            <div class="vars-modal" id="${this.options.containerId}-vars-modal" style="display: none;">
                <div class="modal-header">
                    <h2>Edit Dynamic Variables</h2>
                    <button class="close-btn">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="vars-form" id="${this.options.containerId}-vars-form"></div>
                    <div class="modal-actions">
                        <button class="btn btn-primary">Save</button>
                        <button class="btn btn-secondary">Cancel</button>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Attach event listeners
     */
    attachEventListeners() {
        const modal = document.getElementById(this.options.containerId);
        const overlay = document.getElementById(`${this.options.containerId}-overlay`);
        const closeBtn = modal.querySelector('.close-btn');
        
        const varsModal = document.getElementById(`${this.options.containerId}-vars-modal`);
        const varsOverlay = document.getElementById(`${this.options.containerId}-vars-overlay`);
        const varsCloseBtn = varsModal.querySelector('.close-btn');
        const varsSaveBtn = varsModal.querySelector('.btn-primary');
        const varsCancelBtn = varsModal.querySelector('.btn-secondary');

        // Close main modal
        [overlay, closeBtn].forEach(element => {
            element.addEventListener('click', () => this.hide());
        });

        // Close variables modal
        [varsOverlay, varsCloseBtn, varsCancelBtn].forEach(element => {
            element.addEventListener('click', () => this.hideVariablesModal());
        });

        // Save variables
        varsSaveBtn.addEventListener('click', () => this.saveVariables());
        
        // Close explorer panel
        const closeExplorerBtn = document.getElementById(`${this.options.containerId}-close-explorer`);
        if (closeExplorerBtn) {
            closeExplorerBtn.addEventListener('click', () => this.hideExplorerPanel());
        }

        // Search functionality
        const searchInput = document.getElementById(`${this.options.containerId}-search`);
        if (searchInput) {
            searchInput.addEventListener('input', (e) => this.filterSources(e.target.value));
        }
    }

    /**
     * Load sources from the API
     */
    async loadSources() {
        const loadingDiv = document.getElementById(`${this.options.containerId}-loading`);
        const emptyDiv = document.getElementById(`${this.options.containerId}-empty`);
        const noResultsDiv = document.getElementById(`${this.options.containerId}-no-results`);
        const listDiv = document.getElementById(`${this.options.containerId}-list`);

        try {
            loadingDiv.style.display = 'block';
            emptyDiv.style.display = 'none';
            noResultsDiv.style.display = 'none';
            listDiv.innerHTML = '';

            const response = await fetch('/api/sources');
            const result = await response.json();

            if (result.success && result.sources) {
                this.sources = Object.values(result.sources);
                this.allSources = [...this.sources]; // Store all sources for filtering
                this.renderSources();
            } else {
                throw new Error(result.error || 'Failed to load sources');
            }
        } catch (error) {
            console.error('Error loading sources:', error);
            emptyDiv.style.display = 'block';
        } finally {
            loadingDiv.style.display = 'none';
        }
    }

    /**
     * Render the sources list
     */
    renderSources() {
        const listDiv = document.getElementById(`${this.options.containerId}-list`);
        const emptyDiv = document.getElementById(`${this.options.containerId}-empty`);
        const noResultsDiv = document.getElementById(`${this.options.containerId}-no-results`);

        // Hide all state indicators first
        emptyDiv.style.display = 'none';
        noResultsDiv.style.display = 'none';

        if (this.sources.length === 0) {
            // Check if we have all sources but none match the filter
            if (this.allSources && this.allSources.length > 0) {
                noResultsDiv.style.display = 'block';
            } else {
                emptyDiv.style.display = 'block';
            }
            listDiv.innerHTML = '';
            return;
        }

        const sourcesHTML = this.sources.map(source => {
            const hasDynamicVars = source.dynamicVariables && Object.keys(source.dynamicVariables).length > 0;
            const resolvedPath = this.resolveSourcePath(source);
            const fileTypeIcon = source.is_directory ? '📁' : '📄';

            return `
                <div class="source-item" data-source-id="${source.id}">
                    <div class="source-header">
                        <div class="source-info">
                            <div class="source-name">${this.escapeHtml(source.name)}</div>
                            <div class="source-type">${this.escapeHtml(source.type.toUpperCase())}</div>
                            <div class="source-path">${this.escapeHtml(resolvedPath)}</div>
                        </div>
                        <div class="source-expiry-selector">
                            ${this.renderExpiryInfo(source.expiry)}
                            <div class="source-type-icon">${fileTypeIcon}</div>
                        </div>
                    </div>
                    <div class="source-actions">
                        <div class="source-buttons">
                            ${this.options.showEditButton && hasDynamicVars ? 
                                `<button class="source-btn source-btn-edit" data-action="edit" data-source-id="${source.id}">Edit</button>` : ''}
                            <button class="source-btn source-btn-test" data-action="test" data-source-id="${source.id}">Test</button>
                            ${this.options.showFetchButton ? 
                                `<button class="source-btn source-btn-fetch" data-action="fetch" data-source-id="${source.id}">Fetch</button>` : ''}
                        </div>
                        <div class="source-status">
                            <span class="test-status" id="test-status-${source.id}"></span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        listDiv.innerHTML = sourcesHTML;

        // Add click event listeners to action buttons
        listDiv.addEventListener('click', (e) => {
            if (e.target.classList.contains('source-btn')) {
                e.stopPropagation();
                const action = e.target.dataset.action;
                const sourceId = e.target.dataset.sourceId;
                const source = this.sources.find(s => s.id === sourceId);

                if (action === 'edit') {
                    this.showEditVariables(source);
                } else if (action === 'test') {
                    this.testSourceConnection(source);
                } else if (action === 'fetch') {
                    this.fetchSourceData(source);
                }
            }
        });
    }

    /**
     * Render expiry information for a source (same as sources app)
     */
    renderExpiryInfo(expiry) {
        if (!expiry) {
            return '<span class="expiry-status unknown">⏳ Checking expiry...</span>';
        }

        if (!expiry.supports_expiry) {
            return '<span class="expiry-status not-supported">🚫 Not supported</span>';
        }

        if (expiry.status === 'no_expiration') {
            return '<span class="expiry-status no-expiration">♾️ No expiration</span>';
        }

        if (expiry.status === 'expires' && expiry.expiry_timestamp) {
            const expiryTime = new Date(expiry.expiry_timestamp * 1000);
            const now = new Date();
            const timeDiff = expiryTime.getTime() - now.getTime();
            
            if (timeDiff <= 0) {
                return '<span class="expiry-status expired">⚠️ Expired</span>';
            }
            
            const countdown = this.formatCountdown(timeDiff);
            const statusClass = timeDiff < 24 * 60 * 60 * 1000 ? 'expiring-soon' : 'expires';
            
            return `<span class="expiry-status ${statusClass}" data-expiry-timestamp="${expiry.expiry_timestamp}">⏰ Expires in ${countdown}</span>`;
        }

        if (expiry.status === 'error') {
            return '<span class="expiry-status error">❌ Error checking expiry</span>';
        }

        return '<span class="expiry-status unknown">❓ Unknown status</span>';
    }

    /**
     * Format countdown time (same as sources app)
     */
    formatCountdown(milliseconds) {
        const days = Math.floor(milliseconds / (1000 * 60 * 60 * 24));
        const hours = Math.floor((milliseconds % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((milliseconds % (1000 * 60 * 60)) / (1000 * 60));

        if (days > 0) {
            return `${days}d ${hours}h`;
        } else if (hours > 0) {
            return `${hours}h ${minutes}m`;
        } else {
            return `${minutes}m`;
        }
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
     * Filter sources based on search query
     */
    filterSources(query) {
        if (!query || query.trim() === '') {
            // Show all sources if no search query
            this.sources = this.allSources ? [...this.allSources] : [];
        } else {
            const searchTerm = query.toLowerCase().trim();
            this.sources = (this.allSources || []).filter(source => {
                // Search in source name, type, and resolved path
                const name = source.name.toLowerCase();
                const type = source.type.toLowerCase();
                const path = this.resolveSourcePath(source).toLowerCase();
                
                return name.includes(searchTerm) || 
                       type.includes(searchTerm) || 
                       path.includes(searchTerm);
            });
        }
        
        this.renderSources();
    }

    /**
     * Show the variables editing form in the explorer panel
     */
    showEditVariables(source) {
        this.currentEditingSource = source;
        const explorerPanel = document.getElementById(`${this.options.containerId}-explorer`);
        const explorerContent = document.getElementById(`${this.options.containerId}-explorer-content`);
        
        if (!explorerPanel || !explorerContent) {
            console.error(`Explorer panel not found for ${this.options.containerId}`);
            return;
        }

        if (!source.dynamicVariables || Object.keys(source.dynamicVariables).length === 0) {
            alert('This source has no dynamic variables to edit.');
            return;
        }

        // Show explorer panel
        explorerPanel.style.display = 'flex';

        // Update panel header
        const panelHeader = explorerPanel.querySelector('.panel-header h3');
        if (panelHeader) {
            panelHeader.textContent = 'Dynamic Variables';
        }

        // Create variables edit form
        explorerContent.innerHTML = this.createVariablesEditForm(source);
    }

    /**
     * Create variables edit form HTML
     */
    createVariablesEditForm(source) {
        const formHTML = Object.entries(source.dynamicVariables).map(([key, value]) => `
            <div class="var-row">
                <label class="var-label">${this.escapeHtml(key)}:</label>
                <input type="text" class="var-input" data-var-key="${key}" value="${this.escapeHtml(value || '')}" placeholder="Enter value for ${key}">
            </div>
            <div class="var-description">Variable: $${key}</div>
        `).join('');

        return `
            <div class="variables-edit-card">
                <div class="variables-edit-header">
                    <span class="edit-icon">✏️</span>
                    <span class="edit-title">Edit Dynamic Variables</span>
                </div>
                <div class="variables-edit-details">
                    <strong>Source:</strong> ${this.escapeHtml(source.name)}<br>
                    <strong>Type:</strong> ${this.escapeHtml(source.type.toUpperCase())}<br>
                    <strong>Path:</strong> ${this.escapeHtml(this.resolveSourcePath(source))}
                </div>
                <div class="variables-form" id="${this.options.containerId}-inline-vars-form">
                    ${formHTML}
                </div>
                <div class="variables-actions">
                    <button class="var-btn var-btn-save" onclick="window.sourceSelectors?.['${this.options.containerId}']?.saveInlineVariables()">Save Changes</button>
                    <button class="var-btn var-btn-cancel" onclick="window.sourceSelectors?.['${this.options.containerId}']?.hideExplorerPanel()">Cancel</button>
                </div>
            </div>
        `;
    }

    /**
     * Hide the variables editing modal
     */
    hideVariablesModal() {
        const varsModal = document.getElementById(`${this.options.containerId}-vars-modal`);
        const varsOverlay = document.getElementById(`${this.options.containerId}-vars-overlay`);
        
        varsOverlay.style.display = 'none';
        varsModal.style.display = 'none';
        this.currentEditingSource = null;
    }

    /**
     * Save variables from the inline form
     */
    async saveInlineVariables() {
        if (!this.currentEditingSource) return;

        const varsForm = document.getElementById(`${this.options.containerId}-inline-vars-form`);
        if (!varsForm) return;
        
        const inputs = varsForm.querySelectorAll('.var-input');
        
        const updatedVars = {};
        inputs.forEach(input => {
            updatedVars[input.dataset.varKey] = input.value;
        });

        // Update the source object locally
        this.currentEditingSource.dynamicVariables = updatedVars;

        try {
            // Save to backend
            const response = await fetch(`/api/sources/${this.currentEditingSource.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name: this.currentEditingSource.name,
                    type: this.currentEditingSource.type,
                    staticConfig: this.currentEditingSource.staticConfig || {},
                    pathTemplate: this.currentEditingSource.pathTemplate || this.currentEditingSource.path || '',
                    dynamicVariables: updatedVars
                })
            });

            if (response.ok) {
                const result = await response.json();
                if (result.success) {
                    // Update the source in our local list
                    const sourceIndex = this.sources.findIndex(s => s.id === this.currentEditingSource.id);
                    if (sourceIndex !== -1) {
                        this.sources[sourceIndex].dynamicVariables = updatedVars;
                    }
                    
                    // Re-render sources to show updated path
                    this.renderSources();
                    
                    // Hide the explorer panel
                    this.hideExplorerPanel();
                    
                    console.log('Source saved successfully');
                } else {
                    throw new Error(result.error || 'Failed to save source');
                }
            } else {
                throw new Error(`HTTP ${response.status}`);
            }
        } catch (error) {
            console.error('Error saving source:', error);
            alert(`Error saving source: ${error.message}`);
            return;
        }

        // Trigger edit callback if provided
        if (this.options.onEdit) {
            this.options.onEdit(this.currentEditingSource);
        }
    }

    /**
     * Save variables (legacy modal method)
     */
    async saveVariables() {
        if (!this.currentEditingSource) return;

        const varsForm = document.getElementById(`${this.options.containerId}-vars-form`);
        const inputs = varsForm.querySelectorAll('.var-input');
        
        const updatedVars = {};
        inputs.forEach(input => {
            updatedVars[input.dataset.varKey] = input.value;
        });

        // Update the source object locally
        this.currentEditingSource.dynamicVariables = updatedVars;

        try {
            // Save to backend
            const response = await fetch(`/api/sources/${this.currentEditingSource.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name: this.currentEditingSource.name,
                    type: this.currentEditingSource.type,
                    staticConfig: this.currentEditingSource.staticConfig || {},
                    pathTemplate: this.currentEditingSource.pathTemplate || this.currentEditingSource.path || '',
                    dynamicVariables: updatedVars
                })
            });

            if (response.ok) {
                const result = await response.json();
                if (result.success) {
                    // Update the source in our local list
                    const sourceIndex = this.sources.findIndex(s => s.id === this.currentEditingSource.id);
                    if (sourceIndex !== -1) {
                        this.sources[sourceIndex].dynamicVariables = updatedVars;
                    }
                    
                    // Re-render sources to show updated path
                    this.renderSources();
                    
                    console.log('Source saved successfully');
                } else {
                    throw new Error(result.error || 'Failed to save source');
                }
            } else {
                throw new Error(`HTTP ${response.status}`);
            }
        } catch (error) {
            console.error('Error saving source:', error);
            alert(`Error saving source: ${error.message}`);
            return;
        }

        // Close variables modal
        this.hideVariablesModal();

        // Trigger edit callback if provided
        if (this.options.onEdit) {
            this.options.onEdit(this.currentEditingSource);
        }
    }

    /**
     * Test source connection
     */
    async testSourceConnection(source) {
        try {
            // Clear the explorer panel when starting a new test
            this.hideExplorerPanel();
            
            // Disable the test button during testing
            const testBtn = document.querySelector(`[data-action="test"][data-source-id="${source.id}"]`);
            if (testBtn) {
                testBtn.disabled = true;
            }

            const response = await fetch(`/api/sources/${source.id}/test`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                }
            });
            
            if (response.ok) {
                const result = await response.json();
                
                this.showTestStatus(source.id, result.success);
                
                // Show detailed test result in right panel
                if (!result.success) {
                    this.showTestError(source, result);
                } else {
                    // Show success message in the explorer panel
                    this.showTestSuccess(source, result);
                }
                
            } else {
                const errorResult = await response.json();
                const error = new Error(errorResult.error || `HTTP ${response.status}`);
                this.showTestError(source, { success: false, message: error.message, error: error.message });
                throw error;
            }
        } catch (error) {
            console.error('Error testing source:', error);
            this.showTestStatus(source.id, false);
            this.showTestError(source, { success: false, message: error.message, error: error.message });
        } finally {
            // Re-enable the test button
            const testBtn = document.querySelector(`[data-action="test"][data-source-id="${source.id}"]`);
            if (testBtn) {
                testBtn.disabled = false;
            }
        }
    }


    /**
     * Render file tree
     */
    renderFileTree(items, container, source, level) {
        if (!items || items.length === 0) {
            container.innerHTML = '<div style="padding: 20px; text-align: center; color: #666;">Empty directory</div>';
            return;
        }

        const html = items.map(item => {
            const isDirectory = item.is_directory;
            const icon = isDirectory ? '📁' : '📄';
            const levelClass = level > 0 ? `tree-level-${Math.min(level, 2)}` : '';
            const itemClass = isDirectory ? 'directory' : 'file';
            const nonExplorable = isDirectory && item.explorable === false;
            
            // Format file size
            const sizeText = !isDirectory && item.size !== null ? this.formatFileSize(item.size) : '';
            
            // Format last modified date - prioritize last_modified (ISO string) over modified (timestamp)
            let dateText = '';
            
            // Debug: log the raw date data
            if (item.last_modified || item.modified) {
                console.log('Date debug for', item.name, ':', { 
                    last_modified: item.last_modified, 
                    modified: item.modified,
                    type_last: typeof item.last_modified,
                    type_mod: typeof item.modified
                });
            }
            
            if (item.last_modified) {
                try {
                    const date = new Date(item.last_modified);
                    // Show full ISO format with date and time
                    dateText = date.toLocaleString('en-US', {
                        year: 'numeric',
                        month: '2-digit', 
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                    });
                } catch (e) {
                    console.warn('Invalid last_modified date:', item.last_modified);
                    // Fallback to raw value if parsing fails
                    dateText = item.last_modified;
                }
            } else if (item.modified) {
                try {
                    // Handle both timestamp and ISO string formats for backward compatibility
                    const date = new Date(typeof item.modified === 'number' ? item.modified * 1000 : item.modified);
                    dateText = date.toLocaleString('en-US', {
                        year: 'numeric',
                        month: '2-digit', 
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                    });
                } catch (e) {
                    console.warn('Invalid modified date:', item.modified);
                    // Fallback to raw value if parsing fails
                    dateText = String(item.modified);
                }
            }
            
            // Create metadata section
            let metadataHtml = '';
            if (sizeText || dateText || nonExplorable) {
                metadataHtml = `
                    <div class="tree-metadata">
                        ${sizeText ? `<div class="tree-size">${sizeText}</div>` : ''}
                        ${dateText ? `<div class="tree-date">${dateText}</div>` : ''}
                        ${nonExplorable ? '<div class="tree-date">(not explorable)</div>' : ''}
                    </div>
                `;
            }
            
            let itemHtml = `
                <div class="tree-item ${itemClass} ${levelClass} ${nonExplorable ? 'non-explorable' : ''}" 
                     data-path="${item.path}" 
                     data-is-directory="${isDirectory}"
                     data-source-id="${source.id}">
                    <span class="tree-icon">${icon}</span>
                    <span class="tree-name">${this.escapeHtml(item.name)}</span>
                    ${metadataHtml}
                </div>
            `;
            
            // Add children if present
            if (item.children && item.children.length > 0) {
                const childContainer = document.createElement('div');
                this.renderFileTree(item.children, childContainer, source, level + 1);
                itemHtml += childContainer.innerHTML;
            }
            
            return itemHtml;
        }).join('');
        
        container.innerHTML = html;
        
        // Add click handlers for files
        container.querySelectorAll('.tree-item.file').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                this.selectFile(item.dataset.path, source, item);
            });
        });
    }

    /**
     * Handle file selection
     */
    async selectFile(filePath, source, element) {
        try {
            // Remove previous selection
            const treeContainer = document.getElementById(`tree-${this.options.containerId}-${source.id}`);
            treeContainer.querySelectorAll('.tree-item.selected').forEach(el => {
                el.classList.remove('selected');
            });
            
            // Mark current item as selected
            element.classList.add('selected');
            
            // Fetch file content
            const response = await fetch(`/api/sources/${source.id}/file?path=${encodeURIComponent(filePath)}`);
            
            if (response.ok) {
                const data = await response.text();
                
                // Hide the modal
                this.hide();
                
                // Create modified source object with file path
                const fileSource = {
                    ...source,
                    selectedFile: filePath,
                    pathDisplay: `${source.name}/${filePath}`
                };
                
                // Trigger fetch callback
                if (this.options.onFetch) {
                    this.options.onFetch(data, fileSource);
                }
            } else {
                const error = await response.json();
                alert(`Error loading file: ${error.error}`);
            }
        } catch (error) {
            console.error('Error selecting file:', error);
            alert('Error loading file content');
        }
    }

    /**
     * Format file size for display
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    /**
     * Show test status with fade in/out animation
     */
    showTestStatus(sourceId, success) {
        const statusElement = document.getElementById(`test-status-${sourceId}`);
        if (!statusElement) return;

        // Clear any existing classes and content
        statusElement.className = 'test-status';
        statusElement.textContent = success ? 'OK' : 'FAIL';
        statusElement.classList.add(success ? 'success' : 'failure');
        
        // Fade in
        setTimeout(() => {
            statusElement.classList.add('show');
        }, 50);
        
        // Fade out after 3 seconds
        setTimeout(() => {
            statusElement.classList.remove('show');
            // Clear content after fade out completes
            setTimeout(() => {
                statusElement.textContent = '';
                statusElement.className = 'test-status';
            }, 300);
        }, 3000);
    }

    /**
     * Fetch data from source - auto-detects files vs directories
     */
    async fetchSourceData(source) {
        try {
            const fetchBtn = document.querySelector(`[data-action="fetch"][data-source-id="${source.id}"]`);
            if (fetchBtn) {
                fetchBtn.disabled = true;
                fetchBtn.textContent = 'Loading...';
            }

            const response = await fetch(`/api/sources/${source.id}/fetch`);
            
            if (response.ok) {
                const contentType = response.headers.get('content-type');
                
                if (contentType && contentType.includes('application/json')) {
                    // Directory response
                    const result = await response.json();
                    
                    if (result.type === 'directory') {
                        // Show directory browser in explorer panel
                        this.showExplorerPanel(source, result);
                    } else if (result.type === 'file') {
                        // Show file info in explorer panel
                        this.showFileInfo(source, result);
                    } else {
                        throw new Error('Unknown response type');
                    }
                } else {
                    // File content response
                    const data = await response.text();
                    this.hide();
                    
                    // Trigger fetch callback
                    if (this.options.onFetch) {
                        this.options.onFetch(data, source);
                    }
                }
            } else {
                const errorResult = await response.json();
                throw new Error(errorResult.error || `HTTP ${response.status}`);
            }
        } catch (error) {
            console.error('Error fetching source data:', error);
            alert(`Error fetching data: ${error.message}`);
        } finally {
            // Re-enable fetch button
            const fetchBtn = document.querySelector(`[data-action="fetch"][data-source-id="${source.id}"]`);
            if (fetchBtn) {
                fetchBtn.disabled = false;
                fetchBtn.textContent = 'Fetch';
            }
        }
    }

    /**
     * Show explorer panel with directory browser
     */
    showExplorerPanel(source, directoryData) {
        const explorerPanel = document.getElementById(`${this.options.containerId}-explorer`);
        const explorerContent = document.getElementById(`${this.options.containerId}-explorer-content`);
        
        if (!explorerPanel || !explorerContent) {
            console.error(`Explorer panel not found for ${this.options.containerId}`);
            return;
        }

        // Show explorer panel
        explorerPanel.style.display = 'flex';

        // Reset panel header
        const panelHeader = explorerPanel.querySelector('.panel-header h3');
        if (panelHeader) {
            panelHeader.textContent = 'File Explorer';
        }

        // Create file explorer card and render the tree
        explorerContent.innerHTML = this.createFileExplorerCard(source, directoryData);
        
        // Render the tree inside the card
        const treeContainer = explorerContent.querySelector('.file-tree-container');
        if (treeContainer) {
            this.renderFileTree(directoryData.tree, treeContainer, source, 0);
        }
    }

    /**
     * Create file explorer card HTML
     */
    createFileExplorerCard(source, directoryData) {
        const itemCount = directoryData.tree ? directoryData.tree.length : 0;
        const folderCount = directoryData.tree ? directoryData.tree.filter(item => item.is_directory).length : 0;
        const fileCount = itemCount - folderCount;

        return `
            <div class="file-explorer-card">
                <div class="file-explorer-header">
                    <span class="explorer-icon">📁</span>
                    <span class="explorer-title">Browse Files & Folders</span>
                </div>
                <div class="file-explorer-details">
                    <strong>Source:</strong> ${this.escapeHtml(source.name)}<br>
                    <strong>Type:</strong> ${this.escapeHtml(source.type.toUpperCase())}<br>
                    <strong>Path:</strong> ${this.escapeHtml(this.resolveSourcePath(source))}<br>
                    <strong>Items:</strong> ${itemCount} total (${folderCount} folders, ${fileCount} files)
                </div>
                <div class="file-explorer-content">
                    <div class="file-tree-header">
                        <span class="tree-icon">📂</span>
                        <span class="tree-name">Name</span>
                        <span class="tree-metadata">Size / Last Modified</span>
                    </div>
                    <div class="file-tree-container"></div>
                </div>
            </div>
        `;
    }

    /**
     * Show file info in explorer panel
     */
    showFileInfo(source, fileData) {
        const explorerPanel = document.getElementById(`${this.options.containerId}-explorer`);
        const explorerContent = document.getElementById(`${this.options.containerId}-explorer-content`);
        
        if (!explorerPanel || !explorerContent) {
            console.error(`Explorer panel not found for ${this.options.containerId}`);
            return;
        }

        // Show explorer panel
        explorerPanel.style.display = 'flex';

        // Reset panel header
        const panelHeader = explorerPanel.querySelector('.panel-header h3');
        if (panelHeader) {
            panelHeader.textContent = 'File Info';
        }

        // Clear previous content and render file info card
        explorerContent.innerHTML = this.createFileInfoDisplayCard(source, fileData);
    }

    /**
     * Create file info display card HTML (new style)
     */
    createFileInfoDisplayCard(source, fileData) {
        const fileName = fileData.name || source.name || 'Unknown file';
        const filePath = fileData.path || source.pathTemplate || 'Unknown path';
        const fileSize = fileData.size ? this.formatFileSize(fileData.size) : 'Unknown';
        const lastModified = fileData.last_modified || fileData.modified;
        const formattedDate = lastModified ? new Date(lastModified).toLocaleString() : 'Unknown';

        return `
            <div class="file-explorer-card">
                <div class="file-explorer-header">
                    <span class="explorer-icon">📄</span>
                    <span class="explorer-title">File Information</span>
                </div>
                <div class="file-explorer-details">
                    <strong>Source:</strong> ${this.escapeHtml(source.name)}<br>
                    <strong>Type:</strong> ${this.escapeHtml(source.type.toUpperCase())}<br>
                    <strong>Location:</strong> ${this.escapeHtml(this.resolveSourcePath(source))}
                </div>
                <div class="file-explorer-content">
                    <div class="file-detail-row">
                        <span class="file-detail-label">Filename:</span>
                        <span class="file-detail-value">${this.escapeHtml(fileName)}</span>
                    </div>
                    <div class="file-detail-row">
                        <span class="file-detail-label">Path:</span>
                        <span class="file-detail-value">${this.escapeHtml(filePath)}</span>
                    </div>
                    <div class="file-detail-row">
                        <span class="file-detail-label">Size:</span>
                        <span class="file-detail-value">${fileSize}</span>
                    </div>
                    <div class="file-detail-row">
                        <span class="file-detail-label">Modified:</span>
                        <span class="file-detail-value">${formattedDate}</span>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Create file info card HTML (legacy method for backward compatibility)
     */
    createFileInfoCard(source, fileData) {
        const fileName = fileData.name || source.name || 'Unknown file';
        const filePath = fileData.path || source.pathTemplate || 'Unknown path';
        const fileSize = fileData.size ? this.formatFileSize(fileData.size) : 'Unknown';
        const lastModified = fileData.last_modified || fileData.modified;
        const formattedDate = lastModified ? new Date(lastModified).toLocaleString() : 'Unknown';

        return `
            <div class="file-info-card">
                <div class="file-info-header">
                    <span class="file-icon">📄</span>
                    <span class="file-name">${this.escapeHtml(fileName)}</span>
                </div>
                <div class="file-details">
                    <div class="file-detail-row">
                        <span class="file-detail-label">Path:</span>
                        <span class="file-detail-value">${this.escapeHtml(filePath)}</span>
                    </div>
                    <div class="file-detail-row">
                        <span class="file-detail-label">Size:</span>
                        <span class="file-detail-value">${fileSize}</span>
                    </div>
                    <div class="file-detail-row">
                        <span class="file-detail-label">Modified:</span>
                        <span class="file-detail-value">${formattedDate}</span>
                    </div>
                    <div class="file-detail-row">
                        <span class="file-detail-label">Type:</span>
                        <span class="file-detail-value">${source.type || 'Unknown'}</span>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Hide the explorer panel
     */
    hideExplorerPanel() {
        const explorerPanel = document.getElementById(`${this.options.containerId}-explorer`);
        if (explorerPanel) {
            explorerPanel.style.display = 'none';
            
            // Reset panel header
            const panelHeader = explorerPanel.querySelector('.panel-header h3');
            if (panelHeader) {
                panelHeader.textContent = 'Explorer';
            }
        }
        
        // Clear current editing source
        this.currentEditingSource = null;
    }

    /**
     * Show test error in explorer panel
     */
    showTestError(source, testResult) {
        const explorerPanel = document.getElementById(`${this.options.containerId}-explorer`);
        const explorerContent = document.getElementById(`${this.options.containerId}-explorer-content`);
        
        if (!explorerPanel || !explorerContent) {
            console.error(`Explorer panel not found for ${this.options.containerId}`);
            return;
        }

        // Show explorer panel
        explorerPanel.style.display = 'flex';

        // Update panel header
        const panelHeader = explorerPanel.querySelector('.panel-header h3');
        if (panelHeader) {
            panelHeader.textContent = 'Test Result';
        }

        // Create error card
        const errorMessage = testResult.error || testResult.message || 'Unknown error occurred during testing';
        const statusText = testResult.status || 'error';
        const responseTime = testResult.response_time ? `${testResult.response_time.toFixed(2)}s` : 'N/A';

        explorerContent.innerHTML = `
            <div class="test-error-card">
                <div class="test-error-header">
                    <span class="test-error-icon">⚠️</span>
                    <span class="test-error-title">Connection Test Failed</span>
                </div>
                <div class="test-error-details">
                    <strong>Source:</strong> ${this.escapeHtml(source.name)}<br>
                    <strong>Type:</strong> ${this.escapeHtml(source.type.toUpperCase())}<br>
                    <strong>Path:</strong> ${this.escapeHtml(this.resolveSourcePath(source))}<br>
                    <strong>Status:</strong> ${this.escapeHtml(statusText)} (${responseTime})
                </div>
                <div class="test-error-message">${this.escapeHtml(errorMessage)}</div>
            </div>
        `;
    }

    /**
     * Show test success in explorer panel
     */
    showTestSuccess(source, testResult) {
        const explorerPanel = document.getElementById(`${this.options.containerId}-explorer`);
        const explorerContent = document.getElementById(`${this.options.containerId}-explorer-content`);
        
        if (!explorerPanel || !explorerContent) {
            console.error(`Explorer panel not found for ${this.options.containerId}`);
            return;
        }

        // Show explorer panel
        explorerPanel.style.display = 'flex';

        // Update panel header
        const panelHeader = explorerPanel.querySelector('.panel-header h3');
        if (panelHeader) {
            panelHeader.textContent = 'Test Result';
        }

        // Create success card
        const successMessage = testResult.message || 'Connection test passed successfully';
        const statusText = testResult.status || 'connected';
        const responseTime = testResult.response_time ? `${testResult.response_time.toFixed(2)}s` : 'N/A';

        explorerContent.innerHTML = `
            <div class="test-success-card">
                <div class="test-success-header">
                    <span class="test-success-icon">✅</span>
                    <span class="test-success-title">Connection Test Successful</span>
                </div>
                <div class="test-success-details">
                    <strong>Source:</strong> ${this.escapeHtml(source.name)}<br>
                    <strong>Type:</strong> ${this.escapeHtml(source.type.toUpperCase())}<br>
                    <strong>Path:</strong> ${this.escapeHtml(this.resolveSourcePath(source))}<br>
                    <strong>Status:</strong> ${this.escapeHtml(statusText)} (${responseTime})
                </div>
                <div class="test-success-message">${this.escapeHtml(successMessage)}</div>
            </div>
        `;
    }

    /**
     * Show the source selector
     */
    async show() {
        // Ensure component is initialized before showing
        if (!this.initialized) {
            await this.initializeComponent();
            this.initialized = true;
        }
        
        const modal = document.getElementById(this.options.containerId);
        const overlay = document.getElementById(`${this.options.containerId}-overlay`);
        
        overlay.style.display = 'block';
        modal.style.display = 'flex';
        this.isVisible = true;
        
        // Clear search when showing
        const searchInput = document.getElementById(`${this.options.containerId}-search`);
        if (searchInput) {
            searchInput.value = '';
        }
        
        // Reload sources when showing
        this.loadSources();
    }

    /**
     * Hide the source selector
     */
    hide() {
        const modal = document.getElementById(this.options.containerId);
        const overlay = document.getElementById(`${this.options.containerId}-overlay`);
        
        overlay.style.display = 'none';
        modal.style.display = 'none';
        this.isVisible = false;
    }

    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Destroy the component
     */
    destroy() {
        const modal = document.getElementById(this.options.containerId);
        const overlay = document.getElementById(`${this.options.containerId}-overlay`);
        const varsModal = document.getElementById(`${this.options.containerId}-vars-modal`);
        const varsOverlay = document.getElementById(`${this.options.containerId}-vars-overlay`);
        
        [modal, overlay, varsModal, varsOverlay].forEach(element => {
            if (element) element.remove();
        });
    }
}

// Make SourceSelector available globally
window.SourceSelector = SourceSelector;