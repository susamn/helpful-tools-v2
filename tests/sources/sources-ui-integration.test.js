/**
 * Sources Manager UI Integration Test Suite
 * Tests for form interactions, UI state management, and user workflows
 */

// Test framework and utilities
class UITestRunner {
    constructor() {
        this.tests = [];
        this.passed = 0;
        this.failed = 0;
    }

    test(description, testFunction) {
        this.tests.push({ description, testFunction });
    }

    async run() {
        console.log('🧪 Running Sources Manager UI Integration Tests\n');
        
        for (const test of this.tests) {
            try {
                await test.testFunction();
                console.log(`✅ ${test.description}`);
                this.passed++;
            } catch (error) {
                console.log(`❌ ${test.description}`);
                console.log(`   Error: ${error.message}\n`);
                this.failed++;
            }
        }

        console.log(`\n📊 Test Results: ${this.passed} passed, ${this.failed} failed`);
        return this.failed === 0;
    }
}

// Enhanced Mock DOM with more realistic behavior
class EnhancedMockDOM {
    constructor() {
        this.elements = new Map();
        this.eventListeners = new Map();
        this.fetchMocks = new Map();
        this.currentState = {
            popupVisible: false,
            dynamicSectionVisible: false,
            formData: {}
        };
    }

    getElementById(id) {
        if (!this.elements.has(id)) {
            const element = {
                id,
                value: '',
                textContent: '',
                innerHTML: '',
                onclick: null,
                onchange: null,
                onsubmit: null,
                checked: false,
                style: { display: 'none' },
                classList: {
                    add: (className) => element._classes = (element._classes || []).concat(className),
                    remove: (className) => element._classes = (element._classes || []).filter(c => c !== className),
                    toggle: (className) => element.classList.contains(className) 
                        ? element.classList.remove(className) 
                        : element.classList.add(className),
                    contains: (className) => (element._classes || []).includes(className)
                },
                _classes: [],
                addEventListener: (event, handler) => this.addEventListener(id, event, handler),
                appendChild: function(child) { this.children = (this.children || []).concat(child); },
                removeChild: function(child) { this.children = (this.children || []).filter(c => c !== child); },
                children: []
            };

            // Special behaviors for specific elements
            if (id === 'sourcePopup' || id === 'sourcePopupOverlay') {
                Object.defineProperty(element.style, 'display', {
                    get: () => this.currentState.popupVisible ? 'block' : 'none',
                    set: (value) => { this.currentState.popupVisible = (value === 'block'); }
                });
            }

            if (id === 'dynamicSection') {
                Object.defineProperty(element.style, 'display', {
                    get: () => this.currentState.dynamicSectionVisible ? 'block' : 'none',
                    set: (value) => { this.currentState.dynamicSectionVisible = (value === 'block'); }
                });
            }

            this.elements.set(id, element);
        }
        return this.elements.get(id);
    }

    addEventListener(elementId, event, handler) {
        const key = `${elementId}_${event}`;
        if (!this.eventListeners.has(key)) {
            this.eventListeners.set(key, []);
        }
        this.eventListeners.get(key).push(handler);
    }

    triggerEvent(elementId, event, eventData = {}) {
        const key = `${elementId}_${event}`;
        const handlers = this.eventListeners.get(key) || [];
        handlers.forEach(handler => {
            try {
                handler({ ...eventData, preventDefault: () => {} });
            } catch (error) {
                console.error(`Error in event handler: ${error.message}`);
            }
        });
    }

    // Mock fetch with realistic responses
    fetch(url, options = {}) {
        if (this.fetchMocks.has(url)) {
            const mockResponse = this.fetchMocks.get(url);
            return Promise.resolve({
                ok: true,
                status: 200,
                json: () => Promise.resolve(mockResponse)
            });
        }
        return Promise.reject(new Error(`No mock for URL: ${url}`));
    }

    setFetchMock(url, response) {
        this.fetchMocks.set(url, response);
    }

