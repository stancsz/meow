/**
 * Epoch 24: Done Hooks Infrastructure
 * 
 * Hook infrastructure for capturing successful task completions
 * and triggering skill crystallization.
 * 
 * @see evolve/epoch/24/plan_architecture.md
 */

// ============================================================================
// Type Definitions
// ============================================================================

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result?: string;
  duration?: number;
}

export interface TaskInfo {
  id: string;
  description: string;
  success: boolean;
}

export interface HookContext {
  task: TaskInfo;
  toolCalls: ToolCall[];
  messages: Message[];
  startTime: number;
  endTime: number;
  metadata?: Record<string, unknown>;
}

export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: string;
}

export interface DoneHook {
  name: string;
  priority: number;
  trigger: (context: HookContext) => boolean;
  execute: (context: HookContext) => Promise<HookResult>;
}

export interface HookResult {
  success: boolean;
  skillCrystallized?: boolean;
  skillName?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// DoneHooks Class
// ============================================================================

export class DoneHooks {
  private hooks: DoneHook[] = [];

  /**
   * Register a new hook
   */
  register(hook: DoneHook): void {
    if (!hook.name || typeof hook.execute !== 'function') {
      throw new Error('Invalid hook: requires name and execute function');
    }
    
    // Avoid duplicate names
    this.unregister(hook.name);
    
    this.hooks.push(hook);
    
    // Sort by priority (higher first)
    this.hooks.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Unregister a hook by name
   */
  unregister(name: string): boolean {
    const index = this.hooks.findIndex(h => h.name === name);
    if (index !== -1) {
      this.hooks.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Get all registered hooks
   */
  getHooks(): DoneHook[] {
    return [...this.hooks];
  }

  /**
   * Check if a hook with given name exists
   */
  hasHook(name: string): boolean {
    return this.hooks.some(h => h.name === name);
  }

  /**
   * Trigger all hooks that match the context
   * Only hooks where trigger() returns true are included in results
   */
  async trigger(context: HookContext): Promise<HookResult[]> {
    const results: HookResult[] = [];
    
    for (const hook of this.hooks) {
      try {
        // Check if hook should trigger
        const shouldTrigger = this.checkTrigger(hook, context);
        
        if (shouldTrigger) {
          const result = await this.executeHook(hook, context);
          results.push(result);
        }
        // Non-matching hooks return nothing (not neutral result)
      } catch (error) {
        results.push({
          success: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    
    return results;
  }

  /**
   * Check if hook should trigger based on its trigger function
   */
  private checkTrigger(hook: DoneHook, context: HookContext): boolean {
    try {
      return hook.trigger(context);
    } catch {
      return false;
    }
  }

  /**
   * Execute a single hook
   */
  private async executeHook(hook: DoneHook, context: HookContext): Promise<HookResult> {
    try {
      return await hook.execute(context);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create a basic task success hook that triggers on successful tasks
 */
export function createTaskSuccessHook(
  executeFn: (context: HookContext) => Promise<HookResult>
): DoneHook {
  return {
    name: 'task-success-hook',
    priority: 100,
    trigger: (context: HookContext) => {
      return context.task.success === true;
    },
    execute: executeFn
  };
}

/**
 * Create a hook that triggers based on minimum tool calls
 */
export function createToolCountHook(
  name: string,
  minTools: number,
  executeFn: (context: HookContext) => Promise<HookResult>
): DoneHook {
  return {
    name,
    priority: 50,
    trigger: (context: HookContext) => {
      return context.toolCalls.length >= minTools;
    },
    execute: executeFn
  };
}

/**
 * Create a hook that triggers on specific keywords in task description
 */
export function createKeywordHook(
  name: string,
  keywords: string[],
  executeFn: (context: HookContext) => Promise<HookResult>
): DoneHook {
  return {
    name,
    priority: 75,
    trigger: (context: HookContext) => {
      const desc = context.task.description.toLowerCase();
      return keywords.some(kw => desc.includes(kw.toLowerCase()));
    },
    execute: executeFn
  };
}

// ============================================================================
// Default Hook Instance (singleton for common use)
// ============================================================================

let defaultHooksInstance: DoneHooks | null = null;

export function getDefaultHooks(): DoneHooks {
  if (!defaultHooksInstance) {
    defaultHooksInstance = new DoneHooks();
  }
  return defaultHooksInstance;
}

export function resetDefaultHooks(): void {
  defaultHooksInstance = null;
}