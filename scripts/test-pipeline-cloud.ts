/**
 * Full E2E pipeline against a **deployed** API with **Inngest Cloud** (no local dev server).
 *
 * Loads `.env` then `.env.production` (same as `test:pipeline`), requires:
 * - `BASE_URL` — **https** URL of your deployment (e.g. Vercel), **not** localhost
 * - `MONGODB_URI` — same database the deployment uses (for polling `ApplicationRun` / `NodeResult`)
 * - `RECRUITER_PASSWORD` / `CANDIDATE_PASSWORD` — test accounts that exist in that DB
 *
 * Inngest Cloud must be configured to invoke **`${BASE_URL}/api/inngest`**. Do **not** set
 * `INNGEST_DEV=1` on the serverless deployment (that forces dev mode).
 *
 * Resume: `~/Downloads/supratik_resume_fe.pdf` or `E2E_RESUME_PATH`.
 *
 * Run: `npm run test:pipeline:cloud`
 *
 * Override poll windows if serverless is slow: `INNGEST_POLL_MS`, `E2E_NODE3_POLL_MS`.
 */

import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";
import { spawnSync } from "node:child_process";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const envBase = path.join(repoRoot, ".env");
const envProd = path.join(repoRoot, ".env.production");

if (existsSync(envBase)) {
  dotenv.config({ path: envBase });
}
if (!existsSync(envProd)) {
  console.error(
    `Missing required env file:\n  ${envProd}\n\n` +
      "Use the same layout as `npm run test:pipeline` (BASE_URL must be your deployed https API).",
  );
  process.exit(1);
}
dotenv.config({ path: envProd, override: true });

process.env.NODE_ENV = "production";

const baseUrl = (process.env.BASE_URL ?? "").replace(/\/+$/, "");
if (!baseUrl) {
  console.error("BASE_URL is required in .env.production for test:pipeline:cloud.");
  process.exit(1);
}

let parsed: URL;
try {
  parsed = new URL(baseUrl);
} catch {
  console.error(`BASE_URL is not a valid URL: ${baseUrl}`);
  process.exit(1);
}

if (parsed.protocol !== "https:") {
  console.error(
    `test:pipeline:cloud requires an https BASE_URL (got ${parsed.protocol}). ` +
      "Use your Vercel / production API URL.",
  );
  process.exit(1);
}

const host = parsed.hostname.toLowerCase();
if (host === "localhost" || host === "127.0.0.1" || host === "[::1]") {
  console.error(
    "BASE_URL points at loopback — use `npm run test:pipeline` with local API + `npm run inngest:dev`.\n" +
      "For this script, set BASE_URL in .env.production to your deployed origin (e.g. https://….vercel.app).",
  );
  process.exit(1);
}

const defaultResume = path.join(
  os.homedir(),
  "Downloads",
  "supratik_resume_fe.pdf",
);
const resumePath = process.env.E2E_RESUME_PATH ?? defaultResume;

if (!existsSync(resumePath)) {
  console.error(
    `Resume file not found: ${resumePath}\n` +
      `Set E2E_RESUME_PATH or place supratik_resume_fe.pdf in Downloads.`,
  );
  process.exit(1);
}

process.env.E2E_RESUME_PATH = resumePath;

console.log("Cloud Inngest pipeline test (deployed API, no inngest:dev)");
console.log("  BASE_URL     =", baseUrl);
console.log("  NODE_ENV     =", process.env.NODE_ENV);
console.log("  E2E_RESUME_PATH =", resumePath);
console.log(
  "  Prereq: Inngest app “Serve” URL =",
  `${baseUrl}/api/inngest`,
  "(Inngest Cloud → your deployment)",
);
console.log("Spawning verify-jobs-apply-inngest-once.ts with E2E_INNGEST_TARGET=cloud …\n");

const tsxCli = path.join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");
const verifyScript = path.join(
  repoRoot,
  "scripts",
  "verify-jobs-apply-inngest-once.ts",
);

const childEnv: NodeJS.ProcessEnv = {
  ...process.env,
  NODE_ENV: "production",
  E2E_RESUME_PATH: resumePath,
  HIREVINE_PIPELINE_USE_PROD_CONFIG: "1",
  E2E_INNGEST_TARGET: "cloud",
};

if (!process.env.INNGEST_POLL_MS) {
  childEnv.INNGEST_POLL_MS = "120000";
}
if (!process.env.E2E_NODE3_POLL_MS) {
  childEnv.E2E_NODE3_POLL_MS = "240000";
}

const r = spawnSync(process.execPath, [tsxCli, verifyScript], {
  cwd: repoRoot,
  env: childEnv,
  stdio: "inherit",
});

if (r.error) {
  console.error(r.error);
  process.exit(1);
}
process.exit(r.status === null ? 1 : r.status);
