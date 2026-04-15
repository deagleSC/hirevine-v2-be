import mongoose, { type Types } from "mongoose";
import type { ApplicationStatus } from "../models/ApplicationRun";
import { ApplicationRun } from "../models/ApplicationRun";
import type { JobStatus } from "../models/Job";
import { Job } from "../models/Job";

const ALL_APP_STATUSES: ApplicationStatus[] = [
  "NODE_1_PENDING",
  "NODE_2_PENDING",
  "NODE_3_PENDING",
  "COMPLETED",
  "REJECTED",
];

function utcDayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Inclusive UTC days from `start` through `end` (date parts only). */
function fillDailyCounts(
  start: Date,
  end: Date,
  byDay: Map<string, number>,
): { date: string; count: number }[] {
  const out: { date: string; count: number }[] = [];
  const cursor = new Date(start);
  cursor.setUTCHours(0, 0, 0, 0);
  const endDay = new Date(end);
  endDay.setUTCHours(0, 0, 0, 0);
  while (cursor.getTime() <= endDay.getTime()) {
    const key = utcDayKey(cursor);
    out.push({ date: key, count: byDay.get(key) ?? 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

function orgObjectId(orgId: string): Types.ObjectId {
  return new mongoose.Types.ObjectId(orgId);
}

export type RecruiterAnalyticsResponse = {
  applicationsByStatus: { status: ApplicationStatus; count: number }[];
  applicationsByDay: { date: string; count: number }[];
  jobsByStatus: { status: JobStatus; count: number }[];
  topJobsByApplications: { jobId: string; title: string; count: number }[];
  totals: {
    applications: number;
    newApplicationsLast7Days: number;
    activeJobs: number;
  };
};

export async function getRecruiterOrgAnalytics(
  organizationId: string,
): Promise<RecruiterAnalyticsResponse> {
  const oid = orgObjectId(organizationId);

  const now = new Date();
  const start30 = new Date(now);
  start30.setUTCDate(start30.getUTCDate() - 29);
  start30.setUTCHours(0, 0, 0, 0);

  const start7 = new Date(now);
  start7.setUTCDate(start7.getUTCDate() - 7);

  const [
    byStatusAgg,
    byDayAgg,
    jobsByStatusAgg,
    topJobsAgg,
    totalApplications,
    newLast7,
    activeJobs,
  ] = await Promise.all([
    ApplicationRun.aggregate<{ _id: ApplicationStatus; count: number }>([
      { $match: { organizationId: oid } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]).exec(),
    ApplicationRun.aggregate<{ _id: string; count: number }>([
      {
        $match: {
          organizationId: oid,
          createdAt: { $gte: start30 },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$createdAt",
              timezone: "UTC",
            },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]).exec(),
    Job.aggregate<{ _id: JobStatus; count: number }>([
      { $match: { organizationId: oid } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]).exec(),
    ApplicationRun.aggregate<{ _id: Types.ObjectId; count: number }>([
      { $match: { organizationId: oid } },
      { $group: { _id: "$jobId", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 8 },
    ]).exec(),
    ApplicationRun.countDocuments({ organizationId: oid }).exec(),
    ApplicationRun.countDocuments({
      organizationId: oid,
      createdAt: { $gte: start7 },
    }).exec(),
    Job.countDocuments({ organizationId: oid, status: "active" }).exec(),
  ]);

  const statusCountMap = new Map<ApplicationStatus, number>();
  for (const row of byStatusAgg) {
    statusCountMap.set(row._id, row.count);
  }
  const applicationsByStatus = ALL_APP_STATUSES.map((status) => ({
    status,
    count: statusCountMap.get(status) ?? 0,
  }));

  const dayMap = new Map<string, number>();
  for (const row of byDayAgg) {
    dayMap.set(row._id, row.count);
  }
  const applicationsByDay = fillDailyCounts(start30, now, dayMap);

  const jobsByStatus = jobsByStatusAgg.map((row) => ({
    status: row._id,
    count: row.count,
  }));

  const jobIds = topJobsAgg.map((r) => r._id);
  const jobs =
    jobIds.length > 0
      ? await Job.find({ _id: { $in: jobIds } })
          .select({ title: 1 })
          .lean()
          .exec()
      : [];
  const titleById = new Map(
    jobs.map((j) => [String(j._id), j.title as string]),
  );

  const topJobsByApplications = topJobsAgg.map((row) => {
    const id = row._id.toString();
    return {
      jobId: id,
      title: titleById.get(id) ?? "Job",
      count: row.count,
    };
  });

  return {
    applicationsByStatus,
    applicationsByDay,
    jobsByStatus,
    topJobsByApplications,
    totals: {
      applications: totalApplications,
      newApplicationsLast7Days: newLast7,
      activeJobs,
    },
  };
}

export type CandidateAnalyticsResponse = {
  applicationsByStatus: { status: ApplicationStatus; count: number }[];
  applicationsByDay: { date: string; count: number }[];
  totals: { applications: number };
};

export async function getCandidateAnalytics(
  candidateId: string,
): Promise<CandidateAnalyticsResponse> {
  const cid = new mongoose.Types.ObjectId(candidateId);

  const now = new Date();
  const start30 = new Date(now);
  start30.setUTCDate(start30.getUTCDate() - 29);
  start30.setUTCHours(0, 0, 0, 0);

  const [byStatusAgg, byDayAgg, total] = await Promise.all([
    ApplicationRun.aggregate<{ _id: ApplicationStatus; count: number }>([
      { $match: { candidateId: cid } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]).exec(),
    ApplicationRun.aggregate<{ _id: string; count: number }>([
      {
        $match: {
          candidateId: cid,
          createdAt: { $gte: start30 },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$createdAt",
              timezone: "UTC",
            },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]).exec(),
    ApplicationRun.countDocuments({ candidateId: cid }).exec(),
  ]);

  const statusCountMap = new Map<ApplicationStatus, number>();
  for (const row of byStatusAgg) {
    statusCountMap.set(row._id, row.count);
  }
  const applicationsByStatus = ALL_APP_STATUSES.map((status) => ({
    status,
    count: statusCountMap.get(status) ?? 0,
  }));

  const dayMap = new Map<string, number>();
  for (const row of byDayAgg) {
    dayMap.set(row._id, row.count);
  }
  const applicationsByDay = fillDailyCounts(start30, now, dayMap);

  return {
    applicationsByStatus,
    applicationsByDay,
    totals: { applications: total },
  };
}
