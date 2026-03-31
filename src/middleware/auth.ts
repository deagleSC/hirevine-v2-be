import type { NextFunction, Request, Response } from "express";
import { getSessionToken } from "../auth/fromRequest";
import { verifyAuthToken } from "../auth/jwt";
import { ErrorCodes } from "../http/errorCodes";
import { fail } from "../http/response";

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const token = getSessionToken(req);
  if (!token) {
    fail(res, 401, ErrorCodes.UNAUTHORIZED, "Unauthorized");
    return;
  }
  try {
    const payload = verifyAuthToken(token);
    req.auth = {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
    };
    next();
  } catch {
    fail(res, 401, ErrorCodes.UNAUTHORIZED, "Unauthorized");
  }
}
