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
        
        this.initializeComponent();
    }

    /**
     * Initialize the source selector component
     */
    initializeComponent() {
        this.createModalStructure();
        this.attachEventListeners();
        this.loadSources();
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

        const modalHTML = `
            <div class="modal-overlay source-selector-overlay" id="${this.options.containerId}-overlay" style="display: none;"></div>
            <div class="modal source-selector-modal" id="${this.options.containerId}" style="display: none;">
                <div class="modal-header">
                    <h2>Select a Source</h2>
                    <button class="modal-close-btn source-selector-close">&times;</button>
                </div>
                <div class="modal-content">
                    <div class="source-selector-loading" style="display: none;">
                        <p>Loading sources...</p>
                    </div>
                    <div class="source-selector-empty" style="display: none;">
                        <p>No sources available. <a href="/sources" target="_blank">Create a source</a> to get started.</p>
                    </div>
                    <div class="source-selector-list" id="${this.options.containerId}-list">
                        <!-- Sources will be populated here -->
                    </div>
                </div>
            </div>
            
            <!-- Dynamic Variables Edit Modal -->
            <div class="modal-overlay dynamic-vars-overlay" id="${this.options.containerId}-vars-overlay" style="display: none;"></div>
            <div class="modal dynamic-vars-modal" id="${this.options.containerId}-vars-modal" style="display: none;">
                <div class="modal-header">
                    <h2>Edit Dynamic Variables</h2>
                    <button class="modal-close-btn dynamic-vars-close">&times;</button>
                </div>
                <div class="modal-content">
                    <div class="dynamic-vars-form" id="${this.options.containerId}-vars-form">
                        <!-- Dynamic variables form will be populated here -->
                    </div>
                    <div class="modal-actions">
                        <button class="btn btn-primary dynamic-vars-save">Save</button>
                        <button class="btn btn-secondary dynamic-vars-cancel">Cancel</button>
                    </div>
                </div>
            </div>
        `;

        // Add CSS if not already present
        if (!document.getElementById('source-selector-styles')) {
            const styles = document.createElement('style');
            styles.id = 'source-selector-styles';
            styles.textContent = this.getComponentCSS();
            document.head.appendChild(styles);
        }

        document.body.insertAdjacentHTML('beforeend', modalHTML);
    }

    /**
     * Get component CSS
     */
    getComponentCSS() {
        return `
            .source-selector-modal {
                width: 750px !important;
                max-height: 80vh !important;
            }
            
            .dynamic-vars-modal {
                width: 455px !important;
                background: #f8f9fa;
                border: 2px solid #007bff;
            }
            
            .source-selector-list {
                max-height: 60vh;
                overflow-y: auto;
            }
            
            .source-item {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 12px;
                border: 1px solid #ddd;
                border-radius: 4px;
                margin-bottom: 8px;
                background: #f9f9f9;
                transition: background-color 0.2s;
            }
            
            .source-item:hover {
                background: #f0f0f0;
            }
            
            .source-info {
                flex: 1;
                cursor: default;
            }
            
            .source-name {
                font-weight: bold;
                margin-bottom: 4px;
            }
            
            .source-type {
                color: #666;
                font-size: 0.9em;
                margin-bottom: 2px;
            }
            
            .source-path {
                color: #888;
                font-size: 0.8em;
                word-break: break-all;
            }
            
            .source-actions {
                display: flex;
                gap: 8px;
                margin-left: 12px;
                align-items: center;
            }
            
            .source-btn {
                padding: 6px 12px;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 0.85em;
                transition: background-color 0.2s;
            }
            
            .source-btn-edit {
                background: #007bff;
                color: white;
            }
            
            .source-btn-edit:hover {
                background: #0056b3;
            }
            
            .source-btn-test {
                background: #ffc107;
                color: #212529;
            }
            
            .source-btn-test:hover {
                background: #e0a800;
            }
            
            .test-status {
                font-weight: bold;
                font-size: 1em;
                margin-right: 8px;
                opacity: 0;
                transition: opacity 0.3s ease;
            }
            
            .test-status.show {
                opacity: 1;
            }
            
            .test-status.success {
                color: #28a745;
            }
            
            .test-status.failure {
                color: #dc3545;
            }
            
            .source-btn-fetch {
                background: #28a745;
                color: white;
            }
            
            .source-btn-fetch:hover {
                background: #1e7e34;
            }
            
            .source-btn:disabled {
                background: #ccc;
                color: #666;
                cursor: not-allowed;
            }
            
            .dynamic-vars-modal .modal-content {
                padding: 20px;
                background: white;
                border-radius: 8px;
                margin: 10px;
                box-shadow: inset 0 1px 3px rgba(0,0,0,0.1);
            }
            
            .dynamic-vars-form {
                margin-bottom: 20px;
                padding: 15px;
                background: #f8f9fa;
                border: 1px solid #dee2e6;
                border-radius: 6px;
            }
            
            .dynamic-var-row {
                display: flex;
                align-items: center;
                margin-bottom: 12px;
                gap: 10px;
            }
            
            .dynamic-var-label {
                min-width: 120px;
                font-weight: bold;
            }
            
            .dynamic-var-input {
                flex: 1;
                padding: 6px;
                border: 1px solid #ddd;
                border-radius: 4px;
            }
            
            .dynamic-var-description {
                color: #666;
                font-size: 0.85em;
                margin-left: 130px;
                margin-top: -8px;
                margin-bottom: 8px;
            }
            
            .modal-actions {
                display: flex;
                gap: 10px;
                justify-content: flex-end;
                padding-top: 15px;
                border-top: 1px solid #eee;
            }
            
            .btn {
                padding: 8px 16px;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 0.9em;
            }
            
            .btn-primary {
                background: #007bff;
                color: white;
            }
            
            .btn-primary:hover {
                background: #0056b3;
            }
            
            .btn-secondary {
                background: #6c757d;
                color: white;
            }
            
            .btn-secondary:hover {
                background: #545b62;
            }
        `;
    }

    /**
     * Attach event listeners
     */
    attachEventListeners() {
        const modal = document.getElementById(this.options.containerId);
        const overlay = document.getElementById(`${this.options.containerId}-overlay`);
        const closeBtn = modal.querySelector('.source-selector-close');
        
        const varsModal = document.getElementById(`${this.options.containerId}-vars-modal`);
        const varsOverlay = document.getElementById(`${this.options.containerId}-vars-overlay`);
        const varsCloseBtn = varsModal.querySelector('.dynamic-vars-close');
        const varsSaveBtn = varsModal.querySelector('.dynamic-vars-save');
        const varsCancelBtn = varsModal.querySelector('.dynamic-vars-cancel');

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
    }

    /**
     * Load sources from the API
     */
    async loadSources() {
        const loadingDiv = document.querySelector('.source-selector-loading');
        const emptyDiv = document.querySelector('.source-selector-empty');
        const listDiv = document.getElementById(`${this.options.containerId}-list`);

        try {
            loadingDiv.style.display = 'block';
            emptyDiv.style.display = 'none';
            listDiv.innerHTML = '';

            const response = await fetch('/api/sources');
            const result = await response.json();

            if (result.success && result.sources) {
                this.sources = Object.values(result.sources);
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
        const emptyDiv = document.querySelector('.source-selector-empty');

        if (this.sources.length === 0) {
            emptyDiv.style.display = 'block';
            listDiv.innerHTML = '';
            return;
        }

        emptyDiv.style.display = 'none';

        const sourcesHTML = this.sources.map(source => {
            const hasDynamicVars = source.dynamicVariables && Object.keys(source.dynamicVariables).length > 0;
            const resolvedPath = this.resolveSourcePath(source);

            return `
                <div class="source-item" data-source-id="${source.id}">
                    <div class="source-info">
                        <div class="source-name">${this.escapeHtml(source.name)}</div>
                        <div class="source-type">${this.escapeHtml(source.type.toUpperCase())}</div>
                        <div class="source-path">${this.escapeHtml(resolvedPath)}</div>
                    </div>
                    <div class="source-actions">
                        <span class="test-status" id="test-status-${source.id}"></span>
                        ${this.options.showEditButton && hasDynamicVars ? 
                            `<button class="source-btn source-btn-edit" data-action="edit" data-source-id="${source.id}">Edit</button>` : ''}
                        <button class="source-btn source-btn-test" data-action="test" data-source-id="${source.id}">Test</button>
                        ${this.options.showFetchButton ? 
                            `<button class="source-btn source-btn-fetch" data-action="fetch" data-source-id="${source.id}">Fetch</button>` : ''}
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
     * Show the variables editing modal
     */
    showEditVariables(source) {
        this.currentEditingSource = source;
        const varsModal = document.getElementById(`${this.options.containerId}-vars-modal`);
        const varsOverlay = document.getElementById(`${this.options.containerId}-vars-overlay`);
        const varsForm = document.getElementById(`${this.options.containerId}-vars-form`);

        if (!source.dynamicVariables || Object.keys(source.dynamicVariables).length === 0) {
            alert('This source has no dynamic variables to edit.');
            return;
        }

        // Create form for dynamic variables
        const formHTML = Object.entries(source.dynamicVariables).map(([key, value]) => `
            <div class="dynamic-var-row">
                <label class="dynamic-var-label">${this.escapeHtml(key)}:</label>
                <input type="text" class="dynamic-var-input" data-var-key="${key}" value="${this.escapeHtml(value || '')}" placeholder="Enter value for ${key}">
            </div>
            <div class="dynamic-var-description">Variable: $${key}</div>
        `).join('');

        varsForm.innerHTML = formHTML;

        // Show modal
        varsOverlay.style.display = 'block';
        varsModal.style.display = 'block';
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
     * Save variables
     */
    async saveVariables() {
        if (!this.currentEditingSource) return;

        const varsForm = document.getElementById(`${this.options.containerId}-vars-form`);
        const inputs = varsForm.querySelectorAll('.dynamic-var-input');
        
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
            } else {
                const errorResult = await response.json();
                throw new Error(errorResult.error || `HTTP ${response.status}`);
            }
        } catch (error) {
            console.error('Error testing source:', error);
            this.showTestStatus(source.id, false);
        } finally {
            // Re-enable the test button
            const testBtn = document.querySelector(`[data-action="test"][data-source-id="${source.id}"]`);
            if (testBtn) {
                testBtn.disabled = false;
            }
        }
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
     * Fetch data from a source
     */
    async fetchSourceData(source) {
        try {
            // Disable the fetch button
            const fetchBtn = document.querySelector(`[data-action="fetch"][data-source-id="${source.id}"]`);
            if (fetchBtn) {
                fetchBtn.disabled = true;
                fetchBtn.textContent = 'Fetching...';
            }

            const response = await fetch(`/api/sources/${source.id}/data`);
            
            if (response.ok) {
                const data = await response.text();
                
                // Hide the modal
                this.hide();
                
                // Trigger fetch callback
                if (this.options.onFetch) {
                    this.options.onFetch(data, source);
                }
            } else {
                const errorResult = await response.json();
                throw new Error(errorResult.error || `HTTP ${response.status}`);
            }
        } catch (error) {
            console.error('Error fetching source data:', error);
            alert(`Error fetching data: ${error.message}`);
        } finally {
            // Re-enable the fetch button
            const fetchBtn = document.querySelector(`[data-action="fetch"][data-source-id="${source.id}"]`);
            if (fetchBtn) {
                fetchBtn.disabled = false;
                fetchBtn.textContent = 'Fetch';
            }
        }
    }

    /**
     * Show the source selector
     */
    show() {
        const modal = document.getElementById(this.options.containerId);
        const overlay = document.getElementById(`${this.options.containerId}-overlay`);
        
        overlay.style.display = 'block';
        modal.style.display = 'block';
        this.isVisible = true;
        
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