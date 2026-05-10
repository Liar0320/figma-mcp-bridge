export type LocalComponentWarning = {
  code?:
    | "PAGE_LOAD_FAILED"
    | "PAGE_NOT_FOUND"
    | "NODE_SERIALIZE_FAILED"
    | "TRAVERSAL_FAILED"
    | "SKIPPED_TIME_BUDGET"
    | "SKIPPED_LIMIT";
  nodeId?: string;
  nodeName?: string;
  pageId?: string;
  pageName?: string;
  type?: string;
  message: string;
  details?: unknown;
};

export type LocalComponentMetadata = {
  componentId: string;
  id: string;
  name: string;
  type: "COMPONENT";
  pageId?: string;
  pageName?: string;
  key?: string;
  description?: string;
  variantProperties?: Record<string, string> | null;
  componentPropertyDefinitions?: ComponentPropertyDefinitions | null;
  componentSetId?: string;
  componentSetName?: string;
};

export type LocalComponentSetMetadata = {
  componentId: string;
  id: string;
  name: string;
  type: "COMPONENT_SET";
  pageId?: string;
  pageName?: string;
  key?: string;
  description?: string;
  componentPropertyDefinitions?: ComponentPropertyDefinitions | null;
  variants: LocalComponentMetadata[];
};

export type LocalComponentsOptions = {
  /** Maximum number of top-level inventory entries to return (component sets + standalone components). */
  limit?: number;
  /** Restrict the scan to a single page. */
  pageId?: string;
  /** Opaque pagination cursor returned by a previous bounded call. Numeric page-index cursors are still accepted. */
  cursor?: string;
  /** Best-effort wall-clock budget for page loading/traversal. */
  maxDurationMs?: number;
};

export type LocalComponentsSummary = {
  componentCount: number;
  componentSetCount: number;
  standaloneComponentCount: number;
  variantCount: number;
  warningCount: number;
  /** True when every requested page was scanned without hitting a limit or time budget. */
  complete?: boolean;
  /** True when results are partial due to limit, cursor, page failure, or time budget. */
  truncated?: boolean;
  /** Cursor to pass to the next request when results are paginated/truncated by page. */
  nextCursor?: string;
  /** Count of top-level inventory entries returned (component sets + standalone components). */
  returnedCount?: number;
  /** Effective top-level entry limit, when provided. */
  limit?: number;
  /** Effective page traversal budget, when provided. */
  maxDurationMs?: number;
  /** Total pages in the document at the time of the scan. */
  pageCount?: number;
  /** Number of requested pages successfully loaded and traversed. */
  pagesLoaded?: number;
  /** Number of requested pages that failed to load or traverse. */
  pagesFailed?: number;
  /** Number of pages skipped due to cursor, pageId selection, limit, or time budget. */
  pagesSkipped?: number;
  /** Page ids included in this scan attempt. */
  scannedPageIds?: string[];
  /** Page ids not scanned by this call. */
  skippedPageIds?: string[];
};

export type LocalComponentsResult = {
  version: 1;
  fileName: string;
  summary: LocalComponentsSummary;
  componentSets: LocalComponentSetMetadata[];
  standaloneComponents: LocalComponentMetadata[];
  components: LocalComponentMetadata[];
  warnings: LocalComponentWarning[];
};

type ComponentCollections = {
  componentSets: LocalComponentSetMetadata[];
  standaloneComponents: LocalComponentMetadata[];
  components: LocalComponentMetadata[];
};

const getPageInfo = (node: BaseNode): { pageId?: string; pageName?: string } => {
  let current: BaseNode | null = node;
  while (current) {
    if (current.type === "PAGE") {
      return { pageId: current.id, pageName: current.name };
    }
    current = current.parent;
  }
  return {};
};

