import { getDbClient } from '../db/client';

/**
 * Gets the current gas credit balance for a user.
 */
export function getBalance(userId: string): number {
    const db = getDbClient();
    return db.getGasBalance(userId);
}

/**
 * Debits credits from a user's gas balance.
 * Throws an error if the user has insufficient funds.
 */
export function debitCredits(userId: string, amount: number): boolean {
    const db = getDbClient();
    const currentBalance = db.getGasBalance(userId);

    if (currentBalance < amount) {
        throw new Error(`Insufficient gas credits. Required: ${amount}, Available: ${currentBalance}`);
    }

    db.debitGas(userId, amount);
    return true;
}

/**
 * Adds credits to a user's gas balance (e.g. from Stripe checkout).
 */
export function addCredits(userId: string, amount: number): void {
    const db = getDbClient();
    db.addGasCredits(userId, amount);
}
