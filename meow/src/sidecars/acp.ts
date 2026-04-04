/// <reference types="node" />
/**
 * acp.ts - ACP (Agent Client Protocol) sidecar for Meow
 *
 * Implements JSON-RPC 2.0 over stdio.
 * Methods: initialize, newSession, loadSession, prompt, cancel
 */
async function handlePrompt(params: Record<string, unknown>, id: number | string | null): Promise<JSONRPCResponse> {
  if (!acpState.initialized) {
    return makeError(id, ERR_INVALID_REQUEST, "Not initialized. Call initialize first.");
  }

  const prompt = params.prompt as string;
  if (!prompt) {
    return makeError(id, ERR_INVALID_REQUEST, "prompt is required");
  }

  if (!acpState.currentSession) {
    acpState.currentSession = {
      id: createSessionId(),
      messages: [],
      dangerous: acpState.dangerous,
    };
  }

  const session = acpState.currentSession;
  const dangerous = Boolean(params.dangerous ?? session.dangerous);

  const agentMessages = session.messages.map((m) => ({
    role: m.role as "user" | "assistant" | "system",
    content: m.content,
  }));

  const agentOptions: LeanAgentOptions = {
    dangerous,
    messages: agentMessages,
  };

  acpState.abortController = new AbortController();
  agentOptions.abortSignal = acpState.abortController.signal;

  let result: AgentResult;
  try {
    result = await runLeanAgent(prompt, agentOptions);
  } catch (e: unknown) {
    acpState.abortController = null;
    const msg = e instanceof Error ? e.message : String(e);
    return makeError(id, ERR_INTERNAL_ERROR, "Agent error: " + msg);
  }

  acpState.abortController = null;

  session.messages.push({ role: "user", content: prompt });
  session.messages.push({ role: "assistant", content: result.content });

  return makeResponse(id, {
    content: result.content,
    iterations: result.iterations,
    completed: result.completed,
    sessionId: session.id,
    usage: result.usage,
  });
}

async function handleCancel(_params: Record<string, unknown>, id: number | string | null): Promise<JSONRPCResponse> {
  if (!acpState.initialized) {
    return makeError(id, ERR_INVALID_REQUEST, "Not initialized. Call initialize first.");
  }

  if (acpState.abortController) {
    acpState.abortController.abort();
    acpState.abortController = null;
    return makeResponse(id, { cancelled: true });
  }

  return makeResponse(id, { cancelled: false, reason: "No operation in progress" });
}
async function handleMessage(req: JSONRPCRequest): Promise<JSONRPCResponse> {
  if (req.jsonrpc !== "2.0") {
    return makeError(req.id, ERR_INVALID_REQUEST, "Invalid jsonrpc version: " + req.jsonrpc);
  }

  if (typeof req.method !== "string" || !req.method) {
    return makeError(req.id, ERR_INVALID_REQUEST, "method must be a non-empty string");
  }

  const params = req.params || {};

  switch (req.method) {
    case "initialize":
      return await handleInitialize(params, req.id);
    case "newSession":
      return await handleNewSession(params, req.id);
    case "loadSession":
      return await handleLoadSession(params, req.id);
    case "prompt":
      return await handlePrompt(params, req.id);
    case "cancel":
      return await handleCancel(params, req.id);
    default:
      return makeError(req.id, ERR_METHOD_NOT_FOUND, "Method not found: " + req.method);
  }
}

function readLines(cb: (line: string) => void): void {
  let leftover = "";

  process.stdin.setEncoding("utf-8");

  process.stdin.on("data", (chunk: string) => {
    leftover += chunk;
    const lines = leftover.split(/?
/);
    leftover = lines.pop() || "";
    for (const line of lines) {
      if (line.trim()) cb(line.trim());
    }
  });

  process.stdin.on("end", () => {
    if (leftover.trim()) cb(leftover.trim());
  });
}

export async function startACPServer(): Promise<void> {
  function send(r: JSONRPCResponse) {
    process.stdout.write(JSON.stringify(r) + "
");
  }

  readLines(async (line) => {
    let req: JSONRPCRequest;
    try {
      req = JSON.parse(line);
    } catch {
      send(makeError(null, ERR_PARSE_ERROR, "Invalid JSON"));
      return;
    }

    try {
      const response = await handleMessage(req);
      send(response);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      send(makeError(req.id, ERR_INTERNAL_ERROR, "Internal error: " + msg));
    }
  });
}
