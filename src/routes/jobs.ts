import { Router } from "express";
import { env } from "../config/env";
import { parseJobPipeline } from "../jobs/jobPipelineSchema";
import type { IApplicationRun } from "../models/ApplicationRun";
import type { IJob } from "../models/Job";
import { Job, type JobStatus } from "../models/Job";
import { ApplicationRun } from "../models/ApplicationRun";
import { User } from "../models/User";
import { HIREVINE_EVENTS } from "../inngest/events";
import { inngest } from "../inngest/client";
import { isResumeStorageUrl } from "../resume/isResumeStorageUrl";
import { generateJobPipelineFromDescription } from "../services/generateJobPipeline";
import { ErrorCodes } from "../http/errorCodes";
import { fail, ok } from "../http/response";
import { requireAuth } from "../middleware/auth";
import { optionalAuth } from "../middleware/optionalAuth";
import { requireRecruiterOrganization } from "../middleware/recruiterOrg";
import { requireRoles } from "../middleware/roles";
import { asyncHandler } from "../util/asyncHandler";

const BROWSE_LIMIT = 50;
const JOB_STATUSES: JobStatus[] = ["draft", "active", "paused", "closed"];

function isValidHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function parseJobStatus(value: unknown): JobStatus | undefined {
  if (typeof value !== "string") return undefined;
  return JOB_STATUSES.includes(value as JobStatus)
    ? (value as JobStatus)
    : undefined;
}

function toPublicJob(job: IJob, visibility: "public" | "full") {
  const base = {
    id: job.id,
    title: job.title,
    status: job.status,
    organizationId: job.organizationId.toString(),
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
  if (visibility === "public") {
    return base;
  }
  return {
    ...base,
    description: job.description,
    createdBy: job.createdBy.toString(),
    pipeline: job.pipeline ?? null,
  };
}

function toPublicApplicationRun(doc: IApplicationRun) {
  return {
    id: doc._id.toString(),
    jobId: doc.jobId.toString(),
    candidateId: doc.candidateId.toString(),
    organizationId: doc.organizationId.toString(),
    status: doc.status,
    resumeUrl: doc.resumeUrl,
    currentFitScore: doc.currentFitScore,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function isMongoDuplicateKey(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === 11000
  );
}

export const jobsRouter = Router();

jobsRouter.get(
  "/browse",
  asyncHandler(async (_req, res) => {
    const jobs = await Job.find({ status: "active" })
      .sort({ createdAt: -1 })
      .limit(BROWSE_LIMIT)
      .exec();
    ok(res, 200, {
      jobs: jobs.map((j) => toPublicJob(j, "public")),
    });
  }),
);

jobsRouter.post(
  "/",
  requireAuth,
  requireRoles("recruiter", "admin"),
  requireRecruiterOrganization,
  asyncHandler(async (req, res) => {
    const title =
      typeof req.body?.title === "string" ? req.body.title.trim() : "";
    const description =
      typeof req.body?.description === "string" ? req.body.description : "";
    const status = parseJobStatus(req.body?.status) ?? "draft";

    if (!title) {
      fail(res, 400, ErrorCodes.VALIDATION_ERROR, "Title is required");
      return;
    }

    let pipeline: IJob["pipeline"] = null;
    if (req.body?.pipeline !== undefined && req.body?.pipeline !== null) {
      const parsed = parseJobPipeline(req.body.pipeline);
      if (!parsed.success) {
        fail(
          res,
          400,
          ErrorCodes.VALIDATION_ERROR,
          "Invalid pipeline: " + parsed.error.message,
        );
        return;
      }
      pipeline = parsed.data;
    }

    const job = await Job.create({
      organizationId: req.orgId,
      createdBy: req.auth!.userId,
      title,
      description: description.trim(),
      status,
      pipeline,
    });
    ok(res, 201, { job: toPublicJob(job, "full") });
  }),
);

jobsRouter.get(
  "/",
  requireAuth,
  requireRoles("recruiter", "admin"),
  requireRecruiterOrganization,
  asyncHandler(async (req, res) => {
    const jobs = await Job.find({ organizationId: req.orgId })
      .sort({ createdAt: -1 })
      .exec();
    ok(res, 200, {
      jobs: jobs.map((j) => toPublicJob(j, "full")),
    });
  }),
);

jobsRouter.post(
  "/:jobId/generate-pipeline",
  requireAuth,
  requireRoles("recruiter", "admin"),
  requireRecruiterOrganization,
  asyncHandler(async (req, res) => {
    if (!env.openRouter.apiKey) {
      fail(
        res,
        503,
        ErrorCodes.SERVICE_UNAVAILABLE,
        "OPENROUTER_API_KEY is not configured",
      );
      return;
    }

    const job = await Job.findOne({
      _id: req.params.jobId,
      organizationId: req.orgId,
    }).exec();
    if (!job) {
      fail(res, 404, ErrorCodes.NOT_FOUND, "Job not found");
      return;
    }

    const trimmed = job.description.trim();
    if (trimmed.length < 40) {
      fail(
        res,
        400,
        ErrorCodes.VALIDATION_ERROR,
        "Job description must be at least 40 characters to generate a pipeline",
      );
      return;
    }

    try {
      const pipeline = await generateJobPipelineFromDescription({
        jobTitle: job.title,
        description: trimmed,
      });
      job.pipeline = pipeline;
      await job.save();
      ok(res, 200, { job: toPublicJob(job, "full") });
    } catch (e) {
      console.error(e);
      fail(
        res,
        502,
        ErrorCodes.SERVICE_UNAVAILABLE,
        "Pipeline generation failed; try again or set pipeline manually",
      );
    }
  }),
);

jobsRouter.get(
  "/:jobId/applications",
  requireAuth,
  requireRoles("recruiter", "admin"),
  requireRecruiterOrganization,
  asyncHandler(async (req, res) => {
    const job = await Job.findOne({
      _id: req.params.jobId,
      organizationId: req.orgId,
    }).exec();
    if (!job) {
      fail(res, 404, ErrorCodes.NOT_FOUND, "Job not found");
      return;
    }
    const runs = await ApplicationRun.find({ jobId: job._id })
      .sort({ createdAt: -1 })
      .exec();
    ok(res, 200, {
      applications: runs.map((r) => toPublicApplicationRun(r)),
    });
  }),
);

jobsRouter.post(
  "/:jobId/apply",
  requireAuth,
  requireRoles("candidate"),
  asyncHandler(async (req, res) => {
    const resumeUrl =
      typeof req.body?.resumeUrl === "string" ? req.body.resumeUrl.trim() : "";
    if (!resumeUrl || !isValidHttpUrl(resumeUrl)) {
      fail(
        res,
        400,
        ErrorCodes.VALIDATION_ERROR,
        "Valid resumeUrl (https) is required",
      );
      return;
    }

    if (!isResumeStorageUrl(resumeUrl) && !env.allowAnyResumeUrl) {
      fail(
        res,
        400,
        ErrorCodes.VALIDATION_ERROR,
        "resumeUrl must be the URL returned from POST /api/resumes/upload (Vercel Blob public URL).",
      );
      return;
    }

    const job = await Job.findById(req.params.jobId).exec();
    if (!job) {
      fail(res, 404, ErrorCodes.NOT_FOUND, "Job not found");
      return;
    }
    if (job.status !== "active") {
      fail(
        res,
        400,
        ErrorCodes.VALIDATION_ERROR,
        "This job is not accepting applications",
      );
      return;
    }

    try {
      const run = await ApplicationRun.create({
        jobId: job._id,
        candidateId: req.auth!.userId,
        organizationId: job.organizationId,
        status: "NODE_1_PENDING",
        resumeUrl,
      });
      void inngest
        .send({
          name: HIREVINE_EVENTS.applicationCreated,
          data: { applicationRunId: run._id.toString() },
        })
        .catch((e) => {
          console.error(
            "[inngest] send hirevine/application.created failed",
            e,
          );
        });
      ok(res, 201, { application: toPublicApplicationRun(run) });
    } catch (err: unknown) {
      if (isMongoDuplicateKey(err)) {
        fail(
          res,
          409,
          ErrorCodes.CONFLICT,
          "You have already applied to this job",
        );
        return;
      }
      throw err;
    }
  }),
);

jobsRouter.get(
  "/:jobId",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const job = await Job.findById(req.params.jobId).exec();
    if (!job) {
      fail(res, 404, ErrorCodes.NOT_FOUND, "Job not found");
      return;
    }

    if (job.status === "active") {
      ok(res, 200, { job: toPublicJob(job, "public") });
      return;
    }

    if (!req.auth) {
      fail(res, 401, ErrorCodes.UNAUTHORIZED, "Unauthorized");
      return;
    }

    const user = await User.findById(req.auth.userId).exec();
    if (!user || (user.role !== "recruiter" && user.role !== "admin")) {
      fail(res, 403, ErrorCodes.FORBIDDEN, "Forbidden");
      return;
    }
    if (!user.organizationId) {
      fail(res, 403, ErrorCodes.FORBIDDEN, "Forbidden");
      return;
    }
    if (user.organizationId.toString() !== job.organizationId.toString()) {
      fail(res, 403, ErrorCodes.FORBIDDEN, "Forbidden");
      return;
    }

    ok(res, 200, { job: toPublicJob(job, "full") });
  }),
);

