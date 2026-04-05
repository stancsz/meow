/**
 * help.ts
 *
 * Built-in /help skill for Meow.
 * Handles both "help" (Windows Git Bash mangled) and "/help" cases.
 */
import { getAllSkills, formatSkillsList } from "./loader.ts";
import type { Skill, SkillContext, SkillResult } from "./loader.ts";

export const help: Skill = {
  name: "help",
  description: "Show Meow CLI help and available commands",
  aliases: [],

  async execute(_args: string, _ctx: SkillContext): Promise<SkillResult> {
    return {
      content: `Meow - lean sovereign agent

Usage:
  bun run start                    # Interactive mode
  bun run start "your prompt"     # Single task mode
  bun run start --dangerous "cmd" # Single task with shell auto-approve
  bun run start --resume          # Resume last session
  bun run start --auto "task"    # Autonomous OODA loop mode
  bun run start --tick "task"    # Continuous mode with tick heartbeats
  bun run start --acp          # ACP mode: JSON-RPC stdio server for IDE/tool control

Commands:
  /exit       Exit meow
  /clear      Clear screen and conversation
  /plan       Plan mode: show intent before executing
  /dangerous  Toggle dangerous mode (auto-approve shell)
  /stream     Toggle streaming mode
  /auto       Enter autonomous OODA loop mode
  /tick       Enter continuous tick mode
  /tasks      List all tasks
  /add        Add a new task
  /done       Complete a task
  /sessions   List saved sessions
  /resume     Resume a session
  /skills     List all available skills

` + formatSkillsList().trim() + `

Learn more: https://github.com/meow/meow
`,
    };
  },
};
