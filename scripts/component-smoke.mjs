#!/usr/bin/env node
/** Real connected-plugin acceptance harness. It never reports success without a live plugin response. */
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { compareScreenshotManifest } from './visual-compare.mjs';

const baseUrl = (process.env.FIGMA_BRIDGE_URL ?? 'http://localhost:1994').replace(/\/$/, '');
const outputDir = path.resolve(process.env.COMPONENT_SMOKE_OUTPUT ?? 'artifacts/component-smoke');
const baselineDir = process.env.COMPONENT_SMOKE_BASELINE ? path.resolve(process.env.COMPONENT_SMOKE_BASELINE) : undefined;
const request = async (tool, params = {}, fileKey) => {
  const response = await fetch(`${baseUrl}/rpc`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tool, params, ...(fileKey ? { fileKey } : {}) }) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.error) throw new Error(`${tool}: ${body.error ?? `HTTP ${response.status}`}`);
  return body.data;
};
const fail = (reason, code = 2) => { console.error(JSON.stringify({ status: 'not_run', reason, hint: '打开真实 Figma 文件并运行 Figma MCP Bridge 插件后重试。' })); process.exit(code); };

export const sixValues = [
  { variantProperties: { Type: 'Primary', State: 'Default', Size: 'Small', Icon: 'None' }, properties: { Label: 'Continue', 'Show Icon': false } },
  { variantProperties: { Type: 'Ghost', State: 'Hover', Size: 'Medium', Icon: 'Right' }, properties: { Label: 'Next', 'Show Icon': true } },
  { variantProperties: { Type: 'Text', State: 'Active', Size: 'Large', Icon: 'Up' }, properties: { Label: 'Submit', 'Show Icon': true } },
  { variantProperties: { Type: 'Primary', State: 'Disabled', Size: 'Large', Icon: 'None' }, properties: { Label: 'Save', 'Show Icon': false } },
  { variantProperties: { Type: 'Ghost', State: 'Default', Size: 'Small', Icon: 'Up' }, properties: { Label: 'Learn more', 'Show Icon': true } },
  { variantProperties: { Type: 'Text', State: 'Hover', Size: 'Medium', Icon: 'Right' }, properties: { Label: 'Done', 'Show Icon': false } },
];

export async function runSmoke() {
try {
  const ping = await fetch(`${baseUrl}/ping`);
  if (!ping.ok) fail(`bridge ping returned ${ping.status}`);
  const files = await request('list_files');
  if (!Array.isArray(files) || files.length === 0) fail('no live Figma plugin connection');
  const fileKey = files[0].fileKey;
  const target = {
    name: 'Button',
    dimensions: [
      { name: 'Type', values: ['Primary', 'Ghost', 'Text'] },
      { name: 'State', values: ['Default', 'Hover', 'Active', 'Disabled'] },
      { name: 'Size', values: ['Small', 'Medium', 'Large'] },
      { name: 'Icon', values: ['None', 'Right', 'Up'] },
    ],
    properties: [
      { name: 'Label', type: 'TEXT', defaultValue: 'Continue' },
      { name: 'Show Icon', type: 'BOOLEAN', defaultValue: true },
    ],
    requiredBindings: [{ property: 'Label', nodeName: 'Label', type: 'TEXT' }, { property: 'Show Icon', nodeName: 'Icon', type: 'BOOLEAN' }],
  };
  const created = await request('create_component_set', { target, dryRun: false }, fileKey);
  if (!created?.componentSetId || created.variantCount !== 108) throw new Error(`create_component_set did not create 108 variants: ${JSON.stringify(created)}`);
  const inspected = await request('inspect_component_set', { componentSetId: created.componentSetId }, fileKey);
  if (!inspected?.healthy || inspected.variants?.length !== 108) throw new Error('inspect_component_set failed schema/variant postflight');
  const first = inspected.variants[0];
  const instance = await request('create_instance', { componentId: first.id, name: 'CT-33 Button smoke instance' }, fileKey);
  if (!instance?.nodeId) throw new Error(`create_instance returned no nodeId: ${JSON.stringify(instance)}`);
  for (const value of sixValues) {
    await request('swap_instance_component', { instanceId: instance.nodeId, componentId: created.componentSetId, variantProperties: value.variantProperties }, fileKey);
    await request('set_component_properties', { instanceId: instance.nodeId, properties: value.properties }, fileKey);
  }
  const read = await request('get_node', { nodeId: instance.nodeId }, fileKey);
  if (!read || read.id !== instance.nodeId) throw new Error('get_node did not return the created instance');
  const expected = { id: created.componentSetId, name: 'Button', type: 'COMPONENT_SET' };
  const reconcile = await request('reconcile_component_set', { componentSetId: created.componentSetId, expected }, fileKey);
  const reconcileAgain = await request('reconcile_component_set', { componentSetId: created.componentSetId, expected }, fileKey);
  for (const [label, result] of [['first', reconcile], ['second', reconcileAgain]]) {
    const verification = result?.verification;
    const changes = result?.changes ?? verification?.changes ?? result?.plan?.actions;
    if (!verification?.ok || verification.missing?.length || verification.mismatched?.length || (Array.isArray(changes) && changes.length > 0) || (typeof changes === 'number' && changes !== 0)) throw new Error(`${label} reconciliation reported changes or failed: ${JSON.stringify(result)}`);
  }
  if (JSON.stringify(reconcileAgain?.verification) !== JSON.stringify(reconcile?.verification)) throw new Error(`second reconciliation was not idempotent: ${JSON.stringify({ reconcile, reconcileAgain })}`);
  let injectedFailure = false;
  try { await request('set_component_properties', { instanceId: '999999:deliberate-failure', properties: { Label: 'should fail' } }, fileKey); } catch { injectedFailure = true; }
  if (!injectedFailure) throw new Error('deliberate failure was accepted');

  await fs.mkdir(outputDir, { recursive: true });
  const variantIds = inspected.variants.slice(0, 12).map((variant) => variant.id);
  const screenshot = await request('get_screenshot', { nodeIds: variantIds, format: 'PNG', scale: 1 }, fileKey);
  const exports = screenshot?.exports ?? [];
  if (exports.length !== variantIds.length) throw new Error(`expected ${variantIds.length} screenshots, got ${exports.length}`);
  const manifest = [];
  for (const item of exports) {
    const variant = inspected.variants.find((candidate) => candidate.id === item.nodeId);
    const file = `${item.nodeId.replaceAll(':', '-')}.png`;
    await fs.writeFile(path.join(outputDir, file), Buffer.from(item.base64, 'base64'));
    manifest.push({ variant: variant?.name ?? item.nodeId, region: 'full', file });
  }
  const comparison = await compareScreenshotManifest({ currentDir: outputDir, baselineDir, manifest });
  await fs.writeFile(path.join(outputDir, 'comparison.json'), JSON.stringify(comparison, null, 2));
  console.log(JSON.stringify({ status: 'passed', fileKey, componentSetId: created.componentSetId, variantCount: 108, instanceId: instance.nodeId, screenshots: exports.length, injectedFailure, comparison }, null, 2));
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
}

if (import.meta.url === `file://${process.argv[1]}`) await runSmoke();
