import { APICallError } from "ai";

/** Best-effort string for logs / Mongo payload when an AI provider call fails. */
export function formatAiProviderError(error: unknown): string {
  if (APICallError.isInstance(error)) {
    const parts: string[] = [error.message];
    if (error.statusCode != null) {
      parts.push(`http ${error.statusCode}`);
    }
    if (error.responseBody?.trim()) {
      const snippet = error.responseBody.trim().slice(0, 800);
      parts.push(snippet);
    }
    return parts.join(" | ");
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
