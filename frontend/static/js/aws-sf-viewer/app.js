/**
 * AWS Step Functions Viewer Application
 * Main application class for the AWS SF Viewer tool
 */

// Dynamic import handling for both browser and Node.js
let NodeParser, NodeRenderer;

if (typeof module !== 'undefined' && module.exports) {
    // Node.js/Jest environment
    const parserModule = require('./parser.js');
    const rendererModule = require('./renderer.js');
    NodeParser = parserModule.StateMachineParser;
    NodeRenderer = rendererModule.StateMachineRenderer;
}

class AwsSfViewerApp {
    constructor() {
        // In browser, use global classes; in Node.js, use required modules
        const ParserClass = (typeof window !== 'undefined' && window.StateMachineParser)
            ? window.StateMachineParser
            : NodeParser;
        const RendererClass = (typeof window !== 'undefined' && window.StateMachineRenderer)
            ? window.StateMachineRenderer
            : NodeRenderer;

        this.parser = new ParserClass();
        this.renderer = new RendererClass('cy');
        this.currentGraph = null;
        this.cy = null;
        this.fontSize = 12;

        // Walk mode state
        this.walkMode = {
            active: false,
            currentNode: null,
            visitedNodes: [],
            visitedEdges: [],
            selectedEdge: null,
            availableEdges: []
        };

        this.initializeUI();
        this.attachEventListeners();
    }

    initializeUI() {
        this.elements = {
            fileInput: document.getElementById('file-input'),
            uploadFileBtn: document.getElementById('upload-file-btn'),
            fileName: document.getElementById('file-name'),
            exampleSelect: document.getElementById('example-select'),
            layoutSelect: document.getElementById('layout-select'),
            zoomInBtn: document.getElementById('zoom-in-btn'),
            zoomOutBtn: document.getElementById('zoom-out-btn'),
            fitBtn: document.getElementById('fit-btn'),
            exportBtn: document.getElementById('export-btn'),
            loading: document.getElementById('loading'),
            errorMessage: document.getElementById('error-message'),
            stateDetails: document.getElementById('state-details'),
            statusText: document.getElementById('statusText'),
            stateCount: document.getElementById('stateCount'),
            transitionCount: document.getElementById('transitionCount'),
            fontIncreaseBtn: document.getElementById('fontIncreaseBtn'),
            fontDecreaseBtn: document.getElementById('fontDecreaseBtn'),
            jsonTextarea: document.getElementById('json-textarea'),
            jsonError: document.getElementById('json-error'),
            applyJsonBtn: document.getElementById('apply-json-btn'),
            formatJsonBtn: document.getElementById('format-json-btn'),
            clearJsonBtn: document.getElementById('clear-json-btn'),
            walkStartBtn: document.getElementById('walk-start-btn'),
            walkNextBtn: document.getElementById('walk-next-btn'),
            walkStopBtn: document.getElementById('walk-stop-btn'),
            walkInstruction: document.getElementById('walk-instruction'),
            jsonPanel: document.getElementById('json-panel'),
            infoPanel: document.getElementById('info-panel'),
            jsonPanelResize: document.getElementById('json-panel-resize'),
            infoPanelResize: document.getElementById('info-panel-resize'),
            edgeTooltip: document.getElementById('edge-tooltip'),
            mainContainer: document.querySelector('.main-container')
        };

        this.cy = this.renderer.initialize();
        this.addWalkStyles();
        this.initPanelResizing();
    }

    addWalkStyles() {
        // Add custom styles for walk mode
        this.cy.style()
            .selector('.current-node')
            .style({
                'border-width': '4px',
                'border-color': '#FF9800',
                'border-style': 'solid',
                'background-color': '#FFF3E0',
                'z-index': 999
            })
            .selector('.visited-node')
            .style({
                'opacity': 0.6,
                'border-width': '2px',
                'border-color': '#9E9E9E'
            })
            .selector('.walked-edge')
            .style({
                'line-color': '#9E9E9E',
                'target-arrow-color': '#9E9E9E',
                'opacity': 0.5,
                'width': 2
            })
            .selector('.available-edge')
            .style({
                'line-color': '#4CAF50',
                'target-arrow-color': '#4CAF50',
                'width': 4,
                'z-index': 100
            })
            .selector('.selected-edge')
            .style({
                'line-color': '#FF9800',
                'target-arrow-color': '#FF9800',
                'width': 5,
                'z-index': 101
            })
            .update();
    }

