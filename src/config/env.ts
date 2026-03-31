import dotenv from "dotenv";

dotenv.config();

function parseCorsOrigins(): string[] | true {
  const raw = process.env.CORS_ORIGIN?.trim();
  if (!raw) return true;
  const list = raw
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  return list.length ? list : true;
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim();
  if (secret) return secret;
  const nodeEnv = process.env.NODE_ENV ?? "development";
  if (nodeEnv === "production") {
    throw new Error("JWT_SECRET is required in production");
  }
  return "dev-only-insecure-jwt-secret";
}

const jwtExpiresInSec = Number(process.env.JWT_EXPIRES_SEC);
const sessionSeconds =
  Number.isFinite(jwtExpiresInSec) && jwtExpiresInSec > 0
    ? jwtExpiresInSec
    : 604800;

function getOpenRouterHeaders(): Record<string, string> | undefined {
  const referer = process.env.OPENROUTER_HTTP_REFERER?.trim();
  const title = process.env.OPENROUTER_APP_TITLE?.trim();
  if (!referer && !title) return undefined;
  const h: Record<string, string> = {};
  if (referer) h["HTTP-Referer"] = referer;
  if (title) h["X-OpenRouter-Title"] = title;
  return h;
}

function getOpenRouterConfig(): {
  baseURL: string;
  apiKey: string;
  model: string;
  headers: Record<string, string> | undefined;
} {
  const rawBase =
    process.env.OPENROUTER_BASE_URL?.trim() || "https://openrouter.ai/api/v1";
  const baseURL = rawBase.replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(baseURL)) {
    throw new Error(
      `OPENROUTER_BASE_URL must be a full URL (e.g. https://openrouter.ai/api/v1). Received: ${baseURL}`,
    );
  }
  const apiKey = process.env.OPENROUTER_API_KEY?.trim() ?? "";
  const model = process.env.OPENROUTER_MODEL?.trim() || "openai/gpt-4o-mini";
  const nodeEnv = process.env.NODE_ENV ?? "development";
  if (nodeEnv === "production" && !apiKey) {
    throw new Error("OPENROUTER_API_KEY is required in production");
  }
  return {
    baseURL,
    apiKey,
    model,
    headers: getOpenRouterHeaders(),
  };
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT) || 8000,
  mongodbUri: process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/hirevine",
  corsOrigin: parseCorsOrigins(),
  jwtSecret: getJwtSecret(),
  jwtExpiresInSec: sessionSeconds,
  authCookieName: process.env.AUTH_COOKIE_NAME?.trim() || "hirevine_session",
  openRouter: getOpenRouterConfig(),
} as const;
