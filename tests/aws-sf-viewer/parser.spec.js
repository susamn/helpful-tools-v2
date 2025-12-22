/**
 * AWS Step Functions Parser Test Suite
 * Tests for AWS Step Functions state machine definition parsing including state extraction, transition parsing, and validation
 */

const { describe, test, expect, beforeEach } = require('@jest/globals');
const fs = require('fs');
const path = require('path');

// Import the parser
const { StateMachineParser } = require('../../frontend/static/js/aws-sf-viewer/parser.js');

// Test fixtures
const fixtures = {
  simpleWorkflow: {
    Comment: "A simple workflow",
    StartAt: "FirstState",
    States: {
      FirstState: {
        Type: "Task",
        Resource: "arn:aws:lambda:us-east-1:123:function:first",
        Next: "SecondState"
      },
      SecondState: {
        Type: "Task",
        Resource: "arn:aws:lambda:us-east-1:123:function:second",
        End: true
      }
    }
  },

  choiceState: {
    StartAt: "CheckValue",
    States: {
      CheckValue: {
        Type: "Choice",
        Choices: [
          {
            Variable: "$.value",
            NumericGreaterThan: 100,
            Next: "HighValue"
          },
          {
            Variable: "$.value",
            NumericEquals: 50,
            Next: "MediumValue"
          },
          {
            Variable: "$.type",
            StringEquals: "special",
            Next: "SpecialPath"
          }
        ],
        Default: "LowValue"
      },
      HighValue: { Type: "Succeed" },
      MediumValue: { Type: "Succeed" },
      LowValue: { Type: "Succeed" },
      SpecialPath: { Type: "Succeed" }
    }
  },

  parallelState: {
    StartAt: "ParallelProcess",
    States: {
      ParallelProcess: {
        Type: "Parallel",
        Next: "FinalState",
        Branches: [
          {
            StartAt: "BranchA",
            States: {
              BranchA: {
                Type: "Task",
                Resource: "arn:aws:lambda:us-east-1:123:function:branchA",
                End: true
              }
            }
          },
          {
            StartAt: "BranchB",
            States: {
              BranchB: {
                Type: "Task",
                Resource: "arn:aws:lambda:us-east-1:123:function:branchB",
                Next: "BranchB2"
              },
              BranchB2: {
                Type: "Pass",
                End: true
              }
            }
          }
        ]
      },
      FinalState: {
        Type: "Succeed"
      }
    }
  },

  mapState: {
    StartAt: "ProcessItems",
    States: {
      ProcessItems: {
        Type: "Map",
        ItemsPath: "$.items",
        MaxConcurrency: 5,
        Iterator: {
          StartAt: "ProcessItem",
          States: {
            ProcessItem: {
              Type: "Task",
              Resource: "arn:aws:lambda:us-east-1:123:function:process",
              Next: "ValidateItem"
            },
            ValidateItem: {
              Type: "Choice",
              Choices: [
                {
                  Variable: "$.valid",
                  BooleanEquals: true,
                  Next: "SaveItem"
                }
              ],
              Default: "DiscardItem"
            },
            SaveItem: { Type: "Succeed" },
            DiscardItem: { Type: "Fail", Error: "InvalidItem", Cause: "Item validation failed" }
          }
        },
        Next: "Done"
      },
      Done: { Type: "Succeed" }
    }
  },

  nestedParallel: {
    StartAt: "OuterParallel",
    States: {
      OuterParallel: {
        Type: "Parallel",
        Next: "End",
        Branches: [
          {
            StartAt: "InnerParallel",
            States: {
              InnerParallel: {
                Type: "Parallel",
                End: true,
                Branches: [
                  {
                    StartAt: "DeepTask1",
                    States: {
                      DeepTask1: { Type: "Task", Resource: "arn:...", End: true }
                    }
                  },
                  {
                    StartAt: "DeepTask2",
                    States: {
                      DeepTask2: { Type: "Pass", End: true }
                    }
                  }
                ]
              }
            }
          }
        ]
      },
      End: { Type: "Succeed" }
    }
  },

  errorHandling: {
    StartAt: "RiskyTask",
    States: {
      RiskyTask: {
        Type: "Task",
        Resource: "arn:aws:lambda:us-east-1:123:function:risky",
        Retry: [
          {
            ErrorEquals: ["States.Timeout"],
            IntervalSeconds: 3,
            MaxAttempts: 2,
            BackoffRate: 1.5
          }
        ],
        Catch: [
          {
            ErrorEquals: ["States.TaskFailed"],
            Next: "HandleError"
          },
          {
            ErrorEquals: ["States.ALL"],
            Next: "FallbackHandler"
          }
        ],
        Next: "Success"
      },
      HandleError: { Type: "Pass", Next: "Success" },
      FallbackHandler: { Type: "Fail", Error: "UnhandledError", Cause: "Unexpected failure" },
      Success: { Type: "Succeed" }
    }
  },

  allStateTypes: {
    StartAt: "TaskState",
    States: {
      TaskState: { Type: "Task", Resource: "arn:...", Next: "PassState" },
      PassState: { Type: "Pass", Result: { data: "test" }, Next: "WaitState" },
      WaitState: { Type: "Wait", Seconds: 10, Next: "ChoiceState" },
      ChoiceState: {
        Type: "Choice",
        Choices: [{ Variable: "$.go", BooleanEquals: true, Next: "SucceedState" }],
        Default: "FailState"
      },
      SucceedState: { Type: "Succeed" },
      FailState: { Type: "Fail", Error: "Failed", Cause: "Test failure" }
    }
  },

  extendedChoiceState: {
    StartAt: "CheckConditions",
    States: {
      CheckConditions: {
        Type: "Choice",
        Choices: [
          {
            Variable: "$.isActive",
            BooleanEquals: true,
            Next: "Active"
          },
          {
            Variable: "$.count",
            NumericLessThan: 10,
            Next: "LowCount"
          },
          {
            And: [
              { Variable: "$.a", BooleanEquals: true },
              { Variable: "$.b", BooleanEquals: false }
            ],
            Next: "ComplexAnd"
          },
          {
            Or: [
              { Variable: "$.x", NumericEquals: 0 },
              { Variable: "$.y", NumericEquals: 0 }
            ],
            Next: "ComplexOr"
          },
          {
            Not: { Variable: "$.flag", BooleanEquals: true },
            Next: "ComplexNot"
          },
          {
            Variable: "$.unknown",
            TimestampEquals: "2023-01-01T00:00:00Z", // Unhandled type in label generation
            Next: "Unknown"
          }
        ],
        Default: "DefaultPath"
      },
      Active: { Type: "Succeed" },
      LowCount: { Type: "Succeed" },
      ComplexAnd: { Type: "Succeed" },
      ComplexOr: { Type: "Succeed" },
      ComplexNot: { Type: "Succeed" },
      Unknown: { Type: "Succeed" },
      DefaultPath: { Type: "Succeed" }
    }
  }
};

