"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EditorPanel } from "@/components/EditorPanel";
import { FileTree } from "@/components/FileTree";
import { PipelineStatus } from "@/components/PipelineStatus";
import {
  ProjectForm,
  createDefaultFormValues,
} from "@/components/ProjectForm";
import { QualityChecklist } from "@/components/QualityChecklist";
import { hasExportableContent, downloadSpecZip } from "@/lib/export";
import {
  applyStreamEvent,
  markRunCancelled,
  prepareFilesForGeneration,
} from "@/lib/file-state";
import {
  extractPreflightAssumptions,
  needsPreflightConfirmation,
} from "@/lib/preflight";
import { mergeEnhanceResult, type EnhancePromptResult } from "@/lib/enhance-prompt";
import { validateArtifact, type ValidationWarning } from "@/lib/artifact-validation";
import {
  getActiveBundlePaths,
  getScopedCompilePaths,
} from "@/lib/generation-scope";
import {
  createInitialSpecFiles,
  PREFLIGHT_PATH,
  QUALITY_REVIEW_PATH,
  reconcileSpecFiles,
} from "@/lib/spec-files";
import { buildRunSummary } from "@/lib/run-summary";
import type {
  GenerateMode,
  RunStatus,
  RunSummary,
  SpecFile,
  StreamEvent,
} from "@/lib/types";
import {
  allCompileArtifactsComplete,
  clearWorkspaceStorage,
  getMissingFilePaths,
  hasFileContent,
  loadWorkspace,
  saveWorkspace,
  serializeWorkspace,
} from "@/lib/workspace-storage";
import {
  consumeNdjsonStream,
  isAbortError,
} from "@/lib/stream-parser";

const AUTOSAVE_DELAY_MS = 800;

type PendingAction =
  | { type: "compile-full" }
  | { type: "clear-workspace" }
  | { type: "continue-after-preflight"; resetting: boolean };

