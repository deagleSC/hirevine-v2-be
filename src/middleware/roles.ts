import type { NextFunction, Request, Response } from "express";
import type { UserRole } from "../models/User";
import { ErrorCodes } from "../http/errorCodes";
import { fail } from "../http/response";

export function requireRoles(...allowed: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      fail(res, 401, ErrorCodes.UNAUTHORIZED, "Unauthorized");
      return;
    }
    if (!allowed.includes(req.auth.role)) {
      fail(res, 403, ErrorCodes.FORBIDDEN, "Forbidden");
      return;
    }
    next();
  };
}
