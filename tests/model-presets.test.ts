import assert from "node:assert/strict";
import test from "node:test";
import {
  getFallbackModels,
  getJsonFallbackModels,
  MAX_OPENROUTER_ROUTING_MODELS,
} from "../lib/model-presets.ts";

test("OpenRouter routing fallbacks stay within API limit", () => {
  assert.equal(MAX_OPENROUTER_ROUTING_MODELS, 3);

  for (const preset of ["fast", "balanced", "high-quality", "custom"] as const) {
    const models = getFallbackModels("provider/primary-model", preset);
    assert.ok(
      models.length <= MAX_OPENROUTER_ROUTING_MODELS,
      `getFallbackModels(${preset}) returned ${models.length} models`,
    );
  }

  const jsonModels = getJsonFallbackModels("google/gemini-2.5-flash");
  assert.ok(jsonModels.length <= MAX_OPENROUTER_ROUTING_MODELS);
  assert.equal(jsonModels[0], "google/gemini-2.5-flash");
});
