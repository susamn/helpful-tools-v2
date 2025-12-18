/**
 * AWS Step Functions Renderer Test Suite
 * Tests for AWS Step Functions visualization rendering including graph layout, node rendering, and interactive features
 */

const { describe, test, expect, beforeEach, afterEach } = require('@jest/globals');

// Import the renderer
const { StateMachineRenderer } = require('../../frontend/static/js/aws-sf-viewer/renderer.js');

// Create mock cytoscape instance factory
const createMockCy = () => {
  const elements = [];

  const mockCy = {
    add: jest.fn((element) => {
      elements.push(element);
      return mockCy;
    }),
    elements: jest.fn(() => ({
      remove: jest.fn(),
      length: elements.length
    })),
    nodes: jest.fn(() => ({
      length: elements.filter(e => e.group === 'nodes').length
    })),
    edges: jest.fn(() => ({
      length: elements.filter(e => e.group === 'edges').length
    })),
    style: jest.fn(() => mockCy),
    selector: jest.fn(() => mockCy),
    layout: jest.fn(() => ({
      run: jest.fn()
    })),
    zoom: jest.fn((val) => val !== undefined ? mockCy : 1),
    minZoom: jest.fn(),
    maxZoom: jest.fn(),
    center: jest.fn(),
    fit: jest.fn(),
    resize: jest.fn(),
    pan: jest.fn(),
    png: jest.fn(() => 'data:image/png;base64,test'),
    on: jest.fn(),
    animate: jest.fn(),
    destroy: jest.fn(),
    _elements: elements,
    getElements: () => elements
  };

  return mockCy;
};

// Track the current mock cytoscape instance
let currentMockCy;

