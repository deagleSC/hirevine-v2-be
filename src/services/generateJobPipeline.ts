import { generateObject } from "ai";
import {
  createChatModel,
  openRouterStructuredOutputProviderOptions,
} from "../ai/openrouter";
import { jobPipelineSchema, type JobPipeline } from "../jobs/jobPipelineSchema";

export async function generateJobPipelineFromDescription(params: {
  jobTitle: string;
  description: string;
}): Promise<JobPipeline> {
  const model = createChatModel();
  const { object } = await generateObject({
    model,
    schema: jobPipelineSchema,
    providerOptions: openRouterStructuredOutputProviderOptions,
    prompt: `You design a fixed 3-stage hiring evaluation pipeline for the job below.

Stage 1 (node1): Resume screening — rubric explaining how to score resume fit against the role; mustHaveSkills and niceToHaveSkills as string arrays derived from the JD; optional passThreshold (0–100) for advancing past resume screen.
Stage 2 (node2): Exactly 5 quiz questions relevant to the role. Use a mix of multiple_choice (exactly 4 options per question, answerKey is the correct option text) and short_answer (answerKey is a concise model answer for grading).
Each question needs a unique id (short slug, e.g. q1_python_scope).
Stage 3 (node3): Final report — reportInstructions for how to synthesize resume + quiz results into an executive summary for hiring managers; optional scoringWeightsHint (e.g. how much quiz vs resume matters).

Job title: ${params.jobTitle}

Job description:
---
${params.description}
---

Rules: Set version to 1. Be specific to this role. Questions must be fair and grounded in the JD.`,
  });
  return object;
}