    // Simulate user interactions
    simulateUserInput(elementId, value) {
        const element = this.getElementById(elementId);
        element.value = value;
        this.triggerEvent(elementId, 'change');
    }

    simulateClick(elementId) {
        const element = this.getElementById(elementId);
        if (element.onclick) {
            element.onclick();
        }
        this.triggerEvent(elementId, 'click');
    }

    simulateFormSubmit(formId) {
        this.triggerEvent(formId, 'submit');
    }
}

// Mock SourcesManager with UI integration
class UIIntegratedSourcesManager {
    constructor(mockDOM) {
        this.mockDOM = mockDOM;
        this.toolName = 'sources';
        this.sources = [];
        this.currentEditingId = null;
        this.statusHistory = [];
        
        // Override fetch to use mock
        global.fetch = mockDOM.fetch.bind(mockDOM);
        
        this.initElements();
        this.attachEvents();
    }

    initElements() {
        const elementIds = [
            'sourcesList', 'sourcesCount', 'statusText', 'connectionInfo',
            'sourcePopup', 'sourcePopupOverlay', 'sourcePopupTitle', 'sourceForm',
            'sourceName', 'sourceType', 'staticConfigSection', 'staticConfigFields',
            'pathSection', 'pathTemplate', 'dynamicSection', 'dynamicFields',
            'addSourceBtn', 'refreshBtn', 'testAllBtn', 'resolveBtn', 'cancelBtn',
            'testConnectionBtn'
        ];

        this.els = {};
        elementIds.forEach(id => {
            this.els[id] = this.mockDOM.getElementById(id);
        });
    }

    attachEvents() {
        // Attach event handlers to mock elements
        this.els.addSourceBtn.onclick = () => this.showAddSourcePopup();
        this.els.refreshBtn.onclick = () => this.loadSources();
        this.els.testAllBtn.onclick = () => this.testAllSources();
        this.els.sourcePopupOverlay.onclick = () => this.hideSourcePopup();
        this.els.cancelBtn.onclick = () => this.hideSourcePopup();
        this.els.resolveBtn.onclick = () => this.resolveVariables();
        this.els.sourceType.onchange = () => this.updateConfigFields();
        this.els.sourceForm.onsubmit = (e) => this.handleFormSubmit(e);
    }

    // UI State Management
    showAddSourcePopup() {
        this.currentEditingId = null;
        this.els.sourcePopupTitle.textContent = 'Add New Source';
        this.els.sourcePopup.style.display = 'block';
        this.els.sourcePopupOverlay.style.display = 'block';
        this.resetForm();
        this.updateStatus('Ready to add new source');
    }

    showEditSourcePopup(source) {
        this.currentEditingId = source.id;
        this.els.sourcePopupTitle.textContent = 'Edit Source';
        this.els.sourcePopup.style.display = 'block';
        this.els.sourcePopupOverlay.style.display = 'block';
        this.populateForm(source);
        this.updateStatus(`Editing source: ${source.name}`);
    }

    hideSourcePopup() {
        this.els.sourcePopup.style.display = 'none';
        this.els.sourcePopupOverlay.style.display = 'none';
        this.els.dynamicSection.style.display = 'none';
        this.resetForm();
        this.updateStatus('Ready');
    }

    resetForm() {
        this.els.sourceName.value = '';
        this.els.sourceType.value = '';
        this.els.pathTemplate.value = '';
        this.els.staticConfigFields.innerHTML = '';
        this.els.dynamicFields.innerHTML = '';
        this.els.staticConfigSection.style.display = 'none';
        this.els.pathSection.style.display = 'none';
        this.els.dynamicSection.style.display = 'none';
    }

    populateForm(source) {
        this.els.sourceName.value = source.name || '';
        this.els.sourceType.value = source.type || '';
        this.els.pathTemplate.value = source.pathTemplate || '';
        
        // Show relevant sections
        this.updateConfigFields();
        
        if (source.pathTemplate) {
            this.els.pathSection.style.display = 'block';
        }
        
        if (source.dynamicVariables && Object.keys(source.dynamicVariables).length > 0) {
            this.generateDynamicFields(Object.keys(source.dynamicVariables));
            this.els.dynamicSection.style.display = 'block';
            
            // Populate dynamic variable values
            Object.entries(source.dynamicVariables).forEach(([key, value]) => {
                const input = this.mockDOM.getElementById(`var_${key}`);
                if (input) {
                    input.value = value;
                }
            });
        }
    }

