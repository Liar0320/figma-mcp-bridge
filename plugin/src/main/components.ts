export type LocalComponentWarning = {
  code?: "PAGE_LOAD_FAILED" | "NODE_SERIALIZE_FAILED";
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

export type LocalComponentsResult = {
  version: 1;
  fileName: string;
  summary: {
    componentCount: number;
    componentSetCount: number;
    standaloneComponentCount: number;
    variantCount: number;
    warningCount: number;
  };
  componentSets: LocalComponentSetMetadata[];
  standaloneComponents: LocalComponentMetadata[];
  components: LocalComponentMetadata[];
  warnings: LocalComponentWarning[];
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

export const collectLocalComponents = async (): Promise<LocalComponentsResult> => {
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
      message: `Failed to traverse local components: ${errorMessage(error)}`,
    });
  }

  try {
    componentSets = figma.root.findAll(
      (node) => node.type === "COMPONENT_SET"
    ) as ComponentSetNode[];
  } catch (error) {
    warnings.push({
      message: `Failed to traverse local component sets: ${errorMessage(error)}`,
    });
  }

  const serializedSets = componentSets
    .map((set) => serializeComponentSet(set, warnings))
    .filter((set): set is LocalComponentSetMetadata => set !== null);

  const variantIds = new Set(
    serializedSets.flatMap((set) => set.variants.map((variant) => variant.componentId))
  );

  const serializedComponents = components
    .map((component) => serializeComponent(component, warnings))
    .filter((component): component is LocalComponentMetadata => component !== null);

  const standaloneComponents = serializedComponents.filter(
    (component) => !component.componentSetId && !variantIds.has(component.componentId)
  );

  const nestedVariants = serializedSets.flatMap((set) => set.variants);
  const componentById = new Map<string, LocalComponentMetadata>();
  for (const component of [...serializedComponents, ...nestedVariants]) {
    componentById.set(component.componentId, component);
  }
  const allComponents = [...componentById.values()];

  return {
    version: 1,
    fileName: figma.root.name,
    summary: {
      componentCount: allComponents.length,
      componentSetCount: serializedSets.length,
      standaloneComponentCount: standaloneComponents.length,
      variantCount: nestedVariants.length,
      warningCount: warnings.length,
    },
    componentSets: serializedSets,
    standaloneComponents,
    components: allComponents,
    warnings,
  };
};
