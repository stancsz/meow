/**
 * tui.ts - TUI Sidecar for Meow CLI
 *
 * Rich terminal UI primitives.
 */
const ESC = "\u001b";

export const C = {
  reset:         ESC + "[0m",
  bold:          ESC + "[1m",
  dim:           ESC + "[2m",
  red:           ESC + "[31m",
  green:         ESC + "[32m",
  yellow:        ESC + "[33m",
  blue:          ESC + "[34m",
  magenta:       ESC + "[35m",
  cyan:          ESC + "[36m",
  white:         ESC + "[37m",
  brightBlack:   ESC + "[90m",
  brightRed:     ESC + "[91m",
  brightGreen:   ESC + "[92m",
  brightYellow:  ESC + "[93m",
  brightBlue:    ESC + "[94m",
  brightMagenta: ESC + "[95m",
  brightCyan:    ESC + "[96m",
  brightWhite:   ESC + "[97m",
  clearLine:     ESC + "[2K",
  cursorShow:    ESC + "[?25h",
  cursorHide:    ESC + "[?25l",
};

export interface TUIOptions {
  mode?: "full" | "compact" | "minimal";
  showTimestamps?: boolean;
  maxWidth?: number;
  colors?: {
    userBg?: string; assistantBg?: string; toolColor?: string;
    errorColor?: string; successColor?: string; infoColor?: string; warnColor?: string;
  };
  spinnerFrames?: string[];
}

export interface TUI {
  clear(): void;
  printHeader(): void;
  printUser(text: string): void;
  printAssistant(text: string, opts?: { streaming?: boolean }): void;
  printToolCall(tool: string, args: string): void;
  printToolResult(result: string): void;
  printError(text: string): void;
  printSuccess(text: string): void;
  printInfo(text: string): void;
  printWarning(text: string): void;
  startThinking(msg?: string): void;
  stopThinking(finalMsg?: string): void;
  updateStatus(msg: string): void;
  printSeparator(label?: string): void;
  startStream(): void;
  appendStream(text: string): void;
  endStream(): void;
  destroy(): void;
}

const DEFAULT_SPINNER = [
  "⠋","⠙","⠹","⠸","⠼",
  "⠴","⠦","⠷","⠇","⠏"
];

function write(s: string): void { process.stdout.write(s); }
function eraseLine(): void { write(C.clearLine + "\r"); }

function ts(enabled: boolean): string {
  if (!enabled) return "";
  return C.dim + new Date().toLocaleTimeString("en-US",{hour12:false}) + " " + C.reset;
}

function wrap(text: string, w: number): string[] {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    if (para.length <= w) { lines.push(para || " "); continue; }
    const words = para.split(" "); let line = "";
    for (const word of words) {
      if (line === "") { line = word; }
      else if ((line + " " + word).length > w) { lines.push(line.trimEnd()); line = word; }
      else { line += " " + word; }
    }
    if (line.trim()) lines.push(line.trimEnd());
  }
  return lines;
}

function usableWidth(maxWidth: number): number {
  const cols = (process.stdout as NodeJS.WriteStream & {columns?: number}).columns;
  return (cols && cols > 0) ? Math.min(maxWidth, cols) : maxWidth;
}

function bubble(
  text: string,
  role: "user"|"assistant",
  userBg: string,
  asstBg: string,
  showTs: boolean
): void {
  const label = role === "user" ? "You" : "Meow";
  const bg = role === "user" ? userBg : asstBg;
  const iw = usableWidth(80);
  write("\n" + ts(showTs) + C.bold + "  " + label + C.reset + " " + C.dim + "(just now)" + C.reset + "\n");
  write("  " + bg + " " + C.reset + " ".repeat(iw) + bg + " " + C.reset + "\n");
  for (const l of wrap(text, iw - 4))
    write("  " + bg + " " + C.white + l.padEnd(iw - 4) + C.reset + bg + " " + C.reset + "\n");
  write("  " + bg + " " + C.reset + " ".repeat(iw) + bg + " " + C.reset + "\n");
}

function line(text: string, prefix: string, maxWidth: number, showTs: boolean): void {
  const iw = usableWidth(maxWidth - prefix.length - 2);
  for (const l of wrap(text, iw)) write(ts(showTs) + prefix + l + "\n");
}

