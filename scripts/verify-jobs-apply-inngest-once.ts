/**
 * One-time E2E check: Jobs (with pipeline), apply, quiz, applications, Inngest stubs (DB poll).
 * Remove this file after you are done verifying.
 *
 * Prerequisites:
 * - API running (e.g. npm run dev on port 8000)
 * - For pipeline stub: `npm run inngest:dev` in another terminal
 *
 * Env:
 *   BASE_URL                 default http://127.0.0.1:8000
 *   RECRUITER_EMAIL          default recruiter2001@yopmail.com
 *   CANDIDATE_EMAIL          default candidate2001@yopmail.com
 *   RECRUITER_PASSWORD       required (can live in `.env`; script loads dotenv from cwd)
 *   CANDIDATE_PASSWORD       required
 *   INNGEST_POLL_MS          default 45000 (0 to skip DB/Inngest wait)
 *   INNGEST_POLL_INTERVAL_MS default 2000
 *   ALLOW_ANY_RESUME_URL     dev only: if API returns 503 for upload (no Blob token), use
 *                            https://example.com/... for apply instead.
 *   E2E_CLEAR_PASS_THRESHOLD default true: after generate-pipeline, removes node1.passThreshold
 *                            so low AI scores still reach the quiz. Set to "false" for real
 *                            rejections when score is below the AI-generated threshold.
 *   E2E_LOG_PIPELINE_OUTPUT  default true: print Node 1–3 reasoning + payload after polls.
 *
 * Real AI (resume screen + final report): set OPENROUTER_API_KEY on the API process and restart.
 * Without it, Inngest Node 1 / Node 3 use stubs (see payload.stub). Quiz (Node 2) is always
 * deterministic grading from POST /api/applications/:id/quiz.
 *
 * Flow: uploads a PDF resume via POST /api/resumes/upload (needs BLOB_READ_WRITE_TOKEN
 * on the API), then applies with the returned resumeUrl. Restart the API after changing .env.
 *
 * Default file: ../supratik_fe_experimental.pdf (repo sibling under products/). Override with
 * E2E_RESUME_PATH.
 */

import "dotenv/config";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { connectDb, disconnectDb } from "../src/db/connect";
import "../src/models";
import { ApplicationRun } from "../src/models/ApplicationRun";
import { NodeResult } from "../src/models/NodeResult";

const BASE_URL = (process.env.BASE_URL ?? "http://127.0.0.1:8000").replace(
  /\/+$/,
  "",
);
const RECRUITER_EMAIL =
  process.env.RECRUITER_EMAIL ?? "recruiter2001@yopmail.com";
const CANDIDATE_EMAIL =
  process.env.CANDIDATE_EMAIL ?? "candidate2001@yopmail.com";
const RECRUITER_PASSWORD = process.env.RECRUITER_PASSWORD ?? "";
const CANDIDATE_PASSWORD = process.env.CANDIDATE_PASSWORD ?? "";
const INNGEST_POLL_MS = Number(process.env.INNGEST_POLL_MS ?? "45000");
const INNGEST_POLL_INTERVAL_MS = Number(
  process.env.INNGEST_POLL_INTERVAL_MS ?? "2000",
);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_E2E_RESUME = path.resolve(
  __dirname,
  "..",
  "..",
  "supratik_fe_experimental.pdf",
);
const E2E_RESUME_PATH = process.env.E2E_RESUME_PATH ?? DEFAULT_E2E_RESUME;
const E2E_RESUME_FILENAME = path.basename(E2E_RESUME_PATH);

/** When false, keep AI-generated passThreshold (candidates can be REJECTED after real resume screening). */
const E2E_CLEAR_PASS_THRESHOLD =
  process.env.E2E_CLEAR_PASS_THRESHOLD !== "false";

const E2E_LOG_PIPELINE_OUTPUT =
  process.env.E2E_LOG_PIPELINE_OUTPUT !== "false";

/** Minimal valid pipeline so Node 1 advances to NODE_2_PENDING (quiz exists). */
const E2E_PIPELINE = {
  version: 1 as const,
  node1: {
    rubric: "E2E verification rubric",
    mustHaveSkills: [] as string[],
    niceToHaveSkills: [] as string[],
  },
  node2: {
    questions: [
      {
        id: "e2e-q1",
        type: "multiple_choice" as const,
        prompt: "Pick A",
        options: ["A", "B", "C", "D"],
        answerKey: "A",
      },
      {
        id: "e2e-q2",
        type: "multiple_choice" as const,
        prompt: "Pick B",
        options: ["A", "B", "C", "D"],
        answerKey: "B",
      },
      {
        id: "e2e-q3",
        type: "short_answer" as const,
        prompt: "Type hello",
        answerKey: "hello",
      },
    ],
  },
  node3: {
    reportInstructions: "E2E executive summary instructions.",
  },
};

