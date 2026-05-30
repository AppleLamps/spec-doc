import { DEFAULT_MODEL, getServerDefaultModel } from "./config";
import { resolveMaxTokens } from "./prompt-builder";
import type { GenerationSettings, ModelPreset } from "./types";

export type ModelPresetConfig = {
  id: ModelPreset;
  label: string;
  model: string;
  description: string;
  /** Default max_tokens when the user leaves max tokens unset. */
  defaultMaxCompletionTokens: number;
  /** Hard cap aligned with OpenRouter provider limits. */
  maxCompletionCap: number;
  /** Safe to use with response_format: json_object (enhance prompt). */
  supportsJsonMode: boolean;
};

export const MODEL_PRESETS: ModelPresetConfig[] = [
  {
    id: "fast",
    label: "Fast / cheap",
    model: "google/gemini-2.5-flash",
    description: "Lower cost, faster drafts — best for core-only runs",
    defaultMaxCompletionTokens: 12_000,
    maxCompletionCap: 65_535,
    supportsJsonMode: true,
  },
  {
    id: "balanced",
    label: "Balanced",
    model: "anthropic/claude-sonnet-4",
    description: "Default quality/cost balance",
    defaultMaxCompletionTokens: 16_000,
    maxCompletionCap: 64_000,
    supportsJsonMode: false,
  },
  {
    id: "high-quality",
    label: "High quality",
    model: "anthropic/claude-opus-4",
    description: "Stronger output, higher cost",
    defaultMaxCompletionTokens: 20_000,
    maxCompletionCap: 32_000,
    supportsJsonMode: false,
  },
  {
    id: "custom",
    label: "Custom",
    model: "",
    description: "Any OpenRouter model ID — leave blank to use OPENROUTER_MODEL from env",
    defaultMaxCompletionTokens: 16_000,
    maxCompletionCap: 32_000,
    supportsJsonMode: false,
  },
];

/** JSON-capable model for enhance prompt — must support response_format. */
export const ENHANCE_JSON_MODEL =
  MODEL_PRESETS.find((p) => p.supportsJsonMode)?.model ?? "google/gemini-2.5-flash";

export function getPresetConfig(preset: ModelPreset): ModelPresetConfig | undefined {
  return MODEL_PRESETS.find((item) => item.id === preset);
}

export function resolveModelFromSettings(
  settings: {
    modelPreset: ModelPreset;
    model: string;
  },
  defaultModel?: string,
): string {
  const fallback = defaultModel?.trim() || getServerDefaultModel();
  if (settings.modelPreset === "custom") {
    return settings.model.trim() || fallback;
  }
  const preset = getPresetConfig(settings.modelPreset);
  return preset?.model || fallback;
}

/** Client-safe resolver when the env default is supplied from /api/config. */
export function resolveDisplayModel(
  settings: {
    modelPreset: ModelPreset;
    model: string;
  },
  envDefaultModel: string,
): string {
  const fallback = envDefaultModel.trim() || DEFAULT_MODEL;
  if (settings.modelPreset === "custom") {
    return settings.model.trim() || fallback;
  }
  const preset = getPresetConfig(settings.modelPreset);
  return preset?.model || fallback;
}

export function getPresetModel(
  preset: ModelPreset,
  defaultModel?: string,
): string {
  if (preset === "custom") {
    return defaultModel?.trim() || getServerDefaultModel();
  }
  return getPresetConfig(preset)?.model ?? getServerDefaultModel();
}

export function modelSupportsJsonMode(model: string): boolean {
  const normalized = model.trim().toLowerCase();
  if (!normalized) return false;
  if (
    MODEL_PRESETS.some(
      (preset) =>
        preset.supportsJsonMode && preset.model.toLowerCase() === normalized,
    )
  ) {
    return true;
  }
  // Heuristic for custom OpenRouter models that typically support JSON mode.
  return /gemini|gpt-4|gpt-5|o3|o4|deepseek/.test(normalized);
}

export function resolveEffectiveMaxTokens(settings: GenerationSettings): number {
  const preset = getPresetConfig(settings.modelPreset);
  const cap = preset?.maxCompletionCap ?? 32_000;
  const fallback = preset?.defaultMaxCompletionTokens ?? 16_000;
  const userMax = resolveMaxTokens(settings.maxTokens);
  if (userMax !== undefined) {
    return Math.min(userMax, cap);
  }
  return Math.min(fallback, cap);
}

export function getPresetUiWarning(preset: ModelPreset): string | null {
  if (preset === "fast") {
    return "Fast preset optimizes for cost and speed. Use Balanced or High quality for longer, more detailed spec files.";
  }
  return null;
}
