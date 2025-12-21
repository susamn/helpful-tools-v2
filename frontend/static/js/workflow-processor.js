/**
 * Workflow Processor - Logic
 */

class RemoteAutocompleteAdapter {
    constructor(inputElement, sourceId, filePath) {
        this.inputElement = inputElement;
        this.sourceId = sourceId;
        this.filePath = filePath;
        this.dropdown = null;
        this.selectedIndex = -1;
        this.suggestions = [];
        this.debounceTimer = null;
        
        this.init();
    }
    
    init() {
        this.dropdown = document.createElement('div');
        this.dropdown.className = 'autocomplete-dropdown';
        this.dropdown.style.display = 'none';
        this.dropdown.style.position = 'fixed';
        document.body.appendChild(this.dropdown);
        
        this.inputElement.addEventListener('input', () => this.onInput());
        this.inputElement.addEventListener('keydown', (e) => this.onKeyDown(e));
        this.inputElement.addEventListener('blur', () => {
            setTimeout(() => this.hide(), 200);
        });
    }
    
    onInput() {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => this.fetchSuggestions(), 300);
    }
    
    async fetchSuggestions() {
        const query = this.inputElement.value;
        if (!query) {
            this.hide();
            return;
        }
        
        try {
            const response = await fetch('/api/workflow/suggest', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    source_id: this.sourceId,
                    file_path: this.filePath,
                    query: query
                })
            });
            
            if (response.ok) {
                const result = await response.json();
                if (result.success && result.suggestions.length > 0) {
                    this.suggestions = result.suggestions;
                    this.show();
                } else {
                    this.hide();
                }
            }
        } catch (e) {
            console.error('Suggestion fetch failed', e);
        }
    }
    
    show() {
        this.dropdown.innerHTML = '';
        this.suggestions.forEach((s, index) => {
            const item = document.createElement('div');
            item.className = 'autocomplete-item';
            item.textContent = s.displayText || s.text;
            item.onclick = () => this.select(index);
            this.dropdown.appendChild(item);
        });
        
        const rect = this.inputElement.getBoundingClientRect();
        this.dropdown.style.left = rect.left + 'px';
        this.dropdown.style.top = (rect.bottom + 2) + 'px';
        this.dropdown.style.width = rect.width + 'px';
        this.dropdown.style.display = 'block';
        this.selectedIndex = -1;
    }
    
    hide() {
        this.dropdown.style.display = 'none';
        this.selectedIndex = -1;
    }
    
    select(index) {
        if (index >= 0 && index < this.suggestions.length) {
            const s = this.suggestions[index];
            const currentVal = this.inputElement.value;
            let newVal = currentVal;
            
            if (s.insertText) {
                newVal += s.insertText;
            } else {
                newVal = s.text;
            }
            
            this.inputElement.value = newVal;
            this.inputElement.dispatchEvent(new Event('input', { bubbles: true }));
            this.hide();
            this.inputElement.focus();
        }
    }
    
    onKeyDown(e) {
        if (this.dropdown.style.display === 'none') return;
        
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            this.selectedIndex = Math.min(this.selectedIndex + 1, this.suggestions.length - 1);
            this.updateSelection();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
            this.updateSelection();
        } else if (e.key === 'Enter') {
            if (this.selectedIndex >= 0) {
                e.preventDefault();
                this.select(this.selectedIndex);
            }
        } else if (e.key === 'Escape') {
            this.hide();
        }
    }
    
    updateSelection() {
        const items = this.dropdown.querySelectorAll('.autocomplete-item');
        items.forEach((item, idx) => {
            if (idx === this.selectedIndex) item.classList.add('selected');
            else item.classList.remove('selected');
        });
    }
    
    destroy() {
        if (this.dropdown) this.dropdown.remove();
    }
}

class WorkflowProcessor {
    constructor() {
        this.selectedSource = null;
        this.workflowSteps = [];
        this.adapters = {}; 
        
        // Pagination state
        this.currentResultId = null;
        this.currentOffset = 0;
        
        this.operators = [
            { value: 'json_format', label: 'JSON Format' },
            { value: 'json_minify', label: 'JSON Minify' },
            { value: 'json_stringify', label: 'JSON Stringify' },
            { value: 'jsonpath', label: 'JSONPath Query', hasParam: true, paramType: 'text', paramPlaceholder: '$.store.book[*].author' },
            { value: 'custom_function', label: 'Custom Function', hasParam: true, paramType: 'select', 
              options: [
                  {value: 'uniq', label: 'Unique (uniq)'},
                  {value: 'sort', label: 'Sort (sort)'},
                  {value: 'keys', label: 'Keys (keys)'},
                  {value: 'values', label: 'Values (values)'},
                  {value: 'flatten', label: 'Flatten (flatten)'},
                  {value: 'count', label: 'Count (count)'},
                  {value: 'first', label: 'First (first)'},
                  {value: 'last', label: 'Last (last)'},
                  {value: 'reverse', label: 'Reverse (reverse)'}
              ] 
            },
            { value: 'xml_to_json', label: 'XML to JSON' },
            { value: 'yaml_to_json', label: 'YAML to JSON' }
        ];

        this.init();
    }

