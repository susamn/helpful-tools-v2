/**
 * JSON Tool Filter Function Test Suite
 * Comprehensive tests for filter() function with various expressions
 */

const { describe, test, expect, beforeEach } = require('@jest/globals');

// Mock DOM elements before loading JsonTool
document.body.innerHTML = `
  <div id="jsonInput"></div>
  <div id="jsonOutput"></div>
  <div id="jsonOutputFormatted"></div>
  <button id="formatBtn"></button>
  <button id="minifyBtn"></button>
  <button id="stringifyBtn"></button>
  <button id="clearBtn"></button>
  <button id="saveBtn"></button>
  <div id="saveTooltip">
    <input id="saveDescriptionInput" />
    <button id="saveTooltipSave"></button>
    <button id="saveTooltipCancel"></button>
  </div>
  <button id="copyBtn"></button>
  <button id="loadFromSourceBtn"></button>
  <input id="fileInput">
  <button id="uploadFileBtn"></button>
  <span id="filePathLabel"></span>
  <button id="toggleMarkupBtn"></button>
  <select id="indentType"></select>
  <select id="indentSize"></select>
  <button id="fontIncreaseBtn"></button>
  <button id="fontDecreaseBtn"></button>
  <input id="jsonPathInput">
  <button id="clearSearchBtn"></button>
  <div id="validationControls"></div>
  <div id="validationStatus"></div>
  <select id="validatorSelect"></select>
  <button id="validateBtn"></button>
  <div id="statusMessages"></div>
  <div id="jsonStatus"></div>
  <div id="jsonSize"></div>
  <div id="jsonLines"></div>
  <div id="jsonObjects"></div>
  <div id="jsonArrays"></div>
  <div id="jsonProperties"></div>
`;

// Load shared JSONPath functions first
const sharedFunctions = require('../../frontend/static/js/shared/jsonpath-functions.js');
// Make shared functions globally available (as they would be in browser)
Object.assign(global, sharedFunctions);

// Load JsonTool after DOM setup
const JsonTool = require('../../frontend/static/js/json-tool.js');

