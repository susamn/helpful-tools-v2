/**
 * Workflow Processor Test Suite
 * Tests for workflow building, execution, and autocomplete functionality
 */

const { describe, test, expect, beforeEach, afterEach } = require('@jest/globals');

// Import the module
const { RemoteAutocompleteAdapter, WorkflowProcessor } = require('../../frontend/static/js/workflow-processor.js');

// Test fixtures
const fixtures = {
    mockSource: {
        id: 'source-123',
        name: 'Test Source',
        type: 's3',
        path: '/data/test.json',
        selectedFile: 'test-file.json'
    },

    mockSuggestions: {
        success: true,
        suggestions: [
            { text: '$.store', displayText: '$.store', insertText: '.store' },
            { text: '$.store.book', displayText: '$.store.book', insertText: '.book' },
            { text: '$.store.book[*].author', displayText: '$.store.book[*].author', insertText: '[*].author' }
        ]
    },

    mockWorkflowResult: {
        success: true,
        result: { data: 'processed' },
        has_more: false
    },

    mockPaginatedResult: {
        success: true,
        result: '{"data": "first chunk"}',
        result_id: 'result-456',
        offset: 1000,
        total_size: 5000,
        has_more: true
    },

    mockLoadMoreResult: {
        success: true,
        chunk: ',"more": "data"}',
        offset: 2000,
        total_size: 5000,
        has_more: false
    }
};

