"use client";

import { useEffect, useMemo, useState } from "react";
import type { AdaptiveScopeSelection } from "@/lib/types";
import type { SpecFileDefinition } from "@/lib/spec-files";

type AdaptiveScopeDialogProps = {
  open: boolean;
  selection: AdaptiveScopeSelection | null;
  poolDefinitions: SpecFileDefinition[];
  requiredPaths: string[];
  onConfirm: (selection: AdaptiveScopeSelection) => void;
  onGenerateFull: () => void;
  onCancel: () => void;
};

export function AdaptiveScopeDialog({
  open,
  selection,
  poolDefinitions,
  requiredPaths,
  onConfirm,
  onGenerateFull,
  onCancel,
}: AdaptiveScopeDialogProps) {
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());

  const requiredSet = useMemo(() => new Set(requiredPaths), [requiredPaths]);
  const reasonByPath = useMemo(() => {
    const reasons = new Map<string, string>();
    for (const item of selection?.deselectedPaths ?? []) {
      reasons.set(item.path, item.reason);
    }
    return reasons;
  }, [selection]);

  useEffect(() => {
    if (!open || !selection) return;
    setSelectedPaths(new Set([...selection.selectedPaths, ...requiredPaths]));
  }, [open, selection, requiredPaths]);

  if (!open || !selection) return null;

  const togglePath = (path: string) => {
    if (requiredSet.has(path)) return;
    setSelectedPaths((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const buildEditedSelection = (): AdaptiveScopeSelection => {
    const selected = poolDefinitions
      .map((file) => file.path)
      .filter((path) => selectedPaths.has(path) || requiredSet.has(path));

    return {
      selectedPaths: selected,
      deselectedPaths: poolDefinitions
        .map((file) => file.path)
        .filter((path) => !selected.includes(path))
        .map((path) => ({
          path,
          reason: reasonByPath.get(path) ?? "Deselected by user.",
        })),
      rationale: selection.rationale,
    };
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col border border-neutral-300 bg-white shadow-lg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="adaptive-scope-title"
      >
        <div className="border-b border-neutral-200 px-4 py-3">
          <h2
            id="adaptive-scope-title"
            className="font-mono text-sm font-semibold text-neutral-900"
          >
            Adaptive file selection
          </h2>
          <p className="mt-1 text-xs text-neutral-600">{selection.rationale}</p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <div className="mb-3 font-mono text-[11px] text-neutral-500">
            {selectedPaths.size} of {poolDefinitions.length} files selected
          </div>

          <div className="space-y-2">
            {poolDefinitions.map((file) => {
              const checked = selectedPaths.has(file.path) || requiredSet.has(file.path);
              const required = requiredSet.has(file.path);
              const reason = reasonByPath.get(file.path);

              return (
                <label
                  key={file.path}
                  className="flex gap-3 border border-neutral-200 px-3 py-2"
                >
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={checked}
                    disabled={required}
                    onChange={() => togglePath(file.path)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-neutral-900">
                        {file.path}
                      </span>
                      {required && (
                        <span className="border border-neutral-200 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-neutral-500">
                          required
                        </span>
                      )}
                    </span>
                    <span className="mt-1 block text-xs text-neutral-600">
                      {file.purpose}
                    </span>
                    {!checked && reason && (
                      <span className="mt-1 block text-[11px] text-neutral-500">
                        Skipped: {reason}
                      </span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-neutral-200 px-4 py-3">
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn-secondary" onClick={onGenerateFull}>
            Generate full bundle
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => onConfirm(buildEditedSelection())}
          >
            Generate selected files
          </button>
        </div>
      </div>
    </div>
  );
}
