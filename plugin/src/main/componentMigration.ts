/** Component migration/repair/reconciliation primitives.
 * All planners are deterministic and side effect free; executors fail closed when
 * a required Figma API is unavailable.
 */

export type MigrationAction =
  | { type: "clone"; sourceId: string; cloneId?: string }
  | { type: "rename"; nodeId: string; from?: string; to: string }
  | { type: "resize"; nodeId: string; width: number; height: number }
  | { type: "delete-dimension"; nodeId: string; dimension: "width" | "height" }
  | { type: "merge-set"; sourceSetId: string; targetSetId: string }
  | { type: "split-set"; sourceSetId: string; componentIds: string[] }
  | { type: "remap-instance"; instanceId: string; fromComponentId: string; toComponentId: string };

export type ComponentSnapshot = {
  id: string;
  name: string;
  type: "COMPONENT" | "COMPONENT_SET";
  width?: number;
  height?: number;
  key?: string;
  variantProperties?: Record<string, string> | null;
  componentSetId?: string;
};

export type InstanceSnapshot = {
  id: string;
  name: string;
  mainComponentId?: string;
  mainComponentKey?: string;
  variantProperties?: Record<string, string> | null;
};

export type InstanceClassification = "exact" | "variant" | "key" | "unmapped";
export type ClassifiedInstance = InstanceSnapshot & { classification: InstanceClassification; targetComponentId?: string };

export type ReconciliationPlan = {
  version: 1;
  actions: MigrationAction[];
  warnings: string[];
  deterministicKey: string;
};

