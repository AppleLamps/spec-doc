import {
  buildSystemPrompt,
  buildUserPrompt,
  resolveTemperature,
} from "./prompt-builder";
import { getServerDefaultModel } from "./config";
import {
  modelSupportsJsonMode,
  resolveEffectiveMaxTokens,
  resolveModelFromSettings,
} from "./model-presets";
import {
  classifyOpenRouterError,
  isRetryableOpenRouterError,
  logOpenRouterError,
  toUserOpenRouterMessage,
} from "./openrouter-errors";
import type { SpecFileDefinition } from "./spec-files";
import type { GenerateRequest, GenerationSettings, StreamEvent } from "./types";
import { isAbortError } from "./stream-parser";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MAX_RETRIES = 2;
const RETRY_BASE_MS = 1000;

type StreamChunk = {
  error?: {
    message?: string;
    code?: number | string;
  };
  choices?: Array<{
    delta?: {
      content?: string;
    };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

export function getOpenRouterModel(settings?: GenerationSettings): string {
  if (!settings) return getServerDefaultModel();
  return resolveModelFromSettings(settings);
}

export function getOpenRouterApiKey(): string | undefined {
  return process.env.OPENROUTER_API_KEY?.trim();
}

function buildOpenRouterHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${getOpenRouterApiKey()}`,
    "Content-Type": "application/json",
    "HTTP-Referer":
      process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000",
    "X-Title": "Prompt to Spec",
  };
}

function buildRequestBody(input: GenerateRequest, file: SpecFileDefinition) {
  const settings = input.settings;
  return {
    model: getOpenRouterModel(settings),
    stream: true,
    temperature: resolveTemperature(settings.temperature),
    max_tokens: resolveEffectiveMaxTokens(settings),
    messages: [
      { role: "system", content: buildSystemPrompt() },
      {
        role: "user",
        content: buildUserPrompt(input, file, input.contextFiles ?? []),
      },
    ],
  };
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

async function fetchOpenRouter(
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<Response> {
  const apiKey = getOpenRouterApiKey();
  if (!apiKey) {
    throw new OpenRouterClientError("missing_api_key", "OPENROUTER_API_KEY missing");
  }

  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  let lastError: OpenRouterClientError | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    try {
      const response = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: buildOpenRouterHeaders(),
        body: JSON.stringify(body),
        signal,
      });

      if (response.ok) {
        return response;
      }

      const errorText = await response.text();
      const kind = classifyOpenRouterError(response.status, errorText);
      lastError = new OpenRouterClientError(kind, errorText);

      if (
        attempt < MAX_RETRIES &&
        isRetryableOpenRouterError(kind) &&
        !signal?.aborted
      ) {
        await sleep(RETRY_BASE_MS * 2 ** attempt, signal);
        continue;
      }

      throw lastError;
    } catch (error) {
      if (isAbortError(error)) {
        throw new DOMException("Aborted", "AbortError");
      }
      if (error instanceof OpenRouterClientError) {
        throw error;
      }
      const kind = classifyOpenRouterError(undefined, "", error);
      throw new OpenRouterClientError(kind, String(error));
    }
  }

  throw lastError ?? new OpenRouterClientError("unknown", "Request failed");
}

function parseStreamChunk(payload: string): StreamChunk | null {
  try {
    return JSON.parse(payload) as StreamChunk;
  } catch {
    return null;
  }
}

function throwIfStreamError(parsed: StreamChunk): void {
  if (parsed.error?.message) {
    const detail = parsed.error.message;
    const kind = classifyOpenRouterError(
      typeof parsed.error.code === "number" ? parsed.error.code : undefined,
      detail,
    );
    throw new OpenRouterClientError(kind, detail);
  }

  const finishReason = parsed.choices?.[0]?.finish_reason;
  if (finishReason === "error") {
    throw new OpenRouterClientError("provider_error", "Stream ended with error");
  }
}

function logStreamUsage(parsed: StreamChunk, model: string): void {
  if (!parsed.usage?.total_tokens) return;
  console.info(
    `[openrouter:usage] model=${model} prompt=${parsed.usage.prompt_tokens ?? 0} completion=${parsed.usage.completion_tokens ?? 0} total=${parsed.usage.total_tokens}`,
  );
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
  const model = getOpenRouterModel(input.settings);
  const response = await fetchOpenRouter(
    buildRequestBody(input, file) as Record<string, unknown>,
    signal,
  );

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

        const parsed = parseStreamChunk(payload);
        if (!parsed) continue;

        throwIfStreamError(parsed);
        logStreamUsage(parsed, model);

        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) yield delta;
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
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
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
    if (!modelSupportsJsonMode(options.model)) {
      throw new OpenRouterClientError(
        "provider_error",
        `Model ${options.model} does not support JSON mode on OpenRouter`,
      );
    }
    body.response_format = { type: "json_object" };
  }

  const response = await fetchOpenRouter(body, options.signal);
  const payload = (await response.json()) as ChatCompletionResponse;

  if (payload.usage?.total_tokens) {
    console.info(
      `[openrouter:usage] model=${options.model} prompt=${payload.usage.prompt_tokens ?? 0} completion=${payload.usage.completion_tokens ?? 0} total=${payload.usage.total_tokens}`,
    );
  }

  const content = payload.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new OpenRouterClientError("provider_error", "Empty completion content");
  }

  return content;
}

export { isAbortError };
