"use client";

import { computeQualityChecks } from "@/lib/quality-checklist";
import type { SpecFile } from "@/lib/types";

type QualityChecklistProps = {
  files: SpecFile[];
};

export function QualityChecklist({ files }: QualityChecklistProps) {
  const checks = computeQualityChecks(files);

  return (
    <div className="border-t border-neutral-200">
      <div className="border-b border-neutral-200 px-4 py-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-neutral-500">
          Quality Checklist
        </p>
      </div>
      <ul className="space-y-0 px-2 py-2">
        {checks.map((check) => (
          <li
            key={check.id}
            className="flex items-center gap-2 px-2 py-1.5 text-xs text-neutral-700"
          >
            <span
              className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
                check.ok ? "bg-emerald-600" : "bg-neutral-300"
              }`}
              aria-hidden
            />
            <span className={check.ok ? "text-neutral-800" : "text-neutral-500"}>
              {check.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
