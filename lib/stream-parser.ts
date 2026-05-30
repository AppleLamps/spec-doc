import type { StreamEvent } from "./types";

const VALID_EVENT_TYPES = new Set<StreamEvent["type"]>([
  "file_start",
  "file_delta",
  "file_done",
  "error",
  "cancelled",
  "complete",
]);

export function parseStreamEvent(line: string): StreamEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }

  return isStreamEvent(parsed) ? parsed : null;
}

function isStreamEvent(value: unknown): value is StreamEvent {
  if (!value || typeof value !== "object") return false;

  const record = value as Record<string, unknown>;
  const type = record.type;
  if (typeof type !== "string" || !VALID_EVENT_TYPES.has(type as StreamEvent["type"])) {
    return false;
  }

  switch (type) {
    case "file_start":
    case "file_done":
      return typeof record.path === "string";
    case "file_delta":
      return typeof record.path === "string" && typeof record.delta === "string";
    case "error":
      return typeof record.message === "string";
    case "cancelled":
      return record.path === undefined || typeof record.path === "string";
    case "complete":
      return true;
    default:
      return false;
  }
}

export type StreamConsumeResult = "complete" | "cancelled" | "interrupted";

export async function consumeNdjsonStream(
  body: ReadableStream<Uint8Array>,
  handlers: {
    signal?: AbortSignal;
    onEvent: (event: StreamEvent) => void;
  },
): Promise<StreamConsumeResult> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      if (handlers.signal?.aborted) {
        await reader.cancel().catch(() => undefined);
        return "cancelled";
      }

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      let newlineIndex = buffer.indexOf("\n");
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);

        const event = parseStreamEvent(line);
        if (event) {
          handlers.onEvent(event);
          if (event.type === "complete") return "complete";
          if (event.type === "cancelled") return "cancelled";
        }

        newlineIndex = buffer.indexOf("\n");
      }
    }

    const trailing = parseStreamEvent(buffer);
    if (trailing) {
      handlers.onEvent(trailing);
      if (trailing.type === "complete") return "complete";
      if (trailing.type === "cancelled") return "cancelled";
    }

    return handlers.signal?.aborted ? "cancelled" : "interrupted";
  } catch (error) {
    if (handlers.signal?.aborted || isAbortError(error)) {
      return "cancelled";
    }
    throw error;
  } finally {
    reader.releaseLock();
  }
}

export function isAbortError(error: unknown): boolean {
  return (
    error instanceof DOMException && error.name === "AbortError"
  ) || (
    error instanceof Error && error.name === "AbortError"
  );
}
