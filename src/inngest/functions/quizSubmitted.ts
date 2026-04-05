import { InngestFunction } from "inngest";
import { formatAiProviderError } from "../../ai/formatAiProviderError";
import { env } from "../../config/env";
import { ApplicationRun } from "../../models/ApplicationRun";
import { Job } from "../../models/Job";
import type { INodeResult } from "../../models/NodeResult";
import { NodeResult } from "../../models/NodeResult";
import { synthesizeFinalReportWithAi } from "../../services/synthesizeFinalReportWithAi";
import { inngest } from "../client";
import { HIREVINE_EVENTS } from "../events";

function hasOpenRouterKey(): boolean {
  return Boolean(env.openRouter.apiKey?.trim());
}

function summarizeNodeForReport(
  node: INodeResult | null,
  label: string,
): string {
  if (!node) {
    return `${label}: (missing)`;
  }
  const payload =
    node.payload && typeof node.payload === "object"
      ? JSON.stringify(node.payload).slice(0, 8000)
      : String(node.payload ?? "");
  return `${label}:
score: ${node.score ?? "n/a"}
reasoning: ${(node.reasoning ?? "").slice(0, 4000)}
payload (may be truncated): ${payload}`;
}

/**
 * Node 3: hiring-manager report. Uses OpenRouter when `OPENROUTER_API_KEY` is set;
 * otherwise a short stub summary is stored.
 */
export const quizSubmittedNode3: InngestFunction.Like = inngest.createFunction(
  {
    id: "quiz-submitted-node3-stub",
    name: "Quiz submitted — Node 3 report",
    triggers: [{ event: HIREVINE_EVENTS.quizSubmitted }],
  },
  async ({ event, step }) => {
    const applicationRunId = event.data.applicationRunId as string | undefined;
    if (!applicationRunId) {
      throw new Error(
        "hirevine/application.quiz_submitted missing applicationRunId",
      );
    }

    const result = await step.run("node3-final-report", async () => {
      const run = await ApplicationRun.findById(applicationRunId).exec();
      if (!run) {
        return { ok: false as const, reason: "application_run_not_found" };
      }
      if (run.status !== "NODE_3_PENDING") {
        return { ok: false as const, reason: "status_not_node_3_pending" };
      }

      const dup = await NodeResult.findOne({
        applicationRunId: run._id,
        nodeIndex: 3,
      }).exec();
      if (dup) {
        return { ok: false as const, reason: "node3_already_exists" };
      }

      const job = await Job.findById(run.jobId).exec();
      if (!job?.pipeline?.node3) {
        throw new Error(
          "quizSubmitted: job or pipeline.node3 missing (invalid state for NODE_3_PENDING)",
        );
      }

      const node1 = await NodeResult.findOne({
        applicationRunId: run._id,
        nodeIndex: 1,
      }).exec();
      const node2 = await NodeResult.findOne({
        applicationRunId: run._id,
        nodeIndex: 2,
      }).exec();

      const useAi = hasOpenRouterKey();

      if (!useAi) {
        await NodeResult.create({
          applicationRunId: run._id,
          jobId: run.jobId,
          organizationId: run.organizationId,
          nodeIndex: 3,
          nodeType: "FINAL_REPORT",
          score: run.currentFitScore ?? undefined,
          reasoning:
            "Stub report — set OPENROUTER_API_KEY to enable AI hiring summary.",
          payload: { stub: true, openRouterDisabled: true },
        });
        run.status = "COMPLETED";
        await run.save();
        return { ok: true as const, mode: "stub" as const };
      }

      let report: Awaited<
        ReturnType<typeof synthesizeFinalReportWithAi>
      > | null = null;
      let providerError: string | undefined;
      try {
        report = await synthesizeFinalReportWithAi({
          jobTitle: job.title,
          jobDescription: job.description,
          reportInstructions: job.pipeline.node3.reportInstructions,
          scoringWeightsHint: job.pipeline.node3.scoringWeightsHint,
          resumeNodeSummary: summarizeNodeForReport(node1, "Resume / Node 1"),
          quizNodeSummary: summarizeNodeForReport(node2, "Quiz / Node 2"),
        });
      } catch (err) {
        providerError = formatAiProviderError(err);
        console.error(
          "[hirevine node3] synthesizeFinalReportWithAi failed:",
          providerError,
          err,
        );
      }

      if (report) {
        await NodeResult.create({
          applicationRunId: run._id,
          jobId: run.jobId,
          organizationId: run.organizationId,
          nodeIndex: 3,
          nodeType: "FINAL_REPORT",
          score: report.overallScore,
          reasoning: report.executiveSummary,
          payload: {
            ai: true,
            executiveSummary: report.executiveSummary,
            keyStrengths: report.keyStrengths,
            risksOrGaps: report.risksOrGaps,
            hireRecommendation: report.hireRecommendation,
          },
        });
        run.currentFitScore = report.overallScore;
      } else {
        const fallbackScore = run.currentFitScore ?? undefined;
        await NodeResult.create({
          applicationRunId: run._id,
          jobId: run.jobId,
          organizationId: run.organizationId,
          nodeIndex: 3,
          nodeType: "FINAL_REPORT",
          score: fallbackScore,
          reasoning: `Final report provider call failed (${providerError ?? "unknown error"}). Application marked complete for operations; fix OpenRouter/model and inspect payload.aiFailed.`,
          payload: {
            aiFailed: true,
            providerError: providerError ?? "unknown",
          },
        });
      }

      run.status = "COMPLETED";
      await run.save();

      return {
        ok: true as const,
        mode: report ? ("ai" as const) : ("ai_fallback" as const),
      };
    });

    return result;
  },
);
