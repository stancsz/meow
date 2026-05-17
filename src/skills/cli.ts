// meow-swarm Skill Marketplace CLI
// Priority 3: Skills discovery, install, publish
// Run: npx meow skills find <topic> | install <name> | publish [--private] | list

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, rmSync } from "fs";
import { resolve, join, basename } from "path";
import { execSync } from "child_process";
import pc from "picocolors";

// ── Paths ────────────────────────────────────────────────────────────────────

const SKILLS_DIR = resolve(process.env.HOME || "~", ".meow", "skills");
const MARKETPLACE_URL = "https://skills.nousresearch.com";
const SKILLS_INDEX_URL = `${MARKETPLACE_URL}/api/v1/skills`;
const SKILLS_REGISTRY_URL = `${MARKETPLACE_URL}/api/v1/registry`;

// ── Skill manifest ───────────────────────────────────────────────────────────

export interface SkillManifest {
  name: string;
  version: string;
  description: string;
  category?: string;
  tags: string[];
  author?: string;
  installPath?: string;    // where it lives locally
  upstream?: string;      // URL of SKILL.md source
  dependencies?: string[];
  minMeowVersion?: string;
}

export interface MarketplaceSkill extends SkillManifest {
  downloads: number;
  rating: number;
  readme?: string;
}

// ── Registry helpers ─────────────────────────────────────────────────────────

function getInstalledSkills(): SkillManifest[] {
  if (!existsSync(SKILLS_DIR)) return [];
  const skills: SkillManifest[] = [];

  try {
    for (const dir of readdirSync(SKILLS_DIR)) {
      const skillPath = join(SKILLS_DIR, dir, "SKILL.md");
      if (!existsSync(skillPath)) continue;
      const content = readFileSync(skillPath, "utf-8");
      const front = parseFrontmatter(content);
      skills.push({
        name: front.name || dir,
        version: front.version || "0.0.0",
        description: front.description || "",
        category: front.category,
        tags: parseTags(front.tags),
        author: front.author,
        installPath: join(SKILLS_DIR, dir),
        upstream: front.upstream,
        dependencies: parseArray(front.dependencies),
        minMeowVersion: front.minMeowVersion,
      });
    }
  } catch {}

  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) return {};
  const result: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const [k, ...v] = line.split(":");
    if (k && v.length) result[k.trim()] = v.join(":").trim();
  }
  return result;
}

function parseTags(tags: string | undefined): string[] {
  if (!tags) return [];
  if (tags.startsWith("[")) {
    try {
      return JSON.parse(tags) as string[];
    } catch {}
  }
  return tags.split(",").map(t => t.trim()).filter(Boolean);
}

function parseArray(val: string | undefined): string[] {
  if (!val) return [];
  if (val.startsWith("[")) {
    try { return JSON.parse(val) as string[]; } catch {}
  }
  return val.split(",").map(t => t.trim()).filter(Boolean);
}

// ── Discovery ────────────────────────────────────────────────────────────────

async function discoverSkills(query: string): Promise<MarketplaceSkill[]> {
  // First search local skills
  const installed = getInstalledSkills();

  // Try marketplace API if available
  try {
    const url = `${SKILLS_INDEX_URL}?q=${encodeURIComponent(query)}&limit=20`;
    const res = await fetch(url, {
      headers: { "Accept": "application/json", "User-Agent": "meow-swarm/0.2" },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = await res.json() as { skills?: MarketplaceSkill[] };
      return data.skills || [];
    }
  } catch {
    // Marketplace not available — fall back to local
  }

  // Fallback: search local skills by tag/name
  const q = query.toLowerCase();
  return installed
    .filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.tags.some(t => t.toLowerCase().includes(q))
    )
    .map(s => ({ ...s, downloads: 0, rating: 0 }));
}

// ── Install ──────────────────────────────────────────────────────────────────

