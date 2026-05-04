import { collectDesignTokens, type NormalizedToken, type TokenGroup } from "./tokens";
import { collectTokenUsage, type TokenUsageEntry, type TokenUsageResponse } from "./tokenUsage";

export type TokenAuditSeverity = "info" | "warning" | "error";

export type TokenAuditIssueCode =
  | "LOW_COVERAGE"
  | "EMPTY_TOKEN_GRAPH"
  | "EMPTY_USAGE_SCAN"
  | "UNBOUND_USAGE"
  | "EXACT_VALUE_ONLY"
  | "DUPLICATE_TOKEN_VALUE"
  | "UNKNOWN_TOKEN_GROUP"
  | "MISSING_MODES"
  | "UNUSED_TOKEN";

export type TokenAuditIssue = {
  code: TokenAuditIssueCode;
  severity: TokenAuditSeverity;
  message: string;
  group?: TokenGroup;
  tokenPath?: string;
  tokenPaths?: string[];
  nodeId?: string;
  nodeName?: string;
  property?: string;
  value?: unknown;
  evidence?: Record<string, unknown>;
};

export type TokenAuditRecommendation = {
  priority: "high" | "medium" | "low";
  message: string;
  issueCodes: TokenAuditIssueCode[];
};

export type TokenAuditOptions = {
  minCoverage?: number;
  includeUnusedTokens?: boolean;
};

export type TokenAuditResponse = {
  version: 1;
  fileName: string;
  currentPage: { id: string; name: string };
  scope: TokenUsageResponse["scope"];
  summary: {
    tokenCount: number;
    usageCount: number;
    coverage: number | null;
    issueCount: number;
    bySeverity: Record<TokenAuditSeverity, number>;
    byCode: Partial<Record<TokenAuditIssueCode, number>>;
    byGroup: Partial<Record<TokenGroup, { tokenCount: number; usageCount: number; issueCount: number }>>;
  };
  issues: TokenAuditIssue[];
  recommendations: TokenAuditRecommendation[];
  source: {
    tokenSummary: {
      total: number;
      bySource: Record<NormalizedToken["source"], number>;
      byGroup: Partial<Record<TokenGroup, number>>;
    };
    usageSummary: TokenUsageResponse["summary"];
    warnings?: TokenUsageResponse["warnings"];
  };
};

const DEFAULT_MIN_COVERAGE = 0.8;
const MAX_USAGE_ISSUES = 50;
const MAX_DUPLICATE_ISSUES = 25;
const MAX_UNUSED_ISSUES = 25;

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

const tokenValueSignature = (token: NormalizedToken): string | undefined => {
  if (token.value !== undefined) return stableStringify(token.value);
  if (token.valuesByMode) return stableStringify(token.valuesByMode);
  return undefined;
};

const usageIsHardcoded = (usage: TokenUsageEntry): boolean => usage.match.type === "none";

const usageIsExactOnly = (usage: TokenUsageEntry): boolean => usage.match.type === "exactValue";

const createBySeverity = (): Record<TokenAuditSeverity, number> => ({
  info: 0,
  warning: 0,
  error: 0,
});

