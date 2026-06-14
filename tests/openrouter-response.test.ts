import assert from "node:assert/strict";
import test from "node:test";
import { extractCompletionText } from "../lib/openrouter-response.ts";
import type { OpenResponsesResult } from "@openrouter/sdk/models/openresponsesresult.js";

test("extractCompletionText reads message output_text when outputText is empty", () => {
  const response = {
    status: "completed",
    outputText: "",
    output: [
      {
        type: "message",
        id: "msg_1",
        role: "assistant",
        content: [
          {
            type: "output_text",
            text: '{"projectIdea":"Build an app"}',
          },
        ],
      },
    ],
  } as unknown as OpenResponsesResult;

  assert.equal(
    extractCompletionText(response),
    '{"projectIdea":"Build an app"}',
  );
});
