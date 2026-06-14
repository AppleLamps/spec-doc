import { OpenRouter as OpenRouterAgent } from "@openrouter/agent";
import { OpenRouter as OpenRouterSdk } from "@openrouter/sdk";

let agentClient: OpenRouterAgent | null = null;
let sdkClient: OpenRouterSdk | null = null;

export function getOpenRouterApiKey(): string | undefined {
  return process.env.OPENROUTER_API_KEY?.trim();
}

function buildClientOptions() {
  return {
    apiKey: getOpenRouterApiKey(),
    httpReferer:
      process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000",
    appTitle: "Prompt to Spec",
  };
}

export function getOpenRouterClient(): OpenRouterAgent {
  if (!agentClient) {
    agentClient = new OpenRouterAgent(buildClientOptions());
  }
  return agentClient;
}

export function getOpenRouterSdkClient(): OpenRouterSdk {
  if (!sdkClient) {
    sdkClient = new OpenRouterSdk(buildClientOptions());
  }
  return sdkClient;
}

/** Reset client (tests). */
export function resetOpenRouterClient(): void {
  agentClient = null;
  sdkClient = null;
}
