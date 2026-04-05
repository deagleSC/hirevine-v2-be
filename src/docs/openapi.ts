import type { OpenAPIV3 } from "openapi-types";

export const openApiSpec: OpenAPIV3.Document = {
  openapi: "3.0.3",
  info: {
    title: "Hirevine API",
    version: "0.1.0",
    description:
      'Hirevine hiring automation backend (Express + MongoDB). Responses: success `{ "success": true, "data": ... }`, error `{ "success": false, "error": { "code", "message" } }`. **Auth:** Login/Register set an HTTP-only cookie and return the same JWT as `accessToken` in the body. **Swagger:** Stay on one host only (`localhost` *or* `127.0.0.1`, not both). Use credentialed Try it out first; if `/me` is still 401, click **Authorize**, choose **Bearer**, paste `accessToken` from the login response. **Production on http://** (e.g. local): set `AUTH_COOKIE_SECURE=false` or the browser will drop the cookie.',
  },
  servers: [
    {
      url: "/",
      description: "This server (e.g. http://localhost:8000)",
    },
  ],
  tags: [
    { name: "System", description: "Health and metadata" },
    {
      name: "Auth",
      description:
        "Email/password; JWT in HTTP-only cookie and optional Bearer header (`Authorization: Bearer <accessToken>`)",
    },
    {
      name: "Organizations",
      description:
        "Employer orgs. Recruiters create one org, then manage jobs under it. Candidates usually have no org.",
    },
    {
      name: "Jobs",
      description:
        "Job postings (org-scoped for writes). Public browse of active jobs; candidates apply across orgs.",
    },
    {
      name: "Resumes",
      description:
        "Candidate resume file upload to Vercel Blob; use returned `resumeUrl` in `POST /api/jobs/{jobId}/apply`.",
    },
    {
      name: "Applications",
      description:
        "Candidates: **`GET /api/applications/me`**, quiz (`GET/POST /api/applications/{applicationId}/quiz`), detail (`GET /api/applications/{applicationId}`). Recruiters/admins: **`GET /api/applications`** — org-wide paginated list (`jobId`, `status`, `page`, `limit`); **`GET /api/jobs/{jobId}/applications`** — applications for one job; detail includes pipeline + node results. Apply using a Blob `resumeUrl` from `POST /api/resumes/upload`.",
    },
  ],
  paths: {
    "/": {
      get: {
        tags: ["System"],
        summary: "Root — API landing",
        operationId: "getRoot",
        description:
          "Returns service id and links to `/api`, `/health`, `/api-docs`, `/openapi.json`. On Vercel, `vercel.json` rewrites `/` to the serverless handler.",
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/RootSuccess" },
              },
            },
          },
        },
      },
    },
    "/health": {
      get: {
        tags: ["System"],
        summary: "Health check",
        operationId: "getHealth",
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/HealthSuccess" },
              },
            },
          },
        },
      },
    },
    "/api": {
      get: {
        tags: ["System"],
        summary: "API metadata",
        operationId: "getApiMeta",
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ApiMetaSuccess" },
              },
            },
          },
        },
      },
    },
    "/api/auth/me": {
      get: {
        tags: ["Auth"],
        summary: "Current user",
        operationId: "authMe",
        description:
          "Cookie session (after Login/Register in this UI) or **Authorize → Bearer** with `accessToken` from login.",
        security: [{}, { bearerAuth: [] }],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AuthUserSuccess" },
              },
            },
          },
          "401": {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorEnvelope" },
              },
            },
          },
        },
      },
    },
    "/api/auth/register": {
      post: {
        tags: ["Auth"],
        summary: "Register",
        operationId: "authRegister",
        description:
          "Creates a user and sets the session cookie on this origin. Self-registration role: `recruiter` (default) or `candidate`. After success, **Current user** works in Try it out without pasting the cookie.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/RegisterRequest" },
            },
          },
        },
        responses: {
          "201": {
            description: "Created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AuthSessionSuccess" },
              },
            },
          },
          "400": {
            description: "Validation error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorEnvelope" },
              },
            },
          },
          "409": {
            description: "Email already registered",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorEnvelope" },
              },
            },
          },
        },
      },
    },
    "/api/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Login",
        operationId: "authLogin",
        description:
          "Sets the session cookie. Use this (or Register) before **Current user** in Try it out.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/LoginRequest" },
            },
          },
        },
        responses: {
          "200": {
            description: "OK; Set-Cookie session",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AuthSessionSuccess" },
              },
            },
          },
          "400": {
            description: "Validation error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorEnvelope" },
              },
            },
          },
          "401": {
            description: "Invalid credentials",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorEnvelope" },
              },
            },
          },
        },
      },
    },
    "/api/auth/logout": {
      post: {
        tags: ["Auth"],
        summary: "Logout",
        operationId: "authLogout",
        responses: {
          "200": {
            description: "Cookie cleared",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/EmptySuccess" },
              },
            },
          },
        },
      },
    },
    "/api/organizations": {
      post: {
        tags: ["Organizations"],
        summary: "Create organization",
        operationId: "organizationsCreate",
        description:
          "Recruiter/admin only. Attaches your user to the new org. Fails if you already have an organization.",
        security: [{}, { bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/OrganizationCreateRequest",
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Created",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/OrganizationCreateSuccess",
                },
              },
            },
          },
          "400": {
            description: "Validation error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorEnvelope" },
              },
            },
          },
          "401": {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorEnvelope" },
              },
            },
          },
          "403": {
            description: "Forbidden (e.g. candidate)",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorEnvelope" },
              },
            },
          },
          "409": {
            description: "Already in an org or slug taken",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorEnvelope" },
              },
            },
          },
        },
      },
    },
    "/api/organizations/me": {
      get: {
        tags: ["Organizations"],
        summary: "Current organization",
        operationId: "organizationsMe",
        security: [{}, { bearerAuth: [] }],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/OrganizationMeSuccess" },
              },
            },
          },
          "401": {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorEnvelope" },
              },
            },
          },
          "404": {
            description: "No organization on account",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorEnvelope" },
              },
            },
          },
        },
      },
    },
    "/api/jobs/browse": {
      get: {
        tags: ["Jobs"],
        summary: "Browse active jobs",
        operationId: "jobsBrowse",
        description: "Public. Returns up to 50 active jobs (minimal fields).",
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/JobsBrowseSuccess" },
              },
            },
          },
        },
      },
    },
    "/api/jobs": {
      get: {
        tags: ["Jobs"],
        summary: "List jobs in my organization",
        operationId: "jobsList",
        security: [{}, { bearerAuth: [] }],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/JobsListSuccess" },
              },
            },
          },
          "401": {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorEnvelope" },
              },
            },
          },
          "403": {
            description: "No organization or wrong role",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorEnvelope" },
              },
            },
          },
        },
      },
      post: {
        tags: ["Jobs"],
        summary: "Create job",
        operationId: "jobsCreate",
        security: [{}, { bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/JobCreateRequest" },
            },
          },
        },
        responses: {
          "201": {
            description: "Created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/JobOneSuccessFull" },
              },
            },
          },
          "400": {
            description: "Validation error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorEnvelope" },
              },
            },
          },
          "401": {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorEnvelope" },
              },
            },
          },
          "403": {
            description: "No organization",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorEnvelope" },
              },
            },
          },
        },
      },
    },
    "/api/jobs/{jobId}": {
      get: {
        tags: ["Jobs"],
        summary: "Get job by id",
        operationId: "jobsGetById",
        description:
          "Active jobs: public summary. Draft/paused/closed: recruiter/admin of owning org only.",
        parameters: [
          {
            name: "jobId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        security: [{}, { bearerAuth: [] }],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/JobOneSuccessUnion" },
              },
            },
          },
          "401": {
            description: "Unauthorized (non-active job)",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorEnvelope" },
              },
            },
          },
          "403": {
            description: "Forbidden",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorEnvelope" },
              },
            },
          },
          "404": {
            description: "Not found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorEnvelope" },
              },
            },
          },
        },
      },
      patch: {
        tags: ["Jobs"],
        summary: "Update job",
        operationId: "jobsPatch",
        security: [{}, { bearerAuth: [] }],
        parameters: [
          {
            name: "jobId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/JobPatchRequest" },
            },
          },
        },
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/JobOneSuccessFull" },
              },
            },
          },
          "400": {
            description: "Validation error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorEnvelope" },
              },
            },
          },
          "401": {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorEnvelope" },
              },
            },
          },
          "403": {
            description: "Forbidden",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorEnvelope" },
              },
            },
          },
          "404": {
            description: "Job not found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorEnvelope" },
              },
            },
          },
        },
      },
    },
    "/api/jobs/{jobId}/generate-pipeline": {
      post: {
        tags: ["Jobs"],
        summary: "Generate 3-node pipeline from JD",
        operationId: "jobsGeneratePipeline",
        description:
          "Recruiter/admin, org job. Uses OpenRouter + structured output. Job `description` must be ≥ 40 characters. Sets `pipeline` on the job (includes quiz answer keys — do not expose publicly).",
        security: [{}, { bearerAuth: [] }],
        parameters: [
          {
            name: "jobId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "Pipeline saved on job",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/JobOneSuccessFull" },
              },
            },
          },
          "400": {
            description: "Description too short or validation error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorEnvelope" },
              },
            },
          },
          "401": {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorEnvelope" },
              },
            },
          },
          "403": {
            description: "Forbidden",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorEnvelope" },
              },
            },
          },
          "404": {
            description: "Job not found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorEnvelope" },
              },
            },
          },
          "502": {
            description: "Upstream model / parse failure",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorEnvelope" },
              },
            },
          },
          "503": {
            description: "OPENROUTER_API_KEY not configured",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorEnvelope" },
              },
            },
          },
        },
      },
    },
    "/api/jobs/{jobId}/apply": {
      post: {
        tags: ["Jobs"],
        summary: "Apply to job",
        operationId: "jobsApply",
        description:
          "Candidate only. Job must be `active`. One application per candidate per job. **`resumeUrl`** must be the HTTPS URL from **`POST /api/resumes/upload`** (Vercel Blob), unless the server runs in development with `ALLOW_ANY_RESUME_URL=true`.",
        security: [{}, { bearerAuth: [] }],
        parameters: [
          {
            name: "jobId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ApplyRequest" },
            },
          },
        },
        responses: {
          "201": {
            description: "Created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ApplySuccess" },
              },
            },
          },
          "400": {
            description: "Validation or job not accepting applications",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorEnvelope" },
              },
            },
          },
          "401": {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorEnvelope" },
              },
            },
          },
          "403": {
            description: "Forbidden (not a candidate)",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorEnvelope" },
              },
            },
          },
          "404": {
            description: "Job not found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorEnvelope" },
              },
            },
          },
          "409": {
            description: "Already applied",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorEnvelope" },
              },
            },
          },
        },
      },
    },
    "/api/resumes/upload": {
      post: {
        tags: ["Resumes"],
        summary: "Upload resume file (Vercel Blob)",
        operationId: "resumesUpload",
        description:
          "Candidate only. Multipart form field **`file`** (default max 4MB — Vercel-safe; set `RESUME_UPLOAD_MAX_BYTES` for self-hosted). Allowed: PDF or plain text. Requires `BLOB_READ_WRITE_TOKEN` on the server. Returns public `resumeUrl` for `POST /api/jobs/{jobId}/apply`.",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                properties: {
                  file: {
                    type: "string",
                    format: "binary",
                    description: "Resume PDF or .txt",
                  },
                },
                required: ["file"],
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ResumeUploadSuccess" },
              },
            },
          },
          "400": {
            description: "Validation",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorEnvelope" },
              },
            },
          },
          "401": {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorEnvelope" },
              },
            },
          },
          "403": {
            description: "Forbidden",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorEnvelope" },
              },
            },
          },
          "503": {
            description: "Blob token not configured",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorEnvelope" },
              },
            },
          },
        },
      },
    },
    "/api/jobs/{jobId}/applications": {
      get: {
        tags: ["Jobs"],
        summary: "List applications for a job",
        operationId: "jobsListApplications",
        description:
          "Recruiter/admin for the job’s organization only. For all jobs at once with pagination and filters, use **`GET /api/applications`**.",
        security: [{}, { bearerAuth: [] }],
        parameters: [
          {
            name: "jobId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/JobApplicationsListSuccess",
                },
              },
            },
          },
          "401": {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorEnvelope" },
              },
            },
          },
          "403": {
            description: "Forbidden",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorEnvelope" },
              },
            },
          },
          "404": {
            description: "Job not found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorEnvelope" },
              },
            },
          },
        },
      },
    },
    "/api/applications": {
      get: {
        tags: ["Applications"],
        summary: "List applications in my organization",
        operationId: "applicationsOrgList",
        description:
          "Recruiter/admin only. Paginated applications for your organization across all jobs. Optional **`jobId`** (must be an org job). Optional **`status`**: one value or comma-separated list (`NODE_1_PENDING`, `NODE_2_PENDING`, `NODE_3_PENDING`, `COMPLETED`, `REJECTED`). Each row includes **`candidateEmail`** and **`jobTitle`** for dashboard use.",
        security: [{}, { bearerAuth: [] }],
        parameters: [
          {
            name: "page",
            in: "query",
            description: "1-based page index",
            schema: { type: "integer", minimum: 1, default: 1 },
          },
          {
            name: "limit",
            in: "query",
            description: "Page size (max 100)",
            schema: { type: "integer", minimum: 1, maximum: 100, default: 20 },
          },
          {
            name: "jobId",
            in: "query",
            description:
              "Filter to one job (Mongo id; must belong to your org)",
            schema: { type: "string" },
          },
          {
            name: "status",
            in: "query",
            description:
              "Filter by run status; comma-separated for multiple (e.g. `COMPLETED` or `NODE_1_PENDING,NODE_2_PENDING`)",
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ApplicationsOrgListSuccess",
                },
              },
            },
          },
          "400": {
            description: "Invalid query (e.g. bad status or jobId)",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorEnvelope" },
              },
            },
          },
          "401": {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorEnvelope" },
              },
            },
          },
          "403": {
            description: "Forbidden (not recruiter/admin or no organization)",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorEnvelope" },
              },
            },
          },
          "404": {
            description: "jobId set but job not found in your organization",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorEnvelope" },
              },
            },
          },
        },
      },
    },
    "/api/applications/me": {
      get: {
        tags: ["Applications"],
        summary: "My applications",
        operationId: "applicationsMe",
        description: "Candidate only.",
        security: [{}, { bearerAuth: [] }],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ApplicationsMeSuccess",
                },
              },
            },
          },
          "401": {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorEnvelope" },
              },
            },
          },
          "403": {
            description: "Forbidden",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorEnvelope" },
              },
            },
          },
        },
      },
    },
    "/api/applications/{applicationId}/quiz": {
      get: {
        tags: ["Applications"],
        summary: "Get quiz questions for an application",
        operationId: "applicationsQuizGet",
        description:
          "Candidate only. Returns pipeline node2 questions **without** answer keys when the run is `NODE_2_PENDING` and the job has a pipeline.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "applicationId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ApplicationQuizGetSuccess",
                },
              },
            },
          },
          "400": {
            description: "Validation or wrong application step",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorEnvelope" },
              },
            },
          },
          "401": {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorEnvelope" },
              },
            },
          },
          "403": {
            description: "Forbidden",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorEnvelope" },
              },
            },
          },
          "404": {
            description: "Application not found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorEnvelope" },
              },
            },
          },
        },
      },
      post: {
        tags: ["Applications"],
        summary: "Submit quiz answers",
        operationId: "applicationsQuizPost",
        description:
          "Candidate only. Grades answers against the job pipeline (deterministic: exact match for multiple choice; case-insensitive trim for short answer). Creates node 2 `NodeResult`, sets `NODE_3_PENDING`, emits `hirevine/application.quiz_submitted` for the Node 3 worker.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "applicationId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ApplicationQuizSubmitRequest",
              },
            },
          },
        },
        responses: {
          "200": {
            description:
              "OK — application now `NODE_3_PENDING` until final report completes",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ApplicationQuizSubmitSuccess",
                },
              },
            },
          },
          "400": {
            description: "Validation",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorEnvelope" },
              },
            },
          },
          "401": {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorEnvelope" },
              },
            },
          },
          "403": {
            description: "Forbidden",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorEnvelope" },
              },
            },
          },
          "404": {
            description: "Application not found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorEnvelope" },
              },
            },
          },
          "409": {
            description: "Quiz already submitted",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorEnvelope" },
              },
            },
          },
        },
      },
    },
    "/api/applications/{applicationId}": {
      get: {
        tags: ["Applications"],
        summary: "Application detail (candidate or recruiter)",
        operationId: "applicationsDetail",
        description:
          "**Candidate:** own application only — job summary (no pipeline), `nextStep` guidance, all `NodeResult` rows for this run. **Recruiter/admin:** same `organizationId` as the application — full job including pipeline (with quiz answer keys), candidate `id` + `email`, node results.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "applicationId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "OK — inspect `data.view` (`candidate` | `recruiter`)",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ApplicationDetailSuccess",
                },
              },
            },
          },
          "400": {
            description: "Invalid id",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorEnvelope" },
              },
            },
          },
          "401": {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorEnvelope" },
              },
            },
          },
          "403": {
            description: "Forbidden",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorEnvelope" },
              },
            },
          },
          "404": {
            description: "Not found or no access",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorEnvelope" },
              },
            },
          },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description:
          "Paste `accessToken` from POST /api/auth/login (or register) response body.",
      },
    },
    schemas: {
      HealthSuccess: {
        type: "object",
        properties: {
          success: { type: "boolean", enum: [true] },
          data: {
            type: "object",
            properties: { service: { type: "string" } },
            required: ["service"],
          },
        },
        required: ["success", "data"],
      },
      RootSuccess: {
        type: "object",
        properties: {
          success: { type: "boolean", enum: [true] },
          data: {
            type: "object",
            properties: {
              service: { type: "string" },
              message: { type: "string" },
              links: {
                type: "object",
                properties: {
                  api: { type: "string" },
                  health: { type: "string" },
                  docs: { type: "string" },
                  openapi: { type: "string" },
                },
                required: ["api", "health", "docs", "openapi"],
              },
            },
            required: ["service", "message", "links"],
          },
        },
        required: ["success", "data"],
      },
      ApiMetaSuccess: {
        type: "object",
        properties: {
          success: { type: "boolean", enum: [true] },
          data: {
            type: "object",
            properties: {
              name: { type: "string" },
              version: { type: "string" },
            },
            required: ["name", "version"],
          },
        },
        required: ["success", "data"],
      },
      PublicUser: {
        type: "object",
        properties: {
          id: { type: "string" },
          email: { type: "string", format: "email" },
          role: {
            type: "string",
            enum: ["recruiter", "candidate", "admin"],
          },
          organizationId: {
            type: "string",
            nullable: true,
            description:
              "Employer org for recruiters; often null for marketplace candidates.",
          },
          createdAt: { type: "string", format: "date-time" },
        },
        required: ["id", "email", "role", "organizationId", "createdAt"],
      },
      AuthUserSuccess: {
        type: "object",
        properties: {
          success: { type: "boolean", enum: [true] },
          data: {
            type: "object",
            properties: {
              user: { $ref: "#/components/schemas/PublicUser" },
            },
            required: ["user"],
          },
        },
        required: ["success", "data"],
      },
      AuthSessionSuccess: {
        type: "object",
        properties: {
          success: { type: "boolean", enum: [true] },
          data: {
            type: "object",
            properties: {
              user: { $ref: "#/components/schemas/PublicUser" },
              accessToken: {
                type: "string",
                description:
                  "Same JWT as the session cookie; use as Bearer if the cookie is not sent.",
              },
            },
            required: ["user", "accessToken"],
          },
        },
        required: ["success", "data"],
      },
      EmptySuccess: {
        type: "object",
        properties: {
          success: { type: "boolean", enum: [true] },
          data: { nullable: true },
        },
        required: ["success", "data"],
      },
      RegisterRequest: {
        type: "object",
        properties: {
          email: { type: "string", format: "email" },
          password: { type: "string", minLength: 8 },
          role: { type: "string", enum: ["recruiter", "candidate"] },
        },
        required: ["email", "password"],
      },
      LoginRequest: {
        type: "object",
        properties: {
          email: { type: "string" },
          password: { type: "string" },
        },
        required: ["email", "password"],
      },
      OrganizationPublic: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          slug: { type: "string" },
        },
        required: ["id", "name", "slug"],
      },
      OrganizationCreateRequest: {
        type: "object",
        properties: {
          name: { type: "string", maxLength: 200 },
          slug: {
            type: "string",
            maxLength: 64,
            description:
              "Lowercase; letters, numbers, single hyphens between segments.",
          },
        },
        required: ["name", "slug"],
      },
      OrganizationCreateSuccess: {
        type: "object",
        properties: {
          success: { type: "boolean", enum: [true] },
          data: {
            type: "object",
            properties: {
              organization: {
                $ref: "#/components/schemas/OrganizationPublic",
              },
              user: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  email: { type: "string" },
                  role: { type: "string" },
                  organizationId: { type: "string" },
                },
                required: ["id", "email", "role", "organizationId"],
              },
            },
            required: ["organization", "user"],
          },
        },
        required: ["success", "data"],
      },
      OrganizationMeSuccess: {
        type: "object",
        properties: {
          success: { type: "boolean", enum: [true] },
          data: {
            type: "object",
            properties: {
              organization: {
                $ref: "#/components/schemas/OrganizationPublic",
              },
            },
            required: ["organization"],
          },
        },
        required: ["success", "data"],
      },
      JobPublic: {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          status: {
            type: "string",
            enum: ["draft", "active", "paused", "closed"],
          },
          organizationId: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
        required: [
          "id",
          "title",
          "status",
          "organizationId",
          "createdAt",
          "updatedAt",
        ],
      },
      JobPipeline: {
        type: "object",
        description:
          "version 1 — node1 resume rubric, node2 quiz (5 questions), node3 report instructions. Validated with Zod on write.",
        properties: {
          version: { type: "integer", enum: [1] },
          node1: {
            type: "object",
            properties: {
              rubric: { type: "string" },
              mustHaveSkills: { type: "array", items: { type: "string" } },
              niceToHaveSkills: { type: "array", items: { type: "string" } },
              passThreshold: { type: "number" },
            },
            required: ["rubric"],
          },
          node2: {
            type: "object",
            properties: {
              questions: {
                type: "array",
                items: { type: "object", additionalProperties: true },
              },
            },
            required: ["questions"],
          },
          node3: {
            type: "object",
            properties: {
              reportInstructions: { type: "string" },
              scoringWeightsHint: { type: "string" },
            },
            required: ["reportInstructions"],
          },
        },
        required: ["version", "node1", "node2", "node3"],
      },
      JobFull: {
        allOf: [
          { $ref: "#/components/schemas/JobPublic" },
          {
            type: "object",
            properties: {
              description: { type: "string" },
              createdBy: { type: "string" },
              pipeline: {
                nullable: true,
                allOf: [{ $ref: "#/components/schemas/JobPipeline" }],
              },
            },
            required: ["description", "createdBy", "pipeline"],
          },
        ],
      },
      JobsBrowseSuccess: {
        type: "object",
        properties: {
          success: { type: "boolean", enum: [true] },
          data: {
            type: "object",
            properties: {
              jobs: {
                type: "array",
                items: { $ref: "#/components/schemas/JobPublic" },
              },
            },
            required: ["jobs"],
          },
        },
        required: ["success", "data"],
      },
      JobsListSuccess: {
        type: "object",
        properties: {
          success: { type: "boolean", enum: [true] },
          data: {
            type: "object",
            properties: {
              jobs: {
                type: "array",
                items: { $ref: "#/components/schemas/JobFull" },
              },
            },
            required: ["jobs"],
          },
        },
        required: ["success", "data"],
      },
      JobOneSuccessFull: {
        type: "object",
        properties: {
          success: { type: "boolean", enum: [true] },
          data: {
            type: "object",
            properties: {
              job: { $ref: "#/components/schemas/JobFull" },
            },
            required: ["job"],
          },
        },
        required: ["success", "data"],
      },
      JobOneSuccessUnion: {
        oneOf: [
          {
            type: "object",
            properties: {
              success: { type: "boolean", enum: [true] },
              data: {
                type: "object",
                properties: {
                  job: { $ref: "#/components/schemas/JobPublic" },
                },
                required: ["job"],
              },
            },
            required: ["success", "data"],
          },
          {
            $ref: "#/components/schemas/JobOneSuccessFull",
          },
        ],
      },
      JobCreateRequest: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          status: {
            type: "string",
            enum: ["draft", "active", "paused", "closed"],
          },
          pipeline: { $ref: "#/components/schemas/JobPipeline" },
        },
        required: ["title"],
      },
      JobPatchRequest: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          status: {
            type: "string",
            enum: ["draft", "active", "paused", "closed"],
          },
          pipeline: {
            nullable: true,
            allOf: [{ $ref: "#/components/schemas/JobPipeline" }],
          },
        },
      },
      ApplicationPublic: {
        type: "object",
        properties: {
          id: { type: "string" },
          jobId: { type: "string" },
          candidateId: { type: "string" },
          organizationId: { type: "string" },
          status: {
            type: "string",
            enum: [
              "NODE_1_PENDING",
              "NODE_2_PENDING",
              "NODE_3_PENDING",
              "COMPLETED",
              "REJECTED",
            ],
          },
          resumeUrl: { type: "string" },
          currentFitScore: { type: "number", minimum: 0, maximum: 100 },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
        required: [
          "id",
          "jobId",
          "candidateId",
          "organizationId",
          "status",
          "resumeUrl",
          "createdAt",
          "updatedAt",
        ],
      },
      ApplicationWithJobSummary: {
        type: "object",
        properties: {
          id: { type: "string" },
          jobId: { type: "string" },
          organizationId: { type: "string" },
          status: { type: "string" },
          resumeUrl: { type: "string" },
          currentFitScore: { type: "number" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
          job: {
            type: "object",
            nullable: true,
            properties: {
              id: { type: "string" },
              title: { type: "string" },
              status: { type: "string" },
            },
          },
        },
        required: [
          "id",
          "jobId",
          "organizationId",
          "status",
          "resumeUrl",
          "createdAt",
          "updatedAt",
          "job",
        ],
      },
      ResumeUploadSuccess: {
        type: "object",
        properties: {
          success: { type: "boolean", enum: [true] },
          data: {
            type: "object",
            properties: {
              resumeUrl: {
                type: "string",
                format: "uri",
                description: "Public URL — pass to apply",
              },
              pathname: { type: "string" },
              contentType: { type: "string" },
            },
            required: ["resumeUrl", "pathname", "contentType"],
          },
        },
        required: ["success", "data"],
      },
      ApplyRequest: {
        type: "object",
        properties: {
          resumeUrl: {
            type: "string",
            format: "uri",
            description:
              "HTTPS URL returned from `POST /api/resumes/upload` (`*.public.blob.vercel-storage.com` or `BLOB_PUBLIC_HOST`).",
          },
        },
        required: ["resumeUrl"],
      },
      ApplySuccess: {
        type: "object",
        properties: {
          success: { type: "boolean", enum: [true] },
          data: {
            type: "object",
            properties: {
              application: { $ref: "#/components/schemas/ApplicationPublic" },
            },
            required: ["application"],
          },
        },
        required: ["success", "data"],
      },
      JobApplicationsListSuccess: {
        type: "object",
        properties: {
          success: { type: "boolean", enum: [true] },
          data: {
            type: "object",
            properties: {
              applications: {
                type: "array",
                items: { $ref: "#/components/schemas/ApplicationPublic" },
              },
            },
            required: ["applications"],
          },
        },
        required: ["success", "data"],
      },
      ApplicationQuizGetSuccess: {
        type: "object",
        properties: {
          success: { type: "boolean", enum: [true] },
          data: {
            type: "object",
            properties: {
              quiz: {
                type: "object",
                properties: {
                  questions: {
                    type: "array",
                    description:
                      "Public quiz items (no answerKey). Same discriminated shape as JobPipeline node2.",
                    items: { type: "object", additionalProperties: true },
                  },
                },
                required: ["questions"],
              },
            },
            required: ["quiz"],
          },
        },
        required: ["success", "data"],
      },
      ApplicationQuizSubmitRequest: {
        type: "object",
        properties: {
          answers: {
            type: "array",
            items: {
              type: "object",
              properties: {
                questionId: { type: "string" },
                answer: { type: "string" },
              },
              required: ["questionId", "answer"],
            },
          },
        },
        required: ["answers"],
      },
      ApplicationQuizSubmitSuccess: {
        type: "object",
        properties: {
          success: { type: "boolean", enum: [true] },
          data: {
            type: "object",
            properties: {
              application: { $ref: "#/components/schemas/ApplicationPublic" },
            },
            required: ["application"],
          },
        },
        required: ["success", "data"],
      },
      ApplicationsMeSuccess: {
        type: "object",
        properties: {
          success: { type: "boolean", enum: [true] },
          data: {
            type: "object",
            properties: {
              applications: {
                type: "array",
                items: {
                  $ref: "#/components/schemas/ApplicationWithJobSummary",
                },
              },
            },
            required: ["applications"],
          },
        },
        required: ["success", "data"],
      },
      ApplicationOrgListRow: {
        allOf: [
          { $ref: "#/components/schemas/ApplicationPublic" },
          {
            type: "object",
            properties: {
              candidateEmail: {
                type: "string",
                description:
                  "Candidate account email (or placeholder if the user row is missing)",
              },
              jobTitle: {
                type: "string",
                description: "Job title at time of list",
              },
            },
            required: ["candidateEmail", "jobTitle"],
          },
        ],
      },
      ApplicationsOrgListSuccess: {
        type: "object",
        properties: {
          success: { type: "boolean", enum: [true] },
          data: {
            type: "object",
            properties: {
              applications: {
                type: "array",
                items: { $ref: "#/components/schemas/ApplicationOrgListRow" },
              },
              page: { type: "integer", minimum: 1 },
              limit: { type: "integer", minimum: 1, maximum: 100 },
              total: {
                type: "integer",
                minimum: 0,
                description: "Total matching rows (all pages)",
              },
              totalPages: {
                type: "integer",
                minimum: 0,
                description: "Ceil(total / limit); 0 when total is 0",
              },
            },
            required: ["applications", "page", "limit", "total", "totalPages"],
          },
        },
        required: ["success", "data"],
      },
      ApplicationDetailSuccess: {
        type: "object",
        properties: {
          success: { type: "boolean", enum: [true] },
          data: {
            type: "object",
            properties: {
              view: {
                type: "string",
                enum: ["candidate", "recruiter"],
              },
              application: {
                type: "object",
                description: "Same shape as ApplicationPublic",
                additionalProperties: true,
              },
              job: {
                type: "object",
                description:
                  "Candidate: title + status + organizationId. Recruiter: full job including pipeline.",
                additionalProperties: true,
              },
              nextStep: {
                type: "string",
                description:
                  "Candidate view only — human-readable pipeline hint",
              },
              candidate: {
                type: "object",
                description: "Recruiter view only",
                properties: {
                  id: { type: "string" },
                  email: { type: "string", format: "email" },
                },
              },
              nodes: {
                type: "array",
                description:
                  "NodeResult documents (resume, quiz, final report), sorted by nodeIndex",
                items: { type: "object", additionalProperties: true },
              },
            },
            required: ["view", "application", "job", "nodes"],
          },
        },
        required: ["success", "data"],
      },
      ErrorEnvelope: {
        type: "object",
        properties: {
          success: { type: "boolean", enum: [false] },
          error: {
            type: "object",
            properties: {
              code: { type: "string" },
              message: { type: "string" },
            },
            required: ["code", "message"],
          },
        },
        required: ["success", "error"],
      },
    },
  },
};
