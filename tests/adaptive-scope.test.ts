import assert from "node:assert/strict";
import test from "node:test";
import {
  getAdaptivePoolPaths,
  getRequiredAdaptivePaths,
  parseAdaptiveScopeResponse,
} from "../lib/adaptive-scope.ts";

test("parses a valid adaptive selection", () => {
  const result = parseAdaptiveScopeResponse(
    JSON.stringify({
      selectedPaths: [
        "README.md",
        "product-spec.md",
        "requirements.md",
        "agent-instructions.md",
        ".cursor/rules/project.mdc",
        ".cursor/rules/implementation.mdc",
      ],
      deselectedPaths: [
        {
          path: "data-model.md",
          reason: "No persistent domain model is needed for the MVP.",
        },
      ],
      rationale: "A compact implementation handoff is enough.",
    }),
    "Cursor",
  );

  assert.deepEqual(result.warnings, []);
  assert.equal(result.selection.rationale, "A compact implementation handoff is enough.");
  assert.ok(result.selection.selectedPaths.includes(".cursor/rules/project.mdc"));
  assert.equal(
    result.selection.deselectedPaths.find((item) => item.path === "data-model.md")
      ?.reason,
    "No persistent domain model is needed for the MVP.",
  );
});

test("adds missing required files", () => {
  const result = parseAdaptiveScopeResponse(
    JSON.stringify({
      selectedPaths: ["README.md", "product-spec.md"],
      deselectedPaths: [],
      rationale: "Too narrow.",
    }),
    "Codex",
  );

  for (const path of getRequiredAdaptivePaths("Codex")) {
    assert.ok(result.selection.selectedPaths.includes(path), path);
  }
  assert.ok(result.warnings.includes("required-path-added:requirements.md"));
  assert.ok(result.warnings.includes("required-path-added:AGENTS.md"));
});

test("removes unknown paths", () => {
  const result = parseAdaptiveScopeResponse(
    JSON.stringify({
      selectedPaths: [
        "README.md",
        "product-spec.md",
        "requirements.md",
        "agent-instructions.md",
        "AGENT.md",
        "unknown.md",
      ],
      deselectedPaths: [{ path: "ghost.md", reason: "Not real." }],
      rationale: "Generic agent handoff.",
    }),
    "Generic Agent",
  );

  assert.ok(!result.selection.selectedPaths.includes("unknown.md"));
  assert.ok(!result.selection.deselectedPaths.some((item) => item.path === "ghost.md"));
  assert.ok(result.warnings.includes("unknown-selected-paths"));
});

test("falls back to the full pool for malformed JSON", () => {
  const result = parseAdaptiveScopeResponse("{not json", "Claude Code");

  assert.deepEqual(result.selection.selectedPaths, getAdaptivePoolPaths("Claude Code"));
  assert.deepEqual(result.selection.deselectedPaths, []);
  assert.deepEqual(result.warnings, ["invalid-json"]);
});

test("deduplicates selected paths", () => {
  const result = parseAdaptiveScopeResponse(
    JSON.stringify({
      selectedPaths: [
        "README.md",
        "README.md",
        "product-spec.md",
        "requirements.md",
        "agent-instructions.md",
        "CLAUDE.md",
      ],
      deselectedPaths: [],
      rationale: "Duplicates should collapse.",
    }),
    "Claude Code",
  );

  assert.equal(
    result.selection.selectedPaths.filter((path) => path === "README.md").length,
    1,
  );
});

test("falls back to the full pool for an empty selection", () => {
  const result = parseAdaptiveScopeResponse(
    JSON.stringify({
      selectedPaths: [],
      deselectedPaths: [],
      rationale: "No files.",
    }),
    "Cursor",
  );

  assert.deepEqual(result.selection.selectedPaths, getAdaptivePoolPaths("Cursor"));
  assert.ok(result.warnings.includes("empty-selection"));
});

test("requires target-agent-specific instruction files", () => {
  const result = parseAdaptiveScopeResponse(
    JSON.stringify({
      selectedPaths: [
        "README.md",
        "product-spec.md",
        "requirements.md",
        "agent-instructions.md",
      ],
      deselectedPaths: [],
      rationale: "Missing target file.",
    }),
    "Cursor",
  );

  assert.ok(result.selection.selectedPaths.includes(".cursor/rules/project.mdc"));
  assert.ok(result.selection.selectedPaths.includes(".cursor/rules/implementation.mdc"));
});
