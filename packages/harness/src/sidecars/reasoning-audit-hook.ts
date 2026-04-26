import { DoneHook, HookContext, HookResult } from "../core/done-hooks.ts";
import { 
  storeReasoningTrace, 
  type ReasoningTrace,
  type ReasoningSearchResult,
  searchReasoningTraces,
  formatSearchResults
} from "../core/reasoning-audit.ts";

/**
 * The Reasoning Audit Hook - XL-18 Metacognition Implementation
 * 
 * Captures full traces of ALL task completions (success or failure)
 * for experience replay. Meow can use `searchMemory` to find
 * "Lessons Learned" from previous tasks.
 */
export const reasoningAuditHook: DoneHook = {
  name: "reasoning-audit",
  priority: 50, // Medium priority - runs after crystallization
  
  /**
   * Trigger on ALL task completions - both success and failure.
   * This is essential for capturing failures to learn from mistakes.
   */
  trigger: (context: HookContext) => {
    // Trigger on ALL task completions
    return true;
  },
  
  /**
   * Execute: Store the reasoning trace for experience replay
   */
  execute: async (context: HookContext): Promise<HookResult> => {
    try {
      const durationMs = context.endTime - context.startTime;
      const toolSequence = context.toolCalls.map(tc => tc.name);
      
      // Extract learnings
      let learnings: string | undefined;
      if (context.task.success) {
        learnings = "Task completed successfully";
      } else {
        learnings = context.metadata?.error 
          ? String(context.metadata.error).slice(0, 200)
          : "Task failed - check error logs";
      }
      
      // Extract iterations from metadata
      const iterations = (context.metadata?.iterations as number) || 0;
      
      // Store raw messages (truncated to prevent bloat)
      let rawMessages: string | undefined;
      try {
        const truncatedMessages = context.messages.slice(-20);
        rawMessages = JSON.stringify(truncatedMessages);
        if (rawMessages.length > 50000) {
          rawMessages = rawMessages.slice(0, 50000) + "... [truncated]";
        }
      } catch {
        // Ignore serialization errors
      }
      
      const trace: ReasoningTrace = {
        id: `trace_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
        taskId: context.task.id,
        taskDescription: context.task.description,
        success: context.task.success,
        startTime: context.startTime,
        endTime: context.endTime,
        durationMs,
        iterations,
        toolCallCount: context.toolCalls.length,
        messageCount: context.messages.length,
        toolSequence,
        errorMessage: context.task.success ? undefined : String(context.metadata?.error || "Unknown error"),
        learnings,
        rawMessages,
        createdAt: Date.now()
      };
      
      const stored = storeReasoningTrace(trace);
      
      if (stored) {
        console.log(`[reasoning-audit] 📝 Trace stored: ${context.task.description.slice(0, 40)}... (${context.task.success ? "✅" : "❌"})`);
        return {
          success: true,
          metadata: {
            traceId: trace.id,
            toolCount: trace.toolCallCount,
            durationMs: trace.durationMs,
            success: trace.success
          }
        };
      } else {
        return {
          success: false,
          error: "Failed to store reasoning trace"
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
};

/**
 * Register this hook to DoneHooks
 */
export function registerReasoningAuditHook(): void {
  try {
    const { getDefaultHooks } = require("../core/done-hooks");
    const hooks = getDefaultHooks();
    
    if (!hooks.hasHook("reasoning-audit")) {
      hooks.register(reasoningAuditHook);
      console.log("[reasoning-audit] ✅ Hook registered to DoneHooks");
    }
  } catch (e) {
    console.error("[reasoning-audit] ❌ Failed to register hook:", e);
  }
}

// Export for direct usage
export { searchReasoningTraces, formatSearchResults, type ReasoningSearchResult };
