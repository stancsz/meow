/**
 * workspace-trust.ts
 *
 * Workspace trust sidecar. Prompts user when running in untrusted directories.
 * Trust config is stored in ~/.meow/trusted.json
 *
 * Interface:
 * {
 *   check(path: string): boolean,
 *   trust(path: string): void,
 *   distrust(path: string): void,
 *   isPromptNeeded(): boolean,
 *   getUntrustedReason(): string | null
 * }
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

export interface WorkspaceTrustConfig {
  trustedPaths: string[];
  untrustedPatterns: string[];
}

interface TrustContext {
  currentPath: string;
  lastPromptPath: string | null;
  lastPromptTime: number | null;
}

// Load trust config from ~/.meow/trusted.json
function loadTrustConfig(): WorkspaceTrustConfig {
  const configPath = join(homedir(), ".meow", "trusted.json");
  if (!existsSync(configPath)) {
    return { trustedPaths: [], untrustedPatterns: [] };
  }
  try {
    const content = readFileSync(configPath, "utf-8");
    return JSON.parse(content);
  } catch {
    return { trustedPaths: [], untrustedPatterns: [] };
  }
}

// Save trust config to ~/.meow/trusted.json
function saveTrustConfig(config: WorkspaceTrustConfig): void {
  const configPath = join(homedir(), ".meow", "trusted.json");
  try {
    const dir = dirname(configPath);
    if (!existsSync(dir)) {
      // Could create dir here but trust filesystem to exist
    }
    writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
  } catch {
    // Silently fail if can't write config
  }
}

// Check if a path is trusted
function normalizePath(p: string): string {
  return p.replace(/\\/g, "/").replace(/\/$/, "").toLowerCase();
}

function isPathTrusted(path: string, config: WorkspaceTrustConfig): boolean {
  const normalizedInput = normalizePath(path);

  // Check exact matches
  for (const trusted of config.trustedPaths) {
    if (normalizePath(trusted) === normalizedInput) {
      return true;
    }
  }

  // Check if path is a subdirectory of a trusted path
  for (const trusted of config.trustedPaths) {
    const normalizedTrusted = normalizePath(trusted);
    if (normalizedInput.startsWith(normalizedTrusted + "/")) {
      return true;
    }
  }

  // Check untrusted patterns (gitignored dirs, etc)
  for (const pattern of config.untrustedPatterns) {
    if (normalizedInput.includes(pattern.toLowerCase())) {
      return false;
    }
  }

  // Default: not trusted
  return false;
}

// Find common untrusted path indicators
const UNTRUSTED_INDICATORS = [
  "/node_modules/",
  "/.git/",
  "/tmp/",
  "/downloads/",
  "/desktop/",
  "/documents/",
];

function checkUntrustedIndicators(path: string): string | null {
  const normalized = normalizePath(path);
  for (const indicator of UNTRUSTED_INDICATORS) {
    if (normalized.includes(indicator)) {
      return `Directory may be untrusted: contains ${indicator}`;
    }
  }
  return null;
}

// Trust state for current session
let trustContext: TrustContext = {
  currentPath: "",
  lastPromptPath: null,
  lastPromptTime: null,
};

const PROMPT_COOLDOWN_MS = 60000; // Don't re-prompt within 1 minute

export function initWorkspaceTrust(cwd: string): void {
  trustContext = {
    currentPath: cwd,
    lastPromptPath: null,
    lastPromptTime: null,
  };
}

export function checkWorkspaceTrust(path?: string): {
  trusted: boolean;
  reason?: string;
} {
  const checkPath = path || trustContext.currentPath;
  const config = loadTrustConfig();

  if (isPathTrusted(checkPath, config)) {
    return { trusted: true };
  }

  // Check for untrusted indicators
  const indicatorReason = checkUntrustedIndicators(checkPath);
  if (indicatorReason) {
    return { trusted: false, reason: indicatorReason };
  }

  return {
    trusted: false,
    reason: `Directory is not in trusted list: ${checkPath}`,
  };
}

export function trustWorkspace(path?: string): void {
  const trustPath = path || trustContext.currentPath;
  const config = loadTrustConfig();

  if (!config.trustedPaths.includes(trustPath)) {
    config.trustedPaths.push(trustPath);
    saveTrustConfig(config);
  }
}

export function distrustWorkspace(path?: string): void {
  const distrustPath = path || trustContext.currentPath;
  const config = loadTrustConfig();

  config.trustedPaths = config.trustedPaths.filter(
    (p) => normalizePath(p) !== normalizePath(distrustPath)
  );
  saveTrustConfig(config);
}

export function isPromptNeeded(): boolean {
  // Check cooldown
  if (
    trustContext.lastPromptPath === trustContext.currentPath &&
    trustContext.lastPromptTime &&
    Date.now() - trustContext.lastPromptTime < PROMPT_COOLDOWN_MS
  ) {
    return false;
  }
  return true;
}

export function recordPromptShown(): void {
  trustContext.lastPromptPath = trustContext.currentPath;
  trustContext.lastPromptTime = Date.now();
}

export function getWorkspaceTrustStatus(): {
  currentPath: string;
  trusted: boolean;
  reason?: string;
} {
  const result = checkWorkspaceTrust();
  return {
    currentPath: trustContext.currentPath,
    trusted: result.trusted,
    reason: result.reason,
  };
}