    updateConfigFields() {
        const sourceType = this.els.sourceType.value;
        
        if (!sourceType) {
            this.els.staticConfigSection.style.display = 'none';
            this.els.pathSection.style.display = 'none';
            return;
        }
        
        // Show static config section
        this.els.staticConfigSection.style.display = 'block';
        this.els.pathSection.style.display = 'block';
        
        // Generate type-specific configuration fields
        this.generateStaticConfigFields(sourceType);
    }

    generateStaticConfigFields(sourceType) {
        let fieldsHtml = '';
        
        switch (sourceType) {
            case 's3':
                fieldsHtml = `
                    <div class="form-group">
                        <label for="awsProfile">AWS Profile</label>
                        <select id="awsProfile" name="profile">
                            <option value="default">default</option>
                            <option value="prod">prod</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="awsRegion">AWS Region</label>
                        <input type="text" id="awsRegion" name="region" value="us-east-1">
                    </div>
                `;
                break;
            case 'sftp':
                fieldsHtml = `
                    <div class="form-group">
                        <label for="sftpHost">Host</label>
                        <input type="text" id="sftpHost" name="host" placeholder="ftp.example.com">
                    </div>
                    <div class="form-group">
                        <label for="sftpPort">Port</label>
                        <input type="number" id="sftpPort" name="port" value="22">
                    </div>
                    <div class="form-group">
                        <label for="sftpUsername">Username</label>
                        <input type="text" id="sftpUsername" name="username">
                    </div>
                `;
                break;
            case 'http':
                fieldsHtml = `
                    <div class="form-group">
                        <label for="httpMethod">Method</label>
                        <select id="httpMethod" name="method">
                            <option value="GET">GET</option>
                            <option value="POST">POST</option>
                        </select>
                    </div>
                `;
                break;
        }
        
        this.els.staticConfigFields.innerHTML = fieldsHtml;
    }