const clonePlain = <T>(value: T): T => {
  if (value === undefined || value === null) return value;
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return value;
  }
};

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const nodeSerializeWarning = (
  node: ComponentNode | ComponentSetNode,
  message: string,
  details?: unknown
): LocalComponentWarning => ({
  code: "NODE_SERIALIZE_FAILED",
  nodeId: node.id,
  nodeName: node.name,
  type: node.type,
  ...getPageInfo(node),
  message,
  details,
});

const readComponentPropertyDefinitions = (
  node: ComponentNode | ComponentSetNode,
  warnings: LocalComponentWarning[]
): ComponentPropertyDefinitions | null => {
  try {
    return clonePlain(node.componentPropertyDefinitions ?? null);
  } catch (error) {
    const message = errorMessage(error);
    warnings.push({
      ...nodeSerializeWarning(
        node,
        `Failed to read componentPropertyDefinitions: ${message}`,
        { message, field: "componentPropertyDefinitions" }
      ),
    });
    return null;
  }
};

const serializeComponent = (
  component: ComponentNode,
  warnings: LocalComponentWarning[],
  componentSet?: ComponentSetNode
): LocalComponentMetadata | null => {
  try {
    const page = getPageInfo(component);
    const isVariant = componentSet ?? (component.parent?.type === "COMPONENT_SET" ? component.parent : undefined);
    const metadata: LocalComponentMetadata = {
      componentId: component.id,
      id: component.id,
      name: component.name,
      type: "COMPONENT",
      ...page,
      key: component.key,
      description: component.description,
      variantProperties: clonePlain(component.variantProperties ?? null),
      componentPropertyDefinitions: isVariant
        ? null
        : readComponentPropertyDefinitions(component, warnings),
    };

    if (isVariant) {
      metadata.componentSetId = isVariant.id;
      metadata.componentSetName = isVariant.name;
    }

    return metadata;
  } catch (error) {
    const message = errorMessage(error);
    warnings.push({
      ...nodeSerializeWarning(component, `Failed to read component metadata: ${message}`, { message }),
    });
    return null;
  }
};

const serializeComponentSet = (
  componentSet: ComponentSetNode,
  warnings: LocalComponentWarning[]
): LocalComponentSetMetadata | null => {
  try {
    const page = getPageInfo(componentSet);
    const variants: LocalComponentMetadata[] = [];
    for (const child of componentSet.children) {
      if (child.type !== "COMPONENT") continue;
      const variant = serializeComponent(child, warnings, componentSet);
      if (variant) variants.push(variant);
    }

    return {
      componentId: componentSet.id,
      id: componentSet.id,
      name: componentSet.name,
      type: "COMPONENT_SET",
      ...page,
      key: componentSet.key,
      description: componentSet.description,
      componentPropertyDefinitions: readComponentPropertyDefinitions(componentSet, warnings),
      variants,
    };
  } catch (error) {
    const message = errorMessage(error);
    warnings.push({
      ...nodeSerializeWarning(componentSet, `Failed to read component set metadata: ${message}`, { message }),
    });
    return null;
  }
};

const buildResult = (
  warnings: LocalComponentWarning[],
  componentSets: LocalComponentSetMetadata[],
  standaloneComponents: LocalComponentMetadata[],
  summaryExtras: Partial<LocalComponentsSummary> = {}
): LocalComponentsResult => {
  const nestedVariants = componentSets.flatMap((set) => set.variants);
  const componentById = new Map<string, LocalComponentMetadata>();
  for (const component of [...standaloneComponents, ...nestedVariants]) {
    componentById.set(component.componentId, component);
  }
  const allComponents = [...componentById.values()];

  return {
    version: 1,
    fileName: figma.root.name,
    summary: {
      componentCount: allComponents.length,
      componentSetCount: componentSets.length,
      standaloneComponentCount: standaloneComponents.length,
      variantCount: nestedVariants.length,
      ...summaryExtras,
      warningCount: warnings.length,
    },
    componentSets,
    standaloneComponents,
    components: allComponents,
    warnings,
  };
};

const isBoundedScan = (options: LocalComponentsOptions): boolean =>
  options.limit !== undefined ||
  options.pageId !== undefined ||
  options.cursor !== undefined ||
  options.maxDurationMs !== undefined;