describe('AWS Step Functions Renderer', () => {
  let renderer;
  let mockCy;
  let getElementByIdSpy;

  // Sample graph data for testing
  const sampleGraph = {
    nodes: [
      { id: 'Start', label: 'Start', type: 'Task', isStart: true, isEnd: false, data: { Type: 'Task', Resource: 'arn:...' } },
      { id: 'Process', label: 'Process', type: 'Task', isStart: false, isEnd: false, data: { Type: 'Task' } },
      { id: 'End', label: 'End', type: 'Succeed', isStart: false, isEnd: true, data: { Type: 'Succeed' } }
    ],
    edges: [
      { id: 'Start->Process', source: 'Start', target: 'Process', label: '' },
      { id: 'Process->End', source: 'Process', target: 'End', label: '' }
    ],
    metadata: {
      comment: 'Test workflow',
      startAt: 'Start'
    }
  };

  const choiceGraph = {
    nodes: [
      { id: 'Check', label: 'Check', type: 'Choice', isStart: true, isEnd: false, data: { Type: 'Choice' } },
      { id: 'PathA', label: 'PathA', type: 'Succeed', isStart: false, isEnd: true, data: { Type: 'Succeed' } },
      { id: 'PathB', label: 'PathB', type: 'Succeed', isStart: false, isEnd: true, data: { Type: 'Succeed' } }
    ],
    edges: [
      { id: 'Check->PathA', source: 'Check', target: 'PathA', label: '$.value > 10', isChoice: true, conditionData: { Variable: '$.value', NumericGreaterThan: 10 } },
      { id: 'Check->PathB', source: 'Check', target: 'PathB', label: 'Default', isDefault: true }
    ],
    metadata: { startAt: 'Check' }
  };

  const errorGraph = {
    nodes: [
      { id: 'Risky', label: 'Risky', type: 'Task', isStart: true, isEnd: false, data: { Type: 'Task' } },
      { id: 'Handler', label: 'Handler', type: 'Pass', isStart: false, isEnd: false, data: { Type: 'Pass' } },
      { id: 'Done', label: 'Done', type: 'Succeed', isStart: false, isEnd: true, data: { Type: 'Succeed' } }
    ],
    edges: [
      { id: 'Risky->Done', source: 'Risky', target: 'Done', label: '' },
      { id: 'Risky->Handler', source: 'Risky', target: 'Handler', label: 'Catch: States.ALL', isError: true, conditionData: { ErrorEquals: ['States.ALL'] } }
    ],
    metadata: { startAt: 'Risky' }
  };

  const branchGraph = {
    nodes: [
      { id: 'Parallel', label: 'Parallel', type: 'Parallel', isStart: true, isEnd: false, data: { Type: 'Parallel' } },
      { id: 'Parallel:B1:Task1', label: 'Task1', type: 'Task', isStart: false, isEnd: false, isBranchState: true, branchIndex: 1, data: { Type: 'Task' } },
      { id: 'Parallel:B2:Task2', label: 'Task2', type: 'Task', isStart: false, isEnd: false, isBranchState: true, branchIndex: 2, data: { Type: 'Task' } },
      { id: 'End', label: 'End', type: 'Succeed', isStart: false, isEnd: true, data: { Type: 'Succeed' } }
    ],
    edges: [
      { id: 'Parallel->B1', source: 'Parallel', target: 'Parallel:B1:Task1', label: 'B1', isBranch: true },
      { id: 'Parallel->B2', source: 'Parallel', target: 'Parallel:B2:Task2', label: 'B2', isBranch: true },
      { id: 'B1->End', source: 'Parallel:B1:Task1', target: 'End', label: '', isBranchEnd: true },
      { id: 'B2->End', source: 'Parallel:B2:Task2', target: 'End', label: '', isBranchEnd: true }
    ],
    metadata: { startAt: 'Parallel' }
  };

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create a mock container element
    const mockContainer = document.createElement('div');
    mockContainer.id = 'cy';

    // Mock document.getElementById to return our mock container
    getElementByIdSpy = jest.spyOn(document, 'getElementById').mockImplementation((id) => {
      if (id === 'cy') {
        return mockContainer;
      }
      return null;
    });

    // Mock cytoscape globally
    currentMockCy = createMockCy();
    global.cytoscape = jest.fn(() => currentMockCy);

    // Create renderer
    renderer = new StateMachineRenderer('cy');

    // Initialize renderer (this calls cytoscape)
    renderer.initialize();
    mockCy = currentMockCy;
  });

  afterEach(() => {
    // Restore the spy
    if (getElementByIdSpy) {
      getElementByIdSpy.mockRestore();
    }
  });

  describe('Initialization', () => {
    test('should initialize cytoscape with correct container', () => {
      // Cytoscape was called during beforeEach
      expect(global.cytoscape).toHaveBeenCalled();
    });

    test('should set default layout to dagre', () => {
      expect(renderer.currentLayout).toBe('dagre');
    });

    test('should return cytoscape instance', () => {
      expect(renderer.cy).toBeDefined();
    });
  });

  describe('Graph Rendering', () => {
    test('should render state machine as graph', () => {
      renderer.render(sampleGraph);

      // Check nodes were added
      const nodeAdds = mockCy.add.mock.calls.filter(call =>
        call[0].group === 'nodes'
      );
      expect(nodeAdds).toHaveLength(3);

      // Check edges were added
      const edgeAdds = mockCy.add.mock.calls.filter(call =>
        call[0].group === 'edges'
      );
      expect(edgeAdds).toHaveLength(2);
    });

    test('should clear existing elements before rendering', () => {
      renderer.render(sampleGraph);

      expect(mockCy.elements).toHaveBeenCalled();
    });

    test('should apply layout after rendering', () => {
      renderer.render(sampleGraph);

      expect(mockCy.layout).toHaveBeenCalled();
    });

    test('should handle complex branching', () => {
      renderer.render(branchGraph);

      // Check all nodes including branch nodes
      const nodeAdds = mockCy.add.mock.calls.filter(call =>
        call[0].group === 'nodes'
      );
      expect(nodeAdds).toHaveLength(4);

      // Check branch edges
      const edgeAdds = mockCy.add.mock.calls.filter(call =>
        call[0].group === 'edges'
      );
      expect(edgeAdds).toHaveLength(4);
    });
  });

  describe('Node Rendering', () => {
    test('should add node with correct data properties', () => {
      renderer.render(sampleGraph);

      const nodeCall = mockCy.add.mock.calls.find(call =>
        call[0].group === 'nodes' && call[0].data.id === 'Start'
      );

      expect(nodeCall).toBeDefined();
      expect(nodeCall[0].data.label).toBe('Start');
      expect(nodeCall[0].data.type).toBe('Task');
      expect(nodeCall[0].data.isStart).toBe(true);
    });

    test('should mark branch states correctly', () => {
      renderer.render(branchGraph);

      const branchNodeCall = mockCy.add.mock.calls.find(call =>
        call[0].group === 'nodes' && call[0].data.id === 'Parallel:B1:Task1'
      );

      expect(branchNodeCall).toBeDefined();
      expect(branchNodeCall[0].data.isBranchState).toBe(true);
      expect(branchNodeCall[0].data.branchIndex).toBe(1);
    });

    test('should include state data in node', () => {
      renderer.render(sampleGraph);

      const nodeCall = mockCy.add.mock.calls.find(call =>
        call[0].group === 'nodes' && call[0].data.id === 'Start'
      );

      expect(nodeCall[0].data.stateData).toBeDefined();
      expect(nodeCall[0].data.stateData.Type).toBe('Task');
    });
  });

  describe('Edge Rendering', () => {
    test('should add edge with correct source and target', () => {
      renderer.render(sampleGraph);

      const edgeCall = mockCy.add.mock.calls.find(call =>
        call[0].group === 'edges' && call[0].data.id === 'Start->Process'
      );

      expect(edgeCall).toBeDefined();
      expect(edgeCall[0].data.source).toBe('Start');
      expect(edgeCall[0].data.target).toBe('Process');
    });

    test('should mark choice edges correctly', () => {
      renderer.render(choiceGraph);

      const choiceEdge = mockCy.add.mock.calls.find(call =>
        call[0].group === 'edges' && call[0].data.isChoice === true
      );

      expect(choiceEdge).toBeDefined();
      expect(choiceEdge[0].data.label).toBe('$.value > 10');
      expect(choiceEdge[0].data.conditionData).toBeDefined();
    });

    test('should mark default edges correctly', () => {
      renderer.render(choiceGraph);

      const defaultEdge = mockCy.add.mock.calls.find(call =>
        call[0].group === 'edges' && call[0].data.isDefault === true
      );

      expect(defaultEdge).toBeDefined();
      expect(defaultEdge[0].data.label).toBe('Default');
    });

    test('should mark error edges correctly', () => {
      renderer.render(errorGraph);

      const errorEdge = mockCy.add.mock.calls.find(call =>
        call[0].group === 'edges' && call[0].data.isError === true
      );

      expect(errorEdge).toBeDefined();
      expect(errorEdge[0].data.conditionData).toBeDefined();
      expect(errorEdge[0].data.conditionData.ErrorEquals).toContain('States.ALL');
    });

    test('should mark branch edges correctly', () => {
      renderer.render(branchGraph);

      const branchEdge = mockCy.add.mock.calls.find(call =>
        call[0].group === 'edges' && call[0].data.isBranch === true
      );

      expect(branchEdge).toBeDefined();
      expect(branchEdge[0].data.label).toMatch(/B\d/);
    });
  });

  describe('Layout Operations', () => {
    test('should apply dagre layout', () => {
      renderer.applyLayout('dagre');

      expect(mockCy.layout).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'dagre', animate: false })
      );
    });

    test('should apply breadthfirst layout', () => {
      renderer.applyLayout('breadthfirst');

      expect(mockCy.layout).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'breadthfirst' })
      );
    });

    test('should apply circle layout', () => {
      renderer.applyLayout('circle');

      expect(mockCy.layout).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'circle' })
      );
    });

    test('should apply grid layout', () => {
      renderer.applyLayout('grid');

      expect(mockCy.layout).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'grid' })
      );
    });

    test('should update current layout after applying', () => {
      renderer.applyLayout('circle');

      expect(renderer.currentLayout).toBe('circle');
    });
  });

  describe('Zoom Operations', () => {
    test('should zoom in', () => {
      renderer.zoomIn();

      expect(mockCy.zoom).toHaveBeenCalled();
    });

    test('should zoom out', () => {
      renderer.zoomOut();

      expect(mockCy.zoom).toHaveBeenCalled();
    });

    test('should fit graph to viewport', () => {
      renderer.fit();

      expect(mockCy.fit).toHaveBeenCalled();
    });
  });

  describe('Export Features', () => {
    test('should export diagram as PNG', () => {
      const result = renderer.exportAsPNG();

      expect(mockCy.png).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    test('should export with correct options', () => {
      renderer.exportAsPNG();

      expect(mockCy.png).toHaveBeenCalledWith(
        expect.objectContaining({
          bg: '#fafafa',
          full: true
        })
      );
    });
  });

  describe('Style Configuration', () => {
    test('should have styles for different state types', () => {
      const styles = renderer.getStyles();

      // Check for state type selectors
      const selectors = styles.map(s => s.selector);

      expect(selectors).toContain('node[type="Task"], node[type="Pass"]');
      expect(selectors).toContain('node[type="Choice"]');
      expect(selectors).toContain('node[type="Parallel"]');
      expect(selectors).toContain('node[type="Succeed"]');
      expect(selectors).toContain('node[type="Fail"]');
    });

    test('should have styles for start nodes', () => {
      const styles = renderer.getStyles();
      const startStyle = styles.find(s => s.selector === 'node[isStart]');

      expect(startStyle).toBeDefined();
    });

    test('should have styles for end nodes', () => {
      const styles = renderer.getStyles();
      const endStyle = styles.find(s => s.selector === 'node[isEnd]');

      expect(endStyle).toBeDefined();
    });

    test('should have styles for branch states', () => {
      const styles = renderer.getStyles();
      const branchStyle = styles.find(s => s.selector === 'node[isBranchState]');

      expect(branchStyle).toBeDefined();
    });

    test('should have styles for choice edges', () => {
      const styles = renderer.getStyles();
      const choiceEdgeStyle = styles.find(s => s.selector === 'edge[isChoice]');

      expect(choiceEdgeStyle).toBeDefined();
    });

    test('should have styles for error edges', () => {
      const styles = renderer.getStyles();
      const errorEdgeStyle = styles.find(s => s.selector === 'edge[isError]');

      expect(errorEdgeStyle).toBeDefined();
    });
  });
});

