import {
  encodeStreamEvent,
  getOpenRouterApiKey,
  isAbortError,
  OpenRouterClientError,
  streamSpecFile,
} from "@/lib/openrouter";
import {
  resolveMaxTokens,
  resolveTemperature,
} from "@/lib/prompt-builder";
import { resolveModelFromSettings } from "@/lib/model-presets";
import {
  getBundleDefinitions,
  getDefinitionByPath,
  PREFLIGHT_PATH,
  QUALITY_REVIEW_PATH,
} from "@/lib/spec-files";
import type {
  ContextFile,
  GenerateMode,
  GenerateRequest,
  GenerationScope,
  GenerationSettings,
  ModelPreset,
  StreamEvent,
  TargetAgent,
} from "@/lib/types";

export const runtime = "nodejs";
/** Vercel Pro allows up to 300s; full compiles may still timeout on Hobby. */
export const maxDuration = 300;
export const dynamic = "force-dynamic";

function parseScope(raw: unknown): GenerationScope {
  if (
    raw === "core" ||
    raw === "core-agent" ||
    raw === "full" ||
    raw === "adaptive"
  ) {
    return raw;
  }
  return "core-agent";
}

function parseModelPreset(raw: unknown): ModelPreset {
  if (
    raw === "fast" ||
    raw === "balanced" ||
    raw === "high-quality" ||
    raw === "custom"
  ) {
    return raw;
  }
  return "balanced";
}

function parseSettings(raw: unknown): GenerationSettings | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.temperature !== "number") return null;
  if (
    value.maxTokens !== undefined &&
    value.maxTokens !== null &&
    typeof value.maxTokens !== "number"
  ) {
    return null;
  }

  const modelPreset = parseModelPreset(value.modelPreset);
  const model =
    typeof value.model === "string" ? value.model : "";

  const settings: GenerationSettings = {
    scope: parseScope(value.scope),
    includePreflight: value.includePreflight === true,
    includeQualityReview: value.includeQualityReview === true,
    modelPreset,
    model,
    temperature: resolveTemperature(value.temperature),
    maxTokens: resolveMaxTokens(value.maxTokens),
  };

  settings.model = resolveModelFromSettings(settings);
  return settings;
}

function parseContextFiles(raw: unknown): ContextFile[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (item): item is ContextFile =>
        !!item &&
        typeof item === "object" &&
        typeof (item as ContextFile).path === "string" &&
        typeof (item as ContextFile).content === "string",
    )
    .map((item) => ({
      path: item.path,
      content: item.content.slice(0, 12000),
    }));
}

