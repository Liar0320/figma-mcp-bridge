import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { compareScreenshotManifest } from './visual-compare.mjs';

test('screenshot comparison is deterministic by variant and region', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'figma-visual-'));
  const current = path.join(root, 'current');
  const baseline = path.join(root, 'baseline');
  await fs.mkdir(current); await fs.mkdir(baseline);
  await fs.writeFile(path.join(current, 'a.png'), Buffer.from('same'));
  await fs.writeFile(path.join(baseline, 'a.png'), Buffer.from('same'));
  const result = await compareScreenshotManifest({ currentDir: current, baselineDir: baseline, manifest: [{ variant: 'B', region: 'full', file: 'a.png' }, { variant: 'A', region: 'full', file: 'a.png' }] });
  assert.equal(result.passed, true);
  assert.deepEqual(result.results.map((item) => item.variant), ['A', 'B']);
});
