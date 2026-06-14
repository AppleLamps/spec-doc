export type SpecFileStatus =
  | "pending"
  | "generating"
  | "done"
  | "error"
  | "cancelled";

export type RunStatus =
  | "idle"
  | "generating"
  | "preflight"
  | "complete"
  | "cancelled"
  | "error";

export type SpecFile = {
  path: string;
  title: string;
  purpose: string;
  content: string;
  status: SpecFileStatus;
};

export type StreamUsage = {
  prompt: number;
  completion: number;
  total: number;
};

export type StreamEvent =
  | { type: "file_start"; path: string }
  | { type: "file_delta"; path: string; delta: string }
  | { type: "file_done"; path: string }
  | { type: "usage"; path: string; model: string; usage: StreamUsage }
  | { type: "error"; path?: string; message: string }
  | { type: "cancelled"; path?: string }
  | { type: "complete" };

export type AppType =
  | "SaaS"
  | "marketplace"
  | "internal tool"
  | "mobile app"
  | "API/backend"
  | "website"
  | "other";

export type TargetAgent = "Cursor" | "Claude Code" | "Codex" | "Generic Agent";

export type GenerationScope = "core" | "core-agent" | "full" | "adaptive";

export type AdaptiveScopeSelection = {
  selectedPaths: string[];
  deselectedPaths: { path: string; reason: string }[];
  rationale: string;
};

export type ModelPreset = "fast" | "balanced" | "high-quality" | "custom";

export type GenerationSettings = {
  scope: GenerationScope;
  includePreflight: boolean;
  includeQualityReview: boolean;
  modelPreset: ModelPreset;
  model: string;
  temperature: number;
  maxTokens?: number;
};

export type GenerateMode =
  | "full"
  | "single"
  | "missing"
  | "preflight"
  | "review"
  | "fix";

export type ContextFile = {
  path: string;
  content: string;
};

export type GenerateRequest = {
  projectName: string;
  projectIdea: string;
  appType: AppType;
  preferredStack: string;
  targetAgent: TargetAgent;
  settings: GenerationSettings;
  mode: GenerateMode;
  targetPaths?: string[];
  contextFiles?: ContextFile[];
  preflightAssumptions?: string;
  bundlePaths?: string[];
  fixWarnings?: string[];
};

export type RunSummary = {
  compiled: number;
  skipped: number;
  failed: number;
  cancelled: number;
  lastCompleted: string | null;
  durationMs: number;
};