function parseMode(raw: unknown): GenerateMode {
  if (
    raw === "single" ||
    raw === "missing" ||
    raw === "full" ||
    raw === "preflight" ||
    raw === "review" ||
    raw === "fix"
  ) {
    return raw;
  }
  return "full";
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

function parseTargetPaths(
  raw: unknown,
  mode: GenerateMode,
  targetAgent: TargetAgent,
): string[] | null {
  const validPaths = new Set(
    getBundleDefinitions(targetAgent).map((file) => file.path),
  );

  if (mode === "preflight") return [PREFLIGHT_PATH];
  if (mode === "review") return [QUALITY_REVIEW_PATH];

  if (!Array.isArray(raw) || raw.length === 0) return null;

  const paths = raw.filter(
    (path): path is string => typeof path === "string" && validPaths.has(path),
  );

  return paths.length > 0 ? paths : null;
}

function parseFixWarnings(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const warnings = raw.filter((item): item is string => typeof item === "string");
  return warnings.length > 0 ? warnings.slice(0, 20) : undefined;
}

function parseBundlePaths(raw: unknown, targetAgent: TargetAgent): string[] {
  if (!Array.isArray(raw)) {
    return getBundleDefinitions(targetAgent).map((file) => file.path);
  }
  const valid = new Set(getBundleDefinitions(targetAgent).map((file) => file.path));
  const paths = raw.filter(
    (path): path is string => typeof path === "string" && valid.has(path),
  );
  return paths.length > 0
    ? paths
    : getBundleDefinitions(targetAgent).map((file) => file.path);
}

function isValidRequest(body: unknown): body is {
  projectName: string;
  projectIdea: string;
  appType: string;
  preferredStack: string;
  targetAgent: string;
  settings: unknown;
  mode?: unknown;
  targetPaths?: unknown;
  contextFiles?: unknown;
  preflightAssumptions?: unknown;
  bundlePaths?: unknown;
  fixWarnings?: unknown;
} {
  if (!body || typeof body !== "object") return false;
  const value = body as Record<string, unknown>;
  return (
    typeof value.projectName === "string" &&
    typeof value.projectIdea === "string" &&
    typeof value.appType === "string" &&
    typeof value.preferredStack === "string" &&
    typeof value.targetAgent === "string" &&
    value.settings !== undefined
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

  if (!isValidRequest(body)) {
    return Response.json({ error: "Invalid request payload." }, { status: 400 });
  }

  if (!body.projectIdea.trim()) {
    return Response.json({ error: "Project idea is required." }, { status: 400 });
  }

  const settings = parseSettings(body.settings);
  if (!settings) {
    return Response.json({ error: "Invalid generation settings." }, { status: 400 });
  }

  const targetAgent = parseTargetAgent(body.targetAgent);
  const mode = parseMode(body.mode);
  const targetPaths = parseTargetPaths(body.targetPaths, mode, targetAgent);
  if (!targetPaths) {
    return Response.json({ error: "Invalid or missing target paths." }, { status: 400 });
  }

  const input: GenerateRequest = {
    projectName: body.projectName.trim() || "Untitled Project",
    projectIdea: body.projectIdea.trim(),
    appType: body.appType as GenerateRequest["appType"],
    preferredStack: body.preferredStack.trim(),
    targetAgent,
    settings,
    mode,
    targetPaths,
    contextFiles: parseContextFiles(body.contextFiles),
    preflightAssumptions:
      typeof body.preflightAssumptions === "string"
        ? body.preflightAssumptions.slice(0, 4000)
        : undefined,
    bundlePaths: parseBundlePaths(body.bundlePaths, targetAgent),
    fixWarnings: parseFixWarnings(body.fixWarnings),
  };

  const filesToGenerate = targetPaths
    .map((path) => getDefinitionByPath(path, targetAgent))
    .filter((file): file is NonNullable<typeof file> => !!file);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const emit = (event: StreamEvent) => {
        if (closed || request.signal.aborted) return;
        controller.enqueue(encodeStreamEvent(event));
      };
      const close = () => {
        if (closed) return;
        closed = true;
        controller.close();
      };

      try {
        for (const file of filesToGenerate) {
          if (request.signal.aborted) {
            emit({ type: "cancelled", path: file.path });
            return;
          }

          emit({ type: "file_start", path: file.path });

          try {
            for await (const delta of streamSpecFile(input, file, request.signal)) {
              if (request.signal.aborted) {
                emit({ type: "cancelled", path: file.path });
                return;
              }
              emit({ type: "file_delta", path: file.path, delta });
            }

            if (request.signal.aborted) {
              emit({ type: "cancelled", path: file.path });
              return;
            }

            emit({ type: "file_done", path: file.path });
          } catch (error) {
            if (request.signal.aborted || isAbortError(error)) {
              emit({ type: "cancelled", path: file.path });
              return;
            }

            const message =
              error instanceof OpenRouterClientError
                ? error.message
                : error instanceof Error
                  ? error.message
                  : "Generation failed for this file.";

            if (file.path === QUALITY_REVIEW_PATH) {
              emit({ type: "error", path: file.path, message });
              continue;
            }

            emit({ type: "error", path: file.path, message });
            return;
          }
        }

        if (!request.signal.aborted) {
          emit({ type: "complete" });
        }
      } catch (error) {
        if (request.signal.aborted || isAbortError(error)) {
          emit({ type: "cancelled" });
          return;
        }

        const message =
          error instanceof Error ? error.message : "Unexpected generation error.";
        emit({ type: "error", message });
      } finally {
        close();
      }
    },
    cancel() {
      // Client disconnected.
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
