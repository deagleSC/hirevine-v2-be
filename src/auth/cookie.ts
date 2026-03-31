import type { CookieOptions, Response } from "express";
import { env } from "../config/env";

function authCookieShape(): Pick<
  CookieOptions,
  "httpOnly" | "secure" | "sameSite" | "path"
> {
  const isProd = env.nodeEnv === "production";
  /** Production defaults to Secure cookies (HTTPS). Set AUTH_COOKIE_SECURE=false for local http:// testing with NODE_ENV=production. */
  const secure =
    isProd &&
    process.env.AUTH_COOKIE_SECURE?.trim().toLowerCase() !== "false";
  const raw = process.env.AUTH_COOKIE_SAMESITE?.trim().toLowerCase();
  let sameSite: CookieOptions["sameSite"] =
    raw === "lax" || raw === "strict" || raw === "none"
      ? raw
      : secure
        ? "none"
        : "lax";
  // SameSite=None is rejected without Secure; insecure cookies cannot use none.
  if (!secure && sameSite === "none") {
    sameSite = "lax";
  }
  return {
    httpOnly: true,
    secure,
    sameSite,
    path: "/",
  };
}

export function authCookieOptions(): CookieOptions {
  return {
    ...authCookieShape(),
    maxAge: env.jwtExpiresInSec * 1000,
  };
}

export function clearAuthCookie(res: Response): void {
  res.clearCookie(env.authCookieName, authCookieShape());
}
