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
        this.countdownTimer = null;
        
        this.initElements();
        this.attachEvents();
        this.applyFontSize();
        this.loadSources();
        this.startCountdownTimer();
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
                // Load validator counts for each source
                await this.loadValidatorCounts();
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

    async loadValidatorCounts() {
        this.validatorCounts = {};
        for (const source of this.sources) {
            try {
                const response = await fetch(`/api/sources/${source.id}/validators`);
                const result = await response.json();
                if (result.success) {
                    this.validatorCounts[source.id] = result.validators.length;
                } else {
                    this.validatorCounts[source.id] = 0;
                }
            } catch (error) {
                this.validatorCounts[source.id] = 0;
            }
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
                        ${this.renderValidatorCount(source.id)}
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
                    <div class="source-expiry">
                        ${this.renderExpiryInfo(source.expiry)}
                    </div>
                    <div class="source-actions">
                        <button class="source-btn test" onclick="sourcesManager.testSource('${source.id}')">Test</button>
                        <button class="source-btn edit" onclick="sourcesManager.editSource('${source.id}')">Edit</button>
                        <button class="source-btn validator" onclick="sourcesManager.showValidators('${source.id}')">Add Validator</button>
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

    renderValidatorCount(sourceId) {
        const count = this.validatorCounts?.[sourceId] || 0;
        if (count === 0) {
            return '';
        }
        return `<div class="validator-count" onclick="sourcesManager.showValidatorDetails('${sourceId}', event)">
                    ${count} validator${count !== 1 ? 's' : ''}
                </div>`;
    }

    async showValidatorDetails(sourceId, event) {
        event.stopPropagation();
        try {
            const response = await fetch(`/api/sources/${sourceId}/validators`);
            const result = await response.json();

            if (result.success) {
                const validators = result.validators;
                const popup = document.createElement('div');
                popup.className = 'validator-details-popup';
                popup.innerHTML = `
                    <div class="validator-details-content">
                        <div class="validator-details-header">
                            <h3>Validators for Source ${sourceId}</h3>
                            <button onclick="this.parentElement.parentElement.parentElement.remove()">×</button>
                        </div>
                        <div class="validator-details-list">
                            ${validators.map(v => `
                                <div class="validator-detail-item">
                                    <div class="validator-name">${this.escapeHtml(v.name)}</div>
                                    <div class="validator-type">${v.type}</div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
                document.body.appendChild(popup);

                // Position the popup near the click
                const rect = event.target.getBoundingClientRect();
                popup.style.left = Math.min(rect.left, window.innerWidth - 300) + 'px';
                popup.style.top = (rect.bottom + 5) + 'px';

                // Auto-close after 3 seconds
                setTimeout(() => {
                    if (popup.parentElement) {
                        popup.remove();
                    }
                }, 3000);
            }
        } catch (error) {
            console.error('Error loading validator details:', error);
        }
    }

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

    startCountdownTimer() {
        // Clear existing timer
        if (this.countdownTimer) {
            clearInterval(this.countdownTimer);
        }

        // Update countdown every 60 seconds
        this.countdownTimer = setInterval(() => {
            this.updateCountdowns();
        }, 60000);
    }

    updateCountdowns() {
        const expiryElements = document.querySelectorAll('.expiry-status[data-expiry-timestamp]');
        
        expiryElements.forEach(element => {
            const expiryTimestamp = parseInt(element.dataset.expiryTimestamp);
            const expiryTime = new Date(expiryTimestamp * 1000);
            const now = new Date();
            const timeDiff = expiryTime.getTime() - now.getTime();
            
            if (timeDiff <= 0) {
                element.textContent = '⚠️ Expired';
                element.className = 'expiry-status expired';
            } else {
                const countdown = this.formatCountdown(timeDiff);
                const statusClass = timeDiff < 24 * 60 * 60 * 1000 ? 'expiring-soon' : 'expires';
                element.textContent = `⏰ Expires in ${countdown}`;
                element.className = `expiry-status ${statusClass}`;
            }
        });
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

                    // Show info notification for variables found
                    if (typeof showStatusMessage === 'function') {
                        showStatusMessage(`Found ${result.variables.length} dynamic variable(s): ${result.variables.join(', ')}`, 'info', 3000);
                    }
                } else {
                    this.els.dynamicSection.style.display = 'none';
                    this.updateStatus('No dynamic variables found in path template');

                    // Show info notification
                    if (typeof showStatusMessage === 'function') {
                        showStatusMessage('No dynamic variables found in path template', 'info', 2500);
                    }
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
                this.showSuccess(`Source "${sourceData.name}" ${action} successfully`);
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
                this.showSuccess(`Connection test successful: ${result.message}`);
            } else {
                this.showError(`Connection test failed: ${result.error}`);
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
                this.showSuccess('Source deleted successfully');
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
                this.showSuccess('Source duplicated successfully');
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

    showSuccess(message) {
        this.els.statusText.textContent = message;

        // Use the top-right notification system
        if (typeof showStatusMessage === 'function') {
            showStatusMessage(message, 'success', 3000);
        }
    }

    showError(message) {
        this.els.statusText.textContent = `Error: ${message}`;
        console.error(message);

        // Use the top-right notification system
        if (typeof showStatusMessage === 'function') {
            showStatusMessage(message, 'error', 4000);
        }
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

    // ===== VALIDATOR MANAGEMENT METHODS =====

    showValidators(sourceId) {
        this.currentSourceId = sourceId;
        this.loadValidatorTypes();
        this.loadValidators(sourceId);
        this.showValidatorPopup();
    }

    showValidatorPopup() {
        document.getElementById('validatorPopupOverlay').style.display = 'block';
        document.getElementById('validatorPopup').style.display = 'block';
        this.hideValidatorForm();
        this.attachValidatorEvents();
    }

    hideValidatorPopup() {
        document.getElementById('validatorPopupOverlay').style.display = 'none';
        document.getElementById('validatorPopup').style.display = 'none';
        this.hideValidatorForm();
    }

    attachValidatorEvents() {
        // Popup close events
        document.getElementById('validatorPopupClose').onclick = () => this.hideValidatorPopup();
        document.getElementById('validatorPopupOverlay').onclick = () => this.hideValidatorPopup();

        // Add validator button
        document.getElementById('addValidatorBtn').onclick = () => this.showValidatorForm();

        // Cancel buttons
        document.getElementById('cancelValidatorBtn').onclick = () => this.hideValidatorForm();
        document.getElementById('cancelValidatorFormBtn').onclick = () => this.hideValidatorForm();

        // Validator form
        document.getElementById('validatorForm').onsubmit = (e) => this.handleValidatorSubmit(e);

        // Validator type change
        document.getElementById('validatorType').onchange = () => this.updateSchemaHelp();

        // Test validator button
        document.getElementById('testValidatorBtn').onclick = () => this.testValidator();
    }

    async loadValidatorTypes() {
        try {
            const response = await fetch('/api/validators/types');
            const data = await response.json();

            if (data.success) {
                const typeSelect = document.getElementById('validatorType');
                typeSelect.innerHTML = '<option value="">Select validator type...</option>';

                data.types.forEach(type => {
                    const option = document.createElement('option');
                    option.value = type.type;
                    option.textContent = `${type.name}${type.available ? '' : ' (dependencies required)'}`;
                    option.disabled = !type.available;
                    typeSelect.appendChild(option);
                });
            }
        } catch (error) {
            console.error('Error loading validator types:', error);
            this.showError('Error loading validator types');
        }
    }

    async loadValidators(sourceId) {
        try {
            const response = await fetch(`/api/sources/${sourceId}/validators`);
            const data = await response.json();

            if (data.success) {
                this.renderValidatorsList(data.validators);
                document.getElementById('validatorPopupTitle').textContent =
                    `Validators for ${this.getSourceName(sourceId)} (${data.validators.length})`;
            } else {
                this.showError(`Error loading validators: ${data.error}`);
            }
        } catch (error) {
            console.error('Error loading validators:', error);
            this.showError('Error loading validators');
        }
    }

    renderValidatorsList(validators) {
        const validatorsList = document.getElementById('validatorsList');

        if (validators.length === 0) {
            validatorsList.innerHTML = `
                <div class="no-validators">
                    <div class="no-validators-icon">🔍</div>
                    <div class="no-validators-text">No validators configured for this source</div>
                </div>
            `;
            return;
        }

        validatorsList.innerHTML = validators.map(validator => `
            <div class="validator-item">
                <div class="validator-info">
                    <div class="validator-name">${this.escapeHtml(validator.name)}</div>
                    <div class="validator-type">${this.getValidatorTypeDisplay(validator.type)}</div>
                    <div class="validator-details">
                        Created: ${validator.created_at ? new Date(validator.created_at).toLocaleDateString() : 'Unknown'}
                        ${validator.updated_at ? ` • Updated: ${new Date(validator.updated_at).toLocaleDateString()}` : ''}
                    </div>
                </div>
                <div class="validator-actions">
                    <button class="validator-btn test" onclick="sourcesManager.testValidatorById('${validator.validator_id}')">Test</button>
                    <button class="validator-btn edit" onclick="sourcesManager.editValidator('${validator.validator_id}')">Edit</button>
                    <button class="validator-btn delete" onclick="sourcesManager.deleteValidator('${validator.validator_id}')">Delete</button>
                </div>
            </div>
        `).join('');
    }

    showValidatorForm(validatorId = null) {
        this.currentEditingValidatorId = validatorId;
        document.getElementById('validatorFormSection').style.display = 'block';

        if (validatorId) {
            this.loadValidatorForEdit(validatorId);
            document.getElementById('validatorFormTitle').textContent = 'Edit Validator';
        } else {
            this.resetValidatorForm();
            document.getElementById('validatorFormTitle').textContent = 'Add New Validator';
        }
    }

    hideValidatorForm() {
        document.getElementById('validatorFormSection').style.display = 'none';
        this.currentEditingValidatorId = null;
        this.resetValidatorForm();
    }

    resetValidatorForm() {
        document.getElementById('validatorForm').reset();
        document.getElementById('validatorConfigSection').style.display = 'none';
        this.updateSchemaHelp();
    }

    async loadValidatorForEdit(validatorId) {
        try {
            const response = await fetch(`/api/sources/${this.currentSourceId}/validators/${validatorId}`);
            const data = await response.json();

            if (data.success) {
                const validator = data.validator;
                document.getElementById('validatorName').value = validator.name || '';
                document.getElementById('validatorType').value = validator.type || '';
                document.getElementById('validatorSchema').value = validator.schema_content || '';
                this.updateSchemaHelp();
                this.renderValidatorConfig(validator.config || {});
            } else {
                this.showError(`Error loading validator: ${data.error}`);
            }
        } catch (error) {
            console.error('Error loading validator:', error);
            this.showError('Error loading validator');
        }
    }

    updateSchemaHelp() {
        const validatorType = document.getElementById('validatorType').value;
        const helpDiv = document.getElementById('schemaHelp');

        const helpTexts = {
            'json_schema': 'Enter a JSON Schema definition. Example: {"type": "object", "properties": {"name": {"type": "string"}}, "required": ["name"]}',
            'xml_schema': 'Enter an XML Schema (XSD) definition. Must be a complete XSD document with proper namespace declarations.',
            'regex': 'Enter a regular expression pattern. Example: ^[a-zA-Z0-9]+$ (for alphanumeric strings)'
        };

        helpDiv.textContent = helpTexts[validatorType] || 'Select a validator type to see format help';

        // Show/hide config section based on type
        const configSection = document.getElementById('validatorConfigSection');
        if (validatorType === 'regex') {
            configSection.style.display = 'block';
            this.renderRegexConfig();
        } else {
            configSection.style.display = 'none';
        }
    }

    renderRegexConfig() {
        const configFields = document.getElementById('validatorConfigFields');
        configFields.innerHTML = `
            <div class="validator-config-field">
                <label>
                    <input type="checkbox" id="configIgnoreCase"> Ignore case
                </label>
            </div>
            <div class="validator-config-field">
                <label>
                    <input type="checkbox" id="configMultiline"> Multiline mode
                </label>
            </div>
            <div class="validator-config-field">
                <label>
                    <input type="checkbox" id="configDotall"> Dot matches newline
                </label>
            </div>
            <div class="validator-config-field">
                <label>Match type:</label>
                <select id="configMatchType">
                    <option value="search">Search (default)</option>
                    <option value="match">Match from start</option>
                    <option value="fullmatch">Full match</option>
                </select>
            </div>
            <div class="validator-config-field">
                <label>
                    <input type="checkbox" id="configExpectMatch" checked> Expect match (unchecked = should NOT match)
                </label>
            </div>
        `;
    }

    renderValidatorConfig(config) {
        const validatorType = document.getElementById('validatorType').value;

        if (validatorType === 'regex') {
            document.getElementById('configIgnoreCase').checked = config.ignore_case || false;
            document.getElementById('configMultiline').checked = config.multiline || false;
            document.getElementById('configDotall').checked = config.dotall || false;
            document.getElementById('configMatchType').value = config.match_type || 'search';
            document.getElementById('configExpectMatch').checked = config.expect_match !== false;
        }
    }

    collectValidatorConfig() {
        const validatorType = document.getElementById('validatorType').value;
        const config = {};

        if (validatorType === 'regex') {
            config.ignore_case = document.getElementById('configIgnoreCase').checked;
            config.multiline = document.getElementById('configMultiline').checked;
            config.dotall = document.getElementById('configDotall').checked;
            config.match_type = document.getElementById('configMatchType').value;
            config.expect_match = document.getElementById('configExpectMatch').checked;
        }

        return config;
    }

    async handleValidatorSubmit(event) {
        event.preventDefault();

        const name = document.getElementById('validatorName').value.trim();
        const type = document.getElementById('validatorType').value;
        const schemaContent = document.getElementById('validatorSchema').value.trim();

        if (!name || !type || !schemaContent) {
            this.showError('Please fill in all required fields');
            return;
        }

        const config = this.collectValidatorConfig();

        const validatorData = {
            name,
            type,
            schema_content: schemaContent,
            config
        };

        try {
            let url, method;
            if (this.currentEditingValidatorId) {
                url = `/api/sources/${this.currentSourceId}/validators/${this.currentEditingValidatorId}`;
                method = 'PUT';
            } else {
                url = `/api/sources/${this.currentSourceId}/validators`;
                method = 'POST';
            }

            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(validatorData)
            });

            const data = await response.json();

            if (data.success) {
                this.showSuccess(this.currentEditingValidatorId ? 'Validator updated successfully' : 'Validator created successfully');
                this.hideValidatorForm();
                this.loadValidators(this.currentSourceId);
            } else {
                this.showError(`Error: ${data.error}`);
            }
        } catch (error) {
            console.error('Error saving validator:', error);
            this.showError('Error saving validator');
        }
    }

    async deleteValidator(validatorId) {
        if (!confirm('Are you sure you want to delete this validator?')) {
            return;
        }

        try {
            const response = await fetch(`/api/sources/${this.currentSourceId}/validators/${validatorId}`, {
                method: 'DELETE'
            });

            const data = await response.json();

            if (data.success) {
                this.showSuccess('Validator deleted successfully');
                this.loadValidators(this.currentSourceId);
            } else {
                this.showError(`Error deleting validator: ${data.error}`);
            }
        } catch (error) {
            console.error('Error deleting validator:', error);
            this.showError('Error deleting validator');
        }
    }

    editValidator(validatorId) {
        this.showValidatorForm(validatorId);
    }

    async testValidator() {
        const sampleData = prompt('Enter sample data to test the validator against:');
        if (!sampleData) return;

        const name = document.getElementById('validatorName').value.trim();
        const type = document.getElementById('validatorType').value;
        const schemaContent = document.getElementById('validatorSchema').value.trim();

        if (!type || !schemaContent) {
            this.showError('Please select a validator type and enter schema content');
            return;
        }

        const config = this.collectValidatorConfig();

        try {
            // Create a temporary validator for testing
            const tempValidatorData = {
                name: name || 'Test Validator',
                type,
                schema_content: schemaContent,
                config
            };

            const createResponse = await fetch(`/api/sources/${this.currentSourceId}/validators`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(tempValidatorData)
            });

            const createData = await createResponse.json();

            if (!createData.success) {
                this.showError(`Error creating test validator: ${createData.error}`);
                return;
            }

            const tempValidatorId = createData.validator_id;

            // Test the validator
            const testResponse = await fetch(`/api/sources/${this.currentSourceId}/validate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    data: sampleData,
                    validator_id: tempValidatorId
                })
            });

            const testData = await testResponse.json();

            // Clean up the temporary validator
            await fetch(`/api/sources/${this.currentSourceId}/validators/${tempValidatorId}`, {
                method: 'DELETE'
            });

            if (testData.success) {
                const result = testData.validation.validation_results[0];
                if (result.valid) {
                    this.showSuccess('✅ Validation passed!');
                } else {
                    this.showError(`❌ Validation failed: ${result.errors.join(', ')}`);
                }
            } else {
                this.showError(`Error testing validator: ${testData.error}`);
            }

        } catch (error) {
            console.error('Error testing validator:', error);
            this.showError('Error testing validator');
        }
    }

    async testValidatorById(validatorId) {
        const sampleData = prompt('Enter sample data to test this validator against:');
        if (!sampleData) return;

        try {
            const response = await fetch(`/api/sources/${this.currentSourceId}/validate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    data: sampleData,
                    validator_id: validatorId
                })
            });

            const data = await response.json();

            if (data.success) {
                const result = data.validation.validation_results[0];
                if (result.valid) {
                    this.showSuccess('✅ Validation passed!');
                } else {
                    this.showError(`❌ Validation failed: ${result.errors.join(', ')}`);
                }
            } else {
                this.showError(`Error testing validator: ${data.error}`);
            }
        } catch (error) {
            console.error('Error testing validator:', error);
            this.showError('Error testing validator');
        }
    }

    getValidatorTypeDisplay(type) {
        const displays = {
            'json_schema': 'JSON Schema',
            'xml_schema': 'XML Schema (XSD)',
            'regex': 'Regular Expression'
        };
        return displays[type] || type;
    }

    getSourceName(sourceId) {
        const source = this.sources.find(s => s.id === sourceId);
        return source ? source.name : 'Unknown Source';
    }
}