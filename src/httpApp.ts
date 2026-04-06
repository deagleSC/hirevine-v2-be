/**
 * Express routes and middleware. Not named `app.ts` — Vercel reserves `src/app.{ts}` as a
 * native Express entry and expects a default export there.
 */
import cookieParser from "cookie-parser";
import cors from "cors";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import helmet, { type HelmetOptions } from "helmet";
import { env } from "./config/env";
import { registerSwagger } from "./docs/registerSwagger";
import { inngestServeHandler } from "./inngest/serve";
import { ErrorCodes } from "./http/errorCodes";
import { fail, ok } from "./http/response";
import { applicationsRouter } from "./routes/applications";
import { authRouter } from "./routes/auth";
import { jobsRouter } from "./routes/jobs";
import { organizationsRouter } from "./routes/organizations";
import { resumesRouter } from "./routes/resumes";

function isSwaggerOrOpenApiPath(req: Request): boolean {
  return req.path === "/openapi.json" || req.path.startsWith("/api-docs");
}

const helmetForApi: HelmetOptions = {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      imgSrc: ["'self'", "data:", "https://validator.swagger.io"],
      connectSrc: ["'self'"],
      workerSrc: ["'self'", "blob:"],
      fontSrc: ["'self'", "data:"],
    },
  },
  crossOriginResourcePolicy: { policy: "cross-origin" },
};

/** Swagger UI needs inline scripts, blob workers, and fonts — strict CSP yields a blank /api-docs. */
const helmetForDocs: HelmetOptions = {
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
};

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);

  app.use((req, res, next) => {
    const h = isSwaggerOrOpenApiPath(req) ? helmetForDocs : helmetForApi;
    helmet(h)(req, res, next);
  });
  app.use(
    cors({
      origin: env.corsOrigin,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());

  app.get("/health", (_req, res) => {
    ok(res, 200, { service: "hirevine-v2-be" });
  });

  /** Root URL on Vercel `/`; avoids empty 404 and documents entrypoints. */
  app.get("/", (_req, res) => {
    ok(res, 200, {
      service: "hirevine-v2-be",
      message: "API is running",
      links: {
        api: "/api",
        health: "/health",
        docs: "/api-docs",
        openapi: "/openapi.json",
      },
    });
  });

  app.get("/api", (_req, res) => {
    ok(res, 200, { name: "hirevine-v2-be", version: "0.1.0" });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/organizations", organizationsRouter);
  app.use("/api/jobs", jobsRouter);
  app.use("/api/resumes", resumesRouter);
  app.use("/api/applications", applicationsRouter);
  app.use("/api/inngest", inngestServeHandler);

  registerSwagger(app);

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    fail(res, 500, ErrorCodes.INTERNAL_ERROR, "Internal server error");
  });

  return app;
}
