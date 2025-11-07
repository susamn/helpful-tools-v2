/**
 * Sources Manager UI Integration Test Suite - Jest Version
 */

const { describe, test, expect, beforeEach } = require('@jest/globals');

// Mock DOM - simplified for Jest
class MockDOM {
    constructor() {
        this.elements = new Map();
        this.fetchMocks = new Map();
        this.state = { popupVisible: false, dynamicSectionVisible: false };
    }

    getElementById(id) {
        if (!this.elements.has(id)) {
            this.elements.set(id, {
                id, value: '', textContent: '', innerHTML: '',
                style: {
                    get display() { 
                        if (id === 'sourcePopup') return this._popupDisplay || 'none';
                        if (id === 'dynamicSection') return this._dynamicDisplay || 'none';
                        return this._display || 'none';
                    },
                    set display(v) {
                        if (id === 'sourcePopup') this._popupDisplay = v;
                        else if (id === 'dynamicSection') this._dynamicDisplay = v;
                        else this._display = v;
                    }
                },
                onclick: null, onchange: null, onsubmit: null
            });
        }
        return this.elements.get(id);
    }

    fetch(url, options = {}) {
        if (this.fetchMocks.has(url)) {
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve(this.fetchMocks.get(url))
            });
        }
        return Promise.reject(new Error('No mock for: ' + url));
    }

    setFetchMock(url, response) {
        this.fetchMocks.set(url, response);
    }
}

// UI Manager for testing
class UIManager {
    constructor(mockDOM) {
        this.mockDOM = mockDOM;
        this.currentEditingId = null;
        this.statusHistory = [];
        global.fetch = mockDOM.fetch.bind(mockDOM);
        this.els = {};
        ['sourcePopup', 'sourcePopupOverlay', 'sourcePopupTitle', 'sourceName',
         'sourceType', 'pathTemplate', 'dynamicSection', 'dynamicFields',
         'staticConfigSection', 'staticConfigFields'].forEach(id => {
            this.els[id] = mockDOM.getElementById(id);
        });
    }

    showAddSourcePopup() {
        this.currentEditingId = null;
        this.els.sourcePopupTitle.textContent = 'Add New Source';
        this.els.sourcePopup.style.display = 'block';
        this.updateStatus('Ready');
    }

    hideSourcePopup() {
        this.els.sourcePopup.style.display = 'none';
        this.els.dynamicSection.style.display = 'none';
    }

    showEditSourcePopup(source) {
        this.currentEditingId = source.id;
        this.els.sourcePopupTitle.textContent = 'Edit Source';
        this.els.sourcePopup.style.display = 'block';
        this.els.sourceName.value = source.name;
        this.els.sourceType.value = source.type;
        this.els.pathTemplate.value = source.pathTemplate || '';
    }

    updateConfigFields() {
        const type = this.els.sourceType.value;
        if (!type) {
            this.els.staticConfigSection.style.display = 'none';
            return;
        }
        this.els.staticConfigSection.style.display = 'block';
        let html = '';
        if (type === 's3') html = '<label>AWS Profile</label><label>AWS Region</label>';
        else if (type === 'sftp') html = '<label>Host</label><label>Port</label><label>Username</label>';
        this.els.staticConfigFields.innerHTML = html;
    }

    async resolveVariables() {
        const template = this.els.pathTemplate.value.trim();
        if (!template) {
            this.updateStatus('Please enter a path template first', 'error');
            return;
        }
        try {
            const response = await fetch('/api/sources/resolve-variables');
            const result = await response.json();
            if (result.success && result.variables.length > 0) {
                this.generateDynamicFields(result.variables);
                this.els.dynamicSection.style.display = 'block';
                this.updateStatus('Found ' + result.variables.length + ' dynamic variable(s)', 'success');
            } else {
                this.els.dynamicSection.style.display = 'none';
                this.updateStatus('No dynamic variables found', 'info');
            }
        } catch (error) {
            this.updateStatus('Error resolving: ' + error.message, 'error');
        }
    }

    generateDynamicFields(variables) {
        const html = variables.map(v => 
            '<div><label>' + v + '</label><input type="text" id="var_' + v + '"></div>'
        ).join('');
        this.els.dynamicFields.innerHTML = html;
        variables.forEach(v => this.mockDOM.getElementById('var_' + v));
    }

    collectFormData() {
        const formData = {
            name: this.els.sourceName.value,
            type: this.els.sourceType.value,
            pathTemplate: this.els.pathTemplate.value,
            dynamicVariables: {}
        };
        const matches = this.els.dynamicFields.innerHTML.match(/var_(\w+)/g) || [];
        matches.forEach(m => {
            const varName = m.replace('var_', '');
            const input = this.mockDOM.getElementById('var_' + varName);
            if (input && input.value) formData.dynamicVariables[varName] = input.value;
        });
        return formData;
    }

