import { Router } from "express";
import type { IApplicationRun } from "../models/ApplicationRun";
import { ApplicationRun } from "../models/ApplicationRun";
import type { IJob } from "../models/Job";
import { Job } from "../models/Job";
import { ok } from "../http/response";
import { requireAuth } from "../middleware/auth";
import { requireRoles } from "../middleware/roles";
import { asyncHandler } from "../util/asyncHandler";

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