async function installSkill(name: string, options: { version?: string; force?: boolean } = {}): Promise<void> {
  mkdirSync(SKILLS_DIR, { recursive: true });

  const targetDir = join(SKILLS_DIR, name);
  const skillPath = join(targetDir, "SKILL.md");

  // Check if already installed
  if (existsSync(skillPath) && !options.force) {
    console.log(pc.yellow(`⚠ ${name} is already installed at ${targetDir}`));
    console.log(`  Run: meow skills install ${name} --force  to overwrite`);
    return;
  }

  console.log(pc.cyan(`↓ Installing ${name}...`));

  // Try marketplace URL first
  const skillUrl = `${MARKETPLACE_URL}/skills/${name}/SKILL.md`;
  try {
    const res = await fetch(skillUrl, { signal: AbortSignal.timeout(10000) });
    if (res.ok) {
      const content = await res.text();
      mkdirSync(targetDir, { recursive: true });
      writeFileSync(skillPath, content);
      console.log(pc.green(`✓ ${name} installed → ${skillPath}`));
      return;
    }
  } catch {}

  // Try GitHub raw URL format
  const githubUrls = [
    `https://raw.githubusercontent.com/stancsz/meow/main/.meow/skills/${name}/SKILL.md`,
    `https://raw.githubusercontent.com/nousresearch/meow-skills/main/${name}/SKILL.md`,
  ];

  for (const url of githubUrls) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const content = await res.text();
        mkdirSync(targetDir, { recursive: true });
        writeFileSync(skillPath, content);
        console.log(pc.green(`✓ ${name} installed from GitHub → ${skillPath}`));
        return;
      }
    } catch {}
  }

  console.log(pc.red(`✗ Could not find ${name} in marketplace or GitHub`));
  console.log(`  Available skills: meow skills find ${name}`);
}

// ── Publish ──────────────────────────────────────────────────────────────────

async function publishSkill(options: { private?: boolean; tags?: string } = {}): Promise<void> {
  const cwd = process.cwd();

  // Find SKILL.md in current directory
  const skillPath = join(cwd, "SKILL.md");
  if (!existsSync(skillPath)) {
    console.log(pc.red("✗ No SKILL.md found in current directory"));
    console.log("  Run this command from within a skill directory to publish it.");
    return;
  }

  const content = readFileSync(skillPath, "utf-8");
  const front = parseFrontmatter(content);
  const name = front.name || basename(cwd);
  const version = front.version || "0.1.0";

  if (!name || name === basename(cwd)) {
    console.log(pc.red("✗ SKILL.md must have a `name:` field in frontmatter"));
    return;
  }

  console.log(pc.cyan(`↑ Publishing ${name}@${version}...`));

  if (options.private) {
    // Write to local registry only (no upstream)
    const localRegistry = join(SKILLS_DIR, "registry.json");
    const registry: Record<string, SkillManifest> = existsSync(localRegistry)
      ? JSON.parse(readFileSync(localRegistry, "utf-8"))
      : {};
    registry[name] = {
      name,
      version,
      description: front.description || "",
      category: front.category,
      tags: parseTags(front.tags),
      author: front.author || process.env.USER || "unknown",
      installPath: cwd,
      upstream: `file://${cwd}`,
    };
    writeFileSync(localRegistry, JSON.stringify(registry, null, 2));
    console.log(pc.green(`✓ Published to local registry`));
    return;
  }

  // Publish to marketplace API
  try {
    const res = await fetch(SKILLS_REGISTRY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "meow-swarm/0.2" },
      body: JSON.stringify({ name, version, content, tags: parseTags(front.tags) }),
      signal: AbortSignal.timeout(10000),
    });

    if (res.ok) {
      console.log(pc.green(`✓ ${name} published to marketplace`));
    } else {
      console.log(pc.yellow(`⚠ Marketplace unavailable — saved to local registry`));
      await publishSkill({ private: true });
    }
  } catch {
    console.log(pc.yellow(`⚠ Could not reach marketplace — saved to local registry`));
    await publishSkill({ private: true });
  }
}

// ── List ─────────────────────────────────────────────────────────────────────

