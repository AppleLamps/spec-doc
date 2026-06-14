import {
  buildEnhanceUserPrompt,
  getEnhancePromptModel,
  ENHANCE_SYSTEM_PROMPT,
  parseEnhanceResponse,
  type EnhancePromptInput,
} from "@/lib/enhance-prompt";
import {
  completeOpenRouterChat,
  getOpenRouterApiKey,
  OpenRouterClientError,
} from "@/lib/openrouter";
import { ENHANCE_PROMPT_JSON_SCHEMA } from "@/lib/openrouter-schemas";
import type { AppType, TargetAgent } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APP_TYPES: AppType[] = [
  "SaaS",
  "marketplace",
  "internal tool",
  "mobile app",
  "API/backend",
  "website",
  "other",
];

const TARGET_AGENTS: TargetAgent[] = [
  "Cursor",
  "Claude Code",
  "Codex",
  "Generic Agent",
];

function isValidBody(body: unknown): body is EnhancePromptInput {
  if (!body || typeof body !== "object") return false;
  const value = body as Record<string, unknown>;
  return (
    typeof value.projectName === "string" &&
    typeof value.projectIdea === "string" &&
    typeof value.appType === "string" &&
    typeof value.preferredStack === "string" &&
    typeof value.targetAgent === "string" &&
    APP_TYPES.includes(value.appType as AppType) &&
    TARGET_AGENTS.includes(value.targetAgent as TargetAgent)
  );
}

export async function POST(request: Request) {
  if (!getOpenRouterApiKey()) {
    return Response.json(
      { error: "OPENROUTER_API_KEY is not configured on the server." },
      { status: 500 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!isValidBody(body)) {
    return Response.json({ error: "Invalid request payload." }, { status: 400 });
  }

  if (!body.projectIdea.trim()) {
    return Response.json({ error: "Project idea is required." }, { status: 400 });
  }

  try {
    const raw = await completeOpenRouterChat({
      model: getEnhancePromptModel(),
      system: ENHANCE_SYSTEM_PROMPT,
      user: buildEnhanceUserPrompt(body),
      temperature: 0.3,
      maxTokens: 2048,
      jsonSchema: ENHANCE_PROMPT_JSON_SCHEMA,
      signal: request.signal,
    });

    const result = parseEnhanceResponse(raw);
    if (!result) {
      return Response.json(
        { error: "Could not parse enhancement response. Try again." },
        { status: 502 },
      );
    }

    return Response.json(result);
  } catch (error) {
    if (error instanceof OpenRouterClientError) {
      return Response.json({ error: error.message }, { status: 502 });
    }
    if (error instanceof DOMException && error.name === "AbortError") {
      return Response.json({ error: "Enhancement cancelled." }, { status: 499 });
    }
    console.error("[enhance-prompt]", error);
    return Response.json(
      { error: "Unexpected error during prompt enhancement." },
      { status: 500 },
    );
  }
}