    async init() {
        try {
            const sourceSelector = await createSourceSelector({
                containerId: 'workflowSourceSelector',
                fetchOnSelect: false,
                onFetch: (data, source) => {
                    this.handleSourceSelection(source);
                }
            });
            
            document.getElementById('selectSourceBtn').addEventListener('click', () => {
                sourceSelector.show();
            });
        } catch (e) {
            console.error("Failed to init source selector", e);
        }

        document.getElementById('addStepBtn').addEventListener('click', () => this.addStep());
        document.getElementById('runBtn').addEventListener('click', () => this.runWorkflow());
        document.getElementById('loadMoreBtn').addEventListener('click', () => this.loadMore());
        
        // Delegation for workflow list
        document.getElementById('workflowList').addEventListener('input', (e) => {
            const target = e.target;
            if (target.tagName === 'INPUT' || target.tagName === 'SELECT') {
                const stepEl = target.closest('.workflow-step');
                if (!stepEl) return;
                const id = parseInt(stepEl.dataset.id);
                const step = this.workflowSteps.find(s => s.id === id);
                if (step) step.param = target.value;
                this.updateRunButton();
            }
        });
        
        document.getElementById('workflowList').addEventListener('change', (e) => {
            const target = e.target;
            if (target.tagName === 'SELECT' && !target.hasAttribute('onchange')) {
                 const stepEl = target.closest('.workflow-step');
                 if (!stepEl) return;
                 const id = parseInt(stepEl.dataset.id);
                 const step = this.workflowSteps.find(s => s.id === id);
                 if (step) step.param = target.value;
                 this.updateRunButton();
            }
        });
        
        // Expose helper functions globally for inline onclick
        window.removeStep = (id) => this.removeStep(id);
        window.updateStepParam = (id, val) => this.updateStepParam(id, val);
    }

    handleSourceSelection(source) {
        this.selectedSource = source;
        const path = source.selectedFile || source.path || source.url || 'Unknown path';
        document.getElementById('selectedFileInfo').innerHTML = `
            <strong>Source:</strong> ${source.name}<br>
            <strong>Path:</strong> ${path}<br>
            <strong>Type:</strong> ${source.type}
        `;
        this.updateRunButton();
    }

    addStep() {
        const stepId = Date.now();
        const stepElement = document.createElement('div');
        stepElement.className = 'workflow-step';
        stepElement.dataset.id = stepId;
        
        const stepIndex = this.workflowSteps.length + 1;

        let optionsHtml = this.operators.map(op => `<option value="${op.value}">${op.label}</option>`).join('');

        stepElement.innerHTML = `
            <div class="step-header">
                <span class="step-number">Step ${stepIndex}</span>
                <span class="remove-step" onclick="removeStep(${stepId})">×</span>
            </div>
            <div class="step-controls">
                <select onchange="updateStepParam(${stepId}, this.value)">
                    <option value="">Select Operator...</option>
                    ${optionsHtml}
                </select>
                <div id="paramContainer-${stepId}" class="param-field" style="display:none;">
                </div>
            </div>
            <div class="step-status"></div>
        `;

        document.getElementById('workflowList').appendChild(stepElement);
        this.workflowSteps.push({ id: stepId, operator: '', param: '' });
        this.updateRunButton();
    }

    removeStep(id) {
        const element = document.querySelector(`.workflow-step[data-id="${id}"]`);
        if (element) element.remove();
        this.workflowSteps = this.workflowSteps.filter(s => s.id !== id);
        
        if (this.adapters[id]) {
            this.adapters[id].destroy();
            delete this.adapters[id];
        }
        
        document.querySelectorAll('#workflowList .workflow-step').forEach((el, index) => {
            el.querySelector('.step-number').textContent = `Step ${index + 1}`;
        });
        this.updateRunButton();
    }

    updateStepParam(id, operatorValue) {
        const step = this.workflowSteps.find(s => s.id === id);
        if (step) step.operator = operatorValue;

        const opConfig = this.operators.find(op => op.value === operatorValue);
        const paramContainer = document.getElementById(`paramContainer-${id}`);
        paramContainer.innerHTML = ''; 
        
        if (this.adapters[id]) {
            this.adapters[id].destroy();
            delete this.adapters[id];
        }

        if (opConfig && opConfig.hasParam) {
            paramContainer.style.display = 'block';
            
            if (opConfig.paramType === 'select') {
                const select = document.createElement('select');
                let optsHtml = `<option value="">Select Option...</option>`;
                if (opConfig.options) {
                    optsHtml += opConfig.options.map(o => `<option value="${o.value}">${o.label}</option>`).join('');
                }
                select.innerHTML = optsHtml;
                paramContainer.appendChild(select);
            } else {
                const input = document.createElement('input');
                input.type = 'text';
                input.placeholder = opConfig.paramPlaceholder || 'Parameter';
                paramContainer.appendChild(input);
                
                if (operatorValue === 'jsonpath' && this.selectedSource) {
                    const filePath = this.selectedSource.selectedFile || this.selectedSource.path;
                    this.adapters[id] = new RemoteAutocompleteAdapter(input, this.selectedSource.id, filePath);
                }
            }
        } else {
            paramContainer.style.display = 'none';
            step.param = ''; 
        }
        this.updateRunButton();
    }