function listSkills(options: { category?: string; tag?: string } = {}): void {
  const skills = getInstalledSkills();

  if (skills.length === 0) {
    console.log(pc.dim("No skills installed. Run: meow skills find <topic>"));
    return;
  }

  const filtered = skills.filter(s => {
    if (options.category && s.category !== options.category) return false;
    if (options.tag && !s.tags.includes(options.tag)) return false;
    return true;
  });

  console.log(pc.bold(`\n  Installed skills (${filtered.length})\n`));
  for (const skill of filtered) {
    const cat = skill.category ? pc.dim(`[${skill.category}] `) : "";
    console.log(`  ${pc.green("•")} ${pc.bold(skill.name)} ${pc.dim(`v${skill.version}`)}`);
    if (skill.description) console.log(`    ${pc.dim(skill.description)}`);
    if (skill.tags.length) console.log(`    ${pc.dim(skill.tags.join(" · "))}`);
    console.log();
  }
}

// ── Remove ───────────────────────────────────────────────────────────────────

function removeSkill(name: string): void {
  const targetDir = join(SKILLS_DIR, name);
  const skillPath = join(targetDir, "SKILL.md");

  if (!existsSync(skillPath)) {
    console.log(pc.red(`✗ ${name} is not installed`));
    return;
  }

  try {
    rmSync(targetDir, { recursive: true });
    console.log(pc.green(`✓ Removed ${name}`));
  } catch (e: any) {
    console.log(pc.red(`✗ Failed to remove: ${e.message}`));
  }
}

// ── CLI Dispatch ─────────────────────────────────────────────────────────────

export function runSkillsCLI(args: string[]): void {
  const [cmd, ...rest] = args;

  switch (cmd) {
    case "find":
    case "search": {
      const query = rest.join(" ");
      if (!query) {
        console.log("Usage: meow skills find <topic>");
        return;
      }
      console.log(pc.cyan(`🔍 Searching skills for "${query}"...`));
      discoverSkills(query).then(skills => {
        if (skills.length === 0) {
          console.log(pc.dim(`No skills found for "${query}"`));
          return;
        }
        console.log(pc.bold(`\n  Found ${skills.length} skill(s)\n`));
        for (const s of skills) {
          const badge = s.installPath ? pc.green("[installed]") : pc.dim("[marketplace]");
          console.log(`  ${badge} ${pc.bold(s.name)} v${s.version}`);
          console.log(`    ${pc.dim(s.description || "")}`);
          if (s.tags.length) console.log(`    tags: ${s.tags.join(", ")}`);
          console.log();
        }
        if (!skills[0].installPath) {
          console.log(`  Run: meow skills install <name>`);
        }
      }).catch(e => console.error(pc.red(`Search failed: ${e.message}`)));
      return;
    }

    case "install": {
      const name = rest[0];
      const force = rest.includes("--force");
      if (!name) {
        console.log("Usage: meow skills install <name> [--force]");
        return;
      }
      installSkill(name, { force }).catch(e => console.error(pc.red(`Install failed: ${e.message}`)));
      return;
    }

    case "publish": {
      const isPrivate = rest.includes("--private");
      publishSkill({ private: isPrivate }).catch(e => console.error(pc.red(`Publish failed: ${e.message}`)));
      return;
    }

    case "list":
    case "ls": {
      const cat = rest.includes("--category") ? rest[rest.indexOf("--category") + 1] : undefined;
      const tag = rest.includes("--tag") ? rest[rest.indexOf("--tag") + 1] : undefined;
      listSkills({ category: cat, tag });
      return;
    }

    case "remove":
    case "rm": {
      const name = rest[0];
      if (!name) {
        console.log("Usage: meow skills remove <name>");
        return;
      }
      removeSkill(name);
      return;
    }

    default:
      console.log(pc.bold("\n  meow skills — Skill marketplace CLI\n"));
      console.log("  Usage: meow skills <command> [args]\n");
      console.log("  Commands:");
      console.log("    find <topic>         Search marketplace for skills");
      console.log("    install <name>       Install a skill locally");
      console.log("    publish [--private]  Publish skill to marketplace");
      console.log("    list [--category X] List installed skills");
      console.log("    remove <name>        Uninstall a skill");
      console.log("\n  Examples:");
      console.log(`    meow skills find "debugging"`);
      console.log(`    meow skills install claude-code`);
      console.log(`    meow skills publish --private`);
      console.log(`    meow skills list --category devops\n`);
  }
}