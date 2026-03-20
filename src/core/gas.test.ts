import { test, expect, mock, beforeEach } from 'bun:test';
import * as gas from './gas';
import { DBClient } from '../db/client';

// Mock DBClient globally
const mockDb = {
    getGasBalance: mock((userId: string) => 0),
    debitGas: mock((userId: string, amount: number) => {}),
    addGasCredits: mock((userId: string, amount: number) => {})
};

mock.module('../db/client', () => ({
    getDbClient: () => mockDb,
    DBClient: class {
        constructor() { return mockDb; }
    }
}));

beforeEach(() => {
    mockDb.getGasBalance.mockClear();
    mockDb.debitGas.mockClear();
    mockDb.addGasCredits.mockClear();
});

test('getBalance returns the current gas balance', () => {
    mockDb.getGasBalance.mockReturnValueOnce(15);
    const balance = gas.getBalance('user123');

    expect(mockDb.getGasBalance).toHaveBeenCalledWith('user123');
    expect(balance).toBe(15);
});

test('addCredits adds credits using the database client', () => {
    gas.addCredits('user123', 5);
    expect(mockDb.addGasCredits).toHaveBeenCalledWith('user123', 5);
});

test('debitCredits successfully deducts if balance is sufficient', () => {
    mockDb.getGasBalance.mockReturnValueOnce(10);

    const result = gas.debitCredits('user123', 2);

    expect(mockDb.getGasBalance).toHaveBeenCalledWith('user123');
    expect(mockDb.debitGas).toHaveBeenCalledWith('user123', 2);
    expect(result).toBe(true);
});

test('debitCredits throws an error if balance is insufficient', () => {
    mockDb.getGasBalance.mockReturnValueOnce(1);

    expect(() => {
        gas.debitCredits('user123', 2);
    }).toThrow('Insufficient gas credits. Required: 2, Available: 1');

    expect(mockDb.debitGas).not.toHaveBeenCalled();
});
