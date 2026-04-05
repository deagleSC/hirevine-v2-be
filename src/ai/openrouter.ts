import { createOpenAI } from "@ai-sdk/openai";
import { env } from "../config/env";

/**
 * OpenRouter often rejects or mishandles `strict: true` JSON-schema responses.
 * Pass this into `generateObject({ providerOptions: … })` for all OpenRouter calls.
 */
export const openRouterStructuredOutputProviderOptions = {
  openai: {
    strictJsonSchema: false,
  },
} as const;

/**
 * OpenRouter exposes an OpenAI-compatible API at OPENROUTER_BASE_URL
 * (default https://openrouter.ai/api/v1).
 */
export function createChatModel() {
  const { baseURL, apiKey, model, headers } = env.openRouter;
  const provider = createOpenAI({
    baseURL,
    apiKey: apiKey || "missing-openrouter-key",
    name: "openrouter",
    headers,
  });
  return provider.chat(model);
}
