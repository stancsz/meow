import { execSync } from "node:child_process";
import type { Extension } from "../core/extensions.ts";

export const plugin: Extension = {
  name: "browser",
  type: "skill",
  execute: async (args: { action: string; url?: string; selector?: string; text?: string }) => {
    const { action, url, selector, text } = args;
    
    // Simplistic mapping to agent-browser CLI
    // In a real scenario, we might want to use the agent-browser library more robustly
    try {
      let command = "bunx agent-browser ";
      switch (action) {
        case "navigate":
          command += `navigate "${url}"`;
          break;
        case "click":
          command += `click "${selector}"`;
          break;
        case "type":
          command += `type "${selector}" "${text}"`;
          break;
        case "snapshot":
          command += `snapshot`;
          break;
        case "screenshot":
          command += `screenshot`;
          break;
        case "wait":
          // If agent-browser doesn't have a direct 'wait', we can just use a sleep or a snapshot delay
          command += `snapshot`; // Fallback to snapshot which usually waits for load
          break;
        default:
          return `Unknown browser action: ${action}`;
      }

      console.log(`🌐 Browser Skill: Executing "${command}"`);
      const output = execSync(command, { 
        env: { 
          ...process.env
        } 
      }).toString();
      return output;
    } catch (error: any) {
      console.error(`❌ Browser Error:`, error.message);
      return `Browser error: ${error.message}`;
    }
  },
};
