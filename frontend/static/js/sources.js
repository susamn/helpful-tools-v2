// Sources Manager Tool
document.addEventListener('DOMContentLoaded', function() {
    window.sourcesManager = new SourcesManager();
});

class SourcesManager {
    constructor() {
        this.toolName = 'sources';
        this.fontSize = parseInt(localStorage.getItem(`${this.toolName}-fontSize`) || '13');
        this.sources = [];
        this.currentEditingId = null;
        
        this.initElements();
        this.attachEvents();
        this.applyFontSize();
        this.loadSources();
    }

    initElements() {
        this.els = {
            sourcesList: document.getElementById('sourcesList'),
            sourcesCount: document.getElementById('sourcesCount'),
            statusText: document.getElementById('statusText'),
            connectionInfo: document.getElementById('connectionInfo'),
            
            // Popup elements
            sourcePopup: document.getElementById('sourcePopup'),
            sourcePopupOverlay: document.getElementById('sourcePopupOverlay'),
            sourcePopupTitle: document.getElementById('sourcePopupTitle'),
            sourceForm: document.getElementById('sourceForm'),
            
            // Form elements
            sourceName: document.getElementById('sourceName'),
            sourceType: document.getElementById('sourceType'),
            staticConfigSection: document.getElementById('staticConfigSection'),
            staticConfigFields: document.getElementById('staticConfigFields'),
            pathSection: document.getElementById('pathSection'),
            pathTemplate: document.getElementById('pathTemplate'),
            dynamicSection: document.getElementById('dynamicSection'),
            dynamicFields: document.getElementById('dynamicFields')
        };
    }

