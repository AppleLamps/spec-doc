import type { ChatResult } from "@openrouter/sdk/models/chatresult.js";
import type { ChatRequest } from "@openrouter/sdk/models/chatrequest.js";
import {
  buildSystemPrompt,
  buildUserPrompt,
  resolveTemperature,
} from "./prompt-builder";
import { getServerDefaultModel } from "./config";
import {
  getFallbackModels,
  getJsonFallbackModels,
  modelSupportsJsonMode,
  resolveEffectiveMaxTokens,
  resolveModelFromSettings,
} from "./model-presets";
import {
  isRetryableOpenRouterError,
  OpenRouterClientError,
} from "./openrouter-errors";
import {
  getOpenRouterApiKey,
  getOpenRouterClient,
  getOpenRouterSdkClient,
} from "./openrouter-client";
import { toOpenRouterClientError } from "./openrouter-sdk-errors";
import {
  buildStructuredChatRequest,
  extractChatCompletionText,
} from "./openrouter-structured";
import type { StructuredOutputSchema } from "./openrouter-schemas";
import type { SpecFileDefinition } from "./spec-files";
import type {
  GenerateRequest,
  GenerationSettings,
  StreamEvent,
  StreamUsage,
} from "./types";
import { isAbortError } from "./stream-parser";

const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1000;

export { getOpenRouterApiKey };

export function getOpenRouterModel(settings?: GenerationSettings): string {
  if (!settings) return getServerDefaultModel();
  return resolveModelFromSettings(settings);
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

function usageFromResponse(usage: {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}): StreamUsage | null {
  if (!usage.totalTokens) return null;
  return {
    prompt: usage.inputTokens ?? 0,
    completion: usage.outputTokens ?? 0,
    total: usage.totalTokens,
  };
}

function logStreamUsage(usage: StreamUsage, model: string): void {
  console.info(
    `[openrouter:usage] model=${model} prompt=${usage.prompt} completion=${usage.completion} total=${usage.total}`,
  );
}

async function withRetries<T>(
  fn: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  let lastError: OpenRouterClientError | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    try {
      return await fn();
    } catch (error) {
      if (isAbortError(error)) {
        throw new DOMException("Aborted", "AbortError");
      }

      const clientError = toOpenRouterClientError(error);
      lastError = clientError;

      if (
        attempt < MAX_RETRIES &&
        isRetryableOpenRouterError(clientError.kind) &&
        !signal?.aborted
      ) {
        await sleep(RETRY_BASE_MS * 2 ** attempt, signal);
        continue;
      }

      throw clientError;
    }
  }

  throw lastError ?? new OpenRouterClientError("unknown", "Request failed");
}

function buildModelRouting(
  primary: string,
  preset: GenerationSettings["modelPreset"],
): { model: string; models?: string[] } {
  const models = getFallbackModels(primary, preset);
  if (models.length <= 1) {
    return { model: primary };
  }
  return { model: models[0], models };
}

function buildJsonModelRouting(primary: string): { model: string; models?: string[] } {
  const models = getJsonFallbackModels(primary);
  if (models.length <= 1) {
    return { model: models[0] ?? primary };
  }
  return { model: models[0], models };
}

export { OpenRouterClientError };