    async resolveVariables() {
        const pathTemplate = this.els.pathTemplate.value.trim();
        if (!pathTemplate) {
            this.updateStatus('Please enter a path template first', 'error');
            return;
        }

        try {
            this.updateStatus('Resolving variables...');
            
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
                    this.updateStatus(`Found ${result.variables.length} dynamic variable(s): ${result.variables.join(', ')}`, 'success');
                } else {
                    this.els.dynamicSection.style.display = 'none';
                    this.updateStatus('No dynamic variables found in path template', 'info');
                }
            } else {
                this.updateStatus('Failed to resolve variables: ' + result.error, 'error');
            }
        } catch (error) {
            this.updateStatus('Error resolving variables: ' + error.message, 'error');
        }
    }

    generateDynamicFields(variables) {
        const fieldsHtml = variables.map(varName => {
            // Create mock input element
            const inputId = `var_${varName}`;
            const mockInput = this.mockDOM.getElementById(inputId);
            mockInput.placeholder = `Enter value for ${varName}`;
            mockInput.name = varName;
            
            return `
                <div class="form-group">
                    <label for="${inputId}">${varName}</label>
                    <input type="text" id="${inputId}" name="${varName}" placeholder="Enter value for ${varName}" required>
                    <div class="config-help">Dynamic variable: $${varName}</div>
                </div>
            `;
        }).join('');

        this.els.dynamicFields.innerHTML = fieldsHtml;
        return fieldsHtml;
    }

    collectFormData() {
        const formData = {
            name: this.els.sourceName.value,
            type: this.els.sourceType.value,
            staticConfig: {},
            pathTemplate: this.els.pathTemplate.value,
            dynamicVariables: {}
        };

        // Collect static config based on type
        const sourceType = formData.type;
        if (sourceType === 's3') {
            const profileEl = this.mockDOM.getElementById('awsProfile');
            const regionEl = this.mockDOM.getElementById('awsRegion');
            if (profileEl) formData.staticConfig.profile = profileEl.value;
            if (regionEl) formData.staticConfig.region = regionEl.value;
        } else if (sourceType === 'sftp') {
            const hostEl = this.mockDOM.getElementById('sftpHost');
            const portEl = this.mockDOM.getElementById('sftpPort');
            const usernameEl = this.mockDOM.getElementById('sftpUsername');
            if (hostEl) formData.staticConfig.host = hostEl.value;
            if (portEl) formData.staticConfig.port = portEl.value;
            if (usernameEl) formData.staticConfig.username = usernameEl.value;
        }

        // Collect dynamic variables
        const dynamicInputs = this.els.dynamicFields.innerHTML.match(/id="var_(\w+)"/g) || [];
        dynamicInputs.forEach(match => {
            const varName = match.match(/var_(\w+)/)[1];
            const input = this.mockDOM.getElementById(`var_${varName}`);
            if (input && input.value) {
                formData.dynamicVariables[varName] = input.value;
            }
        });

        return formData;
    }

    async handleFormSubmit(event) {
        event.preventDefault();
        
        try {
            const formData = this.collectFormData();
            
            // Validate form data
            const errors = this.validateFormData(formData);
            if (errors.length > 0) {
                this.updateStatus(`Validation errors: ${errors.join(', ')}`, 'error');
                return;
            }

            // Submit form
            const isUpdate = !!this.currentEditingId;
            const url = isUpdate ? `/api/sources/${this.currentEditingId}` : '/api/sources';
            const method = isUpdate ? 'PUT' : 'POST';

            const response = await fetch(url, {
                method,
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(formData)
            });

            const result = await response.json();

            if (result.success) {
                this.updateStatus(`Source ${isUpdate ? 'updated' : 'created'} successfully`, 'success');
                this.hideSourcePopup();
                await this.loadSources();
            } else {
                this.updateStatus(`Failed to ${isUpdate ? 'update' : 'create'} source: ${result.error}`, 'error');
            }
        } catch (error) {
            this.updateStatus(`Error submitting form: ${error.message}`, 'error');
        }
    }

    validateFormData(formData) {
        const errors = [];
        
        if (!formData.name?.trim()) {
            errors.push('Source name is required');
        }
        
        if (!formData.type?.trim()) {
            errors.push('Source type is required');
        }
        
        if (formData.pathTemplate && formData.pathTemplate.includes('$')) {
            const variables = this.extractVariablesFromTemplate(formData.pathTemplate);
            if (variables.length > 0 && Object.keys(formData.dynamicVariables).length === 0) {
                errors.push('Dynamic variables are required when using path template with variables');
            }
            
            variables.forEach(variable => {
                if (!formData.dynamicVariables[variable]) {
                    errors.push(`Value required for dynamic variable: ${variable}`);
                }
            });
        }
        
        return errors;
    }

    extractVariablesFromTemplate(template) {
        const regex = /\$(\w+)/g;
        const variables = [];
        let match;
        while ((match = regex.exec(template)) !== null) {
            variables.push(match[1]);
        }
        return variables;
    }

    async loadSources() {
        try {
            this.updateStatus('Loading sources...');
            
            const response = await fetch('/api/sources');
            const sources = await response.json();
            
            this.sources = Array.isArray(sources) ? sources : [];
            this.displaySources();
            this.updateStatus(`Loaded ${this.sources.length} sources`);
            this.els.connectionInfo.textContent = `${this.sources.length} sources configured`;
        } catch (error) {
            this.updateStatus('Error loading sources: ' + error.message, 'error');
        }
    }

    displaySources() {
        this.els.sourcesCount.textContent = `${this.sources.length} source${this.sources.length !== 1 ? 's' : ''}`;
        
        if (this.sources.length === 0) {
            this.els.sourcesList.innerHTML = '<div class="no-sources">No data sources configured</div>';
        } else {
            const sourcesHtml = this.sources.map(source => `
                <div class="source-item" data-id="${source.id}">
                    <div class="source-header">
                        <span class="source-name">${source.name}</span>
                        <span class="source-id">${source.id.substring(0, 8)}</span>
                    </div>
                    <div class="source-type">${source.type}</div>
                    <div class="source-config">${source.pathTemplate || JSON.stringify(source.config)}</div>
                </div>
            `).join('');
            
            this.els.sourcesList.innerHTML = sourcesHtml;
        }
    }

    async testAllSources() {
        this.updateStatus(`Testing ${this.sources.length} sources...`);
        // Mock implementation
        setTimeout(() => {
            this.updateStatus('All sources tested', 'success');
        }, 1000);
    }

    updateStatus(message, type = 'info') {
        this.statusHistory.push({ message, type, timestamp: Date.now() });
        this.els.statusText.textContent = message;
        
        // Add visual indication of status type
        this.els.statusText.className = `status-${type}`;
    }

    getStatusHistory() {
        return this.statusHistory;
    }
}

