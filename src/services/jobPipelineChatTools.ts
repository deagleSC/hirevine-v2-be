import { tool } from "ai";
import { z } from "zod";
import { parseJobPipeline } from "../jobs/jobPipelineSchema";
import type { JobPipeline } from "../jobs/jobPipelineSchema";
import { Job } from "../models/Job";
import { mergePipelinePatches } from "./jobPipelineMerge";

const applyPipelinePatchInputSchema = z.object({
  changeSummary: z
    .string()
    .max(600)
    .optional()
    .describe("Short note shown to the recruiter about what changed"),
  node1: z
    .record(z.string(), z.unknown())
    .optional()
    .describe(
      "Resume screening node: rubric (string), mustHaveSkills, niceToHaveSkills (string[]), passThreshold (0–100)",
    ),
  node2: z
    .record(z.string(), z.unknown())
    .optional()
    .describe(
      "Quiz node: include full `questions` array when adding or reordering questions (3–12). Each question: id, type multiple_choice|short_answer, prompt, answerKey; multiple_choice needs exactly 4 options.",
    ),
  node3: z
    .record(z.string(), z.unknown())
    .optional()
    .describe(
      "Hiring summary node: reportInstructions (string), optional scoringWeightsHint (string)",
    ),
});

export type ApplyPipelinePatchInput = z.infer<
  typeof applyPipelinePatchInputSchema
>;

export type ApplyPipelinePatchOutput =
  | { ok: true; message: string; pipeline: JobPipeline }
  | { ok: false; message: string; validationErrors?: string };

export function buildPipelineChatSystemPrompt(
  jobTitle: string,
  pipeline: JobPipeline,
): string {
  return `You are Hirevine's hiring pipeline assistant for the job: "${jobTitle}".

Rules:
- The pipeline always has exactly three stages: node1 (resume screening), node2 (quiz), node3 (hiring summary). Do not add or remove stages or nodes.
- Persist structured edits with the apply_pipeline_patch tool. You may call it more than once in a conversation.
- Every apply_pipeline_patch call MUST include at least one of node1, node2, or node3 with the actual fields to merge. Never call the tool with only changeSummary or empty arguments—that will fail. If the user asks to change the quiz only, you must still send node2 (e.g. full questions array).
- node2: keep between 3 and 12 questions. For multiple_choice, provide exactly 4 options; answerKey must equal one of the options. short_answer needs answerKey as a concise model answer.
- When adding or rewriting quiz questions, include the full updated "questions" array in the node2 patch (merge is replace for that array when provided). To set a specific count (e.g. exactly 5 questions), trim or rewrite from the current questions until the array length matches what the user asked for, then send that full array under node2.
- If the tool returns validation errors, fix the data and call apply_pipeline_patch again.
- In your visible text replies to the recruiter, use plain language only. Do not paste raw JSON, full pipeline objects, or large code blocks of pipeline data—the UI shows tool results separately. Summarize what you changed in one or two short sentences after a successful tool call.

Current pipeline JSON:
${JSON.stringify(pipeline, null, 2)}`;
}

export function createApplyPipelinePatchTool(params: {
  jobId: string;
  organizationId: string;
}) {
  return tool({
    description: `Apply patches to this job's hiring pipeline (fixed stages: node1 resume screen, node2 quiz, node3 hiring summary). You cannot add or remove stages. Each call must include at least one of node1, node2, or node3 with fields to merge—do not send an empty tool call. For quiz changes, send node2 with the full updated "questions" array. After merging, the server validates the full pipeline; fix errors and retry if validation fails.`,
    inputSchema: applyPipelinePatchInputSchema,
    execute: async (
      input: ApplyPipelinePatchInput,
    ): Promise<ApplyPipelinePatchOutput> => {
      const hasPatch =
        input.node1 !== undefined ||
        input.node2 !== undefined ||
        input.node3 !== undefined;
      if (!hasPatch) {
        return {
          ok: false,
          message:
            "The patch did not include any stage data. Retry with node1, node2, and/or node3 populated—for quiz-only requests you must send node2 with the full questions array (see system rules).",
        };
      }

      const job = await Job.findOne({
        _id: params.jobId,
        organizationId: params.organizationId,
      }).exec();
      if (!job) {
        return { ok: false, message: "Job not found." };
      }
      if (!job.pipeline) {
        return {
          ok: false,
          message: "This job has no pipeline yet. Generate a pipeline first.",
        };
      }

      const merged = mergePipelinePatches(job.pipeline, {
        node1: input.node1,
        node2: input.node2,
        node3: input.node3,
      });
      const parsed = parseJobPipeline(merged);
      if (!parsed.success) {
        const validationErrors = parsed.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ");
        return {
          ok: false,
          message: "Pipeline validation failed after merge.",
          validationErrors,
        };
      }

      job.pipeline = parsed.data;
      await job.save();

      const summary = input.changeSummary?.trim() || "Pipeline updated.";
      return {
        ok: true,
        message: summary,
        pipeline: parsed.data,
      };
    },
  });
}