export function createTUI(opts: TUIOptions = {}): TUI {
  const { mode = "compact", showTimestamps = false, maxWidth = 80 } = opts;
  const {
    userBg = C.brightBlue, assistantBg = C.brightBlack, toolColor = C.brightCyan,
    errorColor = C.red, successColor = C.green, infoColor = C.cyan, warnColor = C.yellow,
  } = opts.colors || {};
  const frames = opts.spinnerFrames ?? DEFAULT_SPINNER;

  let thinkingInterval: ReturnType<typeof setInterval> | null = null;
  let thinkingFrame = 0;
  let isThinking = false;
  let thinkingMsg = "";
  let streamActive = false;

  return {

    clear() {
      if (mode === "minimal") return;
      write(ESC + "[2J" + ESC + "[H");
      this.printHeader();
    },

    printHeader() {
      if (mode === "minimal") return;
      const art = [
        C.brightMagenta + "    /" + C.reset + "\\" + C.brightMagenta + "____/\\" + C.reset + "\\" + C.brightMagenta + "/",
        C.brightMagenta + "   /  o   o  " + C.reset + "\\" + C.brightMagenta + "/",
        C.brightMagenta + "  ( ==  ^  == )   " + C.brightWhite + "Meow" + C.reset + " " + C.dim + "lean sovereign agent",
        C.brightMagenta + "   " + C.reset + "\\" + C.brightMagenta + " )" + C.reset + "-" + C.brightMagenta + "( /",
        C.brightMagenta + "    " + C.reset + "\\" + C.dim + "`" + C.reset + "_" + C.brightMagenta + "`" + C.reset + C.dim + " /" + C.reset,
      ];
      for (const row of art) write(row + "\n");
      write("\n");
    },

    printUser(text) {
      if (mode === "minimal") return;
      bubble(text, "user", userBg, assistantBg, showTimestamps);
    },

    printAssistant(text, opts2 = {}) {
      if (opts2.streaming) { write(text); return; }
      bubble(text, "assistant", userBg, assistantBg, showTimestamps);
    },

    printToolCall(tool, args) {
      write("\n" + ts(showTimestamps) + "  " + C.dim + "[" + toolColor + tool + C.reset + C.dim + "]" + C.reset + " " + C.brightBlack + args.slice(0, maxWidth - 30) + C.dim + C.reset + "\n");
    },

    printToolResult(result) { line(result.slice(0, 500), C.green + "  --> " + C.reset, maxWidth, showTimestamps); },
    printError(text)         { line(text, errorColor + "  X " + C.reset, maxWidth, showTimestamps); },
    printSuccess(text)       { line(text, successColor + "  OK " + C.reset, maxWidth, showTimestamps); },
    printInfo(text)          { line(text, infoColor + "  i " + C.reset, maxWidth, showTimestamps); },
    printWarning(text)       { line(text, warnColor + "  ! " + C.reset, maxWidth, showTimestamps); },

    startThinking(msg = "thinking...") {
      if (isThinking) return;
      isThinking = true; thinkingMsg = msg; thinkingFrame = 0;
      thinkingInterval = setInterval(() => {
        eraseLine();
        write("  " + frames[thinkingFrame % frames.length] + " " + C.dim + thinkingMsg + C.reset + "\r");
        thinkingFrame++;
      }, 80);
    },

    stopThinking(finalMsg) {
      if (!isThinking) return;
      if (thinkingInterval) { clearInterval(thinkingInterval); thinkingInterval = null; }
      isThinking = false; eraseLine();
      if (finalMsg) write("  " + C.green + "OK" + C.reset + " " + finalMsg + "\n");
    },

    updateStatus(msg) {
      if (mode === "minimal") return;
      eraseLine(); write(C.dim + msg + C.reset + "\r");
    },

    printSeparator(label) {
      const w = usableWidth(maxWidth);
      if (label) {
        write("\n  " + C.dim + "--" + C.reset + " " + label + " " + C.dim + "-".repeat(Math.max(0, w - label.length - 4)) + C.reset + "\n");
      } else {
        write("\n  " + C.dim + "---" + C.reset + "\n");
      }
    },

    startStream()  { streamActive = true; write("\n"); },
    appendStream(text) { if (!streamActive) { write(text); return; } write(text); },
    endStream()    { streamActive = false; write("\n"); },

    destroy() {
      if (thinkingInterval) { clearInterval(thinkingInterval); thinkingInterval = null; }
      isThinking = false; write(C.cursorShow);
    },

  };
}
