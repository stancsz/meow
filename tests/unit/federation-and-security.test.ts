import { describe, it, expect, vi, beforeEach } from "vitest";
import * as crypto from "crypto";
import { FedServer, FedClient } from "../../src/swarm/federation/FedHub";
import { PiiFilter } from "../../src/agent/security/PiiFilter";
import { makeTask } from "../fixtures/tasks";

describe("Zero-Trust Federation Hub & ed25519 Authentication", () => {
  it("should successfully run ed25519 challenge-response handshake and delegate tasks", async () => {
    // Generate ed25519 keys natively
    const clientKeys = crypto.generateKeyPairSync("ed25519");
    const serverKeys = crypto.generateKeyPairSync("ed25519");

    const clientKeyPem = clientKeys.publicKey.export({ type: "spki", format: "pem" }) as string;
    const serverKeyPem = serverKeys.publicKey.export({ type: "spki", format: "pem" }) as string;

    const serverPort = 9988;
    const server = new FedServer(serverPort, {
      publicKey: serverKeyPem,
      privateKey: serverKeys.privateKey,
    });

    // Register a simple task execution handler
    server.setTaskHandler(async (task) => {
      return {
        taskId: task.id,
        success: true,
        output: `Executed: ${task.description} successfully on server.`,
      };
    });

    await server.start();

    const client = new FedClient(`ws://localhost:${serverPort}`, {
      publicKey: clientKeyPem,
      privateKey: clientKeys.privateKey,
    });

    const isConnected = await client.connect();
    expect(isConnected).toBe(true);

    // Now delegate a task
    const task = makeTask({
      id: "delegated-t1",
      description: "Format files in workspace",
    });

    const result = await client.delegateTask(task);
    expect(result.success).toBe(true);
    expect(result.output).toContain("Executed: Format files in workspace successfully on server.");

    // Cleanup
    client.disconnect();
    await server.stop();
  });
});

describe("PII Security Redactor & Credential Filter", () => {
  it("should redact email, API keys, and DB credentials in REDACT mode", () => {
    const filter = new PiiFilter("REDACT");

    const input = "Hi, my email is admin@example.com. Anthropic key: sk-ant-sid01-abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ01234567890123456789abcdefghijklmnopqrstuvw. Connection: postgres://user:secretpassword@localhost:5432/db";
    const output = filter.filter(input);

    expect(output).toContain("[REDACTED_EMAIL]");
    expect(output).toContain("[REDACTED_ANTHROPIC_KEY]");
    expect(output).toContain("postgres://user:[REDACTED_PASSWORD]@");
    expect(output).not.toContain("admin@example.com");
    expect(output).not.toContain("secretpassword");
  });

  it("should hash sensitive data to preserve uniqueness in HASH mode", () => {
    const filter = new PiiFilter("HASH");

    const input = "Send details to developer1@example.com and developer2@example.com";
    const output = filter.filter(input);

    expect(output).toContain("[HASHED_EMAIL_");
    expect(output).not.toContain("developer1@example.com");
    expect(output).not.toContain("developer2@example.com");

    // Uniqueness assertion (two different emails produce two different hashes)
    const matches = output.match(/HASHED_EMAIL_[a-f0-9]{16}/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(2);
    expect(matches![0]).not.toBe(matches![1]);
  });

  it("should block and throw error if sensitive data is matched in BLOCK mode", () => {
    const filter = new PiiFilter("BLOCK");

    expect(() => {
      filter.filter("API token is ghp_123456789012345678901234567890123456");
    }).toThrow("Security Block");
  });
});
