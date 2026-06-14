"use client";

import type { ValidationWarning } from "@/lib/artifact-validation";
import type { SpecFile } from "@/lib/types";

type FileTreeProps = {
  files: SpecFile[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
  fileWarnings?: Record<string, ValidationWarning[]>;
};

export function FileTree({
  files,
  selectedPath,
  onSelect,
  fileWarnings = {},
}: FileTreeProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
      <div className="shrink-0 border-b border-neutral-200 px-4 py-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-neutral-500">
          Artifacts
        </p>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto px-2 py-1">
        {files.map((file) => {
          const selected = file.path === selectedPath;
          const warningCount = fileWarnings[file.path]?.length ?? 0;
          return (
            <li key={file.path}>
              <button
                type="button"
                onClick={() => onSelect(file.path)}
                className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left font-mono text-xs transition-colors ${
                  selected
                    ? "bg-neutral-100 text-neutral-900"
                    : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900"
                }`}
              >
                <StatusDot status={file.status} />
                <span className="min-w-0 flex-1 truncate">{file.path}</span>
                {warningCount > 0 && (
                  <span
                    className="shrink-0 font-mono text-[10px] text-amber-700"
                    title={`${warningCount} validation warning${warningCount === 1 ? "" : "s"}`}
                  >
                    !
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function StatusDot({ status }: { status: SpecFile["status"] }) {
  const color =
    status === "done"
      ? "bg-emerald-600"
      : status === "generating"
        ? "bg-amber-500 animate-pulse"
        : status === "error"
          ? "bg-red-600"
          : status === "cancelled"
            ? "bg-neutral-400"
            : "bg-neutral-300";

  return (
    <span
      className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${color}`}
      aria-hidden
    />
  );
}
