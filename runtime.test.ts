import { beforeEach, describe, expect, test } from "bun:test";
import {
  createAgentDispatcher,
  type AgentLoopRunner,
  type RuntimeDispatchEvent,
} from "./src/core/dispatcher.ts";
import { extensionRegistry, type Extension } from "./src/core/extensions.ts";
import { resolveRuntimeMode } from "./src/core/runtime.ts";
import { enforceSecurityLocks } from "./src/security/triple_lock.ts";

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });
  return { promise, resolve, reject };
}

describe("dispatcher behavior", () => {
  test("serializes work within one scope", async () => {
    const started: string[] = [];
    const firstGate = createDeferred<void>();
    const runner: AgentLoopRunner = async (prompt) => {
      started.push(prompt);
      if (prompt === "first") {
        await firstGate.promise;
      }
      return { content: `done:${prompt}`, iterations: 1, messages: [], completed: true };
    };

    const dispatcher = createAgentDispatcher({ runAgentLoop: runner });

    const firstPromise = dispatcher.submit({
      source: "test",
      scope: "scope:a",
      prompt: "first",
    });

    const secondPromise = dispatcher.submit({
      source: "test",
      scope: "scope:a",
      prompt: "second",
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(started).toEqual(["first"]);

    firstGate.resolve();
    const [firstResult, secondResult] = await Promise.all([firstPromise, secondPromise]);

    expect(started).toEqual(["first", "second"]);
    expect(firstResult.content).toBe("done:first");
    expect(secondResult.content).toBe("done:second");
  });

  test("cancels queued work before execution and emits cancellation", async () => {
    const started: string[] = [];
    const events: RuntimeDispatchEvent[] = [];
    const firstGate = createDeferred<void>();
    const runner: AgentLoopRunner = async (prompt) => {
      started.push(prompt);
      if (prompt === "first") {
        await firstGate.promise;
      }
      return { content: `done:${prompt}`, iterations: 1, messages: [], completed: true };
    };

    const dispatcher = createAgentDispatcher({ runAgentLoop: runner });

    const firstPromise = dispatcher.submit({
      source: "test",
      scope: "scope:a",
      prompt: "first",
      onEvent: (event) => events.push(event),
    });

    const secondPromise = dispatcher.submit({
      source: "test",
      scope: "scope:a",
      prompt: "second",
      onEvent: (event) => events.push(event),
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    const queuedTask = dispatcher
      .getTaskSnapshots()
      .find((task) => task.prompt === "second" && task.status === "queued");

    expect(queuedTask).toBeDefined();
    expect(dispatcher.cancelTask(queuedTask!.id)).toBe(true);

    firstGate.resolve();
    const cancelled = await secondPromise;
    await firstPromise;

    expect(cancelled.completed).toBe(false);
    expect(cancelled.iterations).toBe(0);
    expect(started).toEqual(["first"]);
    expect(
      events.some(
        (event) =>
          event.type === "taskCancelled" &&
          event.taskId === queuedTask!.id &&
          event.reason === "cancelled before execution",
      ),
    ).toBe(true);
  });
});

describe("runtime defaults", () => {
  const originalArgv = [...process.argv];
  const originalEnv = process.env.SIMPLECLAW_RUNTIME_MODE;

  beforeEach(() => {
    process.argv = [...originalArgv];
    if (originalEnv === undefined) {
      delete process.env.SIMPLECLAW_RUNTIME_MODE;
    } else {
      process.env.SIMPLECLAW_RUNTIME_MODE = originalEnv;
    }
  });

  test("defaults to cli mode", () => {
    process.argv = ["bun", "src/index.ts"];
    delete process.env.SIMPLECLAW_RUNTIME_MODE;

    expect(resolveRuntimeMode()).toBe("cli");
  });
});

describe("security locks", () => {
  test("requires x-agent-id header", async () => {
    const request = new Request("http://localhost/discord", { method: "POST" });
    const response = enforceSecurityLocks(request);

    expect(response).not.toBeNull();
    expect(response?.status).toBe(403);
    expect(await response?.text()).toContain("Missing x-agent-id");
  });
});

describe("extension registry", () => {
  test("finds a registered webhook by route", () => {
    const extension: Extension = {
      name: `test-webhook-${Date.now()}-${Math.random()}`,
      type: "webhook",
      route: "/test-runtime-route",
      runtimeModes: ["server"],
      execute: async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    };

    extensionRegistry.register(extension);
    expect(extensionRegistry.findWebhook("/test-runtime-route")?.name).toBe(extension.name);
  });
});
