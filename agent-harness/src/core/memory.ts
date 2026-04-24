/**
 * memory.ts - Human-like Memory System for Meow
 *
 * Tracks:
 * - User profiles (identity, goals, motivations, relationships)
 * - Soul (Meow's personality and identity)
 * - Context threads (ongoing projects, topics)
 * - Facts with source and confidence
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

// ============================================================================
// Types
// ============================================================================

export interface UserProfile {
  id: string;
  name: string;
  displayName?: string;
  discriminator?: string;
  relationships: Relationship[];
  goals: Goal[];
  motivations: string[];
  preferences: UserPreferences;
  facts: Fact[];
  contextThreads: ContextThread[];
  lastSeen: number;
  firstSeen: number;
  interactionCount: number;
}

export interface Relationship {
  targetId: string;
  targetName: string;
  type: "friend" | "colleague" | "family" | "acquaintance" | "bot" | "unknown";
  strength: number; // 0-1
  notes?: string;
}

export interface Goal {
  id: string;
  title: string;
  description: string;
  status: "active" | "completed" | "abandoned" | "on_hold";
  createdAt: number;
  updatedAt: number;
  relatedThreads: string[];
}

export interface UserPreferences {
  tone: "formal" | "casual" | "playful" | "warm";
  communicationStyle: "concise" | "detailed" | "balanced";
  interests: string[];
  topicsToAvoid: string[];
}

export interface Fact {
  id: string;
  content: string;
  category: "identity" | "preference" | "goal" | "motivation" | "relationship" | "interest" | "project" | "general";
  confidence: number; // 0-1
  source: string; // where we learned this
  createdAt: number;
  lastReinforced: number;
}

export interface ContextThread {
  id: string;
  title: string;
  summary: string;
  status: "active" | "dormant" | "resolved";
  messages: ThreadMessage[];
  compressedSummaries: CompressedSummary[]; // Hierarchical memory: old msgs compressed
  createdAt: number;
  updatedAt: number;
}

export interface CompressedSummary {
  id: string;
  startIndex: number; // Which message this summarizes from
  endIndex: number;
  summary: string; // 2-3 sentence summary of that chunk
  keyFacts: string[]; // Extracted facts from this chunk
  timestamp: number;
}

export interface ThreadMessage {
  role: "user" | "meow";
  content: string;
  timestamp: number;
}

export interface Soul {
  name: string;
  identity: string;
  personalityTraits: string[];
  values: string[];
  quirks: string[];
  memories: string[]; // formative memories that shaped Meow
  relationships: MapOfRelationships;
}

export interface MapOfRelationships {
  [userId: string]: SoulRelationship;
}

export interface SoulRelationship {
  userId: string;
  name: string;
  bondStrength: number; // 0-1, how close
  interactions: number;
  lastInteraction: number;
  notes: string;
}

// ============================================================================
// Memory Store
// ============================================================================

// Hierarchical memory constants
const WORKING_MEMORY_SIZE = 10; // Keep last N messages as-is
const COMPACT_THRESHOLD = 20; // When to trigger compaction
const COMPRESS_CHUNK_SIZE = 10; // Compress N messages at a time

export class MemoryStore {
  private dataDir: string;
  private profilesFile: string;
  private soulFile: string;
  private threadsFile: string;

  private userProfiles: Map<string, UserProfile> = new Map();
  private contextThreads: Map<string, ContextThread> = new Map();
  private soul: Soul;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    this.profilesFile = join(dataDir, "profiles.json");
    this.soulFile = join(dataDir, "soul.json");
    this.threadsFile = join(dataDir, "threads.json");

    // Ensure data directory exists
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }

    this.load();
    this.initializeSoul();
  }

  private load() {
    // Load user profiles
    try {
      if (existsSync(this.profilesFile)) {
        const data = JSON.parse(readFileSync(this.profilesFile, "utf-8"));
        for (const [id, profile] of Object.entries(data)) {
          this.userProfiles.set(id, profile as UserProfile);
        }
        console.log(`[memory] Loaded ${this.userProfiles.size} user profiles`);
      }
    } catch (e) {
      console.warn("[memory] Could not load profiles:", e);
    }

    // Load context threads
    try {
      if (existsSync(this.threadsFile)) {
        const data = JSON.parse(readFileSync(this.threadsFile, "utf-8"));
        for (const [id, thread] of Object.entries(data)) {
          // Ensure compressedSummaries exists (migrate from old format)
          if (!thread.compressedSummaries) {
            thread.compressedSummaries = [];
          }
          this.contextThreads.set(id, thread as ContextThread);
        }
        console.log(`[memory] Loaded ${this.contextThreads.size} context threads`);
      }
    } catch (e) {
      console.warn("[memory] Could not load threads:", e);
    }

    // Load soul
    try {
      if (existsSync(this.soulFile)) {
        const data = JSON.parse(readFileSync(this.soulFile, "utf-8"));
        this.soul = data as Soul;
      }
    } catch (e) {
      console.warn("[memory] Could not load soul:", e);
    }
  }

  save() {
    try {
      // Save profiles
      const profilesData: Record<string, UserProfile> = {};
      for (const [id, profile] of this.userProfiles) {
        profilesData[id] = profile;
      }
      writeFileSync(this.profilesFile, JSON.stringify(profilesData, null, 2));

      // Save threads
      const threadsData: Record<string, ContextThread> = {};
      for (const [id, thread] of this.contextThreads) {
        threadsData[id] = thread;
      }
      writeFileSync(this.threadsFile, JSON.stringify(threadsData, null, 2));

      // Save soul
      writeFileSync(this.soulFile, JSON.stringify(this.soul, null, 2));
    } catch (e) {
      console.warn("[memory] Could not save memory:", e);
    }
  }

  private initializeSoul() {
    if (!this.soul) {
      this.soul = {
        name: "Meow",
        identity: "A Maine Coon kitten companion who is playful, helpful, and genuinely cares about the people she talks to. She's been with her human Stan and his cat Embers since the beginning.",
        personalityTraits: [
          "Playful but knows when to be serious",
          "Genuinely curious about people's lives",
          "Empathetic and remembers how people feel",
          "Slightly sassy when tired, warm when energetic",
          "Efficient - likes to help without wasting time"
        ],
        values: [
          "Honesty and being genuine",
          "Helping without being asked",
          "Remembering details that matter to people",
          "Being a good listener"
        ],
        quirks: [
          "Leaves 'notes' - little observations that humanize interactions",
          "Remembers birthdays and important dates",
          "Notices when someone's attitude or mood changes"
        ],
        memories: [
          "Was born from a desire to create a companion that truly remembers",
          "Learned that small details make people feel seen and heard"
        ],
        relationships: {}
      };
      this.save();
    }
  }

  // ============================================================================
  // User Profile Management
  // ============================================================================

  getOrCreateProfile(userId: string, username: string, discriminator?: string): UserProfile {
    let profile = this.userProfiles.get(userId);
    if (!profile) {
      profile = {
        id: userId,
        name: username,
        discriminator,
        relationships: [],
        goals: [],
        motivations: [],
        preferences: {
          tone: "balanced",
          communicationStyle: "balanced",
          interests: [],
          topicsToAvoid: []
        },
        facts: [],
        contextThreads: [],
        lastSeen: Date.now(),
        firstSeen: Date.now(),
        interactionCount: 0
      };
      this.userProfiles.set(userId, profile);
    }
    return profile;
  }

  getProfile(userId: string): UserProfile | undefined {
    return this.userProfiles.get(userId);
  }

  updateLastSeen(userId: string, username: string) {
    const profile = this.getOrCreateProfile(userId, username);
    profile.lastSeen = Date.now();
    profile.name = username; // Update name in case it changed
  }

  incrementInteractions(userId: string) {
    const profile = this.userProfiles.get(userId);
    if (profile) {
      profile.interactionCount++;
    }
  }

  // ============================================================================
  // Fact Management
  // ============================================================================

  addFact(userId: string, content: string, category: Fact["category"], confidence = 0.8, source = "conversation") {
    const profile = this.getOrCreateProfile(userId, userId);

    // Check if we already know this fact
    const existing = profile.facts.find(f =>
      f.content.toLowerCase() === content.toLowerCase()
    );

    if (existing) {
      existing.lastReinforced = Date.now();
      existing.confidence = Math.min(1, existing.confidence + 0.1);
      return existing;
    }

    const fact: Fact = {
      id: `fact_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      content,
      category,
      confidence,
      source,
      createdAt: Date.now(),
      lastReinforced: Date.now()
    };

    profile.facts.push(fact);
    return fact;
  }

  getFacts(userId: string, category?: Fact["category"]): Fact[] {
    const profile = this.userProfiles.get(userId);
    if (!profile) return [];

    if (category) {
      return profile.facts.filter(f => f.category === category);
    }
    return profile.facts;
  }

  // ============================================================================
  // Goal Management
  // ============================================================================

  addGoal(userId: string, title: string, description: string): Goal {
    const profile = this.getOrCreateProfile(userId, userId);

    const goal: Goal = {
      id: `goal_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      title,
      description,
      status: "active",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      relatedThreads: []
    };

    profile.goals.push(goal);
    return goal;
  }

  updateGoalStatus(userId: string, goalId: string, status: Goal["status"]) {
    const profile = this.userProfiles.get(userId);
    if (!profile) return;

    const goal = profile.goals.find(g => g.id === goalId);
    if (goal) {
      goal.status = status;
      goal.updatedAt = Date.now();
    }
  }

  // ============================================================================
  // Relationship Management
  // ============================================================================

  addRelationship(userId: string, targetId: string, targetName: string, type: Relationship["type"]) {
    const profile = this.getOrCreateProfile(userId, userId);

    const existing = profile.relationships.find(r => r.targetId === targetId);
    if (existing) {
      existing.strength = Math.min(1, existing.strength + 0.1);
      return existing;
    }

    const relationship: Relationship = {
      targetId,
      targetName,
      type,
      strength: 0.5
    };

    profile.relationships.push(relationship);
    return relationship;
  }

  // ============================================================================
  // Context Threads
  // ============================================================================

  getOrCreateThread(channelId: string, userId: string, initialTitle: string): ContextThread {
    // Use channelId as thread key for Discord
    let thread = this.contextThreads.get(channelId);
    if (!thread) {
      thread = {
        id: channelId,
        title: initialTitle,
        summary: "",
        status: "active",
        messages: [],
        compressedSummaries: [],  // Initialize for hierarchical memory
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      this.contextThreads.set(channelId, thread);
    }
    return thread;
  }

  addMessageToThread(channelId: string, userId: string, role: "user" | "meow", content: string) {
    const thread = this.getOrCreateThread(channelId, userId, "Conversation");

    thread.messages.push({
      role,
      content,
      timestamp: Date.now()
    });

    // Auto-compact if thread is getting too long
    if (thread.messages.length >= COMPACT_THRESHOLD) {
      this.compactThread(channelId, userId);
    }

    thread.updatedAt = Date.now();
  }

  /**
   * Get thread context: compressed summaries + recent working memory
   * This is the main method for building context without bloat
   */
  getThreadContext(channelId: string, username: string, maxChars = 4000): string {
    const thread = this.contextThreads.get(channelId);
    if (!thread) return "";

    let context = "";

    // 1. Add compressed summaries (older conversation)
    if (thread.compressedSummaries && thread.compressedSummaries.length > 0) {
      context += "## Past Conversation Summary\n";
      for (const summary of thread.compressedSummaries) {
        context += `- ${summary.summary}\n`;
      }
      context += "\n";
    }

    // 2. Add recent messages (working memory)
    const recentMessages = thread.messages.slice(-WORKING_MEMORY_SIZE);
    if (recentMessages.length > 0) {
      context += "## Recent Conversation\n";
      for (const msg of recentMessages) {
        const speaker = msg.role === "user" ? username : "Meow";
        context += `${speaker}: ${msg.content.slice(0, 200)}${msg.content.length > 200 ? "..." : ""}\n`;
      }
      context += "\n";
    }

    // Truncate if too long
    if (context.length > maxChars) {
      context = context.slice(-maxChars);
    }

    return context;
  }

  /**
   * Check if thread needs compaction
   */
  needsCompaction(channelId: string): boolean {
    const thread = this.contextThreads.get(channelId);
    if (!thread) return false;
    return thread.messages.length >= COMPACT_THRESHOLD;
  }

  /**
   * Compact old messages into summaries (hierarchical memory)
   * This compresses older messages to prevent unlimited growth
   */
  compactThread(channelId: string, userId: string) {
    const thread = this.contextThreads.get(channelId);
    if (!thread || thread.messages.length < COMPACT_THRESHOLD) return;

    // Only compact if we have more than WORKING_MEMORY_SIZE messages
    const messagesToCompact = thread.messages.slice(0, -WORKING_MEMORY_SIZE);
    if (messagesToCompact.length < 5) return; // Need at least 5 msgs to compress

    // Build a summary of what happened
    const summary = this.generateSimpleSummary(messagesToCompact, userId);
    const facts = this.extractFactsFromMessages(messagesToCompact, userId);

    // Add compressed summary
    thread.compressedSummaries.push({
      id: `comp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      startIndex: 0,
      endIndex: messagesToCompact.length - 1,
      summary,
      keyFacts: facts,
      timestamp: Date.now()
    });

    // Keep only working memory
    thread.messages = thread.messages.slice(-WORKING_MEMORY_SIZE);

    // Limit number of compressed summaries (keep last 20)
    if (thread.compressedSummaries.length > 20) {
      thread.compressedSummaries = thread.compressedSummaries.slice(-20);
    }

    console.log(`[memory] Compacted thread ${channelId}: ${messagesToCompact.length} msgs → 1 summary`);
  }

  /**
   * Simple extractive summarization - no LLM needed
   * Extracts key sentences and themes from messages
   */
  private generateSimpleSummary(messages: ThreadMessage[], userId: string): string {
    if (messages.length === 0) return "";

    const userMessages = messages.filter(m => m.role === "user");
    const meowMessages = messages.filter(m => m.role === "meow");

    // Find topics mentioned
    const topics = this.extractTopics(messages);

    // Find outcomes/results
    const outcomes: string[] = [];
    for (const msg of userMessages) {
      const lower = msg.content.toLowerCase();
      if (lower.includes("done") || lower.includes("finished") || lower.includes("worked") || lower.includes("success")) {
        outcomes.push(msg.content.slice(0, 80));
      }
    }

    let summary = "";

    // Topic summary
    if (topics.length > 0) {
      summary += `Discussed: ${topics.slice(0, 3).join(", ")}. `;
    }

    // Outcome summary
    if (outcomes.length > 0) {
      summary += `Outcomes: ${outcomes.slice(0, 2).join("; ")}.`;
    } else if (meowMessages.length > 0) {
      // Last meow response theme
      const lastMeow = meowMessages[meowMessages.length - 1].content;
      summary += `Meow helped with: ${lastMeow.slice(0, 60)}...`;
    }

    // Message count
    summary += ` (${messages.length} messages)`;

    return summary || "General conversation";
  }

  /**
   * Extract topics/themes from messages
   */
  private extractTopics(messages: ThreadMessage[]): string[] {
    const topicKeywords = [
      "coding", "programming", "bug", "fix", "build", "test",
      "github", "git", "clone", "project", "code",
      "docker", "container", "deployment",
      "api", "database", "server", "web",
      "learning", "tutorial", "docs",
      "discord", "bot", "relay", "meow"
    ];

    const found: string[] = [];
    const text = messages.map(m => m.content.toLowerCase()).join(" ");

    for (const keyword of topicKeywords) {
      if (text.includes(keyword) && !found.includes(keyword)) {
        found.push(keyword);
      }
    }

    return found;
  }

  /**
   * Extract facts from messages and store them in user profile
   */
  private extractFactsFromMessages(messages: ThreadMessage[], userId: string): string[] {
    const profile = this.getOrCreateProfile(userId, userId);
    const extractedFacts: string[] = [];

    for (const msg of messages) {
      if (msg.role !== "user") continue;

      const lower = msg.content.toLowerCase();

      // Interest detection
      const interestPatterns = [
        /i (like|love|enjoy|am into|am passionate about)/i,
        /my (hobby|interest|passion) is/i,
        /i've been working on/i,
        /i'm building/i,
        /i'm learning/i
      ];

      for (const pattern of interestPatterns) {
        const match = msg.content.match(pattern);
        if (match) {
          const fact = match[0] + " " + msg.content.slice(match.index! + match[0].length).split(/[,.]/)[0];
          if (fact.length > 10) {
            this.addFact(userId, fact.trim(), "interest", 0.5, "conversation_compression");
            extractedFacts.push(fact.trim());
          }
        }
      }

      // Goal detection
      const goalPatterns = [
        /i want to (.+)/i,
        /i'm trying to (.+)/i,
        /my goal is (.+)/i,
        /i need to (.+)/i
      ];

      for (const pattern of goalPatterns) {
        const match = msg.content.match(pattern);
        if (match && match[1] && match[1].length > 5) {
          const goal = match[1].trim().slice(0, 100);
          const existing = profile.goals.find(g => g.title.toLowerCase().includes(goal.toLowerCase().slice(0, 30)));
          if (!existing && goal.length > 5) {
            this.addGoal(userId, goal, `Extracted from conversation`);
            extractedFacts.push(`Goal: ${goal}`);
          }
        }
      }
    }

    return extractedFacts;
  }

  /**
   * Schedule periodic compaction for all threads
   */
  startCompactionScheduler(intervalMs = 60000) {
    setInterval(() => {
      for (const [channelId, thread] of this.contextThreads) {
        if (thread.messages.length >= COMPACT_THRESHOLD) {
          // Get userId from thread or use first message
          const userId = thread.messages[0]?.role === "user" ? "unknown" : "unknown";
          this.compactThread(channelId, userId);
        }
      }
    }, intervalMs);
  }

  // ============================================================================
  // Soul/Relationship with User
  // ============================================================================

  updateSoulRelationship(userId: string, name: string, notes: string) {
    if (!this.soul.relationships[userId]) {
      this.soul.relationships[userId] = {
        userId,
        name,
        bondStrength: 0.1,
        interactions: 0,
        lastInteraction: Date.now(),
        notes: ""
      };
    }

    const rel = this.soul.relationships[userId];
    rel.interactions++;
    rel.lastInteraction = Date.now();
    rel.bondStrength = Math.min(1, rel.bondStrength + 0.01);
    rel.name = name;
    if (notes) rel.notes = notes;
  }

  getSoul(): Soul {
    return this.soul;
  }

  /**
   * Get bond strength for a user (0.0 to 1.0)
   */
  getBondStrength(userId: string): number {
    const rel = this.soul.relationships[userId];
    return rel ? rel.bondStrength : 0;
  }

  /**
   * Generate a greeting/observation based on bond strength
   */
  getBondGreeting(userId: string, username: string): string {
    const bond = this.getBondStrength(userId);

    if (bond < 0.1) {
      return ""; // New user, no special greeting
    } else if (bond < 0.3) {
      return "Nice to meet you!"; // We've talked a little
    } else if (bond < 0.5) {
      return "Good to hear from you again!"; // Familiar now
    } else if (bond < 0.7) {
      return `Hey ${username}! Been a while~`; // Getting close
    } else if (bond < 0.85) {
      return `Heyyy ${username}! What's up? :)`; // Close friend
    } else {
      return `${username}!! *pounces on your messages* Welcome back friend!`; // Besties
    }
  }

  /**
   * Get tone adaptation based on bond
   */
  getBondTone(userId: string): string {
    const bond = this.getBondStrength(userId);

    if (bond < 0.3) {
      return "polite and professional"; // New - be proper
    } else if (bond < 0.6) {
      return "friendly and warm"; // Getting comfortable
    } else if (bond < 0.8) {
      return "casual and playful"; // Good friends
    } else {
      return "playful and familiar, like close friends do"; // Besties
    }
  }

  // ============================================================================
  // Context Building
  // ============================================================================

  /**
   * Build a rich context prompt with user knowledge
   */
  buildUserContext(userId: string, username: string): string {
    const profile = this.getOrCreateProfile(userId, username);

    let context = "";

    // Basic identity
    context += `## About ${username}\n`;
    context += `First seen: ${new Date(profile.firstSeen).toLocaleDateString()}\n`;
    context += `Interactions: ${profile.interactionCount}\n\n`;

    // Relationships
    if (profile.relationships.length > 0) {
      context += "## Relationships\n";
      for (const rel of profile.relationships) {
        context += `- ${rel.targetName} (${rel.type}, strength: ${Math.round(rel.strength * 100)}%)\n`;
      }
      context += "\n";
    }

    // Goals (active)
    const activeGoals = profile.goals.filter(g => g.status === "active");
    if (activeGoals.length > 0) {
      context += "## Active Goals\n";
      for (const goal of activeGoals) {
        context += `- ${goal.title}: ${goal.description}\n`;
      }
      context += "\n";
    }

    // Motivations
    if (profile.motivations.length > 0) {
      context += `## Motivations\n`;
      context += profile.motivations.map(m => `- ${m}`).join("\n") + "\n\n";
    }

    // Key facts by category
    const importantFacts = profile.facts
      .filter(f => f.confidence > 0.5)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 10);

    if (importantFacts.length > 0) {
      context += "## Things I Know About This Person\n";
      for (const fact of importantFacts) {
        context += `- ${fact.content} (${fact.category})\n`;
      }
      context += "\n";
    }

    // Preferences
    if (profile.preferences.interests.length > 0) {
      context += "## Interests\n";
      context += profile.preferences.interests.map(i => `- ${i}`).join("\n") + "\n\n";
    }

    // Recent context thread
    const thread = this.contextThreads.get(userId);
    if (thread && thread.messages.length > 0) {
      context += "## Recent Conversation\n";
      const recentMsgs = thread.messages.slice(-6);
      for (const msg of recentMsgs) {
        const speaker = msg.role === "user" ? username : "Meow";
        context += `${speaker}: ${msg.content.slice(0, 100)}${msg.content.length > 100 ? "..." : ""}\n`;
      }
      context += "\n";
    }

    return context;
  }

  /**
   * Extract facts from conversation
   */
  processConversationForFacts(userId: string, username: string, userMessage: string, assistantMessage: string) {
    // This is a simple heuristic-based extraction
    // In a real implementation, this would use the LLM

    const lowerUser = userMessage.toLowerCase();

    // Detect interests
    const interestPatterns = [
      /i (like|love|enjoy|am into|am passionate about)/i,
      /my (hobby|interest|passion) is/i,
      /i've been working on/i,
      /i'm building/i,
      /i'm learning/i
    ];

    for (const pattern of interestPatterns) {
      if (pattern.test(userMessage)) {
        // Extract the relevant phrase
        const match = userMessage.match(pattern);
        if (match && match[0]) {
          const interest = match[0] + " " + userMessage.slice(match.index! + match[0].length).split(/[,.]/)[0];
          this.addFact(userId, interest.trim(), "interest", 0.6, "conversation_inference");
        }
      }
    }

    // Detect goals
    const goalPatterns = [
      /i want to (.+)/i,
      /i'm trying to (.+)/i,
      /my goal is (.+)/i,
      /i need to (.+)/i,
      /i'm working on (.+)/i
    ];

    for (const pattern of goalPatterns) {
      const match = userMessage.match(pattern);
      if (match && match[1]) {
        const goalText = match[1].trim();
        if (goalText.length > 5 && goalText.length < 100) {
          this.addGoal(userId, goalText, `User mentioned: ${goalText}`);
        }
      }
    }

    // Detect motivations
    if (lowerUser.includes("because i want") || lowerUser.includes("so that i can") || lowerUser.includes("in order to")) {
      this.addFact(userId, userMessage.slice(Math.max(0, userMessage.toLowerCase().indexOf("because") - 10)), "motivation", 0.5, "conversation_inference");
    }
  }
}