type LocalComponentsCursor = { pageIndex: number; entryOffset: number };

const parseCursor = (cursor: string | undefined, pageCount: number): LocalComponentsCursor => {
  if (!cursor) return { pageIndex: 0, entryOffset: 0 };

  const parts = cursor.split(":");
  const parsedPageIndex = Number.parseInt(parts[0] ?? "", 10);
  const parsedEntryOffset = parts.length > 1 ? Number.parseInt(parts[1] ?? "", 10) : 0;

  if (!Number.isFinite(parsedPageIndex) || parsedPageIndex < 0) {
    return { pageIndex: 0, entryOffset: 0 };
  }

  return {
    pageIndex: Math.min(parsedPageIndex, pageCount),
    entryOffset: Number.isFinite(parsedEntryOffset) && parsedEntryOffset > 0 ? parsedEntryOffset : 0,
  };
};

const formatCursor = (pageIndex: number, entryOffset = 0): string =>
  entryOffset > 0 ? `${pageIndex}:${entryOffset}` : String(pageIndex);

const hasTimeRemaining = (startedAt: number, maxDurationMs?: number): boolean =>
  maxDurationMs === undefined || Date.now() - startedAt < maxDurationMs;

const pushUnique = <T extends { componentId: string }>(items: T[], item: T): void => {
  if (!items.some((existing) => existing.componentId === item.componentId)) {
    items.push(item);
  }
};

const collectFromNodes = (
  components: ComponentNode[],
  componentSets: ComponentSetNode[],
  warnings: LocalComponentWarning[],
  options: {
    limit?: number;
    returnedCount?: number;
    startOffset?: number;
    onLimit?: (returnedCount: number) => void;
  } = {}
): ComponentCollections & { returnedCount: number; hitLimit: boolean; nextOffset: number; hasMoreEntries: boolean } => {
  const serializedSets: LocalComponentSetMetadata[] = [];
  const standaloneComponents: LocalComponentMetadata[] = [];
  const limit = options.limit;
  const startOffset = options.startOffset ?? 0;
  let returnedCount = options.returnedCount ?? 0;
  let hitLimit = false;
  let nextOffset = Math.max(0, startOffset);

  const canReturn = (): boolean => limit === undefined || returnedCount < limit;
  const noteLimit = () => {
    hitLimit = true;
    options.onLimit?.(returnedCount);
  };

  const variantIds = new Set<string>();
  for (const set of componentSets) {
    for (const child of set.children) {
      if (child.type === "COMPONENT") variantIds.add(child.id);
    }
  }

  const standaloneTopLevelComponents = components.filter(
    (component) => component.parent?.type !== "COMPONENT_SET" && !variantIds.has(component.id)
  );
  const topLevelEntries: Array<
    | { type: "COMPONENT_SET"; node: ComponentSetNode }
    | { type: "COMPONENT"; node: ComponentNode }
  > = [
    ...componentSets.map((node) => ({ type: "COMPONENT_SET" as const, node })),
    ...standaloneTopLevelComponents.map((node) => ({ type: "COMPONENT" as const, node })),
  ];

  for (let entryIndex = startOffset; entryIndex < topLevelEntries.length; entryIndex += 1) {
    if (!canReturn()) {
      nextOffset = entryIndex;
      noteLimit();
      break;
    }

    const entry = topLevelEntries[entryIndex];
    nextOffset = entryIndex + 1;
    if (entry.type === "COMPONENT_SET") {
      const serializedSet = serializeComponentSet(entry.node, warnings);
      if (!serializedSet) continue;
      serializedSets.push(serializedSet);
      returnedCount += 1;
    } else {
      const serialized = serializeComponent(entry.node, warnings);
      if (!serialized) continue;
      pushUnique(standaloneComponents, serialized);
      returnedCount += 1;
    }
  }

  const nestedVariants = serializedSets.flatMap((set) => set.variants);
  return {
    componentSets: serializedSets,
    standaloneComponents,
    components: [...standaloneComponents, ...nestedVariants],
    returnedCount,
    hitLimit,
    nextOffset,
    hasMoreEntries: nextOffset < topLevelEntries.length,
  };
};

