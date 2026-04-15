import { Router } from "express";
import type { IOrganization } from "../models/Organization";
import { Organization } from "../models/Organization";
import { User } from "../models/User";
import { ErrorCodes } from "../http/errorCodes";
import { fail, ok } from "../http/response";
import { requireAuth } from "../middleware/auth";
import { requireRoles } from "../middleware/roles";
import { asyncHandler } from "../util/asyncHandler";

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_SLUG = 64;
const MAX_NAME = 200;

function isMongoDuplicateKey(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === 11000
  );
}

function toPublicOrganization(org: IOrganization) {
  return {
    id: org._id.toString(),
    name: org.name,
    slug: org.slug,
  };
}

export const organizationsRouter = Router();

organizationsRouter.post(
  "/join",
  requireAuth,
  requireRoles("recruiter", "admin"),
  asyncHandler(async (req, res) => {
    const slugRaw =
      typeof req.body?.slug === "string"
        ? req.body.slug.trim().toLowerCase()
        : "";

    if (!slugRaw || slugRaw.length > MAX_SLUG || !SLUG_RE.test(slugRaw)) {
      fail(
        res,
        400,
        ErrorCodes.VALIDATION_ERROR,
        "Slug must be lowercase letters, numbers, and single hyphens between segments",
      );
      return;
    }

    const me = await User.findById(req.auth!.userId).exec();
    if (me?.organizationId) {
      fail(
        res,
        409,
        ErrorCodes.CONFLICT,
        "You already belong to an organization",
      );
      return;
    }

    const org = await Organization.findOne({ slug: slugRaw }).exec();
    if (!org) {
      fail(res, 404, ErrorCodes.NOT_FOUND, "No organization with that slug");
      return;
    }

    const updated = await User.findOneAndUpdate(
      {
        _id: req.auth!.userId,
        $or: [{ organizationId: null }, { organizationId: { $exists: false } }],
      },
      { organizationId: org._id },
      { new: true },
    ).exec();

    if (!updated) {
      fail(
        res,
        409,
        ErrorCodes.CONFLICT,
        "You already belong to an organization",
      );
      return;
    }

    ok(res, 200, {
      organization: toPublicOrganization(org),
      user: {
        id: updated.id,
        email: updated.email,
        role: updated.role,
        organizationId: updated.organizationId!.toString(),
      },
    });
  }),
);

organizationsRouter.post(
  "/",
  requireAuth,
  requireRoles("recruiter", "admin"),
  asyncHandler(async (req, res) => {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const slugRaw =
      typeof req.body?.slug === "string"
        ? req.body.slug.trim().toLowerCase()
        : "";

    if (!name || name.length > MAX_NAME) {
      fail(res, 400, ErrorCodes.VALIDATION_ERROR, "Valid name is required");
      return;
    }
    if (!slugRaw || slugRaw.length > MAX_SLUG || !SLUG_RE.test(slugRaw)) {
      fail(
        res,
        400,
        ErrorCodes.VALIDATION_ERROR,
        "Slug must be lowercase letters, numbers, and single hyphens between segments",
      );
      return;
    }

    const existing = await User.findById(req.auth!.userId).exec();
    if (existing?.organizationId) {
      fail(
        res,
        409,
        ErrorCodes.CONFLICT,
        "You already belong to an organization",
      );
      return;
    }

    let org;
    try {
      org = await Organization.create({ name, slug: slugRaw });
    } catch (err: unknown) {
      if (isMongoDuplicateKey(err)) {
        fail(res, 409, ErrorCodes.CONFLICT, "Organization slug already taken");
        return;
      }
      throw err;
    }

    const updated = await User.findOneAndUpdate(
      {
        _id: req.auth!.userId,
        $or: [{ organizationId: null }, { organizationId: { $exists: false } }],
      },
      { organizationId: org._id },
      { new: true },
    ).exec();

    if (!updated) {
      await Organization.deleteOne({ _id: org._id }).exec();
      fail(
        res,
        409,
        ErrorCodes.CONFLICT,
        "You already belong to an organization",
      );
      return;
    }

    ok(res, 201, {
      organization: toPublicOrganization(org),
      user: {
        id: updated.id,
        email: updated.email,
        role: updated.role,
        organizationId: updated.organizationId!.toString(),
      },
    });
  }),
);

