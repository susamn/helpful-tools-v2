/**
 * State Machine Renderer using Cytoscape.js
 */

export class StateMachineRenderer {
    constructor(containerId) {
        this.containerId = containerId;
        this.cy = null;
        this.currentLayout = 'dagre';
    }

    /**
     * Initialize Cytoscape instance
     */
    initialize() {
        const container = document.getElementById(this.containerId);
        if (!container) {
            throw new Error(`Container with id "${this.containerId}" not found`);
        }

        this.cy = cytoscape({
            container: container,
            style: this.getStyles(),
            minZoom: 0.1,
            maxZoom: 3,
            wheelSensitivity: 0.2
        });

        return this.cy;
    }

    /**
     * Get Cytoscape styles
     */
    getStyles() {
        return [
            // Node styles
            {
                selector: 'node',
                style: {
                    'label': 'data(label)',
                    'text-valign': 'center',
                    'text-halign': 'center',
                    'background-color': '#2196F3',
                    'color': '#fff',
                    'text-outline-color': '#2196F3',
                    'text-outline-width': 2,
                    'font-size': '12px',
                    'font-weight': 'bold',
                    'width': 'label',
                    'height': 'label',
                    'padding': '10px',
                    'shape': 'roundrectangle',
                    'border-width': 2,
                    'border-color': '#1976D2'
                }
            },
            // Start state
            {
                selector: 'node[isStart]',
                style: {
                    'background-color': '#4CAF50',
                    'text-outline-color': '#4CAF50',
                    'border-color': '#2E7D32',
                    'border-width': 3
                }
            },
            // End state
            {
                selector: 'node[isEnd]',
                style: {
                    'border-width': 4,
                    'border-style': 'double'
                }
            },
            // Task/Pass state
            {
                selector: 'node[type="Task"], node[type="Pass"]',
                style: {
                    'background-color': '#2196F3',
                    'text-outline-color': '#2196F3'
                }
            },
            // Choice state
            {
                selector: 'node[type="Choice"]',
                style: {
                    'background-color': '#FF9800',
                    'text-outline-color': '#FF9800',
                    'shape': 'diamond',
                    'border-color': '#F57C00'
                }
            },
            // Parallel state
            {
                selector: 'node[type="Parallel"]',
                style: {
                    'background-color': '#9C27B0',
                    'text-outline-color': '#9C27B0',
                    'border-color': '#7B1FA2'
                }
            },
            // Wait state
            {
                selector: 'node[type="Wait"]',
                style: {
                    'background-color': '#00BCD4',
                    'text-outline-color': '#00BCD4',
                    'border-color': '#0097A7'
                }
            },
            // Succeed state
            {
                selector: 'node[type="Succeed"]',
                style: {
                    'background-color': '#4CAF50',
                    'text-outline-color': '#4CAF50',
                    'border-color': '#2E7D32',
                    'shape': 'ellipse'
                }
            },
            // Fail state
            {
                selector: 'node[type="Fail"]',
                style: {
                    'background-color': '#F44336',
                    'text-outline-color': '#F44336',
                    'border-color': '#C62828',
                    'shape': 'octagon'
                }
            },
            // Map state
            {
                selector: 'node[type="Map"]',
                style: {
                    'background-color': '#673AB7',
                    'text-outline-color': '#673AB7',
                    'border-color': '#512DA8'
                }
            },
            // Branch states (states within parallel branches)
            {
                selector: 'node[isBranchState]',
                style: {
                    'border-width': 2,
                    'border-style': 'dashed'
                }
            },
            // Edge styles
            {
                selector: 'edge',
                style: {
                    'width': 2,
                    'line-color': '#999',
                    'target-arrow-color': '#999',
                    'target-arrow-shape': 'triangle',
                    'curve-style': 'bezier',
                    'arrow-scale': 1.5,
                    'label': 'data(label)',
                    'font-size': '10px',
                    'text-rotation': 'autorotate',
                    'text-margin-y': -10,
                    'text-background-color': '#fff',
                    'text-background-opacity': 0.8,
                    'text-background-padding': '3px'
                }
            },
            // Choice edges
            {
                selector: 'edge[isChoice]',
                style: {
                    'line-color': '#FF9800',
                    'target-arrow-color': '#FF9800',
                    'line-style': 'solid'
                }
            },
            // Default choice edge
            {
                selector: 'edge[isDefault]',
                style: {
                    'line-color': '#666',
                    'target-arrow-color': '#666',
                    'line-style': 'dashed'
                }
            },
            // Error handling edge
            {
                selector: 'edge[isError]',
                style: {
                    'line-color': '#F44336',
                    'target-arrow-color': '#F44336',
                    'line-style': 'dashed'
                }
            },
            // Branch edge
            {
                selector: 'edge[isBranch]',
                style: {
                    'line-color': '#9C27B0',
                    'target-arrow-color': '#9C27B0'
                }
            },
            // Selected/highlighted
            {
                selector: ':selected',
                style: {
                    'overlay-color': '#667eea',
                    'overlay-opacity': 0.3,
                    'overlay-padding': 8
                }
            },
            {
                selector: 'node:selected',
                style: {
                    'border-color': '#667eea',
                    'border-width': 4
                }
            }
        ];
    }

