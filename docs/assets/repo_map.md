## REPOSITORY MAP (Signatures only)

│ src/index.ts:
│   function isBun(): boolean
│   async function main()
│   const kernel = new MeowKernel(db);
│   const agent = new Agent({
│   const { MeowTUI } = await import("./cli/tui");
│   const command = process.argv.filter(arg => !arg.startsWith("--")).slice(2).join(" ");
│   const response = await agent.chat(command, false, undefined, (status) =>
│   const repl = createRepl(agent);
│
│ src/agent/agent.ts:
│   export interface AgentConfig
│   export interface EditBlock
│   export class Agent
│   async chat( userInput: string, runTests: boolean = false, testCmd?: string, onStatus?: (status: string) => void ): Promise<string>
│   private stripReasoningContent(text: string): string
│   addFile(path: string)
│   dropFile(path: string)
│   getFiles(): string[]
│   public async callLLM(systemPrompt: string, messages: Message[]): Promise<string>
│   private getBasePrompt(): string
│   public async buildSystemPrompt(): Promise<string>
│   private mockEmbedding(text: string): number[]
│   private parseEdits(response: string): EditBlock[]
│   private collectUntilMarker(lines: string[], startIdx: number, endPattern: RegExp): { text: string; endIndex: number } | null
│   private async applyEdits(edits: EditBlock[]): Promise<void>
│   private replaceExact(content: string, original: string, updated: string): string | null
│   private replaceWithWhitespace(content: string, original: string, updated: string): string | null
│   private applyDmpPatch(content: string, original: string, updated: string): string | null
│   private applyDmpLinesPatch(content: string, original: string, updated: string): string | null
│   private extractError(testOutput: string): string
│   async runTests(testCmd?: string): Promise<string>
│   private updateTokenEstimate()
│   public async compressAndOffload(): Promise<void>
│
│ src/agent/repo_map.ts:
│   export async function generateRepoMap(cwd: string, maxFiles: number = 50): Promise<string>
│   const limitArg = process.argv.find(arg => arg.startsWith("--limit="));
│   const limit = limitArg ? parseInt(limitArg.split("=")[1]) : 100;
│
│ src/kernel/kernel.ts:
│   export class MeowKernel
│   constructor(db: DatabasePort | MeowDatabase)
│   start()
│   pulse(pid: number)
│   registerMission(pid: number, agent: string, goal: string)
│   async watchdogCheck()
│   async respawnAgent(pid: number)
│   async shutdown()
│
│ src/kernel/database.ts:
│   export class MeowDatabase
│   constructor(dbPath: string = "meow.db")
│   query(sql: string, params: any[] = []): any[]
│   execute(sql: string, params: any[] = []): { lastInsertRowid: number | bigint, changes: number }
│   batch(actions: { sql: string, params?: any[] }[]): void
│   prepare(sql: string)
│   close()
│
│ src/agent/summoner.ts:
│   export async function summon(agent: string, context: MissionContext): Promise<string>
│   export async function summonParallel(missions: { name: string, context: MissionContext }[]): Promise<string[]>
│
│ src/agent/mission_reviewer.ts:
│   export class MissionReviewer
│   constructor(agent: any)
│   async verify(goal: string, testCmd?: string): Promise<string>
│
│ src/agent/quantum_memory.ts:
│   export class QuantumMemory
│   constructor(db: any, kernel: any, reasoning: any)
│   async store(content: string, embedding: number[], metadata: any = {})
│   async recall(query: string, embedding: number[], topK: number = 5): Promise<MemoryResult[]>
│
│ src/agent/quantum_reasoning.ts:
│   export class QuantumReasoning
│   solve(problem: string): Promise<string>
│
│ src/agent/skills.ts:
│   export class SkillManager
│   async discover()
│   registerSkill(skill: Skill)
│   getSkillNames(): string[]
│   getSkillsPrompt(): string
│
│ src/agent/mcp.ts:
│   export class McpManager
│   async addServer(config: any)
│   removeServer(name: string)
│   listServers(): string[]
│   async callTool(serverName: string, toolName: string, args: any)
│
│ src/agent/discovery.ts:
│   export class DiscoveryModule
│   async discoverMcpServers(): Promise<any[]>
│   async discoverGlobalSkills(): Promise<Skill[]>
│
│ src/extensions/ExtensionManager.ts:
│   export class ExtensionManager
│   async discover()
│   async activateExtension(name: string)
│   getActiveTools(): any[]
│
│ src/cli/repl.ts:
│   export function createRepl(agent: Agent)
│   async start()
│
│ src/cli/tui.ts:
│   export class MeowTUI
│   constructor(agent: Agent, screen?: any)
│   start()
│   stop()
│
│ src/config/env.ts:
│   export const config = {
│
│ src/orchestrator/Architect.ts:
│   export class Architect
│   constructor(agent: Agent)
│   async plan(goal: string, files: string[], lastError?: string, sessionLogs?: string[]): Promise<string>
│
│ src/orchestrator/TaskDecomposer.ts:
│   export class TaskDecomposer
│   constructor(agent: Agent)
│   async decompose(mission: string): Promise<any[]>
│
│ src/orchestrator/FileCoordinator.ts:
│   export class FileCoordinator
│   async requestAccess(files: string[], agentId: string): Promise<boolean>
│   releaseAccess(files: string[], agentId: string)
│   releaseStaleLocks()
│
│ src/orchestrator/TaskQueue.ts:
│   export class TaskQueue
│   constructor(config: QueueConfig)
│   enqueue(task: any)
│   dequeue(): any
│
│ src/swarm/SwarmManager.ts:
│   export class SwarmManager
│   constructor(config: SwarmConfig)
│
│ src/types/message.ts:
│   export interface Message
│
│ src/types/tool.ts:
│   export interface Tool
│   export const DEFAULT_TOOLS: Tool[] = [
│
│ src/extensions/audio/index.ts:
│   execute: async (args: string) => {
│
│ src/extensions/database/db-server.ts:
│   class DbServer
│   constructor(dbPath: string = "meow.db")
│   private initializeSchema()
│   private startListening()
│
│ src/extensions/database/extension.ts:
│   export class DatabaseExtension implements DatabasePort
│   constructor(config: DatabaseExtensionConfig = {})
│
│ src/extensions/database/manifest.ts:
│   export interface DatabasePort
│   execute(sql: string, params?: any[]): Promise<DbExecuteResult>;
│   exec(sql: string): Promise<{ done: boolean }>;
│   batch(actions: any[]): Promise<BatchResult>;
│   loadExtension(path: string): Promise<void>;
│   close(): Promise<void>;
│
│ src/extensions/audio/lib/audio_logic.ts:
│   export class AudioEditor {
│   static async detectSilence(filePath: string, threshold: number = -30, minDuration: number = 0.5): Promise<SilencePeriod[]> {
│
│ src/orchestrator/ParallelExecutor.ts:
│   export class ParallelExecutor
│   constructor(coordinator: FileCoordinator)
│   async execute(tasks: any[], workers: number = 4)
│
