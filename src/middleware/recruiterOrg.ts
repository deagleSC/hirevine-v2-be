import type { NextFunction, Request, Response } from "express";
import { User } from "../models/User";
import { ErrorCodes } from "../http/errorCodes";
import { fail } from "../http/response";
import { asyncHandler } from "../util/asyncHandler";

/** Recruiter/admin must belong to an organization (jobs are scoped to that org). */
export const requireRecruiterOrganization = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) {
      fail(res, 401, ErrorCodes.UNAUTHORIZED, "Unauthorized");
      return;
    }
    const user = await User.findById(req.auth.userId).exec();
    if (!user) {
      fail(res, 401, ErrorCodes.UNAUTHORIZED, "Unauthorized");
      return;
    }
    if (user.role !== "recruiter" && user.role !== "admin") {
      fail(res, 403, ErrorCodes.FORBIDDEN, "Forbidden");
      return;
    }
    if (!user.organizationId) {
      fail(
        res,
        403,
        ErrorCodes.FORBIDDEN,
        "Create an organization before managing jobs",
      );
      return;
    }
    req.orgId = user.organizationId.toString();
    next();
  },
);
