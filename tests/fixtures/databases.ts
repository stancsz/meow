import { vi } from "vitest";
import { DatabasePort } from "../../src/extensions/database/manifest";

export interface MockDatabaseOptions {
  queryDelay?: number;
  executeDelay?: number;
  batchDelay?: number;
  queryErrors?: string[];
  executeErrors?: string[];
  batchErrors?: string[];
  shouldFailQuery?: boolean;
  shouldFailExecute?: boolean;
  shouldFailBatch?: boolean;
  queryResults?: any[];
  executeResult?: { changes: number; lastInsertRowid: number };
  batchResult?: { processed: number; errors: string[] };
}

/**
 * Factory for creating configurable DatabasePort mocks.
 * Replaces inline mock objects scattered across test files.
 */
export function createMockDatabase(options: MockDatabaseOptions = {}): DatabasePort {
  const {
    queryDelay = 0,
    executeDelay = 0,
    batchDelay = 0,
    queryErrors = [],
    executeErrors = [],
    batchErrors = [],
    shouldFailQuery = false,
    shouldFailExecute = false,
    shouldFailBatch = false,
    queryResults = [],
    executeResult = { changes: 1, lastInsertRowid: 1 },
    batchResult = { processed: 0, errors: [] },
  } = options;

  let queryErrorIndex = 0;
  let executeErrorIndex = 0;
  let batchErrorIndex = 0;

  return {
    query: vi.fn().mockImplementation(async <T = any>(_sql: string, _params?: any[]): Promise<T[]> => {
      if (queryDelay) {
        await new Promise(resolve => setTimeout(resolve, queryDelay));
      }
      if (shouldFailQuery) {
        throw new Error("Database query failed");
      }
      if (queryErrors.length > queryErrorIndex) {
        throw new Error(queryErrors[queryErrorIndex++]);
      }
      return queryResults as T[];
    }),

    execute: vi.fn().mockImplementation(async (_sql: string, _params?: any[]): Promise<{ changes: number; lastInsertRowid: number }> => {
      if (executeDelay) {
        await new Promise(resolve => setTimeout(resolve, executeDelay));
      }
      if (shouldFailExecute) {
        throw new Error("Database execute failed");
      }
      if (executeErrors.length > executeErrorIndex) {
        throw new Error(executeErrors[executeErrorIndex++]);
      }
      return executeResult;
    }),

    exec: vi.fn().mockImplementation(async (_sql: string): Promise<{ done: boolean }> => {
      return { done: true };
    }),

    batch: vi.fn().mockImplementation(async (actions: any[]): Promise<{ processed: number; errors: string[] }> => {
      if (batchDelay) {
        await new Promise(resolve => setTimeout(resolve, batchDelay));
      }
      if (shouldFailBatch) {
        throw new Error("Database batch failed");
      }
      if (batchErrors.length > batchErrorIndex) {
        throw new Error(batchErrors[batchErrorIndex++]);
      }
      return batchResult;
    }),

    close: vi.fn().mockImplementation(async (): Promise<void> => {}),

    loadExtension: vi.fn().mockImplementation(async (_path: string): Promise<void> => {}),
  };
}

/**
 * Create a mock database that always succeeds.
 * Useful for quick test setup.
 */
export function createMockDatabaseSucceeds(): DatabasePort {
  return createMockDatabase();
}

/**
 * Create a mock database that fails queries.
 * Useful for testing error handling.
 */
export function createMockDatabaseQueryFails(errors: string[] = ["Query error"]): DatabasePort {
  return createMockDatabase({ queryErrors: errors });
}

/**
 * Create a mock database that fails batches.
 * Useful for testing batch failure scenarios.
 */
export function createMockDatabaseBatchFails(errors: string[] = ["Batch error"]): DatabasePort {
  return createMockDatabase({ batchErrors: errors });
}

/**
 * Create a mock database with delayed responses.
 * Useful for testing timeout behavior.
 */
export function createMockDatabaseSlow(delayMs: number = 100): DatabasePort {
  return createMockDatabase({
    queryDelay: delayMs,
    executeDelay: delayMs,
    batchDelay: delayMs,
  });
}
