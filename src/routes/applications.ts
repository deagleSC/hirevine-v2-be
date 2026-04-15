import { Router } from "express";
import mongoose from "mongoose";
import { ErrorCodes } from "../http/errorCodes";
import { fail, ok } from "../http/response";
import { HIREVINE_EVENTS } from "../inngest/events";
import { inngest } from "../inngest/client";
import type {
  ApplicationStatus,
  IApplicationRun,
} from "../models/ApplicationRun";
import { ApplicationRun } from "../models/ApplicationRun";
import type { IJob } from "../models/Job";
import { Job } from "../models/Job";
import type { INodeResult } from "../models/NodeResult";
import { NodeResult } from "../models/NodeResult";
import { User } from "../models/User";
import { toPublicQuizQuestions } from "../quiz/quizPublic";
import { gradeQuizSubmission } from "../services/gradeQuiz";
import {
  getCandidateAnalytics,
  getRecruiterOrgAnalytics,
} from "../services/dashboardAnalytics";
import { requireAuth } from "../middleware/auth";
import { requireRecruiterOrganization } from "../middleware/recruiterOrg";
import { requireRoles } from "../middleware/roles";
import { asyncHandler } from "../util/asyncHandler";

const APPLICATION_STATUSES: ApplicationStatus[] = [
  "NODE_1_PENDING",
  "NODE_2_PENDING",
  "NODE_3_PENDING",
  "COMPLETED",
  "REJECTED",
];

const ORG_APPLICATIONS_MAX_LIMIT = 100;
const ORG_APPLICATIONS_DEFAULT_LIMIT = 20;

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

function parseStatusFilter(raw: unknown): ApplicationStatus[] | null {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw !== "string") return null;
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!parts.length) return null;
  const invalid = parts.filter(
    (p) => !APPLICATION_STATUSES.includes(p as ApplicationStatus),
  );
  if (invalid.length) return [];
  return parts as ApplicationStatus[];
}

function toRecruiterApplicationListRow(
  run: IApplicationRun,
  candidateEmail: string,
  jobTitle: string,
) {
  return {
    id: run._id.toString(),
    jobId: run.jobId.toString(),
    candidateId: run.candidateId.toString(),
    organizationId: run.organizationId.toString(),
    status: run.status,
    resumeUrl: run.resumeUrl,
    currentFitScore: run.currentFitScore,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    candidateEmail,
    jobTitle,
  };
}

