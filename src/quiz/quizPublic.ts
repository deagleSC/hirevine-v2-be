import type { QuizQuestion } from "../jobs/jobPipelineSchema";

export type PublicQuizQuestion =
  | Omit<Extract<QuizQuestion, { type: "multiple_choice" }>, "answerKey">
  | Omit<Extract<QuizQuestion, { type: "short_answer" }>, "answerKey">;

export function toPublicQuizQuestions(
  questions: QuizQuestion[],
): PublicQuizQuestion[] {
  return questions.map((q) => {
    if (q.type === "multiple_choice") {
      const { answerKey: _a, ...rest } = q;
      return rest;
    }
    const { answerKey: _a, ...rest } = q;
    return rest;
  });
}