type ApiSuccess<T> = { success: true; data: T };
type ApiErr = {
  success: false;
  error: { code: string; message: string };
};

type PipelineNodeShape = {
  nodeType?: string;
  score?: number;
  reasoning?: string;
  payload?: unknown;
};

function safeJson(obj: unknown, maxLen = 14000): string {
  try {
    const s = JSON.stringify(obj, null, 2);
    return s.length > maxLen ? `${s.slice(0, maxLen)}\n…[truncated]` : s;
  } catch {
    return String(obj);
  }
}

function logPipelineNode(label: string, node: PipelineNodeShape | null): void {
  if (!E2E_LOG_PIPELINE_OUTPUT) return;
  console.log(`\n========== ${label} ==========`);
  if (!node) {
    console.log("(no NodeResult yet)");
    return;
  }
  console.log("nodeType:", node.nodeType, "| score:", node.score);
  const r = node.reasoning ?? "";
  const maxR = 10000;
  console.log(
    "reasoning:\n",
    r.length > maxR ? `${r.slice(0, maxR)}\n…[truncated]` : r,
  );
  const p = node.payload as Record<string, unknown> | undefined;
  if (p?.stub === true) {
    console.log(
      "WARNING: stub mode — set OPENROUTER_API_KEY on the API and restart `npm run dev` for real AI.",
    );
  } else if (p?.ai === true) {
    console.log("mode: AI");
  } else if (p?.aiFailed === true) {
    console.log("mode: AI call failed (fallback)", p.providerError ?? "");
  }
  console.log("payload:\n", safeJson(node.payload));
}

function assertOk<T>(
  label: string,
  res: Response,
  body: unknown,
): asserts body is ApiSuccess<T> {
  if (
    !body ||
    typeof body !== "object" ||
    !("success" in body) ||
    (body as ApiSuccess<unknown>).success !== true
  ) {
    const err = body as ApiErr | null;
    console.error(
      `${label} failed`,
      res.status,
      err?.error ?? JSON.stringify(body),
    );
    process.exit(1);
  }
}

async function api<T>(
  method: string,
  path: string,
  token: string | undefined,
  jsonBody?: unknown,
): Promise<{ res: Response; data: ApiSuccess<T>["data"] }> {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (jsonBody !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: jsonBody !== undefined ? JSON.stringify(jsonBody) : undefined,
  });
  const body = (await res.json().catch(() => null)) as unknown;
  assertOk<T>(`${method} ${path}`, res, body);
  return { res, data: (body as ApiSuccess<T>).data };
}

async function apiAllowFail(
  method: string,
  path: string,
  token: string | undefined,
  jsonBody?: unknown,
): Promise<{ res: Response; ok: boolean; body: unknown }> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (jsonBody !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: jsonBody !== undefined ? JSON.stringify(jsonBody) : undefined,
  });
  const body = await res.json().catch(() => null);
  const ok =
    !!body &&
    typeof body === "object" &&
    "success" in body &&
    (body as { success: boolean }).success === true;
  return { res, ok, body };
}

/**
 * Uploads the E2E PDF (default: products/supratik_fe_experimental.pdf) to Vercel Blob via the API.
 * Returns null if the API responds 503 (Blob not configured).
 */
async function uploadTestResumeViaBlob(
  candidateToken: string,
): Promise<string | null> {
  if (!existsSync(E2E_RESUME_PATH)) {
    console.error(
      `E2E resume not found: ${E2E_RESUME_PATH}\nSet E2E_RESUME_PATH to a PDF on disk.`,
    );
    process.exit(1);
  }
  const bytes = readFileSync(E2E_RESUME_PATH);
  const fileBlob = new Blob([bytes], { type: "application/pdf" });
  const form = new FormData();
  form.append("file", fileBlob, E2E_RESUME_FILENAME);

  const res = await fetch(`${BASE_URL}/api/resumes/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${candidateToken}` },
    body: form,
  });
  const body = (await res.json().catch(() => null)) as unknown;

  if (res.ok) {
    assertOk<{ resumeUrl: string; pathname: string; contentType: string }>(
      "POST /api/resumes/upload",
      res,
      body,
    );
    return (body as ApiSuccess<{ resumeUrl: string }>).data.resumeUrl;
  }

  if (res.status === 503) {
    const err = body as ApiErr | null;
    console.warn(
      "POST /api/resumes/upload:",
      res.status,
      err?.error?.message ?? "Blob not configured on API",
    );
    return null;
  }

  assertOk("POST /api/resumes/upload", res, body);
  return null;
}

