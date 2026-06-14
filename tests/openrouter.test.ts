import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyOpenRouterError,
  isRetryableOpenRouterError,
} from "../lib/openrouter-errors.ts";
import {
  extractStreamUsage,
  parseSseDataLine,
  parseStreamChunk,
  throwIfStreamError,
} from "../lib/openrouter-stream.ts";

test("classifyOpenRouterError maps HTTP status codes", () => {
  assert.equal(classifyOpenRouterError(401, ""), "unauthorized");
  assert.equal(classifyOpenRouterError(402, ""), "insufficient_credits");
  assert.equal(classifyOpenRouterError(429, ""), "rate_limited");
  assert.equal(classifyOpenRouterError(404, ""), "model_not_found");
  assert.equal(classifyOpenRouterError(503, ""), "provider_error");
});

test("classifyOpenRouterError maps response body text", () => {
  assert.equal(
    classifyOpenRouterError(undefined, "Insufficient credits on account"),
    "insufficient_credits",
  );
  assert.equal(
    classifyOpenRouterError(undefined, "Model not found for id foo"),
    "model_not_found",
  );
  assert.equal(
    classifyOpenRouterError(undefined, "Rate limit exceeded"),
    "rate_limited",
  );
});

test("classifyOpenRouterError maps network failures", () => {
  assert.equal(
    classifyOpenRouterError(undefined, "", new TypeError("fetch failed")),
    "network_error",
  );
});

test("isRetryableOpenRouterError includes transient failures", () => {
  assert.equal(isRetryableOpenRouterError("rate_limited"), true);
  assert.equal(isRetryableOpenRouterError("provider_error"), true);
  assert.equal(isRetryableOpenRouterError("network_error"), true);
  assert.equal(isRetryableOpenRouterError("unauthorized"), false);
  assert.equal(isRetryableOpenRouterError("model_not_found"), false);
});

test("parseSseDataLine handles stream control tokens", () => {
  assert.deepEqual(parseSseDataLine("data: [DONE]"), { kind: "done" });
  assert.deepEqual(parseSseDataLine(": keep-alive"), { kind: "skip" });
  assert.deepEqual(parseSseDataLine("data: not-json"), { kind: "skip" });
});

test("parseSseDataLine parses content chunks", () => {
  const line = 'data: {"choices":[{"delta":{"content":"Hello"}}]}';
  const parsed = parseSseDataLine(line);
  assert.equal(parsed.kind, "chunk");
  if (parsed.kind === "chunk") {
    assert.equal(parsed.chunk.choices?.[0]?.delta?.content, "Hello");
  }
});

test("throwIfStreamError rejects embedded stream errors", () => {
  assert.throws(
    () =>
      throwIfStreamError({
        error: { message: "Provider overloaded", code: 503 },
      }),
    /provider/i,
  );
  assert.throws(
    () =>
      throwIfStreamError({
        choices: [{ finish_reason: "error" }],
      }),
    /error/i,
  );
});

test("extractStreamUsage returns token counts", () => {
  assert.deepEqual(
    extractStreamUsage({
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    }),
    { prompt: 10, completion: 20, total: 30 },
  );
  assert.equal(extractStreamUsage({}), null);
});

test("parseStreamChunk returns null for invalid JSON", () => {
  assert.equal(parseStreamChunk("{bad"), null);
});
