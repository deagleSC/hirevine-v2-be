/**
 * Runs the full E2E pipeline against **production** configuration:
 * loads `.env.production` (overrides `.env`), sets `NODE_ENV=production`, then runs
 * `verify-jobs-apply-inngest-once.ts` with your resume PDF.
 *
 * This hits your real `BASE_URL` API and `MONGODB_URI` database (for Inngest poll).
 * Ensure recruiter/candidate accounts and org exist on that environment.
 *
 * Files:
 * - `.env` — optional; loaded first for keys not in production file
 * - `.env.production` — **required**; must include at least `BASE_URL`, `MONGODB_URI`,
 *   `RECRUITER_PASSWORD`, `CANDIDATE_PASSWORD` (and anything else the verify script needs)
 *
 * Resume: `~/Downloads/supratik_resume_fe.pdf` or `E2E_RESUME_PATH`.
 *
 * Prerequisites on the **production** side:
 * - Deployed API reachable at `BASE_URL`
 * - Inngest production app pointed at that API’s `/api/inngest`
 * - Same Mongo as in `MONGODB_URI` so the script can poll `ApplicationRun` / `NodeResult`
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
    `Missing required production env file:\n  ${envProd}\n\n` +
      "Create it with production BASE_URL, MONGODB_URI, passwords, etc. " +
      "(see .env.example). Optional keys can live in .env and are loaded first.",
  );
  process.exit(1);
}
dotenv.config({ path: envProd, override: true });

process.env.NODE_ENV = "production";

const baseUrl = (process.env.BASE_URL ?? "http://127.0.0.1:8000").replace(
  /\/+$/,
  "",
);
try {
  const host = new URL(baseUrl).hostname;
  if (/127\.0\.0\.1|localhost/i.test(host)) {
    console.warn(
      `\nWarning: BASE_URL host is ${host} — still looks like local dev.\n` +
        "Set BASE_URL in .env.production to your deployed API if you intend production.\n" +
        "If the API is `npm start`, `prestart` rebuilds dist/ each time; restart the server after pulls. " +
        "If you run `node dist/server.js` directly, run `npm run build` when TypeScript changes.\n" +
        "Inngest: if the API uses production env + INNGEST_SIGNING_KEY on localhost, set INNGEST_DEV=1 " +
        "on the API process and run `npm run inngest:dev` so `/api/inngest` uses dev mode, not cloud-only.\n",
    );
  }
} catch {
  console.warn(`Warning: BASE_URL is not a valid URL: ${baseUrl}\n`);
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
      `Place supratik_resume_fe.pdf in Downloads or set E2E_RESUME_PATH.`,
  );
  process.exit(1);
}

process.env.E2E_RESUME_PATH = resumePath;

console.log("Production pipeline test");
console.log("  BASE_URL     =", baseUrl);
console.log("  NODE_ENV     =", process.env.NODE_ENV);
console.log("  E2E_RESUME_PATH =", resumePath);
console.log("Spawning verify-jobs-apply-inngest-once.ts …\n");

const tsxCli = path.join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");
const verifyScript = path.join(
  repoRoot,
  "scripts",
  "verify-jobs-apply-inngest-once.ts",
);

const r = spawnSync(process.execPath, [tsxCli, verifyScript], {
  cwd: repoRoot,
  env: {
    ...process.env,
    NODE_ENV: "production",
    E2E_RESUME_PATH: resumePath,
    /** Child `dotenv/config` will not override vars already set from .env.production above. */
    HIREVINE_PIPELINE_USE_PROD_CONFIG: "1",
  },
  stdio: "inherit",
});

if (r.error) {
  console.error(r.error);
  process.exit(1);
}
process.exit(r.status === null ? 1 : r.status);
