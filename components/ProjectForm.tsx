"use client";

import { useMemo, useState } from "react";
import {
  DEFAULT_TEMPERATURE,
  SAMPLE_IDEA,
} from "@/lib/config";
import { estimateGeneration } from "@/lib/generation-scope";
import { applyScopeChange } from "@/lib/generation-scope";
import {
  MODEL_PRESETS,
  getPresetModel,
  getPresetUiWarning,
  resolveDisplayModel,
} from "@/lib/model-presets";
import type {
  AdaptiveScopeSelection,
  AppType,
  GenerationScope,
  GenerationSettings,
  ModelPreset,
  TargetAgent,
} from "@/lib/types";

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

const SCOPES: { id: GenerationScope; label: string; hint: string }[] = [
  {
    id: "core",
    label: "Core specs only",
    hint: "11 core files — no agent files, no review",
  },
  {
    id: "core-agent",
    label: "Core + agent files",
    hint: "Core files plus target agent bundle",
  },
  {
    id: "adaptive",
    label: "Adaptive",
    hint: "AI picks which core + agent files to generate; you confirm before compile.",
  },
  {
    id: "full",
    label: "Full bundle",
    hint: "Preflight + agent files + quality review (defaults on)",
  },
];

export type ProjectFormValues = {
  projectName: string;
  projectIdea: string;
  appType: AppType;
  preferredStack: string;
  targetAgent: TargetAgent;
  settings: GenerationSettings;
};

type ProjectFormProps = {
  values: ProjectFormValues;
  onChange: (values: ProjectFormValues) => void;
  onCompile: () => void;
  onGenerateMissing: () => void;
  onStop: () => void;
  onDownload: () => void;
  onClearWorkspace: () => void;
  isGenerating: boolean;
  isEnhancing?: boolean;
  onEnhancePrompt?: () => void;
  enhanceRationale?: string | null;
  canDownload: boolean;
  canGenerateMissing: boolean;
  saveIndicator: "saved" | "unsaved" | "saving";
  error: string | null;
  hasApiKey: boolean | null;
  isEmptyWorkspace: boolean;
  envDefaultModel: string;
  adaptiveSelection?: AdaptiveScopeSelection | null;
  adaptivePoolCount?: number;
};

export function createDefaultFormValues(): ProjectFormValues {
  return {
    projectName: "",
    projectIdea: "",
    appType: "SaaS",
    preferredStack: "",
    targetAgent: "Cursor",
    settings: {
      scope: "core-agent",
      includePreflight: false,
      includeQualityReview: false,
      modelPreset: "balanced",
      model: "",
      temperature: DEFAULT_TEMPERATURE,
      maxTokens: undefined,
    },
  };
}