jobsRouter.patch(
  "/:jobId",
  requireAuth,
  requireRoles("recruiter", "admin"),
  requireRecruiterOrganization,
  asyncHandler(async (req, res) => {
    const job = await Job.findOne({
      _id: req.params.jobId,
      organizationId: req.orgId,
    }).exec();
    if (!job) {
      fail(res, 404, ErrorCodes.NOT_FOUND, "Job not found");
      return;
    }

    const patch: Partial<{
      title: string;
      description: string;
      status: JobStatus;
      pipeline: IJob["pipeline"];
    }> = {};
    if (typeof req.body?.title === "string") {
      const t = req.body.title.trim();
      if (!t) {
        fail(res, 400, ErrorCodes.VALIDATION_ERROR, "Title cannot be empty");
        return;
      }
      patch.title = t;
    }
    if (typeof req.body?.description === "string") {
      patch.description = req.body.description.trim();
    }
    if (req.body?.status !== undefined) {
      const next = parseJobStatus(req.body.status);
      if (!next) {
        fail(res, 400, ErrorCodes.VALIDATION_ERROR, "Invalid status");
        return;
      }
      patch.status = next;
    }
    if (req.body?.pipeline !== undefined) {
      if (req.body.pipeline === null) {
        patch.pipeline = null;
      } else {
        const parsed = parseJobPipeline(req.body.pipeline);
        if (!parsed.success) {
          fail(
            res,
            400,
            ErrorCodes.VALIDATION_ERROR,
            "Invalid pipeline: " + parsed.error.message,
          );
          return;
        }
        patch.pipeline = parsed.data;
      }
    }

    if (Object.keys(patch).length === 0) {
      fail(res, 400, ErrorCodes.VALIDATION_ERROR, "No valid fields to update");
      return;
    }

    Object.assign(job, patch);
    await job.save();
    ok(res, 200, { job: toPublicJob(job, "full") });
  }),
);
