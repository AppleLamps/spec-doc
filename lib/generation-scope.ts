import type { GenerationScope, GenerationSettings, TargetAgent } from "./types";
import { getAgentFileDefinitions } from "./agent-files";
import {
  CORE_SPEC_DEFINITIONS,
  getAdaptivePoolDefinitions,
  PREFLIGHT_PATH,
  QUALITY_REVIEW_PATH,
} from "./spec-files";

export type GenerationEstimate = {
  compileFileCount: number;
  apiCallCount: number;
  includesPreflight: boolean;
  includesReview: boolean;
  compilePaths: string[];
};

export function getCorePaths(): string[] {
  return CORE_SPEC_DEFINITIONS.map((file) => file.path);
}

export function getScopedCompilePaths(
  settings: Pick<GenerationSettings, "scope">,
  targetAgent: TargetAgent,
): string[] {
  switch (settings.scope) {
    case "core":
      return getCorePaths();
    case "adaptive":
      return getAdaptivePoolDefinitions(targetAgent).map((file) => file.path);
    case "core-agent":
    case "full":
      return [
        ...getCorePaths(),
        ...getAgentFileDefinitions(targetAgent).map((file) => file.path),
      ];
    default:
      return getCorePaths();
  }
}

export function scopeCheckboxDefaults(
  scope: GenerationScope,
): Pick<GenerationSettings, "includePreflight" | "includeQualityReview"> {
  switch (scope) {
    case "full":
      return { includePreflight: true, includeQualityReview: true };
    case "adaptive":
    case "core-agent":
    case "core":
    default:
      return { includePreflight: false, includeQualityReview: false };
  }
}

export function applyScopeChange(
  settings: GenerationSettings,
  scope: GenerationScope,
): GenerationSettings {
  const defaults = scopeCheckboxDefaults(scope);
  return {
    ...settings,
    scope,
    includePreflight: defaults.includePreflight,
    includeQualityReview: defaults.includeQualityReview,
  };
}

export function estimateGeneration(
  settings: GenerationSettings,
  targetAgent: TargetAgent,
): GenerationEstimate {
  const compilePaths = getScopedCompilePaths(settings, targetAgent);
  const includesPreflight = settings.includePreflight;
  const includesReview = settings.includeQualityReview;

  return {
    compileFileCount: compilePaths.length,
    apiCallCount:
      compilePaths.length +
      (includesPreflight ? 1 : 0) +
      (includesReview ? 1 : 0),
    includesPreflight,
    includesReview,
    compilePaths,
  };
}

export function getActiveBundlePaths(
  settings: GenerationSettings,
  targetAgent: TargetAgent,
): string[] {
  const paths = [...getScopedCompilePaths(settings, targetAgent)];
  if (settings.includePreflight) paths.unshift(PREFLIGHT_PATH);
  if (settings.includeQualityReview) paths.push(QUALITY_REVIEW_PATH);
  return paths;
}
