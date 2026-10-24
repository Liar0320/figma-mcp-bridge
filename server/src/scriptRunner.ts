import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, lstat, realpath } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import type { Node } from "./node.js";
import type { BridgeResponse } from "./types.js";

const SCRIPT_ROOT = path.resolve(process.cwd(), "artifacts", "scripts");
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 120_000;
const SCRIPT_EXTENSION = /\.(?:mjs|js)$/i;

export type ScriptInput = {
  filePath?: string;
  input?: string;
  fileKey?: string;
  timeoutMs?: number;
};

type SourceLocation = {
  file: string;
  line?: number;
  column?: number;
};

export type ScriptEvent = {
  index: number;
  tool: string;
  status: "started" | "succeeded" | "failed";
  source?: SourceLocation;
  params?: unknown;
  result?: unknown;
  error?: {
    code?: string;
    message: string;
    requestId?: string;
  };
};

export type ScriptRunReport = {
  ok: boolean;
  runId: string;
  filePath: string;
  events: ScriptEvent[];
  result?: unknown;
  error?: {
    code: string;
    message: string;
    phase: "input" | "load" | "runtime" | "timeout";
    source?: SourceLocation;
    tool?: string;
    requestId?: string;
    stack?: string;
  };
};

type ScriptSdk = {
  createFrame(params: Record<string, unknown>): Promise<unknown>;
  createText(params: Record<string, unknown>): Promise<unknown>;
  createRectangle(params: Record<string, unknown>): Promise<unknown>;
  setPosition(nodeId: string, params: Record<string, unknown>): Promise<unknown>;
  setSize(nodeId: string, params: Record<string, unknown>): Promise<unknown>;
  setFills(nodeId: string, params: Record<string, unknown>): Promise<unknown>;
  setTextContent(nodeId: string, params: Record<string, unknown>): Promise<unknown>;
  setLayoutMode(nodeId: string, params: Record<string, unknown>): Promise<unknown>;
  findNodes(params: Record<string, unknown>): Promise<unknown>;
  batch(params: Record<string, unknown>): Promise<unknown>;
};

class BridgeScriptError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly requestId?: string,
    readonly tool?: string,
  ) {
    super(message);
    this.name = "BridgeScriptError";
  }
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

async function rejectSymlinkComponents(root: string, candidate: string): Promise<void> {
  const relative = path.relative(root, candidate);
  const parts = relative ? relative.split(path.sep) : [];
  let current = root;
  for (const part of parts) {
    current = path.join(current, part);
    try {
      const stat = await lstat(current);
      if (stat.isSymbolicLink()) throw new Error("Script path must not contain symbolic links");
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
      if (code !== "ENOENT") throw error;
      break;
    }
  }
}

export async function resolveScriptPath(filePath: string | undefined, runId = "preview"): Promise<string> {
  const relativePath = filePath ?? `run-${runId}.mjs`;
  if (path.isAbsolute(relativePath)) throw new Error("filePath must be relative to the script artifact directory");
  if (!SCRIPT_EXTENSION.test(relativePath)) throw new Error("filePath must end with .mjs or .js");

  await mkdir(SCRIPT_ROOT, { recursive: true });
  const root = await realpath(SCRIPT_ROOT);
  const resolved = path.resolve(root, relativePath);
  if (!isInside(root, resolved)) throw new Error("filePath must remain inside the script artifact directory");
  await rejectSymlinkComponents(root, resolved);
  const parent = path.dirname(resolved);
  await mkdir(parent, { recursive: true });
  if (!isInside(root, await realpath(parent))) throw new Error("filePath parent must remain inside the script artifact directory");
  return resolved;
}

function sourceLocation(stack: string | undefined, filename: string): SourceLocation | undefined {
  if (!stack) return undefined;
  const escaped = filename.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = stack.match(new RegExp(`${escaped}:(\\d+):(\\d+)`));
  if (!match) return undefined;
  return {
    file: filename,
    line: Math.max(1, Number(match[1]) - 1),
    column: Number(match[2]),
  };
}

function errorDetails(error: unknown): { code?: string; message: string; requestId?: string; tool?: string; stack?: string } {
  if (error instanceof BridgeScriptError) return { code: error.code, message: error.message, requestId: error.requestId, tool: error.tool, stack: error.stack };
  if (error instanceof Error) return { message: error.message, stack: error.stack };
  return { message: String(error) };
}

