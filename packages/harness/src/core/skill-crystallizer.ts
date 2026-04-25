/**
 * Epoch 24: Skill Crystallizer
 * 
 * Converts successful task completions into reusable Skills (SOPs).
 * Saves skills to the skill tree and provides FTS5 search capability.
 * 
 * @see evolve/epoch/24/plan_architecture.md
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";

// ============================================================================
// Type Definitions
// ============================================================================

export interface StepDefinition {
  order: number;
  action: string;
  tool?: string;
  parameters?: Record<string, unknown>;
  rationale?: string;
}

export interface VerificationDefinition {
  command?: string;
  expectedPattern?: string;
}

export interface SkillTrigger {
  keywords: string[];
  description: string;
}

export interface SkillContext {
  requirements: string[];
  prerequisites: string[];
}

export interface SkillSOP {
  name: string;
  version: number;
  createdAt: string;
  trigger: SkillTrigger;
  context: SkillContext;
  steps: StepDefinition[];
  verification: VerificationDefinition;
  usageCount: number;
  successRate: number;
}

export interface SkillSearchResult {
  skill: SkillSOP;
  relevance: number;
  matchedOn: string[];
}

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_SKILL_TREE_PATH = ".claude/skills/skill-tree/memory";

function getSkillTreePath(customPath?: string): string {
  return customPath || join(process.cwd(), DEFAULT_SKILL_TREE_PATH);
}

function ensureSkillTreeDirectory(path: string): void {
  mkdirSync(path, { recursive: true });
}

// ============================================================================
// Keyword Extraction
// ============================================================================

/**
 * Extract meaningful keywords from task description
 */
function extractKeywords(description: string): string[] {
  // Normalize and split into words
  const words = description
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2);
  
  // Remove common stop words
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
    'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'this', 'that',
    'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what',
    'which', 'who', 'when', 'where', 'why', 'how', 'all', 'each', 'every',
    'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'not',
    'only', 'same', 'so', 'than', 'too', 'very', 'just', 'also', 'now',
    'please', 'thanks', 'thank', 'help', 'me', 'my', 'using', 'used', 'use',
    'create', 'created', 'making', 'made', 'build', 'building', 'built'
  ]);
  
  const keywords = words.filter(w => !stopWords.has(w) && !/^\d+$/.test(w));
  
  // Deduplicate and limit to top 10
  return [...new Set(keywords)].slice(0, 10);
}

/**
 * Generate a skill name from keywords
 */
function generateSkillName(keywords: string[]): string {
  if (keywords.length === 0) {
    return `skill-${Date.now()}`;
  }
  
  // Take first 3 keywords and join with underscores
  const nameParts = keywords.slice(0, 3);
  return nameParts.join('_').replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_');
}

/**
 * Infer the required context from tool calls
 */
function inferRequirements(toolCalls: { name: string; arguments: Record<string, unknown> }[]): string[] {
  const requirements: string[] = [];
  
  for (const tc of toolCalls) {
    // Detect OS requirements
    if (tc.name === 'shell' || tc.name === 'exec') {
      const cmd = String(tc.arguments.command || '');
      if (cmd.includes('/proc/') || cmd.includes('ps aux') || cmd.includes('free -m')) {
        requirements.push('Linux');
      }
      if (cmd.includes('Get-Process') || cmd.includes('dir C:\\')) {
        requirements.push('Windows');
      }
      if (cmd.includes('top') || cmd.includes('launchd')) {
        requirements.push('macOS');
      }
    }
    
    // Detect filesystem requirements
    if (tc.name === 'read' || tc.name === 'write') {
      const path = String(tc.arguments.path || '');
      if (path.includes('.claude/')) {
        requirements.push('Claude config directory');
      }
      if (path.includes('.git/')) {
        requirements.push('Git repository');
      }
    }
    
    // Detect tool requirements
    if (!requirements.some(r => r.includes(tc.name))) {
      requirements.push(tc.name);
    }
  }
  
  return [...new Set(requirements)];
}

/**
 * Infer verification command from tool calls
 */