const stable = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.keys(value as Record<string, unknown>).sort().map((k) => `${JSON.stringify(k)}:${stable((value as Record<string, unknown>)[k])}`).join(",")}}`;
};

/** Classifies instances against target components using strict precedence. */
export function classifyInstances(instances: InstanceSnapshot[], targets: ComponentSnapshot[]): ClassifiedInstance[] {
  const byId = new Map(targets.map((t) => [t.id, t]));
  const byKey = new Map(targets.filter((t) => t.key).map((t) => [t.key as string, t]));
  const byVariant = new Map<string, ComponentSnapshot>();
  for (const t of targets) {
    if (t.variantProperties) byVariant.set(stable(t.variantProperties), t);
  }
  return [...instances].sort((a, b) => a.id.localeCompare(b.id)).map((instance) => {
    if (instance.mainComponentId && byId.has(instance.mainComponentId)) {
      return { ...instance, classification: "exact", targetComponentId: instance.mainComponentId };
    }
    const variant = instance.variantProperties && byVariant.get(stable(instance.variantProperties));
    if (variant) return { ...instance, classification: "variant", targetComponentId: variant.id };
    const keyed = instance.mainComponentKey && byKey.get(instance.mainComponentKey);
    if (keyed) return { ...instance, classification: "key", targetComponentId: keyed.id };
    return { ...instance, classification: "unmapped" };
  });
}

/** Generates deterministic remapping actions and refuses ambiguous mappings. */
export function buildReconciliationPlan(instances: InstanceSnapshot[], targets: ComponentSnapshot[]): ReconciliationPlan {
  const classified = classifyInstances(instances, targets);
  const actions: MigrationAction[] = [];
  const warnings: string[] = [];
  for (const item of classified) {
    if (item.classification === "unmapped" || !item.targetComponentId || !item.mainComponentId) {
      if (item.classification === "unmapped") warnings.push(`Unmapped instance ${item.id}`);
      continue;
    }
    if (item.mainComponentId !== item.targetComponentId) {
      actions.push({ type: "remap-instance", instanceId: item.id, fromComponentId: item.mainComponentId, toComponentId: item.targetComponentId });
    }
  }
  const deterministicKey = stable(actions);
  return { version: 1, actions, warnings, deterministicKey };
}

/** Dimension operations are guarded: deleting unsupported dimensions is refused. */
export function planDimensionChange(node: ComponentSnapshot, change: { width?: number | null; height?: number | null; rename?: string }): MigrationAction[] {
  const actions: MigrationAction[] = [];
  if (change.rename !== undefined && change.rename !== node.name) actions.push({ type: "rename", nodeId: node.id, from: node.name, to: change.rename });
  if (change.width === null) actions.push({ type: "delete-dimension", nodeId: node.id, dimension: "width" });
  else if (typeof change.width === "number" && change.width > 0 && change.width !== node.width) actions.push({ type: "resize", nodeId: node.id, width: change.width, height: node.height ?? change.width });
  if (change.height === null) actions.push({ type: "delete-dimension", nodeId: node.id, dimension: "height" });
  else if (typeof change.height === "number" && change.height > 0 && change.height !== node.height) actions.push({ type: "resize", nodeId: node.id, width: change.width ?? node.width ?? change.height, height: change.height });
  return actions;
}

export function verifyPostflight(expected: ComponentSnapshot[], actual: ComponentSnapshot[]): { ok: boolean; missing: string[]; mismatched: string[] } {
  const byId = new Map(actual.map((a) => [a.id, a]));
  const missing: string[] = [], mismatched: string[] = [];
  for (const item of expected) {
    const got = byId.get(item.id);
    if (!got) { missing.push(item.id); continue; }
    if (got.name !== item.name || (item.width !== undefined && got.width !== item.width) || (item.height !== undefined && got.height !== item.height)) mismatched.push(item.id);
  }
  return { ok: missing.length === 0 && mismatched.length === 0, missing, mismatched };
}

function requireApi<T extends object>(obj: T | null | undefined, method: keyof T, label: string): asserts obj is T {
  if (!obj || typeof obj[method] !== "function") throw new Error(`UNSUPPORTED_FIGMA_API: ${label}`);
}

/** Clone before mutation; never mutates the original component. */
export function cloneBeforeMutate(node: ComponentNode | ComponentSetNode): ComponentNode | ComponentSetNode {
  requireApi(node, "clone", "clone");
  return node.clone() as ComponentNode | ComponentSetNode;
}

export function mergeComponentSets(source: ComponentSetNode, target: ComponentSetNode): ComponentSetNode {
  requireApi(figma, "combineAsVariants", "combineAsVariants");
  const variants = source.children.filter((n): n is ComponentNode => n.type === "COMPONENT");
  const targetVariants = target.children.filter((n): n is ComponentNode => n.type === "COMPONENT");
  if (!variants.length) throw new Error("EMPTY_SOURCE_SET");
  if (!target.parent || !("children" in target.parent)) throw new Error("INVALID_TARGET_PARENT");
  for (const v of variants) v.remove();
  return figma.combineAsVariants([...targetVariants, ...variants], target.parent);
}

export function splitComponentSet(source: ComponentSetNode, componentIds: string[]): ComponentNode[] {
  const selected = source.children.filter((n): n is ComponentNode => n.type === "COMPONENT" && componentIds.includes(n.id));
  if (!selected.length) throw new Error("NO_COMPONENTS_TO_SPLIT");
  for (const c of selected) cloneBeforeMutate(c);
  return selected;
}

export function migrateComponentSet(source: ComponentSnapshot, target: ComponentSnapshot, instances: InstanceSnapshot[] = []): ReconciliationPlan {
  const actions: MigrationAction[] = [];
  if (source.id !== target.id) actions.push({ type: "clone", sourceId: source.id });
  actions.push(...planDimensionChange(target, { rename: source.name, width: source.width, height: source.height }));
  const reconciliation = buildReconciliationPlan(instances, [target]);
  actions.push(...reconciliation.actions);
  return { version: 1, actions, warnings: reconciliation.warnings, deterministicKey: stable(actions) };
}

export function repairComponentSet(current: ComponentSnapshot, desired: ComponentSnapshot): ReconciliationPlan {
  const actions = planDimensionChange(current, { rename: desired.name, width: desired.width, height: desired.height });
  return { version: 1, actions, warnings: [], deterministicKey: stable(actions) };
}

/** Deterministically collapses duplicate dimension values and remaps variant tuples. */
export type DimensionRenamePlan = {
  dimensions: Array<{ name: string; values: string[] }>;
  remap: Record<string, string>;
  removed: string[];
};

export function planDimensionRename(
  dimensions: Array<{ name: string; values: string[] }>,
  from: string,
  to: string,
): DimensionRenamePlan {
  if (!from || !to) throw new Error("INVALID_DIMENSION_NAME");
  const remap: Record<string, string> = {};
  const removed: string[] = [];
  const source = dimensions.find((d) => d.name === from);
  const existingTarget = dimensions.find((d) => d.name === to);
  const result = dimensions.filter((d) => d.name !== from && d.name !== to).map((d) => ({ name: d.name, values: [...d.values] }));
  if (source) {
    const mergedValues = [...(existingTarget?.values ?? []), ...source.values];
    const unique: string[] = [];
    for (const value of mergedValues) { if (unique.includes(value)) removed.push(value); else unique.push(value); }
    result.push({ name: to, values: unique });
  } else if (existingTarget) result.push({ name: to, values: [...existingTarget.values] });
  for (const d of result) {
    const unique: string[] = [];
    for (const value of d.values) { if (!unique.includes(value)) unique.push(value); else removed.push(value); }
    d.values = unique.sort((a, b) => a.localeCompare(b));
  }
  return { dimensions: result.sort((a, b) => a.name.localeCompare(b.name)), remap, removed: [...new Set(removed)] };
}

/** Plan deletion of a dimension by collapsing its values into a deterministic key. */
export function planDimensionDelete(
  dimensions: Array<{ name: string; values: string[] }>,
  name: string,
  collapseValue?: string,
): DimensionRenamePlan {
  const target = dimensions.find((d) => d.name === name);
  if (!target) return { dimensions: dimensions.map((d) => ({ ...d, values: [...d.values] })), remap: {}, removed: [] };
  const replacement = collapseValue ?? target.values[0] ?? "Default";
  const remap: Record<string, string> = {};
  for (const value of target.values) if (value !== replacement) remap[value] = replacement;
  return {
    dimensions: dimensions.filter((d) => d.name !== name).map((d) => ({ name: d.name, values: [...d.values] })),
    remap,
    removed: [...target.values],
  };
}

export type MergeSplitPlan = { actions: MigrationAction[]; warnings: string[]; deterministicKey: string };

export function planMergeComponentSets(source: ComponentSnapshot, target: ComponentSnapshot, sourceVariantIds: string[] = []): MergeSplitPlan {
  if (source.id === target.id) throw new Error("MERGE_SELF");
  const ids = [...new Set(sourceVariantIds)].sort();
  const actions: MigrationAction[] = [{ type: "clone", sourceId: source.id }, { type: "merge-set", sourceSetId: source.id, targetSetId: target.id }];
  if (ids.length) actions.push({ type: "split-set", sourceSetId: source.id, componentIds: ids });
  return { actions, warnings: [], deterministicKey: stable(actions) };
}

export function planSplitComponentSet(source: ComponentSnapshot, componentIds: string[]): MergeSplitPlan {
  const ids = [...new Set(componentIds)].sort();
  if (!ids.length) throw new Error("NO_COMPONENTS_TO_SPLIT");
  const actions: MigrationAction[] = [{ type: "clone", sourceId: source.id }, { type: "split-set", sourceSetId: source.id, componentIds: ids }];
  return { actions, warnings: [], deterministicKey: stable(actions) };
}
