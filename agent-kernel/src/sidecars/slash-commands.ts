/**
 * Slash Commands Sidecar
 *
 * Provides slash command infrastructure for the CLI.
 * Commands are registered in a registry and can be built-in or custom.
 */

export interface Command {
  name: string;
  description: string;
  execute: (args: string, context: CommandContext) => Promise<CommandResult>;
  hidden?: boolean;
}

export interface CommandContext {
  cwd: string;
  dangerous: boolean;
  sessionId?: string;
}

export interface CommandResult {
  content?: string;
  error?: string;
  handled?: boolean;
}

// Built-in commands
const builtInCommands: Record<string, Command> = {
  help: {
    name: "help",
    description: "Show available commands",
    execute: async (_, __) => ({
      content: "Available commands: /help, /exit, /plan, /dangerous, /stream, /clear, /tasks, /add, /done, /sessions, /resume, /name, /lang, /auto",
    }),
  },
  exit: {
    name: "exit",
    description: "Exit meow",
    execute: async () => ({
      content: "Goodbye!",
      handled: true,
    }),
  },
  plan: {
    name: "plan",
    description: "Plan mode: show intent before executing",
    execute: async (_, __) => ({
      content: "Plan mode - shows intent before executing",
    }),
  },
  clear: {
    name: "clear",
    description: "Clear screen and conversation",
    execute: async () => ({
      content: "",
      handled: true,
    }),
  },
  name: {
    name: "name",
    description: "Name or rename the current session: /name <name>",
    execute: async (args, context) => {
      const { nameSession, getSessionName } = await import("../core/session-store.ts");
      const sessionId = context.sessionId;
      if (!sessionId) {
        return { error: "No active session" };
      }
      if (!args.trim()) {
        const currentName = getSessionName(sessionId);
        return { content: currentName ? `Session name: "${currentName}"` : "This session has no name yet. Use /name <name> to name it." };
      }
      const trimmedName = args.trim();
      if (trimmedName.length > 50) {
        return { error: "Session name too long (max 50 characters)" };
      }
      nameSession(sessionId, trimmedName);
      return { content: `Session renamed to "${trimmedName}"` };
    },
  },
  lang: {
    name: "lang",
    description: "Switch language: /lang en|zh|zt",
    execute: async (args) => {
      const { langCommand } = await import("./i18n/index.ts");
      return langCommand(args);
    },
  },
  auto: {
    name: "auto",
    description: "Start/stop auto-improvement daemon: /auto [start|stop|status]",
    execute: async (args) => {
      const { startAutoDaemon, stopAutoDaemon, getAutoDaemonStatus, isAutoDaemonRunning } = await import("/app/agent-harness/auto-daemon.ts");
      const action = args.trim().toLowerCase();

      if (!action || action === "status") {
        const status = getAutoDaemonStatus();
        return {
          content: `Auto daemon: ${status.running ? "RUNNING" : "stopped"} | PID: ${status.pid ?? "n/a"} | Last log: ${status.lastKnownLog}`,
        };
      }

      if (action === "start") {
        const current = getAutoDaemonStatus();
        if (current.running) {
          return { content: `[auto-daemon] Already running (PID ${current.pid})` };
        }
        const msg = startAutoDaemon();
        return { content: msg };
      }

      if (action === "stop") {
        const msg = stopAutoDaemon();
        return { content: msg };
      }

      return { error: "Usage: /auto [start|stop|status]" };
    },
  },
};

// Custom/user commands registry
const customCommands: Map<string, Command> = new Map();

/**
 * Register a new command
 */
export function registerCommand(command: Command): void {
  customCommands.set(command.name, command);
}

/**
 * Unregister a command
 */
export function unregisterCommand(name: string): boolean {
  return customCommands.delete(name);
}

/**
 * Get all registered commands (built-in + custom)
 */
export function getCommands(): Command[] {
  return Object.values(builtInCommands).concat([...customCommands.values()]);
}

/**
 * Find a command by name
 */
export function findCommand(name: string): Command | undefined {
  return builtInCommands[name] || customCommands.get(name);
}

/**
 * Parse and execute a slash command
 */
export async function parseAndExecute(
  input: string,
  context: CommandContext
): Promise<CommandResult> {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) {
    return { handled: false };
  }

  const parts = trimmed.slice(1).split(/\s+/);
  const commandName = parts[0].toLowerCase();
  const args = parts.slice(1).join(" ");

  const command = findCommand(commandName);
  if (!command) {
    return { error: `Unknown command: /${commandName}` };
  }

  return command.execute(args, context);
}

/**
 * Check if input is a slash command
 */
export function isSlashCommand(input: string): boolean {
  return input.trim().startsWith("/");
}

/**
 * List all commands as formatted string
 */
export function listCommands(): string {
  const commands = getCommands();
  return commands
    .filter((c) => !c.hidden)
    .map((c) => `  /${c.name}   ${c.description}`)
    .join("\n");
}