organizationsRouter.get(
  "/me",
  requireAuth,
  requireRoles("recruiter", "admin"),
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.auth!.userId).exec();
    if (!user?.organizationId) {
      fail(res, 404, ErrorCodes.NOT_FOUND, "No organization on your account");
      return;
    }
    const org = await Organization.findById(user.organizationId).exec();
    if (!org) {
      fail(res, 404, ErrorCodes.NOT_FOUND, "Organization not found");
      return;
    }
    ok(res, 200, { organization: toPublicOrganization(org) });
  }),
);

organizationsRouter.patch(
  "/me",
  requireAuth,
  requireRoles("recruiter", "admin"),
  asyncHandler(async (req, res) => {
    const body = req.body as Record<string, unknown> | null | undefined;
    const nameProvided = body !== null && body !== undefined && "name" in body;
    const slugProvided = body !== null && body !== undefined && "slug" in body;

    if (!nameProvided && !slugProvided) {
      fail(
        res,
        400,
        ErrorCodes.VALIDATION_ERROR,
        "Provide at least one of: name, slug",
      );
      return;
    }

    const user = await User.findById(req.auth!.userId).exec();
    if (!user?.organizationId) {
      fail(res, 404, ErrorCodes.NOT_FOUND, "No organization on your account");
      return;
    }

    const org = await Organization.findById(user.organizationId).exec();
    if (!org) {
      fail(res, 404, ErrorCodes.NOT_FOUND, "Organization not found");
      return;
    }

    let nextName = org.name;
    let nextSlug = org.slug;

    if (nameProvided) {
      if (typeof body!.name !== "string") {
        fail(res, 400, ErrorCodes.VALIDATION_ERROR, "name must be a string");
        return;
      }
      const name = body!.name.trim();
      if (!name || name.length > MAX_NAME) {
        fail(res, 400, ErrorCodes.VALIDATION_ERROR, "Valid name is required");
        return;
      }
      nextName = name;
    }

    if (slugProvided) {
      if (typeof body!.slug !== "string") {
        fail(res, 400, ErrorCodes.VALIDATION_ERROR, "slug must be a string");
        return;
      }
      const slugRaw = body!.slug.trim().toLowerCase();
      if (!slugRaw || slugRaw.length > MAX_SLUG || !SLUG_RE.test(slugRaw)) {
        fail(
          res,
          400,
          ErrorCodes.VALIDATION_ERROR,
          "Slug must be lowercase letters, numbers, and single hyphens between segments",
        );
        return;
      }
      nextSlug = slugRaw;
    }

    if (nextSlug !== org.slug) {
      const taken = await Organization.findOne({
        slug: nextSlug,
        _id: { $ne: org._id },
      }).exec();
      if (taken) {
        fail(res, 409, ErrorCodes.CONFLICT, "Organization slug already taken");
        return;
      }
    }

    org.name = nextName;
    org.slug = nextSlug;
    try {
      await org.save();
    } catch (err: unknown) {
      if (isMongoDuplicateKey(err)) {
        fail(res, 409, ErrorCodes.CONFLICT, "Organization slug already taken");
        return;
      }
      throw err;
    }

    ok(res, 200, { organization: toPublicOrganization(org) });
  }),
);

organizationsRouter.post(
  "/me/leave",
  requireAuth,
  requireRoles("recruiter", "admin"),
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.auth!.userId).exec();
    if (!user?.organizationId) {
      fail(
        res,
        404,
        ErrorCodes.NOT_FOUND,
        "You are not linked to an organization",
      );
      return;
    }

    user.organizationId = null;
    await user.save();

    ok(res, 200, {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        organizationId: null,
      },
    });
  }),
);
