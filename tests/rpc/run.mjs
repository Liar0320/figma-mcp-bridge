#!/usr/bin/env node
/** Live RPC diagnostics, one selected case per invocation. Never retry unknown write outcomes. */
import process from 'node:process';
import { createClient, requireData } from './core/client.mjs';
import { listCases, loadCase } from './core/cases.mjs';

const usage = `Usage: node tests/rpc/run.mjs --list
       node tests/rpc/run.mjs <tool/test> [--allow-write] [--file-key KEY]
Environment: FIGMA_BRIDGE_URL (default http://localhost:1994).
Each invocation runs only the selected test. Write tests require --allow-write and create named nodes.
Output: newline-delimited JSON requests, responses, timings and a final observation.`;

export async function main(args = process.argv.slice(2), { fetchImpl = fetch, baseUrl = process.env.FIGMA_BRIDGE_URL ?? 'http://localhost:1994', emit = console.log } = {}) {
  if (args.length === 1 && args[0] === '--list') { emit((await listCases()).join('\n')); return 0; }
  if (args.length === 1 && args[0] === '--help') { emit(usage); return 0; }
  if (args.length === 0) { emit(usage); return 2; }
  const [name, ...flags] = args;
  const { run, writes } = await loadCase(name);
  let allowWrite = false;
  let fileKey;
  for (let i = 0; i < flags.length; i += 1) {
    if (flags[i] === '--allow-write' && !allowWrite) allowWrite = true;
    else if (flags[i] === '--file-key' && !fileKey && flags[i + 1] && !flags[i + 1].startsWith('--')) fileKey = flags[++i];
    else throw new Error(`Unknown or repeated option: ${flags[i]}`);
  }
  if (writes && !allowWrite) throw new Error('This test creates nodes. Pass --allow-write explicitly.');
  const url = baseUrl.replace(/\/$/, '');
  const ping = await fetchImpl(`${url}/ping`, { signal: AbortSignal.timeout(5_000) });
  if (!ping.ok) throw new Error(`Bridge ping: HTTP ${ping.status}`);
  const discovery = createClient({ baseUrl: url, fetchImpl, emit });
  const files = requireData(await discovery.request('list_files'), 'list_files');
  if (!Array.isArray(files) || files.length === 0) throw new Error('No live Figma plugin connection');
  const target = fileKey ? files.find(file => file.fileKey === fileKey) : files.length === 1 ? files[0] : undefined;
  if (!target) throw new Error(`Select a connected --file-key: ${files.map(file => `${file.fileName} (${file.fileKey})`).join(', ')}`);
  const client = createClient({ baseUrl: url, fileKey: target.fileKey, fetchImpl, emit });
  const metadata = requireData(await client.request('get_metadata'), 'get_metadata');
  if (!metadata?.currentPageId) throw new Error('No current page ID');
  const observation = await run({ ...client, pageId: metadata.currentPageId, fileKey: target.fileKey });
  emit(JSON.stringify({ kind: 'observation', test: name, fileKey: target.fileKey, pageId: metadata.currentPageId, ...observation }));
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(code => { process.exitCode = code; }).catch(error => {
    console.error(JSON.stringify({ kind: 'not_run_or_incomplete', error: error instanceof Error ? error.message : String(error) }));
    process.exitCode = 2;
  });
}
