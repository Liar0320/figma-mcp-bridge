/** Canvas collision-free slot discovery for auto-positioning new frames. */

export type CanvasSlotDirection = "right" | "bottom";

export interface FindCanvasSlotParams {
  width: number;
  height?: number;
  direction?: CanvasSlotDirection;
  spacing?: number;
  nearNodeId?: string;
}

export interface CanvasSlotResult {
  x: number;
  y: number;
  strategy: string;
  referenceBounds?: { x: number; y: number; width: number; height: number };
  warning?: string;
}

type Bounds = { x: number; y: number; width: number; height: number };

const DEFAULT_SPACING = 80;
const MAX_X_THRESHOLD = 5000;

/** Excludes locked nodes, slices, and oversized canvas background plates. */
function shouldExcludeNode(node: SceneNode): boolean {
  if ("locked" in node && node.locked) return true;
  if ("name" in node && /(?:canvas[- ]?)?background/i.test(node.name)) return true;
  if ("width" in node && "height" in node && node.width * node.height > 50_000_000) return true;
  return false;
}

/** Collects direct child bounds from the placement container. */
function collectBounds(container: ChildrenMixin): Bounds[] {
  const bounds: Bounds[] = [];
  for (const child of container.children) {
    if (child.type === "SLICE" || shouldExcludeNode(child)) continue;
    if (!("x" in child && "y" in child && "width" in child && "height" in child)) continue;
    bounds.push({ x: child.x, y: child.y, width: child.width, height: child.height });
  }
  return bounds;
}

/** Finds a collision-free slot on the current page or within a container. */
export async function findCanvasSlot(
  params: FindCanvasSlotParams,
  container: PageNode | (BaseNode & ChildrenMixin) = figma.currentPage,
): Promise<CanvasSlotResult> {
  const direction = params.direction ?? "right";
  const spacing = params.spacing ?? DEFAULT_SPACING;
  const width = params.width;
  const height = params.height ?? params.width;

  if (params.nearNodeId) {
    const targetNode = await figma.getNodeByIdAsync(params.nearNodeId);
    if (!targetNode || targetNode.type === "DOCUMENT" || targetNode.type === "PAGE") {
      throw Object.assign(new Error(`nearNodeId ${params.nearNodeId} was not found or is invalid`), {
        mutationError: { code: "NOT_FOUND", message: `nearNodeId ${params.nearNodeId} was not found or is invalid` },
      });
    }
    let current: BaseNode | null = targetNode;
    while (current && current !== container) current = current.parent;
    if (current !== container) {
      throw Object.assign(new Error(`nearNodeId ${params.nearNodeId} is not within the target container`), {
        mutationError: { code: "OUT_OF_SCOPE", message: `nearNodeId ${params.nearNodeId} is not within the target container` },
      });
    }
    if (!("x" in targetNode && "y" in targetNode && "width" in targetNode && "height" in targetNode)) {
      throw Object.assign(new Error(`nearNodeId ${params.nearNodeId} has no bounds`), {
        mutationError: { code: "INVALID_INPUT", message: `nearNodeId ${params.nearNodeId} has no bounds` },
      });
    }
    const referenceBounds = { x: targetNode.x, y: targetNode.y, width: targetNode.width, height: targetNode.height };
    const candidate = { x: targetNode.x + targetNode.width + spacing, y: targetNode.y, width, height };
    const collides = container.children.some((sibling) => {
      if (sibling === targetNode || sibling.type === "SLICE" || shouldExcludeNode(sibling)) return false;
      if (!("x" in sibling && "y" in sibling && "width" in sibling && "height" in sibling)) return false;
      return candidate.x < sibling.x + sibling.width &&
        candidate.x + candidate.width > sibling.x &&
        candidate.y < sibling.y + sibling.height &&
        candidate.y + candidate.height > sibling.y;
    });
    if (collides) {
      const fallback = await findCanvasSlot({ ...params, nearNodeId: undefined }, container);
      return { ...fallback, warning: "Adjacent slot collided with existing content; used global shelf placement instead." };
    }
    return { x: candidate.x, y: candidate.y, strategy: "adjacent_to_reference", referenceBounds };
  }

  const bounds = collectBounds(container);
  if (bounds.length === 0) return { x: 0, y: 0, strategy: "empty_canvas" };

  const globalMaxY = Math.max(...bounds.map((b) => b.y + b.height));

  if (direction === "bottom") {
    return {
      x: 0,
      y: globalMaxY + spacing,
      strategy: "bottom_of_max_bounds",
      referenceBounds: { x: 0, y: 0, width: Math.max(...bounds.map((b) => b.x + b.width)), height: globalMaxY },
    };
  }

  // Shelf (Row) packing:
  // Identify the lowest active row. A row is formed by items whose vertical span overlaps the bottom region.
  // We sort frames by Y and group into rows, or find the frames on the lowest row.
  // The lowest row starts at the Y of the frame that is closest to globalMaxY while accounting for height.
  // Specifically: find all frames that touch or are near the bottom-most shelf.
  const lowestY = Math.max(...bounds.map((b) => b.y));
  // Items on this lowest shelf:
  const lowestShelfFrames = bounds.filter((b) => Math.abs(b.y - lowestY) < 150);

  const shelfMaxX = Math.max(...lowestShelfFrames.map((b) => b.x + b.width));
  const shelfY = lowestShelfFrames[0].y;

  // Check if current shelf has space
  if (shelfMaxX + spacing + width <= MAX_X_THRESHOLD) {
    return {
      x: shelfMaxX + spacing,
      y: shelfY,
      strategy: "right_of_max_bounds",
      referenceBounds: { x: 0, y: shelfY, width: shelfMaxX, height: Math.max(...lowestShelfFrames.map((b) => b.height)) },
    };
  }

  // Current shelf is full (> MAX_X_THRESHOLD), wrap to brand new row below all existing content
  return {
    x: 0,
    y: globalMaxY + spacing,
    strategy: "wrapped_to_new_row",
    referenceBounds: { x: 0, y: 0, width: Math.max(...bounds.map((b) => b.x + b.width)), height: globalMaxY },
  };
}