    /**
     * Render state machine graph
     * @param {object} graph - Graph structure with nodes and edges
     */
    render(graph) {
        if (!this.cy) {
            this.initialize();
        }

        // Clear existing graph
        this.cy.elements().remove();

        // Add nodes
        graph.nodes.forEach(node => {
            this.cy.add({
                group: 'nodes',
                data: {
                    id: node.id,
                    label: node.label,
                    type: node.type,
                    isStart: node.isStart,
                    isEnd: node.isEnd,
                    isBranchState: node.isBranchState,
                    branchIndex: node.branchIndex,
                    parentParallel: node.parentParallel,
                    stateData: node.data
                }
            });
        });

        // Add edges
        graph.edges.forEach(edge => {
            this.cy.add({
                group: 'edges',
                data: {
                    id: edge.id,
                    source: edge.source,
                    target: edge.target,
                    label: edge.label || '',
                    isChoice: edge.isChoice,
                    isDefault: edge.isDefault,
                    isError: edge.isError,
                    isBranch: edge.isBranch,
                    isBranchEnd: edge.isBranchEnd,
                    conditionData: edge.conditionData
                }
            });
        });

        // Apply layout
        this.applyLayout(this.currentLayout);

        return this.cy;
    }

    /**
     * Apply layout algorithm
     * @param {string} layoutName - Layout algorithm name
     */
    applyLayout(layoutName = 'dagre') {
        if (!this.cy) return;

        this.currentLayout = layoutName;

        const layoutOptions = {
            name: layoutName,
            animate: true,
            animationDuration: 500,
            fit: true,
            padding: 50
        };

        // Special configuration for dagre (hierarchical layout)
        if (layoutName === 'dagre') {
            layoutOptions.rankDir = 'TB'; // Top to bottom
            layoutOptions.nodeSep = 80;
            layoutOptions.rankSep = 100;
        } else if (layoutName === 'breadthfirst') {
            layoutOptions.directed = true;
            layoutOptions.spacingFactor = 1.5;
        } else if (layoutName === 'circle') {
            layoutOptions.radius = 200;
            layoutOptions.spacingFactor = 1.5;
        } else if (layoutName === 'grid') {
            layoutOptions.rows = Math.ceil(Math.sqrt(this.cy.nodes().length));
        }

        const layout = this.cy.layout(layoutOptions);
        layout.run();
    }

    /**
     * Get node at position
     */
    getNodeAtPosition(x, y) {
        if (!this.cy) return null;
        return this.cy.nodes().filter(node => {
            const bb = node.boundingBox();
            return x >= bb.x1 && x <= bb.x2 && y >= bb.y1 && y <= bb.y2;
        })[0];
    }

    /**
     * Fit graph to viewport
     */
    fit() {
        if (this.cy) {
            this.cy.fit(null, 50);
        }
    }

    /**
     * Zoom in
     */
    zoomIn() {
        if (this.cy) {
            this.cy.zoom(this.cy.zoom() * 1.2);
        }
    }

    /**
     * Zoom out
     */
    zoomOut() {
        if (this.cy) {
            this.cy.zoom(this.cy.zoom() * 0.8);
        }
    }

    /**
     * Export graph as image
     */
    exportAsPNG() {
        if (!this.cy) return null;

        const png = this.cy.png({
            output: 'blob',
            bg: '#fafafa',
            full: true,
            scale: 2
        });

        return png;
    }

    /**
     * Get Cytoscape instance
     */
    getInstance() {
        return this.cy;
    }

    /**
     * Destroy renderer
     */
    destroy() {
        if (this.cy) {
            this.cy.destroy();
            this.cy = null;
        }
    }
}