describe('RemoteAutocompleteAdapter', () => {
    let inputElement;
    let adapter;

    beforeEach(() => {
        // Create input element
        inputElement = document.createElement('input');
        inputElement.type = 'text';
        document.body.appendChild(inputElement);

        // Reset fetch mock
        global.fetch = jest.fn();
    });

    afterEach(() => {
        if (adapter) {
            adapter.destroy();
            adapter = null;
        }
        document.body.innerHTML = '';
        jest.clearAllMocks();
        jest.useRealTimers();
    });

    describe('Initialization', () => {
        test('should create adapter with required parameters', () => {
            adapter = new RemoteAutocompleteAdapter(inputElement, 'source-123', '/path/to/file.json');

            expect(adapter.inputElement).toBe(inputElement);
            expect(adapter.sourceId).toBe('source-123');
            expect(adapter.filePath).toBe('/path/to/file.json');
        });

        test('should create dropdown element and append to body', () => {
            adapter = new RemoteAutocompleteAdapter(inputElement, 'source-123', '/path/to/file.json');

            expect(adapter.dropdown).toBeDefined();
            expect(adapter.dropdown.className).toBe('autocomplete-dropdown');
            expect(adapter.dropdown.style.display).toBe('none');
            expect(document.body.contains(adapter.dropdown)).toBe(true);
        });

        test('should initialize with default state', () => {
            adapter = new RemoteAutocompleteAdapter(inputElement, 'source-123', '/path/to/file.json');

            expect(adapter.selectedIndex).toBe(-1);
            expect(adapter.suggestions).toEqual([]);
            expect(adapter.debounceTimer).toBeNull();
        });
    });

    describe('Input Handling', () => {
        beforeEach(() => {
            jest.useFakeTimers();
            adapter = new RemoteAutocompleteAdapter(inputElement, 'source-123', '/path/to/file.json');
        });

        test('should debounce input events', () => {
            const fetchSpy = jest.spyOn(adapter, 'fetchSuggestions');

            inputElement.value = '$';
            inputElement.dispatchEvent(new Event('input'));

            expect(fetchSpy).not.toHaveBeenCalled();

            jest.advanceTimersByTime(299);
            expect(fetchSpy).not.toHaveBeenCalled();

            jest.advanceTimersByTime(1);
            expect(fetchSpy).toHaveBeenCalledTimes(1);
        });

        test('should cancel previous debounce on new input', () => {
            const fetchSpy = jest.spyOn(adapter, 'fetchSuggestions');

            inputElement.value = '$';
            inputElement.dispatchEvent(new Event('input'));

            jest.advanceTimersByTime(200);

            inputElement.value = '$.s';
            inputElement.dispatchEvent(new Event('input'));

            jest.advanceTimersByTime(300);

            expect(fetchSpy).toHaveBeenCalledTimes(1);
        });

        test('should hide dropdown on blur after delay', () => {
            adapter.dropdown.style.display = 'block';

            inputElement.dispatchEvent(new Event('blur'));

            expect(adapter.dropdown.style.display).toBe('block');

            jest.advanceTimersByTime(200);

            expect(adapter.dropdown.style.display).toBe('none');
        });
    });

    describe('Fetch Suggestions', () => {
        beforeEach(() => {
            adapter = new RemoteAutocompleteAdapter(inputElement, 'source-123', '/path/to/file.json');
        });

        test('should hide dropdown when query is empty', async () => {
            adapter.dropdown.style.display = 'block';
            inputElement.value = '';

            await adapter.fetchSuggestions();

            expect(adapter.dropdown.style.display).toBe('none');
            expect(global.fetch).not.toHaveBeenCalled();
        });

        test('should fetch suggestions from API', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(fixtures.mockSuggestions)
            });

            inputElement.value = '$.store';
            await adapter.fetchSuggestions();

            expect(global.fetch).toHaveBeenCalledWith('/api/workflow/suggest', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    source_id: 'source-123',
                    file_path: '/path/to/file.json',
                    query: '$.store'
                })
            });
        });

        test('should show dropdown with suggestions', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(fixtures.mockSuggestions)
            });

            inputElement.value = '$';
            inputElement.getBoundingClientRect = () => ({
                left: 100,
                bottom: 200,
                width: 300
            });

            await adapter.fetchSuggestions();

            expect(adapter.suggestions).toEqual(fixtures.mockSuggestions.suggestions);
            expect(adapter.dropdown.style.display).toBe('block');
            expect(adapter.dropdown.children.length).toBe(3);
        });

        test('should hide dropdown when no suggestions returned', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ success: true, suggestions: [] })
            });

            adapter.dropdown.style.display = 'block';
            inputElement.value = '$.xyz';

            await adapter.fetchSuggestions();

            expect(adapter.dropdown.style.display).toBe('none');
        });

        test('should handle fetch errors gracefully', async () => {
            global.fetch.mockRejectedValueOnce(new Error('Network error'));
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

            inputElement.value = '$';
            await adapter.fetchSuggestions();

            expect(consoleSpy).toHaveBeenCalled();
            consoleSpy.mockRestore();
        });
    });

    describe('Keyboard Navigation', () => {
        beforeEach(() => {
            adapter = new RemoteAutocompleteAdapter(inputElement, 'source-123', '/path/to/file.json');
            adapter.suggestions = fixtures.mockSuggestions.suggestions;
            adapter.show();
        });

        test('should navigate down with ArrowDown', () => {
            const event = new KeyboardEvent('keydown', { key: 'ArrowDown' });
            const preventDefaultSpy = jest.spyOn(event, 'preventDefault');

            inputElement.dispatchEvent(event);

            expect(adapter.selectedIndex).toBe(0);
            expect(preventDefaultSpy).toHaveBeenCalled();
        });

        test('should navigate up with ArrowUp', () => {
            adapter.selectedIndex = 2;

            const event = new KeyboardEvent('keydown', { key: 'ArrowUp' });
            inputElement.dispatchEvent(event);

            expect(adapter.selectedIndex).toBe(1);
        });

        test('should not go below 0 with ArrowUp', () => {
            adapter.selectedIndex = 0;

            const event = new KeyboardEvent('keydown', { key: 'ArrowUp' });
            inputElement.dispatchEvent(event);

            expect(adapter.selectedIndex).toBe(0);
        });

        test('should not exceed suggestions length with ArrowDown', () => {
            adapter.selectedIndex = 2;

            const event = new KeyboardEvent('keydown', { key: 'ArrowDown' });
            inputElement.dispatchEvent(event);

            expect(adapter.selectedIndex).toBe(2);
        });

        test('should select item on Enter', () => {
            adapter.selectedIndex = 1;
            const selectSpy = jest.spyOn(adapter, 'select');

            const event = new KeyboardEvent('keydown', { key: 'Enter' });
            inputElement.dispatchEvent(event);

            expect(selectSpy).toHaveBeenCalledWith(1);
        });

        test('should not select on Enter when no item selected', () => {
            adapter.selectedIndex = -1;
            const selectSpy = jest.spyOn(adapter, 'select');

            const event = new KeyboardEvent('keydown', { key: 'Enter' });
            inputElement.dispatchEvent(event);

            expect(selectSpy).not.toHaveBeenCalled();
        });

        test('should hide dropdown on Escape', () => {
            const event = new KeyboardEvent('keydown', { key: 'Escape' });
            inputElement.dispatchEvent(event);

            expect(adapter.dropdown.style.display).toBe('none');
        });

        test('should update visual selection state', () => {
            adapter.selectedIndex = 1;
            adapter.updateSelection();

            const items = adapter.dropdown.querySelectorAll('.autocomplete-item');
            expect(items[0].classList.contains('selected')).toBe(false);
            expect(items[1].classList.contains('selected')).toBe(true);
            expect(items[2].classList.contains('selected')).toBe(false);
        });
    });

    describe('Selection', () => {
        beforeEach(() => {
            adapter = new RemoteAutocompleteAdapter(inputElement, 'source-123', '/path/to/file.json');
            adapter.suggestions = fixtures.mockSuggestions.suggestions;
        });

        test('should insert text from suggestion with insertText', () => {
            inputElement.value = '$';
            adapter.select(0);

            expect(inputElement.value).toBe('$.store');
        });

        test('should replace with suggestion text when no insertText', () => {
            adapter.suggestions = [{ text: '$.complete.path' }];
            inputElement.value = '$.par';
            adapter.select(0);

            expect(inputElement.value).toBe('$.complete.path');
        });

        test('should hide dropdown after selection', () => {
            adapter.show();
            adapter.select(0);

            expect(adapter.dropdown.style.display).toBe('none');
        });

        test('should focus input after selection', () => {
            const focusSpy = jest.spyOn(inputElement, 'focus');
            adapter.select(0);

            expect(focusSpy).toHaveBeenCalled();
        });

        test('should dispatch input event after selection', () => {
            let eventFired = false;
            inputElement.addEventListener('input', () => { eventFired = true; });

            adapter.select(0);

            expect(eventFired).toBe(true);
        });

        test('should ignore invalid selection index', () => {
            inputElement.value = 'original';
            adapter.select(-1);
            expect(inputElement.value).toBe('original');

            adapter.select(100);
            expect(inputElement.value).toBe('original');
        });
    });

    describe('Cleanup', () => {
        test('should remove dropdown on destroy', () => {
            adapter = new RemoteAutocompleteAdapter(inputElement, 'source-123', '/path/to/file.json');
            const dropdown = adapter.dropdown;

            expect(document.body.contains(dropdown)).toBe(true);

            adapter.destroy();

            expect(document.body.contains(dropdown)).toBe(false);
        });
    });
});

