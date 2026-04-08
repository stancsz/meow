/**
 * onboarding.test.ts — Tests for First-Run Onboarding
 *
 * Run with: bun test tests/onboarding.test.ts
 */
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// Use a test-specific .meow directory
const TEST_MEOW_DIR = join(homedir(), ".meow_onboarding_test");
const TEST_SESSIONS_DIR = join(TEST_MEOW_DIR, "sessions");
const TEST_CONFIG_FILE = join(TEST_MEOW_DIR, "config.json");

// Override paths for testing
const originalHomedir = homedir;

// We need to test the onboarding module directly with the test paths
describe("Onboarding Module", () => {
  beforeEach(() => {
    // Setup test directory
    if (!existsSync(TEST_MEOW_DIR)) {
      mkdirSync(TEST_MEOW_DIR, { recursive: true });
    }
    if (!existsSync(TEST_SESSIONS_DIR)) {
      mkdirSync(TEST_SESSIONS_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    // Cleanup test directory
    try {
      if (existsSync(TEST_CONFIG_FILE)) {
        unlinkSync(TEST_CONFIG_FILE);
      }
      if (existsSync(TEST_SESSIONS_DIR)) {
        const files = require("node:fs").readdirSync(TEST_SESSIONS_DIR);
        for (const file of files) {
          unlinkSync(join(TEST_SESSIONS_DIR, file));
        }
        require("node:fs").rmdirSync(TEST_SESSIONS_DIR);
      }
      if (existsSync(TEST_MEOW_DIR)) {
        require("node:fs").rmdirSync(TEST_MEOW_DIR);
      }
    } catch {
      // ignore cleanup errors
    }
  });

  test("first run detection works", async () => {
    const { checkOnboarding } = await import("../src/sidecars/onboarding.ts");

    // On a clean test dir with no sessions, should be first run
    const result = checkOnboarding();
    expect(result.isFirstRun).toBe(true);
  });

  test("tutorial steps are defined correctly", async () => {
    const { getTutorialSteps, formatTutorialStep } = await import("../src/sidecars/onboarding.ts");

    const steps = getTutorialSteps();
    expect(steps.length).toBeGreaterThan(0);
    expect(steps[0]).toHaveProperty("title");
    expect(steps[0]).toHaveProperty("instruction");
    expect(steps[0]).toHaveProperty("example");
    expect(steps[0]).toHaveProperty("tip");

    // Check formatting works
    const formatted = formatTutorialStep(steps[0], 0, steps.length);
    expect(typeof formatted).toBe("string");
    expect(formatted.length).toBeGreaterThan(0);
  });

  test("markOnboardingSeen updates config", async () => {
    const { checkOnboarding, markOnboardingSeen } = await import("../src/sidecars/onboarding.ts");

    // Initially should be first run
    let result = checkOnboarding();
    expect(result.isFirstRun).toBe(true);

    // Mark as seen
    markOnboardingSeen();

    // Now should not be first run
    result = checkOnboarding();
    expect(result.isFirstRun).toBe(false);
  });

  test("markTutorialCompleted updates config", async () => {
    const { isTutorialCompleted, markTutorialCompleted, resetOnboarding } = await import("../src/sidecars/onboarding.ts");

    // Initially not completed
    expect(isTutorialCompleted()).toBe(false);

    // Mark as completed
    markTutorialCompleted();
    expect(isTutorialCompleted()).toBe(true);

    // Reset for other tests
    resetOnboarding();
  });

  test("resetOnboarding clears state", async () => {
    const { checkOnboarding, markOnboardingSeen, markTutorialCompleted, resetOnboarding } = await import("../src/sidecars/onboarding.ts");

    // Set up state
    markOnboardingSeen();
    markTutorialCompleted();

    // Reset
    resetOnboarding();

    // Check state is cleared
    const result = checkOnboarding();
    expect(result.isFirstRun).toBe(true);
    expect(isTutorialCompleted()).toBe(false);
  });

  test("welcome message contains key elements", async () => {
    const { getWelcomeMessage } = await import("../src/sidecars/onboarding.ts");

    const welcome = getWelcomeMessage();
    expect(welcome).toContain("Meow");
    expect(welcome).toContain("Welcome");
    expect(welcome).toContain("/help");
    expect(welcome).toContain("/tutorial");
    expect(welcome).toContain("Quick Start");
  });

  test("tutorial mode defaults to false", async () => {
    const { checkOnboarding } = await import("../src/sidecars/onboarding.ts");

    const result = checkOnboarding();
    expect(result.tutorialMode).toBe(false);
  });
});

describe("Tutorial Skill", () => {
  test("tutorial skill is registered", async () => {
    const { findSkill } = await import("../src/skills/index.ts");

    const skill = findSkill("tutorial");
    expect(skill).toBeDefined();
    expect(skill?.name).toBe("tutorial");
  });

  test("tutorial skill has description", async () => {
    const { findSkill } = await import("../src/skills/index.ts");

    const skill = findSkill("tutorial");
    expect(skill?.description).toBeTruthy();
  });
});
