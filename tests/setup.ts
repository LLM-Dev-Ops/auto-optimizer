/**
 * Jest Test Setup
 * Configures global test environment and utilities
 */

export {};

// Set test timeout
jest.setTimeout(10000);

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  error: jest.fn(),
  warn: jest.fn(),
  log: jest.fn(),
  debug: jest.fn(),
};

// Set test environment variables
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "error";

// Global test utilities
declare global {
  // eslint-disable-next-line no-var
  var sleep: (ms: number) => Promise<void>;
}

global.sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

// Cleanup after each test
afterEach(() => {
  jest.clearAllMocks();
});