    attachEvents() {
        // Main buttons
        document.getElementById('addSourceBtn').onclick = () => this.showAddSourcePopup();
        document.getElementById('refreshBtn').onclick = () => this.loadSources();
        document.getElementById('testAllBtn').onclick = () => this.testAllSources();
        
        // Popup events
        document.getElementById('sourcePopupClose').onclick = () => this.hideSourcePopup();
        this.els.sourcePopupOverlay.onclick = () => this.hideSourcePopup();
        
        // Form events
        this.els.sourceType.onchange = () => this.updateConfigFields();
        this.els.sourceForm.onsubmit = (e) => this.handleFormSubmit(e);
        document.getElementById('cancelBtn').onclick = () => this.hideSourcePopup();
        document.getElementById('testConnectionBtn').onclick = () => this.testConnection();
        document.getElementById('resolveBtn').onclick = () => this.resolveVariables();
        
        // Font controls
        document.getElementById('fontIncreaseBtn').onclick = () => this.changeFontSize(1);
        document.getElementById('fontDecreaseBtn').onclick = () => this.changeFontSize(-1);
        
        // Keyboard events
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.hideSourcePopup();
            }
        });
    }


    async loadSources() {
        try {
            this.updateStatus('Loading sources...');
            
            const response = await fetch('/api/sources');
            const result = await response.json();
            
            if (result.success) {
                this.sources = result.sources;
                this.displaySources();
                this.updateStatus(`Loaded ${this.sources.length} sources`);
                this.els.connectionInfo.textContent = `${this.sources.length} sources configured`;
            } else {
                this.showError('Failed to load sources: ' + result.error);
            }
        } catch (error) {
            this.showError('Error loading sources: ' + error.message);
        }
    }

    displaySources() {
        this.els.sourcesCount.textContent = `${this.sources.length} source${this.sources.length !== 1 ? 's' : ''}`;
        
        if (this.sources.length === 0) {
            this.els.sourcesList.innerHTML = `
                <div class="no-sources">
                    <div class="no-sources-icon">🗂️</div>
                    <div class="no-sources-title">No Data Sources</div>
                    <div class="no-sources-text">Click "Add Source" to create your first data source</div>
                </div>
            `;
            return;
        }

        const html = this.sources.map(source => this.renderSourceItem(source)).join('');
        this.els.sourcesList.innerHTML = html;
    }

    renderSourceItem(source) {
        const typeIcons = {
            local_file: '📁',
            s3: '☁️',
            sftp: '🔐',
            samba: '🌐',
            http: '🌍'
        };

        // Determine file/folder icon based on is_directory attribute
        const fileTypeIcon = source.is_directory ? '📁' : '📄';
        const levelInfo = source.is_directory && source.level > 0 ? ` (Level: ${source.level})` : '';

        const configSummary = this.getHighlightedPathTemplate(source);
        
        return `
            <div class="source-item" data-source-id="${source.id}">
                <div class="source-header">
                    <div class="source-name">${typeIcons[source.type] || '📄'} ${this.escapeHtml(source.name)}</div>
                    <div class="source-id-container">
                        <div class="file-type-icon">${fileTypeIcon}</div>
                        <div class="source-id">${source.id}</div>
                    </div>
                </div>
                <div class="source-type">${source.type.replace('_', ' ').toUpperCase()}${levelInfo}</div>
                <div class="source-config">${configSummary}</div>
                <div class="source-footer">
                    <div class="source-status">
                        <div class="status-dot ${source.status}"></div>
                        <span>${source.status}</span>
                        ${source.last_tested ? `<span class="test-time">tested ${this.formatTime(source.last_tested)}</span>` : ''}
                    </div>
                    <div class="source-actions">
                        <button class="source-btn test" onclick="sourcesManager.testSource('${source.id}')">Test</button>
                        <button class="source-btn edit" onclick="sourcesManager.editSource('${source.id}')">Edit</button>
                        <button class="source-btn duplicate" onclick="sourcesManager.duplicateSource('${source.id}')">Duplicate</button>
                        <button class="source-btn delete" onclick="sourcesManager.deleteSource('${source.id}')">Delete</button>
                    </div>
                </div>
            </div>
        `;
    }

        getHighlightedPathTemplate(source) {
        const pathTemplate = source.pathTemplate;
        const dynamicVariables = source.dynamicVariables;

        if (!pathTemplate) {
            return 'No path template';
        }

        if (!dynamicVariables || Object.keys(dynamicVariables).length === 0) {
            return this.escapeHtml(pathTemplate);
        }

        let highlightedPath = this.escapeHtml(pathTemplate);
        for (const [key, value] of Object.entries(dynamicVariables)) {
            const variable = `${key}`;
            const highlightedValue = `<span class="dynamic-variable">${this.escapeHtml(value)}</span>`;
            highlightedPath = highlightedPath.split(variable).join(highlightedValue);
        }

        return highlightedPath;
    }

    showAddSourcePopup() {
        this.currentEditingId = null;
        this.els.sourcePopupTitle.textContent = 'Add New Source';
        this.els.sourceForm.reset();
        this.els.staticConfigSection.style.display = 'none';
        this.els.pathSection.style.display = 'none';
        this.els.dynamicSection.style.display = 'none';
        this.els.staticConfigFields.innerHTML = '';
        this.els.pathTemplate.value = '';
        this.els.dynamicFields.innerHTML = '';
        document.getElementById('testConnectionBtn').disabled = true;
        
        this.els.sourcePopupOverlay.classList.add('show');
        this.els.sourcePopup.classList.add('show');
    }

    async editSource(sourceId) {
        const source = this.sources.find(s => s.id === sourceId);
        if (!source) {
            this.showError('Source not found');
            return;
        }

        this.currentEditingId = sourceId;
        this.els.sourcePopupTitle.textContent = 'Edit Source';
        
        // Fill in the form with current values
        this.els.sourceName.value = source.name;
        this.els.sourceType.value = source.type;
        
        // Generate config fields for this source type
        await this.updateConfigFields();
        
        // Fill in path template if available, otherwise extract from config
        if (source.pathTemplate) {
            this.els.pathTemplate.value = source.pathTemplate;
        } else {
            // Backward compatibility - extract path from config
            const path = source.config?.path || source.config?.url || source.config?.key || '';
            this.els.pathTemplate.value = path;
        }
        
        // Fill in static config values
        this.fillStaticConfigFields(source.config);
        
        // Fill in dynamic variables if available
        if (source.dynamicVariables && Object.keys(source.dynamicVariables).length > 0) {
            this.generateDynamicFields(Object.keys(source.dynamicVariables));
            this.fillDynamicVariables(source.dynamicVariables);
            this.els.dynamicSection.style.display = 'block';
        }
        
        // Set up directory fields after static config is rendered
        this.setupDirectoryFields(source);
        
        document.getElementById('testConnectionBtn').disabled = false;
        
        this.els.sourcePopupOverlay.classList.add('show');
        this.els.sourcePopup.classList.add('show');
    }

    fillConfigFields(config) {
        for (const [key, value] of Object.entries(config)) {
            const field = document.getElementById(this.getFieldId(key));
            if (field) {
                field.value = value;
            }
        }
    }

    getFieldId(configKey) {
        const fieldMapping = {
            'path': 'filePath',
            'bucket': 's3Bucket',
            'key': 's3Key',
            'aws_profile': 'awsProfile',
            'region': 's3Region',
            'host': 'sftpHost',
            'port': 'sftpPort',
            'username': 'sftpUsername',
            'key_file': 'sftpKeyFile',
            'share': 'sambaShare',
            'password': 'sambaPassword',
            'url': 'httpUrl',
            'method': 'httpMethod',
            'headers': 'httpHeaders'
        };
        
        // For SFTP, host maps to sftpHost, for Samba it maps to sambaHost
        if (configKey === 'host') {
            const sourceType = this.els.sourceType.value;
            return sourceType === 'sftp' ? 'sftpHost' : 'sambaHost';
        }
        if (configKey === 'username') {
            const sourceType = this.els.sourceType.value;
            return sourceType === 'sftp' ? 'sftpUsername' : 'sambaUsername';
        }
        if (configKey === 'path') {
            const sourceType = this.els.sourceType.value;
            if (sourceType === 'sftp') return 'sftpPath';
            if (sourceType === 'samba') return 'sambaPath';
            return 'filePath';
        }
        
        return fieldMapping[configKey] || configKey;
    }

    fillStaticConfigFields(config) {
        // Skip path-related fields as they're handled by path template
        const pathFields = ['path', 'url', 'key', 'bucket'];
        
        for (const [key, value] of Object.entries(config)) {
            if (!pathFields.includes(key)) {
                const field = document.getElementById(this.getFieldId(key));
                if (field) {
                    field.value = value;
                }
            }
        }
    }

    fillDynamicVariables(dynamicVariables) {
        for (const [key, value] of Object.entries(dynamicVariables)) {
            const field = document.getElementById(`var_${key}`);
            if (field) {
                field.value = value;
            }
        }
    }

    hideSourcePopup() {
        this.els.sourcePopupOverlay.classList.remove('show');
        this.els.sourcePopup.classList.remove('show');
    }

    async updateConfigFields() {
        const sourceType = this.els.sourceType.value;
        if (!sourceType) {
            this.els.staticConfigSection.style.display = 'none';
            this.els.pathSection.style.display = 'none';
            this.els.dynamicSection.style.display = 'none';
            return;
        }

        // Show static config and path sections
        this.els.staticConfigSection.style.display = 'block';
        this.els.pathSection.style.display = 'block';
        
        // Generate static config fields (non-path related)
        this.els.staticConfigFields.innerHTML = await this.generateStaticConfigFields(sourceType);
        
        // Set up directory fields for new sources
        this.setupDirectoryFields();
        
        // Set example path template
        this.setExamplePathTemplate(sourceType);
        
        document.getElementById('testConnectionBtn').disabled = false;
    }

    async generateConfigFields(sourceType) {
        switch (sourceType) {
            case 'local_file':
                return `
                    <div class="form-group">
                        <label for="filePath">File Path</label>
                        <input type="text" id="filePath" name="path" placeholder="/path/to/your/file.txt" required>
                        <div class="config-help">Enter the full path to the local file</div>
                    </div>
                `;
            
            case 's3':
                const profiles = await this.getAwsProfiles();
                const profileOptions = profiles.map(p => 
                    `<option value="${p.name}">${p.name} ${p.region ? `(${p.region})` : ''}</option>`
                ).join('');
                
                return `
                    <div class="form-group">
                        <label for="s3Bucket">S3 Bucket</label>
                        <input type="text" id="s3Bucket" name="bucket" placeholder="my-bucket" required>
                    </div>
                    <div class="form-group">
                        <label for="s3Key">S3 Key/Path</label>
                        <input type="text" id="s3Key" name="key" placeholder="path/to/file.json" required>
                    </div>
                    <div class="form-group">
                        <label for="awsProfile">AWS Profile</label>
                        <select id="awsProfile" name="aws_profile" required>
                            <option value="">Select AWS profile...</option>
                            ${profileOptions}
                        </select>
                        <div class="config-help">Profiles from ~/.aws/credentials</div>
                    </div>
                    <div class="form-group">
                        <label for="s3Region">Region (optional)</label>
                        <input type="text" id="s3Region" name="region" placeholder="us-east-1">
                    </div>
                `;
            
            case 'sftp':
                const sshKeys = await this.getSshKeys();
                const keyOptions = sshKeys.map(k => 
                    `<option value="${k.path}">${k.name} (${k.type})</option>`
                ).join('');
                
                return `
                    <div class="form-group">
                        <label for="sftpHost">Host</label>
                        <input type="text" id="sftpHost" name="host" placeholder="sftp.example.com" required>
                    </div>
                    <div class="form-group">
                        <label for="sftpPort">Port</label>
                        <input type="number" id="sftpPort" name="port" value="22" min="1" max="65535">
                    </div>
                    <div class="form-group">
                        <label for="sftpUsername">Username</label>
                        <input type="text" id="sftpUsername" name="username" placeholder="username" required>
                    </div>
                    <div class="form-group">
                        <label for="sftpKeyFile">SSH Key</label>
                        <select id="sftpKeyFile" name="key_file" required>
                            <option value="">Select SSH key...</option>
                            ${keyOptions}
                        </select>
                        <div class="config-help">SSH keys from ~/.ssh directory</div>
                    </div>
                    <div class="form-group">
                        <label for="sftpPath">Remote Path</label>
                        <input type="text" id="sftpPath" name="path" placeholder="/path/to/file.txt" required>
                    </div>
                `;
            
            case 'samba':
                return `
                    <div class="form-group">
                        <label for="sambaHost">Host/Server</label>
                        <input type="text" id="sambaHost" name="host" placeholder="server.example.com" required>
                    </div>
                    <div class="form-group">
                        <label for="sambaShare">Share Name</label>
                        <input type="text" id="sambaShare" name="share" placeholder="shared_folder" required>
                    </div>
                    <div class="form-group">
                        <label for="sambaUsername">Username</label>
                        <input type="text" id="sambaUsername" name="username" placeholder="username" required>
                    </div>
                    <div class="form-group">
                        <label for="sambaPassword">Password</label>
                        <input type="password" id="sambaPassword" name="password" placeholder="password" required>
                        <div class="config-help">Password will be stored securely</div>
                    </div>
                    <div class="form-group">
                        <label for="sambaPath">File Path (within share)</label>
                        <input type="text" id="sambaPath" name="path" placeholder="folder/file.txt">
                    </div>
                `;
            
            case 'http':
                return `
                    <div class="form-group">
                        <label for="httpUrl">URL</label>
                        <input type="url" id="httpUrl" name="url" placeholder="https://example.com/api/data.json" required>
                    </div>
                    <div class="form-group">
                        <label for="httpMethod">HTTP Method</label>
                        <select id="httpMethod" name="method">
                            <option value="GET">GET</option>
                            <option value="POST">POST</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="httpHeaders">Headers (JSON)</label>
                        <textarea id="httpHeaders" name="headers" placeholder='{"Authorization": "Bearer token"}' rows="3"></textarea>
                        <div class="config-help">Optional: JSON object with HTTP headers</div>
                    </div>
                `;
            
            default:
                return '<div class="config-help">No configuration needed</div>';
        }
    }

    generateDirectoryConfigFields() {
        return `
            <div class="directory-config-section">
                <h4>Directory Configuration</h4>
                <div class="form-group directory-config">
                    <label class="checkbox-label">
                        <input type="checkbox" id="isDirectory" name="is_directory">
                        <span class="checkbox-text">This source points to a directory</span>
                    </label>
                    <div class="config-help">Check if this source represents a directory/folder rather than a single file</div>
                </div>
                <div class="form-group" id="levelGroup" style="display: none;">
                    <label for="level">Directory Level</label>
                    <select id="level" name="level">
                        <option value="0">0 levels (current directory only)</option>
                        <option value="1">1 level deep</option>
                        <option value="2">2 levels deep</option>
                        <option value="3">3 levels deep</option>
                        <option value="4">4 levels deep</option>
                        <option value="5">5 levels deep (maximum)</option>
                    </select>
                    <div class="config-help">How many nested directory levels to traverse (maximum 5)</div>
                </div>
            </div>
        `;
    }

    async generateStaticConfigFields(sourceType) {
        const directoryConfig = this.generateDirectoryConfigFields();
        
        switch (sourceType) {
            case 'local_file':
                return `
                    ${directoryConfig}
                    <div class="config-separator"></div>
                    <div class="config-help">No additional static configuration needed for local files</div>
                `;
            
            case 's3':
                const profiles = await this.getAwsProfiles();
                const profileOptions = profiles.map(p => 
                    `<option value="${p.name}">${p.name} ${p.region ? `(${p.region})` : ''}</option>`
                ).join('');
                
                return `
                    ${directoryConfig}
                    <div class="config-separator"></div>
                    <h4>AWS Configuration</h4>
                    <div class="form-group">
                        <label for="awsProfile">AWS Profile</label>
                        <select id="awsProfile" name="aws_profile" required>
                            <option value="">Select AWS profile...</option>
                            ${profileOptions}
                        </select>
                        <div class="config-help">Profiles from ~/.aws/credentials</div>
                    </div>
                    <div class="form-group">
                        <label for="s3Region">Region (optional)</label>
                        <input type="text" id="s3Region" name="region" placeholder="us-east-1">
                    </div>
                `;
            
            case 'sftp':
                const sshKeys = await this.getSshKeys();
                const keyOptions = sshKeys.map(k => 
                    `<option value="${k.path}">${k.name} (${k.type})</option>`
                ).join('');
                
                return `
                    ${directoryConfig}
                    <div class="config-separator"></div>
                    <h4>SFTP Connection</h4>
                    <div class="form-group">
                        <label for="sftpHost">Host</label>
                        <input type="text" id="sftpHost" name="host" placeholder="sftp.example.com" required>
                    </div>
                    <div class="form-group">
                        <label for="sftpPort">Port</label>
                        <input type="number" id="sftpPort" name="port" value="22" min="1" max="65535">
                    </div>
                    <div class="form-group">
                        <label for="sftpUsername">Username</label>
                        <input type="text" id="sftpUsername" name="username" placeholder="username" required>
                    </div>
                    <div class="form-group">
                        <label for="sftpKeyFile">SSH Key</label>
                        <select id="sftpKeyFile" name="key_file" required>
                            <option value="">Select SSH key...</option>
                            ${keyOptions}
                        </select>
                        <div class="config-help">SSH keys from ~/.ssh directory</div>
                    </div>
                `;
            
            case 'samba':
                return `
                    ${directoryConfig}
                    <div class="config-separator"></div>
                    <h4>Samba/SMB Connection</h4>
                    <div class="form-group">
                        <label for="sambaHost">Host/Server</label>
                        <input type="text" id="sambaHost" name="host" placeholder="server.example.com" required>
                    </div>
                    <div class="form-group">
                        <label for="sambaShare">Share Name</label>
                        <input type="text" id="sambaShare" name="share" placeholder="shared_folder" required>
                    </div>
                    <div class="form-group">
                        <label for="sambaUsername">Username</label>
                        <input type="text" id="sambaUsername" name="username" placeholder="username" required>
                    </div>
                    <div class="form-group">
                        <label for="sambaPassword">Password</label>
                        <input type="password" id="sambaPassword" name="password" placeholder="password" required>
                        <div class="config-help">Password will be stored securely</div>
                    </div>
                `;
            
            case 'http':
                return `
                    ${directoryConfig}
                    <div class="config-separator"></div>
                    <h4>HTTP Configuration</h4>
                    <div class="form-group">
                        <label for="httpMethod">HTTP Method</label>
                        <select id="httpMethod" name="method">
                            <option value="GET">GET</option>
                            <option value="POST">POST</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="httpHeaders">Headers (JSON)</label>
                        <textarea id="httpHeaders" name="headers" placeholder='{"Authorization": "Bearer token"}' rows="3"></textarea>
                        <div class="config-help">Optional: JSON object with HTTP headers</div>
                    </div>
                `;
            
            default:
                return `
                    ${directoryConfig}
                    <div class="config-separator"></div>
                    <div class="config-help">No additional static configuration needed</div>
                `;
        }
    }

    setExamplePathTemplate(sourceType) {
        const examples = {
            'local_file': '/folder/folder2/$file',
            's3': 's3://$bucket/folder/$key',
            'sftp': '/remote/folder/$file',
            'samba': 'folder/$file',
            'http': 'https://api.example.com/$endpoint'
        };
        
        this.els.pathTemplate.placeholder = examples[sourceType] || 'Enter path template with $variables';
    }

    async resolveVariables() {
        const pathTemplate = this.els.pathTemplate.value.trim();
        if (!pathTemplate) {
            this.showError('Please enter a path template first');
            return;
        }

        try {
            const response = await fetch('/api/sources/resolve-variables', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({pathTemplate})
            });

            const result = await response.json();

            if (result.success) {
                if (result.variables.length > 0) {
                    this.generateDynamicFields(result.variables);
                    this.els.dynamicSection.style.display = 'block';
                    this.updateStatus(`Found ${result.variables.length} dynamic variable(s): ${result.variables.join(', ')}`);
                } else {
                    this.els.dynamicSection.style.display = 'none';
                    this.updateStatus('No dynamic variables found in path template');
                }
            } else {
                this.showError('Failed to resolve variables: ' + result.error);
            }
        } catch (error) {
            this.showError('Error resolving variables: ' + error.message);
        }
    }

    generateDynamicFields(variables) {
        const fieldsHtml = variables.map(varName => `
            <div class="form-group">
                <label for="var_${varName}">${varName}</label>
                <input type="text" id="var_${varName}" name="${varName}" placeholder="Enter value for ${varName}" required>
                <div class="config-help">Dynamic variable: $${varName}</div>
            </div>
        `).join('');

        this.els.dynamicFields.innerHTML = fieldsHtml;
    }

    async getAwsProfiles() {
        try {
            const response = await fetch('/api/sources/aws-profiles');
            const result = await response.json();
            return result.profiles || [];
        } catch (error) {
            console.error('Failed to load AWS profiles:', error);
            return [];
        }
    }

    async getSshKeys() {
        try {
            const response = await fetch('/api/sources/ssh-keys');
            const result = await response.json();
            return result.keys || [];
        } catch (error) {
            console.error('Failed to load SSH keys:', error);
            return [];
        }
    }

    async handleFormSubmit(e) {
        e.preventDefault();
        
        try {
            const formData = new FormData(this.els.sourceForm);
            const staticConfig = {};
            const dynamicVariables = {};
            
            // Extract static config and dynamic variables
            for (const [key, value] of formData.entries()) {
                if (key !== 'name' && key !== 'type' && key !== 'is_directory' && key !== 'level') {
                    // Check if this is a dynamic variable (starts with var_ or is in dynamic fields)
                    if (this.els.dynamicFields.querySelector(`[name="${key}"]`)) {
                        dynamicVariables[key] = value;
                    } else {
                        staticConfig[key] = value;
                    }
                }
            }

            const pathTemplate = this.els.pathTemplate.value.trim();
            
            // Get directory values from DOM since they're dynamically created
            const isDirectoryEl = document.getElementById('isDirectory');
            const levelEl = document.getElementById('level');
            const isDirectory = isDirectoryEl ? isDirectoryEl.checked : false;
            const level = isDirectory && levelEl ? parseInt(levelEl.value, 10) || 0 : 0;
            
            const sourceData = {
                name: this.els.sourceName.value,
                type: this.els.sourceType.value,
                staticConfig: staticConfig,
                pathTemplate: pathTemplate,
                dynamicVariables: dynamicVariables,
                is_directory: isDirectory,
                level: level
            };

            const isEdit = this.currentEditingId !== null;
            const url = isEdit ? `/api/sources/${this.currentEditingId}` : '/api/sources';
            const method = isEdit ? 'PUT' : 'POST';

            const response = await fetch(url, {
                method: method,
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(sourceData)
            });

            const result = await response.json();

            if (result.success) {
                const action = isEdit ? 'updated' : 'created';
                this.updateStatus(`Source "${sourceData.name}" ${action} successfully`);
                this.hideSourcePopup();
                this.loadSources();
            } else {
                const action = isEdit ? 'update' : 'create';
                this.showError(`Failed to ${action} source: ` + result.error);
            }
        } catch (error) {
            const action = this.currentEditingId ? 'updating' : 'creating';
            this.showError(`Error ${action} source: ` + error.message);
        }
    }

    async testSource(sourceId) {
        try {
            this.updateStatus('Testing connection...');
            
            const response = await fetch(`/api/sources/${sourceId}/test`, {
                method: 'POST'
            });
            const result = await response.json();
            
            if (result.success) {
                this.updateStatus(`Connection test successful: ${result.message}`);
            } else {
                this.updateStatus(`Connection test failed: ${result.error}`);
            }
            
            // Reload sources to update status
            this.loadSources();
        } catch (error) {
            this.showError('Error testing connection: ' + error.message);
        }
    }

    async testAllSources() {
        for (const source of this.sources) {
            await this.testSource(source.id);
        }
    }

    async deleteSource(sourceId) {
        const source = this.sources.find(s => s.id === sourceId);
        if (!confirm(`Are you sure you want to delete "${source?.name || sourceId}"?`)) {
            return;
        }

        try {
            const response = await fetch(`/api/sources/${sourceId}`, {
                method: 'DELETE'
            });
            const result = await response.json();

            if (result.success) {
                this.updateStatus('Source deleted successfully');
                this.loadSources();
            } else {
                this.showError('Failed to delete source: ' + result.error);
            }
        } catch (error) {
            this.showError('Error deleting source: ' + error.message);
        }
    }

    async duplicateSource(sourceId) {
        try {
            this.updateStatus('Duplicating source...');
            
            const response = await fetch(`/api/sources/${sourceId}/duplicate`, {
                method: 'POST'
            });
            const result = await response.json();

            if (result.success) {
                this.updateStatus('Source duplicated successfully');
                this.loadSources();
            } else {
                this.showError('Failed to duplicate source: ' + result.error);
            }
        } catch (error) {
            this.showError('Error duplicating source: ' + error.message);
        }
    }

    updateStatus(message) {
        this.els.statusText.textContent = message;
    }

    showError(message) {
        this.els.statusText.textContent = `Error: ${message}`;
        console.error(message);
    }

    changeFontSize(delta) {
        this.fontSize = Math.max(8, Math.min(24, this.fontSize + delta));
        this.applyFontSize();
        localStorage.setItem(`${this.toolName}-fontSize`, this.fontSize);
    }

    applyFontSize() {
        document.body.style.fontSize = `${this.fontSize}px`;
    }

    setupDirectoryFields(source = null) {
        // This method is called after the static config HTML is rendered
        setTimeout(() => {
            const isDirectoryEl = document.getElementById('isDirectory');
            const levelGroupEl = document.getElementById('levelGroup');
            const levelEl = document.getElementById('level');
            
            if (isDirectoryEl) {
                // Set up event handler
                isDirectoryEl.onchange = () => this.toggleLevelField();
                
                // Populate values if editing
                if (source) {
                    isDirectoryEl.checked = source.is_directory || false;
                    if (levelEl) {
                        levelEl.value = source.level || '0';
                    }
                }
                
                // Set initial state
                this.toggleLevelField();
            }
        }, 10); // Small delay to ensure DOM is updated
    }

    toggleLevelField() {
        const isDirectoryEl = document.getElementById('isDirectory');
        const levelGroupEl = document.getElementById('levelGroup');
        const levelEl = document.getElementById('level');
        
        if (isDirectoryEl && levelGroupEl) {
            const isDirectoryChecked = isDirectoryEl.checked;
            levelGroupEl.style.display = isDirectoryChecked ? 'block' : 'none';
            
            // Reset level to 0 when unchecking directory
            if (!isDirectoryChecked && levelEl) {
                levelEl.value = '0';
            }
        }
    }

    formatTime(isoString) {
        try {
            return new Date(isoString).toLocaleString();
        } catch {
            return 'unknown';
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}