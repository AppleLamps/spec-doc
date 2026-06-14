/**
 * Query OpenRouter for JSON-capable models and print preset suggestions.
 * Run: npx tsx scripts/sync-model-presets.ts
 *
 * Requires OPENROUTER_API_KEY in the environment.
 */
import { OpenRouter } from "@openrouter/sdk";

const apiKey = process.env.OPENROUTER_API_KEY?.trim();
if (!apiKey) {
  console.error("Set OPENROUTER_API_KEY before running this script.");
  process.exit(1);
}

const client = new OpenRouter({ apiKey });

const response = await client.models.list();
const models = response.data ?? [];

const jsonCapable = models.filter((model) =>
  model.supportedParameters.some(
    (param) =>
      param === "response_format" || param === "structured_outputs",
  ),
);

const byCost = [...jsonCapable].sort((a, b) => {
  const aCost = Number(a.pricing.prompt) + Number(a.pricing.completion);
  const bCost = Number(b.pricing.prompt) + Number(b.pricing.completion);
  return aCost - bCost;
});

console.log("Suggested fast (JSON-capable, low cost):");
console.log(byCost.slice(0, 5).map((m) => `  ${m.id}`).join("\n"));
console.log("\nSuggested balanced (JSON-capable, mid context):");
console.log(
  byCost
    .filter((m) => (m.contextLength ?? 0) >= 32_000)
    .slice(0, 5)
    .map((m) => `  ${m.id}`)
    .join("\n"),
);
console.log("\nSuggested high-quality (JSON-capable, top context):");
console.log(
  byCost
    .filter((m) => (m.contextLength ?? 0) >= 128_000)
    .slice(-5)
    .map((m) => `  ${m.id}`)
    .join("\n"),
);
