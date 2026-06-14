import { getServerDefaultModel } from "@/lib/config";
import {
  refreshModelsCache,
  validatePresetModels,
} from "@/lib/openrouter-models-cache";
import { getOpenRouterApiKey } from "@/lib/openrouter-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  let presetWarnings: ReturnType<typeof validatePresetModels> = [];

  if (getOpenRouterApiKey()) {
    try {
      await refreshModelsCache();
      presetWarnings = validatePresetModels();
    } catch (error) {
      console.warn("[config] OpenRouter models cache refresh failed:", error);
    }
  }

  return Response.json({
    hasApiKey: Boolean(getOpenRouterApiKey()),
    defaultModel: getServerDefaultModel(),
    presetWarnings,
  });
}