export async function* streamSpecFile(
  input: GenerateRequest,
  file: SpecFileDefinition,
  signal?: AbortSignal,
  options?: { onUsage?: (usage: StreamUsage, model: string) => void },
): AsyncGenerator<string, void, undefined> {
  if (!getOpenRouterApiKey()) {
    throw new OpenRouterClientError("missing_api_key", "OPENROUTER_API_KEY missing");
  }

  const model = getOpenRouterModel(input.settings);
  const routing = buildModelRouting(model, input.settings.modelPreset);
  const client = getOpenRouterClient();
  let emittedAnyDelta = false;
  let lastError: OpenRouterClientError | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    const result = client.callModel(
      {
        ...routing,
        instructions: buildSystemPrompt(file.path),
        input: buildUserPrompt(input, file, input.contextFiles ?? []),
        temperature: resolveTemperature(input.settings.temperature),
        maxOutputTokens: resolveEffectiveMaxTokens(input.settings),
      },
      { signal },
    );

    const responsePromise = result.getResponse();
    responsePromise.catch(() => undefined);

    try {
      for await (const delta of result.getTextStream()) {
        if (signal?.aborted) {
          throw new DOMException("Aborted", "AbortError");
        }
        if (delta) {
          emittedAnyDelta = true;
          yield delta;
        }
      }

      const response = await responsePromise;
      if (response.status === "failed") {
        throw new OpenRouterClientError(
          "provider_error",
          response.error?.message ?? "Stream ended with error",
        );
      }

      const usage = response.usage ? usageFromResponse(response.usage) : null;
      if (usage) {
        logStreamUsage(usage, response.model || model);
        options?.onUsage?.(usage, response.model || model);
      }
      return;
    } catch (error) {
      if (isAbortError(error)) {
        throw new DOMException("Aborted", "AbortError");
      }

      const clientError = toOpenRouterClientError(error);
      lastError = clientError;

      if (
        !emittedAnyDelta &&
        attempt < MAX_RETRIES &&
        isRetryableOpenRouterError(clientError.kind) &&
        !signal?.aborted
      ) {
        await sleep(RETRY_BASE_MS * 2 ** attempt, signal);
        continue;
      }

      throw clientError;
    }
  }

  throw lastError ?? new OpenRouterClientError("unknown", "Request failed");
}

export function encodeStreamEvent(event: StreamEvent): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(event)}\n`);
}

export async function completeOpenRouterChat(options: {
  model: string;
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  jsonSchema?: StructuredOutputSchema;
  signal?: AbortSignal;
}): Promise<string> {
  if (!getOpenRouterApiKey()) {
    throw new OpenRouterClientError("missing_api_key", "OPENROUTER_API_KEY missing");
  }
  if (options.signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  const useStructured = Boolean(options.jsonSchema);
  const useJsonObject = options.jsonMode && !useStructured;

  if (useJsonObject && !modelSupportsJsonMode(options.model)) {
    throw new OpenRouterClientError(
      "provider_error",
      `Model ${options.model} does not support JSON mode on OpenRouter`,
    );
  }

  if (useStructured && !modelSupportsJsonMode(options.model)) {
    throw new OpenRouterClientError(
      "model_not_found",
      `Model ${options.model} does not support structured outputs on OpenRouter`,
    );
  }

  const routing = buildJsonModelRouting(options.model);
  const sdkClient = getOpenRouterSdkClient();

  return withRetries(
    async () => {
      const chatRequest: ChatRequest = useStructured
        ? buildStructuredChatRequest({
            ...routing,
            system: options.system,
            user: options.user,
            temperature: options.temperature,
            maxTokens: options.maxTokens,
            jsonSchema: options.jsonSchema!,
          })
        : {
            ...routing,
            messages: [
              { role: "system", content: options.system },
              { role: "user", content: options.user },
            ],
            temperature: options.temperature ?? 0.3,
            stream: false,
            ...(options.maxTokens !== undefined
              ? { maxTokens: options.maxTokens }
              : {}),
            ...(useJsonObject
              ? {
                  responseFormat: { type: "json_object" as const },
                  provider: { requireParameters: true },
                }
              : {}),
          };

      const result = (await sdkClient.chat.send(
        { chatRequest },
        { signal: options.signal },
      )) as ChatResult;

      const usage = result.usage;
      if (usage) {
        console.info(
          `[openrouter:usage] model=${result.model} prompt=${usage.promptTokens} completion=${usage.completionTokens} total=${usage.totalTokens}`,
        );
      }

      const content = extractChatCompletionText(result.choices[0]?.message);
      if (!content) {
        throw new OpenRouterClientError(
          "unknown",
          `Empty structured output from ${result.model || options.model}`,
        );
      }

      return content;
    },
    options.signal,
  );
}

export { isAbortError };
