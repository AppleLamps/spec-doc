import type { FormatJsonSchemaConfig } from "@openrouter/sdk/models/formatjsonschemaconfig.js";

/** JSON schema for enhance-prompt structured output. */
export const ENHANCE_PROMPT_JSON_SCHEMA: FormatJsonSchemaConfig = {
  type: "json_schema",
  name: "enhance_prompt",
  strict: true,
  description: "Enhanced project brief and compile settings",
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "projectName",
      "projectIdea",
      "appType",
      "preferredStack",
      "targetAgent",
      "settings",
      "rationale",
    ],
    properties: {
      projectName: { type: "string" },
      projectIdea: { type: "string" },
      appType: {
        type: "string",
        enum: [
          "SaaS",
          "marketplace",
          "internal tool",
          "mobile app",
          "API/backend",
          "website",
          "other",
        ],
      },
      preferredStack: { type: "string" },
      targetAgent: {
        type: "string",
        enum: ["Cursor", "Claude Code", "Codex", "Generic Agent"],
      },
      settings: {
        type: "object",
        additionalProperties: false,
        required: [
          "scope",
          "includePreflight",
          "includeQualityReview",
          "modelPreset",
        ],
        properties: {
          scope: {
            type: "string",
            enum: ["core", "core-agent", "full", "adaptive"],
          },
          includePreflight: { type: "boolean" },
          includeQualityReview: { type: "boolean" },
          modelPreset: {
            type: "string",
            enum: ["fast", "balanced", "high-quality"],
          },
        },
      },
      rationale: { type: "string" },
    },
  },
};

/** JSON schema for adaptive-scope structured output. */
export const ADAPTIVE_SCOPE_JSON_SCHEMA: FormatJsonSchemaConfig = {
  type: "json_schema",
  name: "adaptive_scope",
  strict: true,
  description: "Adaptive file selection for spec generation",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["selectedPaths", "deselectedPaths", "rationale"],
    properties: {
      selectedPaths: {
        type: "array",
        items: { type: "string" },
      },
      deselectedPaths: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["path", "reason"],
          properties: {
            path: { type: "string" },
            reason: { type: "string" },
          },
        },
      },
      rationale: { type: "string" },
    },
  },
};

export type StructuredOutputSchema =
  | typeof ENHANCE_PROMPT_JSON_SCHEMA
  | typeof ADAPTIVE_SCOPE_JSON_SCHEMA;
