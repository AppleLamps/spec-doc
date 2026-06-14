import {
  ADAPTIVE_SCOPE_SYSTEM_PROMPT,
  type AdaptiveScopeInput,
  buildAdaptiveScopeUserPrompt,
  parseAdaptiveScopeResponse,
} from "@/lib/adaptive-scope";
import { getEnhancePromptModel } from "@/lib/enhance-prompt";
import {
  completeOpenRouterChat,
  getOpenRouterApiKey,
  isAbortError,
  OpenRouterClientError,
} from "@/lib/openrouter";
import { ADAPTIVE_SCOPE_JSON_SCHEMA } from "@/lib/openrouter-schemas";
import type { AppType, TargetAgent } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;
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

function parseAppType(raw: unknown): AppType {
  if (typeof raw === "string" && APP_TYPES.includes(raw as AppType)) {
    return raw as AppType;
  }
  return "SaaS";
}

function parseTargetAgent(raw: unknown): TargetAgent {
  if (
    raw === "Cursor" ||
    raw === "Claude Code" ||
    raw === "Codex" ||
    raw === "Generic Agent"
  ) {
    return raw;
  }
  return "Cursor";
}

function isValidBody(body: unknown): body is {
  projectName: string;
  projectIdea: string;
  appType: unknown;
  preferredStack: string;
  targetAgent: unknown;
} {
  if (!body || typeof body !== "object") return false;
  const value = body as Record<string, unknown>;
  return (
    typeof value.projectName === "string" &&
    typeof value.projectIdea === "string" &&
    typeof value.preferredStack === "string"
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

  const input: AdaptiveScopeInput = {
    projectName: body.projectName.trim() || "Untitled Project",
    projectIdea: body.projectIdea.trim(),
    appType: parseAppType(body.appType),
    preferredStack: body.preferredStack.trim(),
    targetAgent: parseTargetAgent(body.targetAgent),
  };

  try {
    const raw = await completeOpenRouterChat({
      model: getEnhancePromptModel(),
      system: ADAPTIVE_SCOPE_SYSTEM_PROMPT,
      user: buildAdaptiveScopeUserPrompt(input),
      temperature: 0.2,
      maxTokens: 2048,
      jsonSchema: ADAPTIVE_SCOPE_JSON_SCHEMA,
      signal: request.signal,
    });

    const result = parseAdaptiveScopeResponse(raw, input.targetAgent);
    if (result.warnings.length > 0) {
      console.warn(
        `[adaptive-scope] adjusted recommendation: ${result.warnings.join(", ")}`,
      );
    }
    return Response.json(result.selection);
  } catch (error) {
    if (isAbortError(error)) {
      return Response.json({ error: "Request cancelled." }, { status: 499 });
    }
    if (error instanceof OpenRouterClientError) {
      return Response.json({ error: error.message }, { status: 502 });
    }
    const message =
      error instanceof Error ? error.message : "Adaptive selection failed.";
    return Response.json({ error: message }, { status: 502 });
  }
}