    validateFormData(formData) {
        const errors = [];
        if (!formData.name?.trim()) errors.push('Source name is required');
        return errors;
    }

    async handleFormSubmit(event) {
        event.preventDefault();
        const formData = this.collectFormData();
        const errors = this.validateFormData(formData);
        if (errors.length > 0) {
            this.updateStatus('Validation errors: ' + errors.join(', '), 'error');
            return;
        }
        try {
            const response = await fetch('/api/sources');
            const result = await response.json();
            if (result.success) {
                this.updateStatus('Source created successfully', 'success');
                this.hideSourcePopup();
            }
        } catch (error) {
            this.updateStatus('Error: ' + error.message, 'error');
        }
    }

    updateStatus(message, type = 'info') {
        this.statusHistory.push({ message, type, timestamp: Date.now() });
    }

    getStatusHistory() {
        return this.statusHistory;
    }
}

describe('Sources Manager UI Integration', () => {
    let mockDOM, manager;

    beforeEach(() => {
        mockDOM = new MockDOM();
        manager = new UIManager(mockDOM);
    });

    describe('Popup Management', () => {
        test('should show and hide popup', () => {
            expect(manager.els.sourcePopup.style.display).toBe('none');
            manager.showAddSourcePopup();
            expect(manager.els.sourcePopup.style.display).toBe('block');
            expect(manager.els.sourcePopupTitle.textContent).toBe('Add New Source');
            manager.hideSourcePopup();
            expect(manager.els.sourcePopup.style.display).toBe('none');
        });

        test('should populate form when editing', () => {
            const source = { id: '123', name: 'Test', type: 's3', pathTemplate: 's3://$bucket' };
            manager.showEditSourcePopup(source);
            expect(manager.els.sourceName.value).toBe('Test');
            expect(manager.currentEditingId).toBe('123');
        });
    });

    describe('Config Fields', () => {
        test('should generate S3 fields', () => {
            manager.els.sourceType.value = 's3';
            manager.updateConfigFields();
            expect(manager.els.staticConfigFields.innerHTML).toContain('AWS Profile');
        });

        test('should generate SFTP fields', () => {
            manager.els.sourceType.value = 'sftp';
            manager.updateConfigFields();
            expect(manager.els.staticConfigFields.innerHTML).toContain('Host');
        });
    });

    describe('Variable Resolution', () => {
        test('should resolve variables', async () => {
            mockDOM.setFetchMock('/api/sources/resolve-variables', {
                success: true, variables: ['bucket', 'key']
            });
            manager.els.pathTemplate.value = 's3://$bucket/$key';
            await manager.resolveVariables();
            expect(manager.els.dynamicSection.style.display).toBe('block');
            expect(manager.els.dynamicFields.innerHTML).toContain('var_bucket');
        });

        test('should handle empty template', async () => {
            manager.els.pathTemplate.value = '';
            await manager.resolveVariables();
            const last = manager.statusHistory[manager.statusHistory.length - 1];
            expect(last.message).toContain('Please enter a path template first');
        });
    });

    describe('Form Handling', () => {
        test('should collect form data', () => {
            manager.els.sourceName.value = 'Test';
            manager.els.sourceType.value = 's3';
            manager.els.pathTemplate.value = 's3://$bucket';
            manager.generateDynamicFields(['bucket']);
            mockDOM.getElementById('var_bucket').value = 'my-bucket';
            const data = manager.collectFormData();
            expect(data.name).toBe('Test');
            expect(data.dynamicVariables.bucket).toBe('my-bucket');
        });

        test('should validate form', async () => {
            manager.els.sourceName.value = '';
            await manager.handleFormSubmit({ preventDefault: () => {} });
            const last = manager.statusHistory[manager.statusHistory.length - 1];
            expect(last.message).toContain('Validation errors');
        });
    });

    describe('Complete Workflow', () => {
        test('should handle full workflow', async () => {
            mockDOM.setFetchMock('/api/sources/resolve-variables', {
                success: true, variables: ['env']
            });
            mockDOM.setFetchMock('/api/sources', { success: true, id: '123' });
            
            manager.showAddSourcePopup();
            manager.els.sourceName.value = 'Prod';
            manager.els.pathTemplate.value = '/logs/$env';
            await manager.resolveVariables();
            mockDOM.getElementById('var_env').value = 'prod';
            await manager.handleFormSubmit({ preventDefault: () => {} });
            
            const last = manager.statusHistory[manager.statusHistory.length - 1];
            expect(last.message).toContain('created successfully');
        });
    });

    describe('Status Tracking', () => {
        test('should track status history', () => {
            manager.updateStatus('First', 'info');
            manager.updateStatus('Second', 'success');
            const history = manager.getStatusHistory();
            expect(history.length).toBe(2);
            expect(history[0].message).toBe('First');
            expect(history[1].type).toBe('success');
        });
    });
});