function inferVerificationCommand(toolCalls: { name: string; arguments: Record<string, unknown> }[]): string | undefined {
  // Look for test or verification tool calls
  for (const tc of toolCalls) {
    if (tc.name === 'shell' || tc.name === 'exec') {
      const cmd = String(tc.arguments.command || '');
      if (cmd.includes('test') || cmd.includes('verify') || cmd.includes('check')) {
        return cmd;
      }
    }
  }
  
  // Default to running the last tool call as verification
  const lastShell = [...toolCalls].reverse().find(tc => tc.name === 'shell' || tc.name === 'exec');
  if (lastShell) {
    return String(lastShell.arguments.command || '');
  }
  
  return undefined;
}

/**
 * Infer expected pattern from tool results
 */
function inferExpectedPattern(toolCalls: { name: string; arguments: Record<string, unknown> }[]): string | undefined {
  // Look for expected patterns in tool call arguments
  for (const tc of toolCalls) {
    const args = tc.arguments;
    if (args.expectedPattern || args.pattern || args.match) {
      return String(args.expectedPattern || args.pattern || args.match);
    }
  }
  
  return undefined;
}

/**
 * Infer a rationale for a tool call
 */
function inferRationale(toolCall: { name: string; arguments: Record<string, unknown> }): string | undefined {
  // Build a simple rationale from the tool name
  const name = toolCall.name;
  
  if (name === 'shell' || name === 'exec') {
    return `Execute command: ${toolCall.arguments.command || '(command)'}`;
  }
  if (name === 'read') {
    return `Read file: ${toolCall.arguments.path || '(path)'}`;
  }
  if (name === 'write') {
    return `Write to file: ${toolCall.arguments.path || '(path)'}`;
  }
  if (name === 'edit') {
    return `Edit file: ${toolCall.arguments.path || '(path)'}`;
  }
  if (name === 'git') {
    return `Git operation: ${toolCall.arguments.cmd || '(command)'}`;
  }
  
  return `Execute ${name}`;
}

// ============================================================================
// Skill Crystallization
// ============================================================================

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result?: string;
  duration?: number;
}

export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: string;
}

export interface HookContext {
  task: {
    id: string;
    description: string;
    success: boolean;
  };
  toolCalls: ToolCall[];
  messages: Message[];
  startTime: number;
  endTime: number;
  metadata?: Record<string, unknown>;
}

/**
 * Crystallize a skill from a successful task execution context
 */
export async function crystallizeSkill(
  taskOrContext: string | HookContext,
  toolCalls?: ToolCall[],
  skillTreeDir?: string
): Promise<SkillSOP> {
  // Support both API signatures:
  // 1. crystallizeSkill(taskDescription: string, toolCalls: ToolCall[], skillTreeDir?: string)
  // 2. crystallizeSkill(context: HookContext)
  let task: { description: string; success: boolean };
  let actualToolCalls: ToolCall[];
  
  if (typeof taskOrContext === 'string') {
    // Signature 1: (taskDescription, toolCalls, skillTreeDir)
    task = { description: taskOrContext, success: true };
    actualToolCalls = toolCalls || [];
  } else {
    // Signature 2: (context: HookContext)
    task = taskOrContext.task;
    actualToolCalls = taskOrContext.toolCalls;
  }
  
  const { task, toolCalls } = context;
  
  // Extract keywords from task description
  const keywords = extractKeywords(task.description);
  
  // Identify required tools
  const requiredTools = [...new Set(toolCalls.map(t => t.name))];
  
  // Group tool calls into ordered steps
  const steps: StepDefinition[] = toolCalls.map((tc, index) => ({
    order: index + 1,
    action: `${tc.name}(${JSON.stringify(tc.arguments)})`,
    tool: tc.name,
    parameters: tc.arguments,
    rationale: inferRationale(tc)
  }));
  
  // Generate verification from tool calls
  const verification: VerificationDefinition = {
    command: inferVerificationCommand(toolCalls),
    expectedPattern: inferExpectedPattern(toolCalls)
  };
  
  // Generate skill name
  const name = generateSkillName(keywords);
  
  return {
    name,
    version: 1,
    createdAt: new Date().toISOString(),
    trigger: {
      keywords,
      description: task.description
    },
    context: {
      requirements: inferRequirements(toolCalls),
      prerequisites: []
    },
    steps,
    verification,
    usageCount: 0,
    successRate: 1.0
  };
}

