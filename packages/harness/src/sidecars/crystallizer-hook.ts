import { DoneHook, HookContext, HookResult } from "../core/done-hooks.ts";
import { crystallizeSkill, saveSkill } from "../core/skill-crystallizer.ts";

/**
 * The Skill Crystallizer Hook
 * 
 * Triggers after a successful task completion to observe the patterns
 * and autonomously author a new Skill SOP.
 */
export const skillCrystallizerHook: DoneHook = {
  name: "skill-crystallizer",
  priority: 10, // High priority
  
  /**
   * Only trigger if:
   * 1. The task was marked successful
   * 2. There were at least 3 tool calls (to ensure it's a meaningful pattern)
   * 3. The task description is long enough to be an actual task
   */
  trigger: (context: HookContext) => {
    return (
      context.task.success && 
      context.toolCalls.length >= 3 && 
      context.task.description.length > 10
    );
  },
  
  /**
   * Execute the crystallization and save the skill
   */
  execute: async (context: HookContext): Promise<HookResult> => {
    try {
      console.log(`[crystallizer] 🧪 Observing pattern for task: "${context.task.description.slice(0, 50)}..."`);
      
      const skill = await crystallizeSkill(context);
      const saved = saveSkill(skill);
      
      if (saved) {
        return {
          success: true,
          skillCrystallized: true,
          skillName: skill.name,
          metadata: {
            keywords: skill.trigger.keywords,
            steps: skill.steps.length
          }
        };
      } else {
        return {
          success: false,
          error: "Failed to save crystallized skill to disk"
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
