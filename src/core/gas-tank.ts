import { DBClient } from "../db/client";

export class GasTank {
  private db: DBClient;

  constructor(db: DBClient) {
    this.db = db;
  }

  async initializeGasLedger(userId: string): Promise<void> {
    // Await properly for potential async DBClient implementation later
    await Promise.resolve(this.db.initializeGasLedger(userId));
  }

  async addCredits(userId: string, amount: number): Promise<{ newBalance: number }> {
    await Promise.resolve(this.db.creditGas(userId, amount));
    const newBalance = await Promise.resolve(this.db.getGasBalance(userId));
    return { newBalance };
  }

  async debitExecution(userId: string, executionCost: number = 1, idempotencyKey?: string): Promise<{ newBalance: number }> {
    if (idempotencyKey) {
      const isDuplicate = await Promise.resolve(this.db.checkIdempotency(idempotencyKey));
      if (isDuplicate) {
        const currentBalance = await Promise.resolve(this.db.getGasBalance(userId));
        return { newBalance: currentBalance };
      }
    }

    const success = await Promise.resolve(this.db.debitGas(userId, executionCost));

    if (!success) {
      throw new Error("Insufficient gas credits");
    }

    if (idempotencyKey) {
      await Promise.resolve(this.db.logTransaction(idempotencyKey, 'completed', { amount: executionCost }));
    }

    const newBalance = await Promise.resolve(this.db.getGasBalance(userId));
    return { newBalance };
  }

  async getBalance(userId: string): Promise<number> {
    return Promise.resolve(this.db.getGasBalance(userId));
  }
}
