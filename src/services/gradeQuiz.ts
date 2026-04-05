import type { QuizQuestion } from "../jobs/jobPipelineSchema";

export type QuizAnswerInput = { questionId: string; answer: string };

export type QuizGradeOk = {
  ok: true;
  score: number;
  perQuestion: Record<string, { correct: boolean; points: number }>;
};

export type QuizGradeErr = {
  ok: false;
  message: string;
};

export function gradeQuizSubmission(
  questions: QuizQuestion[],
  answers: unknown,
): QuizGradeOk | QuizGradeErr {
  if (!Array.isArray(answers)) {
    return { ok: false, message: "answers must be an array" };
  }

  const answerById = new Map<string, string>();
  for (const row of answers) {
    if (!row || typeof row !== "object") {
      return { ok: false, message: "Each answer must be an object" };
    }
    const qid =
      typeof (row as { questionId?: string }).questionId === "string"
        ? (row as { questionId: string }).questionId.trim()
        : "";
    if (!qid) {
      return { ok: false, message: "Each answer needs a non-empty questionId" };
    }
    if (answerById.has(qid)) {
      return { ok: false, message: `Duplicate answer for questionId: ${qid}` };
    }
    const ans =
      typeof (row as { answer?: string }).answer === "string"
        ? (row as { answer: string }).answer
        : "";
    answerById.set(qid, ans);
  }

  if (answerById.size !== questions.length) {
    return {
      ok: false,
      message: `Expected exactly ${questions.length} answers, got ${answerById.size}`,
    };
  }

  for (const q of questions) {
    if (!answerById.has(q.id)) {
      return { ok: false, message: `Missing answer for question: ${q.id}` };
    }
  }

  const perQuestion: Record<string, { correct: boolean; points: number }> = {};
  let total = 0;
  for (const q of questions) {
    const raw = answerById.get(q.id)!;
    const { correct, points } = scoreOneQuestion(q, raw);
    perQuestion[q.id] = { correct, points };
    total += points;
  }

  const score = Math.round(total / questions.length);
  return { ok: true, score, perQuestion };
}

function scoreOneQuestion(
  q: QuizQuestion,
  raw: string,
): { correct: boolean; points: number } {
  const a = raw.trim();
  if (q.type === "multiple_choice") {
    const ok = a === q.answerKey.trim();
    return { correct: ok, points: ok ? 100 : 0 };
  }
  const ok = a.toLowerCase() === q.answerKey.trim().toLowerCase();
  return { correct: ok, points: ok ? 100 : 0 };
}
