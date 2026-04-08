import { NextRequest } from "next/server";
import Database from 'better-sqlite3';
import { join } from 'path';

const dbPath = join(process.cwd(), 'local.db');

function getDb() {
  return new Database(dbPath);
}

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        const db = getDb();
        const tasks = db.prepare(`
            SELECT * FROM task_results
            WHERE session_id = ?
            ORDER BY created_at DESC
        `).all(id);

        db.close();

        return Response.json({ status: "success", tasks }, { status: 200 });
    } catch (error) {
        console.error("Error in session tasks API:", error);
        return Response.json({ error: "Internal server error" }, { status: 500 });
    }
}