async function login(
  email: string,
  password: string,
  who: "recruiter" | "candidate",
): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = (await res.json().catch(() => null)) as unknown;
  assertOk<{ accessToken: string }>(
    `POST /api/auth/login (${who}, ${email})`,
    res,
    body,
  );
  return (body as ApiSuccess<{ accessToken: string }>).data.accessToken;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main(): Promise<void> {
  if (!RECRUITER_PASSWORD || !CANDIDATE_PASSWORD) {
    console.error(
      "Set RECRUITER_PASSWORD and CANDIDATE_PASSWORD in the environment (or .env).",
    );
    process.exit(1);
  }

  console.log("BASE_URL", BASE_URL);
  console.log(
    "E2E: OPENROUTER_API_KEY on the API enables real resume + final-report AI; otherwise Node 1/3 use stubs.",
  );
  console.log(
    `E2E_CLEAR_PASS_THRESHOLD=${E2E_CLEAR_PASS_THRESHOLD} (set to false for real threshold rejections)`,
  );

  const inngestProbe = await fetch(`${BASE_URL}/api/inngest`, {
    method: "GET",
    headers: { Accept: "application/json,*/*" },
  });
  console.log(
    "GET /api/inngest",
    inngestProbe.status,
    (await inngestProbe.text()).slice(0, 120).replace(/\s+/g, " "),
  );

  const recruiterToken = await login(
    RECRUITER_EMAIL,
    RECRUITER_PASSWORD,
    "recruiter",
  );
  console.log("Recruiter logged in");

  let orgOk = false;
  {
    const probe = await apiAllowFail(
      "GET",
      "/api/organizations/me",
      recruiterToken,
    );
    orgOk = probe.ok && probe.res.status === 200;
    if (!orgOk) {
      const slug = `e2e-${Date.now()}`;
      await api<{ organization: { id: string }; user: unknown }>(
        "POST",
        "/api/organizations",
        recruiterToken,
        { name: `E2E org ${slug}`, slug },
      );
      console.log("Created organization", slug);
    } else {
      console.log("Organization already on recruiter account");
    }
  }

  const stamp = Date.now();
  const title = `E2E verify job ${stamp}`;
  const description =
    "End-to-end verification job description. At least forty characters for optional pipeline generation.";

  const { data: created } = await api<{ job: { id: string; status: string } }>(
    "POST",
    "/api/jobs",
    recruiterToken,
    { title, description, status: "draft", pipeline: E2E_PIPELINE },
  );
  const jobId = created.job.id;
  console.log("Created job", jobId, created.job.status);

  const gen = await apiAllowFail(
    "POST",
    `/api/jobs/${jobId}/generate-pipeline`,
    recruiterToken,
  );
  console.log(
    "generate-pipeline",
    gen.res.status,
    gen.ok ? "ok" : (gen.body as ApiErr)?.error?.code ?? "failed",
  );

  if (gen.ok && E2E_CLEAR_PASS_THRESHOLD) {
    const genBody = gen.body as ApiSuccess<{
      job: {
        pipeline?: {
          version: 1;
          node1: { passThreshold?: number } & Record<string, unknown>;
          node2: unknown;
          node3: unknown;
        };
      };
    }>;
    const pl = genBody.data?.job?.pipeline;
    if (pl?.node1 && pl.node1.passThreshold !== undefined) {
      const node1Pl = { ...pl.node1 };
      delete node1Pl.passThreshold;
      await api<{ job: { id: string } }>(
        "PATCH",
        `/api/jobs/${jobId}`,
        recruiterToken,
        {
          pipeline: {
            version: pl.version,
            node1: node1Pl,
            node2: pl.node2,
            node3: pl.node3,
          },
        },
      );
      console.log(
        "E2E: cleared node1.passThreshold after generate-pipeline (set E2E_CLEAR_PASS_THRESHOLD=false to keep real AI cutoff).",
      );
    }
  } else if (gen.ok && !E2E_CLEAR_PASS_THRESHOLD) {
    console.log(
      "E2E: keeping generate-pipeline node1.passThreshold (candidates below threshold can be REJECTED).",
    );
  }

  await api<{ job: { id: string; status: string } }>(
    "PATCH",
    `/api/jobs/${jobId}`,
    recruiterToken,
    { status: "active" },
  );
  console.log("Job set active");

  const { data: list } = await api<{ jobs: { id: string }[] }>(
    "GET",
    "/api/jobs",
    recruiterToken,
  );
  if (!list.jobs.some((j) => j.id === jobId)) {
    console.error("Expected job in recruiter GET /api/jobs");
    process.exit(1);
  }
  console.log("Job in recruiter list");

  await api<{ job: { id: string } }>("GET", `/api/jobs/${jobId}`, undefined);
  console.log("Public GET /api/jobs/:jobId (active) ok");

  console.log("Candidate login as:", CANDIDATE_EMAIL);
  const candidateToken = await login(
    CANDIDATE_EMAIL,
    CANDIDATE_PASSWORD,
    "candidate",
  );
  console.log("Candidate logged in");

  let resumeUrl = await uploadTestResumeViaBlob(candidateToken);
  if (!resumeUrl) {
    if (process.env.ALLOW_ANY_RESUME_URL !== "true") {
      console.error(
        "Fix: set BLOB_READ_WRITE_TOKEN in the API’s .env and restart `npm run dev`,",
      );
      console.error(
        "or for dev-only testing set ALLOW_ANY_RESUME_URL=true to use a placeholder URL.",
      );
      process.exit(1);
    }
    resumeUrl = "https://example.com/resume-e2e.pdf";
    console.log("Using placeholder resumeUrl (ALLOW_ANY_RESUME_URL=true).");
  } else {
    console.log(
      "Resume uploaded:",
      resumeUrl.length > 72 ? `${resumeUrl.slice(0, 72)}…` : resumeUrl,
    );
  }

  const { data: applyRes } = await api<{
    application: { id: string; status: string; jobId: string };
  }>("POST", `/api/jobs/${jobId}/apply`, candidateToken, {
    resumeUrl,
  });
  const applicationId = applyRes.application.id;
  console.log("Applied", applicationId, applyRes.application.status);

  const { data: mine } = await api<{
    applications: { id: string; jobId: string; status: string }[];
  }>("GET", "/api/applications/me", candidateToken);
  const mineRow = mine.applications.find((a) => a.id === applicationId);
  if (!mineRow) {
    console.error("Application missing from GET /api/applications/me");
    process.exit(1);
  }
  console.log("GET /api/applications/me includes application", mineRow.status);

  const { data: recApps } = await api<{
    applications: { id: string; candidateId: string }[];
  }>("GET", `/api/jobs/${jobId}/applications`, recruiterToken);
  if (!recApps.applications.some((a) => a.id === applicationId)) {
    console.error("Application missing from recruiter job applications list");
    process.exit(1);
  }
  console.log("Recruiter sees application on job");

  if (INNGEST_POLL_MS <= 0) {
    console.log("INNGEST_POLL_MS<=0: skip DB / Inngest stub verification");
    console.log("All HTTP checks passed.");
    return;
  }

  let mongoOk = false;
  try {
    await connectDb();
    mongoOk = true;
  } catch (e) {
    console.warn(
      "Mongo connect failed; skip Inngest stub DB verification:",
      e instanceof Error ? e.message : e,
    );
  }

  if (!mongoOk) {
    console.log("All HTTP checks passed (Inngest DB poll skipped).");
    return;
  }

  try {
    const deadline = Date.now() + INNGEST_POLL_MS;
    let status = "";
    while (Date.now() < deadline) {
      const run = await ApplicationRun.findById(applicationId).exec();
      status = run?.status ?? "";
      if (status === "NODE_2_PENDING") break;
      await sleep(INNGEST_POLL_INTERVAL_MS);
    }

    const run = await ApplicationRun.findById(applicationId).exec();
    const node1 = await NodeResult.findOne({
      applicationRunId: applicationId,
      nodeIndex: 1,
    }).exec();

    console.log("ApplicationRun.status after poll:", run?.status);
    console.log(
      "NodeResult node 1:",
      node1
        ? { nodeType: node1.nodeType, score: node1.score }
        : "(none yet)",
    );

    if (run?.status !== "NODE_2_PENDING" || !node1) {
      if (run?.status === "REJECTED") {
        logPipelineNode("Node 1 (rejected — below passThreshold)", node1);
        console.error(
          "Application REJECTED at resume screen (score below node1.passThreshold). Expected when E2E_CLEAR_PASS_THRESHOLD=false and resume is a weak match. Use E2E_CLEAR_PASS_THRESHOLD=true to clear threshold for E2E, or improve job/resume fit.",
        );
      } else {
        console.error(
          "Inngest Node 1 did not reach NODE_2_PENDING in time. Run `npm run inngest:dev` while the API is up, then re-run this script.",
        );
      }
      process.exit(1);
    }
    logPipelineNode("Node 1 — resume screening (AI uses PDF text when OPENROUTER_API_KEY is set)", node1);
    console.log("Node 1 complete → NODE_2_PENDING (quiz).");

    const { data: recruiterJobs } = await api<{
      jobs: Array<{
        id: string;
        pipeline?: {
          node2?: {
            questions?: Array<{ id: string; answerKey: string }>;
          };
        };
      }>;
    }>("GET", "/api/jobs", recruiterToken);
    const jobForQuiz = recruiterJobs.jobs.find((j) => j.id === jobId);
    const pipelineQuestions = jobForQuiz?.pipeline?.node2?.questions;
    if (!pipelineQuestions?.length) {
      console.error(
        "E2E: job has no pipeline.node2.questions on GET /api/jobs (cannot build quiz answers).",
      );
      process.exit(1);
    }
    const quizAnswers = pipelineQuestions.map((q) => ({
      questionId: q.id,
      answer: q.answerKey,
    }));

    const { data: quizGet } = await api<{ quiz: { questions: { id: string }[] } }>(
      "GET",
      `/api/applications/${applicationId}/quiz`,
      candidateToken,
    );
    console.log(
      "GET /api/applications/:id/quiz ok",
      quizGet.quiz.questions.length,
      "questions (pipeline has",
      pipelineQuestions.length,
      ")",
    );
    if (quizGet.quiz.questions.length !== pipelineQuestions.length) {
      console.error("E2E: public quiz question count != pipeline question count");
      process.exit(1);
    }

    await api<{ application: { status: string } }>(
      "POST",
      `/api/applications/${applicationId}/quiz`,
      candidateToken,
      {
        answers: quizAnswers,
      },
    );
    console.log("POST quiz submitted (expect NODE_3_PENDING then Inngest Node 3)");

    const node2AfterQuiz = await NodeResult.findOne({
      applicationRunId: applicationId,
      nodeIndex: 2,
    }).exec();
    logPipelineNode(
      "Node 2 — quiz (deterministic grading, not LLM)",
      node2AfterQuiz,
    );

    const deadline3 = Date.now() + INNGEST_POLL_MS;
    while (Date.now() < deadline3) {
      const r = await ApplicationRun.findById(applicationId).exec();
      if (r?.status === "COMPLETED") break;
      await sleep(INNGEST_POLL_INTERVAL_MS);
    }

    const finalRun = await ApplicationRun.findById(applicationId).exec();
    const node2 = await NodeResult.findOne({
      applicationRunId: applicationId,
      nodeIndex: 2,
    }).exec();
    const node3 = await NodeResult.findOne({
      applicationRunId: applicationId,
      nodeIndex: 3,
    }).exec();

    console.log("ApplicationRun.status after quiz + poll:", finalRun?.status);
    console.log(
      "Node 2:",
      node2 ? { nodeType: node2.nodeType, score: node2.score } : "(missing)",
    );
    console.log(
      "Node 3:",
      node3 ? { nodeType: node3.nodeType, score: node3.score } : "(missing)",
    );

    if (
      finalRun?.status !== "COMPLETED" ||
      !node2 ||
      node2.nodeType !== "QUIZ_RESULT" ||
      !node3 ||
      node3.nodeType !== "FINAL_REPORT"
    ) {
      console.error(
        "Quiz or Inngest Node 3 did not complete. Ensure `npm run inngest:dev` is running and OPENROUTER_API_KEY is set if you expect real Node 3 AI output.",
      );
      process.exit(1);
    }
    logPipelineNode(
      "Node 3 — hiring summary (AI when OPENROUTER_API_KEY is set)",
      node3,
    );
    console.log("Full pipeline verified through COMPLETED.");
  } finally {
    await disconnectDb().catch(() => {});
  }

  console.log("All checks passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