const loadPage = async (page: PageNode): Promise<void> => {
  if (typeof page.loadAsync === "function") {
    await page.loadAsync();
  }
};

const collectBoundedLocalComponents = async (
  options: LocalComponentsOptions
): Promise<LocalComponentsResult> => {
  const warnings: LocalComponentWarning[] = [];
  const componentSets: LocalComponentSetMetadata[] = [];
  const standaloneComponents: LocalComponentMetadata[] = [];
  const pages = figma.root.children;
  const startedAt = Date.now();
  const cursor = parseCursor(options.cursor, pages.length);
  const startIndex = cursor.pageIndex;
  let pagesLoaded = 0;
  let pagesFailed = 0;
  let pagesSkipped = 0;
  let returnedCount = 0;
  let complete = true;
  let truncated = false;
  let nextCursor: string | undefined;
  const scannedPageIds: string[] = [];
  const skippedPageIds: string[] = [];
  let limitWarningAdded = false;

  const addLimitWarning = (limitReturnedCount = returnedCount) => {
    if (limitWarningAdded) return;
    limitWarningAdded = true;
    warnings.push({
      code: "SKIPPED_LIMIT",
      message: `Stopped local component scan after returning ${limitReturnedCount} top-level entries because limit ${options.limit} was reached.`,
      details: { limit: options.limit, returnedCount: limitReturnedCount },
    });
  };

  let pageEntries: Array<{ page: PageNode; index: number }>;
  if (options.pageId) {
    const node = await figma.getNodeByIdAsync(options.pageId);
    if (!node || node.type !== "PAGE") {
      warnings.push({
        code: "PAGE_NOT_FOUND",
        pageId: options.pageId,
        message: `Page not found for local component scan: ${options.pageId}`,
        details: { pageId: options.pageId },
      });
      return buildResult(warnings, [], [], {
        complete: false,
        truncated: true,
        returnedCount: 0,
        limit: options.limit,
        maxDurationMs: options.maxDurationMs,
        pageCount: pages.length,
        pagesLoaded,
        pagesFailed,
        pagesSkipped: pages.length,
        scannedPageIds,
        skippedPageIds: pages.map((page) => page.id),
      });
    }
    const index = pages.findIndex((page) => page.id === node.id);
    pageEntries = [{ page: node as PageNode, index: index >= 0 ? index : 0 }];
    pagesSkipped = Math.max(0, pages.length - 1);
    skippedPageIds.push(...pages.filter((page) => page.id !== node.id).map((page) => page.id));
  } else {
    pageEntries = pages.slice(startIndex).map((page, offset) => ({ page, index: startIndex + offset }));
    pagesSkipped = startIndex;
    skippedPageIds.push(...pages.slice(0, startIndex).map((page) => page.id));
  }

  for (const { page, index } of pageEntries) {
    if (!hasTimeRemaining(startedAt, options.maxDurationMs)) {
      complete = false;
      truncated = true;
      nextCursor = formatCursor(index);
      const remaining = pageEntries.slice(pageEntries.findIndex((entry) => entry.index === index));
      pagesSkipped += remaining.length;
      skippedPageIds.push(...remaining.map((entry) => entry.page.id));
      warnings.push({
        code: "SKIPPED_TIME_BUDGET",
        pageId: page.id,
        pageName: page.name,
        message: `Stopped local component scan before page ${page.name} because maxDurationMs ${options.maxDurationMs} was reached.`,
        details: { maxDurationMs: options.maxDurationMs, elapsedMs: Date.now() - startedAt, nextCursor },
      });
      break;
    }

    scannedPageIds.push(page.id);
    try {
      await loadPage(page);
      const pageComponentSets = page.findAll(
        (node) => node.type === "COMPONENT_SET"
      ) as ComponentSetNode[];
      const pageComponents = page.findAll(
        (node) => node.type === "COMPONENT"
      ) as ComponentNode[];
      const pageResult = collectFromNodes(pageComponents, pageComponentSets, warnings, {
        limit: options.limit,
        returnedCount,
        startOffset: options.pageId ? cursor.entryOffset : index === startIndex ? cursor.entryOffset : 0,
        onLimit: addLimitWarning,
      });
      componentSets.push(...pageResult.componentSets);
      standaloneComponents.push(...pageResult.standaloneComponents);
      returnedCount = pageResult.returnedCount;
      pagesLoaded += 1;
      const remaining = pageEntries.filter((entry) => entry.index > index);
      const reachedLimitWithMoreEntries =
        options.limit !== undefined &&
        returnedCount >= options.limit &&
        (pageResult.hasMoreEntries || remaining.length > 0);
      if (pageResult.hitLimit || reachedLimitWithMoreEntries) {
        complete = false;
        truncated = true;
        nextCursor = pageResult.hasMoreEntries
          ? formatCursor(index, pageResult.nextOffset)
          : options.pageId
            ? undefined
            : formatCursor(index + 1);
        addLimitWarning(returnedCount);
        pagesSkipped += remaining.length;
        skippedPageIds.push(...remaining.map((entry) => entry.page.id));
        break;
      }
    } catch (error) {
      const message = errorMessage(error);
      pagesFailed += 1;
      complete = false;
      truncated = true;
      warnings.push({
        code: "PAGE_LOAD_FAILED",
        pageId: page.id,
        pageName: page.name,
        message: `Failed to load or traverse page during local component scan: ${message}`,
        details: { message },
      });
    }
  }

  if (!options.pageId && !nextCursor && !complete) {
    const lastScannedIndex = scannedPageIds.length
      ? pages.findIndex((page) => page.id === scannedPageIds[scannedPageIds.length - 1]) + 1
      : startIndex;
    if (lastScannedIndex < pages.length) nextCursor = formatCursor(lastScannedIndex);
  }

  return buildResult(warnings, componentSets, standaloneComponents, {
    complete,
    truncated,
    nextCursor,
    returnedCount,
    limit: options.limit,
    maxDurationMs: options.maxDurationMs,
    pageCount: pages.length,
    pagesLoaded,
    pagesFailed,
    pagesSkipped,
    scannedPageIds,
    skippedPageIds,
  });
};

