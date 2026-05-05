import { auditDesignTokens, type TokenAuditResponse } from "./tokenAudit";
import { collectDesignTokens, type NormalizedToken, type TokenGroup } from "./tokens";
import { collectTokenUsage, type TokenUsageEntry, type TokenUsageResponse } from "./tokenUsage";

export type TokenProposalReason = "repeated-unbound-value" | "repeated-exact-value-match" | "duplicate-token-consolidation";

export type ExistingTokenValueConflict = {
  tokenPath: string;
  group: TokenGroup;
  value: unknown;
  figmaId?: string;
};

export type ProposedDesignToken = {
  id: string;
  group: TokenGroup;
  name: string;
  path: string;
  value: unknown;
  confidence: number;
  reason: TokenProposalReason;
  occurrences: number;
  nodes: Array<{ nodeId: string; nodeName: string; property: string }>;
  basedOnTokenPaths?: string[];
  conflictsWithExistingTokenValue?: ExistingTokenValueConflict[];
  recommendedAction?: "create-semantic-radius-token" | "create-semantic-float-token" | "reuse-existing-token" | "manual-review";
  requiresManualReview?: boolean;
  creationHint: {
    recommendedSource: "variable" | "style";
    variableType?: "COLOR" | "FLOAT" | "STRING" | "BOOLEAN";
    styleType?: "paint" | "text" | "effect" | "grid";
    collectionName?: string;
    dryRunRequired: true;
  };
};

export type TokenProposalOptions = {
  minOccurrences?: number;
  includeExactValueMatches?: boolean;
  includeDuplicateTokenValues?: boolean;
  maxProposals?: number;
};

export type TokenProposalResponse = {
  version: 1;
  fileName: string;
  currentPage: { id: string; name: string };
  scope: TokenUsageResponse["scope"];
  summary: {
    proposalCount: number;
    byGroup: Partial<Record<TokenGroup, number>>;
    byReason: Partial<Record<TokenProposalReason, number>>;
  };
  proposals: ProposedDesignToken[];
  source: {
    auditSummary: TokenAuditResponse["summary"];
    usageSummary: TokenUsageResponse["summary"];
    warnings?: TokenUsageResponse["warnings"];
  };
};

const DEFAULT_MIN_OCCURRENCES = 2;
const DEFAULT_MAX_PROPOSALS = 50;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (isObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

const normalizeTokenSegment = (segment: string): string =>
  segment
    .trim()
    .normalize("NFKC")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

const valueSignature = (group: TokenGroup, value: unknown): string => `${group}:${stableStringify(value)}`;

const shortHash = (value: string): string => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).slice(0, 6);
};

