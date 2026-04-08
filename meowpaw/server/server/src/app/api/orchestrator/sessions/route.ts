import { NextRequest } from "next/server";
import Database from 'better-sqlite3';
import { join } from 'path';

const dbPath = join(process.cwd(), 'local.db');

function getDb() {
  return new Database(dbPath);
}

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const userId = searchParams.get("userId") || 'test-user';

        const db = getDb();
        const sessions = db.prepare(`
            SELECT * FROM orchestrator_sessions
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT 20
        `).all(userId);

        db.close();

        return Response.json({ status: "success", sessions }, { status: 200 });
    } catch (error) {
        console.error("Error in sessions API:", error);
        return Response.json({ error: "Internal server error" }, { status: 500 });
    }
}