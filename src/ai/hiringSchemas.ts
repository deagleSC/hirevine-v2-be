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
    .describe("Short executive summary for the hiring manager"),
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