export function SpecWorkbench() {
  const [form, setForm] = useState(createDefaultFormValues);
  const [files, setFiles] = useState<SpecFile[]>(() =>
    createInitialSpecFiles("Cursor"),
  );
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [runStatus, setRunStatus] = useState<RunStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [saveIndicator, setSaveIndicator] = useState<"saved" | "unsaved" | "saving">("saved");
  const [confirmDialog, setConfirmDialog] = useState<{
    action: PendingAction;
    title: string;
    message: string;
    confirmLabel: string;
  } | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const [runSummary, setRunSummary] = useState<RunSummary | null>(null);
  const [fileWarnings, setFileWarnings] = useState<
    Record<string, ValidationWarning[]>
  >({});
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [enhanceRationale, setEnhanceRationale] = useState<string | null>(null);

  const enhanceAbortRef = useRef<AbortController | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const pathsInRunRef = useRef<Set<string>>(new Set());
  const runStartedAtRef = useRef<number>(0);
  const lastSavedSnapshotRef = useRef<string>("");
  const autosaveTimerRef = useRef<number | null>(null);
  const isGeneratingRef = useRef(false);
  const filesRef = useRef(files);
  const actionRef = useRef({
    compile: () => {},
    stop: () => {},
    save: () => {},
  });

  filesRef.current = files;

  const isGenerating = runStatus === "generating" || runStatus === "preflight";
  const scopedCompilePaths = useMemo(
    () => getScopedCompilePaths(form.settings, form.targetAgent),
    [form.settings, form.targetAgent],
  );
  const bundlePaths = useMemo(
    () => getActiveBundlePaths(form.settings, form.targetAgent),
    [form.settings, form.targetAgent],
  );
  const isEmptyWorkspace =
    !form.projectIdea.trim() && !hasFileContent(files);

  const activePath = useMemo(
    () => files.find((f) => f.status === "generating")?.path ?? selectedPath,
    [files, selectedPath],
  );

  const selectedFile = useMemo(
    () => files.find((f) => f.path === (selectedPath ?? activePath)) ?? null,
    [files, selectedPath, activePath],
  );

  const canDownload = hasExportableContent(files);
  const missingPaths = useMemo(
    () => getMissingFilePaths(files).filter((path) => path !== QUALITY_REVIEW_PATH),
    [files],
  );
  const canGenerateMissing = missingPaths.length > 0 && !isGenerating;

  const buildSnapshot = useCallback(
    () =>
      serializeWorkspace({
        form,
        files,
        selectedPath,
        runStatus,
      }),
    [form, files, selectedPath, runStatus],
  );

  const persistWorkspace = useCallback(
    (markSaved = true) => {
      saveWorkspace({
        version: 2,
        form,
        files,
        selectedPath,
        runStatus,
        savedAt: new Date().toISOString(),
      });
      lastSavedSnapshotRef.current = buildSnapshot();
      if (markSaved) setSaveIndicator("saved");
    },
    [form, files, selectedPath, runStatus, buildSnapshot],
  );

  const handleFormChange = (next: typeof form) => {
    if (next.targetAgent !== form.targetAgent) {
      setFiles((current) => reconcileSpecFiles(current, next.targetAgent));
    }
    setEnhanceRationale(null);
    setForm(next);
  };

  const handleEnhancePrompt = async () => {
    if (isEnhancing || isGenerating) return;
    if (!form.projectIdea.trim()) {
      setError("Project idea is required.");
      return;
    }

    enhanceAbortRef.current?.abort();
    const controller = new AbortController();
    enhanceAbortRef.current = controller;
    setIsEnhancing(true);
    setError(null);
    setEnhanceRationale(null);

    try {
      const response = await fetch("/api/enhance-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectName: form.projectName,
          projectIdea: form.projectIdea,
          appType: form.appType,
          preferredStack: form.preferredStack,
          targetAgent: form.targetAgent,
        }),
        signal: controller.signal,
      });

      const payload = (await response.json().catch(() => null)) as
        | (EnhancePromptResult & { error?: string })
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? `Enhancement failed (${response.status})`);
      }

      if (!payload || !("projectIdea" in payload)) {
        throw new Error("Invalid enhancement response.");
      }

      const merged = mergeEnhanceResult(form, payload);
      if (merged.targetAgent !== form.targetAgent) {
        setFiles((current) => reconcileSpecFiles(current, merged.targetAgent));
      }
      setForm(merged);
      setEnhanceRationale(payload.rationale || "Prompt and settings updated.");
    } catch (err) {
      if (controller.signal.aborted || isAbortError(err)) return;
      setError(
        err instanceof Error ? err.message : "Failed to enhance prompt.",
      );
    } finally {
      if (enhanceAbortRef.current === controller) {
        enhanceAbortRef.current = null;
      }
      setIsEnhancing(false);
    }
  };

  useEffect(() => {
    fetch("/api/config")
      .then((res) => res.json())
      .then((data: { hasApiKey?: boolean }) => setHasApiKey(!!data.hasApiKey))
      .catch(() => setHasApiKey(null));
  }, []);

  useEffect(() => {
    const saved = loadWorkspace();
    if (saved) {
      setForm(saved.form);
      setFiles(saved.files);
      setSelectedPath(saved.selectedPath);
      setRunStatus(
        saved.runStatus === "generating" || saved.runStatus === "preflight"
          ? "idle"
          : saved.runStatus,
      );
      lastSavedSnapshotRef.current = serializeWorkspace({
        form: saved.form,
        files: saved.files,
        selectedPath: saved.selectedPath,
        runStatus:
          saved.runStatus === "generating" || saved.runStatus === "preflight"
            ? "idle"
            : saved.runStatus,
      });
    } else {
      lastSavedSnapshotRef.current = serializeWorkspace({
        form: createDefaultFormValues(),
        files: createInitialSpecFiles("Cursor"),
        selectedPath: null,
        runStatus: "idle",
      });
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;

    const snapshot = buildSnapshot();
    if (snapshot === lastSavedSnapshotRef.current) {
      setSaveIndicator("saved");
      return;
    }

    setSaveIndicator("unsaved");
    if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current);

    autosaveTimerRef.current = window.setTimeout(() => {
      setSaveIndicator("saving");
      persistWorkspace(true);
    }, AUTOSAVE_DELAY_MS);

    return () => {
      if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current);
    };
  }, [hydrated, buildSnapshot, persistWorkspace]);

  const buildContextFiles = useCallback(
    (excludePaths: string[]) => {
      const excluded = new Set(excludePaths);
      return filesRef.current
        .filter((file) => file.content.trim() && !excluded.has(file.path))
        .map((file) => ({ path: file.path, content: file.content }));
    },
    [],
  );

  const handleStreamEvent = useCallback(
    (event: StreamEvent, options?: { reviewErrorNonFatal?: boolean }) => {
      const scope = pathsInRunRef.current;
      switch (event.type) {
        case "file_start":
          setSelectedPath(event.path);
          setFiles((current) => applyStreamEvent(current, event, scope));
          break;
        case "file_delta":
          setFiles((current) => applyStreamEvent(current, event, scope));
          break;
        case "file_done":
          setFiles((current) => {
            const next = applyStreamEvent(current, event, scope);
            const updated = next.find((f) => f.path === event.path);
            if (updated?.status === "done") {
              const warnings = validateArtifact(updated, form.targetAgent);
              setFileWarnings((prev) => ({
                ...prev,
                [event.path]: warnings,
              }));
            }
            return next;
          });
          break;
        case "error":
          setFiles((current) => applyStreamEvent(current, event, scope));
          if (
            options?.reviewErrorNonFatal &&
            event.path === QUALITY_REVIEW_PATH
          ) {
            setError("Quality review failed — other artifacts are still available.");
          } else if (event.path !== QUALITY_REVIEW_PATH) {
            setError(event.message);
            setRunStatus("error");
          }
          break;
        case "cancelled":
          setFiles((current) => markRunCancelled(current, scope));
          setRunStatus("cancelled");
          break;
        case "complete":
          break;
      }
    },
    [form.targetAgent],
  );

  const runGeneration = async (options: {
    mode: GenerateMode;
    targetPaths: string[];
    resetAll: boolean;
    resetPaths?: string[];
    preflightAssumptions?: string;
    reviewErrorNonFatal?: boolean;
    fixWarnings?: string[];
  }): Promise<"ok" | "cancelled" | "error"> => {
    if (isGeneratingRef.current) return "error";

    if (!form.projectIdea.trim()) {
      setError("Project idea is required.");
      setRunStatus("error");
      return "error";
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    pathsInRunRef.current = new Set(options.targetPaths);
    runStartedAtRef.current = Date.now();
    setRunSummary(null);

    setError(null);
    setRunStatus(options.mode === "preflight" ? "preflight" : "generating");

    setFiles((current) =>
      prepareFilesForGeneration(
        current,
        options.resetPaths ?? options.targetPaths,
        options.resetAll || !!options.resetPaths,
      ),
    );

    if (options.targetPaths.length === 1) {
      setSelectedPath(options.targetPaths[0]);
    } else if (options.resetAll && options.mode === "full") {
      setSelectedPath(scopedCompilePaths[0] ?? "README.md");
    }

    const contextFiles = buildContextFiles(options.targetPaths);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectName: form.projectName,
          projectIdea: form.projectIdea,
          appType: form.appType,
          preferredStack: form.preferredStack,
          targetAgent: form.targetAgent,
          settings: form.settings,
          mode: options.mode,
          targetPaths: options.targetPaths,
          contextFiles,
          preflightAssumptions: options.preflightAssumptions,
          bundlePaths,
          fixWarnings: options.fixWarnings,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(payload?.error ?? `Request failed (${response.status})`);
      }

      if (!response.body) {
        throw new Error("No response stream received from server.");
      }

      const result = await consumeNdjsonStream(response.body, {
        signal: controller.signal,
        onEvent: (event) => {
          handleStreamEvent(event, {
            reviewErrorNonFatal: options.reviewErrorNonFatal,
          });
        },
      });

      const pathsForSummary = new Set(options.targetPaths);

      if (result === "cancelled" || controller.signal.aborted) {
        setFiles((current) => {
          const next = markRunCancelled(current, pathsForSummary);
          setRunSummary(
            buildRunSummary(next, pathsForSummary, runStartedAtRef.current),
          );
          return next;
        });
        setRunStatus("cancelled");
        return "cancelled";
      }

      if (result === "interrupted") {
        setError("Stream ended unexpectedly before all target files were generated.");
        setRunStatus("error");
        return "error";
      }

      if (result === "complete") {
        setFiles((current) => {
          setRunSummary(
            buildRunSummary(current, pathsForSummary, runStartedAtRef.current),
          );
          if (allCompileArtifactsComplete(current, scopedCompilePaths)) {
            setRunStatus("complete");
          } else if (options.mode !== "review" && options.mode !== "preflight") {
            setRunStatus("idle");
          } else if (options.mode === "preflight") {
            setRunStatus("idle");
          }
          return current;
        });
      }

      return "ok";
    } catch (err) {
      if (controller.signal.aborted || isAbortError(err)) {
        const pathsForSummary = new Set(options.targetPaths);
        setFiles((current) => {
          const next = markRunCancelled(current, pathsForSummary);
          setRunSummary(
            buildRunSummary(next, pathsForSummary, runStartedAtRef.current),
          );
          return next;
        });
        setRunStatus("cancelled");
        return "cancelled";
      }

      const message =
        err instanceof Error ? err.message : "Network request failed.";
      setError(message);
      setRunStatus("error");
      return "error";
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      pathsInRunRef.current = new Set();
      setRunStatus((current) =>
        current === "generating" || current === "preflight" ? "idle" : current,
      );
    }
  };

  const runQualityReview = async () => {
    if (!form.settings.includeQualityReview) return;

    const preflightContent =
      filesRef.current.find((file) => file.path === PREFLIGHT_PATH)?.content ?? "";
    await runGeneration({
      mode: "review",
      targetPaths: [QUALITY_REVIEW_PATH],
      resetAll: false,
      preflightAssumptions: extractPreflightAssumptions(preflightContent),
      reviewErrorNonFatal: true,
    });
  };

  const executeMainCompile = async (resetting: boolean) => {
    const preflightContent =
      filesRef.current.find((file) => file.path === PREFLIGHT_PATH)?.content ?? "";
    const resetPaths = resetting
      ? [
          ...scopedCompilePaths,
          QUALITY_REVIEW_PATH,
          ...(form.settings.includePreflight ? [] : [PREFLIGHT_PATH]),
        ]
      : scopedCompilePaths;

    const result = await runGeneration({
      mode: "full",
      targetPaths: scopedCompilePaths,
      resetAll: resetting,
      resetPaths: resetting ? resetPaths : undefined,
      preflightAssumptions: extractPreflightAssumptions(preflightContent),
    });

    if (result === "ok") {
      await runQualityReview();
    }
  };

  const runPreflightStep = async (resetting: boolean): Promise<boolean> => {
    const result = await runGeneration({
      mode: "preflight",
      targetPaths: [PREFLIGHT_PATH],
      resetAll: resetting,
      resetPaths: resetting ? [PREFLIGHT_PATH, QUALITY_REVIEW_PATH] : [PREFLIGHT_PATH],
    });

    if (result !== "ok") return false;

    const preflightContent =
      filesRef.current.find((file) => file.path === PREFLIGHT_PATH)?.content ?? "";

    if (needsPreflightConfirmation(preflightContent)) {
      setConfirmDialog({
        action: { type: "continue-after-preflight", resetting },
        title: "Preflight assumptions",
        message:
          "Preflight found assumptions and ambiguities. Continue compiling with these assumptions?",
        confirmLabel: "Continue compile",
      });
      return false;
    }

    return true;
  };

  const startFullCompile = async (resetting: boolean) => {
    if (form.settings.includePreflight) {
      setSelectedPath(PREFLIGHT_PATH);
      const canContinue = await runPreflightStep(resetting);
      if (!canContinue) return;
    }

    await executeMainCompile(resetting);
  };

  const handleCompile = () => {
    if (isGenerating) return;

    if (hasFileContent(files)) {
      setConfirmDialog({
        action: { type: "compile-full" },
        title: "Replace current agent bundle?",
        message: "This will replace the current spec files. Continue?",
        confirmLabel: "Replace and compile",
      });
      return;
    }

    void startFullCompile(false);
  };

  const handleGenerateMissing = () => {
    if (!canGenerateMissing) return;
    void runGeneration({
      mode: "missing",
      targetPaths: missingPaths,
      resetAll: false,
      preflightAssumptions: extractPreflightAssumptions(
        filesRef.current.find((file) => file.path === PREFLIGHT_PATH)?.content ?? "",
      ),
    });
  };

  const handleRegenerateCurrent = () => {
    if (!selectedFile || isGenerating) return;
    void runGeneration({
      mode: "single",
      targetPaths: [selectedFile.path],
      resetAll: false,
      preflightAssumptions: extractPreflightAssumptions(
        filesRef.current.find((file) => file.path === PREFLIGHT_PATH)?.content ?? "",
      ),
    });
  };

  const handleFixWarnings = () => {
    if (!selectedFile || isGenerating) return;
    const warnings = fileWarnings[selectedFile.path] ?? [];
    if (warnings.length === 0) return;

    void runGeneration({
      mode: "fix",
      targetPaths: [selectedFile.path],
      resetAll: false,
      preflightAssumptions: extractPreflightAssumptions(
        filesRef.current.find((file) => file.path === PREFLIGHT_PATH)?.content ?? "",
      ),
      fixWarnings: warnings.map((warning) => warning.message),
    });
  };

  const handleStop = () => {
    abortRef.current?.abort();
    setFiles((current) => {
      const next = markRunCancelled(current, pathsInRunRef.current);
      setRunSummary(
        buildRunSummary(next, pathsInRunRef.current, runStartedAtRef.current),
      );
      return next;
    });
    setRunStatus("cancelled");
    setError(null);
  };

  const handleDownload = async () => {
    try {
      await downloadSpecZip(form.projectName, files);
    } catch {
      setError("Failed to create ZIP download.");
    }
  };

  const handleClearWorkspace = () => {
    setConfirmDialog({
      action: { type: "clear-workspace" },
      title: "Clear workspace?",
      message:
        "This removes all local workspace data from this browser. This cannot be undone.",
      confirmLabel: "Clear workspace",
    });
  };

  const handleConfirmDialog = () => {
    if (!confirmDialog) return;

    const action = confirmDialog.action;
    setConfirmDialog(null);

    if (action.type === "compile-full") {
      void startFullCompile(true);
      return;
    }

    if (action.type === "continue-after-preflight") {
      void executeMainCompile(action.resetting);
      return;
    }

    if (action.type === "clear-workspace") {
      clearWorkspaceStorage();
      const defaults = createDefaultFormValues();
      setForm(defaults);
      setFiles(createInitialSpecFiles(defaults.targetAgent));
      setSelectedPath(null);
      setRunStatus("idle");
      setError(null);
      setRunSummary(null);
      setFileWarnings({});
      setEnhanceRationale(null);
      lastSavedSnapshotRef.current = serializeWorkspace({
        form: defaults,
        files: createInitialSpecFiles(defaults.targetAgent),
        selectedPath: null,
        runStatus: "idle",
      });
      setSaveIndicator("saved");
    }
  };

  const forceSave = useCallback(() => {
    if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current);
    setSaveIndicator("saving");
    persistWorkspace(true);
  }, [persistWorkspace]);

  isGeneratingRef.current = isGenerating;
  actionRef.current = {
    compile: handleCompile,
    stop: handleStop,
    save: forceSave,
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;

      if (mod && event.key.toLowerCase() === "s") {
        event.preventDefault();
        actionRef.current.save();
        return;
      }

      if (mod && event.key === "Enter") {
        event.preventDefault();
        if (!isGeneratingRef.current) actionRef.current.compile();
        return;
      }

      if (event.key === "Escape" && isGeneratingRef.current) {
        event.preventDefault();
        actionRef.current.stop();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const handleEditorChange = (path: string, content: string) => {
    setFiles((current) => {
      const next = current.map((file) =>
        file.path === path ? { ...file, content } : file,
      );
      const updated = next.find((file) => file.path === path);
      if (updated?.status === "done") {
        setFileWarnings((prev) => ({
          ...prev,
          [path]: validateArtifact(updated, form.targetAgent),
        }));
      }
      return next;
    });
  };

  const headerStatus =
    runStatus === "preflight"
      ? "preflight"
      : runStatus === "generating"
        ? "compiling"
        : runStatus === "complete"
          ? "complete"
          : runStatus === "cancelled"
            ? "stopped"
            : runStatus === "error"
              ? "error"
              : "ready";

  if (!hydrated) {
    return (
      <div className="flex h-full items-center justify-center bg-neutral-100">
        <p className="font-mono text-xs text-neutral-500">Loading workspace…</p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-neutral-100">
      <ConfirmDialog
        open={!!confirmDialog}
        title={confirmDialog?.title ?? ""}
        message={confirmDialog?.message ?? ""}
        confirmLabel={confirmDialog?.confirmLabel ?? "Confirm"}
        onConfirm={handleConfirmDialog}
        onCancel={() => setConfirmDialog(null)}
      />

      <header className="flex shrink-0 items-center justify-between border-b border-neutral-200 bg-white px-4 py-2">
        <div className="flex items-center gap-3">
          <span className="inline-block h-2 w-2 rounded-sm bg-emerald-700" />
          <span className="font-mono text-xs text-neutral-600">
            agent spec compiler v0.4
          </span>
        </div>
        <span className="font-mono text-[11px] text-neutral-400">{headerStatus}</span>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)_240px]">
        <aside className="flex min-h-0 flex-col border-b border-neutral-200 bg-white lg:border-b-0 lg:border-r">
          <ProjectForm
            values={form}
            onChange={handleFormChange}
            onCompile={handleCompile}
            onGenerateMissing={handleGenerateMissing}
            onStop={handleStop}
            onDownload={handleDownload}
            onClearWorkspace={handleClearWorkspace}
            onEnhancePrompt={() => void handleEnhancePrompt()}
            isGenerating={isGenerating}
            isEnhancing={isEnhancing}
            enhanceRationale={enhanceRationale}
            canDownload={canDownload}
            canGenerateMissing={canGenerateMissing}
            saveIndicator={saveIndicator}
            error={error}
            hasApiKey={hasApiKey}
            isEmptyWorkspace={isEmptyWorkspace}
          />
          <div className="min-h-[200px] flex-1">
            <FileTree
              files={files}
              selectedPath={selectedPath ?? activePath}
              onSelect={setSelectedPath}
              fileWarnings={fileWarnings}
            />
          </div>
        </aside>

        <main className="min-h-[420px] border-b border-neutral-200 lg:border-b-0 lg:border-r">
          <EditorPanel
            file={selectedFile}
            projectName={form.projectName}
            onChange={handleEditorChange}
            onRegenerate={handleRegenerateCurrent}
            onFixWarnings={handleFixWarnings}
            warnings={selectedFile ? fileWarnings[selectedFile.path] ?? [] : []}
            isGenerating={isGenerating}
            isCurrentFileGenerating={selectedFile?.status === "generating"}
            runStatus={runStatus}
            hasPartialBundle={files.some((f) => f.status === "done") && runStatus === "cancelled"}
          />
        </main>

        <aside className="flex min-h-[240px] flex-col bg-white">
          <PipelineStatus
            files={files}
            runStatus={runStatus}
            activePath={activePath}
            globalError={error}
            runSummary={runSummary}
            qualityReviewUnavailable={
              form.settings.includeQualityReview &&
              files.find((f) => f.path === QUALITY_REVIEW_PATH)?.status === "error"
            }
          />
          <QualityChecklist files={files} />
        </aside>
      </div>
    </div>
  );
}
