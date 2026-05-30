"use client";

import { formatDuration } from "@/lib/run-summary";
import type { RunStatus, RunSummary, SpecFile } from "@/lib/types";

type PipelineStatusProps = {
  files: SpecFile[];
  runStatus: RunStatus;
  activePath: string | null;
  globalError: string | null;
  runSummary: RunSummary | null;
  qualityReviewUnavailable?: boolean;
};

export function PipelineStatus({
  files,
  runStatus,
  activePath,
  globalError,
  runSummary,
  qualityReviewUnavailable,
}: PipelineStatusProps) {
  const doneCount = files.filter((f) => f.status === "done").length;
  const errorCount = files.filter((f) => f.status === "error").length;
  const cancelledCount = files.filter((f) => f.status === "cancelled").length;
  const total = files.length;

  const statusMessage = (() => {
    switch (runStatus) {
      case "complete":
        return "Compile complete";
      case "generating":
        return "Compiling artifacts…";
      case "preflight":
        return "Running preflight…";
      case "cancelled":
        return "Stopped — compile cancelled";
      case "error":
        return "Compile failed";
      default:
        return "Idle — ready to compile";
    }
  })();

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-neutral-200 px-4 py-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-neutral-500">
          Build Pipeline
        </p>
        <p className="mt-1 font-mono text-xs text-neutral-700">
          {doneCount}/{total} artifacts compiled
        </p>
      </div>

      <div className="border-b border-neutral-200 px-4 py-3">
        <div className="h-1.5 w-full bg-neutral-100">
          <div
            className={`h-full transition-all duration-300 ${
              runStatus === "cancelled"
                ? "bg-neutral-400"
                : runStatus === "error"
                  ? "bg-red-600"
                  : "bg-emerald-700"
            }`}
            style={{ width: `${total ? (doneCount / total) * 100 : 0}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-neutral-500">{statusMessage}</p>
      </div>

      {runSummary && (
        <div className="border-b border-neutral-200 px-4 py-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-neutral-400">
            Last run
          </p>
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[11px] text-neutral-700">
            <div>
              <dt className="text-neutral-500">Compiled</dt>
              <dd>{runSummary.compiled}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Skipped</dt>
              <dd>{runSummary.skipped}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Failed</dt>
              <dd>{runSummary.failed}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Cancelled</dt>
              <dd>{runSummary.cancelled}</dd>
            </div>
          </dl>
          {runSummary.lastCompleted && (
            <p className="mt-2 truncate font-mono text-[10px] text-neutral-500">
              Last: {runSummary.lastCompleted}
            </p>
          )}
          <p className="mt-1 font-mono text-[10px] text-neutral-400">
            Duration: {formatDuration(runSummary.durationMs)}
          </p>
        </div>
      )}

      {globalError && (
        <div className="mx-4 mt-4 border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          {globalError}
        </div>
      )}

      {qualityReviewUnavailable && (
        <div className="mx-4 mt-4 border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Quality review unavailable — other artifacts are still available.
        </div>
      )}

      <ol className="flex-1 space-y-0 overflow-y-auto px-2 py-2">
        {files.map((file, index) => {
          const isActive =
            file.path === activePath && file.status === "generating";
          return (
            <li
              key={file.path}
              className={`border-l-2 px-3 py-2 ${
                isActive
                  ? "border-emerald-700 bg-neutral-50"
                  : file.status === "done"
                    ? "border-emerald-600"
                    : file.status === "error"
                      ? "border-red-600"
                      : file.status === "cancelled"
                        ? "border-neutral-400 bg-neutral-50"
                        : "border-neutral-200"
              }`}
            >
              <div className="flex items-start gap-2">
                <span className="mt-0.5 font-mono text-[10px] text-neutral-400">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-xs text-neutral-800">
                    {file.path}
                  </p>
                  <p className="mt-0.5 text-[10px] uppercase tracking-wide text-neutral-500">
                    {file.status}
                  </p>
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {errorCount > 0 && (
        <div className="border-t border-neutral-200 px-4 py-3 text-xs text-red-700">
          {errorCount} file{errorCount === 1 ? "" : "s"} failed
        </div>
      )}

      {cancelledCount > 0 && runStatus === "cancelled" && (
        <div className="border-t border-neutral-200 px-4 py-3 text-xs text-neutral-600">
          {cancelledCount} file{cancelledCount === 1 ? "" : "s"} cancelled
        </div>
      )}
    </div>
  );
}
