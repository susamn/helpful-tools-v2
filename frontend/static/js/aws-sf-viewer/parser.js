/**
 * AWS Step Functions State Machine Parser
 * Parses Amazon States Language (ASL) JSON format
 */

export class StateMachineParser {
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

        // Create nodes for each state
        for (const [stateName, state] of Object.entries(this.stateMachine.States)) {
            nodes.push({
                id: stateName,
                label: stateName,
                type: state.Type,
                isStart: stateName === startState,
                isEnd: state.End === true || state.Type === 'Succeed' || state.Type === 'Fail',
                data: state
            });
        }

        // Create edges for transitions
        for (const [stateName, state] of Object.entries(this.stateMachine.States)) {
            // Standard Next transition
            if (state.Next) {
                edges.push({
                    id: `${stateName}->${state.Next}`,
                    source: stateName,
                    target: state.Next,
                    label: ''
                });
            }

            // Choice state transitions
            if (state.Type === 'Choice' && state.Choices) {
                state.Choices.forEach((choice, index) => {
                    if (choice.Next) {
                        edges.push({
                            id: `${stateName}->${choice.Next}-${index}`,
                            source: stateName,
                            target: choice.Next,
                            label: this.getChoiceLabel(choice),
                            isChoice: true
                        });
                    }
                });

                // Default transition
                if (state.Default) {
                    edges.push({
                        id: `${stateName}->${state.Default}-default`,
                        source: stateName,
                        target: state.Default,
                        label: 'Default',
                        isDefault: true
                    });
                }
            }

            // Parallel state branches
            if (state.Type === 'Parallel' && state.Branches) {
                state.Branches.forEach((branch, index) => {
                    if (branch.StartAt) {
                        // Create a virtual node for the branch
                        const branchId = `${stateName}-branch-${index}`;
                        nodes.push({
                            id: branchId,
                            label: `Branch ${index + 1}`,
                            type: 'ParallelBranch',
                            isStart: false,
                            isEnd: false,
                            data: branch
                        });

                        edges.push({
                            id: `${stateName}->${branchId}`,
                            source: stateName,
                            target: branchId,
                            label: `Branch ${index + 1}`,
                            isBranch: true
                        });

                        // Parse branch states
                        const branchNodes = this.extractBranchNodes(branch, branchId);
                        nodes.push(...branchNodes.nodes);
                        edges.push(...branchNodes.edges);
                    }
                });
            }

            // Error handling
            if (state.Catch) {
                state.Catch.forEach((catcher, index) => {
                    if (catcher.Next) {
                        edges.push({
                            id: `${stateName}->${catcher.Next}-catch-${index}`,
                            source: stateName,
                            target: catcher.Next,
                            label: `Catch: ${catcher.ErrorEquals.join(', ')}`,
                            isError: true
                        });
                    }
                });
            }
        }

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
     * Extract nodes from parallel branch
     */
    extractBranchNodes(branch, parentId) {
        const nodes = [];
        const edges = [];

        if (!branch.States) {
            return { nodes, edges };
        }

        for (const [stateName, state] of Object.entries(branch.States)) {
            const nodeId = `${parentId}-${stateName}`;
            nodes.push({
                id: nodeId,
                label: stateName,
                type: state.Type,
                isStart: stateName === branch.StartAt,
                isEnd: state.End === true,
                data: state,
                parentBranch: parentId
            });

            if (state.Next) {
                const nextId = `${parentId}-${state.Next}`;
                edges.push({
                    id: `${nodeId}->${nextId}`,
                    source: nodeId,
                    target: nextId,
                    label: ''
                });
            }
        }

        return { nodes, edges };
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
