/**
 * tui.ts - TUI Sidecar for Meow CLI
 *
 * Rich terminal UI primitives.
 */
const ESC = String.fromCharCode(27);

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
  mode?: 'full' | 'compact' | 'minimal';
  showTimestamps?: boolean;
  maxWidth?: number;
  showStatusBar?: boolean;
  colors?: {
    userBg?: string; assistantBg?: string; toolColor?: string;
    errorColor?: string; successColor?: string; infoColor?: string; warnColor?: string;
  };
  spinnerFrames?: string[];
}

export interface StatusInfo {
  mode?: string; branch?: string; session?: string; tokens?: number; dangerous?: boolean;
}

export interface TUI {
  clear(): void;
  printHeader(): void;
  printUser(): void;
  printAssistant(): void;
  printToolCall(): void;
  printToolResult(): void;
  printError(): void;
  printSuccess(): void;
  printInfo(): void;
  printWarning(): void;
  startThinking(): void;
  stopThinking(): void;
  updateStatus(): void;
  setStatus(): void;
  printStatusBar(): void;
  printSeparator(): void;
  startStream(): void;
  appendStream(): void;
  endStream(): void;
  destroy(): void;
}

const DEFAULT_SPINNER = [
  "⠋","⠙","⠹","⠸","⠼",
  "⠴","⠦","⠷","⠇","⠏"
 ];

function write(s: string): void { process.stdout.write(s); }
function eraseLine(): void { write(C.clearLine + String.fromCharCode(13)); }

function ts(enabled: boolean): string {
  if (!enabled) return '';
  return C.dim + new Date().toLocaleTimeString('en-US',{hour12:false}) + ' ' + C.reset;
}

function wrap(text: string, w: number): string[] {
  const lines: string[] = [];
  for (const para of text.split(String.fromCharCode(10))) {
    if (para.length <= w) { lines.push(para || ' '); continue; }
    const words = para.split(' '); let line = '';
    for (const word of words) {
      if (line === '') { line = word; }
      else if ((line + ' ' + word).length > w) { lines.push(line.trimEnd()); line = word; }
      else { line += ' ' + word; }
    }
    if (line.trim()) lines.push(line.trimEnd());
  }
  return lines;
}

function usableWidth(maxWidth: number): number {
  const cols = (process.stdout as NodeJS.WriteStream & {columns?: number}).columns;
  return (cols && cols > 0) ? Math.min(maxWidth, cols) : maxWidth;
}

function bubble(text:string,role:"user"|"assistant",userBg:string,asstBg:string,showTs:boolean):void{
  const label=role==="user"?"You":"Meow";const bg=role==="user"?userBg:asstBg;
  const iw=usableWidth(80);
  write(String.fromCharCode(10)+ts(showTs)+C.bold+"  "+label+C.reset+" "+C.dim+"(just now)"+C.reset+String.fromCharCode(10));
  write("  "+bg+" "+C.reset+" ".repeat(iw)+bg+" "+C.reset+String.fromCharCode(10));
  for(const l of wrap(text,iw-4))write("  "+bg+" "+C.white+l.padEnd(iw-4)+C.reset+bg+" "+C.reset+String.fromCharCode(10));
  write("  "+bg+" "+C.reset+" ".repeat(iw)+bg+" "+C.reset+String.fromCharCode(10));
}

function line(text:string,prefix:string,maxWidth:number,showTs:boolean):void{
  const iw=usableWidth(maxWidth-prefix.length-2);
  for(const l of wrap(text,iw))write(ts(showTs)+prefix+l+String.fromCharCode(10));
}

