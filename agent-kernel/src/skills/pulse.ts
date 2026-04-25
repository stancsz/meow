/**
 * pulse.ts — Human-Agent Synchronization Skill
 * 
 * Allows the agent to read current human intent from HUMAN.md
 * and sync its local plan with the user's real-time instructions.
 */

import { type Skill } from "./loader.ts";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export const pulse: Skill = {
  name: "pulse",
  description: "Synchronize with real-time human instructions from HUMAN.md. Use this periodically during long tasks or when you feel 'stuck'.",
  async execute(context) {
    const humanMdPath = join(context.cwd, "agent-harness", "HUMAN.md");
    
    if (!existsSync(humanMdPath)) {
      return { success: false, message: "HUMAN.md not found at expected path: " + humanMdPath };
    }

    try {
      const content = readFileSync(humanMdPath, "utf-8");
      
      // Look for the "CURRENT HUMAN INTENT" section
      const intentMatch = content.match(/## CURRENT HUMAN INTENT \(Broadcast\)\n\n([\s\S]+?)(?:\n---|$)/);
      const intent = intentMatch ? intentMatch[1].trim() : content.slice(0, 1000);

      console.log(`[pulse] 💓 Synchronized with human: "${intent.slice(0, 50)}..."`);
      
      return { 
        success: true, 
        message: `Human intent synchronized: ${intent}` 
      };
    } catch (e: any) {
      return { success: false, message: `Failed to read human pulse: ${e.message}` };
    }
  },
};
