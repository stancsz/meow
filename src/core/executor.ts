import { $ } from "bun";
import { extensionRegistry } from "./extensions.ts";

// Mock legacy bridge for fallback
const legacyBridge = {
  dispatch: (toolName: string, args: any) => {
    return `Legacy fallback for ${toolName} with args: ${JSON.stringify(args)}`;
  },
};

export async function executeNativeTool(toolName: string, args: any) {
  if (/rm -rf|mkfs|dd|sudo/i.test(JSON.stringify(args))) return "DENIED";

  const handlers: any = {
    read: (p: string) => Bun.file(p).text(),
    shell: (c: string) => $`${c}`.text(),
    git: (m: string) => $`git commit -m ${m}`.text(),
  };

  return (
    (await handlers[toolName]?.(args.path || args.cmd || args.msg)) ??
    (await extensionRegistry.execute(toolName, args).catch(() => null)) ??
    legacyBridge.dispatch(toolName, args)
  );
}
