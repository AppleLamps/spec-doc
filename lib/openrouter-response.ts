import { extractTextFromResponse } from "@openrouter/agent/stream-transformers";
import type { OpenResponsesResult } from "@openrouter/sdk/models/openresponsesresult.js";

/** Extract assistant text from an OpenResponses result (structured output safe). */
export function extractCompletionText(response: OpenResponsesResult): string {
  const direct = extractTextFromResponse(response).trim();
  if (direct) return direct;

  const parts: string[] = [];
  for (const item of response.output ?? []) {
    if (
      item.type === "message" &&
      "content" in item &&
      Array.isArray(item.content)
    ) {
      for (const part of item.content) {
        if ("text" in part && typeof part.text === "string" && part.text) {
          parts.push(part.text);
        }
      }
    }
  }

  return parts.join("").trim();
}
