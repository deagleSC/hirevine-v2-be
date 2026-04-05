# Deploying Hirevine API

This service targets **[Vercel](https://vercel.com)** serverless: root **`index.js`** loads **`dist/vercelApp.js`** (one function for all routes; no `vercel.json` rewrites). See [Express on Vercel](https://vercel.com/docs/frameworks/backend/express). For a long-running process, use **`npm run start`** (`server.ts`) on Railway, Fly.io, a VM, etc.

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
| `BLOB_READ_WRITE_TOKEN`   | Yes         | Resume uploads                                                                |
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
4. **Framework Preset**: Other. **Build Command**: `npm run build` (already in `vercel.json`). **Output**: leave default (no static export).
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

- **503 Database unavailable** — Wrong `MONGODB_URI`, IP allowlist, or Atlas paused tier.
- **401/403 after login** — `JWT_SECRET` changed between deploys (sessions invalidated) or cookie `Secure`/domain mismatch.
- **413 on resume upload** — File or multipart body over host limit; use smaller PDF or raise `RESUME_UPLOAD_MAX_BYTES` only where the platform allows.
- **Inngest not running** — Signing key, event key, or Serve URL wrong; check Inngest dashboard logs.
