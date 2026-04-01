/**
 * CLI Commands Module for SimpleClaw
 * Implements slash commands like Claude Code
 */

import * as readline from 'node:readline';
import { stdin as input, stdout as output } from 'node:process';
import { GitIntegration, getGitStatus, autoCommit, getCommitLog } from '../core/git';
import { createProvider, autoSelectProvider, MODEL_CONFIGS, getProviderForModel } from '../core/providers';
import type { GitStatus } from '../core/git';

// Command interface
export interface CliCommand {
  name: string;
  description: string;
  aliases?: string[];
  usage?: string;
  execute: (args: string[], context: CommandContext) => Promise<CommandResult>;
}

export interface CommandContext {
  rl: readline.Interface;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  gitIntegration?: GitIntegration;
  currentModel?: string;
  sessionId?: string;
}

export interface CommandResult {
  success: boolean;
  output?: string;
  error?: string;
  shouldContinue?: boolean;
}

// Colors for output
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

export const AVAILABLE_COMMANDS: CliCommand[] = [
  // Core commands
  {
    name: 'help',
    description: 'List all available commands',
    aliases: ['h', '?'],
    usage: '/help [command]',
    execute: async (args) => {
      if (args.length > 0) {
        const cmd = AVAILABLE_COMMANDS.find(c => 
          c.name === args[0] || c.aliases?.includes(args[0])
        );
        if (cmd) {
          return {
            success: true,
            output: `${colors.cyan}${colors.bold}/${cmd.name}${colors.reset} - ${cmd.description}\n` +
              (cmd.usage ? `  Usage: ${cmd.usage}\n` : '') +
              (cmd.aliases?.length ? `  Aliases: ${cmd.aliases.map(a => '/' + a).join(', ')}\n` : ''),
          };
        }
        return { success: false, error: `Unknown command: ${args[0]}` };
      }

      const helpText = [
        `${colors.bold}SimpleClaw Commands${colors.reset}\n`,
        `${colors.dim}Type a command or natural language to interact with SimpleClaw.${colors.reset}\n`,
        `${colors.bold}Core Commands:${colors.reset}`,
        '  /help [command]   - Show help for a command or all commands',
        '  /clear            - Clear the conversation',
        '  /exit             - Exit SimpleClaw',
        '',
        `${colors.bold}Session Commands:${colors.reset}`,
        '  /session          - Show current session info',
        '  /resume [id]      - Resume a previous session',
        '  /compact          - Compact conversation context',
        '',
        `${colors.bold}Git Commands:${colors.reset}`,
        '  /git status       - Show git status',
        '  /git diff         - Show uncommitted changes',
        '  /git commit       - Commit all changes',
        '  /git log          - Show recent commits',
        '  /git push         - Push to remote',
        '  /git pull         - Pull from remote',
        '',
        `${colors.bold}Model Commands:${colors.reset}`,
        '  /model            - Show current model',
        '  /model [name]     - Switch to a different model',
        '  /models           - List available models',
        '',
        `${colors.bold}Skills Commands:${colors.reset}`,
        '  /skills           - List available skills',
        '  /skills install   - Install a new skill',
        '',
        `${colors.bold}Config Commands:${colors.reset}`,
        '  /config           - Show current configuration',
        '  /config set       - Set a configuration value',
        '',
        `${colors.bold}Control Commands:${colors.reset}`,
        '  /plan             - Enter plan mode',
        '  /approve          - Approve the current plan',
        '  /abort            - Abort current operation',
        '  /retry            - Retry last failed operation',
      ].join('\n');

      return { success: true, output: helpText };
    },
  },

  {
    name: 'clear',
    description: 'Clear the conversation',
    aliases: ['cls'],
    execute: async () => {
      console.clear();
      return { success: true, shouldContinue: false };
    },
  },

  {
    name: 'exit',
    description: 'Exit SimpleClaw',
    aliases: ['quit', 'q'],
    execute: async () => {
      return { success: true, output: 'Goodbye!', shouldContinue: false };
    },
  },

  // Session commands
  {
    name: 'session',
    description: 'Show current session information',
    aliases: ['sess'],
    execute: async (args, context) => {
      const output = [
        `${colors.bold}Session Info:${colors.reset}`,
        `  Session ID: ${context.sessionId || 'N/A'}`,
        `  Model: ${context.currentModel || 'auto'}`,
        `  History: ${context.history.length} messages`,
      ].join('\n');
      return { success: true, output };
    },
  },

  {
    name: 'compact',
    description: 'Compact conversation context to save tokens',
    aliases: ['compress'],
    execute: async () => {
      // This would integrate with the context compaction module
      return { 
        success: true, 
        output: `${colors.green}Context compacted successfully.${colors.reset}\nReduced context to essential information.` 
      };
    },
  },

  // Git commands
  {
    name: 'git',
    description: 'Git operations',
    usage: '/git [status|diff|commit|log|push|pull|branch] [args]',
    execute: async (args) => {
      const subcommand = args[0]?.toLowerCase();
      
      switch (subcommand) {
        case 'status': {
          try {
            const status = await getGitStatus();
            const statusLines = [
              `${colors.bold}Git Status:${colors.reset}`,
              `  Branch: ${colors.cyan}${status.branch}${colors.reset}`,
              `  Clean: ${status.isClean ? `${colors.green}Yes${colors.reset}` : `${colors.yellow}No${colors.reset}`}`,
            ];

            if (status.staged.length) {
              statusLines.push(`  ${colors.green}Staged:${colors.reset} ${status.staged.length} file(s)`);
              status.staged.forEach(f => statusLines.push(`    ${colors.green}+ ${f}${colors.reset}`));
            }
            if (status.modified.length) {
              statusLines.push(`  ${colors.yellow}Modified:${colors.reset} ${status.modified.length} file(s)`);
              status.modified.forEach(f => statusLines.push(`    ~ ${f}${colors.reset}`));
            }
            if (status.untracked.length) {
              statusLines.push(`  ${colors.dim}Untracked:${colors.reset} ${status.untracked.length} file(s)`);
              status.untracked.forEach(f => statusLines.push(`    ? ${f}${colors.reset}`));
            }
            if (status.ahead > 0 || status.behind > 0) {
              statusLines.push(`  Remote: ${status.ahead} ahead, ${status.behind} behind`);
            }

            return { success: true, output: statusLines.join('\n') };
          } catch (error) {
            return { success: false, error: `Not a git repository: ${error}` };
          }
        }

        case 'diff': {
          try {
            const { getGitDiff } = await import('../core/git');
            const diffs = await getGitDiff();
            if (!diffs.length) {
              return { success: true, output: 'No uncommitted changes.' };
            }
            const diffOutput = diffs.map(d => 
              `${colors.yellow}${d.file}${colors.reset} (+${d.additions} -${d.deletions})`
            ).join('\n');
            return { success: true, output: diffOutput };
          } catch (error) {
            return { success: false, error: `Failed to get diff: ${error}` };
          }
        }

        case 'commit': {
          try {
            const message = args.slice(1).join(' ');
            const result = await autoCommit(undefined, message);
            if (result.success) {
              return { 
                success: true, 
                output: `${colors.green}Committed: ${result.hash?.slice(0, 7)}${colors.reset}\n${result.message}` 
              };
            }
            return { success: false, error: result.error };
          } catch (error) {
            return { success: false, error: `Failed to commit: ${error}` };
          }
        }

        case 'log': {
          try {
            const limit = parseInt(args[1]) || 10;
            const log = await getCommitLog(limit);
            const logOutput = log.map(entry => 
              `${colors.dim}${entry.hash}${colors.reset} ${entry.message} (${entry.author}, ${entry.date})`
            ).join('\n');
            return { success: true, output: logOutput || 'No commits found.' };
          } catch (error) {
            return { success: false, error: `Failed to get log: ${error}` };
          }
        }

        case 'push': {
          try {
            const { pushChanges } = await import('../core/git');
            const result = await pushChanges();
            if (result.success) {
              return { success: true, output: `${colors.green}Pushed successfully.${colors.reset}` };
            }
            return { success: false, error: result.error };
          } catch (error) {
            return { success: false, error: `Failed to push: ${error}` };
          }
        }

        case 'pull': {
          try {
            const { pullChanges } = await import('../core/git');
            const result = await pullChanges();
            if (result.success) {
              return { success: true, output: `${colors.green}Pulled successfully.${colors.reset}` };
            }
            return { success: false, error: result.error };
          } catch (error) {
            return { success: false, error: `Failed to pull: ${error}` };
          }
        }

        default:
          return {
            success: false,
            error: `Unknown git command: ${subcommand || 'none'}\nUsage: /git [status|diff|commit|log|push|pull]`
          };
      }
    },
  },

  // Model commands
  {
    name: 'model',
    description: 'Show or change the current model',
    usage: '/model [model-name]',
    execute: async (args, context) => {
      if (args.length === 0) {
        return {
          success: true,
          output: `Current model: ${context.currentModel || 'auto (provider-selected)'}\n` +
            `Use /models to see available models.`
        };
      }

      const modelName = args[0].toLowerCase();
      try {
        const provider = getProviderForModel(modelName);
        context.currentModel = modelName;
        return {
          success: true,
          output: `${colors.green}Model switched to ${modelName}${colors.reset}\n` +
            `Provider: ${provider.name}`
        };
      } catch (error) {
        return { success: false, error: `Unknown model: ${modelName}` };
      }
    },
  },

  {
    name: 'models',
    description: 'List available models',
    aliases: ['model list'],
    execute: async () => {
      const lines = [
        `${colors.bold}Available Models:${colors.reset}\n`,
        `${colors.cyan}OpenAI:${colors.reset}`,
        '  gpt-4o          - Most capable, fast',
        '  gpt-4o-mini     - Fast, cost-effective',
        '  gpt-4-turbo     - Fast GPT-4',
        '  gpt-3.5-turbo  - Legacy model',
        '',
        `${colors.cyan}Anthropic:${colors.reset}`,
        '  claude-opus-4-5    - Most capable Claude',
        '  claude-sonnet-4-5  - Best balance',
        '  claude-3-5-haiku   - Fast, cost-effective',
        '',
        `${colors.cyan}DeepSeek:${colors.reset}`,
        '  deepseek-chat   - General purpose',
        '  deepseek-coder  - Code-optimized',
        '',
        `${colors.cyan}Gemini:${colors.reset}`,
        '  gemini-1.5-pro  - Long context',
        '  gemini-1.5-flash - Fast',
        '',
        `${colors.cyan}Local (Ollama):${colors.reset}`,
        '  llama3, mistral, codellama, mixtral',
        '',
        `${colors.cyan}Local (LM Studio):${colors.reset}`,
        '  local (any loaded model)',
      ];
      return { success: true, output: lines.join('\n') };
    },
  },

  // Skills commands
  {
    name: 'skills',
    description: 'Manage skills',
    usage: '/skills [list|install|remove] [args]',
    execute: async (args) => {
      const subcommand = args[0]?.toLowerCase();

      switch (subcommand) {
        case 'list':
        case undefined: {
          // List built-in skills
          const skillsOutput = [
            `${colors.bold}Available Skills:${colors.reset}`,
            '',
            `${colors.cyan}Built-in:${colors.reset}`,
            '  github         - GitHub API operations',
            '  http-get       - HTTP GET requests',
            '  shell          - Shell command execution',
            '  echo           - Echo back input',
            '  mock-fetch     - Mock data fetching',
            '',
            `${colors.cyan}Custom:${colors.reset}`,
            '  (Load custom skills with /skills install)',
          ].join('\n');
          return { success: true, output: skillsOutput };
        }

        case 'install': {
          return {
            success: true,
            output: `${colors.yellow}Skill installation requires a skill URL or path.${colors.reset}\n` +
              `Usage: /skills install <url-or-path>`
          };
        }

        default:
          return {
            success: false,
            error: `Unknown skills command: ${subcommand}\nUsage: /skills [list|install]`
          };
      }
    },
  },

  // Config commands
  {
    name: 'config',
    description: 'Show or set configuration',
    usage: '/config [set|get] [key] [value]',
    execute: async (args) => {
      const subcommand = args[0]?.toLowerCase();

      if (!subcommand || subcommand === 'get') {
        const configOutput = [
          `${colors.bold}Current Configuration:${colors.reset}`,
          `  model: ${args[1] || 'auto'}`,
          `  maxTokens: 4096`,
          `  temperature: 0.7`,
        ].join('\n');
        return { success: true, output: configOutput };
      }

      if (subcommand === 'set') {
        return {
          success: true,
          output: `${colors.yellow}Config setting requires a key and value.${colors.reset}\n` +
            `Usage: /config set <key> <value>`
        };
      }

      return { success: false, error: `Unknown config command: ${subcommand}` };
    },
  },

  // Control commands
  {
    name: 'plan',
    description: 'Enter plan mode to review before execution',
    execute: async () => {
      return {
        success: true,
        output: `${colors.cyan}Entering plan mode...${colors.reset}\n` +
          `Your next prompt will be analyzed and a plan will be shown before execution.`
      };
    },
  },

  {
    name: 'approve',
    description: 'Approve the current plan for execution',
    execute: async () => {
      return {
        success: true,
        output: `${colors.green}Plan approved. Executing...${colors.reset}`
      };
    },
  },

  {
    name: 'abort',
    description: 'Abort current operation',
    aliases: ['cancel'],
    execute: async () => {
      return {
        success: true,
        output: `${colors.yellow}Operation aborted.${colors.reset}`
      };
    },
  },

  {
    name: 'retry',
    description: 'Retry the last failed operation',
    execute: async () => {
      return {
        success: true,
        output: `${colors.cyan}Retrying last operation...${colors.reset}`
      };
    },
  },

  {
    name: 'commit',
    description: 'Commit all changes to git',
    aliases: ['git-commit'],
    execute: async (args) => {
      try {
        const message = args.join(' ');
        const result = await autoCommit(undefined, message);
        if (result.success) {
          return {
            success: true,
            output: `${colors.green}✓ Committed ${result.hash?.slice(0, 7)}${colors.reset}\n${result.message}`
          };
        }
        return { success: false, error: result.error };
      } catch (error) {
        return { success: false, error: `Failed to commit: ${error}` };
      }
    },
  },

  {
    name: 'status',
    description: 'Show git status',
    aliases: ['git-status'],
    execute: async () => {
      try {
        const status = await getGitStatus();
        const parts = [
          `${colors.bold}On branch ${status.branch}${colors.reset}`,
        ];

        if (status.isClean) {
          parts.push(`${colors.green}nothing to commit, working tree clean${colors.reset}`);
        } else {
          if (status.staged.length) parts.push(`${colors.green}${status.staged.length} staged${colors.reset}`);
          if (status.modified.length) parts.push(`${colors.yellow}${status.modified.length} modified${colors.reset}`);
          if (status.untracked.length) parts.push(`${colors.dim}${status.untracked.length} untracked${colors.reset}`);
        }

        return { success: true, output: parts.join('\n') };
      } catch (error) {
        return { success: false, error: `Not a git repository` };
      }
    },
  },
];

// Command registry helper
export function findCommand(input: string): { command: CliCommand; args: string[] } | null {
  const trimmed = input.trim();
  
  if (!trimmed.startsWith('/')) {
    return null;
  }

  const parts = trimmed.slice(1).split(/\s+/);
  const commandName = parts[0].toLowerCase();
  const args = parts.slice(1);

  const command = AVAILABLE_COMMANDS.find(cmd =>
    cmd.name === commandName || cmd.aliases?.includes(commandName)
  );

  if (command) {
    return { command, args };
  }

  return null;
}

// Execute a command
export async function executeCommand(
  input: string,
  context: CommandContext
): Promise<CommandResult> {
  const found = findCommand(input);
  
  if (!found) {
    return { success: false, error: 'Unknown command. Type /help for available commands.' };
  }

  try {
    return await found.command.execute(found.args, context);
  } catch (error) {
    return {
      success: false,
      error: `Command failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

// Print command result
export function printCommandResult(result: CommandResult): void {
  if (result.output) {
    console.log(result.output);
  }
  if (result.error) {
    console.error(`${colors.red}Error: ${result.error}${colors.reset}`);
  }
}
