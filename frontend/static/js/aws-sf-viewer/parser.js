/**
 * AWS Step Functions State Machine Parser
 * Parses Amazon States Language (ASL) JSON format
 */

class StateMachineParser {
    constructor() {
        this.stateMachine = null;
        this.errors = [];
    }

    /**
     * Parse AWS Step Functions JSON
     * @param {string|object} json - JSON string or object
     * @returns {object} Parsed state machine structure
     */
    parse(json) {
        this.errors = [];

        try {
            // Parse JSON if string
            if (typeof json === 'string') {
                this.stateMachine = JSON.parse(json);
            } else {
                this.stateMachine = json;
            }

            // Validate structure
            this.validate();

            if (this.errors.length > 0) {
                throw new Error(`Validation errors: ${this.errors.join(', ')}`);
            }

            // Extract graph structure
            return this.extractGraph();
        } catch (error) {
            throw new Error(`Parse error: ${error.message}`);
        }
    }

    /**
     * Validate state machine structure
     */
    validate() {
        if (!this.stateMachine) {
            this.errors.push('State machine is null or undefined');
            return;
        }

        // Check required fields
        if (!this.stateMachine.StartAt) {
            this.errors.push('Missing required field: StartAt');
        }

        if (!this.stateMachine.States) {
            this.errors.push('Missing required field: States');
            return;
        }

        // Validate StartAt state exists
        if (this.stateMachine.StartAt && !this.stateMachine.States[this.stateMachine.StartAt]) {
            this.errors.push(`StartAt state "${this.stateMachine.StartAt}" not found in States`);
        }

        // Validate each state
        for (const [stateName, state] of Object.entries(this.stateMachine.States)) {
            this.validateState(stateName, state);
        }
    }

    /**
     * Validate individual state
     */
    validateState(stateName, state) {
        if (!state.Type) {
            this.errors.push(`State "${stateName}" missing Type field`);
            return;
        }

        const validTypes = ['Task', 'Pass', 'Choice', 'Wait', 'Succeed', 'Fail', 'Parallel', 'Map'];
        if (!validTypes.includes(state.Type)) {
            this.errors.push(`State "${stateName}" has invalid Type: ${state.Type}`);
        }

        // Validate Next references
        if (state.Next && !this.stateMachine.States[state.Next]) {
            this.errors.push(`State "${stateName}" references non-existent Next state: ${state.Next}`);
        }

        // Validate Choice state
        if (state.Type === 'Choice' && !state.Choices) {
            this.errors.push(`Choice state "${stateName}" missing Choices field`);
        }

        // Validate Parallel state
        if (state.Type === 'Parallel' && !state.Branches) {
            this.errors.push(`Parallel state "${stateName}" missing Branches field`);
        }
    }

    /**
     * Extract graph structure for visualization
     * @returns {object} Graph with nodes and edges
     */
    extractGraph() {
        const nodes = [];
        const edges = [];
        const startState = this.stateMachine.StartAt;

        // Process top-level states
        this.processStates(
            this.stateMachine.States,
            startState,
            '', // no prefix for top-level
            null, // no parent parallel
            null, // no next state override
            nodes,
            edges
        );

        return {
            nodes,
            edges,
            metadata: {
                comment: this.stateMachine.Comment || '',
                version: this.stateMachine.Version || '1.0',
                timeoutSeconds: this.stateMachine.TimeoutSeconds,
                startAt: startState
            }
        };
    }

    /**
     * Recursively process states and their nested structures
     * @param {object} states - States object to process
     * @param {string} startAt - The start state name
     * @param {string} prefix - Prefix for node IDs (for nested states)
     * @param {string} parentNodeId - Parent node ID (for connecting from parent)
     * @param {string} exitTargetId - Target node ID when branch ends
     * @param {array} nodes - Nodes array to populate
     * @param {array} edges - Edges array to populate
     * @param {object} options - Additional options (branchIndex, isIterator, etc.)
     */
    processStates(states, startAt, prefix, parentNodeId, exitTargetId, nodes, edges, options = {}) {
        const { branchIndex, isIterator, branchLabel } = options;

        for (const [stateName, state] of Object.entries(states)) {
            const nodeId = prefix ? `${prefix}:${stateName}` : stateName;
            const isStart = stateName === startAt;
            const isEnd = state.End === true || state.Type === 'Succeed' || state.Type === 'Fail';

            // Create node
            nodes.push({
                id: nodeId,
                label: stateName,
                type: state.Type,
                isStart: isStart && !prefix, // Only mark as start if top-level
                isEnd: isEnd && !prefix, // Only mark as end if top-level
                isBranchState: !!prefix,
                branchIndex: branchIndex,
                isIteratorState: isIterator,
                data: state
            });

            // Edge from parent (parallel/map) to branch start
            if (isStart && parentNodeId) {
                edges.push({
                    id: `${parentNodeId}->${nodeId}`,
                    source: parentNodeId,
                    target: nodeId,
                    label: branchLabel || '',
                    isBranch: true
                });
            }

            // Handle different state types
            if (state.Type === 'Parallel' && state.Branches) {
                // Process parallel branches recursively
                this.processParallelState(state, nodeId, prefix, nodes, edges);
            } else if (state.Type === 'Map' && state.Iterator) {
                // Process Map iterator
                this.processMapState(state, nodeId, prefix, nodes, edges);
            } else if (state.Type === 'Choice') {
                // Choice state transitions
                this.processChoiceState(state, stateName, nodeId, prefix, nodes, edges);
            } else {
                // Standard Next transition
                if (state.Next) {
                    const nextNodeId = prefix ? `${prefix}:${state.Next}` : state.Next;
                    edges.push({
                        id: `${nodeId}->${nextNodeId}`,
                        source: nodeId,
                        target: nextNodeId,
                        label: ''
                    });
                }
            }

            // Edge from branch end to exit target
            if (isEnd && exitTargetId) {
                edges.push({
                    id: `${nodeId}->${exitTargetId}`,
                    source: nodeId,
                    target: exitTargetId,
                    label: '',
                    isBranchEnd: true
                });
            }

            // Error handling (Catch)
            if (state.Catch) {
                state.Catch.forEach((catcher, catchIndex) => {
                    if (catcher.Next) {
                        const catchTargetId = prefix ? `${prefix}:${catcher.Next}` : catcher.Next;
                        edges.push({
                            id: `${nodeId}->${catchTargetId}-catch-${catchIndex}`,
                            source: nodeId,
                            target: catchTargetId,
                            label: `Catch: ${catcher.ErrorEquals.join(', ')}`,
                            isError: true,
                            conditionData: catcher
                        });
                    }
                });
            }
        }
    }

