import type { OpenRouterError } from "@openrouter/sdk/models/errors/openroutererror.js";
import {
  classifyOpenRouterError,
  OpenRouterClientError,
} from "./openrouter-errors";

export function isOpenRouterSdkError(error: unknown): error is OpenRouterError {
  return (
    !!error &&
    typeof error === "object" &&
    "statusCode" in error &&
    typeof (error as OpenRouterError).statusCode === "number"
  );
}

export function toOpenRouterClientError(error: unknown): OpenRouterClientError {
  if (error instanceof OpenRouterClientError) {
    return error;
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    throw error;
  }
  if (isOpenRouterSdkError(error)) {
    const kind = classifyOpenRouterError(error.statusCode, error.body);
    return new OpenRouterClientError(kind, error.body || error.message);
  }
  const kind = classifyOpenRouterError(undefined, "", error);
  return new OpenRouterClientError(kind, String(error));
}
