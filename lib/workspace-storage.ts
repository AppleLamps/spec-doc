import type { ProjectFormValues } from "@/components/ProjectForm";
import { createDefaultFormValues } from "@/components/ProjectForm";
import {
  createInitialSpecFiles,
  reconcileSpecFiles,
} from "./spec-files";
import type { RunStatus, SpecFile, TargetAgent, GenerationSettings } from "./types";

export const WORKSPACE_STORAGE_KEY = "prompt-to-spec-workspace-v2";

export type WorkspaceSnapshot = {
  version: 2;
  form: ProjectFormValues;
  files: SpecFile[];
  selectedPath: string | null;
  runStatus: RunStatus;
  savedAt: string;
};

const LEGACY_STORAGE_KEY = "prompt-to-spec-workspace-v1";

export function createEmptyWorkspace(
  targetAgent: TargetAgent = "Cursor",
): WorkspaceSnapshot {
  return {
    version: 2,
    form: createDefaultFormValues(),
    files: createInitialSpecFiles(targetAgent),
    selectedPath: null,
    runStatus: "idle",
    savedAt: new Date().toISOString(),
  };
}

function normalizeForm(form: ProjectFormValues): ProjectFormValues {
  const defaults = createDefaultFormValues();
  const legacy = form.settings as Partial<GenerationSettings> & {
    skipPreflight?: boolean;
  };

  const scope =
    legacy.scope ??
    (legacy.skipPreflight === false ? "full" : "core-agent");

  return {
    ...defaults,
    ...form,
    settings: {
      ...defaults.settings,
      ...form.settings,
      scope,
      includePreflight:
        legacy.includePreflight ??
        (legacy.skipPreflight === false || scope === "full"),
      includeQualityReview:
        legacy.includeQualityReview ?? scope === "full",
      modelPreset: legacy.modelPreset ?? "balanced",
      model: form.settings?.model ?? defaults.settings.model,
      temperature: form.settings?.temperature ?? defaults.settings.temperature,
      maxTokens: form.settings?.maxTokens,
    },
  };
}

function migrateLegacySnapshot(raw: unknown): WorkspaceSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const parsed = raw as Record<string, unknown>;
  if (parsed.version !== 1 || !parsed.form || !Array.isArray(parsed.files)) {
    return null;
  }

  const form = normalizeForm(parsed.form as ProjectFormValues);
  const files = reconcileSpecFiles(parsed.files as SpecFile[], form.targetAgent);

  return {
    version: 2,
    form,
    files,
    selectedPath: (parsed.selectedPath as string | null) ?? null,
    runStatus:
      parsed.runStatus === "generating" || parsed.runStatus === "preflight"
        ? "idle"
        : ((parsed.runStatus as RunStatus) ?? "idle"),
    savedAt: new Date().toISOString(),
  };
}

export function loadWorkspace(): WorkspaceSnapshot | null {
  if (typeof window === "undefined") return null;

  try {
    const rawV2 = localStorage.getItem(WORKSPACE_STORAGE_KEY);
    if (rawV2) {
      const parsed = JSON.parse(rawV2) as WorkspaceSnapshot;
      if (parsed.version === 2 && parsed.form && Array.isArray(parsed.files)) {
        const form = normalizeForm(parsed.form);
        return {
          version: 2,
          form,
          files: reconcileSpecFiles(parsed.files, form.targetAgent),
          selectedPath: parsed.selectedPath ?? null,
          runStatus:
            parsed.runStatus === "generating" || parsed.runStatus === "preflight"
              ? "idle"
              : parsed.runStatus,
          savedAt: parsed.savedAt,
        };
      }
    }

    const rawV1 = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (rawV1) {
      return migrateLegacySnapshot(JSON.parse(rawV1));
    }

    return null;
  } catch {
    return null;
  }
}

export function saveWorkspace(snapshot: WorkspaceSnapshot): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(
      WORKSPACE_STORAGE_KEY,
      JSON.stringify({ ...snapshot, version: 2, savedAt: new Date().toISOString() }),
    );
  } catch {
    // Storage full or unavailable.
  }
}

export function clearWorkspaceStorage(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(WORKSPACE_STORAGE_KEY);
  localStorage.removeItem(LEGACY_STORAGE_KEY);
}

export function serializeWorkspace(
  state: Omit<WorkspaceSnapshot, "savedAt" | "version">,
): string {
  return JSON.stringify({
    version: 2,
    form: state.form,
    files: state.files,
    selectedPath: state.selectedPath,
    runStatus: state.runStatus,
  });
}

export function hasFileContent(files: SpecFile[]): boolean {
  return files.some((file) => file.content.trim().length > 0);
}

export function getMissingFilePaths(files: SpecFile[]): string[] {
  return files
    .filter(
      (file) =>
        file.status === "pending" ||
        file.status === "cancelled" ||
        file.status === "error",
    )
    .map((file) => file.path);
}

export function allFilesComplete(files: SpecFile[]): boolean {
  return files.every(
    (file) => file.status === "done" && file.content.trim().length > 0,
  );
}

export function allCompileArtifactsComplete(
  files: SpecFile[],
  compilePaths: string[],
): boolean {
  const compileSet = new Set(compilePaths);
  return files
    .filter((file) => compileSet.has(file.path))
    .every((file) => file.status === "done" && file.content.trim().length > 0);
}