export function auditDesignTokens(
  tokens: NormalizedToken[],
  usage: TokenUsageResponse,
  options: TokenAuditOptions = {},
): TokenAuditResponse {
  const minCoverage = options.minCoverage ?? DEFAULT_MIN_COVERAGE;
  const issues: TokenAuditIssue[] = [];

  if (tokens.length === 0) {
    issues.push({
      code: "EMPTY_TOKEN_GRAPH",
      severity: "warning",
      message: "No local variables or styles were found; design token adoption cannot be evaluated.",
    });
  }

  if (usage.summary.coverage === null) {
    issues.push({
      code: "EMPTY_USAGE_SCAN",
      severity: "info",
      message: "No token-eligible node properties were scanned; select nodes or provide scene node IDs to audit usage.",
      evidence: { scannedNodeCount: usage.scope.scannedNodeCount },
    });
  } else if (usage.summary.coverage < minCoverage) {
    issues.push({
      code: "LOW_COVERAGE",
      severity: "warning",
      message: `Token coverage is ${Math.round(usage.summary.coverage * 100)}%, below the configured ${Math.round(minCoverage * 100)}% threshold.`,
      evidence: {
        coverage: usage.summary.coverage,
        minCoverage,
        matchedUsages: usage.summary.matchedUsages,
        totalUsages: usage.summary.totalUsages,
      },
    });
  }

  for (const usageEntry of usage.usages.filter(usageIsHardcoded).slice(0, MAX_USAGE_ISSUES)) {
    issues.push({
      code: "UNBOUND_USAGE",
      severity: ["color", "typography"].includes(usageEntry.group) ? "warning" : "info",
      message: `${usageEntry.nodeName} uses an unbound ${usageEntry.group} value at ${usageEntry.property}.`,
      group: usageEntry.group,
      nodeId: usageEntry.nodeId,
      nodeName: usageEntry.nodeName,
      property: usageEntry.property,
      value: usageEntry.value,
    });
  }

  for (const usageEntry of usage.usages.filter(usageIsExactOnly).slice(0, MAX_USAGE_ISSUES)) {
    issues.push({
      code: "EXACT_VALUE_ONLY",
      severity: "info",
      message: `${usageEntry.nodeName} matches token ${usageEntry.match.tokenPath} by value only; bind the node to the variable or style for stronger design-system enforcement.`,
      group: usageEntry.group,
      tokenPath: usageEntry.match.tokenPath,
      nodeId: usageEntry.nodeId,
      nodeName: usageEntry.nodeName,
      property: usageEntry.property,
      value: usageEntry.value,
    });
  }

  const duplicateBuckets = new Map<string, NormalizedToken[]>();
  for (const token of tokens) {
    const signature = tokenValueSignature(token);
    if (!signature) continue;
    const key = `${token.group}:${signature}`;
    const bucket = duplicateBuckets.get(key) ?? [];
    bucket.push(token);
    duplicateBuckets.set(key, bucket);
  }

  for (const bucket of [...duplicateBuckets.values()].filter((items) => items.length > 1).slice(0, MAX_DUPLICATE_ISSUES)) {
    issues.push({
      code: "DUPLICATE_TOKEN_VALUE",
      severity: "info",
      message: `${bucket.length} ${bucket[0].group} tokens share the same normalized value. Consider consolidating aliases or naming intent clearly.`,
      group: bucket[0].group,
      tokenPaths: bucket.map((token) => token.path),
      value: bucket[0].value ?? bucket[0].valuesByMode,
    });
  }

  for (const token of tokens.filter((item) => item.group === "unknown")) {
    issues.push({
      code: "UNKNOWN_TOKEN_GROUP",
      severity: "info",
      message: `Token ${token.path} could not be classified into a concrete group from its Figma type/name.`,
      group: token.group,
      tokenPath: token.path,
      evidence: { source: token.source, figmaId: token.figmaId },
    });
  }

  for (const token of tokens.filter((item) => item.source === "variable" && item.modes && item.modes.length > 1 && !item.valuesByMode)) {
    issues.push({
      code: "MISSING_MODES",
      severity: "warning",
      message: `Variable token ${token.path} declares modes but has no serialized valuesByMode data.`,
      group: token.group,
      tokenPath: token.path,
      evidence: { modes: token.modes },
    });
  }

  if (options.includeUnusedTokens !== false) {
    const usedTokenKeys = new Set<string>();
    for (const usageEntry of usage.usages) {
      if (usageEntry.match.tokenPath) usedTokenKeys.add(usageEntry.match.tokenPath);
      if (usageEntry.match.tokenFigmaId) usedTokenKeys.add(usageEntry.match.tokenFigmaId);
    }

    for (const token of tokens
      .filter((item) => !usedTokenKeys.has(item.path) && (!item.figmaId || !usedTokenKeys.has(item.figmaId)))
      .slice(0, MAX_UNUSED_ISSUES)) {
      issues.push({
        code: "UNUSED_TOKEN",
        severity: "info",
        message: `Token ${token.path} was not referenced in the scanned scope.`,
        group: token.group,
        tokenPath: token.path,
        evidence: { source: token.source, figmaId: token.figmaId },
      });
    }
  }

  const bySeverity = createBySeverity();
  const byCode: TokenAuditResponse["summary"]["byCode"] = {};
  const byGroup: TokenAuditResponse["summary"]["byGroup"] = {};

  for (const token of tokens) {
    const group = byGroup[token.group] ?? { tokenCount: 0, usageCount: 0, issueCount: 0 };
    group.tokenCount += 1;
    byGroup[token.group] = group;
  }
  for (const usageEntry of usage.usages) {
    const group = byGroup[usageEntry.group] ?? { tokenCount: 0, usageCount: 0, issueCount: 0 };
    group.usageCount += 1;
    byGroup[usageEntry.group] = group;
  }
  for (const issue of issues) {
    bySeverity[issue.severity] += 1;
    byCode[issue.code] = (byCode[issue.code] ?? 0) + 1;
    if (issue.group) {
      const group = byGroup[issue.group] ?? { tokenCount: 0, usageCount: 0, issueCount: 0 };
      group.issueCount += 1;
      byGroup[issue.group] = group;
    }
  }

  return {
    version: 1,
    fileName: usage.fileName,
    currentPage: usage.currentPage,
    scope: usage.scope,
    summary: {
      tokenCount: tokens.length,
      usageCount: usage.summary.totalUsages,
      coverage: usage.summary.coverage,
      issueCount: issues.length,
      bySeverity,
      byCode,
      byGroup,
    },
    issues,
    recommendations: buildRecommendations(issues),
    source: {
      tokenSummary: summarizeTokenSource(tokens),
      usageSummary: usage.summary,
      warnings: usage.warnings,
    },
  };
}

