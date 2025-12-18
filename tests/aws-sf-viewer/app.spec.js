/**
 * AWS Step Functions Viewer Application Test Suite
 * Tests for the main application logic (app.js)
 */

const { describe, test, expect, beforeEach, afterEach } = require('@jest/globals');

// Mock dependencies before importing the app
const mockParserInstance = {
    parse: jest.fn(),
    getErrors: jest.fn(() => [])
};

const mockElements = {
    remove: jest.fn()
};

// Create a recursive mock for style chaining
const createStyleMock = () => {
    const styleMock = {
        selector: jest.fn(() => styleMock),
        style: jest.fn(() => styleMock),
        update: jest.fn()
    };
    return styleMock;
};

const mockCy = {
    style: jest.fn(() => createStyleMock()),
    resize: jest.fn(),
    on: jest.fn(),
    nodes: jest.fn(() => ({
        filter: jest.fn(() => []),
        removeClass: jest.fn()
    })),
    edges: jest.fn(() => ({
        filter: jest.fn(() => []),
        removeClass: jest.fn()
    })),
    elements: jest.fn(() => mockElements),
    animate: jest.fn(),
    getElementById: jest.fn(),
    fit: jest.fn(),
    zoom: jest.fn(),
    center: jest.fn()
};

const mockRendererInstance = {
    initialize: jest.fn(() => mockCy),
    render: jest.fn(),
    applyLayout: jest.fn(),
    zoomIn: jest.fn(),
    zoomOut: jest.fn(),
    fit: jest.fn(),
    exportAsPNG: jest.fn()
};

// Mock the modules
jest.mock('../../frontend/static/js/aws-sf-viewer/parser.js', () => ({
    StateMachineParser: jest.fn(() => mockParserInstance)
}));

jest.mock('../../frontend/static/js/aws-sf-viewer/renderer.js', () => ({
    StateMachineRenderer: jest.fn(() => mockRendererInstance)
}));

// Import after mocking
const { AwsSfViewerApp, initializeApp } = require('../../frontend/static/js/aws-sf-viewer/app.js');

