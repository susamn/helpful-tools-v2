/**
 * Jest setup file - runs before all tests
 * Sets up global mocks and dependencies
 */

// Import jsonpath library
global.jsonpath = require('jsonpath');

// Mock fetch for history manager
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ history: [] })
  })
);

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn()
};
global.localStorage = localStorageMock;

// Mock createHistoryManager
global.createHistoryManager = () => ({
  addHistoryEntry: jest.fn(),
  getHistory: jest.fn(() => []),
  clearHistory: jest.fn()
});

// Mock createSourceSelector
global.createSourceSelector = jest.fn(async () => ({
  show: jest.fn(),
  hide: jest.fn()
}));

// Mock validationUtils
global.validationUtils = {
  populateValidatorSelect: jest.fn(),
  clearValidationStatus: jest.fn(),
  validateJson: jest.fn()
};

console.log('✅ Jest setup complete - globals and mocks ready');
