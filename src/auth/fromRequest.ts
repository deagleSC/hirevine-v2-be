import type { Request } from "express";
import { env } from "../config/env";

/** Session JWT from HTTP-only cookie or `Authorization: Bearer <token>`. */
export function getSessionToken(req: Request): string | undefined {
  const fromCookie = req.cookies?.[env.authCookieName] as string | undefined;
  if (fromCookie) return fromCookie;
  const h = req.headers.authorization;
  if (typeof h !== "string" || !/^Bearer\s+/i.test(h)) return undefined;
  const raw = h.replace(/^Bearer\s+/i, "").trim();
  return raw || undefined;
}