describe('AWS Step Functions Parser', () => {
  let parser;

  beforeEach(() => {
    parser = new StateMachineParser();
  });

  describe('State Machine Parsing', () => {
    test('should parse valid state machine definition', () => {
      const result = parser.parse(fixtures.simpleWorkflow);

      expect(result).toBeDefined();
      expect(result.nodes).toBeDefined();
      expect(result.edges).toBeDefined();
      expect(result.metadata).toBeDefined();
    });

    test('should extract states from definition', () => {
      const result = parser.parse(fixtures.simpleWorkflow);

      expect(result.nodes).toHaveLength(2);
      expect(result.nodes.map(n => n.id)).toContain('FirstState');
      expect(result.nodes.map(n => n.id)).toContain('SecondState');
    });

    test('should parse state transitions', () => {
      const result = parser.parse(fixtures.simpleWorkflow);

      expect(result.edges).toHaveLength(1);
      expect(result.edges[0].source).toBe('FirstState');
      expect(result.edges[0].target).toBe('SecondState');
    });

    test('should identify start state', () => {
      const result = parser.parse(fixtures.simpleWorkflow);

      const startNode = result.nodes.find(n => n.isStart);
      expect(startNode).toBeDefined();
      expect(startNode.id).toBe('FirstState');
    });

    test('should identify end states', () => {
      const result = parser.parse(fixtures.simpleWorkflow);

      const endNode = result.nodes.find(n => n.isEnd);
      expect(endNode).toBeDefined();
      expect(endNode.id).toBe('SecondState');
    });

    test('should include metadata', () => {
      const result = parser.parse(fixtures.simpleWorkflow);

      expect(result.metadata.comment).toBe('A simple workflow');
      expect(result.metadata.startAt).toBe('FirstState');
    });

    test('should parse JSON string input', () => {
      const jsonString = JSON.stringify(fixtures.simpleWorkflow);
      const result = parser.parse(jsonString);

      expect(result.nodes).toHaveLength(2);
    });
  });

  describe('State Type Handling', () => {
    test('should parse Task states', () => {
      const result = parser.parse(fixtures.simpleWorkflow);

      const taskNode = result.nodes.find(n => n.id === 'FirstState');
      expect(taskNode.type).toBe('Task');
      expect(taskNode.data.Resource).toBeDefined();
    });

    test('should parse Choice states with all choice types', () => {
      const result = parser.parse(fixtures.choiceState);

      const choiceNode = result.nodes.find(n => n.id === 'CheckValue');
      expect(choiceNode.type).toBe('Choice');

      // Check that all choice edges are created
      const choiceEdges = result.edges.filter(e => e.source === 'CheckValue');
      expect(choiceEdges).toHaveLength(4); // 3 choices + 1 default

      // Check for default edge
      const defaultEdge = choiceEdges.find(e => e.isDefault);
      expect(defaultEdge).toBeDefined();
      expect(defaultEdge.target).toBe('LowValue');
    });

    test('should parse Parallel states and expand branches', () => {
      const result = parser.parse(fixtures.parallelState);

      // Check that parallel node exists
      const parallelNode = result.nodes.find(n => n.id === 'ParallelProcess');
      expect(parallelNode).toBeDefined();
      expect(parallelNode.type).toBe('Parallel');

      // Check that branch states are expanded
      const branchANode = result.nodes.find(n => n.id.includes('BranchA'));
      const branchBNode = result.nodes.find(n => n.id.includes('BranchB'));
      expect(branchANode).toBeDefined();
      expect(branchBNode).toBeDefined();

      // Branch states should be marked
      expect(branchANode.isBranchState).toBe(true);
    });

    test('should parse Map states with iterators', () => {
      const result = parser.parse(fixtures.mapState);

      // Check map node
      const mapNode = result.nodes.find(n => n.id === 'ProcessItems');
      expect(mapNode).toBeDefined();
      expect(mapNode.type).toBe('Map');

      // Check iterator states are expanded
      const iteratorStates = result.nodes.filter(n => n.id.includes('Iterator'));
      expect(iteratorStates.length).toBeGreaterThan(0);

      // Check iterator states are marked
      const processItemNode = result.nodes.find(n => n.id.includes('ProcessItem') && n.isIteratorState);
      expect(processItemNode).toBeDefined();
    });

    test('should parse Pass states', () => {
      const result = parser.parse(fixtures.allStateTypes);

      const passNode = result.nodes.find(n => n.id === 'PassState');
      expect(passNode.type).toBe('Pass');
    });

    test('should parse Wait states', () => {
      const result = parser.parse(fixtures.allStateTypes);

      const waitNode = result.nodes.find(n => n.id === 'WaitState');
      expect(waitNode.type).toBe('Wait');
      expect(waitNode.data.Seconds).toBe(10);
    });

    test('should parse Succeed states', () => {
      const result = parser.parse(fixtures.allStateTypes);

      const succeedNode = result.nodes.find(n => n.id === 'SucceedState');
      expect(succeedNode.type).toBe('Succeed');
      expect(succeedNode.isEnd).toBe(true);
    });

    test('should parse Fail states', () => {
      const result = parser.parse(fixtures.allStateTypes);

      const failNode = result.nodes.find(n => n.id === 'FailState');
      expect(failNode.type).toBe('Fail');
      expect(failNode.isEnd).toBe(true);
      expect(failNode.data.Error).toBe('Failed');
    });
  });

  describe('Nested Structures', () => {
    test('should handle nested parallel states', () => {
      const result = parser.parse(fixtures.nestedParallel);

      // Check outer parallel
      const outerParallel = result.nodes.find(n => n.id === 'OuterParallel');
      expect(outerParallel).toBeDefined();

      // Check inner parallel is expanded
      const innerParallelNode = result.nodes.find(n => n.id.includes('InnerParallel'));
      expect(innerParallelNode).toBeDefined();

      // Check deep tasks are expanded
      const deepTask1 = result.nodes.find(n => n.id.includes('DeepTask1'));
      const deepTask2 = result.nodes.find(n => n.id.includes('DeepTask2'));
      expect(deepTask1).toBeDefined();
      expect(deepTask2).toBeDefined();
    });

    test('should handle Choice within Map iterator', () => {
      const result = parser.parse(fixtures.mapState);

      // Find the choice state within the iterator
      const choiceInIterator = result.nodes.find(n =>
        n.id.includes('Iterator') && n.id.includes('ValidateItem')
      );
      expect(choiceInIterator).toBeDefined();
      expect(choiceInIterator.type).toBe('Choice');

      // Check choice edges within iterator
      const choiceEdges = result.edges.filter(e =>
        e.source.includes('ValidateItem') && e.source.includes('Iterator')
      );
      expect(choiceEdges.length).toBeGreaterThanOrEqual(2); // At least choice + default
    });
  });

  describe('Error Handling', () => {
    test('should parse Catch blocks and create error edges', () => {
      const result = parser.parse(fixtures.errorHandling);

      // Check for error edges from RiskyTask
      const errorEdges = result.edges.filter(e => e.isError);
      expect(errorEdges).toHaveLength(2);

      // Check specific error handlers
      const taskFailedEdge = errorEdges.find(e => e.target === 'HandleError');
      const allErrorsEdge = errorEdges.find(e => e.target === 'FallbackHandler');
      expect(taskFailedEdge).toBeDefined();
      expect(allErrorsEdge).toBeDefined();

      // Check conditionData is stored
      expect(taskFailedEdge.conditionData).toBeDefined();
      expect(taskFailedEdge.conditionData.ErrorEquals).toContain('States.TaskFailed');
    });

    test('should validate state machine syntax - missing StartAt', () => {
      const invalid = {
        States: {
          OnlyState: { Type: "Succeed" }
        }
      };

      expect(() => parser.parse(invalid)).toThrow(/StartAt/);
    });

    test('should validate state machine syntax - missing States', () => {
      const invalid = {
        StartAt: "Missing"
      };

      expect(() => parser.parse(invalid)).toThrow(/States/);
    });

    test('should detect invalid state references', () => {
      const invalid = {
        StartAt: "NonExistentState",
        States: {
          OnlyState: { Type: "Succeed" }
        }
      };

      expect(() => parser.parse(invalid)).toThrow(/not found/);
    });

    test('should handle malformed JSON string', () => {
      const malformedJson = '{ "StartAt": "Test", "States": { broken }';

      expect(() => parser.parse(malformedJson)).toThrow();
    });

    test('should validate Choice state has Choices array', () => {
      const invalid = {
        StartAt: "BadChoice",
        States: {
          BadChoice: { Type: "Choice" } // Missing Choices
        }
      };

      expect(() => parser.parse(invalid)).toThrow(/Choices/);
    });

    test('should validate Parallel state has Branches', () => {
      const invalid = {
        StartAt: "BadParallel",
        States: {
          BadParallel: { Type: "Parallel", End: true } // Missing Branches
        }
      };

      expect(() => parser.parse(invalid)).toThrow(/Branches/);
    });
  });

  describe('Choice Label Generation', () => {
    test('should generate labels for StringEquals conditions', () => {
      const result = parser.parse(fixtures.choiceState);
      const edges = result.edges.filter(e => e.source === 'CheckValue' && e.isChoice);

      const stringEqualsEdge = edges.find(e => e.target === 'SpecialPath');
      expect(stringEqualsEdge.label).toContain('$.type');
      expect(stringEqualsEdge.label).toContain('special');
    });

    test('should generate labels for NumericGreaterThan conditions', () => {
      const result = parser.parse(fixtures.choiceState);
      const edges = result.edges.filter(e => e.source === 'CheckValue' && e.isChoice);

      const numericEdge = edges.find(e => e.target === 'HighValue');
      expect(numericEdge.label).toContain('$.value');
      expect(numericEdge.label).toContain('100');
    });

    test('should store full condition data for tooltips', () => {
      const result = parser.parse(fixtures.choiceState);
      const edges = result.edges.filter(e => e.source === 'CheckValue' && e.isChoice);

      edges.forEach(edge => {
        expect(edge.conditionData).toBeDefined();
        expect(edge.conditionData.Variable).toBeDefined();
        expect(edge.conditionData.Next).toBeDefined();
      });
    });

    test('should generate labels for extended choice operators', () => {
      const result = parser.parse(fixtures.extendedChoiceState);
      const edges = result.edges.filter(e => e.source === 'CheckConditions' && e.isChoice);

      const boolEdge = edges.find(e => e.target === 'Active');
      expect(boolEdge.label).toContain('$.isActive');
      expect(boolEdge.label).toContain('true');

      const lessEdge = edges.find(e => e.target === 'LowCount');
      expect(lessEdge.label).toContain('$.count < 10');

      const andEdge = edges.find(e => e.target === 'ComplexAnd');
      expect(andEdge.label).toBe('AND condition');

      const orEdge = edges.find(e => e.target === 'ComplexOr');
      expect(orEdge.label).toBe('OR condition');

      const notEdge = edges.find(e => e.target === 'ComplexNot');
      expect(notEdge.label).toBe('NOT condition');

      const unknownEdge = edges.find(e => e.target === 'Unknown');
      expect(unknownEdge.label).toBe('Condition');
    });
  });

  describe('Real Example Files', () => {
    const examplesDir = path.join(__dirname, '../../frontend/static/examples/aws-sf');

    test('should parse simple-workflow.json', () => {
      const filePath = path.join(examplesDir, 'simple-workflow.json');
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        const json = JSON.parse(content);
        const result = parser.parse(json);

        expect(result.nodes.length).toBeGreaterThan(0);
        expect(result.edges.length).toBeGreaterThan(0);
        expect(result.metadata.startAt).toBe('ValidateOrder');
      }
    });

    test('should parse parallel-states.json', () => {
      const filePath = path.join(examplesDir, 'parallel-states.json');
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        const json = JSON.parse(content);
        const result = parser.parse(json);

        // Should have expanded branch states
        const branchStates = result.nodes.filter(n => n.isBranchState);
        expect(branchStates.length).toBeGreaterThan(0);
      }
    });

    test('should parse choice-state.json', () => {
      const filePath = path.join(examplesDir, 'choice-state.json');
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        const json = JSON.parse(content);
        const result = parser.parse(json);

        // Should have choice edges
        const choiceEdges = result.edges.filter(e => e.isChoice);
        expect(choiceEdges.length).toBeGreaterThan(0);
      }
    });

    test('should parse ultra-complex-workflow.json', () => {
      const filePath = path.join(examplesDir, 'ultra-complex-workflow.json');
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        const json = JSON.parse(content);
        const result = parser.parse(json);

        // Should handle nested parallelism
        expect(result.nodes.length).toBeGreaterThan(10);

        // Should have iterator states from Map
        const iteratorStates = result.nodes.filter(n => n.isIteratorState);
        expect(iteratorStates.length).toBeGreaterThan(0);

        // Should have error handling edges
        const errorEdges = result.edges.filter(e => e.isError);
        expect(errorEdges.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty branches in Parallel state', () => {
      const withEmptyBranch = {
        StartAt: "Parallel",
        States: {
          Parallel: {
            Type: "Parallel",
            End: true,
            Branches: [
              { StartAt: "Task", States: { Task: { Type: "Pass", End: true } } },
              { StartAt: null, States: {} } // Empty branch
            ]
          }
        }
      };

      // Should not throw
      const result = parser.parse(withEmptyBranch);
      expect(result.nodes.length).toBeGreaterThan(0);
    });

    test('should handle states with no transitions (terminal states)', () => {
      const terminalOnly = {
        StartAt: "OnlyState",
        States: {
          OnlyState: { Type: "Succeed" }
        }
      };

      const result = parser.parse(terminalOnly);
      expect(result.nodes).toHaveLength(1);
      expect(result.edges).toHaveLength(0);
      expect(result.nodes[0].isStart).toBe(true);
      expect(result.nodes[0].isEnd).toBe(true);
    });

    test('should preserve state data in nodes', () => {
      const result = parser.parse(fixtures.errorHandling);

      const riskyTask = result.nodes.find(n => n.id === 'RiskyTask');
      expect(riskyTask.data.Retry).toBeDefined();
      expect(riskyTask.data.Retry[0].MaxAttempts).toBe(2);
      expect(riskyTask.data.Catch).toBeDefined();
    });
  });
});
