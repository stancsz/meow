import { describe, it, expect } from "vitest";
import { ExecutionMode, isQualityMode, isBlockingMode } from "../../src/orchestrator/ExecutionMode";

describe("ExecutionMode", () => {
  describe("enum values", () => {
    it("has all 4 required values: PARALLEL, SEQUENTIAL, AUDIT_ONLY, SHIP", () => {
      expect(ExecutionMode.PARALLEL).toBe("parallel");
      expect(ExecutionMode.SEQUENTIAL).toBe("sequential");
      expect(ExecutionMode.AUDIT_ONLY).toBe("audit_only");
      expect(ExecutionMode.SHIP).toBe("ship");
    });

    it("each mode is a distinct string value", () => {
      const modes = [
        ExecutionMode.PARALLEL,
        ExecutionMode.SEQUENTIAL,
        ExecutionMode.AUDIT_ONLY,
        ExecutionMode.SHIP,
      ];
      const uniqueValues = new Set(modes);
      expect(uniqueValues.size).toBe(4);
    });
  });

  describe("isQualityMode", () => {
    it("returns true for SEQUENTIAL mode", () => {
      expect(isQualityMode(ExecutionMode.SEQUENTIAL)).toBe(true);
    });

    it("returns true for SHIP mode", () => {
      expect(isQualityMode(ExecutionMode.SHIP)).toBe(true);
    });

    it("returns false for PARALLEL mode", () => {
      expect(isQualityMode(ExecutionMode.PARALLEL)).toBe(false);
    });

    it("returns false for AUDIT_ONLY mode", () => {
      expect(isQualityMode(ExecutionMode.AUDIT_ONLY)).toBe(false);
    });
  });

  describe("isBlockingMode", () => {
    it("returns false for PARALLEL mode", () => {
      expect(isBlockingMode(ExecutionMode.PARALLEL)).toBe(false);
    });

    it("returns false for AUDIT_ONLY mode", () => {
      expect(isBlockingMode(ExecutionMode.AUDIT_ONLY)).toBe(false);
    });

    it("returns true for SEQUENTIAL mode", () => {
      expect(isBlockingMode(ExecutionMode.SEQUENTIAL)).toBe(true);
    });

    it("returns true for SHIP mode", () => {
      expect(isBlockingMode(ExecutionMode.SHIP)).toBe(true);
    });
  });
});