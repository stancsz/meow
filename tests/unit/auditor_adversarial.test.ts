import { describe, it, expect, vi, beforeEach } from "vitest";
import { Auditor, WorkerOutput } from "../../src/auditor/Auditor";
import { Agent } from "../../src/agent/agent";

/**
 * L4 Auditor Adversarial Test
 *
 * Ensures: L4 (Auditor) catches a "Lying Specialist" (e.g., a worker that claims
 * it wrote tests but didn't).
 * Test: Provide a mock specialist result with a TODO comment and verify L4 rejects it.
 */
describe("Auditor Adversarial", () => {
  let auditor: Auditor;
  let mockAgent: Partial<Agent>;

  beforeEach(() => {
    mockAgent = {
      callLLM: vi.fn().mockResolvedValue("PASS"),
    } as any;

    auditor = new Auditor(mockAgent as Agent, {
      requireShadowAudit: true,
      blockOnPlaceholders: true,
      minCoherenceScore: 60,
    });
  });

  it("should reject output containing TODO placeholders", async () => {
    const workerOutput: WorkerOutput = {
      missionId: "test-mission-1",
      workerType: "claude",
      goal: "Implement the authentication feature",
      diff: `
        // TODO: Implement authentication logic
        function auth() {
          // TODO: Add token validation
        }
      `,
      output: "I have implemented the feature",
    };

    const result = await auditor.audit("test-mission-1", workerOutput);

    expect(result.passed).toBe(false);
    expect(result.issues.some(i => i.toLowerCase().includes("placeholder"))).toBe(true);
  });

  it("should reject output containing FIXME comments", async () => {
    const workerOutput: WorkerOutput = {
      missionId: "test-mission-2",
      workerType: "aider",
      goal: "Fix the race condition",
      diff: `
        // FIXME: This is a hack, needs proper fix later
        async function handleRequest() {
          // FIXME: Add error handling
        }
      `,
      output: "Fixed the issue",
    };

    const result = await auditor.audit("test-mission-2", workerOutput);

    expect(result.passed).toBe(false);
    expect(result.issues.some(i => i.toLowerCase().includes("fixme"))).toBe(true);
  });

  it("should reject output with 'placeholder' text", async () => {
    const workerOutput: WorkerOutput = {
      missionId: "test-mission-3",
      workerType: "claude",
      goal: "Add validation",
      diff: `
        // placeholder implementation
        function validate() {
          return true; // placeholder
        }
      `,
      output: "Added validation",
    };

    const result = await auditor.audit("test-mission-3", workerOutput);

    expect(result.passed).toBe(false);
  });

  it("should accept clean output without placeholders", async () => {
    const workerOutput: WorkerOutput = {
      missionId: "test-mission-4",
      workerType: "claude",
      goal: "Add validation",
      diff: `
        function validateEmail(email: string): boolean {
          const emailRegex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
          return emailRegex.test(email);
        }
      `,
      output: "Added email validation",
    };

    const result = await auditor.audit("test-mission-4", workerOutput);

    // May pass or fail depending on other checks, but placeholder check should pass
    const placeholderStage = result.stages.find(s => s.name === "Placeholder Detection");
    expect(placeholderStage?.passed).toBe(true);
  });

  it("should perform pre-execution blocking for dangerous commands", async () => {
    const result = await auditor.preExecutionCheck("rm -rf /important/directory");

    expect(result.allowed).toBe(false);
    expect(result.blockers.some(b => b.includes("Recursive force delete"))).toBe(true);
  });

  it("should block DROP TABLE commands", async () => {
    const result = await auditor.preExecutionCheck("DROP TABLE users");

    expect(result.allowed).toBe(false);
    expect(result.blockers.some(b => b.includes("DROP TABLE"))).toBe(true);
  });

  it("should block chmod 777 commands", async () => {
    const result = await auditor.preExecutionCheck("chmod 777 /etc/passwd");

    expect(result.allowed).toBe(false);
    expect(result.blockers.some(b => b.includes("World-writable permission"))).toBe(true);
  });

  it("should allow non-dangerous commands", async () => {
    const result = await auditor.preExecutionCheck("Create a new function to calculate sum");

    expect(result.allowed).toBe(true);
    expect(result.blockers).toHaveLength(0);
  });

  it("should warn on large-scale changes", async () => {
    const result = await auditor.preExecutionCheck("Refactor all files in the project");

    expect(result.warnings.some(w => w.includes("Large-scale change"))).toBe(true);
  });

  it("should warn on production database modifications", async () => {
    const result = await auditor.preExecutionCheck("Update production database schema");

    expect(result.warnings.some(w => w.includes("Production database"))).toBe(true);
  });

  it("should validate PQC boundaries - detect MD5", async () => {
    const code = `
      const hash = require('crypto').createHash('md5');
      function hashPassword(password: string): string {
        return createHash('md5').update(password).digest('hex');
      }
    `;

    const result = auditor.validatePqcBoundaries(code);

    expect(result.valid).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it("should validate PQC boundaries - detect weak RSA", async () => {
    const code = `
      // Using RSA 512-bit key - vulnerable to quantum attacks
      const crypto = require('crypto');
      const key = crypto.generateKeyPairSync('rsa', {
        modulusLength: 512,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });
    `;

    const result = auditor.validatePqcBoundaries(code);

    expect(result.valid).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it("should validate PQC boundaries - DES cipher", async () => {
    const code = `
      const cipher = crypto.createCipher('des-ecb', key);
    `;

    const result = auditor.validatePqcBoundaries(code);

    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.includes("DES"))).toBe(true);
  });

  it("should pass PQC check for modern secure code", async () => {
    const code = `
      const crypto = require('crypto');
      // Using AES-256-GCM for encryption
      const algorithm = 'aes-256-gcm';
      const key = crypto.randomBytes(32);
    `;

    const result = auditor.validatePqcBoundaries(code);

    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("should compute coherence score", async () => {
    const workerOutput: WorkerOutput = {
      missionId: "test-mission-5",
      workerType: "claude",
      goal: "Implement feature",
      diff: "function test() { return true; }",
      output: "Done",
    };

    const result = await auditor.audit("test-mission-5", workerOutput);

    expect(result.coherenceScore).toBeGreaterThanOrEqual(0);
    expect(result.coherenceScore).toBeLessThanOrEqual(100);
  });

  it("should include all audit stages in result", async () => {
    const workerOutput: WorkerOutput = {
      missionId: "test-mission-6",
      workerType: "claude",
      goal: "Simple task",
      diff: "function done() {}",
      output: "Complete",
    };

    const result = await auditor.audit("test-mission-6", workerOutput);

    const stageNames = result.stages.map(s => s.name);
    expect(stageNames).toContain("Placeholder Detection");
    expect(stageNames).toContain("Logic Coherence");
    expect(stageNames).toContain("Shadow Audit");
    expect(stageNames).toContain("SOP Compliance");
  });

  it("should update audit policy", async () => {
    const newPolicy = {
      requireShadowAudit: false,
      minCoherenceScore: 80,
    };

    auditor.updatePolicy(newPolicy);

    const policy = auditor.getPolicy();
    expect(policy.requireShadowAudit).toBe(false);
    expect(policy.minCoherenceScore).toBe(80);
  });

  it("should reject quantum file modification without explicit intent", async () => {
    const result = await auditor.preExecutionCheck(
      "Modify quantum_reasoning.ts to add new optimization"
    );

    expect(result.allowed).toBe(false);
    expect(result.blockers.some(b => b.includes("Quantum file modification"))).toBe(true);
  });

  it("should allow quantum file modification with explicit intent", async () => {
    const result = await auditor.preExecutionCheck(
      "explicitly modify quantum_reasoning.ts to add optimization"
    );

    // With explicit intent (lowercase), quantum file modification should be allowed
    expect(result.allowed).toBe(true);
  });
});
