/**
 * Reusable SourceSelector Component
 *
 * A modal-based source selector with Edit and Fetch functionality.
 * Supports dynamic variables editing and data fetching from various source types.
 */

/**
 * Explorer state for a specific source
 */
class ExplorerState {
    constructor(sourceId) {
        this.sourceId = sourceId;
        this.expandedPaths = new Set(); // Set of expanded folder paths
        this.loadedData = new Map(); // path -> {data, timestamp, page}
        this.scrollPosition = 0;
        this.selectedFile = null;
        this.lastAccessed = Date.now();
        this.currentPage = 1;
        this.totalPages = 1;
        this.hasMoreData = false;
    }

    addExpandedPath(path) {
        this.expandedPaths.add(path);
        this.lastAccessed = Date.now();
    }

    removeExpandedPath(path) {
        this.expandedPaths.delete(path);
        this.lastAccessed = Date.now();
    }

    isExpanded(path) {
        return this.expandedPaths.has(path);
    }

    setLoadedData(path, data, page = 1) {
        this.loadedData.set(path, {
            data: data,
            timestamp: Date.now(),
            page: page
        });
        this.lastAccessed = Date.now();
    }

    getLoadedData(path) {
        const cached = this.loadedData.get(path);
        if (cached && Date.now() - cached.timestamp < 300000) { // 5 minute cache
            return cached;
        }
        return null;
    }

    toJSON() {
        return {
            sourceId: this.sourceId,
            expandedPaths: Array.from(this.expandedPaths),
            scrollPosition: this.scrollPosition,
            selectedFile: this.selectedFile,
            lastAccessed: this.lastAccessed,
            currentPage: this.currentPage,
            totalPages: this.totalPages,
            hasMoreData: this.hasMoreData
        };
    }

    static fromJSON(data) {
        const state = new ExplorerState(data.sourceId);
        state.expandedPaths = new Set(data.expandedPaths || []);
        state.scrollPosition = data.scrollPosition || 0;
        state.selectedFile = data.selectedFile || null;
        state.lastAccessed = data.lastAccessed || Date.now();
        state.currentPage = data.currentPage || 1;
        state.totalPages = data.totalPages || 1;
        state.hasMoreData = data.hasMoreData || false;
        return state;
    }
}

/**
 * Source selector state manager
 */
class SourceSelectorState {
    constructor(containerId) {
        this.containerId = containerId;
        this.explorerStates = new Map(); // sourceId -> ExplorerState
        this.currentExplorerSourceId = null;
    }

    getExplorerState(sourceId) {
        if (!this.explorerStates.has(sourceId)) {
            this.explorerStates.set(sourceId, new ExplorerState(sourceId));
        }
        return this.explorerStates.get(sourceId);
    }

    setCurrentExplorerSource(sourceId) {
        this.currentExplorerSourceId = sourceId;
    }

    getCurrentExplorerState() {
        if (this.currentExplorerSourceId) {
            return this.getExplorerState(this.currentExplorerSourceId);
        }
        return null;
    }

    clearExplorerState(sourceId) {
        this.explorerStates.delete(sourceId);
    }

    clearAllStates() {
        this.explorerStates.clear();
        this.currentExplorerSourceId = null;
    }

    toJSON() {
        const statesObj = {};
        for (const [sourceId, state] of this.explorerStates) {
            statesObj[sourceId] = state.toJSON();
        }

        return {
            containerId: this.containerId,
            explorerStates: statesObj,
            currentExplorerSourceId: this.currentExplorerSourceId
        };
    }

    static fromJSON(data) {
        const state = new SourceSelectorState(data.containerId);
        state.currentExplorerSourceId = data.currentExplorerSourceId;

        if (data.explorerStates) {
            for (const [sourceId, stateData] of Object.entries(data.explorerStates)) {
                state.explorerStates.set(sourceId, ExplorerState.fromJSON(stateData));
            }
        }

        return state;
    }
}

/**
 * Persistent cache using localStorage
 */
class PersistentCache {
    constructor(containerId) {
        this.containerId = containerId;
        this.storageKey = `sourceSelector_${containerId}_state`;
        this.maxAge = 24 * 60 * 60 * 1000; // 24 hours
    }