const valueLabel = (group: TokenGroup, value: unknown): string => {
  if (isObject(value)) {
    if (typeof value.color === "string") return value.color.replace(/^#/, "");
    if (value.fontName && value.fontSize) return `text-${String(value.fontSize)}`;
  }
  if (typeof value === "number") return String(value).replace(/\./g, "-");
  if (typeof value === "string") return value;
  return shortHash(stableStringify(value));
};

const proposalName = (group: TokenGroup, value: unknown): string => {
  const label = normalizeTokenSegment(valueLabel(group, value)) || shortHash(stableStringify(value));
  return `${group}/proposed/${label}`;
};

const proposalPath = (group: TokenGroup, name: string): string =>
  [group, ...name.split("/").slice(1).map(normalizeTokenSegment).filter(Boolean)].join(".");

const recommendedSource = (group: TokenGroup): ProposedDesignToken["creationHint"] => {
  switch (group) {
    case "color":
      return { recommendedSource: "variable", variableType: "COLOR", collectionName: "Design Tokens", dryRunRequired: true };
    case "spacing":
    case "radius":
    case "size":
    case "opacity":
      return { recommendedSource: "variable", variableType: "FLOAT", collectionName: "Design Tokens", dryRunRequired: true };
    case "typography":
      return { recommendedSource: "style", styleType: "text", dryRunRequired: true };
    case "effect":
      return { recommendedSource: "style", styleType: "effect", dryRunRequired: true };
    case "grid":
      return { recommendedSource: "style", styleType: "grid", dryRunRequired: true };
    default:
      return { recommendedSource: "variable", collectionName: "Design Tokens", dryRunRequired: true };
  }
};

type UsageBucket = {
  group: TokenGroup;
  value: unknown;
  usages: TokenUsageEntry[];
  basedOnTokenPaths: Set<string>;
};

const FLOAT_SEMANTIC_GROUPS: TokenGroup[] = ["spacing", "radius", "size", "opacity"];

const existingSameValueConflicts = (tokens: NormalizedToken[], group: TokenGroup, value: unknown): ExistingTokenValueConflict[] => {
  if (typeof value !== "number" || !FLOAT_SEMANTIC_GROUPS.includes(group)) return [];
  const valueKey = stableStringify(value);
  return tokens
    .filter((token) => token.group !== group && FLOAT_SEMANTIC_GROUPS.includes(token.group) && stableStringify(token.value ?? token.valuesByMode) === valueKey)
    .map((token) => ({
      tokenPath: token.path,
      group: token.group,
      value: token.value ?? token.valuesByMode,
      figmaId: token.figmaId,
    }));
};

const recommendedActionForCrossGroup = (group: TokenGroup): ProposedDesignToken["recommendedAction"] => {
  if (group === "radius") return "create-semantic-radius-token";
  if (FLOAT_SEMANTIC_GROUPS.includes(group)) return "create-semantic-float-token";
  return "manual-review";
};

const pushUsageBucketProposal = (
  proposals: ProposedDesignToken[],
  bucket: UsageBucket,
  reason: TokenProposalReason,
  existingTokens: NormalizedToken[],
): void => {
  const name = proposalName(bucket.group, bucket.value);
  const signature = valueSignature(bucket.group, bucket.value);
  const conflictsWithExistingTokenValue = existingSameValueConflicts(existingTokens, bucket.group, bucket.value);
  proposals.push({
    id: `proposal:${reason}:${shortHash(signature)}`,
    group: bucket.group,
    name,
    path: proposalPath(bucket.group, name),
    value: bucket.value,
    confidence: reason === "repeated-unbound-value" ? 0.8 : 0.6,
    reason,
    occurrences: bucket.usages.length,
    nodes: bucket.usages.map((usage) => ({
      nodeId: usage.nodeId,
      nodeName: usage.nodeName,
      property: usage.property,
    })),
    basedOnTokenPaths: bucket.basedOnTokenPaths.size > 0 ? [...bucket.basedOnTokenPaths] : undefined,
    conflictsWithExistingTokenValue: conflictsWithExistingTokenValue.length > 0 ? conflictsWithExistingTokenValue : undefined,
    recommendedAction: conflictsWithExistingTokenValue.length > 0 ? recommendedActionForCrossGroup(bucket.group) : undefined,
    requiresManualReview: conflictsWithExistingTokenValue.length > 0 ? true : undefined,
    creationHint: recommendedSource(bucket.group),
  });
};

export function proposeDesignTokensFromData(
  tokens: NormalizedToken[],
  usage: TokenUsageResponse,
  audit: TokenAuditResponse,
  options: TokenProposalOptions = {},
): TokenProposalResponse {
  const minOccurrences = options.minOccurrences ?? DEFAULT_MIN_OCCURRENCES;
  const maxProposals = options.maxProposals ?? DEFAULT_MAX_PROPOSALS;
  const proposals: ProposedDesignToken[] = [];

  const unboundBuckets = new Map<string, UsageBucket>();
  const exactBuckets = new Map<string, UsageBucket>();

  for (const usageEntry of usage.usages) {
    if (usageEntry.match.type !== "none" && usageEntry.match.type !== "exactValue") continue;
    const buckets = usageEntry.match.type === "none" ? unboundBuckets : exactBuckets;
    const key = valueSignature(usageEntry.group, usageEntry.value);
    const bucket = buckets.get(key) ?? {
      group: usageEntry.group,
      value: usageEntry.value,
      usages: [],
      basedOnTokenPaths: new Set<string>(),
    };
    bucket.usages.push(usageEntry);
    if (usageEntry.match.tokenPath) bucket.basedOnTokenPaths.add(usageEntry.match.tokenPath);
    buckets.set(key, bucket);
  }

  for (const bucket of [...unboundBuckets.values()].filter((item) => item.usages.length >= minOccurrences)) {
    pushUsageBucketProposal(proposals, bucket, "repeated-unbound-value", tokens);
  }

  if (options.includeExactValueMatches) {
    for (const bucket of [...exactBuckets.values()].filter((item) => item.usages.length >= minOccurrences)) {
      pushUsageBucketProposal(proposals, bucket, "repeated-exact-value-match", tokens);
    }
  }

  if (options.includeDuplicateTokenValues !== false) {
    const duplicates = new Map<string, NormalizedToken[]>();
    for (const token of tokens) {
      const value = token.value ?? token.valuesByMode;
      if (value === undefined) continue;
      const key = valueSignature(token.group, value);
      const bucket = duplicates.get(key) ?? [];
      bucket.push(token);
      duplicates.set(key, bucket);
    }

    for (const duplicateTokens of [...duplicates.values()].filter((items) => items.length > 1)) {
      const first = duplicateTokens[0];
      const value = first.value ?? first.valuesByMode;
      const name = proposalName(first.group, value);
      proposals.push({
        id: `proposal:duplicate-token-consolidation:${shortHash(valueSignature(first.group, value))}`,
        group: first.group,
        name,
        path: proposalPath(first.group, name),
        value,
        confidence: 0.55,
        reason: "duplicate-token-consolidation",
        occurrences: duplicateTokens.length,
        nodes: [],
        basedOnTokenPaths: duplicateTokens.map((token) => token.path),
        creationHint: recommendedSource(first.group),
      });
    }
  }

  const sorted = proposals
    .sort((a, b) => b.confidence - a.confidence || b.occurrences - a.occurrences || a.path.localeCompare(b.path))
    .slice(0, maxProposals);

  const byGroup: TokenProposalResponse["summary"]["byGroup"] = {};
  const byReason: TokenProposalResponse["summary"]["byReason"] = {};
  for (const proposal of sorted) {
    byGroup[proposal.group] = (byGroup[proposal.group] ?? 0) + 1;
    byReason[proposal.reason] = (byReason[proposal.reason] ?? 0) + 1;
  }

  return {
    version: 1,
    fileName: usage.fileName,
    currentPage: usage.currentPage,
    scope: usage.scope,
    summary: {
      proposalCount: sorted.length,
      byGroup,
      byReason,
    },
    proposals: sorted,
    source: {
      auditSummary: audit.summary,
      usageSummary: usage.summary,
      warnings: usage.warnings,
    },
  };
}

export async function collectDesignTokenProposals(
  nodeIds?: string[],
  options: TokenProposalOptions = {},
): Promise<TokenProposalResponse> {
  const [tokens, usage] = await Promise.all([collectDesignTokens(), collectTokenUsage(nodeIds)]);
  const audit = auditDesignTokens(tokens, usage, { includeUnusedTokens: true });
  return proposeDesignTokensFromData(tokens, usage, audit, options);
}
