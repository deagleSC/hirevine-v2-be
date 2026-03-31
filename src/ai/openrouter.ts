import { createOpenAI } from "@ai-sdk/openai";
import { env } from "../config/env";

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
