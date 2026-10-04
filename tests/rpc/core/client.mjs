import { performance } from 'node:perf_hooks';

/** Sequential call primitive. Log before sending so an unknown write can be traced without replaying it. */
export function createClient({ baseUrl, fileKey, emit = console.log, fetchImpl = fetch, timeoutMs = 135_000 }) {
  const url = baseUrl.replace(/\/$/, '');
  let sequence = 0;
  async function request(tool, params = {}, label = tool, nodeIds) {
    const payload = { tool, params, ...(nodeIds ? { nodeIds } : {}), ...(fileKey ? { fileKey } : {}) };
    const startedAt = new Date().toISOString();
    const started = performance.now();
    const seq = ++sequence;
    emit(JSON.stringify({ kind: 'request', seq, label, startedAt, payload }));
    let outcome;
    try {
      const response = await fetchImpl(`${url}/rpc`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload), signal: AbortSignal.timeout(timeoutMs),
      });
      const body = await response.json();
      outcome = { status: response.status, ...(response.ok && !body.error ? { data: body.data } : { error: body.error ?? body }) };
    } catch (error) {
      outcome = { transportError: error instanceof Error ? `${error.name}: ${error.message}` : String(error) };
    }
    emit(JSON.stringify({ kind: 'response', seq, label, finishedAt: new Date().toISOString(), durationMs: Math.round((performance.now() - started) * 1000) / 1000, ...outcome }));
    return outcome;
  }
  return { request };
}

export function requireData(result, label) {
  if (!result || !Object.hasOwn(result, 'data')) throw new Error(`${label} failed: ${JSON.stringify(result)}`);
  return result.data;
}
