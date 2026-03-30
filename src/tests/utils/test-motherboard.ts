import { DBClient } from "../../db/client";
import * as fs from "fs";

export class TestMotherboard {
    public db: DBClient;
    public testDbPath: string;

    constructor(dbName: string = "test_motherboard") {
        this.testDbPath = `sqlite://${dbName}.sqlite`;
        // Explicitly set the environment variable for DBClient initialization
        process.env.DATABASE_URL = this.testDbPath;
        this.db = new DBClient(this.testDbPath);
    }

    public async setup(): Promise<void> {
        try {
            // Read and apply the base migrations
            const schema = fs.readFileSync("src/db/migrations/001_motherboard.sql", "utf-8");
            this.db.applyMigration(schema);

            // Seed common test data
            this.db.applyMigration(`
                INSERT OR IGNORE INTO platform_users (user_id, supabase_url, encrypted_service_role)
                VALUES ('test_user_1', 'https://test1.supabase.co', 'mock_encrypted_key_1');

                INSERT OR IGNORE INTO gas_ledger (id, user_id, balance_credits)
                VALUES ('gas_test_user_1', 'test_user_1', 100);
            `);
        } catch (error) {
            console.error("Error setting up TestMotherboard:", error);
            throw error;
        }
    }

    public async teardown(): Promise<void> {
        try {
            // Clean up the physical SQLite file if it exists
            const filePath = this.testDbPath.replace("sqlite://", "");
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        } catch (error) {
            console.error("Error tearing down TestMotherboard:", error);
        }
    }

    // Helper to fetch session status directly
    public getSessionStatus(sessionId: string): string | null {
        const session = this.db.getSession(sessionId);
        return session ? session.status : null;
    }

    // Helper to fetch task results for a session
    public getTaskResults(sessionId: string): any[] {
        // We use any casting here because db query interface is loose in the client
        return (this.db as any).db.query("SELECT * FROM task_results WHERE session_id = ?").all(sessionId);
    }

    // Helper to manually adjust gas for tests
    public setGasBalance(userId: string, balance: number): void {
        this.db.applyMigration(`
            UPDATE gas_ledger
            SET balance_credits = ${balance}
            WHERE user_id = '${userId}';
        `);
    }
}
