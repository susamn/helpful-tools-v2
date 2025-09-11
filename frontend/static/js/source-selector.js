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
                <div class="file-tree-container" id="file-tree-${this.options.containerId}-${source.id}" style="display:none;">
                    <div class="file-tree-header">
                        <span>Select a file:</span>
                        <button class="close-tree-btn" onclick="this.parentElement.parentElement.style.display='none'">×</button>
                    </div>
                    <div class="file-tree" id="tree-${this.options.containerId}-${source.id}">
                        <!-- Tree will be populated here -->
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
            const sizeText = !isDirectory && item.size !== null ? this.formatFileSize(item.size) : '';
            
            let itemHtml = `
                <div class="tree-item ${itemClass} ${levelClass} ${nonExplorable ? 'non-explorable' : ''}" 
                     data-path="${item.path}" 
                     data-is-directory="${isDirectory}"
                     data-source-id="${source.id}">
                    <span class="tree-item-icon">${icon}</span>
                    <span class="tree-item-name">${this.escapeHtml(item.name)}</span>
                    ${sizeText ? `<span class="tree-item-size">${sizeText}</span>` : ''}
                    ${nonExplorable ? '<span class="tree-item-size">(not explorable)</span>' : ''}
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
                        // Show directory browser
                        this.showDirectoryBrowser(source, result);
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
     * Show directory browser for directory sources
     */
    showDirectoryBrowser(source, directoryData) {
        const treeContainer = document.getElementById(`file-tree-${this.options.containerId}-${source.id}`);
        const treeContent = document.getElementById(`tree-${this.options.containerId}-${source.id}`);
        
        if (!treeContainer || !treeContent) {
            console.error(`Tree container not found for ${this.options.containerId}-${source.id}`);
            return;
        }

        // Show tree container
        treeContainer.style.display = 'block';

        // Render the tree
        this.renderFileTree(directoryData.tree, treeContent, source, 0);
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