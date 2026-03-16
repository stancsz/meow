import { Database } from 'bun:sqlite';

export class DBClient {
  private db: Database | null = null;
  private isSupabase = false;

  constructor(databaseUrl: string = process.env.DATABASE_URL || 'sqlite://local.db') {
    if (databaseUrl.startsWith('supabase://')) {
      this.isSupabase = true;
      // Note: In a real app we'd init a Supabase client here.
      // We are just simulating the DB interface locally for now per the SPEC.
      console.warn("Supabase connection mode active, but only partial mocked interface is available.");
    } else {
      const dbPath = databaseUrl.replace('sqlite://', '');
      this.db = new Database(dbPath, { create: true });
    }
  }

  applyMigration(sql: string) {
    if (this.isSupabase) {
      console.warn("Migrations are usually handled by Supabase CLI, not the client code.");
      return;
    }
    if (this.db) {
        // exec is preferred for multiple statements
        this.db.exec(sql);
    }
  }

  createSession(userId: string, context: any, manifest: any): string {
    const sessionId = crypto.randomUUID();
    if (this.isSupabase) {
      console.warn("Mock createSession Supabase");
      return sessionId;
    }

    if (this.db) {
      this.db.run(
        `INSERT INTO orchestrator_sessions (id, user_id, context, manifest, status) VALUES (?, ?, ?, ?, 'active')`,
        [sessionId, userId, JSON.stringify(context), JSON.stringify(manifest)]
      );
      this.writeAuditLog(sessionId, 'intent_received', { status: 'active' });
    }
    return sessionId;
  }

  updateSessionStatus(sessionId: string, status: string) {
     if (this.isSupabase) {
        console.warn(`Mock updateSessionStatus to ${status}`);
        return;
     }
     if (this.db) {
        this.db.run(
          `UPDATE orchestrator_sessions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [status, sessionId]
        );
        this.writeAuditLog(sessionId, 'plan_approved', { status });
     }
  }

  getSession(sessionId: string): any {
    if (this.isSupabase) {
        return null;
    }
    if (this.db) {
        const row = this.db.query(`SELECT * FROM orchestrator_sessions WHERE id = ?`).get(sessionId) as any;
        if (row) {
             try {
                 if (typeof row.context === 'string') row.context = JSON.parse(row.context);
                 if (typeof row.manifest === 'string') row.manifest = JSON.parse(row.manifest);
             } catch (e) {
                 console.error("Failed to parse JSON for session", sessionId, e);
             }
        }
        return row;
    }
    return null;
  }

  checkIdempotency(key: string): boolean {
    if (this.isSupabase) {
        return false;
    }
    if (this.db) {
        const row = this.db.query(`SELECT * FROM transaction_log WHERE idempotency_key = ? AND status = 'completed'`).get(key);
        return !!row;
    }
    return false;
  }

  logTransaction(key: string, status: string, result: any) {
    if (this.isSupabase) return;
    if (this.db) {
        this.db.run(
            `INSERT INTO transaction_log (idempotency_key, status, result) VALUES (?, ?, ?)
             ON CONFLICT(idempotency_key) DO UPDATE SET status = excluded.status, result = excluded.result`,
            [key, status, JSON.stringify(result)]
        );
    }
  }

  writeAuditLog(sessionId: string, event: string, metadata: any) {
    if (this.isSupabase) return;
    if (this.db) {
        const id = crypto.randomUUID();
        this.db.run(
            `INSERT INTO audit_log (id, session_id, event, metadata) VALUES (?, ?, ?, ?)`,
            [id, sessionId, event, JSON.stringify(metadata)]
        );
    }
  }

  simulateReadSecret(secretId: string): string {
    if (this.isSupabase) return "MOCK_SUPABASE_SECRET";

    if (this.db) {
        const row = this.db.query(`SELECT secret FROM vault_user_secrets WHERE id = ?`).get(secretId) as any;

        // Log access simulation
        this.writeAuditLog('', 'secret_accessed', { secret_id: secretId });

        return row ? row.secret : null;
    }
    return "";
  }
}

export const getDbClient = () => {
   return new DBClient();
};