// Test Suite
const runner = new UITestRunner();
const mockDOM = new EnhancedMockDOM();

// Test: Popup Show/Hide
runner.test('Should show and hide add source popup correctly', () => {
    const manager = new UIIntegratedSourcesManager(mockDOM);
    
    // Initially hidden
    if (manager.els.sourcePopup.style.display !== 'none') {
        throw new Error('Popup should be initially hidden');
    }
    
    // Show popup
    manager.showAddSourcePopup();
    if (manager.els.sourcePopup.style.display !== 'block') {
        throw new Error('Popup should be visible after showAddSourcePopup');
    }
    if (manager.els.sourcePopupTitle.textContent !== 'Add New Source') {
        throw new Error('Popup title should be set correctly');
    }
    
    // Hide popup
    manager.hideSourcePopup();
    if (manager.els.sourcePopup.style.display !== 'none') {
        throw new Error('Popup should be hidden after hideSourcePopup');
    }
});

runner.test('Should populate form correctly when editing source', () => {
    const manager = new UIIntegratedSourcesManager(mockDOM);
    
    const testSource = {
        id: 'test-123',
        name: 'Test Source',
        type: 's3',
        pathTemplate: 's3://$bucket/$key',
        dynamicVariables: { bucket: 'my-bucket', key: 'data.json' },
        staticConfig: { region: 'us-west-2', profile: 'prod' }
    };
    
    manager.showEditSourcePopup(testSource);
    
    if (manager.els.sourceName.value !== 'Test Source') {
        throw new Error('Source name should be populated');
    }
    if (manager.els.sourceType.value !== 's3') {
        throw new Error('Source type should be populated');
    }
    if (manager.els.pathTemplate.value !== 's3://$bucket/$key') {
        throw new Error('Path template should be populated');
    }
    if (manager.currentEditingId !== 'test-123') {
        throw new Error('Current editing ID should be set');
    }
});

// Test: Form Field Generation
runner.test('Should generate correct static config fields for S3', () => {
    const manager = new UIIntegratedSourcesManager(mockDOM);
    
    manager.els.sourceType.value = 's3';
    manager.updateConfigFields();
    
    const configHtml = manager.els.staticConfigFields.innerHTML;
    if (!configHtml.includes('AWS Profile')) {
        throw new Error('Should generate AWS Profile field for S3');
    }
    if (!configHtml.includes('AWS Region')) {
        throw new Error('Should generate AWS Region field for S3');
    }
    if (manager.els.staticConfigSection.style.display !== 'block') {
        throw new Error('Static config section should be visible');
    }
});

runner.test('Should generate correct static config fields for SFTP', () => {
    const manager = new UIIntegratedSourcesManager(mockDOM);
    
    manager.els.sourceType.value = 'sftp';
    manager.updateConfigFields();
    
    const configHtml = manager.els.staticConfigFields.innerHTML;
    if (!configHtml.includes('Host')) {
        throw new Error('Should generate Host field for SFTP');
    }
    if (!configHtml.includes('Port')) {
        throw new Error('Should generate Port field for SFTP');
    }
    if (!configHtml.includes('Username')) {
        throw new Error('Should generate Username field for SFTP');
    }
});

