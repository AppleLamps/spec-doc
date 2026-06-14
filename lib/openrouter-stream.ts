import {
  classifyOpenRouterError,
  logOpenRouterError,
  toUserOpenRouterMessage,
} from "./openrouter-errors";
import type { StreamUsage } from "./types";

export type StreamChunk = {
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

export class OpenRouterStreamError extends Error {
  kind: ReturnType<typeof classifyOpenRouterError>;

  constructor(kind: ReturnType<typeof classifyOpenRouterError>, detail: string) {
    super(toUserOpenRouterMessage(kind));
    this.name = "OpenRouterStreamError";
    this.kind = kind;
    logOpenRouterError(kind, detail);
  }
}

export function parseStreamChunk(payload: string): StreamChunk | null {
  try {
    return JSON.parse(payload) as StreamChunk;
  } catch {
    return null;
  }
}

export function throwIfStreamError(parsed: StreamChunk): void {
  if (parsed.error?.message) {
    const detail = parsed.error.message;
    const kind = classifyOpenRouterError(
      typeof parsed.error.code === "number" ? parsed.error.code : undefined,
      detail,
    );
    throw new OpenRouterStreamError(kind, detail);
  }

  const finishReason = parsed.choices?.[0]?.finish_reason;
  if (finishReason === "error") {
    throw new OpenRouterStreamError("provider_error", "Stream ended with error");
  }
}

export function extractStreamUsage(parsed: StreamChunk): StreamUsage | null {
  if (!parsed.usage?.total_tokens) return null;
  return {
    prompt: parsed.usage.prompt_tokens ?? 0,
    completion: parsed.usage.completion_tokens ?? 0,
    total: parsed.usage.total_tokens,
  };
}

export type ParsedSseLine =
  | { kind: "done" }
  | { kind: "chunk"; chunk: StreamChunk }
  | { kind: "skip" };

/** Parse one SSE `data:` line from an OpenRouter stream. */
export function parseSseDataLine(line: string): ParsedSseLine {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) {
    return { kind: "skip" };
  }

  const payload = trimmed.slice(5).trim();
  if (payload === "[DONE]") {
    return { kind: "done" };
  }

  const chunk = parseStreamChunk(payload);
  if (!chunk) {
    return { kind: "skip" };
  }

  return { kind: "chunk", chunk };
}