function toPublicApplicationWithJob(run: IApplicationRun, job: IJob | null) {
  return {
    id: run._id.toString(),
    jobId: run.jobId.toString(),
    organizationId: run.organizationId.toString(),
    status: run.status,
    resumeUrl: run.resumeUrl,
    currentFitScore: run.currentFitScore,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    job: job
      ? { id: job._id.toString(), title: job.title, status: job.status }
      : null,
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

function candidateNextStep(status: ApplicationStatus): string {
  switch (status) {
    case "NODE_1_PENDING":
      return "Resume screening is in progress.";
    case "NODE_2_PENDING":
      return "Complete the job quiz to continue.";
    case "NODE_3_PENDING":
      return "Final summary is being generated.";
    case "COMPLETED":
      return "This application is complete.";
    case "REJECTED":
      return "This application did not pass an automated screening step.";
    default:
      return "Status update pending.";
  }
}

function toNodeDetail(n: INodeResult) {
  return {
    id: n._id.toString(),
    nodeIndex: n.nodeIndex,
    nodeType: n.nodeType,
    score: n.score,
    reasoning: n.reasoning,
    payload: n.payload,
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
  };
}

function toRecruiterJobDetail(job: IJob) {
  return {
    id: job.id,
    title: job.title,
    description: job.description,
    status: job.status,
    organizationId: job.organizationId.toString(),
    createdBy: job.createdBy.toString(),
    pipeline: job.pipeline ?? null,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

function toCandidateJobSummary(job: IJob) {
  return {
    id: job.id,
    title: job.title,
    status: job.status,
    organizationId: job.organizationId.toString(),
  };
}

export const applicationsRouter = Router();

applicationsRouter.get(
  "/me",
  requireAuth,
  requireRoles("candidate"),
  asyncHandler(async (req, res) => {
    const runs = await ApplicationRun.find({ candidateId: req.auth!.userId })
      .sort({ createdAt: -1 })
      .exec();
    const jobIds = [...new Set(runs.map((r) => r.jobId.toString()))];
    const jobs = await Job.find({
      _id: { $in: jobIds },
    }).exec();
    const jobById = new Map(jobs.map((j) => [j.id, j]));

    ok(res, 200, {
      applications: runs.map((r) =>
        toPublicApplicationWithJob(r, jobById.get(r.jobId.toString()) ?? null),
      ),
    });
  }),
);

applicationsRouter.get(
  "/analytics/org",
  requireAuth,
  requireRoles("recruiter", "admin"),
  requireRecruiterOrganization,
  asyncHandler(async (req, res) => {
    const data = await getRecruiterOrgAnalytics(req.orgId!);
    ok(res, 200, data);
  }),
);

applicationsRouter.get(
  "/analytics/me",
  requireAuth,
  requireRoles("candidate"),
  asyncHandler(async (req, res) => {
    const data = await getCandidateAnalytics(req.auth!.userId);
    ok(res, 200, data);
  }),
);

applicationsRouter.get(
  "/",
  requireAuth,
  requireRoles("recruiter", "admin"),
  requireRecruiterOrganization,
  asyncHandler(async (req, res) => {
    const orgId = req.orgId!;
    const page = parsePositiveInt(req.query.page, 1);
    const limit = parsePositiveInt(
      req.query.limit,
      ORG_APPLICATIONS_DEFAULT_LIMIT,
      ORG_APPLICATIONS_MAX_LIMIT,
    );
    const skip = (page - 1) * limit;

    const jobIdRaw =
      typeof req.query.jobId === "string" ? req.query.jobId.trim() : "";
    if (jobIdRaw && !mongoose.isValidObjectId(jobIdRaw)) {
      fail(res, 400, ErrorCodes.VALIDATION_ERROR, "Invalid jobId");
      return;
    }

    if (jobIdRaw) {
      const job = await Job.findOne({
        _id: jobIdRaw,
        organizationId: orgId,
      }).exec();
      if (!job) {
        fail(res, 404, ErrorCodes.NOT_FOUND, "Job not found");
        return;
      }
    }

    const statusFilter = parseStatusFilter(req.query.status);
    if (statusFilter !== null && statusFilter.length === 0) {
      fail(
        res,
        400,
        ErrorCodes.VALIDATION_ERROR,
        `Invalid status. Use one or more of: ${APPLICATION_STATUSES.join(", ")}`,
      );
      return;
    }

    const filter: Record<string, unknown> = { organizationId: orgId };
    if (jobIdRaw) filter.jobId = jobIdRaw;
    if (statusFilter?.length === 1) {
      filter.status = statusFilter[0];
    } else if (statusFilter && statusFilter.length > 1) {
      filter.status = { $in: statusFilter };
    }

    const [total, runs] = await Promise.all([
      ApplicationRun.countDocuments(filter).exec(),
      ApplicationRun.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
    ]);

    const jobIds = [...new Set(runs.map((r) => r.jobId.toString()))];
    const candidateIds = [
      ...new Set(runs.map((r) => r.candidateId.toString())),
    ];

    const [jobs, candidates] = await Promise.all([
      Job.find({ _id: { $in: jobIds } }).exec(),
      User.find({ _id: { $in: candidateIds } }).exec(),
    ]);
    const jobById = new Map(jobs.map((j) => [j.id, j]));
    const userById = new Map(candidates.map((u) => [u.id, u]));

    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

    ok(res, 200, {
      applications: runs.map((r) => {
        const job = jobById.get(r.jobId.toString());
        const cand = userById.get(r.candidateId.toString());
        return toRecruiterApplicationListRow(
          r,
          cand?.email ?? "(unknown)",
          job?.title ?? "(unknown job)",
        );
      }),
      page,
      limit,
      total,
      totalPages,
    });
  }),
);

applicationsRouter.get(
  "/:applicationId/quiz",
  requireAuth,
  requireRoles("candidate"),
  asyncHandler(async (req, res) => {
    const applicationId = req.params.applicationId;
    if (!mongoose.isValidObjectId(applicationId)) {
      fail(res, 400, ErrorCodes.VALIDATION_ERROR, "Invalid application id");
      return;
    }

    const run = await ApplicationRun.findById(applicationId).exec();
    if (!run || run.candidateId.toString() !== req.auth!.userId) {
      fail(res, 404, ErrorCodes.NOT_FOUND, "Application not found");
      return;
    }
    if (run.status !== "NODE_2_PENDING") {
      fail(
        res,
        400,
        ErrorCodes.VALIDATION_ERROR,
        "Quiz is only available when the application is waiting on the quiz step",
      );
      return;
    }

    const job = await Job.findById(run.jobId).exec();
    const questions = job?.pipeline?.node2?.questions;
    if (!job || !questions?.length) {
      fail(
        res,
        400,
        ErrorCodes.VALIDATION_ERROR,
        "This job does not have a quiz configured",
      );
      return;
    }

    ok(res, 200, {
      quiz: { questions: toPublicQuizQuestions(questions) },
    });
  }),
);

applicationsRouter.post(
  "/:applicationId/quiz",
  requireAuth,
  requireRoles("candidate"),
  asyncHandler(async (req, res) => {
    const applicationId = req.params.applicationId;
    if (!mongoose.isValidObjectId(applicationId)) {
      fail(res, 400, ErrorCodes.VALIDATION_ERROR, "Invalid application id");
      return;
    }

    const run = await ApplicationRun.findById(applicationId).exec();
    if (!run || run.candidateId.toString() !== req.auth!.userId) {
      fail(res, 404, ErrorCodes.NOT_FOUND, "Application not found");
      return;
    }
    if (run.status !== "NODE_2_PENDING") {
      fail(
        res,
        400,
        ErrorCodes.VALIDATION_ERROR,
        "Quiz can only be submitted during the quiz step",
      );
      return;
    }

    const job = await Job.findById(run.jobId).exec();
    const questions = job?.pipeline?.node2?.questions;
    if (!job || !questions?.length) {
      fail(
        res,
        400,
        ErrorCodes.VALIDATION_ERROR,
        "This job does not have a quiz configured",
      );
      return;
    }

    const existing = await NodeResult.findOne({
      applicationRunId: run._id,
      nodeIndex: 2,
    }).exec();
    if (existing) {
      fail(res, 409, ErrorCodes.CONFLICT, "Quiz has already been submitted");
      return;
    }

    const graded = gradeQuizSubmission(questions, req.body?.answers);
    if (!graded.ok) {
      fail(res, 400, ErrorCodes.VALIDATION_ERROR, graded.message);
      return;
    }

    const correctN = Object.values(graded.perQuestion).filter(
      (p) => p.correct,
    ).length;

    const previousCurrentFitScore = run.currentFitScore;

    await NodeResult.create({
      applicationRunId: run._id,
      jobId: run.jobId,
      organizationId: run.organizationId,
      nodeIndex: 2,
      nodeType: "QUIZ_RESULT",
      score: graded.score,
      reasoning: `Automated grading (${correctN}/${questions.length} correct).`,
      payload: {
        perQuestion: graded.perQuestion,
        grader: "deterministic_v1",
      },
    });
    run.status = "NODE_3_PENDING";
    run.currentFitScore = graded.score;
    await run.save();

    try {
      await inngest.send({
        name: HIREVINE_EVENTS.quizSubmitted,
        data: { applicationRunId: run._id.toString() },
      });
    } catch (e) {
      await NodeResult.deleteOne({
        applicationRunId: run._id,
        nodeIndex: 2,
      }).exec();
      run.status = "NODE_2_PENDING";
      run.currentFitScore = previousCurrentFitScore;
      await run.save();
      console.error(
        "[inngest] send hirevine/application.quiz_submitted failed; rolled back quiz submission",
        e,
      );
      fail(
        res,
        503,
        ErrorCodes.SERVICE_UNAVAILABLE,
        "Could not queue the next pipeline step (final report). Check Inngest keys and connectivity, then try submitting the quiz again.",
      );
      return;
    }

    ok(res, 200, { application: toPublicApplicationRun(run) });
  }),
);

applicationsRouter.get(
  "/:applicationId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const applicationId = req.params.applicationId;
    if (!mongoose.isValidObjectId(applicationId)) {
      fail(res, 400, ErrorCodes.VALIDATION_ERROR, "Invalid application id");
      return;
    }

    const run = await ApplicationRun.findById(applicationId).exec();
    if (!run) {
      fail(res, 404, ErrorCodes.NOT_FOUND, "Application not found");
      return;
    }

    const job = await Job.findById(run.jobId).exec();
    if (!job) {
      fail(res, 404, ErrorCodes.NOT_FOUND, "Application not found");
      return;
    }

    const role = req.auth!.role;
    const userId = req.auth!.userId;

    if (role === "candidate") {
      if (run.candidateId.toString() !== userId) {
        fail(res, 404, ErrorCodes.NOT_FOUND, "Application not found");
        return;
      }
      ok(res, 200, {
        view: "candidate" as const,
        application: toPublicApplicationRun(run),
        job: toCandidateJobSummary(job),
        nextStep: candidateNextStep(run.status),
      });
      return;
    }

    if (role === "recruiter" || role === "admin") {
      const nodes = await NodeResult.find({ applicationRunId: run._id })
        .sort({ nodeIndex: 1 })
        .exec();

      const user = await User.findById(userId).exec();
      if (
        !user?.organizationId ||
        user.organizationId.toString() !== run.organizationId.toString()
      ) {
        fail(res, 404, ErrorCodes.NOT_FOUND, "Application not found");
        return;
      }

      const candidate = await User.findById(run.candidateId).exec();
      if (!candidate) {
        fail(res, 404, ErrorCodes.NOT_FOUND, "Application not found");
        return;
      }

      ok(res, 200, {
        view: "recruiter" as const,
        application: toPublicApplicationRun(run),
        candidate: {
          id: candidate.id,
          email: candidate.email,
        },
        job: toRecruiterJobDetail(job),
        nodes: nodes.map(toNodeDetail),
      });
      return;
    }

    fail(res, 403, ErrorCodes.FORBIDDEN, "Forbidden");
  }),
);
