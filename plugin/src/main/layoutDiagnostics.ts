export type LayoutIssueCode =
  | "OUT_OF_BOUNDS"
  | "CLIPPED_CONTENT"
  | "TEXT_TRUNCATION"
  | "TEXT_OVERLAP"
  | "SMALL_TOUCH_TARGET"
  | "LOW_CONTRAST";

type Bounds = { x: number; y: number; width: number; height: number };
type Issue = {
  code: LayoutIssueCode;
  severity: "warning" | "error";
  nodeId: string;
  relatedNodeId?: string;
  message: string;
  bounds?: Bounds;
  measured?: Record<string, number | string>;
};
type Limitation = { nodeId?: string; reason: string };
type InspectableNode = SceneNode | PageNode;

const ISSUE_CODES: Record<LayoutIssueCode, true> = {
  OUT_OF_BOUNDS: true,
  CLIPPED_CONTENT: true,
  TEXT_TRUNCATION: true,
  TEXT_OVERLAP: true,
  SMALL_TOUCH_TARGET: true,
  LOW_CONTRAST: true,
};
const PARAM_KEYS: Record<string, true> = {
  rootIds: true,
  maxNodes: true,
  maxIssues: true,
  minTouchTarget: true,
  interactiveNodeIds: true,
  ignore: true,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isSceneNode(node: BaseNode | null): node is SceneNode {
  return node !== null && node.type !== "DOCUMENT" && node.type !== "PAGE";
}
function boundsOf(node: BaseNode | null): Bounds | undefined {
  if (!node || !isSceneNode(node)) return undefined;
  const value = node.absoluteBoundingBox;
  if (!value || !Number.isFinite(value.x) || !Number.isFinite(value.y) || !Number.isFinite(value.width) || !Number.isFinite(value.height)) return undefined;
  return { x: value.x, y: value.y, width: value.width, height: value.height };
}
function hasUnsupportedTransform(node: BaseNode): boolean {
  return "rotation" in node && Math.abs(node.rotation) > 0.0001;
}
function geometryNode(node: BaseNode): node is SceneNode & GeometryMixin {
  return "fills" in node;
}
function solidOpaqueColor(node: BaseNode): RGB | undefined {
  if (!geometryNode(node)) return undefined;
  if (("blendMode" in node && node.blendMode !== "PASS_THROUGH") || ("opacity" in node && node.opacity !== 1)) return undefined;
  const paints = node.fills;
  if (paints === figma.mixed || paints.length !== 1) return undefined;
  const paint = paints[0];
  if (paint.type !== "SOLID" || paint.visible === false || (paint.opacity ?? 1) !== 1) return undefined;
  return paint.color;
}
function intersects(a: Bounds, b: Bounds): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}
function contains(outer: Bounds, inner: Bounds): boolean {
  return inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;
}
function luminance(color: RGB): number {
  const channel = (value: number): number => value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
  return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
}
function contrastRatio(foreground: RGB, background: RGB): number {
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}
function ancestors(node: BaseNode): BaseNode[] {
  const result: BaseNode[] = [];
  let parent = node.parent;
  while (parent && parent.type !== "PAGE" && parent.type !== "DOCUMENT") {
    result.push(parent);
    parent = parent.parent;
  }
  return result;
}
function transformedByAncestor(node: BaseNode): BaseNode | undefined {
  if (hasUnsupportedTransform(node)) return node;
  return ancestors(node).find(hasUnsupportedTransform);
}
function isOnCurrentPage(node: BaseNode): boolean {
  let parent = node.parent;
  while (parent && parent.type !== "PAGE" && parent.type !== "DOCUMENT") parent = parent.parent;
  return parent === figma.currentPage;
}
function isVisibleThroughAncestors(node: BaseNode): boolean {
  if ("visible" in node && !node.visible) return false;
  return !ancestors(node).some((ancestor) => "visible" in ancestor && !ancestor.visible);
}

