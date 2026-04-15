import { InngestFunction } from "inngest";
import { formatAiProviderError } from "../../ai/formatAiProviderError";
import { env } from "../../config/env";
import { ApplicationRun } from "../../models/ApplicationRun";
import { Job } from "../../models/Job";
import { NodeResult } from "../../models/NodeResult";
import { fetchResumeTextFromUrl } from "../../services/fetchResumeText";
import { screenResumeWithAi } from "../../services/screenResumeWithAi";
import { inngest } from "../client";
import { HIREVINE_EVENTS } from "../events";

function hasOpenRouterKey(): boolean {
  return Boolean(env.openRouter.apiKey?.trim());
}

/**
 * Node 1: resume screening. Uses OpenRouter when `OPENROUTER_API_KEY` is set;
 * otherwise falls back to the legacy stub so local dev without a key still works.
 * Honors `pipeline.node1.passThreshold` → `REJECTED` when score is below threshold.
 */
export const applicationCreatedNode1: InngestFunction.Like =
  inngest.createFunction(
    {
      id: "application-created-node1-stub",
      name: "Application created — Node 1 resume",
      triggers: [{ event: HIREVINE_EVENTS.applicationCreated }],
    },
    async ({ event, step }) => {
      const applicationRunId = event.data.applicationRunId as
        | string
        | undefined;
      if (!applicationRunId) {
        throw new Error(
          "hirevine/application.created missing applicationRunId",
        );
      }

      const result = await step.run("node1-resume", async () => {
        const run = await ApplicationRun.findById(applicationRunId).exec();
        if (!run) {
          return { ok: false as const, reason: "application_run_not_found" };
        }
        if (run.status !== "NODE_1_PENDING") {
          return { ok: false as const, reason: "status_not_node_1_pending" };
        }

        const dup = await NodeResult.findOne({
          applicationRunId: run._id,
          nodeIndex: 1,
        }).exec();
        if (dup) {
          return { ok: false as const, reason: "node1_already_exists" };
        }

        const job = await Job.findById(run.jobId).exec();
        if (!job) {
          throw new Error(
            "applicationCreated: job not found for application run",
          );
        }

        const hasPipeline = Boolean(job.pipeline);
        const useAi = hasOpenRouterKey();

        if (!useAi) {
          await NodeResult.create({
            applicationRunId: run._id,
            jobId: run.jobId,
            organizationId: run.organizationId,
            nodeIndex: 1,
            nodeType: "RESUME_ANALYSIS",
            score: 100,
            reasoning:
              "Stub pass — set OPENROUTER_API_KEY to enable AI resume screening.",
            payload: { stub: true, openRouterDisabled: true },
          });
          run.status = hasPipeline ? "NODE_2_PENDING" : "COMPLETED";
          run.currentFitScore = 100;
          await run.save();
          return { ok: true as const, mode: "stub" as const };
        }

        const fetchResult = await fetchResumeTextFromUrl(run.resumeUrl);
        const resumeText = fetchResult.ok ? fetchResult.text : "";
        const resumeContextNote = !fetchResult.ok
          ? fetchResult.error.includes("no selectable text")
            ? fetchResult.error
            : `Could not load resume from URL: ${fetchResult.error}`
          : fetchResult.truncated
            ? "Resume text was truncated before model input."
            : undefined;

        const fetchPayload = {
          resumeFetched: fetchResult.ok,
          resumeContentType: fetchResult.ok ? fetchResult.contentType : null,
          resumeTruncated: fetchResult.ok ? fetchResult.truncated : false,
          fetchError: fetchResult.ok ? null : fetchResult.error,
        };

        let screening: Awaited<ReturnType<typeof screenResumeWithAi>> | null =
          null;
        let providerError: string | undefined;
        try {
          screening = await screenResumeWithAi({
            jobTitle: job.title,
            jobDescription: job.description,
            node1: job.pipeline?.node1 ?? null,
            resumeText,
            resumeContextNote,
          });
        } catch (err) {
          providerError = formatAiProviderError(err);
          console.error(
            "[hirevine node1] screenResumeWithAi failed:",
            providerError,
            err,
          );
        }

        const threshold = job.pipeline?.node1?.passThreshold;
        const aiOk = screening !== null;
        const score = screening?.score ?? 100;
        const reasoning = screening?.reasoning
          ? screening.reasoning
          : `Resume screening provider call failed (${providerError ?? "unknown error"}). The pipeline was advanced with a neutral score so the candidate is not stuck; fix OpenRouter/model settings and inspect payload.aiFailed.`;

        const belowThreshold =
          aiOk &&
          hasPipeline &&
          typeof threshold === "number" &&
          score < threshold;

        await NodeResult.create({
          applicationRunId: run._id,
          jobId: run.jobId,
          organizationId: run.organizationId,
          nodeIndex: 1,
          nodeType: "RESUME_ANALYSIS",
          score,
          reasoning,
          payload: aiOk
            ? {
                ai: true,
                matchedMustHaveSkills: screening!.matchedMustHaveSkills,
                matchedNiceToHaveSkills: screening!.matchedNiceToHaveSkills,
                ...fetchPayload,
              }
            : {
                aiFailed: true,
                providerError: providerError ?? "unknown",
                ...fetchPayload,
              },
        });

        run.currentFitScore = score;
        if (belowThreshold) {
          run.status = "REJECTED";
        } else if (hasPipeline) {
          run.status = "NODE_2_PENDING";
        } else {
          run.status = "COMPLETED";
        }
        await run.save();

        return {
          ok: true as const,
          mode: aiOk ? ("ai" as const) : ("ai_fallback" as const),
        };
      });

      return result;
    },
  );
