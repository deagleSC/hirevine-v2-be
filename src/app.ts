import cookieParser from "cookie-parser";
import cors from "cors";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import helmet from "helmet";
import { env } from "./config/env";
import { registerSwagger } from "./docs/registerSwagger";
import { ErrorCodes } from "./http/errorCodes";
import { fail, ok } from "./http/response";
import { applicationsRouter } from "./routes/applications";
import { authRouter } from "./routes/auth";
import { jobsRouter } from "./routes/jobs";
import { organizationsRouter } from "./routes/organizations";

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
          imgSrc: ["'self'", "data:", "https://validator.swagger.io"],
          connectSrc: ["'self'"],
        },
      },
      crossOriginResourcePolicy: { policy: "cross-origin" },
    }),
  );
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

  app.get("/api", (_req, res) => {
    ok(res, 200, { name: "hirevine-v2-be", version: "0.1.0" });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/organizations", organizationsRouter);
  app.use("/api/jobs", jobsRouter);
  app.use("/api/applications", applicationsRouter);

  registerSwagger(app);

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    fail(res, 500, ErrorCodes.INTERNAL_ERROR, "Internal server error");
  });

  return app;
}