export async function collectDesignTokenAudit(
  nodeIds?: string[],
  options: TokenAuditOptions = {},
): Promise<TokenAuditResponse> {
  const [tokens, usage] = await Promise.all([collectDesignTokens(), collectTokenUsage(nodeIds)]);
  return auditDesignTokens(tokens, usage, options);
}

function summarizeTokenSource(tokens: NormalizedToken[]): TokenAuditResponse["source"]["tokenSummary"] {
  const bySource: Record<NormalizedToken["source"], number> = {
    variable: 0,
    style: 0,
    inferred: 0,
  };
  const byGroup: Partial<Record<TokenGroup, number>> = {};
  for (const token of tokens) {
    bySource[token.source] += 1;
    byGroup[token.group] = (byGroup[token.group] ?? 0) + 1;
  }
  return { total: tokens.length, bySource, byGroup };
}

function buildRecommendations(issues: TokenAuditIssue[]): TokenAuditRecommendation[] {
  const codes = new Set(issues.map((issue) => issue.code));
  const recommendations: TokenAuditRecommendation[] = [];

  if (codes.has("LOW_COVERAGE") || codes.has("UNBOUND_USAGE")) {
    recommendations.push({
      priority: "high",
      issueCodes: ["LOW_COVERAGE", "UNBOUND_USAGE"],
      message: "Prioritize binding high-volume unbound colors, typography, spacing, and radius values to local variables or styles.",
    });
  }

  if (codes.has("EXACT_VALUE_ONLY")) {
    recommendations.push({
      priority: "medium",
      issueCodes: ["EXACT_VALUE_ONLY"],
      message: "Convert exact value matches into explicit variable/style bindings so future audits can distinguish intentional token usage from coincidental values.",
    });
  }

  if (codes.has("DUPLICATE_TOKEN_VALUE")) {
    recommendations.push({
      priority: "medium",
      issueCodes: ["DUPLICATE_TOKEN_VALUE"],
      message: "Review duplicate token values and keep either intentional semantic aliases or a single canonical token per role.",
    });
  }

  if (codes.has("EMPTY_TOKEN_GRAPH")) {
    recommendations.push({
      priority: "high",
      issueCodes: ["EMPTY_TOKEN_GRAPH"],
      message: "Create or import local variables/styles before relying on token usage coverage metrics.",
    });
  }

  if (codes.has("UNUSED_TOKEN")) {
    recommendations.push({
      priority: "low",
      issueCodes: ["UNUSED_TOKEN"],
      message: "Treat unused-token findings as scope-dependent; scan broader pages before deleting or consolidating tokens.",
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      priority: "low",
      issueCodes: [],
      message: "No immediate token audit recommendations for the scanned scope.",
    });
  }

  return recommendations;
}
