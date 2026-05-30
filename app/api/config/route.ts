import { getOpenRouterApiKey } from "@/lib/openrouter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    hasApiKey: Boolean(getOpenRouterApiKey()),
  });
}
