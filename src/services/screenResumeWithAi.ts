import { generateObject } from "ai";
import {
  createChatModel,
  openRouterStructuredOutputProviderOptions,
} from "../ai/openrouter";
import {
  resumeScreeningResultSchema,
  type ResumeScreeningResult,
} from "../ai/hiringSchemas";
import type { JobPipeline } from "../jobs/jobPipelineSchema";

export async function screenResumeWithAi(params: {
  jobTitle: string;
  jobDescription: string;
  node1: JobPipeline["node1"] | null;
  resumeText: string;
  resumeContextNote?: string;
}): Promise<ResumeScreeningResult> {
  const model = createChatModel();

  const rubricBlock = params.node1
    ? `Pipeline rubric (follow closely):
${params.node1.rubric}

Must-have skills (list which are clearly evidenced in the resume; use exact strings from this list when applicable):
${params.node1.mustHaveSkills.length ? params.node1.mustHaveSkills.map((s) => `- ${s}`).join("\n") : "- (none specified)"}

Nice-to-have skills:
${params.node1.niceToHaveSkills.length ? params.node1.niceToHaveSkills.map((s) => `- ${s}`).join("\n") : "- (none specified)"}`
    : `No structured pipeline rubric is configured. Infer fit from the job description and score how well the resume matches the role.`;

  const contextNote = params.resumeContextNote
    ? `\n\nContext about the resume source:\n${params.resumeContextNote}\n`
    : "";

  const resumeBody =
    params.resumeText.trim().length > 0
      ? params.resumeText.trim()
      : "[No resume text was available — score conservatively and explain why in reasoning.]";

  const { object } = await generateObject({
    model,
    schema: resumeScreeningResultSchema,
    providerOptions: openRouterStructuredOutputProviderOptions,
    prompt: `You are an expert technical recruiter. Evaluate the candidate resume against the role.

Job title: ${params.jobTitle}

Job description:
---
${params.jobDescription}
---

${rubricBlock}
${contextNote}

Resume text (may be truncated):
---
${resumeBody}
---

Rules:
- Output only via the structured schema.
- Score must reflect evidence in the resume text; do not invent experience.
- If the resume text is missing or unusable, keep the score low and say so in reasoning.
- If the context note explains a specific failure (e.g. URL load error vs PDF with no extractable text), align your reasoning with that cause. Do not say the file could not be "accessed" or "retrieved" when the context indicates the file was loaded but had no machine-readable text (e.g. scanned PDF).
- matchedMustHaveSkills / matchedNiceToHaveSkills should be subsets of the lists above when those lists are non-empty.`,
  });

  return object;
}
