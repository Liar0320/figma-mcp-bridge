#!/usr/bin/env node
/** Live smoke harness. It only reports pass when a real bridge/plugin responds. */
const url = process.env.FIGMA_BRIDGE_URL ?? "http://localhost:1994";
try {
  const response = await fetch(`${url}/health`);
  if (!response.ok) throw new Error(`bridge health returned ${response.status}`);
  const body = await response.text();
  console.log(JSON.stringify({ status: "bridge_reachable", url, body }));
} catch (error) {
  console.error(JSON.stringify({ status: "not_run", reason: error instanceof Error ? error.message : String(error), hint: "Open the real Figma plugin and bridge, then rerun this harness." }));
  process.exitCode = 2;
}
