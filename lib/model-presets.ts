import { DEFAULT_MODEL } from "./config";
import type { ModelPreset } from "./types";

export type ModelPresetConfig = {
  id: ModelPreset;
  label: string;
  model: string;
  description: string;
};

export const MODEL_PRESETS: ModelPresetConfig[] = [
  {
    id: "fast",
    label: "Fast / cheap",
    model: "google/gemini-2.0-flash-001",
    description: "Lower cost, faster drafts",
  },
  {
    id: "balanced",
    label: "Balanced",
    model: "anthropic/claude-sonnet-4",
    description: "Default quality/cost balance",
  },
  {
    id: "high-quality",
    label: "High quality",
    model: "anthropic/claude-opus-4",
    description: "Stronger output, higher cost",
  },
  {
    id: "custom",
    label: "Custom",
    model: "",
    description: "Use your own OpenRouter model string",
  },
];

export function resolveModelFromSettings(settings: {
  modelPreset: ModelPreset;
  model: string;
}): string {
  if (settings.modelPreset === "custom") {
    return settings.model.trim() || DEFAULT_MODEL;
  }
  const preset = MODEL_PRESETS.find((item) => item.id === settings.modelPreset);
  return preset?.model || DEFAULT_MODEL;
}

export function getPresetModel(preset: ModelPreset): string {
  if (preset === "custom") return DEFAULT_MODEL;
  return MODEL_PRESETS.find((item) => item.id === preset)?.model ?? DEFAULT_MODEL;
}
