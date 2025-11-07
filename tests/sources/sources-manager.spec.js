/**
 * Sources Manager JavaScript Test Suite
 * Comprehensive tests for dynamic variables, form generation, and UI interactions
 */

const { describe, test, expect, beforeEach } = require('@jest/globals');

// Mock DOM elements and fetch for testing
class MockDOM {
    constructor() {
        this.elements = new Map();
        this.localStorage = new Map();
        this.fetchResponses = new Map();
    }

    getElementById(id) {
        if (!this.elements.has(id)) {
            this.elements.set(id, {
                id,
                value: '',
                textContent: '',
                innerHTML: '',
                onclick: null,
                onchange: null,
                onsubmit: null,
                style: { display: '' },
                addEventListener: function() {},
                appendChild: function() {},
                classList: {
                    add: function() {},
                    remove: function() {},
                    toggle: function() {}
                }
            });
        }
        return this.elements.get(id);
    }

    createElement(tagName) {
        return {
            tagName,
            innerHTML: '',
            textContent: '',
            style: {},
            appendChild: function() {},
            setAttribute: function() {},
            classList: {
                add: function() {},
                remove: function() {}
            }
        };
    }

    addEventListener(event, handler) {
        // Mock event listener
    }

    getLocalStorage() {
        return {
            getItem: (key) => this.localStorage.get(key) || null,
            setItem: (key, value) => this.localStorage.set(key, value)
        };
    }

    mockFetch(url, options = {}) {
        if (this.fetchResponses.has(url)) {
            const response = this.fetchResponses.get(url);
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve(response)
            });
        }
        return Promise.reject(new Error(`No mock response for ${url}`));
    }

    setFetchResponse(url, response) {
        this.fetchResponses.set(url, response);
    }
}

// Mock SourcesManager class for testing
class MockSourcesManager {
    constructor(mockDOM) {
        this.mockDOM = mockDOM;
        this.toolName = 'sources';
        this.fontSize = 13;
        this.sources = [];
        this.currentEditingId = null;
        this.els = {};

        this.initElements();
    }

    initElements() {
        const elementIds = [
            'sourcesList', 'sourcesCount', 'statusText', 'connectionInfo',
            'sourcePopup', 'sourcePopupOverlay', 'sourcePopupTitle', 'sourceForm',
            'sourceName', 'sourceType', 'staticConfigSection', 'staticConfigFields',
            'pathSection', 'pathTemplate', 'dynamicSection', 'dynamicFields'
        ];

        elementIds.forEach(id => {
            this.els[id] = this.mockDOM.getElementById(id);
        });
    }

