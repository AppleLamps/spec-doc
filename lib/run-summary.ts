import type { SpecFile } from "./types";
import type { RunSummary } from "./types";

export function buildRunSummary(
  files: SpecFile[],
  pathsInRun: Set<string>,
  startedAt: number,
): RunSummary {
  let compiled = 0;
  let failed = 0;
  let cancelled = 0;
  let lastCompleted: string | null = null;

  for (const path of pathsInRun) {
    const file = files.find((item) => item.path === path);
    if (!file) continue;

    if (file.status === "done") {
      compiled += 1;
      lastCompleted = path;
    } else if (file.status === "error") {
      failed += 1;
    } else if (file.status === "cancelled") {
      cancelled += 1;
    }
  }

  const skipped = Math.max(0, pathsInRun.size - compiled - failed - cancelled);

  return {
    compiled,
    skipped,
    failed,
    cancelled,
    lastCompleted,
    durationMs: Date.now() - startedAt,
  };
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}
