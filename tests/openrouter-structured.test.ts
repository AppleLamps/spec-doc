import assert from "node:assert/strict";
import test from "node:test";
import { ENHANCE_PROMPT_JSON_SCHEMA } from "../lib/openrouter-schemas.ts";
import {
  buildStructuredChatRequest,
  extractChatCompletionText,
  toChatJsonSchemaFormat,
} from "../lib/openrouter-structured.ts";

test("toChatJsonSchemaFormat maps to OpenRouter chat responseFormat", () => {
  const format = toChatJsonSchemaFormat(ENHANCE_PROMPT_JSON_SCHEMA);
  assert.equal(format.type, "json_schema");
  assert.equal(format.jsonSchema.name, "enhance_prompt");
  assert.equal(format.jsonSchema.strict, true);
  assert.ok(format.jsonSchema.schema);
});

test("buildStructuredChatRequest sets requireParameters for structured outputs", () => {
  const request = buildStructuredChatRequest({
    model: "google/gemini-2.5-flash",
    system: "sys",
    user: "user",
    jsonSchema: ENHANCE_PROMPT_JSON_SCHEMA,
  });

  assert.equal(request.responseFormat?.type, "json_schema");
  assert.equal(request.provider?.requireParameters, true);
  assert.equal(request.stream, false);
});

test("extractChatCompletionText reads assistant message content", () => {
  assert.equal(
    extractChatCompletionText({
      role: "assistant",
      content: '{"ok":true}',
    }),
    '{"ok":true}',
  );
});