    updateRunButton() {
        const hasSource = !!this.selectedSource;
        const hasSteps = this.workflowSteps.length > 0 && this.workflowSteps.every(s => {
            if (!s.operator) return false;
            const opConfig = this.operators.find(op => op.value === s.operator);
            if (opConfig && opConfig.hasParam && !s.param) return false;
            return true;
        });
        document.getElementById('runBtn').disabled = !(hasSource && hasSteps);
    }

    setStepStatus(element, status, message) {
        element.style.borderColor = status === 'success' ? '#28a745' : status === 'error' ? '#dc3545' : status === 'loading' ? '#007bff' : '#ddd';
        const statusDiv = element.querySelector('.step-status');
        if (statusDiv) {
            statusDiv.style.display = message ? 'block' : 'none';
            statusDiv.textContent = message || '';
            statusDiv.style.color = status === 'success' ? '#28a745' : status === 'error' ? '#dc3545' : '#666';
        }
    }

    async runWorkflow() {
        const outputArea = document.getElementById('outputArea');
        const initialStep = document.getElementById('initialProcessStep');
        const loadMoreContainer = document.getElementById('loadMoreContainer');
        
        outputArea.value = 'Processing... please wait.';
        loadMoreContainer.style.display = 'none';
        
        // Reset statuses
        this.setStepStatus(initialStep, 'loading', 'Processing...');
        document.querySelectorAll('.workflow-step[data-id]').forEach(el => {
            this.setStepStatus(el, 'default', '');
        });
        
        const filePath = this.selectedSource.selectedFile || this.selectedSource.path;
        const enablePagination = document.getElementById('paginationCheckbox').checked;
        
        const payload = {
            source_id: this.selectedSource.id,
            file_path: filePath, 
            enable_pagination: enablePagination,
            workflow: this.workflowSteps.map(s => ({ operator: s.operator, param: s.param }))
        };

        try {
            const response = await fetch('/api/workflow/run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const result = await response.json();

            if (response.ok) {
                outputArea.value = typeof result.result === 'object' ? JSON.stringify(result.result, null, 2) : result.result;
                this.setStepStatus(initialStep, 'success', 'Completed');
                // Mark all steps success
                document.querySelectorAll('.workflow-step[data-id]').forEach(el => {
                    this.setStepStatus(el, 'success', 'Completed');
                });
                
                // Handle pagination
                if (result.has_more) {
                    this.currentResultId = result.result_id;
                    this.currentOffset = result.offset;
                    loadMoreContainer.style.display = 'block';
                    document.getElementById('loadMoreStatus').textContent = `Loaded ${result.offset} bytes of ${result.total_size}`;
                } else {
                    this.currentResultId = null;
                    this.currentOffset = 0;
                }
                
            } else {
                outputArea.value = `Error: ${result.error || 'Unknown error'}`;
                
                if (result.step_index !== undefined) {
                    this.setStepStatus(initialStep, 'success', 'Loaded');
                    
                    const steps = document.querySelectorAll('.workflow-step[data-id]');
                    for (let i = 0; i < result.step_index; i++) {
                        this.setStepStatus(steps[i], 'success', 'Completed');
                    }
                    
                    if (steps[result.step_index]) {
                        this.setStepStatus(steps[result.step_index], 'error', `Failed: ${result.error}`);
                    }
                } else {
                    this.setStepStatus(initialStep, 'error', `Failed: ${result.error}`);
                }
            }
        } catch (e) {
            outputArea.value = `Network Error: ${e.message}`;
            this.setStepStatus(initialStep, 'error', 'Network Error');
        }
    }

    async loadMore() {
        if (!this.currentResultId) return;
        
        const btn = document.getElementById('loadMoreBtn');
        btn.disabled = true;
        btn.textContent = 'Loading...';
        
        try {
            const response = await fetch(`/api/workflow/result/${this.currentResultId}?offset=${this.currentOffset}`);
            const data = await response.json();
            
            if (data.success) {
                const outputArea = document.getElementById('outputArea');
                outputArea.value += data.chunk;
                
                this.currentOffset = data.offset;
                document.getElementById('loadMoreStatus').textContent = `Loaded ${this.currentOffset} bytes of ${data.total_size}`;
                
                if (!data.has_more) {
                    document.getElementById('loadMoreContainer').style.display = 'none';
                    this.currentResultId = null;
                }
            } else {
                alert('Failed to load more data: ' + data.error);
            }
        } catch (e) {
            alert('Network error loading more data');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Load More...';
        }
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.workflowProcessor = new WorkflowProcessor();
});

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { RemoteAutocompleteAdapter, WorkflowProcessor };
}