function normalizeResponse(tool: string, response: BridgeResponse): unknown {
  if (response.error) {
    throw new BridgeScriptError(response.error, "BRIDGE_ERROR", response.requestId, tool);
  }
  return response.data;
}

function createSdk(
  node: Node,
  fileKey: string | undefined,
  filename: string,
  events: ScriptEvent[],
): ScriptSdk {
  let index = 0;
  const call = async (tool: string, params: Record<string, unknown>, nodeIds?: string[]): Promise<unknown> => {
    const location = sourceLocation(new Error().stack, filename);
    const event: ScriptEvent = { index: index++, tool, status: "started", source: location, params };
    events.push(event);
    try {
      const response = await node.sendWithParams(tool, nodeIds, params, fileKey);
      const result = normalizeResponse(tool, response);
      event.status = "succeeded";
      event.result = result;
      return result;
    } catch (error) {
      const details = errorDetails(error);
      event.status = "failed";
      event.error = { code: details.code, message: details.message, requestId: details.requestId };
      throw error;
    }
  };

  return {
    createFrame: (params) => call("create_frame", params),
    createText: (params) => call("create_text", params),
    createRectangle: (params) => call("create_rectangle", params),
    setPosition: (nodeId, params) => call("set_position", params, [nodeId]),
    setSize: (nodeId, params) => call("set_size", params, [nodeId]),
    setFills: (nodeId, params) => call("set_fills", params, [nodeId]),
    setTextContent: (nodeId, params) => call("set_text_content", params, [nodeId]),
    setLayoutMode: (nodeId, params) => call("set_layout_mode", params, [nodeId]),
    findNodes: (params) => call("find_nodes", params),
    batch: (params) => call("batch_mutation", params),
  };
}
function clampTimeout(timeoutMs: number | undefined): number {
  return Math.min(MAX_TIMEOUT_MS, Math.max(1, timeoutMs ?? DEFAULT_TIMEOUT_MS));
}

export async function executeScript(node: Node, input: ScriptInput): Promise<ScriptRunReport> {
  const runId = randomUUID();
  const events: ScriptEvent[] = [];
  const requestedPath = input.filePath ?? `run-${runId}.mjs`;
  let filename = requestedPath;
  try {
    if (!input.filePath && input.input === undefined) throw new Error("Either input or filePath is required");
    if (input.input !== undefined && input.input.length === 0) throw new Error("input must not be empty");
    const resolvedPath = await resolveScriptPath(input.filePath, runId);
    filename = resolvedPath;
    if (input.input !== undefined) await writeFile(resolvedPath, input.input, { encoding: "utf8", flag: "w" });
    const source = input.input ?? await readFile(resolvedPath, "utf8");
    const context = vm.createContext({
      console: {
        log: (...args: unknown[]) => console.log(`[script:${runId}]`, ...args),
        error: (...args: unknown[]) => console.error(`[script:${runId}]`, ...args),
      },
      figma: createSdk(node, input.fileKey, resolvedPath, events),
    });
    const wrapped = `(async () => {\n${source}\n})()`;
    const script = new vm.Script(wrapped, { filename: resolvedPath });
    const execution = script.runInContext(context, { timeout: clampTimeout(input.timeoutMs) }) as Promise<unknown>;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new BridgeScriptError("Script execution timed out", "SCRIPT_TIMEOUT")), clampTimeout(input.timeoutMs));
    });
    try {
      const result = await Promise.race([execution, timeout]);
      clearTimeout(timer);
      return { ok: true, runId, filePath: resolvedPath, events, result };
    } catch (error) {
      clearTimeout(timer);
      throw error;
    }
  } catch (error) {
    const details = errorDetails(error);
    const phase = details.code === "SCRIPT_TIMEOUT" ? "timeout" : filename === requestedPath ? "input" : "runtime";
    return {
      ok: false,
      runId,
      filePath: filename,
      events,
      error: {
        code: details.code ?? "SCRIPT_ERROR",
        message: details.message,
        phase,
        source: sourceLocation(details.stack, filename),
        tool: details.tool,
        requestId: details.requestId,
        stack: details.stack,
      },
    };
  }
}

export { SCRIPT_ROOT };