export function createTUI(opts: TUIOptions = {}): TUI {
  const { mode = 'compact', showTimestamps = false, maxWidth = 80, showStatusBar = false } = opts;
  const colors = opts.colors || {};
  const userBg = colors.userBg || C.brightBlue;
  const asstBg = colors.assistantBg || C.brightBlack;
  const toolColor = colors.toolColor || C.brightCyan;
  const errorColor = colors.errorColor || C.red;
  const successColor = colors.successColor || C.green;
  const infoColor = colors.infoColor || C.cyan;
  const warnColor = colors.warnColor || C.yellow;
  const spinner = opts.spinnerFrames || DEFAULT_SPINNER;
  let ti: ReturnType<typeof setInterval> | null = null;
  let tf = 0; let ith = false; let tmsg = '';
  let statusInfo: StatusInfo = {};

  return {
    printHeader() {
      write(String.fromCharCode(10));
      write(C.brightMagenta+"    /"+C.reset+String.fromCharCode(92)+C.brightMagenta+"____/"+String.fromCharCode(92)+C.reset+String.fromCharCode(92)+C.brightMagenta+"/");
      write(C.brightMagenta+"   /  o   o  "+C.reset+String.fromCharCode(92)+C.brightMagenta+"/");
      write(C.brightMagenta+"  ( ==  ^  == )   "+C.brightWhite+"Meow"+C.reset+" "+C.dim+"lean sovereign agent");
      write("   "+String.fromCharCode(92)+C.brightMagenta+" )"+C.reset+"-"+C.brightMagenta+"( /");
      write(C.brightMagenta+"    "+C.reset+String.fromCharCode(92)+C.dim+String.fromCharCode(96)+"_____"+"\""+"_____"+String.fromCharCode(96)+" "+C.reset+C.dim+" /"+C.reset+",");
      write(C.brightBlack+"      / "+C.reset+String.fromCharCode(92)+String.fromCharCode(92)+C.brightMagenta+"===  === "+C.brightBlack+String.fromCharCode(92)+C.brightMagenta+"~~"+C.reset+String.fromCharCode(92));
      write(C.brightBlack+"       "+C.reset+"  Meow  "+C.brightBlack+String.fromCharCode(92));
      write(C.brightBlack+"     "+C.reset+"/  _/"+C.reset+"/ "+C.reset+String.fromCharCode(92)+String.fromCharCode(92)+String.fromCharCode(92)+C.brightBlack+String.fromCharCode(92)+C.brightMagenta+"====="+C.brightBlack+String.fromCharCode(92)+C.brightMagenta+"~~"+C.reset+String.fromCharCode(92));
      write(C.brightBlack+"    ( o.o )"+C.brightMagenta+"~~~~~"+C.brightBlack+">"+C.brightMagenta+"~~~"+C.reset+">");
      write(String.fromCharCode(10));
    },
    printUser(text: string): void { bubble(text, "user", userBg, asstBg, showTimestamps); },
    printAssistant(text: string, opts?: { streaming?: boolean }): void {
      if (opts?.streaming) { write(text); return; }
      bubble(text, "assistant", userBg, asstBg, showTimestamps);
    },
    printToolCall(tool: string, args: string): void {
      const short = args.length > 80 ? args.slice(0, 80) + "..." : args;
      write(String.fromCharCode(10) + ts(showTimestamps) + C.dim + "  [" + toolColor + tool + C.reset + C.dim + "]" + C.brightBlack + short + C.dim + C.reset + String.fromCharCode(10));
    },
    printToolResult(result: string): void {
      const short = result.length > 300 ? result.slice(0, 300) + "..." : result;
      line(short, C.green + "  --> " + C.reset, maxWidth, showTimestamps);
    },
    printError(text: string): void { line(text, errorColor + "  X " + C.reset, maxWidth, showTimestamps); },
    printSuccess(text: string): void { line(text, successColor + "  OK " + C.reset, maxWidth, showTimestamps); },
    printInfo(text: string): void { line(text, infoColor + "  i " + C.reset, maxWidth, showTimestamps); },
    printWarning(text: string): void { line(text, warnColor + "  ! " + C.reset, maxWidth, showTimestamps); },
    startThinking(msg?: string): void {
      ith = true; tmsg = msg || "thinking"; tf = 0;
      write(String.fromCharCode(10) + C.dim + tmsg + " ");
      ti = setInterval(() => { write(String.fromCharCode(8)+String.fromCharCode(48)+spinner[tf % spinner.length]); tf++; }, 120);
    },
    stopThinking(finalMsg?: string): void {
      if (ti) { clearInterval(ti); ti = null; }
      if (ith) { write(String.fromCharCode(8)+String.fromCharCode(8)+String.fromCharCode(8)+"  " + (finalMsg || "done") + String.fromCharCode(10)); }
      ith = false;
    },
    updateStatus(tokens?: number): void {
      if (tokens !== undefined) { eraseLine(); write(C.dim + "tokens: " + tokens + "   " + C.reset); }
    },
    setStatus(info: StatusInfo): void { statusInfo = { ...statusInfo, ...info }; },
    printStatusBar(): void {
      const parts: string[] = [];
      if (statusInfo.mode) parts.push("mode: " + statusInfo.mode);
      if (statusInfo.branch) parts.push("branch: " + statusInfo.branch);
      if (statusInfo.session) parts.push("session: " + statusInfo.session.slice(0,8));
      if (statusInfo.tokens) parts.push("tokens: " + statusInfo.tokens);
      if (statusInfo.dangerous) parts.push(C.red + " DANGEROUS " + C.reset);
      if (parts.length === 0) return;
      const bar = parts.join(" | ");
      const cols = (process.stdout as NodeJS.WriteStream & {columns?: number}).columns || 80;
      write(C.dim + bar.padEnd(cols) + C.reset + String.fromCharCode(13));
    },
    printSeparator(label?: string): void {
      const sep = label ? "  " + C.bold + label + C.reset + "  " + String.fromCharCode(126).repeat(Math.max(0, cols - label.length - 4)) : String.fromCharCode(126).repeat(cols - 4);
      write(String.fromCharCode(10) + C.dim + sep + C.reset + String.fromCharCode(10));
    },
    clear(): void { if (mode !== "minimal") { write(String.fromCharCode(27)+"[2J"+String.fromCharCode(27)+"[H"); this.printHeader(); } },
    startStream(): void { write(C.cursorHide); },
    appendStream(text: string): void { write(text); },
    endStream(): void { write(String.fromCharCode(10)); },
    destroy(): void {
      eraseLine();
      write(C.cursorShow + C.reset);
    },
  };
}