describe('WorkflowProcessor', () => {
    let processor;
    let mockSourceSelector;

    // Setup DOM elements required by WorkflowProcessor
    function setupDOM() {
        document.body.innerHTML = `
            <button id="selectSourceBtn">Select File</button>
            <div id="selectedFileInfo">No file selected</div>
            <input type="checkbox" id="paginationCheckbox" checked>
            <div id="workflowList"></div>
            <button id="addStepBtn">+ Add Step</button>
            <button id="runBtn" disabled>Run Workflow</button>
            <div id="initialProcessStep" class="workflow-step">
                <div class="step-status" id="initialStatus"></div>
            </div>
            <textarea id="outputArea"></textarea>
            <div id="loadMoreContainer" style="display: none;">
                <button id="loadMoreBtn">Load More...</button>
                <span id="loadMoreStatus"></span>
            </div>
        `;
    }

    beforeEach(() => {
        setupDOM();

        // Mock createSourceSelector
        mockSourceSelector = {
            show: jest.fn(),
            hide: jest.fn()
        };
        global.createSourceSelector = jest.fn().mockResolvedValue(mockSourceSelector);

        // Reset fetch mock
        global.fetch = jest.fn();
    });

    afterEach(() => {
        document.body.innerHTML = '';
        jest.clearAllMocks();
        delete window.removeStep;
        delete window.updateStepParam;
    });

    describe('Initialization', () => {
        test('should initialize with empty state', async () => {
            processor = new WorkflowProcessor();
            await new Promise(resolve => setTimeout(resolve, 0));

            expect(processor.selectedSource).toBeNull();
            expect(processor.workflowSteps).toEqual([]);
            expect(processor.currentResultId).toBeNull();
            expect(processor.currentOffset).toBe(0);
        });

        test('should define available operators', async () => {
            processor = new WorkflowProcessor();
            await new Promise(resolve => setTimeout(resolve, 0));

            expect(processor.operators).toBeDefined();
            expect(processor.operators.length).toBeGreaterThan(0);

            const operatorValues = processor.operators.map(op => op.value);
            expect(operatorValues).toContain('json_format');
            expect(operatorValues).toContain('jsonpath');
            expect(operatorValues).toContain('xml_to_json');
        });

        test('should initialize source selector', async () => {
            processor = new WorkflowProcessor();
            await new Promise(resolve => setTimeout(resolve, 0));

            expect(global.createSourceSelector).toHaveBeenCalledWith(
                expect.objectContaining({
                    containerId: 'workflowSourceSelector',
                    fetchOnSelect: false
                })
            );
        });

        test('should setup event listeners', async () => {
            processor = new WorkflowProcessor();
            await new Promise(resolve => setTimeout(resolve, 0));

            // Verify source selector button opens selector
            document.getElementById('selectSourceBtn').click();
            expect(mockSourceSelector.show).toHaveBeenCalled();
        });

        test('should expose global helper functions', async () => {
            processor = new WorkflowProcessor();
            await new Promise(resolve => setTimeout(resolve, 0));

            expect(window.removeStep).toBeDefined();
            expect(window.updateStepParam).toBeDefined();
        });
    });

    describe('Source Selection', () => {
        beforeEach(async () => {
            processor = new WorkflowProcessor();
            await new Promise(resolve => setTimeout(resolve, 0));
        });

        test('should handle source selection', () => {
            processor.handleSourceSelection(fixtures.mockSource);

            expect(processor.selectedSource).toEqual(fixtures.mockSource);
        });

        test('should display selected file info', () => {
            processor.handleSourceSelection(fixtures.mockSource);

            const fileInfo = document.getElementById('selectedFileInfo').innerHTML;
            expect(fileInfo).toContain('Test Source');
            expect(fileInfo).toContain('test-file.json');
            expect(fileInfo).toContain('s3');
        });

        test('should update run button state after selection', () => {
            processor.handleSourceSelection(fixtures.mockSource);

            // Still disabled because no steps
            expect(document.getElementById('runBtn').disabled).toBe(true);
        });

        test('should handle source with selectedFile property', () => {
            processor.handleSourceSelection(fixtures.mockSource);

            const fileInfo = document.getElementById('selectedFileInfo').innerHTML;
            expect(fileInfo).toContain('test-file.json');
        });

        test('should handle source with path property', () => {
            const sourceWithPath = { ...fixtures.mockSource, selectedFile: null };
            processor.handleSourceSelection(sourceWithPath);

            const fileInfo = document.getElementById('selectedFileInfo').innerHTML;
            expect(fileInfo).toContain('/data/test.json');
        });
    });

    describe('Step Management', () => {
        beforeEach(async () => {
            processor = new WorkflowProcessor();
            await new Promise(resolve => setTimeout(resolve, 0));
        });

        test('should add step to workflow', () => {
            processor.addStep();

            expect(processor.workflowSteps.length).toBe(1);
            expect(processor.workflowSteps[0]).toMatchObject({
                operator: '',
                param: ''
            });
        });

        test('should render step UI element', () => {
            processor.addStep();

            const stepElements = document.querySelectorAll('#workflowList .workflow-step');
            expect(stepElements.length).toBe(1);
            expect(stepElements[0].querySelector('.step-number').textContent).toBe('Step 1');
        });

        test('should render operator select with all options', () => {
            processor.addStep();

            const select = document.querySelector('#workflowList select');
            const options = Array.from(select.options);

            expect(options.length).toBe(processor.operators.length + 1); // +1 for placeholder
            expect(options[0].value).toBe('');
            expect(options[0].textContent).toBe('Select Operator...');
        });

        test('should add multiple steps with correct numbering', () => {
            processor.addStep();
            processor.addStep();
            processor.addStep();

            const stepNumbers = document.querySelectorAll('#workflowList .step-number');
            expect(stepNumbers[0].textContent).toBe('Step 1');
            expect(stepNumbers[1].textContent).toBe('Step 2');
            expect(stepNumbers[2].textContent).toBe('Step 3');
        });

        test('should remove step from workflow', () => {
            processor.addStep();
            const stepId = processor.workflowSteps[0].id;

            processor.removeStep(stepId);

            expect(processor.workflowSteps.length).toBe(0);
            expect(document.querySelectorAll('#workflowList .workflow-step').length).toBe(0);
        });

        test('should renumber steps after removal', () => {
            processor.addStep();
            processor.addStep();
            processor.addStep();

            const stepIdToRemove = processor.workflowSteps[1].id;
            processor.removeStep(stepIdToRemove);

            const stepNumbers = document.querySelectorAll('#workflowList .step-number');
            expect(stepNumbers[0].textContent).toBe('Step 1');
            expect(stepNumbers[1].textContent).toBe('Step 2');
        });

        test('should destroy autocomplete adapter on step removal', () => {
            processor.handleSourceSelection(fixtures.mockSource);
            processor.addStep();
            const stepId = processor.workflowSteps[0].id;

            // Simulate selecting jsonpath and creating adapter
            processor.updateStepParam(stepId, 'jsonpath');
            const adapter = processor.adapters[stepId];
            const destroySpy = jest.spyOn(adapter, 'destroy');

            processor.removeStep(stepId);

            expect(destroySpy).toHaveBeenCalled();
            expect(processor.adapters[stepId]).toBeUndefined();
        });
    });

    describe('Step Parameter Updates', () => {
        beforeEach(async () => {
            processor = new WorkflowProcessor();
            await new Promise(resolve => setTimeout(resolve, 0));
            processor.handleSourceSelection(fixtures.mockSource);
            processor.addStep();
        });

        test('should update step operator', () => {
            const stepId = processor.workflowSteps[0].id;
            processor.updateStepParam(stepId, 'json_format');

            expect(processor.workflowSteps[0].operator).toBe('json_format');
        });

        test('should show parameter input for operators with hasParam', () => {
            const stepId = processor.workflowSteps[0].id;
            processor.updateStepParam(stepId, 'jsonpath');

            const paramContainer = document.getElementById(`paramContainer-${stepId}`);
            expect(paramContainer.style.display).toBe('block');
            expect(paramContainer.querySelector('input')).toBeDefined();
        });

        test('should show select for operators with paramType select', () => {
            const stepId = processor.workflowSteps[0].id;
            processor.updateStepParam(stepId, 'custom_function');

            const paramContainer = document.getElementById(`paramContainer-${stepId}`);
            expect(paramContainer.querySelector('select')).toBeDefined();

            const select = paramContainer.querySelector('select');
            expect(select.options.length).toBeGreaterThan(1);
        });

        test('should hide parameter input for operators without hasParam', () => {
            const stepId = processor.workflowSteps[0].id;

            // First show param input
            processor.updateStepParam(stepId, 'jsonpath');
            // Then switch to operator without param
            processor.updateStepParam(stepId, 'json_format');

            const paramContainer = document.getElementById(`paramContainer-${stepId}`);
            expect(paramContainer.style.display).toBe('none');
        });

        test('should create autocomplete adapter for jsonpath operator', () => {
            const stepId = processor.workflowSteps[0].id;
            processor.updateStepParam(stepId, 'jsonpath');

            expect(processor.adapters[stepId]).toBeDefined();
            expect(processor.adapters[stepId]).toBeInstanceOf(RemoteAutocompleteAdapter);
        });

        test('should destroy previous adapter when changing operator', () => {
            const stepId = processor.workflowSteps[0].id;
            processor.updateStepParam(stepId, 'jsonpath');

            const oldAdapter = processor.adapters[stepId];
            const destroySpy = jest.spyOn(oldAdapter, 'destroy');

            processor.updateStepParam(stepId, 'json_format');

            expect(destroySpy).toHaveBeenCalled();
        });
    });

    describe('Run Button State', () => {
        beforeEach(async () => {
            processor = new WorkflowProcessor();
            await new Promise(resolve => setTimeout(resolve, 0));
        });

        test('should be disabled when no source selected', () => {
            processor.addStep();
            const stepId = processor.workflowSteps[0].id;
            processor.updateStepParam(stepId, 'json_format');

            expect(document.getElementById('runBtn').disabled).toBe(true);
        });

        test('should be disabled when no steps added', () => {
            processor.handleSourceSelection(fixtures.mockSource);

            expect(document.getElementById('runBtn').disabled).toBe(true);
        });

        test('should be disabled when step has no operator', () => {
            processor.handleSourceSelection(fixtures.mockSource);
            processor.addStep();

            expect(document.getElementById('runBtn').disabled).toBe(true);
        });

        test('should be disabled when operator requires param but none provided', () => {
            processor.handleSourceSelection(fixtures.mockSource);
            processor.addStep();
            const stepId = processor.workflowSteps[0].id;
            processor.updateStepParam(stepId, 'jsonpath');
            // param is still empty

            expect(document.getElementById('runBtn').disabled).toBe(true);
        });

        test('should be enabled when source selected and all steps valid', () => {
            processor.handleSourceSelection(fixtures.mockSource);
            processor.addStep();
            const stepId = processor.workflowSteps[0].id;
            processor.updateStepParam(stepId, 'json_format');

            expect(document.getElementById('runBtn').disabled).toBe(false);
        });

        test('should be enabled with jsonpath step when param is provided', () => {
            processor.handleSourceSelection(fixtures.mockSource);
            processor.addStep();
            const stepId = processor.workflowSteps[0].id;
            processor.updateStepParam(stepId, 'jsonpath');

            // Simulate param input
            const step = processor.workflowSteps[0];
            step.param = '$.store.book';
            processor.updateRunButton();

            expect(document.getElementById('runBtn').disabled).toBe(false);
        });
    });

    describe('Workflow Execution', () => {
        beforeEach(async () => {
            processor = new WorkflowProcessor();
            await new Promise(resolve => setTimeout(resolve, 0));
            processor.handleSourceSelection(fixtures.mockSource);
            processor.addStep();
            const stepId = processor.workflowSteps[0].id;
            processor.updateStepParam(stepId, 'json_format');
        });

        test('should call API with correct payload', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(fixtures.mockWorkflowResult)
            });

            await processor.runWorkflow();

            expect(global.fetch).toHaveBeenCalledWith('/api/workflow/run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: expect.stringContaining('"source_id":"source-123"')
            });

            const callBody = JSON.parse(global.fetch.mock.calls[0][1].body);
            expect(callBody.source_id).toBe('source-123');
            expect(callBody.file_path).toBe('test-file.json');
            expect(callBody.workflow).toEqual([{ operator: 'json_format', param: '' }]);
        });

        test('should display result in output area', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(fixtures.mockWorkflowResult)
            });

            await processor.runWorkflow();

            const output = document.getElementById('outputArea').value;
            expect(output).toContain('processed');
        });

        test('should update step statuses on success', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(fixtures.mockWorkflowResult)
            });

            await processor.runWorkflow();

            const initialStep = document.getElementById('initialProcessStep');
            expect(initialStep.style.borderColor).toBe('rgb(40, 167, 69)'); // #28a745
        });

        test('should handle API error', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: false,
                json: () => Promise.resolve({ error: 'Processing failed', step_index: 0 })
            });

            await processor.runWorkflow();

            const output = document.getElementById('outputArea').value;
            expect(output).toContain('Error');
            expect(output).toContain('Processing failed');
        });

        test('should mark failed step with error status', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: false,
                json: () => Promise.resolve({ error: 'Step failed', step_index: 0 })
            });

            await processor.runWorkflow();

            const steps = document.querySelectorAll('#workflowList .workflow-step');
            expect(steps[0].style.borderColor).toBe('rgb(220, 53, 69)'); // #dc3545
        });

        test('should handle network error', async () => {
            global.fetch.mockRejectedValueOnce(new Error('Network error'));

            await processor.runWorkflow();

            const output = document.getElementById('outputArea').value;
            expect(output).toContain('Network Error');
        });

        test('should include pagination setting in payload', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(fixtures.mockWorkflowResult)
            });

            document.getElementById('paginationCheckbox').checked = false;
            await processor.runWorkflow();

            const callBody = JSON.parse(global.fetch.mock.calls[0][1].body);
            expect(callBody.enable_pagination).toBe(false);
        });
    });

    describe('Pagination', () => {
        beforeEach(async () => {
            processor = new WorkflowProcessor();
            await new Promise(resolve => setTimeout(resolve, 0));
            processor.handleSourceSelection(fixtures.mockSource);
            processor.addStep();
            const stepId = processor.workflowSteps[0].id;
            processor.updateStepParam(stepId, 'json_format');
        });

        test('should show load more button when has_more is true', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(fixtures.mockPaginatedResult)
            });

            await processor.runWorkflow();

            expect(document.getElementById('loadMoreContainer').style.display).toBe('block');
            expect(processor.currentResultId).toBe('result-456');
            expect(processor.currentOffset).toBe(1000);
        });

        test('should display load more status', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(fixtures.mockPaginatedResult)
            });

            await processor.runWorkflow();

            const status = document.getElementById('loadMoreStatus').textContent;
            expect(status).toContain('1000');
            expect(status).toContain('5000');
        });

        test('should hide load more when has_more is false', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(fixtures.mockWorkflowResult)
            });

            await processor.runWorkflow();

            expect(document.getElementById('loadMoreContainer').style.display).toBe('none');
            expect(processor.currentResultId).toBeNull();
        });

        test('should load more data when button clicked', async () => {
            // Initial run with pagination
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(fixtures.mockPaginatedResult)
            });
            await processor.runWorkflow();

            // Load more
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(fixtures.mockLoadMoreResult)
            });
            await processor.loadMore();

            expect(global.fetch).toHaveBeenCalledWith(
                '/api/workflow/result/result-456?offset=1000'
            );
        });

        test('should append chunk to output', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(fixtures.mockPaginatedResult)
            });
            await processor.runWorkflow();

            const initialOutput = document.getElementById('outputArea').value;

            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(fixtures.mockLoadMoreResult)
            });
            await processor.loadMore();

            const finalOutput = document.getElementById('outputArea').value;
            expect(finalOutput.length).toBeGreaterThan(initialOutput.length);
            expect(finalOutput).toContain(fixtures.mockLoadMoreResult.chunk);
        });

        test('should hide load more after last chunk', async () => {
            processor.currentResultId = 'result-456';
            processor.currentOffset = 1000;
            document.getElementById('loadMoreContainer').style.display = 'block';

            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(fixtures.mockLoadMoreResult)
            });

            await processor.loadMore();

            expect(document.getElementById('loadMoreContainer').style.display).toBe('none');
            expect(processor.currentResultId).toBeNull();
        });

        test('should not call API if no result ID', async () => {
            processor.currentResultId = null;

            await processor.loadMore();

            expect(global.fetch).not.toHaveBeenCalled();
        });

        test('should handle load more error', async () => {
            processor.currentResultId = 'result-456';
            processor.currentOffset = 1000;

            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ success: false, error: 'Result expired' })
            });

            const alertSpy = jest.spyOn(window, 'alert').mockImplementation();
            await processor.loadMore();

            expect(alertSpy).toHaveBeenCalled();
            alertSpy.mockRestore();
        });

        test('should disable button during loading', async () => {
            processor.currentResultId = 'result-456';
            processor.currentOffset = 1000;

            let resolvePromise;
            global.fetch.mockImplementationOnce(() => new Promise(resolve => {
                resolvePromise = resolve;
            }));

            const loadMorePromise = processor.loadMore();

            expect(document.getElementById('loadMoreBtn').disabled).toBe(true);
            expect(document.getElementById('loadMoreBtn').textContent).toBe('Loading...');

            resolvePromise({
                ok: true,
                json: () => Promise.resolve(fixtures.mockLoadMoreResult)
            });

            await loadMorePromise;

            expect(document.getElementById('loadMoreBtn').disabled).toBe(false);
            expect(document.getElementById('loadMoreBtn').textContent).toBe('Load More...');
        });
    });

    describe('Step Status Display', () => {
        beforeEach(async () => {
            processor = new WorkflowProcessor();
            await new Promise(resolve => setTimeout(resolve, 0));
        });

        test('should set loading status', () => {
            const element = document.getElementById('initialProcessStep');
            processor.setStepStatus(element, 'loading', 'Processing...');

            expect(element.style.borderColor).toBe('rgb(0, 123, 255)'); // #007bff
            const statusDiv = element.querySelector('.step-status');
            expect(statusDiv.textContent).toBe('Processing...');
            expect(statusDiv.style.display).toBe('block');
        });

        test('should set success status', () => {
            const element = document.getElementById('initialProcessStep');
            processor.setStepStatus(element, 'success', 'Completed');

            expect(element.style.borderColor).toBe('rgb(40, 167, 69)'); // #28a745
        });

        test('should set error status', () => {
            const element = document.getElementById('initialProcessStep');
            processor.setStepStatus(element, 'error', 'Failed');

            expect(element.style.borderColor).toBe('rgb(220, 53, 69)'); // #dc3545
        });

        test('should set default status', () => {
            const element = document.getElementById('initialProcessStep');
            processor.setStepStatus(element, 'default', '');

            expect(element.style.borderColor).toBe('rgb(221, 221, 221)'); // #ddd
        });

        test('should hide status message when empty', () => {
            const element = document.getElementById('initialProcessStep');
            processor.setStepStatus(element, 'success', '');

            const statusDiv = element.querySelector('.step-status');
            expect(statusDiv.style.display).toBe('none');
        });
    });

    describe('Event Delegation', () => {
        beforeEach(async () => {
            processor = new WorkflowProcessor();
            await new Promise(resolve => setTimeout(resolve, 0));
            processor.handleSourceSelection(fixtures.mockSource);
        });

        test('should handle input changes via delegation', () => {
            processor.addStep();
            const stepId = processor.workflowSteps[0].id;
            processor.updateStepParam(stepId, 'jsonpath');

            const input = document.querySelector(`#paramContainer-${stepId} input`);
            input.value = '$.test';
            input.dispatchEvent(new Event('input', { bubbles: true }));

            expect(processor.workflowSteps[0].param).toBe('$.test');
        });

        test('should handle select changes via delegation', () => {
            processor.addStep();
            const stepId = processor.workflowSteps[0].id;
            processor.updateStepParam(stepId, 'custom_function');

            const select = document.querySelector(`#paramContainer-${stepId} select`);
            select.value = 'uniq';
            select.dispatchEvent(new Event('change', { bubbles: true }));

            expect(processor.workflowSteps[0].param).toBe('uniq');
        });
    });
});