const collectUnboundedLocalComponents = async (): Promise<LocalComponentsResult> => {
  const warnings: LocalComponentWarning[] = [];
  let components: ComponentNode[] = [];
  let componentSets: ComponentSetNode[] = [];

  try {
    await figma.loadAllPagesAsync();
  } catch (error) {
    const message = errorMessage(error);
    warnings.push({
      code: "PAGE_LOAD_FAILED",
      message: `Failed to load all pages before component traversal: ${message}`,
      details: { message },
    });
  }

  try {
    components = figma.root.findAll(
      (node) => node.type === "COMPONENT"
    ) as ComponentNode[];
  } catch (error) {
    warnings.push({
      code: "TRAVERSAL_FAILED",
      message: `Failed to traverse local components: ${errorMessage(error)}`,
    });
  }

  try {
    componentSets = figma.root.findAll(
      (node) => node.type === "COMPONENT_SET"
    ) as ComponentSetNode[];
  } catch (error) {
    warnings.push({
      code: "TRAVERSAL_FAILED",
      message: `Failed to traverse local component sets: ${errorMessage(error)}`,
    });
  }

  const collections = collectFromNodes(components, componentSets, warnings);
  return buildResult(warnings, collections.componentSets, collections.standaloneComponents);
};

export const collectLocalComponents = async (
  options: LocalComponentsOptions = {}
): Promise<LocalComponentsResult> => {
  if (isBoundedScan(options)) {
    return collectBoundedLocalComponents(options);
  }
  return collectUnboundedLocalComponents();
};
