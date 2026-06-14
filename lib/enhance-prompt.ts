import { DEFAULT_TEMPERATURE } from "./config";
import { ENHANCE_JSON_MODEL, getPresetModel } from "./model-presets";
import type {
  AppType,
  GenerationScope,
  GenerationSettings,
  ModelPreset,
  TargetAgent,
} from "./types";

/** Model used for prompt enhancement — must support OpenRouter JSON mode. */
export function getEnhancePromptModel(): string {
  return (
    process.env.OPENROUTER_ENHANCE_MODEL?.trim() || ENHANCE_JSON_MODEL
  );
}

/** @deprecated Use getEnhancePromptModel() — kept for imports that expect a constant at module load. */
export const ENHANCE_PROMPT_MODEL = ENHANCE_JSON_MODEL;

export type EnhancePromptInput = {
  projectName: string;
  projectIdea: string;
  appType: AppType;
  preferredStack: string;
  targetAgent: TargetAgent;
};

export type EnhancePromptSettings = Pick<
  GenerationSettings,
  "scope" | "includePreflight" | "includeQualityReview" | "modelPreset"
>;

export type EnhancePromptResult = {
  projectName: string;
  projectIdea: string;
  appType: AppType;
  preferredStack: string;
  targetAgent: TargetAgent;
  settings: EnhancePromptSettings;
  rationale: string;
};

const APP_TYPES: AppType[] = [
  "SaaS",
  "marketplace",
  "internal tool",
  "mobile app",
  "API/backend",
  "website",
  "other",
];

const TARGET_AGENTS: TargetAgent[] = [
  "Cursor",
  "Claude Code",
  "Codex",
  "Generic Agent",
];

const SCOPES: GenerationScope[] = ["core", "core-agent", "full", "adaptive"];

const MODEL_PRESETS: ModelPreset[] = ["fast", "balanced", "high-quality"];

export const ENHANCE_SYSTEM_PROMPT = `You are a senior product engineer preparing a rough app idea for automated spec generation.

Your job:
1. Rewrite the user's project idea into a clear, implementation-ready brief (150–350 words).
2. Infer or refine project metadata and recommend compile settings for a local spec compiler.

Rules for the rewritten idea:
- Preserve the user's intent; do not invent unrelated features.
- Add concrete scope: users, core workflows, data entities, integrations, constraints, and explicit non-goals for MVP.
- Label reasonable assumptions clearly (e.g. "Assumption: …").
- No marketing language, no placeholders (TODO/TBD), no vague "best practices" filler.
- Prefer testable, actionable statements.

Rules for settings:
- scope "core": quick first draft, idea is simple or user wants minimal API calls.
- scope "core-agent": default for most apps — core specs plus agent instruction files.
- scope "full": complex/ambiguous ideas, many integrations, or enterprise workflows — enable preflight + review defaults.
- scope "adaptive": ambiguous project shape where AI should first recommend which core + agent files are worth generating; keep preflight/review separate.
- includePreflight: true when requirements are underspecified or assumptions are risky.
- includeQualityReview: true for full scope or when idea spans many subsystems.
- modelPreset "fast": simple CRUD, landing pages, small tools.
- modelPreset "balanced": typical SaaS/marketplace/internal tools.
- modelPreset "high-quality": complex domain logic, compliance, multi-tenant, or mission-critical systems.
- targetAgent: "Cursor" unless user clearly uses Claude Code, Codex, or a generic agent workflow.

Respond with JSON only — no markdown fences, no commentary outside JSON.`;

export function buildEnhanceUserPrompt(input: EnhancePromptInput): string {
  return [
    "Current workspace input:",
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
    "Return JSON matching this schema exactly:",
    JSON.stringify(
      {
        projectName: "short-kebab-case-name",
        projectIdea: "expanded implementation-ready brief",
        appType: APP_TYPES[0],
        preferredStack: "comma-separated stack",
        targetAgent: TARGET_AGENTS[0],
        settings: {
          scope: "core-agent",
          includePreflight: false,
          includeQualityReview: false,
          modelPreset: "balanced",
        },
        rationale: "One or two sentences explaining scope and preset choices.",
      },
      null,
      2,
    ),
  ].join("\n");
}

function parseAppType(raw: unknown): AppType {
  if (typeof raw === "string" && APP_TYPES.includes(raw as AppType)) {
    return raw as AppType;
  }
  return "SaaS";
}

function parseTargetAgent(raw: unknown): TargetAgent {
  if (typeof raw === "string" && TARGET_AGENTS.includes(raw as TargetAgent)) {
    return raw as TargetAgent;
  }
  return "Cursor";
}

function parseScope(raw: unknown): GenerationScope {
  if (typeof raw === "string" && SCOPES.includes(raw as GenerationScope)) {
    return raw as GenerationScope;
  }
  return "core-agent";
}

function parseModelPreset(raw: unknown): ModelPreset {
  if (typeof raw === "string" && MODEL_PRESETS.includes(raw as ModelPreset)) {
    return raw as ModelPreset;
  }
  return "balanced";
}

function stripJsonFence(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

export function parseEnhanceResponse(raw: string): EnhancePromptResult | null {
  try {
    const parsed = JSON.parse(stripJsonFence(raw)) as Record<string, unknown>;
    const settingsRaw =
      parsed.settings && typeof parsed.settings === "object"
        ? (parsed.settings as Record<string, unknown>)
        : {};

    const projectIdea =
      typeof parsed.projectIdea === "string" ? parsed.projectIdea.trim() : "";
    if (!projectIdea) return null;

    return {
      projectName:
        typeof parsed.projectName === "string"
          ? parsed.projectName.trim().slice(0, 80)
          : "",
      projectIdea,
      appType: parseAppType(parsed.appType),
      preferredStack:
        typeof parsed.preferredStack === "string"
          ? parsed.preferredStack.trim().slice(0, 200)
          : "",
      targetAgent: parseTargetAgent(parsed.targetAgent),
      settings: {
        scope: parseScope(settingsRaw.scope),
        includePreflight: settingsRaw.includePreflight === true,
        includeQualityReview: settingsRaw.includeQualityReview === true,
        modelPreset: parseModelPreset(settingsRaw.modelPreset),
      },
      rationale:
        typeof parsed.rationale === "string"
          ? parsed.rationale.trim().slice(0, 500)
          : "",
    };
  } catch {
    return null;
  }
}

export function mergeEnhanceResult(
  current: EnhancePromptInput & { settings: GenerationSettings },
  result: EnhancePromptResult,
): EnhancePromptInput & { settings: GenerationSettings } {
  const preset = result.settings.modelPreset;
  return {
    projectName: result.projectName || current.projectName,
    projectIdea: result.projectIdea,
    appType: result.appType,
    preferredStack: result.preferredStack || current.preferredStack,
    targetAgent: result.targetAgent,
    settings: {
      ...current.settings,
      scope: result.settings.scope,
      includePreflight: result.settings.includePreflight,
      includeQualityReview: result.settings.includeQualityReview,
      modelPreset: preset,
      model: getPresetModel(preset),
      temperature: current.settings.temperature ?? DEFAULT_TEMPERATURE,
    },
  };
}