// Test: Dynamic Variable Resolution UI
runner.test('Should handle resolve variables UI workflow correctly', async () => {
    const manager = new UIIntegratedSourcesManager(mockDOM);
    
    // Set up mock API response
    mockDOM.setFetchMock('/api/sources/resolve-variables', {
        success: true,
        variables: ['bucket', 'folder', 'file']
    });
    
    // Set path template
    manager.els.pathTemplate.value = 's3://$bucket/$folder/$file';
    
    // Resolve variables
    await manager.resolveVariables();
    
    // Check dynamic section is visible
    if (manager.els.dynamicSection.style.display !== 'block') {
        throw new Error('Dynamic section should be visible after resolving variables');
    }
    
    // Check fields were generated
    const fieldsHtml = manager.els.dynamicFields.innerHTML;
    if (!fieldsHtml.includes('var_bucket')) {
        throw new Error('Should generate field for bucket variable');
    }
    if (!fieldsHtml.includes('var_folder')) {
        throw new Error('Should generate field for folder variable');
    }
    if (!fieldsHtml.includes('var_file')) {
        throw new Error('Should generate field for file variable');
    }
    
    // Check status was updated
    const history = manager.getStatusHistory();
    const lastStatus = history[history.length - 1];
    if (!lastStatus.message.includes('Found 3 dynamic variable(s)')) {
        throw new Error('Status should indicate variables found');
    }
});

runner.test('Should handle empty path template gracefully', async () => {
    const manager = new UIIntegratedSourcesManager(mockDOM);
    
    // Empty path template
    manager.els.pathTemplate.value = '';
    
    // Try to resolve variables
    await manager.resolveVariables();
    
    // Check status shows error
    const history = manager.getStatusHistory();
    const lastStatus = history[history.length - 1];
    if (!lastStatus.message.includes('Please enter a path template first')) {
        throw new Error('Should show error for empty path template');
    }
    if (lastStatus.type !== 'error') {
        throw new Error('Status type should be error');
    }
});

// Test: Form Data Collection
runner.test('Should collect form data correctly', () => {
    const manager = new UIIntegratedSourcesManager(mockDOM);
    
    // Set up form data
    manager.els.sourceName.value = 'Test Collection';
    manager.els.sourceType.value = 's3';
    manager.els.pathTemplate.value = 's3://$bucket/$key';
    
    // Generate and populate dynamic fields
    manager.generateDynamicFields(['bucket', 'key']);
    mockDOM.getElementById('var_bucket').value = 'test-bucket';
    mockDOM.getElementById('var_key').value = 'test-key';
    
    // Collect data
    const formData = manager.collectFormData();
    
    if (formData.name !== 'Test Collection') {
        throw new Error('Should collect source name');
    }
    if (formData.type !== 's3') {
        throw new Error('Should collect source type');
    }
    if (formData.pathTemplate !== 's3://$bucket/$key') {
        throw new Error('Should collect path template');
    }
    if (formData.dynamicVariables.bucket !== 'test-bucket') {
        throw new Error('Should collect bucket dynamic variable');
    }
    if (formData.dynamicVariables.key !== 'test-key') {
        throw new Error('Should collect key dynamic variable');
    }
});

// Test: Form Validation in UI Context
runner.test('Should validate form and show errors in UI', async () => {
    const manager = new UIIntegratedSourcesManager(mockDOM);
    
    // Set up invalid form data (missing required fields)
    manager.els.sourceName.value = '';
    manager.els.sourceType.value = 's3';
    manager.els.pathTemplate.value = 's3://$bucket/$key';
    
    // Try to submit form
    await manager.handleFormSubmit({ preventDefault: () => {} });
    
    // Check that error status was set
    const history = manager.getStatusHistory();
    const lastStatus = history[history.length - 1];
    if (!lastStatus.message.includes('Validation errors')) {
        throw new Error('Should show validation errors in status');
    }
    if (lastStatus.type !== 'error') {
        throw new Error('Status type should be error for validation failure');
    }
});

