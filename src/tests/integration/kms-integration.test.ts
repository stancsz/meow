import { describe, it, expect, beforeEach } from "bun:test";
import { MockGCPKMS } from "../utils/mock-kms";
import { MockWorkerRuntime } from "../utils/mock-worker-runtime";
import { Task } from "../../core/types";

describe("KMS Integration & Worker Lifecycle", () => {
  let kms: MockGCPKMS;

  beforeEach(() => {
    kms = new MockGCPKMS();
  });

  it("should encrypt and decrypt plaintext correctly", async () => {
    const plaintext = "super-secret-key-123";
    const ciphertext = await kms.encrypt(plaintext);

    expect(ciphertext).not.toBe(plaintext);
    expect(ciphertext).toBeTruthy(); // It encodes as base64

    const decrypted = await kms.decrypt(ciphertext);
    expect(decrypted).toBe(plaintext);
  });

  it("should fail decryption when invalid ciphertext is provided", async () => {
    const invalidCiphertext = Buffer.from("invalid:data").toString("base64");

    expect(kms.decrypt(invalidCiphertext)).rejects.toThrow("Invalid mock ciphertext format");
  });

  it("should simulate decryption failure when KMS is down or permission denied", async () => {
    kms.simulateFailure(true);
    const plaintext = "secret";
    const ciphertext = await kms.encrypt(plaintext);

    expect(kms.decrypt(ciphertext)).rejects.toThrow("KMS Decryption failed: invalid key or permission denied");
  });

  it("Worker Runtime should fetch decrypted credentials and execute successfully", async () => {
    const runtime = new MockWorkerRuntime(kms);
    const task: Task = {
      id: "test-task",
      description: "Test execution",
      worker: "worker-gh",
      skills: ["github-skill"],
      credentials: ["github_token"],
      depends_on: [],
      action_type: "READ"
    };

    const encryptedToken = await kms.encrypt("actual-github-token-value");

    const result = await runtime.simulateWorkerLifecycle(task, [encryptedToken]);

    expect(result.status).toBe("success");
    expect(result.credentials_used).toBe(1); // One credential passed and decrypted
    expect(result.skill_content_preview).toBe("loaded-github-skill-v1.0"); // ensure JIT was loaded
  });

  it("Worker Runtime should fail execution if KMS decryption fails", async () => {
    const runtime = new MockWorkerRuntime(kms);
    kms.simulateFailure(true);
    const task: Task = {
      id: "test-task",
      description: "Test execution",
      worker: "worker-gh",
      skills: ["github-skill"],
      credentials: ["github_token"],
      depends_on: [],
      action_type: "READ"
    };

    const encryptedToken = await kms.encrypt("actual-github-token-value");

    const result = await runtime.simulateWorkerLifecycle(task, [encryptedToken]);

    expect(result.status).toBe("error");
    expect(result.message).toBe("KMS Decryption failed: invalid key or permission denied");
  });
});