export async function validateLayout(params: Record<string, unknown> | undefined) {
  if (!isRecord(params)) throw new Error("params must be an object");
  for (const key of Object.keys(params)) if (!PARAM_KEYS[key]) throw new Error(`Unknown parameter: ${key}`);
  const rootIds = params.rootIds;
  if (!Array.isArray(rootIds) || rootIds.length < 1 || rootIds.length > 20 || rootIds.some((id) => typeof id !== "string" || !/^\d+:\d+$/.test(id))) throw new Error("rootIds must contain 1..20 Figma node IDs");
  const maxNodes = params.maxNodes === undefined ? 1000 : params.maxNodes;
  const maxIssues = params.maxIssues === undefined ? 100 : params.maxIssues;
  const minTouchTarget = params.minTouchTarget === undefined ? 44 : params.minTouchTarget;
  if (typeof maxNodes !== "number" || !Number.isInteger(maxNodes) || maxNodes < 1 || maxNodes > 2000) throw new Error("maxNodes must be an integer from 1 to 2000");
  if (typeof maxIssues !== "number" || !Number.isInteger(maxIssues) || maxIssues < 1 || maxIssues > 500) throw new Error("maxIssues must be an integer from 1 to 500");
  if (typeof minTouchTarget !== "number" || !Number.isFinite(minTouchTarget) || minTouchTarget <= 0) throw new Error("minTouchTarget must be positive");
  const interactiveNodeIds = params.interactiveNodeIds;
  if (interactiveNodeIds !== undefined && (!Array.isArray(interactiveNodeIds) || interactiveNodeIds.some((id) => typeof id !== "string" || !/^\d+:\d+$/.test(id)))) throw new Error("interactiveNodeIds must contain Figma node IDs");
  const interactive = new Set((interactiveNodeIds as string[] | undefined) ?? []);
  const ignoreValue = params.ignore;
  if (ignoreValue !== undefined && (!Array.isArray(ignoreValue) || ignoreValue.some((item) => !isRecord(item) || typeof item.nodeId !== "string" || !/^\d+:\d+$/.test(item.nodeId) || typeof item.code !== "string" || !(item.code in ISSUE_CODES)))) throw new Error("ignore entries must contain nodeId and a valid code");
  const ignored = new Set<string>();
  for (const item of (ignoreValue as Array<Record<string, unknown>> | undefined) ?? []) ignored.add(`${item.nodeId}|${item.code}`);

  const roots: SceneNode[] = [];
  for (const id of rootIds) {
    const candidate = await figma.getNodeByIdAsync(id);
    if (!candidate || !isSceneNode(candidate) || !isOnCurrentPage(candidate)) throw new Error(`Root ${id} is missing or is not on the current page`);
    roots.push(candidate);
  }
  const issues: Issue[] = [];
  const limitations: Limitation[] = [];
  const limitationKeys = new Set<string>();
  const addLimitation = (nodeId: string | undefined, reason: string): void => {
    const key = `${nodeId ?? ""}|${reason}`;
    if (limitationKeys.has(key) || limitations.length >= 500) return;
    limitationKeys.add(key);
    limitations.push(nodeId ? { nodeId, reason } : { reason });
  };
  let findingsTruncated = false;
  const addIssue = (issue: Issue): void => {
    if (ignored.has(`${issue.nodeId}|${issue.code}`)) return;
    if (issues.length >= maxIssues) { findingsTruncated = true; return; }
    issues.push(issue);
  };
  const nodes: SceneNode[] = [];
  const visited = new Set<string>();
  const stack: SceneNode[] = [...roots].reverse();
  let traversalTruncated = false;
  while (stack.length) {
    const node = stack.pop()!;
    if (visited.has(node.id)) continue;
    visited.add(node.id);
    if (!isVisibleThroughAncestors(node)) continue;
    if (nodes.length >= maxNodes) { traversalTruncated = true; break; }
    nodes.push(node);
    if ("children" in node) {
      const children = node.children.filter((child): child is SceneNode => isSceneNode(child));
      for (let index = children.length - 1; index >= 0; index -= 1) if (!visited.has(children[index].id)) stack.push(children[index]);
    }
  }
  const byParent = new Map<string, SceneNode[]>();
  for (const node of nodes) {
    const parent = node.parent;
    if (!parent) {
      addLimitation(node.id, "Node has no parent bounds");
      continue;
    }
    const parentId = parent.id;
    const siblings = byParent.get(parentId) ?? [];
    siblings.push(node);
    byParent.set(parentId, siblings);
  }
  const geometryBlocked = new Set<string>();
  for (const node of nodes) {
    const transform = transformedByAncestor(node);
    if (transform) {
      geometryBlocked.add(node.id);
      addLimitation(node.id, "Rotated or transformed geometry is not evaluated");
    }
  }
  for (const node of nodes) {
    const nodeBounds = boundsOf(node);
    if (!nodeBounds) {
      addLimitation(node.id, "Native bounds are unavailable");
      continue;
    }
    const parentBounds = boundsOf(node.parent);
    if (!geometryBlocked.has(node.id) && parentBounds && !contains(parentBounds, nodeBounds)) {
      addIssue({ code: "OUT_OF_BOUNDS", severity: "warning", nodeId: node.id, message: "Node extends beyond its parent bounds", bounds: nodeBounds });
    }
    if (!geometryBlocked.has(node.id)) {
      const clippingAncestors = ancestors(node).filter((ancestor): ancestor is FrameNode | ComponentNode | InstanceNode | SectionNode => "clipsContent" in ancestor && ancestor.clipsContent);
      for (const clippingAncestor of clippingAncestors) {
        const clippingBounds = boundsOf(clippingAncestor);
        if (clippingBounds && !contains(clippingBounds, nodeBounds)) {
          addIssue({ code: "CLIPPED_CONTENT", severity: "warning", nodeId: node.id, relatedNodeId: clippingAncestor.id, message: "Node content is clipped by a clipping ancestor", bounds: nodeBounds });
        }
      }
    }
    if (interactive.has(node.id) && !geometryBlocked.has(node.id) && (nodeBounds.width < minTouchTarget || nodeBounds.height < minTouchTarget)) {
      addIssue({ code: "SMALL_TOUCH_TARGET", severity: "warning", nodeId: node.id, message: `Interactive bounds are smaller than ${minTouchTarget}px`, bounds: nodeBounds, measured: { width: nodeBounds.width, height: nodeBounds.height, minimum: minTouchTarget } });
    }
    if (node.type === "TEXT") {
      if (node.textAutoResize === "TRUNCATE" || node.textTruncation !== "DISABLED") {
        addIssue({ code: "TEXT_TRUNCATION", severity: "warning", nodeId: node.id, message: "Native truncation is configured; actual overflow is unknown", bounds: nodeBounds });
        addLimitation(node.id, "Configured truncation does not prove that this text currently overflows");
      } else if (node.textAutoResize === "NONE") {
        addLimitation(node.id, "Fixed text overflow cannot be verified without mutating or measuring the document");
      }
    }
  }
  for (const siblings of byParent.values()) {
    const textSiblings = siblings.filter((node): node is TextNode => node.type === "TEXT" && !geometryBlocked.has(node.id));
    for (let first = 0; first < textSiblings.length; first += 1) for (let second = first + 1; second < textSiblings.length; second += 1) {
      const firstBounds = boundsOf(textSiblings[first]);
      const secondBounds = boundsOf(textSiblings[second]);
      if (firstBounds && secondBounds && intersects(firstBounds, secondBounds)) addIssue({ code: "TEXT_OVERLAP", severity: "warning", nodeId: textSiblings[first].id, relatedNodeId: textSiblings[second].id, message: "Sibling text bounds overlap", bounds: firstBounds });
    }
  }
  for (const node of nodes) {
    if (node.type !== "TEXT" || geometryBlocked.has(node.id)) continue;
    const textBounds = boundsOf(node);
    const foreground = solidOpaqueColor(node);
    if (!textBounds || !foreground) {
      addLimitation(node.id, "Text paint is not a single opaque solid color");
      continue;
    }
    const parent = node.parent;
    if (!parent) {
      addLimitation(node.id, "Text has no parent background context");
      continue;
    }
    const potentialSiblings = (byParent.get(parent.id) ?? []).filter((sibling) => sibling.id !== node.id && sibling.type !== "TEXT");
    const solidSiblingBackground = potentialSiblings.find((sibling) => {
      const siblingBounds = boundsOf(sibling);
      return siblingBounds && intersects(siblingBounds, textBounds) && solidOpaqueColor(sibling);
    });
    if (potentialSiblings.some((sibling) => {
      const siblingBounds = boundsOf(sibling);
      return siblingBounds && intersects(siblingBounds, textBounds) && sibling !== solidSiblingBackground;
    })) {
      addLimitation(node.id, "Sibling overlays make the effective text background indeterminate");
      continue;
    }
    const backgroundAncestor = solidSiblingBackground ?? ancestors(node).find((ancestor) => {
      const ancestorBounds = boundsOf(ancestor);
      return ancestorBounds && contains(ancestorBounds, textBounds) && solidOpaqueColor(ancestor);
    });
    if (!backgroundAncestor) {
      addLimitation(node.id, "No deterministic opaque solid ancestor background fully contains the text");
      continue;
    }
    const background = solidOpaqueColor(backgroundAncestor)!;
    const ratio = contrastRatio(foreground, background);
    const fontSize = typeof node.fontSize === "number" ? node.fontSize : undefined;
    const fontWeight = typeof node.fontWeight === "number" ? node.fontWeight : undefined;
    const largeText = fontSize !== undefined && fontWeight !== undefined && ((fontSize >= 24) || (fontSize >= 18.66 && fontWeight >= 700));
    const threshold = largeText ? 3 : 4.5;
    if (ratio < threshold) {
      addIssue({ code: "LOW_CONTRAST", severity: "error", nodeId: node.id, relatedNodeId: backgroundAncestor.id, message: `Text and opaque ancestor background contrast is below WCAG ${threshold}:1`, bounds: textBounds, measured: { ratio, threshold } });
    }
  }
  return { scannedNodes: nodes.length, complete: !traversalTruncated && !findingsTruncated, issues, limitations };
}
