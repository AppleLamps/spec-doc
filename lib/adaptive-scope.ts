import { getAgentFileDefinitions } from "./agent-files";
import { getAdaptivePoolDefinitions } from "./spec-files";
import type {
  AdaptiveScopeSelection,
  AppType,
  TargetAgent,
} from "./types";

export type AdaptiveScopeInput = {
  projectName: string;
  projectIdea: string;
  appType: AppType;
  preferredStack: string;
  targetAgent: TargetAgent;
};

export type AdaptiveScopeParseResult = {
  selection: AdaptiveScopeSelection;
  warnings: string[];
};

const REQUIRED_CORE_PATHS = [
  "README.md",
  "product-spec.md",
  "requirements.md",
  "agent-instructions.md",
];

export const ADAPTIVE_SCOPE_SYSTEM_PROMPT = `You are a senior product engineer selecting which specification files are necessary for an AI coding-agent handoff.

You must choose a subset from the provided adaptive pool. Select files that materially improve implementation quality for this project idea. Skip files that would be redundant or unnecessary for the likely MVP.

Rules:
- Return JSON only. No markdown fences or commentary.
- selectedPaths must contain only paths from the adaptive pool.
- deselectedPaths must contain skipped paths with one concise reason each.
- Never skip required files listed by the caller.
- Do not include preflight.md or quality-review.md; those are controlled separately.`;

export function getRequiredAdaptivePaths(targetAgent: TargetAgent): string[] {
  return Array.from(
    new Set([
      ...REQUIRED_CORE_PATHS,
      ...getAgentFileDefinitions(targetAgent).map((file) => file.path),
    ]),
  );
}

export function getAdaptivePoolPaths(targetAgent: TargetAgent): string[] {
  return getAdaptivePoolDefinitions(targetAgent).map((file) => file.path);
}

export function buildFullAdaptiveSelection(
  targetAgent: TargetAgent,
  rationale = "Using the full adaptive pool because a narrower recommendation was unavailable.",
): AdaptiveScopeSelection {
  return {
    selectedPaths: getAdaptivePoolPaths(targetAgent),
    deselectedPaths: [],
    rationale,
  };
}

export function buildAdaptiveScopeUserPrompt(input: AdaptiveScopeInput): string {
  const pool = getAdaptivePoolDefinitions(input.targetAgent);
  const requiredPaths = getRequiredAdaptivePaths(input.targetAgent);

  return [
    "Project input:",
    JSON.stringify(
      {
        projectName: input.projectName || null,
        projectIdea: input.projectIdea,
        appType: input.appType,
        preferredStack: input.preferredStack || null,
        targetAgent: input.targetAgent,
      },
      null,
      2,
    ),
    "",
    "Adaptive pool:",
    ...pool.map((file) => `- ${file.path}: ${file.purpose}`),
    "",
    "Required paths that must remain selected:",
    ...requiredPaths.map((path) => `- ${path}`),
    "",
    "Return JSON matching this schema exactly:",
    JSON.stringify(
      {
        selectedPaths: ["README.md", "product-spec.md"],
        deselectedPaths: [
          {
            path: "architecture.md",
            reason: "One sentence explaining why this file can be skipped.",
          },
        ],
        rationale: "One or two sentences explaining the overall selection.",
      },
      null,
      2,
    ),
  ].join("\n");
}

function stripJsonFence(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

function truncateText(value: string, maxLength: number): string {
  const trimmed = value.trim();
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

function readPathArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((path): path is string => typeof path === "string");
}

function readDeselectedReasons(raw: unknown): Map<string, string> {
  const reasons = new Map<string, string>();
  if (!Array.isArray(raw)) return reasons;

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    if (typeof record.path !== "string") continue;
    const reason =
      typeof record.reason === "string"
        ? truncateText(record.reason, 240)
        : "Not selected for this project idea.";
    if (reason) reasons.set(record.path, reason);
  }

  return reasons;
}

export function parseAdaptiveScopeResponse(
  raw: string,
  targetAgent: TargetAgent,
): AdaptiveScopeParseResult {
  const poolPaths = getAdaptivePoolPaths(targetAgent);
  const poolSet = new Set(poolPaths);
  const requiredSet = new Set(getRequiredAdaptivePaths(targetAgent));
  const warnings: string[] = [];

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(stripJsonFence(raw)) as Record<string, unknown>;
  } catch {
    return {
      selection: buildFullAdaptiveSelection(
        targetAgent,
        "Using the full adaptive pool because the recommendation response was not valid JSON.",
      ),
      warnings: ["invalid-json"],
    };
  }

  const rawSelected = readPathArray(parsed.selectedPaths);
  const selectedKnown = Array.from(
    new Set(rawSelected.filter((path) => poolSet.has(path))),
  );

  const unknownSelected = rawSelected.filter((path) => !poolSet.has(path));
  if (unknownSelected.length > 0) warnings.push("unknown-selected-paths");

  if (selectedKnown.length === 0) {
    return {
      selection: buildFullAdaptiveSelection(
        targetAgent,
        "Using the full adaptive pool because the recommendation did not include any valid selected files.",
      ),
      warnings: [...warnings, "empty-selection"],
    };
  }

  const selectedSet = new Set(selectedKnown);
  for (const requiredPath of requiredSet) {
    if (poolSet.has(requiredPath) && !selectedSet.has(requiredPath)) {
      selectedSet.add(requiredPath);
      warnings.push(`required-path-added:${requiredPath}`);
    }
  }

  const reasonByPath = readDeselectedReasons(parsed.deselectedPaths);
  const selectedPaths = poolPaths.filter((path) => selectedSet.has(path));
  const deselectedPaths = poolPaths
    .filter((path) => !selectedSet.has(path))
    .map((path) => ({
      path,
      reason: reasonByPath.get(path) ?? "Not selected for this project idea.",
    }));

  const rationale =
    typeof parsed.rationale === "string" && parsed.rationale.trim()
      ? truncateText(parsed.rationale, 700)
      : "Adaptive selection based on the project idea and target agent.";

  return {
    selection: {
      selectedPaths,
      deselectedPaths,
      rationale,
    },
    warnings,
  };
}
