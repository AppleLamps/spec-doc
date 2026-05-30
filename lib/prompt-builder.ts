import { DEFAULT_MODEL, DEFAULT_TEMPERATURE } from "./config";
import type { GenerateRequest, TargetAgent } from "./types";
import type { SpecFileDefinition } from "./spec-files";
import {
  getBundleDefinitions,
  PREFLIGHT_PATH,
  QUALITY_REVIEW_PATH,
} from "./spec-files";

const SYSTEM_PROMPT =
  "You generate precise, build-ready software specification files for AI coding agents. You are not writing marketing copy. You are producing implementation-ready documentation. Be specific. Include concrete decisions, edge cases, constraints, non-goals, and assumptions. Do not use vague filler, placeholders, or marketing language.";

const ANTI_SLOP_RULES = [
  "Anti-filler rules (strict):",
  "- No vague recommendations without implementation detail.",
  "- No generic 'best practices' sections without concrete actions.",
  "- No placeholder text (TODO, TBD, insert here, lorem ipsum).",
  "- No marketing language or hype.",
  "- No 'future enhancements' unless explicitly listed as non-MVP out-of-scope.",
  "- Every requirement must be testable or actionable.",
  "- When user input is missing, choose a concrete default and label it as an assumption.",
].join("\n");

export function buildSystemPrompt(): string {
  return SYSTEM_PROMPT;
}

function buildFileList(bundlePaths: string[], targetAgent: TargetAgent): string {
  const defs = getBundleDefinitions(targetAgent);
  return defs
    .filter((file) => bundlePaths.includes(file.path))
    .map((file) => `- ${file.path}: ${file.purpose}`)
    .join("\n");
}

function buildFileSpecificRequirements(path: string, targetAgent: TargetAgent): string {
  if (path === PREFLIGHT_PATH) {
    return [
      "File-specific requirement for preflight.md:",
      "- Include: Summary of interpreted idea, Critical missing decisions, Reasonable assumptions, Risky ambiguities, Suggested questions, Proceed with assumptions section.",
      "- End with exactly this section:",
      "## Proceed with assumptions",
      "Can proceed with assumptions: yes|no",
    ].join("\n");
  }

  if (path === QUALITY_REVIEW_PATH) {
    return [
      "File-specific requirement for quality-review.md:",
      "- Include: Missing requirements, Contradictions across files, Weak assumptions, Implementation risks, Test coverage gaps.",
      "- Include a line exactly like: Agent-readiness score: X/10 (where X is 1-10).",
      "- Include concrete fixes the user should make before handing to a coding agent.",
    ].join("\n");
  }

  if (path.endsWith(".mdc")) {
    return [
      `File-specific requirement for Cursor rule ${path}:`,
      "- MDC-compatible markdown, clear ## headings, imperative rules.",
      "- Include: Project goal, Files to read first, Implementation order, Coding constraints, Testing requirements, Forbidden actions, When to ask for clarification, PR/commit behavior, Style conventions, Definition of done.",
      "- Keep under ~120 lines.",
    ].join("\n");
  }

  if (path === "CLAUDE.md" || path === "AGENTS.md" || path === "AGENT.md") {
    return [
      `File-specific requirement for ${path}:`,
      "- Direct imperative instructions: goal, read-first files, implementation order, constraints, testing, forbidden actions, ambiguity handling, PR/commit behavior, style, definition of done.",
    ].join("\n");
  }

  switch (path) {
    case "requirements.md":
      return [
        "File-specific requirement for requirements.md:",
        "- Assign stable IDs to every requirement: REQ-001, REQ-002, etc.",
        "- Each requirement: priority, acceptance criteria, testability note.",
      ].join("\n");
    case "tasks.md":
      return [
        "File-specific requirement for tasks.md:",
        "- Numbered phases with TASK-001, TASK-002 IDs.",
        "- Small agent-executable tasks, dependencies, acceptance criteria per phase.",
      ].join("\n");
    case "architecture.md":
      return [
        "File-specific requirement for architecture.md:",
        "- Frontend/backend boundaries, data flow, auth/session, third-party services, error handling, deployment assumptions.",
      ].join("\n");
    case "test-plan.md":
      return [
        "File-specific requirement for test-plan.md:",
        "- Assign TEST-001, TEST-002 IDs to concrete test cases.",
        "- Specific unit, integration, E2E tests; negative/error cases; tests that block handoff.",
      ].join("\n");
    case "agent-instructions.md":
      return [
        "File-specific requirement for agent-instructions.md:",
        `- Direct imperative instructions tailored to ${targetAgent}.`,
      ].join("\n");
    default:
      return "";
  }
}

export function buildUserPrompt(
  input: GenerateRequest,
  file: SpecFileDefinition,
  contextFiles: Array<{ path: string; content: string }> = [],
): string {
  const bundlePaths =
    input.bundlePaths ??
    getBundleDefinitions(input.targetAgent).map((def) => def.path);

  const fileSpecific = buildFileSpecificRequirements(file.path, input.targetAgent);

  const contextBlock =
    contextFiles.length > 0
      ? [
          "",
          "Existing bundle files (align with these; do not contradict):",
          ...contextFiles.map(
            (ctx) =>
              `\n### Existing: ${ctx.path}\n${truncateContext(ctx.content)}`,
          ),
        ].join("\n")
      : "";

  const preflightBlock = input.preflightAssumptions?.trim()
    ? [
        "",
        "Preflight assumptions (binding unless contradicted):",
        truncateContext(input.preflightAssumptions, 3000),
      ].join("\n")
    : "";

  const fixBlock =
    input.fixWarnings && input.fixWarnings.length > 0
      ? [
          "",
          "Fix these validation warnings in the regenerated file:",
          ...input.fixWarnings.map((warning) => `- ${warning}`),
          "- Preserve the intended purpose of this file.",
          "- Do not change unrelated sections unnecessarily.",
        ].join("\n")
      : "";

  return [
    input.fixWarnings?.length
      ? "Regenerate this specification file to fix validation warnings."
      : "Generate a single specification file for the agent bundle below.",
    "",
    `Project name: ${input.projectName}`,
    `Project idea: ${input.projectIdea}`,
    `Target app type: ${input.appType}`,
    `Preferred stack: ${input.preferredStack || "Not specified — recommend a sensible default and document the choice"}`,
    `Target agent: ${input.targetAgent}`,
    "",
    "Agent bundle (you are generating ONE file from this set):",
    buildFileList(bundlePaths, input.targetAgent),
    "",
    `Current file path: ${file.path}`,
    `Purpose of current file: ${file.purpose}`,
    preflightBlock,
    contextBlock,
    fixBlock,
    "",
    "Cross-file rules:",
    "- Do not duplicate content from other files in this bundle.",
    "- Do not contradict already generated files.",
    ANTI_SLOP_RULES,
    fileSpecific,
    "",
    "Return ONLY the markdown content for the current file. No preamble, no wrapping code fences.",
  ]
    .filter(Boolean)
    .join("\n");
}

function truncateContext(content: string, maxChars = 6000): string {
  if (content.length <= maxChars) return content;
  return `${content.slice(0, maxChars)}\n\n[truncated for context length]`;
}

export function resolveModel(requestModel: string | undefined): string {
  const trimmed = requestModel?.trim();
  return trimmed || DEFAULT_MODEL;
}

export function resolveTemperature(value: unknown): number {
  if (typeof value !== "number" || Number.isNaN(value)) return DEFAULT_TEMPERATURE;
  return Math.min(2, Math.max(0, value));
}

export function resolveMaxTokens(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.floor(parsed);
}