describe('AwsSfViewerApp', () => {
    let app;
    let documentBody;

    beforeEach(() => {
        jest.clearAllMocks();
        
        // Reset specific mock implementations that might be overridden in tests
        mockCy.nodes.mockReturnValue({
            filter: jest.fn(() => []),
            removeClass: jest.fn()
        });
        mockCy.edges.mockReturnValue({
            filter: jest.fn(() => []),
            removeClass: jest.fn()
        });
        // Reset getElementById
        mockCy.getElementById.mockReset();

        // Setup mock DOM
        document.body.innerHTML = `
            <div class="header">
                <button id="fontIncreaseBtn">+</button>
                <button id="fontDecreaseBtn">-</button>
            </div>
            <div class="toolbar">
                <button id="upload-file-btn">Upload</button>
                <input type="file" id="file-input" />
                <span id="file-name"></span>
                <select id="example-select"></select>
                <select id="layout-select"></select>
                <button id="zoom-in-btn">+</button>
                <button id="zoom-out-btn">-</button>
                <button id="fit-btn">Fit</button>
                <button id="export-btn">Export</button>
            </div>
            <div class="main-container">
                <div id="json-panel" style="width: 300px">
                    <button id="apply-json-btn">Apply</button>
                    <button id="format-json-btn">Format</button>
                    <button id="clear-json-btn">Clear</button>
                    <div id="json-error"></div>
                    <textarea id="json-textarea"></textarea>
                    <div id="json-panel-resize"></div>
                </div>
                <div class="graph-container">
                    <button id="walk-start-btn">Walk</button>
                    <button id="walk-next-btn">Next</button>
                    <button id="walk-stop-btn">Stop</button>
                    <div id="walk-instruction"></div>
                    <div id="cy"></div>
                    <div id="loading" class="hidden"></div>
                    <div id="error-message" class="hidden"></div>
                    <div id="edge-tooltip"></div>
                </div>
                <div id="info-panel" style="width: 200px">
                    <div id="info-panel-resize"></div>
                    <div id="state-details"></div>
                </div>
            </div>
            <div class="status-bar">
                <span id="statusText"></span>
                <span id="stateCount"></span>
                <span id="transitionCount"></span>
            </div>
        `;

        // Initialize app
        app = new AwsSfViewerApp();
    });

    describe('Initialization', () => {
        test('should initialize renderer with correct container', () => {
            const { StateMachineRenderer } = require('../../frontend/static/js/aws-sf-viewer/renderer.js');
            expect(StateMachineRenderer).toHaveBeenCalledWith('cy');
            expect(mockRendererInstance.initialize).toHaveBeenCalled();
        });

        test('should initialize parser', () => {
            const { StateMachineParser } = require('../../frontend/static/js/aws-sf-viewer/parser.js');
            expect(StateMachineParser).toHaveBeenCalled();
        });

        test('should setup event listeners', () => {
            // Verify buttons have click listeners (checking if internal methods are called when clicked)
            // We can check this by triggering clicks and verifying side effects
            const zoomInBtn = document.getElementById('zoom-in-btn');
            zoomInBtn.click();
            expect(mockRendererInstance.zoomIn).toHaveBeenCalled();
        });
    });

    describe('File Handling', () => {
        test('should handle file upload', async () => {
            const fileContent = JSON.stringify({ StartAt: 'Test', States: {} });
            const file = new File([fileContent], 'test.json', { type: 'application/json' });
            
            // Mock file text() method which isn't available in JSDOM file objects by default
            file.text = jest.fn().mockResolvedValue(fileContent);

            const event = {
                target: {
                    files: [file]
                }
            };

            // Mock parser success
            mockParserInstance.parse.mockReturnValue({ nodes: [], edges: [] });

            await app.handleFileUpload(event);

            expect(mockParserInstance.parse).toHaveBeenCalled();
            expect(mockRendererInstance.render).toHaveBeenCalled();
            expect(document.getElementById('file-name').textContent).toBe('test.json');
        });

        test('should handle invalid JSON file', async () => {
            const file = new File(['invalid json'], 'bad.json', { type: 'application/json' });
            file.text = jest.fn().mockResolvedValue('invalid json');

            const event = { target: { files: [file] } };

            await app.handleFileUpload(event);

            const jsonError = document.getElementById('json-error');
            expect(jsonError.classList.contains('show')).toBe(true);
            expect(jsonError.textContent).toContain('Invalid JSON file');
        });
    });

    describe('JSON Editor', () => {
        test('should apply valid JSON from textarea', () => {
            const json = { StartAt: 'A', States: { A: { Type: 'Succeed' } } };
            document.getElementById('json-textarea').value = JSON.stringify(json);
            
            mockParserInstance.parse.mockReturnValue({ nodes: [{id: 'A'}], edges: [] });

            app.applyJson();

            expect(mockParserInstance.parse).toHaveBeenCalledWith(json);
            expect(mockRendererInstance.render).toHaveBeenCalled();
            expect(document.getElementById('json-error').classList.contains('show')).toBe(false);
        });

        test('should show error for invalid JSON in textarea', () => {
            document.getElementById('json-textarea').value = '{ invalid ';

            app.applyJson();

            expect(mockParserInstance.parse).not.toHaveBeenCalled();
            expect(document.getElementById('json-error').textContent).toContain('Invalid JSON');
        });

        test('should format JSON in textarea', () => {
            const json = { a: 1 };
            const unformatted = '{"a":1}';
            document.getElementById('json-textarea').value = unformatted;

            app.formatJson();

            const expected = JSON.stringify(json, null, 2);
            expect(document.getElementById('json-textarea').value).toBe(expected);
        });

        test('should clear JSON and graph', () => {
            document.getElementById('json-textarea').value = '{}';
            
            app.clearJson();

            expect(document.getElementById('json-textarea').value).toBe('');
            expect(mockElements.remove).toHaveBeenCalled();
        });
    });

    describe('Walk Mode', () => {
        test('should not start walk mode without graph', () => {
            app.currentGraph = null;
            app.startWalk();
            
            const errorMsg = document.getElementById('error-message');
            expect(errorMsg.textContent).toBe('Please load a state machine first');
            expect(errorMsg.classList.contains('hidden')).toBe(false);
        });

        test('should start walk mode with valid graph', () => {
            // Setup graph
            app.currentGraph = { nodes: [{id: 'Start'}] };
            
            // Mock cytoscape nodes for start node
            const mockStartNode = { 
                id: jest.fn(() => 'Start'),
                data: jest.fn((key) => key === 'isStart' ? true : {label: 'Start', isStart: true}),
                addClass: jest.fn()
            };
            
            mockCy.nodes.mockReturnValue({
                filter: jest.fn(() => [mockStartNode]),
                removeClass: jest.fn()
            });
            
            // Mock getElementById to return the start node (or any visited node)
            mockCy.getElementById.mockReturnValue(mockStartNode);

            app.startWalk();

            expect(app.walkMode.active).toBe(true);
            expect(document.getElementById('walk-start-btn').style.display).toBe('none');
            expect(document.getElementById('walk-stop-btn').style.display).toBe('inline-block');
            expect(mockStartNode.addClass).toHaveBeenCalledWith('current-node');
        });

        test('should stop walk mode', () => {
            app.walkMode.active = true;
            app.stopWalk();

            expect(app.walkMode.active).toBe(false);
            expect(document.getElementById('walk-start-btn').style.display).toBe('inline-block');
            expect(mockRendererInstance.fit).toHaveBeenCalled();
        });

        test('should handle walk next with single path', () => {
            // Setup graph with current node and one outgoing edge
            const currentNode = { id: jest.fn(() => 'A'), data: jest.fn(() => ({ label: 'A' })), addClass: jest.fn() };
            const nextNode = { id: jest.fn(() => 'B'), data: jest.fn(() => ({ label: 'B', isEnd: false })), addClass: jest.fn() };
            const edge = { 
                id: jest.fn(() => 'e1'), 
                source: jest.fn(() => currentNode), 
                target: jest.fn(() => nextNode),
                addClass: jest.fn()
            };

            app.walkMode.active = true;
            app.walkMode.currentNode = currentNode;
            
            // Mock edges() to return our edge
            mockCy.edges.mockReturnValue({
                filter: jest.fn(() => [edge]),
                removeClass: jest.fn()
            });
            
            // Mock getElementById to return nodes
            mockCy.getElementById.mockImplementation((id) => {
                if (id === 'A') return currentNode;
                if (id === 'B') return nextNode;
                return null;
            });

            app.walkNext();

            expect(app.walkMode.currentNode).toBe(nextNode);
            expect(edge.addClass).toHaveBeenCalledWith('walked-edge');
            expect(nextNode.addClass).toHaveBeenCalledWith('current-node');
        });

        test('should handle walk next with multiple paths (wait for selection)', () => {
             // Setup graph with current node and two outgoing edges
             const currentNode = { id: jest.fn(() => 'A'), data: jest.fn(() => ({ label: 'A' })) };
             const edge1 = { id: jest.fn(() => 'e1'), source: jest.fn(() => currentNode), addClass: jest.fn() };
             const edge2 = { id: jest.fn(() => 'e2'), source: jest.fn(() => currentNode), addClass: jest.fn() };
 
             app.walkMode.active = true;
             app.walkMode.currentNode = currentNode;
             
             mockCy.edges.mockReturnValue({
                 filter: jest.fn(() => [edge1, edge2]),
                 removeClass: jest.fn()
             });
 
             app.walkNext();
 
             expect(app.walkMode.availableEdges).toHaveLength(2);
             expect(edge1.addClass).toHaveBeenCalledWith('available-edge');
             expect(document.getElementById('walk-next-btn').disabled).toBe(true);
             expect(document.getElementById('walk-instruction').innerHTML).toContain('Multiple paths available');
        });

        test('should handle edge click in walk mode to select path', () => {
            const currentNode = { id: jest.fn(() => 'A'), data: jest.fn(() => ({ label: 'A' })) };
            const nextNode = { id: jest.fn(() => 'B'), data: jest.fn(() => ({ label: 'B' })) };
            const edge = { 
                id: jest.fn(() => 'e1'), 
                source: jest.fn(() => currentNode), 
                target: jest.fn(() => nextNode),
                data: jest.fn(() => ({})),
                addClass: jest.fn(),
                removeClass: jest.fn()
            };

            app.walkMode.active = true;
            app.walkMode.currentNode = currentNode;
            app.walkMode.availableEdges = [edge];

            // Trigger edge click
            const evt = { target: edge };
            app.handleEdgeClick(evt);

            expect(app.walkMode.selectedEdge).toBe(edge);
            expect(edge.addClass).toHaveBeenCalledWith('selected-edge');
            expect(document.getElementById('walk-next-btn').disabled).toBe(false);
        });
        
        test('should proceed after edge selection', () => {
             const currentNode = { id: jest.fn(() => 'A'), data: jest.fn(() => ({ label: 'A' })), addClass: jest.fn() };
             const nextNode = { id: jest.fn(() => 'B'), data: jest.fn(() => ({ label: 'B' })), addClass: jest.fn() };
             const edge = { 
                 id: jest.fn(() => 'e1'), 
                 source: jest.fn(() => currentNode), 
                 target: jest.fn(() => nextNode),
                 addClass: jest.fn()
             };
             const otherEdge = { 
                 id: jest.fn(() => 'e2'), 
                 source: jest.fn(() => currentNode), 
                 target: jest.fn(() => nextNode),
                 addClass: jest.fn()
             };
 
             app.walkMode.active = true;
             app.walkMode.currentNode = currentNode;
             app.walkMode.selectedEdge = edge;
             
             // Mock edges return multiple edges to force multi-path logic
             mockCy.edges.mockReturnValue({
                 filter: jest.fn(() => [edge, otherEdge]),
                 removeClass: jest.fn()
             });
             
             // Mock getElementById
             mockCy.getElementById.mockImplementation((id) => {
                 if (id === 'A') return currentNode;
                 if (id === 'B') return nextNode;
                 return null;
             });
 
             app.walkNext();
 
             expect(app.walkMode.currentNode).toBe(nextNode);
             expect(app.walkMode.selectedEdge).toBeNull();
             expect(app.walkMode.availableEdges).toHaveLength(0);
        });

        test('should handle end state reached', () => {
            const currentNode = { id: jest.fn(() => 'End'), data: jest.fn(() => ({ label: 'End' })) };
            
            app.walkMode.active = true;
            app.walkMode.currentNode = currentNode;
            
            // No outgoing edges
            mockCy.edges.mockReturnValue({
                filter: jest.fn(() => []),
                removeClass: jest.fn()
            });

            app.walkNext();

            expect(document.getElementById('walk-instruction').innerHTML).toContain('End state reached');
            expect(document.getElementById('walk-next-btn').disabled).toBe(true);
        });
    });

    describe('Example Loading', () => {
        beforeEach(() => {
            global.fetch = jest.fn();
        });

        test('should load example successfully', async () => {
            const mockJson = { StartAt: 'Example', States: {} };
            global.fetch.mockResolvedValue({
                ok: true,
                json: async () => mockJson
            });
            
            mockParserInstance.parse.mockReturnValue({ nodes: [], edges: [] });

            await app.loadExample('/path/to/example.json');

            expect(global.fetch).toHaveBeenCalledWith('/path/to/example.json');
            expect(mockParserInstance.parse).toHaveBeenCalledWith(mockJson);
            expect(document.getElementById('file-name').textContent).toBe('example.json');
        });

        test('should handle example load failure', async () => {
            global.fetch.mockResolvedValue({
                ok: false,
                statusText: 'Not Found'
            });

            await app.loadExample('/path/to/bad.json');

            expect(document.getElementById('error-message').textContent).toContain('Failed to load example');
            expect(document.getElementById('error-message').classList.contains('hidden')).toBe(false);
        });
    });

    describe('Interactions', () => {
        test('should display node details on click', () => {
            const nodeData = { 
                label: 'TestState', 
                type: 'Task', 
                stateData: { Resource: 'arn:aws:...' } 
            };
            const evt = { target: { data: () => nodeData } };
            
            app.handleNodeClick(evt);
            
            const detailsHtml = document.getElementById('state-details').innerHTML;
            expect(detailsHtml).toContain('TestState');
            expect(detailsHtml).toContain('Task');
            expect(detailsHtml).toContain('arn:aws:...');
        });

        test('should show edge tooltip on click', () => {
            const edgeData = { 
                label: '$.x > 1', 
                isChoice: true,
                conditionData: { Variable: '$.x', NumericGreaterThan: 1 } 
            };
            const evt = { 
                target: { data: () => edgeData },
                renderedPosition: { x: 100, y: 100 }
            };
            
            app.handleEdgeClick(evt);
            
            const tooltip = document.getElementById('edge-tooltip');
            expect(tooltip.style.display).toBe('block');
            expect(tooltip.innerHTML).toContain('Condition'); // Expect "Condition" when conditionData is present
            expect(tooltip.innerHTML).toContain('$.x');
        });

        test('should hide edge tooltip when clicking background', () => {
             document.getElementById('edge-tooltip').style.display = 'block';
             
             // Mock elements property of app to ensure it finds the tooltip
             // But app.elements is set in constructor, should be fine.
             
             // Trigger click on document body
             const clickEvent = new MouseEvent('click', { bubbles: true });
             document.body.dispatchEvent(clickEvent);
             
             expect(document.getElementById('edge-tooltip').style.display).toBe('none');
        });
    });

    describe('UI Controls', () => {
        test('should change font size', () => {
            const initialSize = app.fontSize;
            app.changeFontSize(1);
            expect(app.fontSize).toBe(initialSize + 1);
            expect(document.getElementById('state-details').style.fontSize).toBe((initialSize + 1) + 'px');
        });

        test('should handle resize handles', () => {
            // Testing resize logic is tricky in JSDOM, but we can check if event listeners are attached
            // The logic is inside initPanelResizing which is called in constructor
            const handle = document.getElementById('json-panel-resize');
            
            // Dispatch mousedown
            const mouseDownEvent = new MouseEvent('mousedown', { clientX: 100 });
            handle.dispatchEvent(mouseDownEvent);
            
            // We can't easily verify the global mousemove/mouseup listeners without more complex mocking,
            // but ensuring no error is thrown is a good baseline.
        });
    });
});