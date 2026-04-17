# Deploying Hirevine API

This service targets **[Vercel](https://vercel.com)** using [native Express](https://vercel.com/docs/frameworks/backend/express) (`src/server.ts` is the backend entry; Vercel bundles it—no `api/` shim or catch-all rewrites). The Express app factory lives in **`src/httpApp.ts`** (not `src/app.ts`, because Vercel treats `src/app.{ts,js,…}` as a framework entry and requires a default export there). You can also run **`npm run start`** on any Node 20+ host (Railway, Fly.io, a VM) if you point traffic at the long-running process built from `server.ts`.

## Prerequisites

1. **MongoDB** — [Atlas](https://www.mongodb.com/atlas) (or other). Allow network access from the internet (`0.0.0.0/0`) for Vercel, or use [Atlas Private Endpoint / Vercel integration](https://vercel.com/integrations/mongodbatlas) if you prefer.
2. **Vercel Blob** — Create a store; copy **read/write token** → `BLOB_READ_WRITE_TOKEN`.
3. **OpenRouter** — API key → `OPENROUTER_API_KEY` (pipeline generation + Inngest Node 1 / Node 3).
4. **Inngest** — Create an app; copy **Signing key** and **Event key** → `INNGEST_SIGNING_KEY`, `INNGEST_EVENT_KEY`.

## Environment variables (production)

Set these in **Vercel → Project → Settings → Environment Variables** (Production). See `.env.example` for full notes.

| Variable                  | Required    | Notes                                                                         |
| ------------------------- | ----------- | ----------------------------------------------------------------------------- |
| `NODE_ENV`                | Yes         | `production`                                                                  |
| `MONGODB_URI`             | Yes         | Connection string                                                             |
| `JWT_SECRET`              | Yes         | Strong random secret                                                          |
| `CORS_ORIGIN`             | Recommended | Your frontend origin(s), comma-separated                                      |
| `BLOB_READ_WRITE_TOKEN`   | Yes         | Resume uploads; Inngest Node 1 uses `@vercel/blob` `get()` with this token to read resumes reliably |
| `OPENROUTER_API_KEY`      | Recommended | Real AI; if missing, generate-pipeline returns 503 and Inngest uses stubs      |
| `INNGEST_SIGNING_KEY`     | Yes         | Inngest Cloud invokes `/api/inngest`                                          |
| `INNGEST_EVENT_KEY`       | Yes         | API sends events (`apply`, quiz)                                              |
| `PORT`                    | No          | Ignored on Vercel                                                             |
| `RESUME_UPLOAD_MAX_BYTES` | No          | Default `4194304` (4 MiB); increase only on hosts without Vercel’s body limit |

Optional: `OPENROUTER_MODEL`, `BLOB_PUBLIC_HOST`, `OPENROUTER_HTTP_REFERER`, `OPENROUTER_APP_TITLE`, `JWT_EXPIRES_SEC`, `AUTH_COOKIE_*`.

Do **not** set `ALLOW_ANY_RESUME_URL` in production.

## Deploy with Vercel (Git)

1. Push this repo to GitHub/GitLab/Bitbucket.
2. **Vercel → Add New Project** → import the repo.
3. **Root directory**: repository root (`hirevine-v2-be` if the repo is monorepo-only for this app).
4. **Framework Preset**: Other (or let Vercel detect the Express backend). **Build Command**: leave empty unless you want an explicit `npm run build` (TypeScript check / `dist/` for non-Vercel hosts only). **Output**: leave default (no static export).
5. Add environment variables (table above).
6. Deploy.

After the first deploy, copy the production URL (e.g. `https://hirevine-api.vercel.app`).

## Inngest (production)

1. In [Inngest Cloud](https://app.inngest.com) → your app → sync / serve URL.
2. Set **Serve (webhook) URL** to:

   `https://<your-vercel-domain>/api/inngest`

3. Redeploy or **Sync** so functions register. Without this, async steps after apply/quiz will not run.

## Verify

```bash
curl -sS "https://<your-domain>/health"
curl -sS "https://<your-domain>/openapi.json" | head -c 200
```

Log in via `POST /api/auth/login` (or Swagger at `/api-docs`) and call a protected route with **Bearer** token.

## Frontend + cookies

If the SPA is on another origin, set **`CORS_ORIGIN`** to that origin. In production the API defaults session cookies toward cross-site use; you need **HTTPS** on both sides. See `.env.example` for `AUTH_COOKIE_SECURE` / `AUTH_COOKIE_SAMESITE` if you same-site host API and app.

## CLI alternative

```bash
npm i -g vercel
cd hirevine-v2-be
vercel login
vercel link   # first time
vercel env pull .env.production.local   # optional
vercel --prod
```

## Non-Vercel (long-running Node)

```bash
npm ci
npm run build
NODE_ENV=production MONGODB_URI=... JWT_SECRET=... node dist/server.js
```

Set `RESUME_UPLOAD_MAX_BYTES=5242880` if you want a 5 MiB cap and your host allows larger bodies. Configure a reverse proxy with a body size at least that large.

## Troubleshooting

- **PDF resume text extraction fails on Vercel (`pdf.worker.mjs` missing / fake worker)** — Serverless traces can omit `pdf-parse` worker assets. This repo sets `vercel.json` → `functions["src/server.ts"].includeFiles` to bundle `node_modules/pdf-parse/dist/**`, and the API installs DOM polyfills + an absolute worker path before parsing. If you change the server entry file name, mirror that key under `functions` so `includeFiles` still applies.
- **Build warns about `functions` / unknown path** — If `vercel.json`’s `src/server.ts` key does not match what the build expects, remove the `functions` block and set **max duration** (and memory, if needed) under **Project → Settings → Functions**. With [Fluid compute](https://vercel.com/docs/fluid-compute), memory is often configured in the dashboard rather than in `vercel.json`.
- **503 Database unavailable** — Wrong `MONGODB_URI`, IP allowlist, or Atlas paused tier.
- **401/403 after login** — `JWT_SECRET` changed between deploys (sessions invalidated) or cookie `Secure`/domain mismatch.
- **413 on resume upload** — File or multipart body over host limit; use smaller PDF or raise `RESUME_UPLOAD_MAX_BYTES` only where the platform allows.
- **Inngest not running** — Signing key, event key, or Serve URL wrong; check Inngest dashboard logs.
