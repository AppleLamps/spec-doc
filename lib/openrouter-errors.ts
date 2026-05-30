export type OpenRouterErrorKind =
  | "missing_api_key"
  | "unauthorized"
  | "rate_limited"
  | "model_not_found"
  | "provider_error"
  | "network_error"
  | "unknown";

const USER_MESSAGES: Record<OpenRouterErrorKind, string> = {
  missing_api_key:
    "OpenRouter API key is not configured. Add OPENROUTER_API_KEY to .env.local and restart the dev server.",
  unauthorized:
    "OpenRouter rejected the API key. Check that OPENROUTER_API_KEY is valid and has not expired.",
  rate_limited:
    "OpenRouter rate limit reached. Wait a moment and try again, or switch to a faster/cheaper model preset.",
  model_not_found:
    "The selected model was not found on OpenRouter. Check the model string in Advanced settings.",
  provider_error:
    "The model provider returned an error. Try again or switch model presets.",
  network_error:
    "Network error while contacting OpenRouter. Check your connection and try again.",
  unknown:
    "An unexpected error occurred during generation. Try again or switch model presets.",
};

export function getUserMessage(kind: OpenRouterErrorKind): string {
  return USER_MESSAGES[kind];
}

export function classifyOpenRouterError(
  status: number | undefined,
  body: string,
  cause?: unknown,
): OpenRouterErrorKind {
  const text = body.toLowerCase();

  if (status === 401 || text.includes("invalid api key") || text.includes("unauthorized")) {
    return "unauthorized";
  }
  if (status === 429 || text.includes("rate limit")) {
    return "rate_limited";
  }
  if (
    status === 404 ||
    text.includes("model not found") ||
    text.includes("no endpoints found") ||
    text.includes("invalid model")
  ) {
    return "model_not_found";
  }
  if (status === 402 || status === 403 || (status !== undefined && status >= 500)) {
    return "provider_error";
  }
  if (
    cause instanceof TypeError ||
    text.includes("fetch failed") ||
    text.includes("network")
  ) {
    return "network_error";
  }
  if (text.includes("not configured") || text.includes("openrouter_api_key")) {
    return "missing_api_key";
  }

  return "unknown";
}

export function toUserOpenRouterMessage(
  kind: OpenRouterErrorKind,
  _serverDetail?: string,
): string {
  return getUserMessage(kind);
}

export function logOpenRouterError(
  kind: OpenRouterErrorKind,
  detail: string,
): void {
  console.error(`[openrouter:${kind}]`, detail.slice(0, 500));
}
