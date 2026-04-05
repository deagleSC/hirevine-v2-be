/** Inngest event names (stable contract for producers and functions). */
export const HIREVINE_EVENTS = {
  applicationCreated: "hirevine/application.created",
  quizSubmitted: "hirevine/application.quiz_submitted",
} as const;

export type ApplicationCreatedData = {
  applicationRunId: string;
};

export type QuizSubmittedData = {
  applicationRunId: string;
};