describe('Operator Configurations', () => {
    let processor;

    beforeEach(async () => {
        document.body.innerHTML = `
            <button id="selectSourceBtn">Select File</button>
            <div id="selectedFileInfo"></div>
            <input type="checkbox" id="paginationCheckbox" checked>
            <div id="workflowList"></div>
            <button id="addStepBtn">+ Add Step</button>
            <button id="runBtn" disabled>Run Workflow</button>
            <div id="initialProcessStep" class="workflow-step">
                <div class="step-status"></div>
            </div>
            <textarea id="outputArea"></textarea>
            <div id="loadMoreContainer" style="display: none;">
                <button id="loadMoreBtn">Load More...</button>
                <span id="loadMoreStatus"></span>
            </div>
        `;

        global.createSourceSelector = jest.fn().mockResolvedValue({
            show: jest.fn(),
            hide: jest.fn()
        });

        processor = new WorkflowProcessor();
        await new Promise(resolve => setTimeout(resolve, 0));
    });

    afterEach(() => {
        document.body.innerHTML = '';
        jest.clearAllMocks();
    });

    test('should have json_format operator without params', () => {
        const op = processor.operators.find(o => o.value === 'json_format');
        expect(op).toBeDefined();
        expect(op.hasParam).toBeFalsy();
    });

    test('should have jsonpath operator with text param', () => {
        const op = processor.operators.find(o => o.value === 'jsonpath');
        expect(op).toBeDefined();
        expect(op.hasParam).toBe(true);
        expect(op.paramType).toBe('text');
        expect(op.paramPlaceholder).toBeDefined();
    });

    test('should have custom_function operator with select param', () => {
        const op = processor.operators.find(o => o.value === 'custom_function');
        expect(op).toBeDefined();
        expect(op.hasParam).toBe(true);
        expect(op.paramType).toBe('select');
        expect(op.options).toBeDefined();
        expect(op.options.length).toBeGreaterThan(0);
    });

    test('should have all expected custom function options', () => {
        const op = processor.operators.find(o => o.value === 'custom_function');
        const optionValues = op.options.map(o => o.value);

        expect(optionValues).toContain('uniq');
        expect(optionValues).toContain('sort');
        expect(optionValues).toContain('keys');
        expect(optionValues).toContain('values');
        expect(optionValues).toContain('flatten');
        expect(optionValues).toContain('count');
        expect(optionValues).toContain('first');
        expect(optionValues).toContain('last');
        expect(optionValues).toContain('reverse');
    });

    test('should have conversion operators', () => {
        const operatorValues = processor.operators.map(o => o.value);

        expect(operatorValues).toContain('xml_to_json');
        expect(operatorValues).toContain('yaml_to_json');
    });
});