describe('JSON Tool - Filter Function', () => {
  let formatter;
  let testData;

  beforeEach(() => {
    formatter = new JsonTool();

    // Test data with orders and products
    testData = {
      orders: [
        {
          order_id: 'O1001',
          products: [
            { code: 'P001', name: 'Mouse', price: 25.99 },
            { code: 'P002', name: 'Keyboard', price: 79.50 },
            { code: 'P003', name: 'Cable', price: 9.99 }
          ]
        },
        {
          order_id: 'O1002',
          products: [
            { code: 'P003', name: 'Cable', price: 9.99 },
            { code: 'P004', name: 'Stand', price: 29.99 }
          ]
        },
        {
          order_id: 'O1003',
          products: [
            { code: 'P005', name: 'Headphones', price: 59.99 },
            { code: 'P001', name: 'Mouse', price: 25.99 }
          ]
        },
        {
          order_id: 'O1004',
          products: [
            { code: 'P006', name: 'Webcam', price: 49.99 },
            { code: 'P002', name: 'Keyboard', price: 79.50 },
            { code: 'P007', name: 'Pad', price: 7.99 }
          ]
        },
        {
          order_id: 'O1005',
          products: [
            { name: 'Stand', price: 29.99 }, // Missing code
            { code: 'P008', name: 'SSD', price: 119.99 }
          ]
        }
      ]
    };
  });

  describe('Basic Filter Functionality', () => {
    test('should filter array based on simple condition', () => {
      const orders = testData.orders;
      const filtered = orders.filter(order =>
        formatter.evaluateFilterExpression('$.order_id == "O1003"', order)
      );

      expect(filtered).toHaveLength(1);
      expect(filtered[0].order_id).toBe('O1003');
    });

    test('should return empty array when no matches', () => {
      const orders = testData.orders;
      const filtered = orders.filter(order =>
        formatter.evaluateFilterExpression('$.order_id == "O9999"', order)
      );

      expect(filtered).toHaveLength(0);
    });

    test('should not filter non-array data', () => {
      const singleOrder = testData.orders[0];
      const result = formatter.functionFilter(singleOrder, '$.order_id == "O1001"');

      expect(result).toBe(singleOrder); // Should return original data
    });
  });

  describe('len() Function Tests', () => {
    test('should filter orders with more than 2 products', () => {
      const orders = testData.orders;
      const filtered = orders.filter(order =>
        formatter.evaluateFilterExpression('len($.products) > 2', order)
      );

      expect(filtered).toHaveLength(2);
      expect(filtered[0].order_id).toBe('O1001');
      expect(filtered[1].order_id).toBe('O1004');
    });

    test('should filter orders with exactly 2 products', () => {
      const orders = testData.orders;
      const filtered = orders.filter(order =>
        formatter.evaluateFilterExpression('len($.products) == 2', order)
      );

      expect(filtered).toHaveLength(3);
      expect(filtered.map(o => o.order_id)).toEqual(['O1002', 'O1003', 'O1005']);
    });

    test('should filter orders with less than 3 products', () => {
      const orders = testData.orders;
      const filtered = orders.filter(order =>
        formatter.evaluateFilterExpression('len($.products) < 3', order)
      );

      expect(filtered).toHaveLength(3);
    });

    test('should handle len() on empty arrays', () => {
      const order = { order_id: 'O1006', products: [] };
      const result = formatter.evaluateFilterExpression('len($.products) == 0', order);

      expect(result).toBe(true);
    });
  });

  describe('present() Function Tests', () => {
    test('should filter orders where ALL products have code', () => {
      const orders = testData.orders;
      const filtered = orders.filter(order =>
        formatter.evaluateFilterExpression('present($.products[*].code)', order)
      );

      expect(filtered).toHaveLength(4);
      expect(filtered.map(o => o.order_id)).toEqual(['O1001', 'O1002', 'O1003', 'O1004']);
      expect(filtered.every(o => o.order_id !== 'O1005')).toBe(true);
    });

    test('should check single property presence', () => {
      const orders = testData.orders;
      const filtered = orders.filter(order =>
        formatter.evaluateFilterExpression('present($.order_id)', order)
      );

      expect(filtered).toHaveLength(5); // All orders have order_id
    });

    test('should return false when property is missing', () => {
      const order = { order_id: 'O1001' };
      const result = formatter.evaluateFilterExpression('present($.discount)', order);

      expect(result).toBe(false);
    });
  });

  describe('absent() Function Tests', () => {
    test('should filter orders where ANY product is missing code', () => {
      const orders = testData.orders;
      const filtered = orders.filter(order =>
        formatter.evaluateFilterExpression('absent($.products[*].code)', order)
      );

      expect(filtered).toHaveLength(1);
      expect(filtered[0].order_id).toBe('O1005');
    });

    test('should filter orders missing specific field', () => {
      const orders = testData.orders;
      const filtered = orders.filter(order =>
        formatter.evaluateFilterExpression('absent($.discount)', order)
      );

      expect(filtered).toHaveLength(5); // All orders missing discount
    });

    test('should return false when property exists', () => {
      const order = { order_id: 'O1001', discount: 10 };
      const result = formatter.evaluateFilterExpression('absent($.discount)', order);

      expect(result).toBe(false);
    });
  });

  describe('Comparison Operators', () => {
    test('should handle equality (==) operator', () => {
      const orders = testData.orders;
      const filtered = orders.filter(order =>
        formatter.evaluateFilterExpression('$.order_id == "O1003"', order)
      );

      expect(filtered).toHaveLength(1);
      expect(filtered[0].order_id).toBe('O1003');
    });

    test('should handle inequality (!=) operator', () => {
      const orders = testData.orders;
      const filtered = orders.filter(order =>
        formatter.evaluateFilterExpression('$.order_id != "O1001"', order)
      );

      expect(filtered).toHaveLength(4);
      expect(filtered.every(o => o.order_id !== 'O1001')).toBe(true);
    });

    test('should handle greater than (>) operator', () => {
      const items = [
        { price: 10 },
        { price: 50 },
        { price: 100 }
      ];

      const filtered = items.filter(item =>
        formatter.evaluateFilterExpression('$.price > 25', item)
      );

      expect(filtered).toHaveLength(2);
      expect(filtered.map(i => i.price)).toEqual([50, 100]);
    });

    test('should handle less than (<) operator', () => {
      const items = [
        { price: 10 },
        { price: 50 },
        { price: 100 }
      ];

      const filtered = items.filter(item =>
        formatter.evaluateFilterExpression('$.price < 50', item)
      );

      expect(filtered).toHaveLength(1);
      expect(filtered[0].price).toBe(10);
    });

    test('should handle greater than or equal (>=) operator', () => {
      const items = [{ price: 50 }, { price: 49 }, { price: 51 }];
      const filtered = items.filter(item =>
        formatter.evaluateFilterExpression('$.price >= 50', item)
      );

      expect(filtered).toHaveLength(2);
    });

    test('should handle less than or equal (<=) operator', () => {
      const items = [{ price: 50 }, { price: 49 }, { price: 51 }];
      const filtered = items.filter(item =>
        formatter.evaluateFilterExpression('$.price <= 50', item)
      );

      expect(filtered).toHaveLength(2);
    });
  });

  describe('Wildcard Behavior', () => {
    test('should filter orders containing specific product code (ANY match)', () => {
      const orders = testData.orders;
      const filtered = orders.filter(order =>
        formatter.evaluateFilterExpression('$.products[*].code == "P001"', order)
      );

      expect(filtered).toHaveLength(2);
      expect(filtered.map(o => o.order_id)).toEqual(['O1001', 'O1003']);
    });

    test('should filter orders NOT containing specific product code (NONE match)', () => {
      const orders = testData.orders;
      const filtered = orders.filter(order =>
        formatter.evaluateFilterExpression('$.products[*].code != "P001"', order)
      );

      expect(filtered).toHaveLength(3);
      expect(filtered.map(o => o.order_id)).toEqual(['O1002', 'O1004', 'O1005']);
    });

    test('should filter orders with any product over $50', () => {
      const orders = testData.orders;
      const filtered = orders.filter(order =>
        formatter.evaluateFilterExpression('$.products[*].price > 50', order)
      );

      expect(filtered.length).toBeGreaterThanOrEqual(3);
    });

    test('should filter orders with any product under $10', () => {
      const orders = testData.orders;
      const filtered = orders.filter(order =>
        formatter.evaluateFilterExpression('$.products[*].price < 10', order)
      );

      expect(filtered.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('empty() and notEmpty() Functions', () => {
    test('should detect non-empty arrays', () => {
      const orders = testData.orders;
      const filtered = orders.filter(order =>
        formatter.evaluateFilterExpression('notEmpty($.products)', order)
      );

      expect(filtered).toHaveLength(5); // All orders have products
    });

    test('should detect empty arrays', () => {
      const testOrders = [
        { order_id: 'O1', products: [] },
        { order_id: 'O2', products: [{ code: 'P1' }] }
      ];

      const filtered = testOrders.filter(order =>
        formatter.evaluateFilterExpression('empty($.products)', order)
      );

      expect(filtered).toHaveLength(1);
      expect(filtered[0].order_id).toBe('O1');
    });
  });

  describe('Error Handling', () => {
    test('should return false for invalid JSONPath', () => {
      const order = testData.orders[0];
      const result = formatter.evaluateFilterExpression('len(invalid_path)', order);

      expect(result).toBe(false);
    });

    test('should return false for unknown function', () => {
      const order = testData.orders[0];
      const result = formatter.evaluateFilterExpression('unknownFunc($.products)', order);

      expect(result).toBe(false);
    });

    test('should handle malformed expression gracefully', () => {
      const order = testData.orders[0];
      const result = formatter.evaluateFilterExpression('len($.products', order);

      expect(result).toBe(false);
    });

    test('should handle missing operators', () => {
      const order = testData.orders[0];
      const result = formatter.evaluateFilterExpression('$.order_id "O1001"', order);

      expect(result).toBe(false);
    });

    test('should handle null and undefined values', () => {
      const order = { order_id: 'O1', discount: null };
      const result1 = formatter.evaluateFilterExpression('$.discount == null', order);
      const result2 = formatter.evaluateFilterExpression('$.missing == null', order);

      expect(result1).toBe(true);
      expect(result2).toBe(true);
    });
  });

  describe('Complex Expressions', () => {
    test('should handle nested paths', () => {
      const data = {
        company: {
          employees: [
            { name: 'John', department: { name: 'IT' } },
            { name: 'Jane', department: { name: 'HR' } }
          ]
        }
      };

      const employees = data.company.employees;
      const filtered = employees.filter(emp =>
        formatter.evaluateFilterExpression('$.department.name == "IT"', emp)
      );

      expect(filtered).toHaveLength(1);
      expect(filtered[0].name).toBe('John');
    });

    test('should handle numeric comparisons correctly', () => {
      const items = [{ id: 1 }, { id: 10 }, { id: 2 }];
      const filtered = items.filter(item =>
        formatter.evaluateFilterExpression('$.id > 5', item)
      );

      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe(10);
    });

    test('should handle string comparisons', () => {
      const items = [
        { status: 'active' },
        { status: 'inactive' },
        { status: 'pending' }
      ];

      const filtered = items.filter(item =>
        formatter.evaluateFilterExpression('$.status == "active"', item)
      );

      expect(filtered).toHaveLength(1);
      expect(filtered[0].status).toBe('active');
    });
  });

  describe('contains() Function Tests', () => {
    test('should find substring in string values (case-insensitive)', () => {
      const products = [
        { name: 'Bluetooth Headphones', code: 'P005' },
        { name: 'Wireless Mouse', code: 'P001' },
        { name: 'USB-C Cable', code: 'P003' }
      ];

      const filtered = products.filter(product =>
        formatter.evaluateFilterExpression('contains($.name, "Bluetooth")', product)
      );

      expect(filtered).toHaveLength(1);
      expect(filtered[0].code).toBe('P005');
    });

    test('should be case-insensitive for string matching', () => {
      const products = [
        { name: 'Wireless Mouse', code: 'P001' },
        { name: 'Mouse Pad', code: 'P007' },
        { name: 'Keyboard', code: 'P002' }
      ];

      const filtered = products.filter(product =>
        formatter.evaluateFilterExpression('contains($.name, "mouse")', product)
      );

      expect(filtered).toHaveLength(2);
      expect(filtered.map(p => p.code)).toEqual(['P001', 'P007']);
    });

    test('should match partial strings', () => {
      const products = [
        { name: 'USB-C Cable', code: 'P003' },
        { name: 'USB Hub', code: 'P009' },
        { name: 'Wireless Mouse', code: 'P001' }
      ];

      const filtered = products.filter(product =>
        formatter.evaluateFilterExpression('contains($.name, "USB")', product)
      );

      expect(filtered).toHaveLength(2);
      expect(filtered.every(p => p.name.includes('USB'))).toBe(true);
    });

    test('should do exact match for numbers', () => {
      const products = [
        { name: 'Mouse', price: 25.99 },
        { name: 'Keyboard', price: 79.50 },
        { name: 'Cable', price: 9.99 }
      ];

      const filtered = products.filter(product =>
        formatter.evaluateFilterExpression('contains($.price, 25.99)', product)
      );

      expect(filtered).toHaveLength(1);
      expect(filtered[0].name).toBe('Mouse');
    });

    test('should handle wildcards with contains', () => {
      const orders = testData.orders;
      const filtered = orders.filter(order =>
        formatter.evaluateFilterExpression('contains($.products[*].code, "P001")', order)
      );

      expect(filtered).toHaveLength(2);
      expect(filtered.map(o => o.order_id)).toEqual(['O1001', 'O1003']);
    });

    test('should handle wildcards with string contains', () => {
      const orders = testData.orders;
      const filtered = orders.filter(order =>
        formatter.evaluateFilterExpression('contains($.products[*].name, "Mouse")', order)
      );

      expect(filtered.length).toBeGreaterThanOrEqual(1);
    });

    test('should return false when substring not found', () => {
      const product = { name: 'Wireless Mouse', code: 'P001' };
      const result = formatter.evaluateFilterExpression('contains($.name, "Keyboard")', product);

      expect(result).toBe(false);
    });

    test('should handle empty strings', () => {
      const product = { name: '', code: 'P001' };
      const result = formatter.evaluateFilterExpression('contains($.name, "test")', product);

      expect(result).toBe(false);
    });

    test('should handle null values', () => {
      const product = { name: null, code: 'P001' };
      const result = formatter.evaluateFilterExpression('contains($.name, null)', product);

      expect(result).toBe(true);
    });

    test('should match exact values for booleans', () => {
      const items = [
        { active: true, id: 1 },
        { active: false, id: 2 },
        { active: true, id: 3 }
      ];

      const filtered = items.filter(item =>
        formatter.evaluateFilterExpression('contains($.active, true)', item)
      );

      expect(filtered).toHaveLength(2);
      expect(filtered.every(item => item.active === true)).toBe(true);
    });

    test('should work with flatten and filter combination', () => {
      const data = {
        orders: [
          {
            order_id: 'O1001',
            products: [
              { name: 'Bluetooth Headphones', code: 'P005' },
              { name: 'Wireless Mouse', code: 'P001' }
            ]
          },
          {
            order_id: 'O1002',
            products: [
              { name: 'USB-C Cable', code: 'P003' },
              { name: 'Keyboard', code: 'P002' }
            ]
          }
        ]
      };

      // This simulates: $.orders[*].products[*]
      const allProducts = data.orders.flatMap(o => o.products);

      const filtered = allProducts.filter(product =>
        formatter.evaluateFilterExpression('contains($.name, "Bluetooth")', product)
      );

      expect(filtered).toHaveLength(1);
      expect(filtered[0].code).toBe('P005');
    });

    test('should handle multiple word search', () => {
      const products = [
        { name: 'Mechanical Keyboard', code: 'P002' },
        { name: 'Wireless Mouse', code: 'P001' },
        { name: 'Keyboard Stand', code: 'P010' }
      ];

      const filtered = products.filter(product =>
        formatter.evaluateFilterExpression('contains($.name, "Keyboard")', product)
      );

      expect(filtered).toHaveLength(2);
      expect(filtered.map(p => p.code)).toEqual(['P002', 'P010']);
    });

    test('should handle special characters in search', () => {
      const products = [
        { name: 'USB-C Cable', code: 'P003' },
        { name: 'USB Hub', code: 'P009' },
        { name: 'HDMI Cable', code: 'P011' }
      ];

      const filtered = products.filter(product =>
        formatter.evaluateFilterExpression('contains($.name, "USB-C")', product)
      );

      expect(filtered).toHaveLength(1);
      expect(filtered[0].code).toBe('P003');
    });

    test('should return false for number substring search', () => {
      const product = { code: 'P001', id: 12345 };
      // Numbers don't do substring matching, only exact match
      const result = formatter.evaluateFilterExpression('contains($.id, 123)', product);

      expect(result).toBe(false);
    });

    test('should handle array of strings', () => {
      const item = { tags: ['urgent', 'important', 'review'] };
      const result = formatter.evaluateFilterExpression('contains($.tags[*], "urgent")', item);

      expect(result).toBe(true);
    });

    test('should handle empty result arrays', () => {
      const product = { name: 'Mouse' };
      const result = formatter.evaluateFilterExpression('contains($.missing, "test")', product);

      expect(result).toBe(false);
    });
  });

  describe('Full Pipeline Integration Tests', () => {
    // Helper to process full JSONPath expression with functions
    async function processFullExpression(jsonlData, expression) {
      // Parse JSONL into objects
      const lines = jsonlData.trim().split('\n');
      const jsonObjects = lines.map(line => JSON.parse(line.trim()));

      // Parse expression
      const { path, functions } = formatter.parseJsonPathWithFunctions(expression);

      // Check if path is $ with list()
      const hasListFunction = functions.some(f => (typeof f === 'string' ? f : f.name) === 'list');

      if (path.trim() === '$' && hasListFunction) {
        // Start with JSON objects array
        let result = jsonObjects;

        // Apply all functions except list()
        const otherFunctions = functions.filter(f => {
          const funcName = typeof f === 'string' ? f : f.name;
          return funcName.toLowerCase() !== 'list';
        });

        for (const func of otherFunctions) {
          result = await formatter.applyFunction(func, result);
        }
        return result;
      } else {
        // Query each object with path and collect all values
        let allValues = [];
        for (const obj of jsonObjects) {
          const evalResult = formatter.evaluateJsonPath(obj, path);
          if (evalResult.result) {
            // For each result, if it's an array, add its items
            evalResult.result.forEach(val => {
              if (Array.isArray(val)) {
                allValues.push(...val);
              } else {
                allValues.push(val);
              }
            });
          }
        }

        // Apply functions
        let result = allValues;
        for (const func of functions) {
          result = await formatter.applyFunction(func, result);
        }

        return result;
      }
    }

    test('should work with flatten() and filter(contains()) on JSONL data', async () => {
      const jsonlData = `{"order_id": "O1001", "products": [{"code": "P001", "name": "Wireless Mouse", "price": 25.99}, {"code": "P002", "name": "Mechanical Keyboard", "price": 79.50}]}
{"order_id": "O1002", "products": [{"code": "P003", "name": "USB-C Cable", "price": 9.99}]}
{"order_id": "O1003", "products": [{"code": "P005", "name": "Bluetooth Headphones", "price": 59.99}]}`;

      const result = await processFullExpression(jsonlData, '$.products| flatten()|filter(contains($.name,"Bluetooth"))');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Bluetooth Headphones');
      expect(result[0].code).toBe('P005');
    });

    test('should find multiple products with substring match', async () => {
      const jsonlData = `{"order_id": "O1001", "products": [{"code": "P001", "name": "Wireless Mouse", "price": 25.99}]}
{"order_id": "O1002", "products": [{"code": "P007", "name": "Mouse Pad", "price": 7.99}]}
{"order_id": "O1003", "products": [{"code": "P003", "name": "Keyboard", "price": 79.50}]}`;

      const result = await processFullExpression(jsonlData, '$.products| flatten()|filter(contains($.name,"Mouse"))');

      expect(result).toHaveLength(2);
      expect(result[0].name).toContain('Mouse');
      expect(result[1].name).toContain('Mouse');
    });

    test('should work with case-insensitive search', async () => {
      const jsonlData = `{"order_id": "O1001", "products": [{"code": "P001", "name": "USB-C Cable", "price": 9.99}]}
{"order_id": "O1002", "products": [{"code": "P002", "name": "USB Hub", "price": 29.99}]}`;

      const result = await processFullExpression(jsonlData, '$.products| flatten()|filter(contains($.name,"usb"))');

      expect(result).toHaveLength(2);
    });

    test('should return empty array when no matches found', async () => {
      const jsonlData = `{"order_id": "O1001", "products": [{"code": "P001", "name": "Mouse", "price": 25.99}]}
{"order_id": "O1002", "products": [{"code": "P002", "name": "Keyboard", "price": 79.50}]}`;

      const result = await processFullExpression(jsonlData, '$.products| flatten()|filter(contains($.name,"Bluetooth"))');

      expect(result).toHaveLength(0);
    });

    test('should handle special characters in search term', async () => {
      const jsonlData = `{"order_id": "O1001", "products": [{"code": "P001", "name": "USB-C Cable", "price": 9.99}]}
{"order_id": "O1002", "products": [{"code": "P002", "name": "USB Hub", "price": 29.99}]}`;

      const result = await processFullExpression(jsonlData, '$.products| flatten()|filter(contains($.name,"USB-C"))');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('USB-C Cable');
    });

    test('should work with numeric exact match in pipeline', async () => {
      const jsonlData = `{"order_id": "O1001", "products": [{"code": "P001", "name": "Mouse", "price": 25.99}]}
{"order_id": "O1002", "products": [{"code": "P002", "name": "Keyboard", "price": 79.50}]}
{"order_id": "O1003", "products": [{"code": "P003", "name": "Cable", "price": 25.99}]}`;

      const result = await processFullExpression(jsonlData, '$.products| flatten()|filter(contains($.price,25.99))');

      expect(result).toHaveLength(2);
      expect(result.every(p => p.price === 25.99)).toBe(true);
    });

    test('should work with product code exact match', async () => {
      const jsonlData = `{"order_id": "O1001", "products": [{"code": "P001", "name": "Mouse"}]}
{"order_id": "O1002", "products": [{"code": "P002", "name": "Keyboard"}]}
{"order_id": "O1003", "products": [{"code": "P001", "name": "Mouse"}]}`;

      const result = await processFullExpression(jsonlData, '$.products| flatten()|filter(contains($.code,"P001"))');

      expect(result).toHaveLength(2);
      expect(result.every(p => p.code === 'P001')).toBe(true);
    });
  });
});
