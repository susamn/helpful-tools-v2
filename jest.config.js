module.exports = {
  testEnvironment: 'jsdom',
  testMatch: [
    '**/tests/**/*.spec.js',
    '!**/tests/**/*.test.js',  // Exclude .test.js files (they use custom TestRunner)
    '!**/tests/**/*.html'
  ],
  collectCoverageFrom: [
    'frontend/static/js/**/*.js',
    '!frontend/static/js/workers/**/*.js', // Exclude workers for now
    '!**/node_modules/**'
  ],
  coverageDirectory: 'coverage',
  verbose: true,
  testTimeout: 10000,
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js']
};