    saveState(state) {
        try {
            const stateData = {
                ...state.toJSON(),
                timestamp: Date.now()
            };

            localStorage.setItem(this.storageKey, JSON.stringify(stateData));
        } catch (error) {
            console.warn('Failed to save state to localStorage:', error);
        }
    }

    loadState() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            if (!stored) return null;

            const stateData = JSON.parse(stored);

            // Check if data is not too old
            if (Date.now() - stateData.timestamp > this.maxAge) {
                this.clearState();
                return null;
            }

            // Remove timestamp before reconstructing state
            delete stateData.timestamp;
            return SourceSelectorState.fromJSON(stateData);
        } catch (error) {
            console.warn('Failed to load state from localStorage:', error);
            return null;
        }
    }

    clearState() {
        try {
            localStorage.removeItem(this.storageKey);
        } catch (error) {
            console.warn('Failed to clear state from localStorage:', error);
        }
    }

    // Cache folder contents temporarily
    cacheFolderData(sourceId, path, data, pagination) {
        try {
            const cacheKey = `folder_${sourceId}_${path || 'root'}_${pagination.page}_${pagination.limit}`;
            const cacheData = {
                data: data,
                timestamp: Date.now(),
                pagination: pagination
            };

            // Use sessionStorage for temporary cache (cleared when tab closes)
            sessionStorage.setItem(cacheKey, JSON.stringify(cacheData));
        } catch (error) {
            console.warn('Failed to cache folder data:', error);
        }
    }

    getCachedFolderData(sourceId, path, pagination) {
        try {
            const cacheKey = `folder_${sourceId}_${path || 'root'}_${pagination.page}_${pagination.limit}`;
            const stored = sessionStorage.getItem(cacheKey);

            if (!stored) return null;

            const cacheData = JSON.parse(stored);

            // Check if cache is still valid (5 minutes)
            if (Date.now() - cacheData.timestamp > 5 * 60 * 1000) {
                sessionStorage.removeItem(cacheKey);
                return null;
            }

            return cacheData;
        } catch (error) {
            console.warn('Failed to get cached folder data:', error);
            return null;
        }
    }
}

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

        // Initialize state management and persistent cache
        this.persistentCache = new PersistentCache(this.options.containerId);
        this.state = this.persistentCache.loadState() || new SourceSelectorState(this.options.containerId);

        // Legacy properties for backward compatibility
        this.currentExplorerSource = null;
        this.currentEditingSource = null;

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
        const listDiv = document.getElementById(`${this.options.containerId}-list`);
        
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
            if (typeof showStatusMessage === 'function') {
                showStatusMessage('This source has no dynamic variables to edit.', 'info', 3000);
            } else {
                alert('This source has no dynamic variables to edit.');
            }
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
                    dynamicVariables: updatedVars,
                    is_directory: this.currentEditingSource.is_directory || false,
                    level: this.currentEditingSource.level || 0
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
            if (typeof showStatusMessage === 'function') {
                showStatusMessage(`Error saving source: ${error.message}`, 'error', 4000);
            } else {
                alert(`Error saving source: ${error.message}`);
            }
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
                    dynamicVariables: updatedVars,
                    is_directory: this.currentEditingSource.is_directory || false,
                    level: this.currentEditingSource.level || 0
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
            if (typeof showStatusMessage === 'function') {
                showStatusMessage(`Error saving source: ${error.message}`, 'error', 4000);
            } else {
                alert(`Error saving source: ${error.message}`);
            }
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
    renderFileTree(items, container, source, level = 0) {
        if (!items || items.length === 0) {
            container.innerHTML = '<div style="padding: 20px; text-align: center; color: #666;">Empty directory</div>';
            return;
        }

        const html = items.map(item => {
            const isDirectory = item.is_directory;
            const icon = isDirectory ? '📁' : '📄';
            const levelClass = level > 0 ? `tree-level-${level}` : '';
            const itemClass = isDirectory ? 'directory' : 'file';
            const nonExplorable = isDirectory && item.explorable === false;

            // For lazy loading, directories should show + if they might have children
            const hasChildren = isDirectory && (item.has_children !== false);

            // Skip cache detection during initial render to avoid breaking expansion
            const isCached = false;

            // Format file size
            const sizeText = !isDirectory && item.size !== null ? this.formatFileSize(item.size) : '';

            // Format last modified date
            let dateText = '';
            if (item.last_modified) {
                try {
                    const date = new Date(item.last_modified);
                    dateText = date.toLocaleString('en-US', {
                        year: 'numeric', month: '2-digit', day: '2-digit',
                        hour: '2-digit', minute: '2-digit'
                    });
                } catch (e) { dateText = item.last_modified; }
            }

            let itemHtml = `
                <div class="tree-item-container">
                    <div class="tree-item ${itemClass} ${levelClass} ${nonExplorable ? 'non-explorable' : ''} ${isCached ? 'cached' : ''}"
                         data-path="${item.path}"
                         data-is-directory="${isDirectory}"
                         data-source-id="${source.id}"
                         data-has-children="${hasChildren}">
                        ${isDirectory ? `<span class="tree-toggle">${hasChildren ? '+' : ''}</span>` : '<span class="tree-toggle-placeholder"></span>'}
                        <span class="tree-icon">${icon}</span>
                        <span class="tree-name">${this.escapeHtml(item.name)}</span>
                        <div class="tree-metadata">
                            ${sizeText ? `<div class="tree-size">${sizeText}</div>` : ''}
                            ${dateText ? `<div class="tree-date">${dateText}</div>` : ''}
                        </div>
                    </div>
            `;

            // For lazy loading, always add empty children container for directories
            if (isDirectory && hasChildren) {
                const loadedStatus = isCached ? 'true' : 'false';
                itemHtml += `<div class="tree-children collapsed" data-loaded="${loadedStatus}"></div>`;
            }

            itemHtml += '</div>';
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

        // Add lazy loading toggle handlers
        container.querySelectorAll('.tree-toggle').forEach(toggle => {
            toggle.addEventListener('click', async (e) => {
                e.stopPropagation();
                await this.handleTreeToggle(toggle, source);
            });
        });

        // Apply cached styling after rendering to avoid breaking expansion
        setTimeout(() => {
            this.applyCachedStyling(container, source);
        }, 0);
    }

    /**
     * Get the current level of a tree item from its CSS class
     */
    getCurrentLevel(treeItem) {
        const classList = Array.from(treeItem.classList);
        const levelClass = classList.find(cls => cls.startsWith('tree-level-'));
        if (levelClass) {
            const level = parseInt(levelClass.replace('tree-level-', ''));
            return isNaN(level) ? 0 : level;
        }
        return 0;
    }

    /**
     * Apply cached styling to folders after rendering
     */
    applyCachedStyling(container, source) {
        container.querySelectorAll('.tree-item.directory').forEach(treeItem => {
            const folderPath = treeItem.dataset.path;
            try {
                const isCached = this.persistentCache.getCachedFolderData(source.id, folderPath, { page: 1, limit: 50 }) !== null;
                if (isCached) {
                    treeItem.classList.add('cached');
                }
            } catch (error) {
                // Silently ignore cache detection errors
            }
        });
    }

    /**
     * Handle tree toggle with lazy loading
     */
    async handleTreeToggle(toggle, source) {
        const treeItem = toggle.closest('.tree-item');
        const treeContainer = toggle.closest('.tree-item-container');
        const children = treeContainer.querySelector('.tree-children');

        if (!children || treeItem.dataset.isDirectory !== 'true') return;

        const isCollapsed = children.classList.contains('collapsed');
        const folderPath = treeItem.dataset.path;
        const explorerState = this.state.getExplorerState(source.id);

        if (isCollapsed) {
            // Expanding - load content if not already loaded
            if (children.dataset.loaded !== 'true') {
                toggle.innerHTML = '⟳'; // Loading spinner

                try {
                    // Use new paginated API to load folder contents
                    const result = await this.loadFolderContents(folderPath, source);

                    if (result.success && result.items.length > 0) {
                        // Calculate the correct level for children based on parent level
                        const currentLevel = this.getCurrentLevel(treeItem);
                        const childLevel = currentLevel + 1;

                        // Render children with lazy loading
                        this.renderFileTree(result.items, children, source, childLevel);
                        children.dataset.loaded = 'true';

                        // Cache the data
                        this.persistentCache.cacheFolderData(source.id, folderPath, result, {
                            page: 1,
                            limit: 50
                        });
                    } else {
                        children.innerHTML = '<div style="padding: 10px; color: #666;">Empty folder</div>';
                    }
                } catch (error) {
                    console.error('Failed to load folder contents:', error);
                    children.innerHTML = '<div style="padding: 10px; color: #e74c3c;">Failed to load contents</div>';
                }
            }

            // Expand
            children.classList.remove('collapsed');
            toggle.textContent = '-';
            explorerState.addExpandedPath(folderPath);
        } else {
            // Collapse
            children.classList.add('collapsed');
            toggle.textContent = '+';
            explorerState.removeExpandedPath(folderPath);
        }

        // Save state after toggle
        this.persistentCache.saveState(this.state);
    }

    /**
     * Convert full path to relative path for API calls
     */
    getRelativePathForAPI(fullPath, source) {
        if (!fullPath) return '';

        if (source.type === 's3') {
            // For S3: convert s3://bucket/path/ to path
            const s3Match = fullPath.match(/^s3:\/\/[^\/]+\/(.*)$/);
            if (s3Match) {
                let relativePath = s3Match[1];
                // Remove trailing slash for consistency
                if (relativePath.endsWith('/')) {
                    relativePath = relativePath.slice(0, -1);
                }
                return relativePath;
            }
        } else if (source.type === 'local_file') {
            // For local files: extract relative path from full path
            const config = source.config;
            if (config && config.path && fullPath.startsWith(config.path)) {
                let relativePath = fullPath.substring(config.path.length);
                if (relativePath.startsWith('/')) {
                    relativePath = relativePath.substring(1);
                }
                return relativePath;
            }
        }

        // Fallback: return the path as-is
        return fullPath;
    }

    /**
     * Load folder contents using new paginated API
     */
    async loadFolderContents(folderPath, source, page = 1, limit = 50) {
        // Check cache first
        const cachedData = this.persistentCache.getCachedFolderData(source.id, folderPath, { page, limit });
        if (cachedData) {
            return cachedData.data;
        }

        // Convert full path to relative path for API
        const relativePath = this.getRelativePathForAPI(folderPath, source);

        // Build API URL
        const params = new URLSearchParams({
            path: relativePath || '',
            page: page.toString(),
            limit: limit.toString(),
            sort_by: 'name',
            sort_order: 'asc'
        });

        const response = await fetch(`/api/sources/${source.id}/browse-paginated?${params}`);

        if (!response.ok) {
            const errorResult = await response.json();
            throw new Error(errorResult.error || `HTTP ${response.status}`);
        }

        return await response.json();
    }

    /**
     * Handle file selection
     */
    async selectFile(filePath, source, element) {
        try {
            // Remove previous selection from the file tree container
            const explorerContent = document.getElementById(`${this.options.containerId}-explorer-content`);
            if (explorerContent) {
                const treeContainer = explorerContent.querySelector('.file-tree-container');
                if (treeContainer) {
                    treeContainer.querySelectorAll('.tree-item.selected').forEach(el => {
                        el.classList.remove('selected');
                    });
                }
            }
            
            // Mark current item as selected
            element.classList.add('selected');

            // Show loading indicator
            this.showFileLoading(filePath, source.name);

            try {
                // Fetch file content
                const response = await fetch(`/api/sources/${source.id}/file?path=${encodeURIComponent(filePath)}`);

                if (response.ok) {
                    const data = await response.text();

                    // Hide loading indicator
                    this.hideFileLoading();

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
                    // Hide loading indicator
                    this.hideFileLoading();

                    const error = await response.json();
                    if (typeof showStatusMessage === 'function') {
                        showStatusMessage(`Error loading file: ${error.error}`, 'error', 4000);
                    } else {
                        alert(`Error loading file: ${error.error}`);
                    }
                }
            } catch (fetchError) {
                // Hide loading indicator on any error
                this.hideFileLoading();
                throw fetchError;
            }
        } catch (error) {
            console.error('Error selecting file:', error);
            if (typeof showStatusMessage === 'function') {
                showStatusMessage('Error loading file content', 'error', 4000);
            } else {
                alert('Error loading file content');
            }
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

            // Use new paginated endpoint for directory sources
            const response = await fetch(`/api/sources/${source.id}/browse-paginated?page=1&limit=50&sort_by=name&sort_order=asc`);

            if (response.ok) {
                const result = await response.json();

                if (result.success && result.items) {
                    // Directory response from paginated endpoint
                    // Convert to old format for compatibility
                    const directoryData = {
                        type: 'directory',
                        tree: result.items,
                        items: result.items,
                        pagination: result.pagination,
                        base_path: result.source_type === 's3' ? `s3://${result.items[0]?.path?.split('/')[2] || ''}` : '',
                        current_path: result.path || ''
                    };

                    // Show directory browser in explorer panel
                    this.showExplorerPanel(source, directoryData);
                } else {
                    throw new Error(result.error || 'Failed to fetch directory data');
                }
            } else {
                const errorResult = await response.json();
                throw new Error(errorResult.error || `HTTP ${response.status}`);
            }
        } catch (error) {
            console.error('Error fetching source data:', error);
            if (typeof showStatusMessage === 'function') {
                showStatusMessage(`Error fetching data: ${error.message}`, 'error', 4000);
            } else {
                alert(`Error fetching data: ${error.message}`);
            }
        } finally {
            // Re-enable fetch button
            const fetchBtn = document.querySelector(`[data-action="fetch"][data-source-id="${source.id}"]`);
            if (fetchBtn) {
                fetchBtn.disabled = false;
                fetchBtn.textContent = 'Fetch';
            }
        }
    }

showExplorerPanel(source, directoryData, isUserInitiated = true) {
        // Update both legacy and new state management
        this.currentExplorerSource = source;

        // Only set current explorer source if this was user-initiated (not restoration)
        if (isUserInitiated) {
            this.state.setCurrentExplorerSource(source.id);
        }

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

        // Render the tree inside the card with lazy loading
        const treeContainer = explorerContent.querySelector('.file-tree-container');
        if (treeContainer) {
            // Use the new lazy loading approach - only render top level initially
            this.renderFileTree(directoryData.tree || directoryData.items, treeContainer, source, 0);

            // After rendering, restore expanded state (but don't save state immediately)
            if (!isUserInitiated) {
                setTimeout(() => {
                    const explorerState = this.state.getExplorerState(source.id);
                    this.restoreTreeExpandedState(explorerState);
                }, 50);
            }
        }

        // Only save state if this was user-initiated
        if (isUserInitiated) {
            this.persistentCache.saveState(this.state);
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
                    <div class="panel-header-actions">
                        <button class="refresh-btn" onclick="window.sourceSelectors?.['${this.options.containerId}']?.refreshExplorer(this)" title="Refresh Explorer">🔄</button>
                    </div>
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
     * Clear cache for a specific source
     */
    clearSourceCache(sourceId) {
        // Clear frontend sessionStorage cache for this source
        const keysToRemove = [];
        for (let i = 0; i < sessionStorage.length; i++) {
            const key = sessionStorage.key(i);
            if (key && key.startsWith(`folder_${sourceId}_`)) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(key => sessionStorage.removeItem(key));

        // Clear the explorer state loaded data for this source
        const explorerState = this.state.getExplorerState(sourceId);
        explorerState.loadedData.clear();
    }

    /**
     * Refresh the explorer view with cache invalidation
     */
    async refreshExplorer(button) {
        if (this.currentExplorerSource) {
            const sourceId = this.currentExplorerSource.id;

            // Add spinning animation
            button.classList.add('spinning');

            try {
                // Clear frontend cache for this source
                this.clearSourceCache(sourceId);

                // Force refresh with cache-busting parameter
                await this.fetchSourceDataWithCacheBust(this.currentExplorerSource);

                // Clear expanded state and reload from fresh data
                const explorerState = this.state.getExplorerState(sourceId);
                explorerState.expandedPaths.clear();
                explorerState.loadedData.clear();

                // Save cleared state to prevent auto-restoration
                this.persistentCache.saveState(this.state);

                // Don't auto-restore expansion to avoid prefetching nested folders
                // User can manually expand folders if needed

            } catch (error) {
                console.error('Error refreshing explorer:', error);
            } finally {
                // Remove spinning animation
                button.classList.remove('spinning');
            }
        }
    }

    /**
     * Fetch source data with cache busting for refresh
     */
    async fetchSourceDataWithCacheBust(source) {
        try {
            // Use new paginated endpoint with cache-busting parameter
            const cacheBuster = Date.now();
            const response = await fetch(`/api/sources/${source.id}/browse-paginated?page=1&limit=50&sort_by=name&sort_order=asc&refresh=${cacheBuster}`);

            if (response.ok) {
                const result = await response.json();

                if (result.success && result.items) {
                    // Directory response from paginated endpoint
                    // Convert to old format for compatibility
                    const directoryData = {
                        type: 'directory',
                        tree: result.items,
                        items: result.items,
                        pagination: result.pagination,
                        base_path: result.source_type === 's3' ? `s3://${result.items[0]?.path?.split('/')[2] || ''}` : '',
                        current_path: result.path || ''
                    };

                    // Show directory browser in explorer panel
                    this.showExplorerPanel(source, directoryData);
                } else {
                    throw new Error(result.error || 'Failed to fetch directory data');
                }
            } else {
                const errorResult = await response.json();
                throw new Error(errorResult.error || `HTTP ${response.status}`);
            }
        } catch (error) {
            console.error('Error fetching source data with cache bust:', error);
            throw error;
        }
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

        // Clear the current explorer state to prevent auto-restoration
        if (this.currentExplorerSource) {
            const explorerState = this.state.getExplorerState(this.currentExplorerSource.id);
            explorerState.expandedPaths.clear();
            explorerState.loadedData.clear();
            explorerState.selectedFile = null;
            explorerState.scrollPosition = 0;

            // Clear the current explorer source
            this.currentExplorerSource = null;
            this.state.currentExplorerSourceId = null;

            // Save the cleared state
            this.persistentCache.saveState(this.state);
        }
        
        this.currentExplorerSource = null;
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

        // Load sources only if we don't have them yet
        if (this.sources.length === 0) {
            this.loadSources();
        }

        // Only restore explorer state if there's meaningful interaction to restore
        // Don't auto-expand just because we have a currentExplorerSourceId
        if (this.state.currentExplorerSourceId) {
            const explorerState = this.state.getExplorerState(this.state.currentExplorerSourceId);
            const hasExpandedPaths = explorerState.expandedPaths.size > 0;
            const hasSelectedFile = explorerState.selectedFile !== null;
            const hasScrollPosition = explorerState.scrollPosition > 0;

            if (hasExpandedPaths || hasSelectedFile || hasScrollPosition) {
                await this.restoreExplorerState(this.state.currentExplorerSourceId);
            }
        }
    }

    /**
     * Hide the source selector
     */
    hide() {
        // Save current state before hiding
        this.saveCurrentExplorerState();

        const modal = document.getElementById(this.options.containerId);
        const overlay = document.getElementById(`${this.options.containerId}-overlay`);

        overlay.style.display = 'none';
        modal.style.display = 'none';
        this.isVisible = false;

        // Don't clear explorer content - keep it for restoration
    }

    /**
     * Save current explorer state
     */
    saveCurrentExplorerState() {
        if (!this.currentExplorerSource) return;

        const sourceId = this.currentExplorerSource.id;
        const explorerState = this.state.getExplorerState(sourceId);

        // Save expanded paths
        const expandedElements = document.querySelectorAll('.tree-children:not(.collapsed)');
        expandedElements.forEach(element => {
            const treeItem = element.previousElementSibling;
            if (treeItem && treeItem.dataset && treeItem.dataset.path) {
                explorerState.addExpandedPath(treeItem.dataset.path);
            }
        });

        // Save scroll position
        const explorerContent = document.getElementById(`${this.options.containerId}-explorer-content`);
        if (explorerContent) {
            explorerState.scrollPosition = explorerContent.scrollTop;
        }

        // Save selected file
        const selectedElement = document.querySelector('.tree-item.selected');
        if (selectedElement && selectedElement.dataset.path) {
            explorerState.selectedFile = selectedElement.dataset.path;
        }

        // Update current explorer source in state
        this.state.setCurrentExplorerSource(sourceId);

        // Persist to localStorage
        this.persistentCache.saveState(this.state);
    }

    /**
     * Fetch source data for restoration purposes (doesn't update state)
     */
    async fetchSourceDataForRestoration(source) {
        try {
            // Use new paginated endpoint for directory sources
            const response = await fetch(`/api/sources/${source.id}/browse-paginated?page=1&limit=50&sort_by=name&sort_order=asc`);

            if (response.ok) {
                const result = await response.json();

                if (result.success && result.items) {
                    // Directory response from paginated endpoint
                    const directoryData = {
                        type: 'directory',
                        tree: result.items,
                        items: result.items,
                        pagination: result.pagination,
                        base_path: result.source_type === 's3' ? `s3://${result.items[0]?.path?.split('/')[2] || ''}` : '',
                        current_path: result.path || ''
                    };

                    // Show directory browser in explorer panel (mark as not user-initiated)
                    this.showExplorerPanel(source, directoryData, false);
                } else {
                    throw new Error(result.error || 'Failed to fetch directory data');
                }
            } else {
                const errorResult = await response.json();
                throw new Error(errorResult.error || `HTTP ${response.status}`);
            }
        } catch (error) {
            console.error('Error fetching source data for restoration:', error);
            throw error;
        }
    }

    /**
     * Restore explorer state for a source
     */
    async restoreExplorerState(sourceId) {
        const source = this.sources.find(s => s.id === sourceId);
        if (!source) return;

        const explorerPanel = document.getElementById(`${this.options.containerId}-explorer`);
        const explorerState = this.state.getExplorerState(sourceId);

        // Only restore if the explorer was actually used before
        // Check if there are expanded paths, selected files, or scroll position
        const hasExpandedPaths = explorerState.expandedPaths.size > 0;
        const hasSelectedFile = explorerState.selectedFile !== null;
        const hasScrollPosition = explorerState.scrollPosition > 0;

        const shouldRestore = hasExpandedPaths || hasSelectedFile || hasScrollPosition;

        if (!shouldRestore) {
            // No meaningful state to restore, don't auto-open explorer
            return;
        }

        // If explorer panel is hidden, we need to re-fetch and show it
        if (!explorerPanel || explorerPanel.style.display === 'none') {
            try {
                // Re-fetch source data to show explorer (mark as restoration, not user-initiated)
                await this.fetchSourceDataForRestoration(source);

                // Wait for DOM to be ready, then restore state
                setTimeout(() => {
                    this.restoreTreeExpandedState(explorerState);
                }, 100);
            } catch (error) {
                console.error('Failed to restore explorer state:', error);
            }
        } else {
            // Explorer is already visible, just restore expanded state
            this.restoreTreeExpandedState(explorerState);
        }
    }

    /**
     * Restore tree expanded state and scroll position
     */
    restoreTreeExpandedState(explorerState) {
        // Do not auto-expand cached folders - keep them collapsed by default
        // User can manually expand folders they want to see
        // explorerState.expandedPaths.forEach(path => {
        //     const treeItem = document.querySelector(`[data-path="${path}"]`);
        //     if (treeItem) {
        //         const toggle = treeItem.querySelector('.tree-toggle');
        //         const treeItemContainer = treeItem.closest('.tree-item-container');
        //         if (treeItemContainer) {
        //             const children = treeItemContainer.querySelector('.tree-children');

        //             if (toggle && children && children.classList.contains('collapsed')) {
        //                 children.classList.remove('collapsed');
        //                 toggle.textContent = '-';
        //             }
        //         }
        //     }
        // });

        // Restore scroll position
        const explorerContent = document.getElementById(`${this.options.containerId}-explorer-content`);
        if (explorerContent && explorerState.scrollPosition > 0) {
            explorerContent.scrollTop = explorerState.scrollPosition;
        }

        // Restore selected file
        if (explorerState.selectedFile) {
            const selectedElement = document.querySelector(`[data-path="${explorerState.selectedFile}"]`);
            if (selectedElement) {
                // Remove previous selection
                document.querySelectorAll('.tree-item.selected').forEach(el => {
                    el.classList.remove('selected');
                });
                // Add selection to restored item
                selectedElement.classList.add('selected');
            }
        }
    }

    /**
     * Show file loading indicator
     */
    showFileLoading(filePath, sourceName) {
        const loadingOverlay = document.getElementById(`${this.options.containerId}-file-loading`);
        const loadingDetails = document.getElementById(`${this.options.containerId}-file-loading-details`);

        if (loadingOverlay && loadingDetails) {
            // Update loading details
            loadingDetails.innerHTML = `
                <strong>Source:</strong> ${this.escapeHtml(sourceName)}<br>
                <strong>File:</strong> ${this.escapeHtml(filePath)}
            `;

            // Show the overlay
            loadingOverlay.style.display = 'flex';
        }
    }

    /**
     * Hide file loading indicator
     */
    hideFileLoading() {
        const loadingOverlay = document.getElementById(`${this.options.containerId}-file-loading`);

        if (loadingOverlay) {
            loadingOverlay.style.display = 'none';
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