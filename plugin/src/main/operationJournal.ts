export type JournalStatus = "started" | "succeeded" | "failed" | "rolled_back";
export type OperationJournalEntry = {
  journalId: string;
  requestId?: string;
  operation: string;
  status: JournalStatus;
  startedAt: string;
  finishedAt?: string;
  result?: unknown;
  error?: unknown;
  rollback?: { supported: boolean; nodeIds?: string[]; removedNodeIds?: string[]; unrevertedNodeIds?: string[]; reason?: string };
  checkpoints?: Array<{ step: number; operation: string; nodeIds: string[]; at: string }>;
};
const entries: OperationJournalEntry[] = [];
const makeId = () => `op-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const STORAGE_KEY = "figma-mcp-bridge.operation-journal.v1";
function persist(): void {
  try { const cs = (globalThis as any).figma?.clientStorage; if (cs?.setAsync) void cs.setAsync(STORAGE_KEY, entries); } catch { /* fail closed */ }
}
export function beginOperation(operation: string, requestId?: string): OperationJournalEntry {
  const entry = { journalId: makeId(), requestId, operation, status: "started" as const, startedAt: new Date().toISOString(), checkpoints: [] };
  entries.push(entry); persist();
  return entry;
}
export function finishOperation(entry: OperationJournalEntry, result: unknown): OperationJournalEntry {
  entry.status = "succeeded"; entry.finishedAt = new Date().toISOString(); entry.result = result;
  if (result && typeof result === "object" && (result as { rollback?: unknown }).rollback) {
    entry.rollback = (result as { rollback: OperationJournalEntry["rollback"] }).rollback;
  } else {
    const nodeIds = result && typeof result === "object" && typeof (result as { nodeId?: unknown }).nodeId === "string" ? [(result as { nodeId: string }).nodeId] : undefined;
    entry.rollback = { supported: !!nodeIds, nodeIds, reason: nodeIds ? undefined : "Only created node results can be rolled back automatically" };
  }
  persist(); return entry;
}
export function failOperation(entry: OperationJournalEntry, error: unknown): OperationJournalEntry {
  entry.status = "failed"; entry.finishedAt = new Date().toISOString(); entry.error = error;
  const details = error && typeof error === "object" ? (error as { details?: { rollback?: OperationJournalEntry["rollback"] } }).details : undefined;
  entry.rollback = details?.rollback ?? { supported: false, reason: "operation failed" }; persist(); return entry;
}
export function checkpointOperation(entry: OperationJournalEntry, step: number, operation: string, nodeIds: string[]): void {
  entry.checkpoints ??= [];
  entry.checkpoints.push({ step, operation, nodeIds: [...nodeIds].sort(), at: new Date().toISOString() });
  persist();
}
export function listOperations(): OperationJournalEntry[] { return entries.map((e) => ({ ...e, checkpoints: e.checkpoints ? [...e.checkpoints] : undefined })); }
export function getOperation(journalId: string): OperationJournalEntry | undefined { return entries.find((e) => e.journalId === journalId); }
export function markRolledBack(entry: OperationJournalEntry): OperationJournalEntry { entry.status = "rolled_back"; entry.finishedAt = new Date().toISOString(); persist(); return entry; }
export function clearOperations(): void { entries.length = 0; persist(); }
export async function recoverOperations(): Promise<OperationJournalEntry[]> {
  try { const cs = (globalThis as any).figma?.clientStorage; const saved = cs?.getAsync ? await cs.getAsync(STORAGE_KEY) : undefined; if (Array.isArray(saved)) entries.splice(0, entries.length, ...saved); } catch { /* unavailable storage */ }
  return listOperations();
}
