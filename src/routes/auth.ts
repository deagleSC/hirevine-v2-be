import { Router } from "express";
import { User, type IUser } from "../models/User";
import { hashPassword, verifyPassword } from "../auth/password";
import { signAuthToken } from "../auth/jwt";
import { authCookieOptions, clearAuthCookie } from "../auth/cookie";
import { env } from "../config/env";
import { ErrorCodes } from "../http/errorCodes";
import { fail, ok } from "../http/response";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../util/asyncHandler";

const MIN_PASSWORD_LEN = 8;

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function parseRegisterRole(value: unknown): "recruiter" | "candidate" {
  if (value === "candidate") return "candidate";
  return "recruiter";
}

function isMongoDuplicateKey(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === 11000
  );
}

function toPublicUser(user: IUser) {
  const raw =
    typeof user.displayName === "string" ? user.displayName.trim() : "";
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    organizationId: user.organizationId?.toString() ?? null,
    displayName: raw.slice(0, 120),
    createdAt: user.createdAt,
  };
}

export const authRouter = Router();

authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.auth!.userId).exec();
    if (!user) {
      fail(res, 401, ErrorCodes.UNAUTHORIZED, "Unauthorized");
      return;
    }
    ok(res, 200, { user: toPublicUser(user) });
  }),
);

authRouter.patch(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = req.body as Record<string, unknown> | null | undefined;
    const b = body ?? {};
    const hasDisplayName = Object.prototype.hasOwnProperty.call(
      b,
      "displayName",
    );
    const newPasswordRaw = b.newPassword;
    const hasNewPassword =
      typeof newPasswordRaw === "string" && newPasswordRaw.length > 0;

    if (!hasDisplayName && !hasNewPassword) {
      fail(
        res,
        400,
        ErrorCodes.VALIDATION_ERROR,
        "Provide displayName and/or newPassword",
      );
      return;
    }

    const user = await User.findById(req.auth!.userId).exec();
    if (!user) {
      fail(res, 401, ErrorCodes.UNAUTHORIZED, "Unauthorized");
      return;
    }

    if (hasDisplayName) {
      if (typeof b.displayName !== "string") {
        fail(
          res,
          400,
          ErrorCodes.VALIDATION_ERROR,
          "displayName must be a string",
        );
        return;
      }
      user.displayName = b.displayName.trim().slice(0, 120);
    }

    if (hasNewPassword) {
      const currentPassword =
        typeof b.currentPassword === "string" ? b.currentPassword : "";
      if (!currentPassword) {
        fail(
          res,
          400,
          ErrorCodes.VALIDATION_ERROR,
          "currentPassword is required to change password",
        );
        return;
      }
      const newPassword = newPasswordRaw as string;
      if (newPassword.length < MIN_PASSWORD_LEN) {
        fail(
          res,
          400,
          ErrorCodes.VALIDATION_ERROR,
          `Password must be at least ${MIN_PASSWORD_LEN} characters`,
        );
        return;
      }
      if (!(await verifyPassword(currentPassword, user.passwordHash))) {
        fail(
          res,
          400,
          ErrorCodes.VALIDATION_ERROR,
          "Current password is incorrect",
        );
        return;
      }
      user.passwordHash = await hashPassword(newPassword);
    }

    await user.save();
    ok(res, 200, { user: toPublicUser(user) });
  }),
);

authRouter.post(
  "/register",
  asyncHandler(async (req, res) => {
    const emailRaw =
      typeof req.body?.email === "string"
        ? req.body.email.trim().toLowerCase()
        : "";
    const password =
      typeof req.body?.password === "string" ? req.body.password : "";
    const role = parseRegisterRole(req.body?.role);

    if (!emailRaw || !isValidEmail(emailRaw)) {
      fail(res, 400, ErrorCodes.VALIDATION_ERROR, "Valid email is required");
      return;
    }
    if (password.length < MIN_PASSWORD_LEN) {
      fail(
        res,
        400,
        ErrorCodes.VALIDATION_ERROR,
        `Password must be at least ${MIN_PASSWORD_LEN} characters`,
      );
      return;
    }

    try {
      const passwordHash = await hashPassword(password);
      const user = await User.create({
        email: emailRaw,
        passwordHash,
        role,
      });
      const token = signAuthToken({
        sub: user.id,
        email: user.email,
        role: user.role,
      });
      res.cookie(env.authCookieName, token, authCookieOptions());
      ok(res, 201, {
        user: toPublicUser(user),
        accessToken: token,
      });
    } catch (err: unknown) {
      if (isMongoDuplicateKey(err)) {
        fail(res, 409, ErrorCodes.CONFLICT, "Email already registered");
        return;
      }
      throw err;
    }
  }),
);

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const emailRaw =
      typeof req.body?.email === "string"
        ? req.body.email.trim().toLowerCase()
        : "";
    const password =
      typeof req.body?.password === "string" ? req.body.password : "";

    if (!emailRaw || password.length === 0) {
      fail(
        res,
        400,
        ErrorCodes.VALIDATION_ERROR,
        "Email and password are required",
      );
      return;
    }

    const user = await User.findOne({ email: emailRaw });
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      fail(res, 401, ErrorCodes.UNAUTHORIZED, "Invalid email or password");
      return;
    }

    const token = signAuthToken({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
    res.cookie(env.authCookieName, token, authCookieOptions());
    ok(res, 200, {
      user: toPublicUser(user),
      accessToken: token,
    });
  }),
);

authRouter.post("/logout", (_req, res) => {
  clearAuthCookie(res);
  ok(res, 200, null);
});
