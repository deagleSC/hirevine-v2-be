import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import multer from "multer";
import { put } from "@vercel/blob";
import { env } from "../config/env";
import { ErrorCodes } from "../http/errorCodes";
import { fail, ok } from "../http/response";
import {
  allowedResumeUploadMime,
  sanitizeResumeFilename,
} from "../resume/allowedResumeUpload";
import { requireAuth } from "../middleware/auth";
import { requireRoles } from "../middleware/roles";
import { asyncHandler } from "../util/asyncHandler";

/** Default 4 MiB — Vercel serverless request bodies are capped (~4.5 MiB including multipart overhead). */
function resolveResumeUploadMaxBytes(): number {
  const raw = process.env.RESUME_UPLOAD_MAX_BYTES?.trim();
  if (raw) {
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n) && n >= 512 * 1024 && n <= 10 * 1024 * 1024) {
      return n;
    }
  }
  return 4 * 1024 * 1024;
}

const MAX_BYTES = resolveResumeUploadMaxBytes();
const MAX_BYTES_LABEL = `${Math.round(MAX_BYTES / (1024 * 1024))}MB`;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    cb(null, allowedResumeUploadMime(file.mimetype, file.originalname));
  },
});

export const resumesRouter = Router();

function runUploadMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  upload.single("file")(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        fail(
          res,
          400,
          ErrorCodes.VALIDATION_ERROR,
          `Resume file too large (max ${MAX_BYTES_LABEL})`,
        );
        return;
      }
      fail(res, 400, ErrorCodes.VALIDATION_ERROR, err.message);
      return;
    }
    next(err);
  });
}

resumesRouter.post(
  "/upload",
  requireAuth,
  requireRoles("candidate"),
  runUploadMiddleware,
  asyncHandler(async (req, res) => {
    if (!env.blob.readWriteToken) {
      fail(
        res,
        503,
        ErrorCodes.SERVICE_UNAVAILABLE,
        "Resume uploads are not configured (set BLOB_READ_WRITE_TOKEN)",
      );
      return;
    }
    if (!req.file?.buffer?.length) {
      fail(
        res,
        400,
        ErrorCodes.VALIDATION_ERROR,
        "Missing or empty file (multipart field name: file). Allowed: PDF or plain text.",
      );
      return;
    }

    const userId = req.auth!.userId;
    const safe = sanitizeResumeFilename(req.file.originalname);
    const pathname = `resumes/${userId}/${Date.now()}-${safe}`;

    const blob = await put(pathname, req.file.buffer, {
      access: "public",
      token: env.blob.readWriteToken,
      contentType: req.file.mimetype || "application/octet-stream",
    });

    ok(res, 201, {
      resumeUrl: blob.url,
      pathname: blob.pathname,
      contentType: req.file.mimetype,
    });
  }),
);
