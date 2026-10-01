import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

export async function compareScreenshotManifest({ currentDir, baselineDir, manifest }) {
  const results = [];
  for (const item of [...manifest].sort((a, b) => `${a.variant}/${a.region}`.localeCompare(`${b.variant}/${b.region}`))) {
    const currentPath = path.join(currentDir, item.file);
    const baselinePath = baselineDir ? path.join(baselineDir, item.file) : undefined;
    let current;
    try { current = await fs.readFile(currentPath); } catch (error) {
      results.push({ ...item, status: 'missing-current', message: String(error) });
      continue;
    }
    const currentHash = sha256(current);
    if (!baselineDir) {
      results.push({ ...item, status: 'captured', currentHash });
      continue;
    }
    let baseline;
    try { baseline = await fs.readFile(baselinePath); } catch {
      results.push({ ...item, status: 'missing-baseline', currentHash });
      continue;
    }
    const baselineHash = sha256(baseline);
    results.push({ ...item, status: currentHash === baselineHash ? 'match' : 'mismatch', currentHash, baselineHash });
  }
  return { version: 1, deterministic: true, results, passed: results.every((item) => ['captured', 'match'].includes(item.status)) };
}
