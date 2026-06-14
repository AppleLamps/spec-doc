import type { Model } from "@openrouter/sdk/models/model.js";
import { getOpenRouterSdkClient } from "./openrouter-client";
import { MODEL_PRESETS } from "./model-presets";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

type ModelsCache = {
  fetchedAt: number;
  byId: Map<string, Model>;
};

let cache: ModelsCache | null = null;
let refreshPromise: Promise<ModelsCache> | null = null;

function indexModels(models: Model[]): Map<string, Model> {
  const byId = new Map<string, Model>();
  for (const model of models) {
    byId.set(model.id.toLowerCase(), model);
    if (model.canonicalSlug) {
      byId.set(model.canonicalSlug.toLowerCase(), model);
    }
  }
  return byId;
}

export async function refreshModelsCache(
  force = false,
): Promise<ModelsCache> {
  if (!force && cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache;
  }

  if (!force && refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const client = getOpenRouterSdkClient();
      const response = await client.models.list();
      cache = {
        fetchedAt: Date.now(),
        byId: indexModels(response.data ?? []),
      };
      return cache;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export function getCachedModel(modelId: string): Model | undefined {
  const key = modelId.trim().toLowerCase();
  return cache?.byId.get(key);
}

export function isModelAvailable(modelId: string): boolean {
  const normalized = modelId.trim();
  if (!normalized) return false;
  if (!cache) return true;
  return cache.byId.has(normalized.toLowerCase());
}

export function modelSupportsJsonFromCatalog(modelId: string): boolean {
  const model = getCachedModel(modelId);
  if (!model) return false;
  return (model.supportedParameters ?? []).some(
    (param) =>
      param === "response_format" || param === "structured_outputs",
  );
}

export function getModelContextLength(modelId: string): number | null {
  return getCachedModel(modelId)?.contextLength ?? null;
}

export type PresetValidationWarning = {
  preset: string;
  model: string;
  message: string;
};

export function validatePresetModels(): PresetValidationWarning[] {
  if (!cache) return [];

  const warnings: PresetValidationWarning[] = [];
  for (const preset of MODEL_PRESETS) {
    if (!preset.model) continue;
    if (!isModelAvailable(preset.model)) {
      warnings.push({
        preset: preset.id,
        model: preset.model,
        message: `Preset "${preset.label}" model "${preset.model}" was not found on OpenRouter.`,
      });
    }
  }
  return warnings;
}

/** Test helper */
export function setModelsCacheForTests(next: ModelsCache | null): void {
  cache = next;
  refreshPromise = null;
}