    initPanelResizing() {
        const setupResize = (handle, panel, direction) => {
            let isResizing = false;
            let startX, startWidth;

            handle.addEventListener('mousedown', (e) => {
                isResizing = true;
                startX = e.clientX;
                startWidth = panel.offsetWidth;
                handle.classList.add('active');
                document.body.style.cursor = 'ew-resize';
                document.body.style.userSelect = 'none';
                e.preventDefault();
            });

            document.addEventListener('mousemove', (e) => {
                if (!isResizing) return;
                const diff = direction === 'right' ? e.clientX - startX : startX - e.clientX;
                const newWidth = Math.max(200, Math.min(startWidth + diff, window.innerWidth * 0.5));
                panel.style.width = newWidth + 'px';
                // Trigger cytoscape resize
                if (this.cy) this.cy.resize();
            });

            document.addEventListener('mouseup', () => {
                if (isResizing) {
                    isResizing = false;
                    handle.classList.remove('active');
                    document.body.style.cursor = '';
                    document.body.style.userSelect = '';
                }
            });
        };

        if (this.elements.jsonPanelResize && this.elements.jsonPanel) {
            setupResize(this.elements.jsonPanelResize, this.elements.jsonPanel, 'right');
        }
        if (this.elements.infoPanelResize && this.elements.infoPanel) {
            setupResize(this.elements.infoPanelResize, this.elements.infoPanel, 'left');
        }
    }

    attachEventListeners() {
        // File upload
        if (this.elements.uploadFileBtn) this.elements.uploadFileBtn.addEventListener('click', () => this.elements.fileInput.click());
        if (this.elements.fileInput) this.elements.fileInput.addEventListener('change', (e) => this.handleFileUpload(e));

        if (this.elements.exampleSelect) this.elements.exampleSelect.addEventListener('change', (e) => this.loadExample(e.target.value));
        if (this.elements.layoutSelect) this.elements.layoutSelect.addEventListener('change', (e) => this.renderer.applyLayout(e.target.value));
        if (this.elements.zoomInBtn) this.elements.zoomInBtn.addEventListener('click', () => this.renderer.zoomIn());
        if (this.elements.zoomOutBtn) this.elements.zoomOutBtn.addEventListener('click', () => this.renderer.zoomOut());
        if (this.elements.fitBtn) this.elements.fitBtn.addEventListener('click', () => this.renderer.fit());
        if (this.elements.exportBtn) this.elements.exportBtn.addEventListener('click', () => this.exportGraph());

        // Font controls
        if (this.elements.fontIncreaseBtn) this.elements.fontIncreaseBtn.addEventListener('click', () => this.changeFontSize(1));
        if (this.elements.fontDecreaseBtn) this.elements.fontDecreaseBtn.addEventListener('click', () => this.changeFontSize(-1));

        // JSON editor controls
        if (this.elements.applyJsonBtn) this.elements.applyJsonBtn.addEventListener('click', () => this.applyJson());
        if (this.elements.formatJsonBtn) this.elements.formatJsonBtn.addEventListener('click', () => this.formatJson());
        if (this.elements.clearJsonBtn) this.elements.clearJsonBtn.addEventListener('click', () => this.clearJson());

        // Walk controls
        if (this.elements.walkStartBtn) this.elements.walkStartBtn.addEventListener('click', () => this.startWalk());
        if (this.elements.walkNextBtn) this.elements.walkNextBtn.addEventListener('click', () => this.walkNext());
        if (this.elements.walkStopBtn) this.elements.walkStopBtn.addEventListener('click', () => this.stopWalk());

        if (this.cy) {
            this.cy.on('tap', 'node', (evt) => this.handleNodeClick(evt));
            this.cy.on('tap', 'edge', (evt) => this.handleEdgeClick(evt));
            this.cy.on('tap', (evt) => {
                if (evt.target === this.cy) {
                    this.clearStateDetails();
                    this.hideEdgeTooltip();
                }
            });
        }

        // Close edge tooltip when clicking outside
        document.addEventListener('click', (e) => {
            if (this.elements.edgeTooltip &&
                !this.elements.edgeTooltip.contains(e.target) &&
                !e.target.closest('#cy')) {
                this.hideEdgeTooltip();
            }
        });
    }

