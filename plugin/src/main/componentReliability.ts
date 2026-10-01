/** Reliability primitives shared by component inventory and acceptance harnesses. */
export type ComponentErrorCode =
  | "COMPONENT_NOT_FOUND"
  | "INVALID_COMPONENT"
  | "COMPONENT_SET_EMPTY"
  | "VARIANT_NOT_FOUND"
  | "DUPLICATE_COMPONENT"
  | "CORRUPTED_COMPONENT"
  | "PAGE_LOAD_FAILED"
  | "TRAVERSAL_FAILED"
  | "SERIALIZATION_FAILED"
  | "CHUNK_CURSOR_INVALID"
  | "RECOVERY_UNSUPPORTED";

export type ComponentError = {
  code: ComponentErrorCode;
  message: string;
  retryable: boolean;
  details?: unknown;
};

export const componentError = (
  code: ComponentErrorCode,
  message: string,
  details?: unknown,
): ComponentError & Error => {
  const error = new Error(message) as ComponentError & Error;
  error.name = code;
  error.code = code;
  error.details = details;
  error.retryable = ["PAGE_LOAD_FAILED", "TRAVERSAL_FAILED"].includes(code);
  return error;
};

export function serializeComponentError(error: unknown): string {
  if (error && typeof error === "object" && "code" in error && "message" in error) {
    return JSON.stringify(error);
  }
  return error instanceof Error ? error.message : String(error);
}

export type MatrixChunk<T> = {
  items: T[];
  nextCursor?: string;
  complete: boolean;
  chunkIndex: number;
  totalItems?: number;
};

export function chunkMatrix<T>(items: readonly T[], chunkSize: number, cursor?: string): MatrixChunk<T> {
  if (!Number.isInteger(chunkSize) || chunkSize < 1) {
    throw componentError("CHUNK_CURSOR_INVALID", "chunkSize must be a positive integer");
  }
  const offset = cursor === undefined ? 0 : Number.parseInt(cursor, 10);
  if (!Number.isInteger(offset) || offset < 0 || offset > items.length) {
    throw componentError("CHUNK_CURSOR_INVALID", `Invalid matrix cursor: ${cursor}`);
  }
  const end = Math.min(items.length, offset + chunkSize);
  return {
    items: items.slice(offset, end),
    nextCursor: end < items.length ? String(end) : undefined,
    complete: end >= items.length,
    chunkIndex: Math.floor(offset / chunkSize),
    totalItems: items.length,
  };
}

export type FixtureKind = "healthy" | "sparse" | "duplicate" | "corrupted";
export type ComponentFixture = {
  kind: FixtureKind;
  fileName: string;
  componentSets: Array<{ id: string; name: string; variants: Array<{ id: string; name: string }> }>;
  components: Array<{ id: string; name: string; componentSetId?: string }>;
  expected: { componentCount: number; duplicateIds: string[]; corruptedIds: string[] };
};

export function createComponentFixture(kind: FixtureKind): ComponentFixture {
  const base = {
    kind,
    fileName: `fixture-${kind}`,
    componentSets: [{ id: "1:1", name: "Button", variants: [{ id: "1:2", name: "State=Default" }, { id: "1:3", name: "State=Hover" }] }],
    components: [{ id: "2:1", name: "Icon" }],
    expected: { componentCount: 3, duplicateIds: [] as string[], corruptedIds: [] as string[] },
  } satisfies ComponentFixture;
  if (kind === "sparse") {
    base.componentSets = [];
    base.components = [];
    base.expected.componentCount = 0;
  } else if (kind === "duplicate") {
    base.components.push({ id: "2:1", name: "Icon Duplicate" });
    base.expected.duplicateIds = ["2:1"];
    base.expected.componentCount = 3;
  } else if (kind === "corrupted") {
    base.components.push({ id: "bad", name: "" });
    base.expected.corruptedIds = ["bad"];
    base.expected.componentCount = 4;
  }
  return base;
}

export type CompatibilityMatrix = {
  capability: string;
  pluginApi: string;
  supported: boolean;
  fallback?: string;
};

export const componentCompatibilityMatrix: CompatibilityMatrix[] = [
  { capability: "local inventory", pluginApi: "findAll + component metadata", supported: true },
  { capability: "bounded inventory", pluginApi: "page traversal + cursor", supported: true },
  { capability: "component matrix chunking", pluginApi: "get_components params.cursor", supported: true },
  { capability: "operation journal", pluginApi: "plugin runtime memory", supported: true, fallback: "journal is session-scoped" },
  { capability: "rollback created nodes", pluginApi: "node.remove", supported: true },
  { capability: "native undo recovery", pluginApi: "figma.triggerUndo", supported: false, fallback: "returns RECOVERY_UNSUPPORTED" },
  { capability: "visual screenshot report", pluginApi: "exportAsync", supported: true },
  { capability: "native component property binding", pluginApi: "addComponentProperty + componentPropertyReferences", supported: true },
  { capability: "instance property values", pluginApi: "InstanceNode.setProperties", supported: true },
  { capability: "remote library import", pluginApi: "figma.importComponentByKeyAsync", supported: false, fallback: "requires a local component; returns an explicit unsupported diagnostic" },
  { capability: "pixel-level screenshot diff", pluginApi: "exportAsync only", supported: false, fallback: "runner compares exported bytes by variant and region" },
];

export type ScreenshotReport = {
  version: 1;
  generatedAt: string;
  baseline?: string;
  items: Array<{ nodeId: string; nodeName?: string; format: string; width?: number; height?: number; sha256?: string; status: "captured" | "missing" | "error"; error?: string }>;
};

export function createScreenshotReport(items: ScreenshotReport["items"], baseline?: string): ScreenshotReport {
  return { version: 1, generatedAt: new Date().toISOString(), baseline, items };
}
