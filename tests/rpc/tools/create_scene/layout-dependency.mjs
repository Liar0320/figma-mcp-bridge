import { label, succeeded, failure } from '../../core/results.mjs';

/** Issue #60: preflight and live must agree on ABSOLUTE under layoutMode NONE. */
export default async function layoutDependency({ request }) {
  const nodes = [{
    ref: 'parent', type: 'FRAME', props: { name: label(60), width: 200, height: 120, layoutMode: 'NONE' },
    children: [{ ref: 'child', type: 'RECTANGLE', props: { width: 24, height: 24, layoutPositioning: 'ABSOLUTE' } }],
  }];
  const dry = await request('create_scene', { nodes, dryRun: true }, 'issue60-dry-run');
  // Compare the identical invalid scene live even when preflight rejects it.
  const live = await request('create_scene', { nodes, dryRun: false }, 'issue60-live');
  return { dryRunAccepted: succeeded(dry), dryRunError: failure(dry), liveAccepted: succeeded(live), liveError: failure(live), rootNodeIds: live.data?.rootNodeIds ?? [], classification: succeeded(dry) && !succeeded(live) ? 'reproduced_dry_live_gap' : 'not_reproduced_or_changed' };
}