// Test: Complete User Workflow
runner.test('Should handle complete add source workflow', async () => {
    const manager = new UIIntegratedSourcesManager(mockDOM);
    
    // Mock API responses
    mockDOM.setFetchMock('/api/sources/resolve-variables', {
        success: true,
        variables: ['environment', 'service']
    });
    
    mockDOM.setFetchMock('/api/sources', {
        success: true,
        id: 'new-source-123'
    });
    
    mockDOM.setFetchMock('/api/sources', []); // For loadSources
    
    // 1. Show add popup
    manager.showAddSourcePopup();
    if (manager.els.sourcePopupTitle.textContent !== 'Add New Source') {
        throw new Error('Step 1: Add popup should show correct title');
    }
    
    // 2. Fill form
    manager.els.sourceName.value = 'Production Logs';
    manager.els.sourceType.value = 'local_file';
    manager.updateConfigFields();
    
    // 3. Set path template
    manager.els.pathTemplate.value = '/logs/$environment/$service.log';
    
    // 4. Resolve variables
    await manager.resolveVariables();
    if (manager.els.dynamicSection.style.display !== 'block') {
        throw new Error('Step 4: Dynamic section should be visible');
    }
    
    // 5. Fill dynamic variables
    mockDOM.getElementById('var_environment').value = 'prod';
    mockDOM.getElementById('var_service').value = 'api';
    
    // 6. Submit form
    await manager.handleFormSubmit({ preventDefault: () => {} });
    
    // Check success status
    const history = manager.getStatusHistory();
    const lastStatus = history[history.length - 1];
    if (!lastStatus.message.includes('Source created successfully')) {
        throw new Error('Step 6: Should show success message');
    }
    
    // Check popup is hidden
    if (manager.els.sourcePopup.style.display !== 'none') {
        throw new Error('Step 6: Popup should be hidden after successful submission');
    }
});

// Test: Error Handling
runner.test('Should handle API errors gracefully', async () => {
    const manager = new UIIntegratedSourcesManager(mockDOM);
    
    // Mock API error for resolve variables
    mockDOM.setFetchMock('/api/sources/resolve-variables', {
        success: false,
        error: 'Invalid path template'
    });
    
    manager.els.pathTemplate.value = '/invalid/$template';
    
    await manager.resolveVariables();
    
    const history = manager.getStatusHistory();
    const lastStatus = history[history.length - 1];
    if (!lastStatus.message.includes('Failed to resolve variables')) {
        throw new Error('Should show API error in status');
    }
    if (lastStatus.type !== 'error') {
        throw new Error('Status type should be error for API failure');
    }
});

// Test: Status History Tracking
runner.test('Should track status history correctly', () => {
    const manager = new UIIntegratedSourcesManager(mockDOM);
    
    manager.updateStatus('First message', 'info');
    manager.updateStatus('Second message', 'success');
    manager.updateStatus('Third message', 'error');
    
    const history = manager.getStatusHistory();
    
    if (history.length !== 3) {
        throw new Error('Should track all status updates');
    }
    
    if (history[0].message !== 'First message' || history[0].type !== 'info') {
        throw new Error('Should track first status correctly');
    }
    
    if (history[2].message !== 'Third message' || history[2].type !== 'error') {
        throw new Error('Should track latest status correctly');
    }
    
    // Check timestamps are present and increasing
    if (!history[0].timestamp || !history[1].timestamp || history[0].timestamp > history[1].timestamp) {
        throw new Error('Should track timestamps correctly');
    }
});

// Run tests
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { UITestRunner, EnhancedMockDOM, UIIntegratedSourcesManager };
    
    if (require.main === module) {
        runner.run().then(success => {
            process.exit(success ? 0 : 1);
        });
    }
} else {
    runner.run().then(success => {
        console.log(success ? '🎉 All UI tests passed!' : '💥 Some UI tests failed!');
    });
}