    async resolveVariables() {
        const pathTemplate = this.els.pathTemplate.value.trim();
        if (!pathTemplate) {
            throw new Error('Please enter a path template first');
        }

        try {
            const response = await this.mockDOM.mockFetch('/api/sources/resolve-variables');
            const result = response ? await response.json() : null;

            if (result && result.success) {
                if (result.variables.length > 0) {
                    this.generateDynamicFields(result.variables);
                    this.els.dynamicSection.style.display = 'block';
                    return `Found ${result.variables.length} dynamic variable(s): ${result.variables.join(', ')}`;
                } else {
                    this.els.dynamicSection.style.display = 'none';
                    return 'No dynamic variables found in path template';
                }
            } else {
                throw new Error('Failed to resolve variables: ' + (result?.error || 'Unknown error'));
            }
        } catch (error) {
            throw new Error('Error resolving variables: ' + error.message);
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
        return fieldsHtml;
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

    validateFormData(formData) {
        const errors = [];

        if (!formData.name || formData.name.trim() === '') {
            errors.push('Source name is required');
        }

        if (!formData.type || formData.type.trim() === '') {
            errors.push('Source type is required');
        }

        if (formData.pathTemplate && formData.pathTemplate.includes('$')) {
            const variables = this.extractVariablesFromTemplate(formData.pathTemplate);
            if (!formData.dynamicVariables || Object.keys(formData.dynamicVariables).length === 0) {
                errors.push('Dynamic variables are required when using path template with variables');
            } else {
                variables.forEach(variable => {
                    if (!formData.dynamicVariables[variable]) {
                        errors.push(`Value required for dynamic variable: ${variable}`);
                    }
                });
            }
        }

        return errors;
    }

    buildSourcePayload(formData) {
        return {
            name: formData.name,
            type: formData.type,
            staticConfig: formData.staticConfig || {},
            pathTemplate: formData.pathTemplate || '',
            dynamicVariables: formData.dynamicVariables || {}
        };
    }

    updateStatus(message) {
        this.els.statusText.textContent = message;
    }

    showError(message) {
        throw new Error(message);
    }
}

describe('Sources Manager', () => {
    let mockDOM;
    let manager;

    beforeEach(() => {
        mockDOM = new MockDOM();
        manager = new MockSourcesManager(mockDOM);
    });

    describe('Resolve Variables Functionality', () => {
        test('should resolve single variable from path template', async () => {
            mockDOM.setFetchResponse('/api/sources/resolve-variables', {
                success: true,
                variables: ['file']
            });

            manager.els.pathTemplate.value = '/folder/folder2/$file';
            const result = await manager.resolveVariables();

            expect(result).toContain('Found 1 dynamic variable(s): file');
            expect(manager.els.dynamicSection.style.display).toBe('block');
        });

        test('should resolve multiple variables from path template', async () => {
            mockDOM.setFetchResponse('/api/sources/resolve-variables', {
                success: true,
                variables: ['bucket', 'file']
            });

            manager.els.pathTemplate.value = 's3://$bucket/folder/$file';
            const result = await manager.resolveVariables();

            expect(result).toContain('Found 2 dynamic variable(s): bucket, file');
        });

        test('should handle path template with no variables', async () => {
            mockDOM.setFetchResponse('/api/sources/resolve-variables', {
                success: true,
                variables: []
            });

            manager.els.pathTemplate.value = '/static/folder/file.txt';
            const result = await manager.resolveVariables();

            expect(result).toBe('No dynamic variables found in path template');
            expect(manager.els.dynamicSection.style.display).toBe('none');
        });

        test('should throw error for empty path template', async () => {
            manager.els.pathTemplate.value = '';

            await expect(manager.resolveVariables()).rejects.toThrow('Please enter a path template first');
        });
    });

    describe('Dynamic Fields Generation', () => {
        test('should generate dynamic fields for single variable', () => {
            const result = manager.generateDynamicFields(['file']);

            expect(result).toContain('id="var_file"');
            expect(result).toContain('placeholder="Enter value for file"');
            expect(result).toContain('Dynamic variable: $file');
        });

        test('should generate dynamic fields for multiple variables', () => {
            const variables = ['bucket', 'folder', 'filename'];
            const result = manager.generateDynamicFields(variables);

            variables.forEach(variable => {
                expect(result).toContain(`id="var_${variable}"`);
                expect(result).toContain(`Dynamic variable: $${variable}`);
            });
        });

        test('should generate empty HTML for no variables', () => {
            const result = manager.generateDynamicFields([]);
            expect(result.trim()).toBe('');
        });
    });

    describe('Variable Extraction', () => {
        test('should extract variables from template correctly', () => {
            const testCases = [
                { template: '/folder/$file', expected: ['file'] },
                { template: 's3://$bucket/$key', expected: ['bucket', 'key'] },
                { template: '/static/file.txt', expected: [] },
                { template: 'sftp://$host:$port/$folder/$file', expected: ['host', 'port', 'folder', 'file'] },
                { template: '/$var1/test/$var2/$var1', expected: ['var1', 'var2', 'var1'] }
            ];

            testCases.forEach(testCase => {
                const result = manager.extractVariablesFromTemplate(testCase.template);
                expect(result).toEqual(testCase.expected);
            });
        });
    });

    describe('Form Validation', () => {
        test('should validate form data correctly', () => {
            const validData = {
                name: 'Test Source',
                type: 'local_file',
                staticConfig: {},
                pathTemplate: '/data/$file',
                dynamicVariables: { file: 'test.txt' }
            };

            let errors = manager.validateFormData(validData);
            expect(errors.length).toBe(0);
        });

        test('should validate required name field', () => {
            const invalidData = {
                name: '',
                type: 'local_file'
            };

            const errors = manager.validateFormData(invalidData);
            expect(errors.some(error => error.includes('Source name is required'))).toBe(true);
        });

        test('should validate dynamic variables when template has variables', () => {
            const invalidData = {
                name: 'Test',
                type: 'local_file',
                pathTemplate: '/data/$file'
            };

            const errors = manager.validateFormData(invalidData);
            expect(errors.some(error => error.includes('Dynamic variables are required'))).toBe(true);
        });

        test('should validate missing value for variable', () => {
            const invalidData = {
                name: 'Test',
                type: 'local_file',
                pathTemplate: '/data/$file/$folder',
                dynamicVariables: { file: 'test.txt' }
            };

            const errors = manager.validateFormData(invalidData);
            expect(errors.some(error => error.includes('Value required for dynamic variable: folder'))).toBe(true);
        });
    });

    describe('Source Payload Building', () => {
        test('should build correct source payload', () => {
            const formData = {
                name: 'Test S3 Source',
                type: 's3',
                staticConfig: { region: 'us-east-1', aws_profile: 'default' },
                pathTemplate: 's3://$bucket/$key',
                dynamicVariables: { bucket: 'my-bucket', key: 'data.json' }
            };

            const payload = manager.buildSourcePayload(formData);

            expect(payload.name).toBe('Test S3 Source');
            expect(payload.type).toBe('s3');
            expect(payload.staticConfig.region).toBe('us-east-1');
            expect(payload.pathTemplate).toBe('s3://$bucket/$key');
            expect(payload.dynamicVariables.bucket).toBe('my-bucket');
        });
    });

    describe('Edge Cases', () => {
        test('should handle malformed variable patterns', () => {
            const malformedTemplates = [
                '/folder/$$double',
                '/folder/$',
                '/folder/$ ',
                '/folder/${bracket}',
                '/folder/$var$var2'
            ];

            malformedTemplates.forEach(template => {
                expect(() => {
                    manager.extractVariablesFromTemplate(template);
                }).not.toThrow();
            });
        });

        test('should handle very long variable names', () => {
            const longVariableName = 'very_long_variable_name_that_should_still_work_correctly_123';
            const template = `/folder/$${longVariableName}`;

            const variables = manager.extractVariablesFromTemplate(template);

            expect(variables.length).toBe(1);
            expect(variables[0]).toBe(longVariableName);
        });

        test('should handle unicode characters in template context', () => {
            const template = '/foldér/ünïcödé/$file/测试';
            const variables = manager.extractVariablesFromTemplate(template);

            expect(variables.length).toBe(1);
            expect(variables[0]).toBe('file');
        });
    });

    describe('Complex Integration Scenarios', () => {
        test('should handle complete workflow simulation', async () => {
            mockDOM.setFetchResponse('/api/sources/resolve-variables', {
                success: true,
                variables: ['environment', 'service', 'date']
            });

            // Set path template
            manager.els.pathTemplate.value = '/logs/$environment/$service/$date.log';

            // Resolve variables
            const resolveResult = await manager.resolveVariables();
            expect(resolveResult).toContain('Found 3 dynamic variable(s)');

            // Check dynamic fields were generated
            expect(manager.els.dynamicFields.innerHTML).toContain('var_environment');

            // Validate form data
            const formData = {
                name: 'Production Logs',
                type: 'local_file',
                staticConfig: {},
                pathTemplate: '/logs/$environment/$service/$date.log',
                dynamicVariables: {
                    environment: 'prod',
                    service: 'api',
                    date: '2024-01-01'
                }
            };

            const errors = manager.validateFormData(formData);
            expect(errors.length).toBe(0);

            // Build payload
            const payload = manager.buildSourcePayload(formData);
            expect(payload.pathTemplate).toContain('$environment');
        });
    });
});
