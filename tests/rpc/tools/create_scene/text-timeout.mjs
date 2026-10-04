import { label, succeeded, failure } from '../../core/results.mjs';

function matrixNodes(textCount) {
  return Array.from({ length: 9 }, (_, index) => {
    const x = 12 + (index % 3) * 95;
    const y = 12 + Math.floor(index / 3) * 65;
    return index < 9 - textCount
      ? { ref: `r${index}`, type: 'RECTANGLE', props: { name: `Rectangle ${index}`, x, y, width: 72, height: 32 } }
      : { ref: `t${index}`, type: 'TEXT', props: { name: `Text ${index}`, x, y, width: 72, height: 32, characters: 'x', style: { fontFamily: 'Inter', fontStyle: 'Regular', fontSize: 14 } } };
  });
}

/** Issue #61: one healthy control and one previously failing Text-heavy sample. */
export default async function textTimeout({ request }) {
  const samples = [];
  for (const textCount of [2, 4]) {
    const frame = await request('create_frame', { name: `${label(61)} T${textCount}`, x: 15000 + textCount * 420, y: 4200, width: 340, height: 240 }, `issue61-T${textCount}-root`);
    if (!succeeded(frame) || !frame.data?.nodeId) throw new Error(`T${textCount} root creation failed: ${JSON.stringify(frame)}`);
    const rootId = frame.data.nodeId;
    const nodes = matrixNodes(textCount);
    const dry = await request('create_scene', { parentId: rootId, nodes, dryRun: true }, `issue61-T${textCount}-dry-run`);
    if (!succeeded(dry)) { samples.push({ textCount, rootId, dryRunError: failure(dry), classification: 'preflight_rejected' }); continue; }
    const live = await request('create_scene', { parentId: rootId, nodes, dryRun: false }, `issue61-T${textCount}-live`);
    const post = await request('get_node', {}, `issue61-T${textCount}-post-read`, [rootId]);
    const children = post.data?.children;
    samples.push({ textCount, rootId, dryRunAccepted: true, liveAccepted: succeeded(live), liveError: failure(live), observedChildTypes: Array.isArray(children) ? children.map(child => child.type) : null, postReadError: failure(post), classification: !succeeded(live) && Array.isArray(children) && children.length > 0 && children.length < 9 ? 'unknown_write_outcome_partial_persistence' : succeeded(live) ? 'live_returned_success' : 'unknown_write_outcome' });
    // An unknown write may still be running in the plugin. Do not initiate another write.
    if (!succeeded(live)) break;
  }
  return { samples };
}
