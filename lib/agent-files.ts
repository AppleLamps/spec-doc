import type { TargetAgent } from "./types";
import type { SpecFileDefinition } from "./spec-files";

export const AGENT_FILE_DEFINITIONS: Record<TargetAgent, SpecFileDefinition[]> = {
  Cursor: [
    {
      path: ".cursor/rules/project.mdc",
      title: "Cursor Project Rules",
      purpose:
        "Cursor rule file defining project goal, read-first files, stack constraints, and global coding guardrails. Use MDC format with clear headings and imperative rules.",
    },
    {
      path: ".cursor/rules/implementation.mdc",
      title: "Cursor Implementation Rules",
      purpose:
        "Cursor rule file for implementation workflow: file order, testing requirements, forbidden actions, commit/PR behavior, and definition of done. Include useful globs.",
    },
  ],
  "Claude Code": [
    {
      path: "CLAUDE.md",
      title: "Claude Code Instructions",
      purpose:
        "Primary Claude Code project instructions: goal, read-first files, implementation order, constraints, testing, forbidden actions, and definition of done.",
    },
  ],
  Codex: [
    {
      path: "AGENTS.md",
      title: "Codex Agent Instructions",
      purpose:
        "Codex AGENTS.md with project goal, read-first files, implementation order, coding constraints, testing requirements, and handoff criteria.",
    },
  ],
  "Generic Agent": [
    {
      path: "AGENT.md",
      title: "Generic Agent Instructions",
      purpose:
        "Generic coding agent instructions: project goal, read-first files, implementation order, constraints, testing, and definition of done.",
    },
  ],
};

export function getAgentFileDefinitions(targetAgent: TargetAgent): SpecFileDefinition[] {
  return AGENT_FILE_DEFINITIONS[targetAgent] ?? [];
}

export function isAgentSpecificPath(path: string, targetAgent: TargetAgent): boolean {
  return getAgentFileDefinitions(targetAgent).some((file) => file.path === path);
}
