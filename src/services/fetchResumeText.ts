import { get } from "@vercel/blob";
import { env } from "../config/env";
import { extractTextFromPdfBuffer } from "../resume/extractTextFromPdf";
import { isResumeStorageUrl } from "../resume/isResumeStorageUrl";

const DEFAULT_MAX_BYTES = 512 * 1024;
/** Per network phase (Blob SDK vs plain HTTP); PDF parse is not tied to this. */
const DEFAULT_TIMEOUT_MS = 45_000;
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

function bufHeadHex(buf: Uint8Array, max = 8): string {
  const n = Math.min(max, buf.length);
  if (n === 0) return "(empty)";
  let out = "";
  for (let i = 0; i < n; i++) {
    out += buf[i]!.toString(16).padStart(2, "0");
  }
  return out;
}

/** Blob SDK stream can differ from a plain HTTPS GET; retry once on hard PDF failures. */
function shouldRefetchResumeViaHttpAfterBlobFailure(error: string): boolean {
  return (
    error.includes("PDF text extraction failed") ||
    error === "Response is not a valid PDF"
  );
}

type ResumeUrlBytesOk = { ok: true; buf: Uint8Array; ct: string | null };
type ResumeUrlBytesErr = { ok: false; status: number };

/**
 * Plain HTTPS GET for a resume URL (no Bearer). Public Vercel Blob URLs work here even when
 * `get(..., { token })` returns 400 (e.g. `BLOB_READ_WRITE_TOKEN` is for a different store than
 * the hostname embedded in the URL — common across local vs production env files).
 */
async function fetchResumeUrlBytes(
  href: string,
  signal: AbortSignal,
  maxBytes: number,
  headers: Record<string, string>,
): Promise<ResumeUrlBytesOk | ResumeUrlBytesErr> {
  const res = await fetch(href, {
    method: "GET",
    redirect: "follow",
    signal,
    headers,
  });
  if (!res.ok) {
    return { ok: false, status: res.status };
  }
  const ctRaw = res.headers.get("content-type")?.split(";")[0]?.trim() ?? null;
  const ct = ctRaw?.toLowerCase() ?? null;
  const buf = await readBodyWithCap(res.body, maxBytes);
  return { ok: true, buf, ct };
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
 * Hirevine uploads use `access: "public"` URLs, but anonymous HTTP GET from
 * Inngest/workers can still fail; `@vercel/blob` `get()` sends the store token.
 */
async function tryFetchResumeBytesViaBlobSdk(
  resumeUrl: string,
  signal: AbortSignal,
  maxBytes: number,
): Promise<{ buf: Uint8Array; ct: string | null } | null> {
  const token = env.blob.readWriteToken;
  if (!token || !isResumeStorageUrl(resumeUrl)) {
    return null;
  }
  try {
    const result = await get(resumeUrl, {
      access: "public",
      token,
      abortSignal: signal,
      useCache: false,
    });
    if (!result || result.statusCode !== 200 || !result.stream) {
      return null;
    }
    const buf = await readBodyWithCap(result.stream, maxBytes);
    const raw =
      result.blob.contentType?.split(";")[0]?.trim() ??
      result.headers.get("content-type")?.split(";")[0]?.trim() ??
      null;
    return { buf, ct: raw ? raw.toLowerCase() : null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const hint400 = msg.includes("400")
      ? " [hint: BLOB_READ_WRITE_TOKEN store may not match this blob URL; anonymous GET is used first for public blobs]"
      : "";
    console.warn(
      `[fetchResumeText] @vercel/blob get() failed, will try plain HTTPS GET: ${msg}${hint400}`,
    );
    return null;
  }
}

async function resumeBytesToText(
  buf: Uint8Array,
  ct: string | null,
): Promise<FetchResumeTextResult> {
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
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      const peek = `bytes=${buf.length} pdf_magic=${looksLikePdfMagic(buf) ? "yes" : "no"} head_hex=${bufHeadHex(buf)}`;
      console.error(
        "[fetchResumeText] PDF text extraction failed:",
        peek,
        detail,
        e,
      );
      return {
        ok: false,
        error: `PDF text extraction failed (${peek}): ${detail || "(empty message)"}`,
      };
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

  try {
    // Separate controllers per phase so a timed-out signal is never reused.
    const acceptHeaders = {
      Accept:
        "text/plain,text/html,text/markdown,application/json,application/pdf,*/*",
    };
    const browserHeaders = {
      ...acceptHeaders,
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    };

    // 1) Hirevine-managed public blob URLs are readable without Bearer. Try this before
    //    @vercel/blob `get()` to avoid 400 when the env token belongs to another store.
    if (isResumeStorageUrl(resumeUrl) && url.protocol === "https:") {
      const anonController = new AbortController();
      const anonTimer = setTimeout(() => anonController.abort(), timeoutMs);
      try {
        const anon = await fetchResumeUrlBytes(
          url.href,
          anonController.signal,
          maxBytes,
          acceptHeaders,
        );
        if (anon.ok) {
          const parsed = await resumeBytesToText(anon.buf, anon.ct);
          if (parsed.ok) {
            return parsed;
          }
          if (!shouldRefetchResumeViaHttpAfterBlobFailure(parsed.error)) {
            return parsed;
          }
          console.warn(
            "[fetchResumeText] anonymous HTTPS body failed text extraction; will try Blob SDK then browser-like GET:",
            parsed.error,
          );
        }
      } finally {
        clearTimeout(anonTimer);
      }
    }

    const sdkController = new AbortController();
    const sdkTimer = setTimeout(() => sdkController.abort(), timeoutMs);
    let fromSdk: { buf: Uint8Array; ct: string | null } | null = null;
    try {
      fromSdk = await tryFetchResumeBytesViaBlobSdk(
        resumeUrl,
        sdkController.signal,
        maxBytes,
      );
    } finally {
      clearTimeout(sdkTimer);
    }
    if (fromSdk) {
      const fromBlob = await resumeBytesToText(fromSdk.buf, fromSdk.ct);
      if (fromBlob.ok) {
        return fromBlob;
      }
      if (!shouldRefetchResumeViaHttpAfterBlobFailure(fromBlob.error)) {
        return fromBlob;
      }
      console.warn(
        "[fetchResumeText] Blob SDK body failed text extraction; retrying same URL via HTTPS GET:",
        fromBlob.error,
      );
    }

    const httpController = new AbortController();
    const httpTimer = setTimeout(() => httpController.abort(), timeoutMs);
    try {
      const viaHttp = await fetchResumeUrlBytes(
        url.href,
        httpController.signal,
        maxBytes,
        browserHeaders,
      );
      if (!viaHttp.ok) {
        return {
          ok: false,
          error: `HTTP ${viaHttp.status} from resume URL`,
        };
      }
      return await resumeBytesToText(viaHttp.buf, viaHttp.ct);
    } finally {
      clearTimeout(httpTimer);
    }
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      return { ok: false, error: "Resume fetch timed out" };
    }
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Resume fetch failed",
    };
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
