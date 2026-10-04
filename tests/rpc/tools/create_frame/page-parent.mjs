import { label, succeeded, failure } from '../../core/results.mjs';

/** Issue #62: compare omitted and explicit current PAGE target across create_frame and create_scene. */
export default async function pageParent({ request, pageId }) {
  const omitted = await request('create_frame', { name: `${label(62)} omitted`, width: 120, height: 80, x: 15000, y: 4600 }, 'issue62-omitted-parent');
  if (!succeeded(omitted)) return { omittedParent: { error: failure(omitted) }, classification: 'control_failed' };
  const explicit = await request('create_frame', { parentId: pageId, name: `${label(62)} explicit`, width: 120, height: 80, x: 15140, y: 4600 }, 'issue62-explicit-page');
  const nodes = [{ ref: 'root', type: 'FRAME', props: { name: `${label(62)} scene`, width: 120, height: 80 } }];
  const dry = await request('create_scene', { parentId: pageId, nodes, dryRun: true }, 'issue62-scene-page-dry-run');
  const live = await request('create_scene', { parentId: pageId, nodes, dryRun: false }, 'issue62-scene-page-live');
  return { omittedParent: { nodeId: omitted.data.nodeId }, explicitPage: { nodeId: explicit.data?.nodeId, error: failure(explicit) }, scenePageDryRun: { accepted: succeeded(dry), error: failure(dry) }, scenePageLive: { rootNodeIds: live.data?.rootNodeIds ?? [], error: failure(live) }, classification: !succeeded(explicit) && succeeded(dry) && !succeeded(live) ? 'reproduced_explicit_page_gap' : 'not_reproduced_or_changed' };
}
