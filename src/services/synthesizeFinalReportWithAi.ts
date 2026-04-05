import { generateObject } from "ai";
import {
  createChatModel,
  openRouterStructuredOutputProviderOptions,
} from "../ai/openrouter";
import {
  finalHiringReportSchema,
  type FinalHiringReport,
} from "../ai/hiringSchemas";

export async function synthesizeFinalReportWithAi(params: {
  jobTitle: string;
  jobDescription: string;
  reportInstructions: string;
  scoringWeightsHint?: string;
  resumeNodeSummary: string;
  quizNodeSummary: string;
}): Promise<FinalHiringReport> {
  const model = createChatModel();

  const weights = params.scoringWeightsHint
    ? `\nScoring / weighting hint from the employer:\n${params.scoringWeightsHint}\n`
    : "";

  const { object } = await generateObject({
    model,
    schema: finalHiringReportSchema,
    providerOptions: openRouterStructuredOutputProviderOptions,
    prompt: `You synthesize hiring decisions for a hiring manager.

Job title: ${params.jobTitle}

Job description (abbreviated context):
---
${params.jobDescription.slice(0, 12_000)}${params.jobDescription.length > 12_000 ? "\n... [truncated]" : ""}
---

Employer instructions for this report (follow closely):
---
${params.reportInstructions}
---
${weights}

Resume screening outcome (Node 1 — already evaluated):
---
${params.resumeNodeSummary}
---

Quiz outcome (Node 2 — already evaluated):
---
${params.quizNodeSummary}
---

Rules:
- Base the report only on the inputs above; do not invent interview answers or resume facts.
- overallScore should reflect both resume and quiz unless instructions say otherwise.
- Be direct and professional. Output only via the structured schema.`,
  });

  return object;
}
