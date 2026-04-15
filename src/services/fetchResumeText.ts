import { env } from "../config/env";
import { extractTextFromPdfBuffer } from "../resume/extractTextFromPdf";

const DEFAULT_MAX_BYTES = 512 * 1024;
const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_CHARS = 48_000;

function parseIpv4(host: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return null;
  const p = [m[1], m[2], m[3], m[4]].map((x) => Number(x));
  if (p.some((n) => n > 255)) return null;
  return p;
}

function isPrivateOrLoopbackIpv4(octets: number[]): boolean {
  const [a, b] = octets;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 0) return true;
  return false;
}

function isBlockedResumeUrl(url: URL): string | null {
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) {
    return "Blocked host (localhost)";
  }
  if (host === "[::1]" || host === "::1") {
    return "Blocked host (loopback IPv6)";
  }
  if (
    host === "metadata.google.internal" ||
    host === "169.254.169.254" ||
    host.startsWith("169.254.")
  ) {
    return "Blocked host (link-local / metadata)";
  }
  const v4 = parseIpv4(host);
  if (v4 && isPrivateOrLoopbackIpv4(v4)) {
    return "Blocked private/loopback IP literal";
  }
  const allowHttp = env.nodeEnv !== "production";
  if (url.protocol === "https:") return null;
  if (url.protocol === "http:" && allowHttp) return null;
  return "Only https URLs are allowed (http allowed in non-production)";
}

export type FetchResumeTextResult =
  | { ok: true; text: string; contentType: string | null; truncated: boolean }
  | { ok: false; error: string };

function looksLikePdfMagic(buf: Uint8Array): boolean {
  if (buf.length < 4) return false;
  return (
    buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46
  ); // %PDF
}

/** Plain .txt resumes sometimes come back as octet-stream from object storage. */
function tryDecodePlainResumeFromBinary(buf: Uint8Array): string | null {
  if (buf.length < 20 || looksLikePdfMagic(buf)) return null;
  const text = new TextDecoder("utf-8", { fatal: false }).decode(buf);
  const trimmed = text.replace(/\0/g, " ").trim();
  if (trimmed.length < 20) return null;
  const replacement = (trimmed.match(/\ufffd/g) ?? []).length;
  if (replacement > trimmed.length * 0.02) return null;
  const sample = trimmed.slice(0, 2000);
  let ctrl = 0;
  for (let i = 0; i < sample.length; i++) {
    const c = sample.charCodeAt(i);
    if (c < 32 && c !== 9 && c !== 10 && c !== 13) ctrl++;
  }
  if (ctrl > sample.length * 0.03) return null;
  return trimmed;
}

/**
 * Fetch resume from URL and extract plain text for LLM screening.
 * Supports textual types and PDF (text extraction via pdf-parse).
 */
export async function fetchResumeTextFromUrl(
  resumeUrl: string,
  options?: { maxBytes?: number; timeoutMs?: number },
): Promise<FetchResumeTextResult> {
  let url: URL;
  try {
    url = new URL(resumeUrl);
  } catch {
    return { ok: false, error: "Invalid resume URL" };
  }

  const blocked = isBlockedResumeUrl(url);
  if (blocked) {
    return { ok: false, error: blocked };
  }

  const maxBytes = options?.maxBytes ?? DEFAULT_MAX_BYTES;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url.href, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept:
          "text/plain,text/html,text/markdown,application/json,application/pdf,*/*",
        // Match a common browser UA so edge caches / WAFs behave like a normal download.
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      },
    });

    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status} from resume URL` };
    }

    const ctRaw =
      res.headers.get("content-type")?.split(";")[0]?.trim() ?? null;
    const ct = ctRaw?.toLowerCase() ?? null;
    const buf = await readBodyWithCap(res.body, maxBytes);

    // Prefer file signature over Content-Type: CDNs often serve PDFs as
    // application/octet-stream, application/download, or unknown types.
    const isPdf =
      looksLikePdfMagic(buf) ||
      ct === "application/pdf" ||
      ct === "application/x-pdf" ||
      (ct !== null && ct.includes("pdf"));

    if (isPdf) {
      if (!looksLikePdfMagic(buf)) {
        return { ok: false, error: "Response is not a valid PDF" };
      }
      try {
        let text = await extractTextFromPdfBuffer(buf);
        const truncated = text.length > MAX_CHARS;
        if (truncated) {
          text = text.slice(0, MAX_CHARS);
        }
        text = text.replace(/\0/g, " ").trim();
        if (!text.length) {
          return {
            ok: false,
            error:
              "PDF downloaded but no selectable text was found (common for scanned/image-only PDFs)",
          };
        }
        return {
          ok: true,
          text,
          contentType: ct ?? "application/pdf",
          truncated,
        };
      } catch {
        return { ok: false, error: "PDF text extraction failed" };
      }
    }

    const textual =
      !ct ||
      ct.startsWith("text/") ||
      ct === "application/json" ||
      ct === "application/xml";

    if (!textual) {
      const asPlain = tryDecodePlainResumeFromBinary(buf);
      if (asPlain) {
        let text = asPlain;
        const truncated = text.length > MAX_CHARS;
        if (truncated) {
          text = text.slice(0, MAX_CHARS);
        }
        return {
          ok: true,
          text,
          contentType: ct ?? "text/plain",
          truncated,
        };
      }
      return {
        ok: false,
        error: `Unsupported Content-Type for text extraction: ${ct ?? "unknown"}`,
      };
    }

    let text = new TextDecoder("utf-8", { fatal: false }).decode(buf);
    const truncated = text.length > MAX_CHARS;
    if (truncated) {
      text = text.slice(0, MAX_CHARS);
    }
    text = text.replace(/\0/g, " ").trim();
    if (!text.length) {
      return { ok: false, error: "Resume body was empty after decode" };
    }

    return { ok: true, text, contentType: ct, truncated };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      return { ok: false, error: "Resume fetch timed out" };
    }
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Resume fetch failed",
    };
  } finally {
    clearTimeout(timer);
  }
}

async function readBodyWithCap(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<Uint8Array> {
  if (!body) return new Uint8Array(0);
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value?.length) continue;
    const remaining = maxBytes - total;
    if (value.length <= remaining) {
      chunks.push(value);
      total += value.length;
    } else {
      chunks.push(value.slice(0, remaining));
      total = maxBytes;
      break;
    }
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}
