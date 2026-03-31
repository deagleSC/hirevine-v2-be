import { z } from "zod";

/** Fixed linear pipeline: resume match → quiz → final report (Hirevine MVP). */
export const quizQuestionSchema = z.discriminatedUnion("type", [
  z.object({
    id: z.string().min(1),
    type: z.literal("multiple_choice"),
    prompt: z.string().min(1),
    options: z.array(z.string().min(1)).min(2).max(12),
    answerKey: z.string().min(1),
  }),
  z.object({
    id: z.string().min(1),
    type: z.literal("short_answer"),
    prompt: z.string().min(1),
    answerKey: z.string().min(1),
  }),
]);

export const jobPipelineSchema = z.object({
  version: z.literal(1),
  node1: z.object({
    rubric: z.string().min(1),
    mustHaveSkills: z.array(z.string()).default([]),
    niceToHaveSkills: z.array(z.string()).default([]),
    passThreshold: z.number().min(0).max(100).optional(),
  }),
  node2: z.object({
    questions: z.array(quizQuestionSchema).min(3).max(12),
  }),
  node3: z.object({
    reportInstructions: z.string().min(1),
    scoringWeightsHint: z.string().optional(),
  }),
});

export type JobPipeline = z.infer<typeof jobPipelineSchema>;
export type QuizQuestion = z.infer<typeof quizQuestionSchema>;

export function parseJobPipeline(
  input: unknown,
):
  | { success: true; data: JobPipeline }
  | { success: false; error: z.ZodError } {
  const r = jobPipelineSchema.safeParse(input);
  if (!r.success) return { success: false, error: r.error };
  return { success: true, data: r.data };
}
