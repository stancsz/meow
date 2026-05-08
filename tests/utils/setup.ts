import { beforeEach, afterEach, vi } from "vitest";

/**
 * Global test setup for MEOW test suite.
 * Enables fake timers for all tests automatically.
 */

// Enable fake timers globally for all tests
beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// Mock console.warn and console.error to reduce noise in tests
// Uncomment if needed during development:
// beforeEach(() => {
//   vi.spyOn(console, 'warn').mockImplementation(() => {});
//   vi.spyOn(console, 'error').mockImplementation(() => {});
// });
