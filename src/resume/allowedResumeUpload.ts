/** MIME + filename checks for multipart resume uploads (before Blob put). */
export function allowedResumeUploadMime(
  mimetype: string,
  originalname: string,
): boolean {
  const m = mimetype.toLowerCase().split(";")[0]!.trim();
  const lower = originalname.toLowerCase();
  const ext = lower.includes(".")
    ? lower.slice(lower.lastIndexOf(".") + 1)
    : "";

  if (m === "application/pdf" || m === "application/x-pdf") {
    return true;
  }
  if (m === "text/plain" || m === "text/markdown") {
    return true;
  }
  if (
    ext === "pdf" &&
    (m === "application/octet-stream" ||
      m === "binary/octet-stream" ||
      m === "")
  ) {
    return true;
  }
  return false;
}

export function sanitizeResumeFilename(originalname: string): string {
  const base = originalname
    .replace(/^.*[/\\]/, "")
    .replace(/[^\w.\-]+/g, "_")
    .slice(0, 120);
  return base.length ? base : "resume";
}
