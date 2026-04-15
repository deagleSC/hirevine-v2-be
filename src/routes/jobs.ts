import { Router } from "express";
import {
  convertToModelMessages,
  streamText,
  stepCountIs,
  type UIMessage,
} from "ai";
import { createChatModel } from "../ai/openrouter";
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
import {
  buildPipelineChatSystemPrompt,
  createApplyPipelinePatchTool,
} from "../services/jobPipelineChatTools";
import { ErrorCodes } from "../http/errorCodes";
import { fail, ok } from "../http/response";
import { requireAuth } from "../middleware/auth";
import { optionalAuth } from "../middleware/optionalAuth";
import { requireRecruiterOrganization } from "../middleware/recruiterOrg";
import { requireRoles } from "../middleware/roles";
import { asyncHandler } from "../util/asyncHandler";

/** Max chars for org job list `q` (trimmed, then truncated). */
const JOB_Q_MAX_LEN = 120;
const JOB_STATUSES: JobStatus[] = ["draft", "active", "paused", "closed"];
const ORG_JOBS_MAX_LIMIT = 100;
const ORG_JOBS_DEFAULT_LIMIT = 20;
const ORG_JOBS_OPTIONS_MAX = 500;

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

function parsePositiveInt(
  raw: unknown,
  fallback: number,
  max?: number,
): number {
  const n = typeof raw === "string" ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n) || n < 1) return fallback;
  if (max !== undefined && n > max) return max;
  return n;
}

/** Comma-separated job statuses, or empty / omitted for no status filter. */
function parseJobStatusesFilter(raw: unknown): JobStatus[] | null {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw !== "string") return null;
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!parts.length) return null;
  const invalid = parts.filter((p) => !JOB_STATUSES.includes(p as JobStatus));
  if (invalid.length) return [];
  return [...new Set(parts)] as JobStatus[];
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
    return {
      ...base,
      description: job.description,
    };
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
  "/options",
  requireAuth,
  requireRoles("recruiter", "admin"),
  requireRecruiterOrganization,
  asyncHandler(async (req, res) => {
    const jobs = await Job.find({ organizationId: req.orgId })
      .select({ _id: 1, title: 1 })
      .sort({ updatedAt: -1 })
      .limit(ORG_JOBS_OPTIONS_MAX)
      .lean()
      .exec();
    ok(res, 200, {
      jobs: jobs.map((j) => ({
        id: String(j._id),
        title: j.title as string,
      })),
    });
  }),
);

/**
 * Active postings across all organizations (public fields only).
 * Registered before `GET /:jobId` so `catalog` is not treated as an id.
 */
jobsRouter.get(
  "/catalog",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const page = parsePositiveInt(req.query.page, 1);
    const limit = parsePositiveInt(
      req.query.limit,
      ORG_JOBS_DEFAULT_LIMIT,
      ORG_JOBS_MAX_LIMIT,
    );
    const skip = (page - 1) * limit;

    const qRaw = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const q = qRaw.length > JOB_Q_MAX_LEN ? qRaw.slice(0, JOB_Q_MAX_LEN) : qRaw;

    const filter: Record<string, unknown> = { status: "active" as const };
    if (q) {
      filter.title = { $regex: escapeRegex(q), $options: "i" };
    }

    const [total, docs] = await Promise.all([
      Job.countDocuments(filter).exec(),
      Job.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit).exec(),
    ]);

    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

    ok(res, 200, {
      jobs: docs.map((j) => toPublicJob(j, "public")),
      page,
      limit,
      total,
      totalPages,
    });
  }),
);

jobsRouter.get(
  "/",
  requireAuth,
  requireRoles("recruiter", "admin"),
  requireRecruiterOrganization,
  asyncHandler(async (req, res) => {
    const page = parsePositiveInt(req.query.page, 1);
    const limit = parsePositiveInt(
      req.query.limit,
      ORG_JOBS_DEFAULT_LIMIT,
      ORG_JOBS_MAX_LIMIT,
    );
    const skip = (page - 1) * limit;

    const statusFilter = parseJobStatusesFilter(req.query.status);
    if (statusFilter !== null && statusFilter.length === 0) {
      fail(
        res,
        400,
        ErrorCodes.VALIDATION_ERROR,
        `Invalid status. Use one or more of: ${JOB_STATUSES.join(", ")}`,
      );
      return;
    }

    const qRaw = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const q = qRaw.length > JOB_Q_MAX_LEN ? qRaw.slice(0, JOB_Q_MAX_LEN) : qRaw;

    const filter: Record<string, unknown> = { organizationId: req.orgId };
    if (statusFilter?.length === 1) {
      filter.status = statusFilter[0];
    } else if (statusFilter && statusFilter.length > 1) {
      filter.status = { $in: statusFilter };
    }
    if (q) {
      filter.title = { $regex: escapeRegex(q), $options: "i" };
    }

    const [total, docs] = await Promise.all([
      Job.countDocuments(filter).exec(),
      Job.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit).exec(),
    ]);

    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

    ok(res, 200, {
      jobs: docs.map((j) => toPublicJob(j, "full")),
      page,
      limit,
      total,
      totalPages,
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

jobsRouter.post(
  "/:jobId/pipeline-chat",
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
    if (!job.pipeline) {
      fail(
        res,
        400,
        ErrorCodes.VALIDATION_ERROR,
        "Job has no pipeline yet. Generate a pipeline before using the assistant.",
      );
      return;
    }

    const body = req.body as { messages?: unknown };
    if (!body.messages || !Array.isArray(body.messages)) {
      fail(
        res,
        400,
        ErrorCodes.VALIDATION_ERROR,
        "Expected JSON body with messages array",
      );
      return;
    }

    const jobIdParam = req.params.jobId;
    const jobIdForTool =
      typeof jobIdParam === "string" ? jobIdParam : (jobIdParam?.[0] ?? "");
    const apply_pipeline_patch = createApplyPipelinePatchTool({
      jobId: jobIdForTool,
      organizationId: req.orgId!,
    });
    const tools = { apply_pipeline_patch };

    let modelMessages;
    try {
      modelMessages = await convertToModelMessages(
        body.messages as UIMessage[],
        { tools },
      );
    } catch (e) {
      console.error(e);
      fail(res, 400, ErrorCodes.VALIDATION_ERROR, "Invalid chat messages");
      return;
    }

    const system = buildPipelineChatSystemPrompt(job.title, job.pipeline);

    const result = streamText({
      model: createChatModel(),
      system,
      messages: modelMessages,
      tools,
      stopWhen: stepCountIs(14),
      maxOutputTokens: 8192,
    });

    result.pipeUIMessageStreamToResponse(res);
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
      try {
        await inngest.send({
          name: HIREVINE_EVENTS.applicationCreated,
          data: { applicationRunId: run._id.toString() },
        });
      } catch (e) {
        await ApplicationRun.findByIdAndDelete(run._id).exec();
        console.error(
          "[inngest] send hirevine/application.created failed; removed application run",
          e,
        );
        fail(
          res,
          503,
          ErrorCodes.SERVICE_UNAVAILABLE,
          "Could not queue resume screening. Check Inngest keys and connectivity, then try applying again.",
        );
        return;
      }
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
