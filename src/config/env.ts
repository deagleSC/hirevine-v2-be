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

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT) || 8000,
  mongodbUri: process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/hirevine",
  corsOrigin: parseCorsOrigins(),
  jwtSecret: getJwtSecret(),
  jwtExpiresInSec: sessionSeconds,
  authCookieName: process.env.AUTH_COOKIE_NAME?.trim() || "hirevine_session",
} as const;
