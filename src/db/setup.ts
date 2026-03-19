import { DBClient } from './client';
import * as fs from 'fs';
import * as path from 'path';

console.log('Setting up local SQLite database...');
const dbClient = new DBClient();
const migrationSql = fs.readFileSync(path.join(process.cwd(), 'src', 'db', 'migrations', '001_motherboard.sql'), 'utf-8');
dbClient.applyMigration(migrationSql);
try {
  const migration2Sql = fs.readFileSync(path.join(process.cwd(), 'src', 'db', 'migrations', '002_add_last_used_at.sql'), 'utf-8');
  dbClient.applyMigration(migration2Sql);
} catch (e) {
  // Ignore if column already exists
  if (!e.message.includes('duplicate column name')) {
    throw e;
  }
}
console.log('Database setup complete: local.db');