export function ProjectForm({
  values,
  onChange,
  onCompile,
  onGenerateMissing,
  onStop,
  onDownload,
  onClearWorkspace,
  isGenerating,
  isEnhancing = false,
  onEnhancePrompt,
  enhanceRationale,
  canDownload,
  canGenerateMissing,
  saveIndicator,
  error,
  hasApiKey,
  isEmptyWorkspace,
  envDefaultModel,
  adaptiveSelection = null,
  adaptivePoolCount = 0,
}: ProjectFormProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const estimate = useMemo(
    () => estimateGeneration(values.settings, values.targetAgent),
    [values.settings, values.targetAgent],
  );

  const presetWarning = useMemo(
    () => getPresetUiWarning(values.settings.modelPreset),
    [values.settings.modelPreset],
  );

  const effectiveModel = useMemo(
    () => resolveDisplayModel(values.settings, envDefaultModel),
    [values.settings, envDefaultModel],
  );

  const adaptiveEstimateActive =
    values.settings.scope === "adaptive" && !!adaptiveSelection;
  const compileFileCount = adaptiveEstimateActive
    ? adaptiveSelection.selectedPaths.length
    : estimate.compileFileCount;
  const apiCallCount =
    compileFileCount +
    (estimate.includesPreflight ? 1 : 0) +
    (estimate.includesReview ? 1 : 0);

  const set = <K extends keyof ProjectFormValues>(
    key: K,
    value: ProjectFormValues[K],
  ) => onChange({ ...values, [key]: value });

  const setSetting = <K extends keyof GenerationSettings>(
    key: K,
    value: GenerationSettings[K],
  ) =>
    onChange({
      ...values,
      settings: { ...values.settings, [key]: value },
    });

  const setScope = (scope: GenerationScope) => {
    onChange({
      ...values,
      settings: applyScopeChange(values.settings, scope),
    });
  };

  const setModelPreset = (preset: ModelPreset) => {
    onChange({
      ...values,
      settings: {
        ...values.settings,
        modelPreset: preset,
        model: preset === "custom" ? "" : getPresetModel(preset, envDefaultModel),
      },
    });
  };

  const useSampleIdea = () => {
    onChange({
      ...values,
      projectName: SAMPLE_IDEA.projectName,
      projectIdea: SAMPLE_IDEA.projectIdea,
      appType: SAMPLE_IDEA.appType,
      preferredStack: SAMPLE_IDEA.preferredStack,
      targetAgent: SAMPLE_IDEA.targetAgent,
    });
  };

  const saveLabel =
    saveIndicator === "saved"
      ? "Saved locally"
      : saveIndicator === "saving"
        ? "Saving…"
        : "Unsaved changes";

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-neutral-200 px-4 py-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-neutral-500">
          Workspace
        </p>
        <h1 className="mt-1 font-mono text-sm font-semibold text-neutral-900">
          prompt-to-spec
        </h1>
        <p
          className={`mt-1 font-mono text-[10px] ${
            saveIndicator === "unsaved" ? "text-amber-700" : "text-neutral-400"
          }`}
        >
          {saveLabel}
        </p>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {hasApiKey === false && (
          <div className="border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            OpenRouter API key not configured. Add OPENROUTER_API_KEY to
            .env.local and restart the dev server.
          </div>
        )}

        {isEmptyWorkspace && (
          <div className="border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
            No workspace yet. Enter a project idea or use the sample, then compile
            a scoped agent bundle.
          </div>
        )}

        <Field label="Project name">
          <input
            className="field-input"
            value={values.projectName}
            onChange={(e) => set("projectName", e.target.value)}
            placeholder="invoice-tracker"
            disabled={isGenerating || isEnhancing}
          />
        </Field>

        <Field label="Project idea">
          <textarea
            className="field-input min-h-[120px] resize-y"
            value={values.projectIdea}
            onChange={(e) => set("projectIdea", e.target.value)}
            placeholder="Describe the app you want to build..."
            disabled={isGenerating || isEnhancing}
          />
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            <button
              type="button"
              className="text-[11px] text-neutral-500 underline decoration-neutral-300 underline-offset-2 hover:text-neutral-800 disabled:opacity-50"
              onClick={useSampleIdea}
              disabled={isGenerating || isEnhancing}
            >
              Use sample idea
            </button>
            {onEnhancePrompt && (
              <button
                type="button"
                className="text-[11px] font-medium text-emerald-800 underline decoration-emerald-300 underline-offset-2 hover:text-emerald-950 disabled:opacity-50"
                onClick={onEnhancePrompt}
                disabled={
                  isGenerating ||
                  isEnhancing ||
                  hasApiKey === false ||
                  !values.projectIdea.trim()
                }
              >
                {isEnhancing ? "Enhancing…" : "Enhance prompt"}
              </button>
            )}
          </div>
          {enhanceRationale && (
            <p className="mt-2 border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-[11px] leading-relaxed text-emerald-900">
              {enhanceRationale}
            </p>
          )}
        </Field>

        <Field label="Target app type">
          <select
            className="field-input"
            value={values.appType}
            onChange={(e) => set("appType", e.target.value as AppType)}
            disabled={isGenerating || isEnhancing}
          >
            {APP_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Preferred stack">
          <input
            className="field-input"
            value={values.preferredStack}
            onChange={(e) => set("preferredStack", e.target.value)}
            placeholder="Next.js, Postgres, Stripe..."
            disabled={isGenerating || isEnhancing}
          />
        </Field>

        <Field label="Target agent">
          <select
            className="field-input"
            value={values.targetAgent}
            onChange={(e) => set("targetAgent", e.target.value as TargetAgent)}
            disabled={isGenerating || isEnhancing}
          >
            {TARGET_AGENTS.map((agent) => (
              <option key={agent} value={agent}>
                {agent}
              </option>
            ))}
          </select>
        </Field>

        <div className="border border-neutral-200 bg-neutral-50 px-3 py-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-neutral-500">
            Compile estimate
          </p>
          <p className="mt-1 font-mono text-xs text-neutral-800">
            {compileFileCount} files · {apiCallCount} API calls
          </p>
          <p className="mt-0.5 text-[10px] text-neutral-500">
            Preflight: {estimate.includesPreflight ? "yes" : "no"} · Review:{" "}
            {estimate.includesReview ? "yes" : "no"}
          </p>
          <p className="mt-1 truncate font-mono text-[10px] text-neutral-500">
            Model: {effectiveModel}
          </p>
          {adaptiveEstimateActive && (
            <p className="mt-1 text-[10px] text-neutral-500">
              Adaptive: {adaptiveSelection.selectedPaths.length} of{" "}
              {adaptivePoolCount || estimate.compileFileCount} files selected
            </p>
          )}
        </div>

        <div className="border border-neutral-200">
          <button
            type="button"
            className="flex w-full items-center justify-between px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-neutral-500 hover:bg-neutral-50"
            onClick={() => setAdvancedOpen((open) => !open)}
            disabled={isGenerating || isEnhancing}
          >
            Advanced
            <span className="font-mono text-[10px] normal-case tracking-normal text-neutral-400">
              {advancedOpen ? "−" : "+"}
            </span>
          </button>

          {advancedOpen && (
            <div className="space-y-3 border-t border-neutral-200 px-3 py-3">
              <Field label="Generation scope">
                <select
                  className="field-input text-xs"
                  value={values.settings.scope}
                  onChange={(e) =>
                    setScope(e.target.value as GenerationScope)
                  }
                  disabled={isGenerating || isEnhancing}
                >
                  {SCOPES.map((scope) => (
                    <option key={scope.id} value={scope.id}>
                      {scope.label}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-neutral-400">
                  {SCOPES.find((s) => s.id === values.settings.scope)?.hint}
                </p>
                {values.settings.scope === "adaptive" && adaptiveSelection && (
                  <div className="border border-neutral-200 bg-white px-2 py-1.5 text-[10px] leading-relaxed text-neutral-600">
                    <p className="font-mono text-neutral-800">
                      {adaptiveSelection.selectedPaths.length} of{" "}
                      {adaptivePoolCount || estimate.compileFileCount} files selected
                    </p>
                    <p className="mt-1">{adaptiveSelection.rationale}</p>
                  </div>
                )}
              </Field>

              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={values.settings.includePreflight}
                  onChange={(e) =>
                    setSetting("includePreflight", e.target.checked)
                  }
                  disabled={isGenerating || isEnhancing}
                />
                <span className="text-xs text-neutral-600">Include preflight</span>
              </label>

              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={values.settings.includeQualityReview}
                  onChange={(e) =>
                    setSetting("includeQualityReview", e.target.checked)
                  }
                  disabled={isGenerating || isEnhancing}
                />
                <span className="text-xs text-neutral-600">
                  Include quality review
                </span>
              </label>

              <Field label="Model preset">
                <select
                  className="field-input text-xs"
                  value={values.settings.modelPreset}
                  onChange={(e) =>
                    setModelPreset(e.target.value as ModelPreset)
                  }
                  disabled={isGenerating || isEnhancing}
                >
                  {MODEL_PRESETS.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.label}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-neutral-400">
                  {
                    MODEL_PRESETS.find(
                      (p) => p.id === values.settings.modelPreset,
                    )?.description
                  }
                </p>
                {presetWarning && (
                  <p className="mt-1 border border-amber-200 bg-amber-50 px-2 py-1.5 text-[10px] leading-relaxed text-amber-900">
                    {presetWarning}
                  </p>
                )}
              </Field>

              {values.settings.modelPreset === "custom" && (
                <Field label="Custom model">
                  <input
                    className="field-input font-mono text-xs"
                    value={values.settings.model}
                    onChange={(e) => setSetting("model", e.target.value)}
                    placeholder={envDefaultModel || "provider/model-name"}
                    disabled={isGenerating || isEnhancing}
                  />
                  <p className="text-[10px] text-neutral-400">
                    {values.settings.model.trim()
                      ? `Using ${values.settings.model.trim()}`
                      : `Empty — using OPENROUTER_MODEL (${envDefaultModel})`}
                  </p>
                </Field>
              )}

              <Field label="Temperature">
                <input
                  className="field-input font-mono text-xs"
                  type="number"
                  min={0}
                  max={2}
                  step={0.1}
                  value={values.settings.temperature}
                  onChange={(e) =>
                    setSetting("temperature", Number(e.target.value))
                  }
                  disabled={isGenerating || isEnhancing}
                />
              </Field>

              <Field label="Max tokens (optional)">
                <input
                  className="field-input font-mono text-xs"
                  type="number"
                  min={1}
                  step={1}
                  value={values.settings.maxTokens ?? ""}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setSetting(
                      "maxTokens",
                      raw === "" ? undefined : Number(raw),
                    );
                  }}
                  placeholder="default"
                  disabled={isGenerating || isEnhancing}
                />
              </Field>
            </div>
          )}
        </div>

        {error && (
          <div className="border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
            {error}
          </div>
        )}
      </div>

      <div className="space-y-2 border-t border-neutral-200 px-4 py-4">
        {isGenerating ? (
          <button type="button" className="btn-stop w-full" onClick={onStop}>
            Stop
          </button>
        ) : (
          <>
            <button
              type="button"
              className="btn-primary w-full"
              onClick={onCompile}
              disabled={hasApiKey === false || isEnhancing}
            >
              Compile specs
            </button>
            {canGenerateMissing && (
              <button
                type="button"
                className="btn-secondary w-full"
                onClick={onGenerateMissing}
              >
                Generate missing
              </button>
            )}
          </>
        )}
        <button
          type="button"
          className="btn-secondary w-full"
          onClick={onDownload}
          disabled={!canDownload || isGenerating}
        >
          Download ZIP
        </button>
        <button
          type="button"
          className="btn-ghost w-full"
          onClick={onClearWorkspace}
          disabled={isGenerating}
        >
          Clear workspace
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">
        {label}
      </span>
      {children}
    </label>
  );
}
