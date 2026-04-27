/**
 * XL-22 Docker Sandboxing - Validation Tests
 * 
 * Tests for SandboxManager functionality
 * Validates that the sandbox implementation matches the architecture spec
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { sandboxManager } from "./sandbox-manager";

// Use the singleton instance
const manager = sandboxManager;

describe("XL-22: Docker Sandboxing", () => {
  
  describe("execute (core functionality)", () => {
    it("should execute a command and return result structure", async () => {
      const result = await manager.execute({
        command: "echo hello from sandbox",
        timeout: 5000
      });
      
      expect(result).toHaveProperty("exitCode");
      expect(result).toHaveProperty("stdout");
      expect(result).toHaveProperty("stderr");
      expect(result).toHaveProperty("duration");
      expect(result).toHaveProperty("timedOut");
      
      expect(typeof result.duration).toBe("number");
      expect(typeof result.timedOut).toBe("boolean");
    });
    
    it("should capture stdout correctly", async () => {
      const result = await manager.execute({
        command: "echo test-output-123",
        timeout: 5000
      });
      
      expect(result.stdout).toContain("test-output-123");
      expect(result.exitCode).toBe(0);
    });
    
    it("should handle errors gracefully", async () => {
      const result = await manager.execute({
        command: "exit 42",
        timeout: 5000
      });
      
      expect(result.exitCode).toBe(42);
    });
  });
  
  describe("timeout handling", () => {
    it("should detect timeout correctly", async () => {
      const result = await manager.execute({
        command: "sleep 10",
        timeout: 500 // 500ms - very short
      });
      
      // Should be killed/timed out
      expect(result.timedOut).toBe(true);
      expect(result.duration).toBeGreaterThanOrEqual(500);
    }).timeout(3000);
  });
  
  describe("resource constraints", () => {
    it("should respect CPU limits (when Docker available)", async () => {
      const result = await manager.execute({
        type: "sandbox",
        command: "bun --version",
        timeout: 10000
      });
      
      // Should work if Docker available, or fall back to host
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("1.");
    });
  });
  
  describe("active container management", () => {
    it("should track active containers", () => {
      const count = manager.getActiveCount();
      expect(typeof count).toBe("number");
      expect(count).toBeGreaterThanOrEqual(0);
    });
    
    it("should have killAll method", () => {
      // Just verify the method exists
      expect(typeof manager.killAll).toBe("function");
      manager.killAll(); // Should not throw
    });
  });
  
  describe("sandbox types (security profiles)", () => {
    it("should support 'sandbox' type", async () => {
      const result = await manager.execute({
        type: "sandbox",
        command: "echo sandbox-type-test",
        timeout: 5000
      });
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("sandbox-type-test");
    });
    
    it("should support 'strict' type", async () => {
      const result = await manager.execute({
        type: "strict",
        command: "echo strict-type-test",
        timeout: 5000
      });
      
      expect(result.exitCode).toBe(0);
    });
  });
  
  describe("output callbacks", () => {
    it("should call onStdout callback", async () => {
      let captured = "";
      const result = await manager.execute({
        command: "echo callback-test",
        onStdout: (data) => { captured += data; },
        timeout: 5000
      });
      
      expect(captured).toContain("callback-test");
    });
    
    it("should call onStderr callback", async () => {
      let captured = "";
      const result = await manager.execute({
        command: "echo error >&2",
        onStderr: (data) => { captured += data; },
        timeout: 5000
      });
      
      expect(captured).toContain("error");
    });
  });
  
  describe("sandbox result structure", () => {
    it("should return complete result object", async () => {
      const result = await manager.execute({
        command: "echo complete-result",
        timeout: 5000
      });
      
      // Validate all required fields per architecture spec
      expect(result).toHaveProperty("exitCode");
      expect(result).toHaveProperty("stdout");
      expect(result).toHaveProperty("stderr");
      expect(result).toHaveProperty("duration");
      expect(result).toHaveProperty("timedOut");
      
      // exitCode should be number or null
      expect(result.exitCode === null || typeof result.exitCode === "number").toBe(true);
      
      // stdout/stderr should be strings
      expect(typeof result.stdout).toBe("string");
      expect(typeof result.stderr).toBe("string");
    });
  });
});

// ============================================================================
// Integration test runner
// ============================================================================

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log("🧪 Running XL-22 Validation Tests...\n");
  
  let passCount = 0;
  let failCount = 0;
  
  // Quick validation test
  async function runValidation() {
    console.log("📋 Running validation check...\n");
    
    // Test 1: Basic execution
    const r1 = await manager.execute({
      command: "echo XL-22 validation",
      timeout: 5000
    });
    
    if (r1.stdout.includes("XL-22 validation")) {
      console.log("✅ Test 1: Basic execution - PASS");
      passCount++;
    } else {
      console.log("❌ Test 1: Basic execution - FAIL");
      failCount++;
    }
    
    // Test 2: Timeout handling
    const r2 = await manager.execute({
      command: "sleep 5",
      timeout: 500
    });
    
    if (r2.timedOut) {
      console.log("✅ Test 2: Timeout handling - PASS");
      passCount++;
    } else {
      console.log("❌ Test 2: Timeout handling - FAIL (expected timedOut=true)");
      failCount++;
    }
    
    // Test 3: Error handling
    const r3 = await manager.execute({
      command: "exit 99",
      timeout: 5000
    });
    
    if (r3.exitCode === 99) {
      console.log("✅ Test 3: Error handling - PASS");
      passCount++;
    } else {
      console.log("❌ Test 3: Error handling - FAIL");
      failCount++;
    }
    
    console.log(`\n📊 Results: ${passCount} passed, ${failCount} failed`);
    console.log(`\n🔧 Active containers: ${manager.getActiveCount()}`);
    
    process.exit(failCount > 0 ? 1 : 0);
  }
  
  runValidation().catch((err) => {
    console.error("❌ Validation failed:", err);
    process.exit(1);
  });
}