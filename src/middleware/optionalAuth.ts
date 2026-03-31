import type { NextFunction, Request, Response } from "express";
import { getSessionToken } from "../auth/fromRequest";
import { verifyAuthToken } from "../auth/jwt";

/** Sets `req.auth` when a valid session cookie or Bearer token is present; otherwise continues without auth. */
export function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const token = getSessionToken(req);
  if (!token) {
    next();
    return;
  }
  try {
    const payload = verifyAuthToken(token);
    req.auth = {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
    };
  } catch {
    // ignore invalid cookie
  }
  next();
}