describe('StateMachineRenderer Integration', () => {
  describe('Rendering with Parser Output', () => {
    test('should correctly render parser output format', () => {
      const parserOutput = {
        nodes: [
          { id: 'A', label: 'A', type: 'Task', isStart: true, isEnd: false, isBranchState: false, data: {} },
          { id: 'B', label: 'B', type: 'Succeed', isStart: false, isEnd: true, isBranchState: false, data: {} }
        ],
        edges: [
          { id: 'A->B', source: 'A', target: 'B', label: '', isChoice: false, isDefault: false, isError: false, isBranch: false }
        ],
        metadata: { startAt: 'A', comment: 'Test' }
      };

      // Create a mock container element
      const mockContainer = document.createElement('div');
      mockContainer.id = 'cy';

      // Mock document.getElementById to return our mock container
      const spy = jest.spyOn(document, 'getElementById').mockImplementation((id) => {
        if (id === 'cy') {
          return mockContainer;
        }
        return null;
      });

      // Mock cytoscape globally
      const localMockCy = createMockCy();
      global.cytoscape = jest.fn(() => localMockCy);

      const renderer = new StateMachineRenderer('cy');
      renderer.initialize();
      renderer.render(parserOutput);

      // Verify nodes were added
      const nodeAdds = localMockCy.add.mock.calls.filter(call =>
        call[0].group === 'nodes'
      );
      expect(nodeAdds).toHaveLength(2);

      // Verify edges were added
      const edgeAdds = localMockCy.add.mock.calls.filter(call =>
        call[0].group === 'edges'
      );
      expect(edgeAdds).toHaveLength(1);

      spy.mockRestore();
    });
  });
});
