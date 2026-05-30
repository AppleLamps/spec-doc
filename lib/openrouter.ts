import {
  buildSystemPrompt,
  buildUserPrompt,
  resolveMaxTokens,
  resolveTemperature,
} from "./prompt-builder";
import { getServerDefaultModel } from "./config";
import { resolveModelFromSettings } from "./model-presets";
import {
  classifyOpenRouterError,
  logOpenRouterError,
  toUserOpenRouterMessage,
} from "./openrouter-errors";
import type { SpecFileDefinition } from "./spec-files";
import type { GenerateRequest, GenerationSettings, StreamEvent } from "./types";
import { isAbortError } from "./stream-parser";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

type OpenRouterDelta = {
  choices?: Array<{
    delta?: {
      content?: string;
    };
  }>;
};

export function getOpenRouterModel(settings?: GenerationSettings): string {
  if (!settings) return getServerDefaultModel();
  return resolveModelFromSettings(settings);
}

export function getOpenRouterApiKey(): string | undefined {
  return process.env.OPENROUTER_API_KEY?.trim();
}

function buildRequestBody(input: GenerateRequest, file: SpecFileDefinition) {
  const settings = input.settings;
  const body: Record<string, unknown> = {
    model: getOpenRouterModel(settings),
    stream: true,
    temperature: resolveTemperature(settings.temperature),
    messages: [
      { role: "system", content: buildSystemPrompt() },
      {
        role: "user",
        content: buildUserPrompt(input, file, input.contextFiles ?? []),
      },
    ],
  };

  const maxTokens = resolveMaxTokens(settings.maxTokens);
  if (maxTokens !== undefined) {
    body.max_tokens = maxTokens;
  }

  return body;
}

export class OpenRouterClientError extends Error {
  kind: ReturnType<typeof classifyOpenRouterError>;

  constructor(kind: ReturnType<typeof classifyOpenRouterError>, detail: string) {
    super(toUserOpenRouterMessage(kind));
    this.name = "OpenRouterClientError";
    this.kind = kind;
    logOpenRouterError(kind, detail);
  }
}

export async function* streamSpecFile(
  input: GenerateRequest,
  file: SpecFileDefinition,
  signal?: AbortSignal,
): AsyncGenerator<string, void, undefined> {
  const apiKey = getOpenRouterApiKey();
  if (!apiKey) {
    throw new OpenRouterClientError("missing_api_key", "OPENROUTER_API_KEY missing");
  }

  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  let response: Response;
  try {
    response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
        "X-Title": "Prompt to Spec",
      },
      body: JSON.stringify(buildRequestBody(input, file)),
      signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw new DOMException("Aborted", "AbortError");
    }
    const kind = classifyOpenRouterError(undefined, "", error);
    throw new OpenRouterClientError(kind, String(error));
  }

  if (!response.ok) {
    const errorText = await response.text();
    const kind = classifyOpenRouterError(response.status, errorText);
    throw new OpenRouterClientError(kind, errorText);
  }

  if (!response.body) {
    throw new OpenRouterClientError("provider_error", "Empty response body");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      if (signal?.aborted) {
        await reader.cancel().catch(() => undefined);
        throw new DOMException("Aborted", "AbortError");
      }

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;

        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") return;

        try {
          const parsed = JSON.parse(payload) as OpenRouterDelta;
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch {
          // Skip malformed SSE chunks.
        }
      }
    }
  } catch (error) {
    if (isAbortError(error)) {
      throw new DOMException("Aborted", "AbortError");
    }
    throw error;
  } finally {
    reader.releaseLock();
  }
}

export function encodeStreamEvent(event: StreamEvent): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(event)}\n`);
}

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

export async function completeOpenRouterChat(options: {
  model: string;
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  signal?: AbortSignal;
}): Promise<string> {
  const apiKey = getOpenRouterApiKey();
  if (!apiKey) {
    throw new OpenRouterClientError("missing_api_key", "OPENROUTER_API_KEY missing");
  }

  if (options.signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  const body: Record<string, unknown> = {
    model: options.model,
    stream: false,
    temperature: options.temperature ?? 0.3,
    messages: [
      { role: "system", content: options.system },
      { role: "user", content: options.user },
    ],
  };

  if (options.maxTokens !== undefined) {
    body.max_tokens = options.maxTokens;
  }

  if (options.jsonMode) {
    body.response_format = { type: "json_object" };
  }

  let response: Response;
  try {
    response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
        "X-Title": "Prompt to Spec",
      },
      body: JSON.stringify(body),
      signal: options.signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw new DOMException("Aborted", "AbortError");
    }
    const kind = classifyOpenRouterError(undefined, "", error);
    throw new OpenRouterClientError(kind, String(error));
  }

  if (!response.ok) {
    const errorText = await response.text();
    const kind = classifyOpenRouterError(response.status, errorText);
    throw new OpenRouterClientError(kind, errorText);
  }

  const payload = (await response.json()) as ChatCompletionResponse;
  const content = payload.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new OpenRouterClientError("provider_error", "Empty completion content");
  }

  return content;
}

export { isAbortError };
