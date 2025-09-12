/**
 * Sources Manager JavaScript Test Suite
 * Comprehensive tests for dynamic variables, form generation, and UI interactions
 */

// Simple test framework for Node.js/Browser environment
class TestRunner {
    constructor() {
        this.tests = [];
        this.passed = 0;
        this.failed = 0;
    }

    test(description, testFunction) {
        this.tests.push({ description, testFunction });
    }

    async run() {
        console.log('🧪 Running Sources Manager JavaScript Tests\n');
        
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

    // Mock localStorage
    getLocalStorage() {
        return {
            getItem: (key) => this.localStorage.get(key) || null,
            setItem: (key, value) => this.localStorage.set(key, value)
        };
    }

    // Mock fetch
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
        
        // Mock elements
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

    // Core methods that need testing
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
                // Check if all variables in template have values
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

// Test Suite
const runner = new TestRunner();
const mockDOM = new MockDOM();

// Test: Resolve Variables Functionality
runner.test('Should resolve single variable from path template', async () => {
    const manager = new MockSourcesManager(mockDOM);
    
    // Set up mock response
    mockDOM.setFetchResponse('/api/sources/resolve-variables', {
        success: true,
        variables: ['file']
    });
    
    // Set path template
    manager.els.pathTemplate.value = '/folder/folder2/$file';
    
    // Test resolve
    const result = await manager.resolveVariables();
    
    if (!result.includes('Found 1 dynamic variable(s): file')) {
        throw new Error(`Expected result to contain variable info, got: ${result}`);
    }
    
    if (manager.els.dynamicSection.style.display !== 'block') {
        throw new Error('Dynamic section should be displayed');
    }
});

runner.test('Should resolve multiple variables from path template', async () => {
    const manager = new MockSourcesManager(mockDOM);
    
    // Set up mock response
    mockDOM.setFetchResponse('/api/sources/resolve-variables', {
        success: true,
        variables: ['bucket', 'file']
    });
    
    // Set path template
    manager.els.pathTemplate.value = 's3://$bucket/folder/$file';
    
    // Test resolve
    const result = await manager.resolveVariables();
    
    if (!result.includes('Found 2 dynamic variable(s): bucket,file')) {
        throw new Error(`Expected result to contain both variables, got: ${result}`);
    }
});

runner.test('Should handle path template with no variables', async () => {
    const manager = new MockSourcesManager(mockDOM);
    
    // Set up mock response
    mockDOM.setFetchResponse('/api/sources/resolve-variables', {
        success: true,
        variables: []
    });
    
    // Set path template
    manager.els.pathTemplate.value = '/static/folder/file.txt';
    
    // Test resolve
    const result = await manager.resolveVariables();
    
    if (result !== 'No dynamic variables found in path template') {
        throw new Error(`Expected no variables message, got: ${result}`);
    }
    
    if (manager.els.dynamicSection.style.display !== 'none') {
        throw new Error('Dynamic section should be hidden');
    }
});

runner.test('Should throw error for empty path template', async () => {
    const manager = new MockSourcesManager(mockDOM);
    
    // Set empty path template
    manager.els.pathTemplate.value = '';
    
    try {
        await manager.resolveVariables();
        throw new Error('Should have thrown error for empty template');
    } catch (error) {
        if (!error.message.includes('Please enter a path template first')) {
            throw new Error(`Expected empty template error, got: ${error.message}`);
        }
    }
});

// Test: Dynamic Fields Generation
runner.test('Should generate dynamic fields for single variable', () => {
    const manager = new MockSourcesManager(mockDOM);
    
    const result = manager.generateDynamicFields(['file']);
    
    if (!result.includes('id="var_file"')) {
        throw new Error('Should generate input field for file variable');
    }
    
    if (!result.includes('placeholder="Enter value for file"')) {
        throw new Error('Should include placeholder text');
    }
    
    if (!result.includes('Dynamic variable: $file')) {
        throw new Error('Should include help text');
    }
});

runner.test('Should generate dynamic fields for multiple variables', () => {
    const manager = new MockSourcesManager(mockDOM);
    
    const variables = ['bucket', 'folder', 'filename'];
    const result = manager.generateDynamicFields(variables);
    
    variables.forEach(variable => {
        if (!result.includes(`id="var_${variable}"`)) {
            throw new Error(`Should generate field for ${variable}`);
        }
        if (!result.includes(`Dynamic variable: $${variable}`)) {
            throw new Error(`Should include help text for ${variable}`);
        }
    });
});

runner.test('Should generate empty HTML for no variables', () => {
    const manager = new MockSourcesManager(mockDOM);
    
    const result = manager.generateDynamicFields([]);
    
    if (result.trim() !== '') {
        throw new Error('Should generate empty HTML for no variables');
    }
});

// Test: Variable Extraction
runner.test('Should extract variables from template correctly', () => {
    const manager = new MockSourcesManager(mockDOM);
    
    const testCases = [
        { template: '/folder/$file', expected: ['file'] },
        { template: 's3://$bucket/$key', expected: ['bucket', 'key'] },
        { template: '/static/file.txt', expected: [] },
        { template: 'sftp://$host:$port/$folder/$file', expected: ['host', 'port', 'folder', 'file'] },
        { template: '/$var1/test/$var2/$var1', expected: ['var1', 'var2', 'var1'] } // Duplicates
    ];
    
    testCases.forEach(testCase => {
        const result = manager.extractVariablesFromTemplate(testCase.template);
        if (JSON.stringify(result) !== JSON.stringify(testCase.expected)) {
            throw new Error(`Template: ${testCase.template}, Expected: ${JSON.stringify(testCase.expected)}, Got: ${JSON.stringify(result)}`);
        }
    });
});

// Test: Form Validation
runner.test('Should validate form data correctly', () => {
    const manager = new MockSourcesManager(mockDOM);
    
    // Valid form data
    const validData = {
        name: 'Test Source',
        type: 'local_file',
        staticConfig: {},
        pathTemplate: '/data/$file',
        dynamicVariables: { file: 'test.txt' }
    };
    
    let errors = manager.validateFormData(validData);
    if (errors.length !== 0) {
        throw new Error(`Valid data should pass validation, got errors: ${JSON.stringify(errors)}`);
    }
    
    // Invalid data - missing name
    const invalidData1 = {
        name: '',
        type: 'local_file'
    };
    
    errors = manager.validateFormData(invalidData1);
    if (!errors.some(error => error.includes('Source name is required'))) {
        throw new Error('Should validate required name field');
    }
    
    // Invalid data - template with variables but no dynamic variables
    const invalidData2 = {
        name: 'Test',
        type: 'local_file',
        pathTemplate: '/data/$file'
    };
    
    errors = manager.validateFormData(invalidData2);
    if (!errors.some(error => error.includes('Dynamic variables are required'))) {
        throw new Error('Should validate dynamic variables when template has variables');
    }
    
    // Invalid data - missing value for variable
    const invalidData3 = {
        name: 'Test',
        type: 'local_file',
        pathTemplate: '/data/$file/$folder',
        dynamicVariables: { file: 'test.txt' } // Missing folder
    };
    
    errors = manager.validateFormData(invalidData3);
    if (!errors.some(error => error.includes('Value required for dynamic variable: folder'))) {
        throw new Error('Should validate missing variable values');
    }
});

// Test: Source Payload Building
runner.test('Should build correct source payload', () => {
    const manager = new MockSourcesManager(mockDOM);
    
    const formData = {
        name: 'Test S3 Source',
        type: 's3',
        staticConfig: { region: 'us-east-1', aws_profile: 'default' },
        pathTemplate: 's3://$bucket/$key',
        dynamicVariables: { bucket: 'my-bucket', key: 'data.json' }
    };
    
    const payload = manager.buildSourcePayload(formData);
    
    if (payload.name !== 'Test S3 Source') {
        throw new Error('Payload should include correct name');
    }
    
    if (payload.type !== 's3') {
        throw new Error('Payload should include correct type');
    }
    
    if (payload.staticConfig.region !== 'us-east-1') {
        throw new Error('Payload should include static config');
    }
    
    if (payload.pathTemplate !== 's3://$bucket/$key') {
        throw new Error('Payload should include path template');
    }
    
    if (payload.dynamicVariables.bucket !== 'my-bucket') {
        throw new Error('Payload should include dynamic variables');
    }
});

// Test: Edge Cases
runner.test('Should handle malformed variable patterns', () => {
    const manager = new MockSourcesManager(mockDOM);
    
    const malformedTemplates = [
        '/folder/$$double',     // Double dollar
        '/folder/$',            // Dollar at end
        '/folder/$ ',           // Dollar with space
        '/folder/${bracket}',   // Curly brackets (should not match)
        '/folder/$var$var2'     // Adjacent variables
    ];
    
    malformedTemplates.forEach(template => {
        try {
            const variables = manager.extractVariablesFromTemplate(template);
            // Should handle gracefully without throwing errors
            console.log(`Template: ${template}, Variables: ${JSON.stringify(variables)}`);
        } catch (error) {
            throw new Error(`Should handle malformed template gracefully: ${template}, Error: ${error.message}`);
        }
    });
});

runner.test('Should handle very long variable names', () => {
    const manager = new MockSourcesManager(mockDOM);
    
    const longVariableName = 'very_long_variable_name_that_should_still_work_correctly_123';
    const template = `/folder/$${longVariableName}`;
    
    const variables = manager.extractVariablesFromTemplate(template);
    
    if (variables.length !== 1 || variables[0] !== longVariableName) {
        throw new Error('Should extract long variable names correctly');
    }
});

runner.test('Should handle unicode characters in template context', () => {
    const manager = new MockSourcesManager(mockDOM);
    
    const template = '/foldér/ünïcödé/$file/测试';
    const variables = manager.extractVariablesFromTemplate(template);
    
    if (variables.length !== 1 || variables[0] !== 'file') {
        throw new Error('Should handle unicode context correctly');
    }
});

// Test: Complex Integration Scenarios
runner.test('Should handle complete workflow simulation', async () => {
    const manager = new MockSourcesManager(mockDOM);
    
    // Set up mock response for resolve
    mockDOM.setFetchResponse('/api/sources/resolve-variables', {
        success: true,
        variables: ['environment', 'service', 'date']
    });
    
    // 1. Set path template
    manager.els.pathTemplate.value = '/logs/$environment/$service/$date.log';
    
    // 2. Resolve variables
    const resolveResult = await manager.resolveVariables();
    
    if (!resolveResult.includes('Found 3 dynamic variable(s)')) {
        throw new Error('Should find 3 variables in template');
    }
    
    // 3. Check dynamic fields were generated
    if (!manager.els.dynamicFields.innerHTML.includes('var_environment')) {
        throw new Error('Should generate field for environment variable');
    }
    
    // 4. Validate form data
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
    if (errors.length > 0) {
        throw new Error(`Complete workflow data should be valid, got errors: ${JSON.stringify(errors)}`);
    }
    
    // 5. Build payload
    const payload = manager.buildSourcePayload(formData);
    if (!payload.pathTemplate.includes('$environment')) {
        throw new Error('Payload should preserve template structure');
    }
});

// Run all tests
if (typeof module !== 'undefined' && module.exports) {
    // Node.js environment
    module.exports = { TestRunner, MockDOM, MockSourcesManager };
    
    if (require.main === module) {
        runner.run().then(success => {
            process.exit(success ? 0 : 1);
        });
    }
} else {
    // Browser environment
    runner.run().then(success => {
        console.log(success ? '🎉 All tests passed!' : '💥 Some tests failed!');
    });
}