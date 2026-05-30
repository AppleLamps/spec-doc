import { isAgentSpecificPath } from "./agent-files";
import type { SpecFile, TargetAgent } from "./types";

export type ValidationWarning = {
  id: string;
  message: string;
};

const PLACEHOLDER_PATTERN =
  /\b(TODO|TBD|INSERT HERE|PLACEHOLDER|FIXME|XXX|\[\.{3}\])\b/i;

const VAGUE_PATTERN =
  /\b(ensure scalability|best practices|as needed|robust solution|user-friendly|seamless experience|future enhancements?)\b/i;

const IMPERATIVE_PATTERN =
  /\b(must|should|do not|never|always|run|verify|implement|read)\b/i;

export function validateArtifact(
  file: SpecFile,
  targetAgent: TargetAgent,
): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];
  const content = file.content.trim();

  if (!content) return warnings;

  if (content.length < 400) {
    warnings.push({
      id: "short",
      message: "File is very short — may lack implementation detail.",
    });
  }

  if (PLACEHOLDER_PATTERN.test(content)) {
    warnings.push({
      id: "placeholder",
      message: "Contains placeholder text (TODO, TBD, insert here, etc.).",
    });
  }

  const lines = content.split("\n");
  let vagueCount = 0;
  for (const line of lines) {
    if (VAGUE_PATTERN.test(line) && line.length < 120) vagueCount += 1;
  }
  if (vagueCount >= 2) {
    warnings.push({
      id: "vague",
      message: "Multiple vague lines without concrete implementation detail.",
    });
  }

  if (isAgentSpecificPath(file.path, targetAgent)) {
    if (!IMPERATIVE_PATTERN.test(content)) {
      warnings.push({
        id: "agent-direct",
        message: "Agent file may be missing direct imperative instructions.",
      });
    }
  }

  if (file.path === "tasks.md") {
    const hasChecklist =
      /-\s*\[[ x]\]/i.test(content) ||
      /^\s*\d+\.\s+/m.test(content) ||
      /\bTASK-\d+/i.test(content);
    if (!hasChecklist) {
      warnings.push({
        id: "tasks-checklist",
        message: "tasks.md may be missing a checklist or TASK- IDs.",
      });
    }
  }

  if (file.path === "test-plan.md") {
    const hasTests =
      /\bTEST-\d+/i.test(content) ||
      (/\b(unit|integration|e2e)\b/i.test(content) &&
        /\b(steps|expected result|preconditions)\b/i.test(content));
    if (!hasTests) {
      warnings.push({
        id: "test-cases",
        message: "test-plan.md may be missing concrete test cases or TEST- IDs.",
      });
    }
  }

  if (file.path === "requirements.md" && !/\bREQ-\d+/i.test(content)) {
    warnings.push({
      id: "req-ids",
      message: "requirements.md may be missing stable REQ- IDs.",
    });
  }

  return warnings;
}

export function warningsByPath(
  files: SpecFile[],
  targetAgent: TargetAgent,
): Record<string, ValidationWarning[]> {
  const result: Record<string, ValidationWarning[]> = {};
  for (const file of files) {
    if (file.status === "done" && file.content.trim()) {
      const warnings = validateArtifact(file, targetAgent);
      if (warnings.length > 0) result[file.path] = warnings;
    }
  }
  return result;
}
