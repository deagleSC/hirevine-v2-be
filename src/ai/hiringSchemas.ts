import { z } from "zod";

/** Structured output for resume screening (Node 1). */
export const resumeScreeningResultSchema = z.object({
  score: z
    .number()
    .min(0)
    .max(100)
    .describe("Overall resume fit score 0–100 for this role"),
  reasoning: z
    .string()
    .min(1)
    .max(12_000)
    .describe("Concise justification for hiring managers"),
  matchedMustHaveSkills: z
    .array(z.string())
    .default([])
    .describe("Which listed must-have skills are evidenced in the resume"),
  matchedNiceToHaveSkills: z
    .array(z.string())
    .default([])
    .describe("Which listed nice-to-have skills are evidenced"),
});

export type ResumeScreeningResult = z.infer<typeof resumeScreeningResultSchema>;

/** Structured output for final hiring summary (Node 3). */
export const finalHiringReportSchema = z.object({
  overallScore: z
    .number()
    .min(0)
    .max(100)
    .describe("Holistic score combining resume and quiz signals"),
  executiveSummary: z
    .string()
    .min(1)
    .max(16_000)
    .describe(
      "Short blurb for lists/previews; the full hiring summary lives in pipelineReportMarkdown and NodeResult.reasoning.",
    ),
  pipelineReportMarkdown: z
    .string()
    .min(1)
    .max(32_000)
    .describe(
      "Detailed, evidence-based pipeline report in Markdown (stage-by-stage: resume + quiz; risks; follow-ups; recommendation).",
    ),
  stageBreakdown: z
    .array(
      z.object({
        stage: z
          .enum(["node1_resume", "node2_quiz"])
          .describe("Which pipeline stage this section summarizes"),
        score: z
          .number()
          .min(0)
          .max(100)
          .optional()
          .describe("0–100 score for this stage if available/derivable"),
        whatWentWell: z
          .array(z.string().min(1))
          .default([])
          .describe("Strengths evidenced in this stage"),
        concerns: z
          .array(z.string().min(1))
          .default([])
          .describe("Risks/gaps evidenced in this stage"),
        evidence: z
          .array(z.string().min(1))
          .default([])
          .describe(
            "Direct evidence snippets or references grounded in the provided node summaries",
          ),
        followUpQuestions: z
          .array(z.string().min(1))
          .default([])
          .describe("Concrete interview questions to clarify concerns"),
      }),
    )
    .min(1)
    .max(2)
    .describe("Stage-by-stage breakdown for the pipeline"),
  keyStrengths: z
    .array(z.string().min(1))
    .min(1)
    .max(12)
    .describe("Bullet strengths"),
  risksOrGaps: z
    .array(z.string().min(1))
    .max(12)
    .default([])
    .describe("Risks, gaps, or follow-up areas"),
  hireRecommendation: z
    .enum(["strong_yes", "yes", "maybe", "no"])
    .describe("Overall recommendation"),
});

export type FinalHiringReport = z.infer<typeof finalHiringReportSchema>;
