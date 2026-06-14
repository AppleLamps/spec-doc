import type { ChatAssistantMessage } from "@openrouter/sdk/models/chatassistantmessage.js";
import type { ChatFormatJsonSchemaConfig } from "@openrouter/sdk/models/chatformatjsonschemaconfig.js";
import type { ChatRequest } from "@openrouter/sdk/models/chatrequest.js";
import type { FormatJsonSchemaConfig } from "@openrouter/sdk/models/formatjsonschemaconfig.js";

/** Map our shared schema object to OpenRouter chat `responseFormat`. */
export function toChatJsonSchemaFormat(
  schema: FormatJsonSchemaConfig,
): ChatFormatJsonSchemaConfig {
  return {
    type: "json_schema",
    jsonSchema: {
      name: schema.name,
      strict: schema.strict ?? true,
      description: schema.description,
      schema: schema.schema,
    },
  };
}

export function extractChatCompletionText(
  message: ChatAssistantMessage | undefined,
): string {
  if (!message) return "";

  if (typeof message.content === "string") {
    return message.content.trim();
  }

  if (Array.isArray(message.content)) {
    const text = message.content
      .map((part) => {
        if (typeof part === "string") return part;
        if (
          part &&
          typeof part === "object" &&
          "text" in part &&
          typeof part.text === "string"
        ) {
          return part.text;
        }
        return "";
      })
      .join("");
    if (text.trim()) return text.trim();
  }

  if (typeof message.reasoning === "string" && message.reasoning.trim()) {
    return message.reasoning.trim();
  }

  return "";
}

export function buildStructuredChatRequest(input: {
  model: string;
  models?: string[];
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
  jsonSchema: FormatJsonSchemaConfig;
}): ChatRequest {
  return {
    model: input.model,
    ...(input.models && input.models.length > 1
      ? { models: input.models }
      : {}),
    messages: [
      { role: "system", content: input.system },
      { role: "user", content: input.user },
    ],
    temperature: input.temperature ?? 0.3,
    stream: false,
    // Use maxTokens (not maxCompletionTokens): requireParameters + max_completion_tokens
    // yields 404 "No endpoints found" on OpenRouter for json_schema requests.
    ...(input.maxTokens !== undefined ? { maxTokens: input.maxTokens } : {}),
    responseFormat: toChatJsonSchemaFormat(input.jsonSchema),
    provider: {
      requireParameters: true,
    },
  };
}
