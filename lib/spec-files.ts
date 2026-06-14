import { getAgentFileDefinitions } from "./agent-files";
import type { SpecFile, TargetAgent } from "./types";

export type SpecFileDefinition = {
  path: string;
  title: string;
  purpose: string;
};

export const PREFLIGHT_PATH = "preflight.md";
export const QUALITY_REVIEW_PATH = "quality-review.md";

export const CORE_SPEC_DEFINITIONS: SpecFileDefinition[] = [
  {
    path: "README.md",
    title: "README",
    purpose:
      "Project overview, setup instructions, directory structure, and how to use the spec package with the target AI agent.",
  },
  {
    path: "product-spec.md",
    title: "Product Spec",
    purpose:
      "Core product definition: problem statement, target users, value proposition, scope, and success metrics.",
  },
  {
    path: "requirements.md",
    title: "Requirements",
    purpose:
      "Functional and non-functional requirements with priorities, acceptance criteria, and explicit out-of-scope items.",
  },
  {
    path: "assumptions.md",
    title: "Assumptions",
    purpose:
      "Documented assumptions, constraints, dependencies, risks, and decisions that need validation before build.",
  },
  {
    path: "architecture.md",
    title: "Architecture",
    purpose:
      "System architecture, component boundaries, technology choices, deployment model, and integration points.",
  },
  {
    path: "data-model.md",
    title: "Data Model",
    purpose:
      "Entities, relationships, field definitions, validation rules, indexing strategy, and migration considerations.",
  },
  {
    path: "api-spec.md",
    title: "API Spec",
    purpose:
      "Endpoints, request/response schemas, auth requirements, error codes, pagination, and rate limits.",
  },
  {
    path: "user-stories.md",
    title: "User Stories",
    purpose:
      "User stories grouped by persona and epic, with acceptance criteria and edge cases for each story.",
  },
  {
    path: "tasks.md",
    title: "Tasks",
    purpose:
      "Implementation task breakdown ordered by dependency, with estimates, file targets, and definition of done.",
  },
  {
    path: "test-plan.md",
    title: "Test Plan",
    purpose:
      "Testing strategy covering unit, integration, and E2E tests with specific scenarios and coverage targets.",
  },
  {
    path: "agent-instructions.md",
    title: "Agent Instructions",
    purpose:
      "Direct instructions for the target AI coding agent: coding conventions, workflow, file priorities, and guardrails.",
  },
];

export const PREFLIGHT_DEFINITION: SpecFileDefinition = {
  path: PREFLIGHT_PATH,
  title: "Preflight",
  purpose:
    "Preflight analysis: interpreted idea summary, critical missing decisions, reasonable assumptions, risky ambiguities, suggested questions, and whether compilation can proceed.",
};

export const QUALITY_REVIEW_DEFINITION: SpecFileDefinition = {
  path: QUALITY_REVIEW_PATH,
  title: "Quality Review",
  purpose:
    "Post-compile quality review: missing requirements, contradictions, weak assumptions, implementation risks, test gaps, agent-readiness score 1-10, and concrete fixes before handoff.",
};

/** @deprecated Use getBundleDefinitions instead */
export const SPEC_FILE_DEFINITIONS = CORE_SPEC_DEFINITIONS;

export function getBundleDefinitions(targetAgent: TargetAgent): SpecFileDefinition[] {
  return [
    PREFLIGHT_DEFINITION,
    ...CORE_SPEC_DEFINITIONS,
    ...getAgentFileDefinitions(targetAgent),
    QUALITY_REVIEW_DEFINITION,
  ];
}

export function getCompilePaths(targetAgent: TargetAgent): string[] {
  return [
    ...CORE_SPEC_DEFINITIONS.map((file) => file.path),
    ...getAgentFileDefinitions(targetAgent).map((file) => file.path),
  ];
}

export function getAdaptivePoolDefinitions(
  targetAgent: TargetAgent,
): SpecFileDefinition[] {
  return [
    ...CORE_SPEC_DEFINITIONS,
    ...getAgentFileDefinitions(targetAgent),
  ];
}

export function getDefinitionByPath(
  path: string,
  targetAgent: TargetAgent,
): SpecFileDefinition | undefined {
  return getBundleDefinitions(targetAgent).find((file) => file.path === path);
}

export function createInitialSpecFiles(targetAgent: TargetAgent = "Cursor"): SpecFile[] {
  return getBundleDefinitions(targetAgent).map((def) => ({
    ...def,
    content: "",
    status: "pending" as const,
  }));
}

export function reconcileSpecFiles(
  existing: SpecFile[],
  targetAgent: TargetAgent,
): SpecFile[] {
  const byPath = new Map(existing.map((file) => [file.path, file]));
  return createInitialSpecFiles(targetAgent).map((def) => {
    const saved = byPath.get(def.path);
    if (!saved) return def;
    return {
      ...def,
      content: saved.content ?? "",
      status: saved.status ?? "pending",
    };
  });
}
