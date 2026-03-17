import { expect, test, describe, beforeEach, afterAll } from 'bun:test';
import { NextRequest } from 'next/server';
import { GET, POST } from '../app/api/keys/route';
import { DELETE } from '../app/api/keys/[id]/route';
import { getDbClient } from '../../../src/db/client';

describe('Keys API route tests', () => {
    let testKeyId: string;
    const MOCK_USER_ID = 'test-user';

    beforeEach(() => {
        // Init the db
        const dbClient = getDbClient();
        const fs = require('fs');
        const path = require('path');
        const migrationSql = fs.readFileSync(path.join(process.cwd(), 'src/db/migrations/001_motherboard.sql'), 'utf-8');
        dbClient.applyMigration(migrationSql);

        // Clear all keys from the DB
        const rows = (dbClient as any).db.query(`SELECT id FROM vault_user_secrets`).all();
        rows.forEach((row: any) => {
            dbClient.deleteSecret(MOCK_USER_ID, row.id);
        });
    });

    test('POST should add a new key', async () => {
        const req = new NextRequest('http://localhost:3000/api/keys', {
            method: 'POST',
            body: JSON.stringify({
                provider: 'openai',
                secret: 'sk-1234567890'
            })
        });

        const res = await POST(req);
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.id).toBeDefined();

        testKeyId = data.id;

        // Verify it was added to the db
        const dbClient = getDbClient();
        const keys = dbClient.getSecrets(MOCK_USER_ID);
        expect(keys.length).toBe(1);
        expect(keys[0].provider).toBe('openai');
        expect(keys[0].maskedKey).toBe('sk-...abcd');
    });

    test('GET should return all stored keys', async () => {
        // Setup initial key
        const dbClient = getDbClient();
        dbClient.addSecret(MOCK_USER_ID, 'gemini_key', 'some-encrypted-string', 'gemini');

        const req = new NextRequest('http://localhost:3000/api/keys', {
            method: 'GET'
        });

        const res = await GET(req);
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.keys.length).toBe(1);
        expect(data.keys[0].provider).toBe('gemini');
        expect(data.keys[0].maskedKey).toBe('sk-...abcd');
    });

    test('DELETE should remove a key', async () => {
        // Setup initial key
        const dbClient = getDbClient();
        const id = dbClient.addSecret(MOCK_USER_ID, 'anthropic_key', 'some-encrypted-string', 'anthropic');

        const req = new NextRequest(`http://localhost:3000/api/keys/${id}`, {
            method: 'DELETE'
        });

        const res = await DELETE(req, { params: { id } });
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.success).toBe(true);

        // Verify it was removed
        const keys = dbClient.getSecrets(MOCK_USER_ID);
        expect(keys.length).toBe(0);
    });

    test('POST should fail if provider or secret is missing', async () => {
        const req = new NextRequest('http://localhost:3000/api/keys', {
            method: 'POST',
            body: JSON.stringify({
                provider: 'openai'
                // secret missing
            })
        });

        const res = await POST(req);
        const data = await res.json();

        expect(res.status).toBe(400);
        expect(data.error).toBeDefined();
    });
});