    /**
     * Process a Parallel state's branches recursively
     */
    processParallelState(state, nodeId, prefix, nodes, edges) {
        state.Branches.forEach((branch, branchIndex) => {
            if (branch.StartAt && branch.States) {
                const branchPrefix = `${nodeId}:B${branchIndex + 1}`;
                const exitTarget = state.Next ? (prefix ? `${prefix}:${state.Next}` : state.Next) : null;

                this.processStates(
                    branch.States,
                    branch.StartAt,
                    branchPrefix,
                    nodeId,
                    exitTarget,
                    nodes,
                    edges,
                    { branchIndex: branchIndex + 1, branchLabel: `B${branchIndex + 1}` }
                );
            }
        });

        // Connect parallel state to its Next (if branches don't have End states)
        // This is handled by individual branch ends above
    }

    /**
     * Process a Map state's iterator recursively
     */
    processMapState(state, nodeId, prefix, nodes, edges) {
        const iterator = state.Iterator;
        if (iterator.StartAt && iterator.States) {
            const iteratorPrefix = `${nodeId}:Iterator`;
            const exitTarget = state.Next ? (prefix ? `${prefix}:${state.Next}` : state.Next) : null;

            this.processStates(
                iterator.States,
                iterator.StartAt,
                iteratorPrefix,
                nodeId,
                exitTarget,
                nodes,
                edges,
                { isIterator: true, branchLabel: 'Iterator' }
            );
        }

        // Standard Next transition for Map state
        if (state.Next) {
            const nextNodeId = prefix ? `${prefix}:${state.Next}` : state.Next;
            edges.push({
                id: `${nodeId}->${nextNodeId}-map`,
                source: nodeId,
                target: nextNodeId,
                label: ''
            });
        }
    }

    /**
     * Process a Choice state's transitions
     */
    processChoiceState(state, stateName, nodeId, prefix, nodes, edges) {
        if (state.Choices) {
            state.Choices.forEach((choice, index) => {
                if (choice.Next) {
                    const choiceTargetId = prefix ? `${prefix}:${choice.Next}` : choice.Next;
                    edges.push({
                        id: `${nodeId}->${choiceTargetId}-${index}`,
                        source: nodeId,
                        target: choiceTargetId,
                        label: this.getChoiceLabel(choice),
                        isChoice: true,
                        conditionData: choice
                    });
                }
            });
        }

        // Default transition
        if (state.Default) {
            const defaultTargetId = prefix ? `${prefix}:${state.Default}` : state.Default;
            edges.push({
                id: `${nodeId}->${defaultTargetId}-default`,
                source: nodeId,
                target: defaultTargetId,
                label: 'Default',
                isDefault: true
            });
        }
    }

    /**
     * Generate label for choice transition
     */
    getChoiceLabel(choice) {
        // Extract the condition for labeling
        if (choice.Variable && choice.StringEquals) {
            return `${choice.Variable} == "${choice.StringEquals}"`;
        } else if (choice.Variable && choice.NumericEquals) {
            return `${choice.Variable} == ${choice.NumericEquals}`;
        } else if (choice.Variable && choice.BooleanEquals !== undefined) {
            return `${choice.Variable} == ${choice.BooleanEquals}`;
        } else if (choice.Variable && choice.NumericGreaterThan) {
            return `${choice.Variable} > ${choice.NumericGreaterThan}`;
        } else if (choice.Variable && choice.NumericLessThan) {
            return `${choice.Variable} < ${choice.NumericLessThan}`;
        } else if (choice.And) {
            return 'AND condition';
        } else if (choice.Or) {
            return 'OR condition';
        } else if (choice.Not) {
            return 'NOT condition';
        }
        return 'Condition';
    }

    /**
     * Get validation errors
     */
    getErrors() {
        return this.errors;
    }
}

// Export for Node.js (CommonJS)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { StateMachineParser };
}

// Export for browser (global)
if (typeof window !== 'undefined') {
    window.StateMachineParser = StateMachineParser;
}
