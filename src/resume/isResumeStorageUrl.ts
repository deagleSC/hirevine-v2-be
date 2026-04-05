import { env } from "../config/env";

const DEFAULT_BLOB_SUFFIX = ".public.blob.vercel-storage.com";

/**
 * True if `resumeUrl` is an HTTPS URL we treat as Hirevine-managed storage
 * (Vercel Blob public URL or optional custom host).
 */
export function isResumeStorageUrl(resumeUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(resumeUrl);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") {
    return false;
  }
  const host = url.hostname.toLowerCase();
  if (host.endsWith(DEFAULT_BLOB_SUFFIX)) {
    return true;
  }
  const custom = env.blob.publicHost;
  if (custom && host === custom) {
    return true;
  }
  return false;
}