// ============================================================================
// Skill Storage (Simple JSON-based for MVP)
// ============================================================================

const SKILL_EXTENSION = ".md";

function getSkillFilePath(name: string, version: number, skillTreePath: string): string {
  return join(skillTreePath, `${name}-v${version}${SKILL_EXTENSION}`);
}

/**
 * Save a skill to the skill tree
 */
export function saveSkill(skill: SkillSOP, customPath?: string): boolean {
  try {
    const skillTreePath = getSkillTreePath(customPath);
    ensureSkillTreeDirectory(skillTreePath);
    
    const filePath = getSkillFilePath(skill.name, skill.version, skillTreePath);
    
    // Check if skill already exists (version conflict)
    if (existsSync(filePath)) {
      console.warn(`Skill ${skill.name} v${skill.version} already exists, incrementing version`);
      skill.version += 1;
      return saveSkill(skill, customPath); // Retry with new version
    }
    
    // Write skill as YAML-like markdown
    const content = `---
name: ${skill.name}
version: ${skill.version}
createdAt: ${skill.createdAt}
trigger:
  keywords: [${skill.trigger.keywords.join(', ')}]
  description: ${skill.trigger.description}
context:
  requirements: [${skill.context.requirements.join(', ')}]
  prerequisites: [${skill.context.prerequisites.join(', ')}]
steps:
${skill.steps.map(s => `  - order: ${s.order}
    action: ${s.action}
    tool: ${s.tool || ''}
    parameters: ${JSON.stringify(s.parameters)}
    rationale: ${s.rationale || ''}`).join('\n')}
verification:
  command: ${skill.verification.command || ''}
  expectedPattern: ${skill.verification.expectedPattern || ''}
usageCount: ${skill.usageCount}
successRate: ${skill.successRate}
---

# Skill: ${skill.name}

## Trigger
Keywords: ${skill.trigger.keywords.join(', ')}
Description: ${skill.trigger.description}

## Context
Requirements: ${skill.context.requirements.join(', ')}
Prerequisites: ${skill.context.prerequisites.join(', ')}

## Steps
${skill.steps.map(s => `${s.order}. ${s.action}`).join('\n')}

## Verification
${skill.verification.command ? `Command: \`${skill.verification.command}\`` : 'No verification specified'}
${skill.verification.expectedPattern ? `Expected: \`${skill.verification.expectedPattern}\`` : ''}
`;
    
    writeFileSync(filePath, content, 'utf-8');
    return true;
  } catch (error) {
    console.error('Failed to save skill:', error);
    return false;
  }
}

/**
 * Load a skill from the skill tree
 */
export function loadSkill(name: string, version: number | undefined, customPath?: string): SkillSOP | null {
  try {
    const skillTreePath = getSkillTreePath(customPath);
    
    // Try specific version or find latest
    if (version !== undefined) {
      const filePath = getSkillFilePath(name, version, skillTreePath);
      if (existsSync(filePath)) {
        return parseSkillFile(filePath);
      }
      return null;
    }
    
    // Find all versions and return latest
    const files = readdirSync(skillTreePath).filter(f => f.startsWith(`${name}-v`));
    if (files.length === 0) return null;
    
    files.sort();
    const latestFile = join(skillTreePath, files[files.length - 1]);
    return parseSkillFile(latestFile);
  } catch (error) {
    console.error('Failed to load skill:', error);
    return null;
  }
}

/**
 * Parse a skill markdown file back to SkillSOP
 */
function parseSkillFile(filePath: string): SkillSOP | null {
  try {
    const content = readFileSync(filePath, 'utf-8');
    
    // Simple front-matter parsing
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) return null;
    
    const fm = frontmatterMatch[1];
    
    const skill: SkillSOP = {
      name: extractFrontMatterValue(fm, 'name') || '',
      version: parseInt(extractFrontMatterValue(fm, 'version') || '1', 10),
      createdAt: extractFrontMatterValue(fm, 'createdAt') || new Date().toISOString(),
      trigger: {
        keywords: parseArray(extractFrontMatterValue(fm, 'trigger:') || ''),
        description: extractFrontMatterValue(fm, '  description:') || ''
      },
      context: {
        requirements: parseArray(extractFrontMatterValue(fm, 'context:') || ''),
        prerequisites: parseArray(extractFrontMatterValue(fm, '  prerequisites:') || '')
      },
      steps: [],
      verification: {
        command: extractFrontMatterValue(fm, '  command:') || undefined,
        expectedPattern: extractFrontMatterValue(fm, '  expectedPattern:') || undefined
      },
      usageCount: parseInt(extractFrontMatterValue(fm, 'usageCount:') || '0', 10),
      successRate: parseFloat(extractFrontMatterValue(fm, 'successRate:') || '1.0')
    };
    
    return skill;
  } catch {
    return null;
  }
}

function extractFrontMatterValue(fm: string, key: string): string | null {
  const lines = fm.split('\n');
  for (const line of lines) {
    if (line.startsWith(key)) {
      return line.substring(key.length).trim();
    }
  }
  return null;
}

function parseArray(value: string): string[] {
  if (!value) return [];
  return value.replace(/[\[\]]/g, '').split(',').map(s => s.trim()).filter(s => s);
}

/**
 * Search skills by keyword query
 */
export function searchSkills(query: string, customPath?: string): SkillSearchResult[] {
  try {
    const skillTreePath = getSkillTreePath(customPath);
    
    if (!existsSync(skillTreePath)) {
      return [];
    }
    
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);
    
    const files = readdirSync(skillTreePath).filter(f => f.endsWith(SKILL_EXTENSION));
    const results: SkillSearchResult[] = [];
    
    for (const file of files) {
      const filePath = join(skillTreePath, file);
      const skill = parseSkillFile(filePath);
      
      if (!skill) continue;
      
      const matchedOn: string[] = [];
      let relevance = 0;
      
      // Check name match
      if (skill.name.toLowerCase().includes(queryLower)) {
        relevance += 10;
        matchedOn.push('name');
      }
      
      // Check keyword matches
      for (const kw of skill.trigger.keywords) {
        if (kw.toLowerCase().includes(queryLower)) {
          relevance += 5;
          matchedOn.push(`keyword:${kw}`);
        }
      }
      
      // Check description
      if (skill.trigger.description.toLowerCase().includes(queryLower)) {
        relevance += 3;
        matchedOn.push('description');
      }
      
      // Check query word matches
      for (const qw of queryWords) {
        if (skill.trigger.description.toLowerCase().includes(qw)) {
          relevance += 2;
          matchedOn.push(`word:${qw}`);
        }
      }
      
      // Boost by success rate
      relevance += Math.round(skill.successRate * 2);
      
      // Boost by usage
      relevance += Math.min(skill.usageCount / 10, 2);
      
      if (relevance > 0) {
        results.push({ skill, relevance, matchedOn });
      }
    }
    
    // Sort by relevance
    results.sort((a, b) => b.relevance - a.relevance);
    
    return results;
  } catch (error) {
    console.error('Failed to search skills:', error);
    return [];
  }
}

/**
 * List all skills in the skill tree
 */
export function listSkills(customPath?: string): SkillSOP[] {
  try {
    const skillTreePath = getSkillTreePath(customPath);
    
    if (!existsSync(skillTreePath)) {
      return [];
    }
    
    const files = readdirSync(skillTreePath).filter(f => f.endsWith(SKILL_EXTENSION));
    const skills: SkillSOP[] = [];
    
    for (const file of files) {
      const filePath = join(skillTreePath, file);
      const skill = parseSkillFile(filePath);
      if (skill) {
        skills.push(skill);
      }
    }
    
    // Sort by creation date (newest first)
    skills.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    
    return skills;
  } catch {
    return [];
  }
}

/**
 * Update skill usage statistics
 */
export function updateSkillStats(
  name: string, 
  success: boolean, 
  customPath?: string
): boolean {
  try {
    const skill = loadSkill(name, undefined, customPath);
    if (!skill) return false;
    
    // Update stats
    const totalUsages = skill.usageCount + 1;
    const successfulUsages = skill.usageCount * skill.successRate + (success ? 1 : 0);
    skill.usageCount = totalUsages;
    skill.successRate = successfulUsages / totalUsages;
    
    return saveSkill(skill, customPath);
  } catch {
    return false;
  }
}