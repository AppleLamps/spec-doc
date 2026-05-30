import { parseReadinessScore } from "./readiness-score";
import type { SpecFile } from "./types";
import { QUALITY_REVIEW_PATH } from "./spec-files";

export type QualityCheck = {
  id: string;
  label: string;
  ok: boolean;
};

function hasContent(files: SpecFile[], path: string): boolean {
  return !!files.find((file) => file.path === path)?.content.trim();
}

function allFilesComplete(files: SpecFile[]): boolean {
  return files.every(
    (file) => file.status === "done" && file.content.trim().length > 0,
  );
}

export function computeQualityChecks(files: SpecFile[]): QualityCheck[] {
  const reviewContent =
    files.find((file) => file.path === QUALITY_REVIEW_PATH)?.content ?? "";
  const readinessScore = parseReadinessScore(reviewContent);
  const allGenerated = allFilesComplete(files);
  const withContent = files.filter((file) => file.content.trim().length > 0);

  return [
    {
      id: "preflight",
      label: "Preflight complete",
      ok: hasContent(files, "preflight.md"),
    },
    {
      id: "assumptions",
      label: "Has assumptions file",
      ok: hasContent(files, "assumptions.md"),
    },
    {
      id: "tasks",
      label: "Has task breakdown",
      ok: hasContent(files, "tasks.md"),
    },
    {
      id: "test-plan",
      label: "Has test plan",
      ok: hasContent(files, "test-plan.md"),
    },
    {
      id: "architecture",
      label: "Has architecture notes",
      ok: hasContent(files, "architecture.md"),
    },
    {
      id: "agent-instructions",
      label: "Has agent instructions",
      ok: hasContent(files, "agent-instructions.md"),
    },
    {
      id: "all-generated",
      label: "All artifacts compiled",
      ok: allGenerated,
    },
    {
      id: "ready-export",
      label: "Agent bundle ready",
      ok: withContent.length > 0 && allGenerated,
    },
    {
      id: "readiness",
      label:
        readinessScore !== null
          ? `Agent readiness ${readinessScore}/10`
          : "Agent readiness: not reviewed",
      ok: readinessScore !== null && readinessScore >= 7,
    },
  ];
}

export { parseReadinessScore };