    changeFontSize(delta) {
        this.fontSize = Math.max(8, Math.min(20, this.fontSize + delta));
        if (this.elements.stateDetails) {
            this.elements.stateDetails.style.fontSize = this.fontSize + 'px';
        }
    }

    async handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        if (this.elements.fileName) this.elements.fileName.textContent = file.name;
        if (this.elements.exampleSelect) this.elements.exampleSelect.value = ''; // Reset example dropdown
        this.showLoading(true);
        this.hideError();

        try {
            const text = await file.text();
            const json = JSON.parse(text);
            this.currentJson = json;
            this.displayJson(json);
            this.renderStateMachine(json);
            if (this.elements.statusText) this.elements.statusText.textContent = `Loaded: ${file.name}`;
        } catch (error) {
            this.showJsonError(`Invalid JSON file: ${error.message}`);
            this.showError(`Failed to load file: ${error.message}`);
            if (this.elements.statusText) this.elements.statusText.textContent = 'Error loading file';
        } finally {
            this.showLoading(false);
        }
    }

    async loadExample(path) {
        if (!path) return;

        if (this.elements.fileInput) this.elements.fileInput.value = ''; // Reset file input
        this.showLoading(true);
        this.hideError();

        try {
            const response = await fetch(path);
            if (!response.ok) {
                throw new Error(`Failed to load example: ${response.statusText}`);
            }
            const json = await response.json();
            this.currentJson = json;
            this.displayJson(json);
            this.renderStateMachine(json);
            if (this.elements.fileName) this.elements.fileName.textContent = path.split('/').pop();
            if (this.elements.statusText) this.elements.statusText.textContent = `Loaded example: ${path.split('/').pop()}`;
        } catch (error) {
            this.showJsonError(`Failed to load example: ${error.message}`);
            this.showError(`Failed to load example: ${error.message}`);
            if (this.elements.statusText) this.elements.statusText.textContent = 'Error loading example';
        } finally {
            this.showLoading(false);
        }
    }

    displayJson(json) {
        if (!this.elements.jsonTextarea) return;
        const formatted = JSON.stringify(json, null, 2);
        this.elements.jsonTextarea.value = formatted;
        this.hideJsonError();
    }

    applyJson() {
        if (!this.elements.jsonTextarea) return;
        const jsonText = this.elements.jsonTextarea.value.trim();

        if (!jsonText) {
            this.showJsonError('Please enter JSON data');
            return;
        }

        try {
            const json = JSON.parse(jsonText);
            this.currentJson = json;
            this.hideJsonError();
            this.renderStateMachine(json);
            if (this.elements.statusText) this.elements.statusText.textContent = 'JSON applied successfully';
            if (this.elements.fileName) this.elements.fileName.textContent = 'Manual JSON';
        } catch (error) {
            this.showJsonError(`Invalid JSON: ${error.message}`);
            if (this.elements.statusText) this.elements.statusText.textContent = 'Invalid JSON';
        }
    }

    formatJson() {
        if (!this.elements.jsonTextarea) return;
        const jsonText = this.elements.jsonTextarea.value.trim();

        if (!jsonText) {
            this.showJsonError('No JSON to format');
            return;
        }

        try {
            const json = JSON.parse(jsonText);
            const formatted = JSON.stringify(json, null, 2);
            this.elements.jsonTextarea.value = formatted;
            this.hideJsonError();
            if (this.elements.statusText) this.elements.statusText.textContent = 'JSON formatted';
        } catch (error) {
            this.showJsonError(`Cannot format invalid JSON: ${error.message}`);
        }
    }

    clearJson() {
        if (this.elements.jsonTextarea) this.elements.jsonTextarea.value = '';
        this.hideJsonError();
        if (this.cy) this.cy.elements().remove();
        this.clearStateDetails();
        if (this.elements.stateCount) this.elements.stateCount.textContent = '0';
        if (this.elements.transitionCount) this.elements.transitionCount.textContent = '0';
        if (this.elements.statusText) this.elements.statusText.textContent = 'JSON cleared';
        if (this.elements.fileName) this.elements.fileName.textContent = 'No file selected';
    }

    showJsonError(message) {
        if (!this.elements.jsonError) return;
        this.elements.jsonError.textContent = message;
        this.elements.jsonError.classList.add('show');
    }

    hideJsonError() {
        if (!this.elements.jsonError) return;
        this.elements.jsonError.classList.remove('show');
    }

    renderStateMachine(json) {
        try {
            const graph = this.parser.parse(json);
            this.currentGraph = graph;
            this.renderer.render(graph);
            this.clearStateDetails();
            this.hideError();
            this.hideJsonError();

            // Update status
            if (this.elements.stateCount) this.elements.stateCount.textContent = graph.nodes.length;
            if (this.elements.transitionCount) this.elements.transitionCount.textContent = graph.edges.length;
            if (this.elements.statusText) this.elements.statusText.textContent = 'State machine loaded successfully';
        } catch (error) {
            this.showJsonError(`Parse Error: ${error.message}`);
            this.showError(error.message);
            if (this.elements.statusText) this.elements.statusText.textContent = 'Error parsing state machine';
            throw error;
        }
    }

    handleNodeClick(evt) {
        const node = evt.target;
        const data = node.data();
        this.displayStateDetails(data);
    }

    displayStateDetails(data) {
        if (!this.elements.stateDetails) return;
        const stateData = data.stateData;

        let html = `
            <div class="state-info">
                <h4>${data.label}</h4>
                <div class="property">
                    <span class="property-label">Type:</span>
                    <span class="property-value">${data.type}</span>
                </div>
                ${data.isStart ? '<div class="property"><span class="property-label">Role:</span><span class="property-value">Start State</span></div>' : ''}
                ${data.isEnd ? '<div class="property"><span class="property-label">Role:</span><span class="property-value">End State</span></div>' : ''}
        `;

        if (stateData) {
            if (stateData.Resource) {
                html += `<div class="property"><span class="property-label">Resource:</span><span class="property-value">${stateData.Resource}</span></div>`;
            }
            if (stateData.Next) {
                html += `<div class="property"><span class="property-label">Next:</span><span class="property-value">${stateData.Next}</span></div>`;
            }
            if (stateData.Comment) {
                html += `<div class="property"><span class="property-label">Comment:</span><span class="property-value">${stateData.Comment}</span></div>`;
            }
            if (stateData.TimeoutSeconds) {
                html += `<div class="property"><span class="property-label">Timeout:</span><span class="property-value">${stateData.TimeoutSeconds}s</span></div>`;
            }
            if (stateData.Seconds) {
                html += `<div class="property"><span class="property-label">Wait Time:</span><span class="property-value">${stateData.Seconds}s</span></div>`;
            }
            if (stateData.Error) {
                html += `<div class="property"><span class="property-label">Error:</span><span class="property-value">${stateData.Error}</span></div>`;
            }
            if (stateData.Cause) {
                html += `<div class="property"><span class="property-label">Cause:</span><span class="property-value">${stateData.Cause}</span></div>`;
            }
            if (stateData.Retry && stateData.Retry.length > 0) {
                html += `<h4>Retry Configuration</h4><div class="property"><span class="property-label">Attempts:</span><span class="property-value">${stateData.Retry[0].MaxAttempts || 'N/A'}</span></div>`;
            }
            if (stateData.Catch && stateData.Catch.length > 0) {
                html += `<h4>Error Handlers</h4>`;
                stateData.Catch.forEach((catcher, idx) => {
                    html += `<div class="property"><span class="property-label">Catch ${idx + 1}:</span><span class="property-value">${catcher.ErrorEquals.join(', ')} → ${catcher.Next}</span></div>`;
                });
            }
            html += `<h4>Full State Definition</h4><pre>${JSON.stringify(stateData, null, 2)}</pre>`;
        }

        html += '</div>';
        this.elements.stateDetails.innerHTML = html;
    }

    clearStateDetails() {
        if (this.elements.stateDetails) {
            this.elements.stateDetails.innerHTML = '<p class="placeholder">Click on a state to view details</p>';
        }
    }

    exportGraph() {
        try {
            const blob = this.renderer.exportAsPNG();
            if (blob) {
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.download = 'state-machine.png';
                link.href = url;
                link.click();
                URL.revokeObjectURL(url);
                if (this.elements.statusText) this.elements.statusText.textContent = 'Exported as PNG';
            }
        } catch (error) {
            this.showError(`Failed to export: ${error.message}`);
            if (this.elements.statusText) this.elements.statusText.textContent = 'Export failed';
        }
    }

    showLoading(show) {
        if (!this.elements.loading) return;
        if (show) {
            this.elements.loading.classList.remove('hidden');
        } else {
            this.elements.loading.classList.add('hidden');
        }
    }

    showError(message) {
        if (!this.elements.errorMessage) return;
        this.elements.errorMessage.textContent = message;
        this.elements.errorMessage.classList.remove('hidden');
        setTimeout(() => this.hideError(), 5000);
    }

    hideError() {
        if (this.elements.errorMessage) {
            this.elements.errorMessage.classList.add('hidden');
        }
    }

    // ===== WALK MODE FUNCTIONS =====

    startWalk() {
        if (!this.currentGraph || !this.currentGraph.nodes || this.currentGraph.nodes.length === 0) {
            this.showError('Please load a state machine first');
            return;
        }

        // Reset walk state
        this.walkMode = {
            active: true,
            currentNode: null,
            visitedNodes: [],
            visitedEdges: [],
            selectedEdge: null,
            availableEdges: []
        };

        // Find start node
        const startNode = this.cy.nodes().filter(node => node.data('isStart'));
        if (startNode.length === 0) {
            this.showError('No start state found');
            return;
        }

        // Reset all styles
        this.resetWalkStyles();

        // Set current node
        this.walkMode.currentNode = startNode[0];
        this.walkMode.visitedNodes.push(startNode[0].id());

        // Update UI
        if (this.elements.walkStartBtn) this.elements.walkStartBtn.style.display = 'none';
        if (this.elements.walkNextBtn) this.elements.walkNextBtn.style.display = 'inline-block';
        if (this.elements.walkStopBtn) this.elements.walkStopBtn.style.display = 'inline-block';

        // Highlight and zoom to start node
        this.highlightCurrentNode();
        this.cy.animate({
            center: { eles: startNode[0] },
            zoom: 1.5
        }, {
            duration: 500
        });

        // Show state details
        this.displayStateDetails(startNode[0].data());

        // Show instruction
        this.showInstruction(`Starting at: <strong>${startNode[0].data('label')}</strong><br>Click "Next" to proceed`);
        if (this.elements.statusText) this.elements.statusText.textContent = 'Walk mode: Started';
    }

    walkNext() {
        if (!this.walkMode.currentNode) return;

        const currentNodeId = this.walkMode.currentNode.id();

        // Get outgoing edges
        const outgoingEdges = this.cy.edges().filter(edge => edge.source().id() === currentNodeId);

        if (outgoingEdges.length === 0) {
            // Reached end state
            this.showInstruction(`<strong>End state reached!</strong><br>No more transitions`);
            if (this.elements.walkNextBtn) this.elements.walkNextBtn.disabled = true;
            if (this.elements.statusText) this.elements.statusText.textContent = 'Walk mode: End reached';
            return;
        }

        if (outgoingEdges.length === 1) {
            // Single path - move directly
            this.moveToNextNode(outgoingEdges[0]);
        } else {
            // Multiple paths - let user select
            if (this.walkMode.selectedEdge) {
                // User has selected an edge
                this.moveToNextNode(this.walkMode.selectedEdge);
                this.walkMode.selectedEdge = null;
                this.walkMode.availableEdges = [];
            } else {
                // Show available edges for selection
                this.walkMode.availableEdges = outgoingEdges;
                this.highlightAvailableEdges();
                this.showInstruction(`<strong>Multiple paths available!</strong><br>Click on an edge to select your path`);
                if (this.elements.walkNextBtn) this.elements.walkNextBtn.disabled = true;
                if (this.elements.statusText) this.elements.statusText.textContent = 'Walk mode: Select a path';
            }
        }
    }

    moveToNextNode(edge) {
        const nextNode = edge.target();

        // Mark edge as visited
        this.walkMode.visitedEdges.push(edge.id());
        edge.addClass('walked-edge');

        // Move to next node
        this.walkMode.currentNode = nextNode;
        this.walkMode.visitedNodes.push(nextNode.id());

        // Update visuals
        this.highlightCurrentNode();
        this.cy.animate({
            center: { eles: nextNode },
            zoom: 1.5
        }, {
            duration: 500
        });

        // Show state details
        this.displayStateDetails(nextNode.data());

        // Update instruction
        const isEndState = nextNode.data('isEnd');
        if (isEndState) {
            this.showInstruction(`<strong>${nextNode.data('label')}</strong><br>End state reached!`);
            if (this.elements.walkNextBtn) this.elements.walkNextBtn.disabled = true;
        } else {
            this.showInstruction(`Now at: <strong>${nextNode.data('label')}</strong><br>Click "Next" to continue`);
            if (this.elements.walkNextBtn) this.elements.walkNextBtn.disabled = false;
        }

        if (this.elements.statusText) this.elements.statusText.textContent = `Walk mode: At ${nextNode.data('label')}`;
    }

    handleEdgeClick(evt) {
        const clickedEdge = evt.target;
        const edgeData = clickedEdge.data();

        // Show condition tooltip for choice/condition edges
        if (edgeData.conditionData || edgeData.isChoice || edgeData.isDefault || edgeData.isError) {
            this.showEdgeTooltip(evt, edgeData);
        }

        // Walk mode handling
        if (!this.walkMode.active) return;
        if (this.walkMode.availableEdges.length === 0) return;

        // Check if this edge is in available edges
        const isAvailable = this.walkMode.availableEdges.some(e => e.id() === clickedEdge.id());
        if (!isAvailable) return;

        // Select this edge
        this.walkMode.selectedEdge = clickedEdge;

        // Update visuals
        this.walkMode.availableEdges.forEach(edge => {
            edge.removeClass('available-edge');
            if (edge.id() === clickedEdge.id()) {
                edge.addClass('selected-edge');
            }
        });

        // Enable Next button
        if (this.elements.walkNextBtn) this.elements.walkNextBtn.disabled = false;

        const targetLabel = clickedEdge.target().data('label');
        this.showInstruction(`<strong>Path selected</strong> → ${targetLabel}<br>Click "Next" to proceed`);
    }

    showEdgeTooltip(evt, edgeData) {
        const tooltip = this.elements.edgeTooltip;
        if (!tooltip) return;

        const renderedPosition = evt.renderedPosition;
        const container = this.elements.mainContainer;
        if (!container) return;

        const containerRect = container.getBoundingClientRect();

        let title = 'Transition';
        let conditionHtml = '';

        if (edgeData.isDefault) {
            title = 'Default Path';
            conditionHtml = '<p>This path is taken when no other conditions match.</p>';
        } else if (edgeData.isError) {
            title = 'Error Handler';
            if (edgeData.conditionData) {
                conditionHtml = `<pre>${JSON.stringify(edgeData.conditionData, null, 2)}</pre>`;
            } else {
                conditionHtml = `<p>Catches errors: ${edgeData.label.replace('Catch: ', '')}</p>`;
            }
        } else if (edgeData.conditionData) {
            title = 'Condition';
            conditionHtml = `<pre>${JSON.stringify(edgeData.conditionData, null, 2)}</pre>`;
        } else if (edgeData.isChoice) {
            title = 'Choice Condition';
            conditionHtml = `<p>${edgeData.label || 'Condition'}</p>`;
        }

        tooltip.innerHTML = `
            <div class="edge-tooltip-header">
                <span class="edge-tooltip-title">${title}</span>
                <button class="edge-tooltip-close" onclick="this.closest('.edge-tooltip').style.display='none'">×</button>
            </div>
            ${conditionHtml}
            <div class="edge-tooltip-transition">
                <strong>${edgeData.source}</strong> → <strong>${edgeData.target}</strong>
            </div>
        `;

        // Position tooltip near the click
        let left = renderedPosition.x + 10;
        let top = renderedPosition.y + 10;

        // Ensure tooltip stays within container
        tooltip.style.display = 'block';
        const tooltipRect = tooltip.getBoundingClientRect();

        if (left + tooltipRect.width > containerRect.width - 20) {
            left = renderedPosition.x - tooltipRect.width - 10;
        }
        if (top + tooltipRect.height > containerRect.height - 20) {
            top = renderedPosition.y - tooltipRect.height - 10;
        }

        tooltip.style.left = Math.max(10, left) + 'px';
        tooltip.style.top = Math.max(10, top) + 'px';
    }

    hideEdgeTooltip() {
        if (this.elements.edgeTooltip) {
            this.elements.edgeTooltip.style.display = 'none';
        }
    }

    stopWalk() {
        // Reset walk state
        this.walkMode.active = false;
        this.walkMode.currentNode = null;
        this.walkMode.visitedNodes = [];
        this.walkMode.visitedEdges = [];
        this.walkMode.selectedEdge = null;
        this.walkMode.availableEdges = [];

        // Reset styles
        this.resetWalkStyles();

        // Update UI
        if (this.elements.walkStartBtn) this.elements.walkStartBtn.style.display = 'inline-block';
        if (this.elements.walkNextBtn) this.elements.walkNextBtn.style.display = 'none';
        if (this.elements.walkStopBtn) this.elements.walkStopBtn.style.display = 'none';
        if (this.elements.walkNextBtn) this.elements.walkNextBtn.disabled = false;
        this.hideInstruction();

        // Fit graph
        this.renderer.fit();

        if (this.elements.statusText) this.elements.statusText.textContent = 'Walk mode stopped';
    }

    highlightCurrentNode() {
        // Remove previous highlights
        this.cy.nodes().removeClass('current-node visited-node');

        // Mark visited nodes
        this.walkMode.visitedNodes.forEach(nodeId => {
            const node = this.cy.getElementById(nodeId);
            if (node.id() !== this.walkMode.currentNode.id()) {
                node.addClass('visited-node');
            }
        });

        // Highlight current node
        if (this.walkMode.currentNode) {
            this.walkMode.currentNode.addClass('current-node');
        }
    }

    highlightAvailableEdges() {
        // Remove previous edge highlights
        this.cy.edges().removeClass('available-edge selected-edge');

        // Highlight available edges with pulsing effect
        this.walkMode.availableEdges.forEach(edge => {
            edge.addClass('available-edge');
        });
    }

    resetWalkStyles() {
        this.cy.nodes().removeClass('current-node visited-node');
        this.cy.edges().removeClass('walked-edge available-edge selected-edge');
    }

    showInstruction(html) {
        if (this.elements.walkInstruction) {
            this.elements.walkInstruction.innerHTML = html;
            this.elements.walkInstruction.classList.add('show');
        }
    }

    hideInstruction() {
        if (this.elements.walkInstruction) {
            this.elements.walkInstruction.classList.remove('show');
        }
    }
}

// Wait for all libraries to load before initializing
let initAttempts = 0;
function initializeApp() {
    initAttempts++;

    if (typeof cytoscape === 'undefined' || typeof dagre === 'undefined') {
        if (initAttempts < 50) {
            console.log('Waiting for libraries to load... attempt', initAttempts);
            setTimeout(initializeApp, 100);
        } else {
            console.error('Failed to load required libraries after 5 seconds');
            const errorMsg = document.getElementById('error-message');
            if (errorMsg) {
                errorMsg.textContent = 'Failed to load visualization libraries. Please refresh the page.';
                errorMsg.classList.remove('hidden');
            }
        }
        return;
    }

    console.log('Cytoscape and dagre loaded successfully');
    // Check if these properties exist before accessing them to be safe,
    // though in browser they should
    if (dagre.version) console.log('Dagre version:', dagre.version);
    if (cytoscape.version) console.log('Cytoscape version:', cytoscape.version);

    window.awsSfViewerApp = new AwsSfViewerApp();
}

// Check if we are in a browser environment before attaching window events
if (typeof window !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeApp);
    } else {
        initializeApp();
    }
}

// Export for Node.js (CommonJS)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AwsSfViewerApp, initializeApp };
}
