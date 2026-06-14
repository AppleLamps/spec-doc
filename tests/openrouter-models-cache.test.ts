import assert from "node:assert/strict";
import test from "node:test";
import {
  isModelAvailable,
  modelSupportsJsonFromCatalog,
  setModelsCacheForTests,
  validatePresetModels,
} from "../lib/openrouter-models-cache.ts";
import type { Model } from "@openrouter/sdk/models/model.js";

function stubModel(
  id: string,
  supportedParameters: Model["supportedParameters"] = [],
): Model {
  return {
    id,
    canonicalSlug: id,
    name: id,
    created: 0,
    description: "",
    architecture: {
      modality: "text->text",
      inputModalities: ["text"],
      outputModalities: ["text"],
      instructType: null,
    },
    contextLength: 32_000,
    defaultParameters: null,
    perRequestLimits: null,
    pricing: {
      prompt: "0",
      completion: "0",
      request: "0",
      image: "0",
      webSearch: "0",
      internalReasoning: "0",
    },
    supportedParameters,
    supportedVoices: null,
    topProvider: {
      contextLength: 32_000,
      maxCompletionTokens: 16_000,
      isModerated: false,
    },
    links: { details: "" },
  };
}

test.after(() => {
  setModelsCacheForTests(null);
});

test("validatePresetModels flags missing catalog entries", () => {
  setModelsCacheForTests({
    fetchedAt: Date.now(),
    byId: new Map([
      ["deepseek/deepseek-v4-flash", stubModel("deepseek/deepseek-v4-flash")],
    ]),
  });

  const warnings = validatePresetModels();
  assert.ok(
    warnings.some(
      (item) =>
        item.preset === "balanced" && item.model === "z-ai/glm-5.1",
    ),
  );
});

test("modelSupportsJsonFromCatalog checks supported parameters", () => {
  setModelsCacheForTests({
    fetchedAt: Date.now(),
    byId: new Map([
      [
        "google/gemini-2.5-flash",
        stubModel("google/gemini-2.5-flash", [
          "response_format",
          "temperature",
        ]),
      ],
    ]),
  });

  assert.equal(
    modelSupportsJsonFromCatalog("google/gemini-2.5-flash"),
    true,
  );
  assert.equal(isModelAvailable("google/gemini-2.5-flash"), true);
  assert.equal(isModelAvailable("missing/model"), false);
});
