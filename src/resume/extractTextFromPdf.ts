import "../polyfills/installPdfDomPolyfills";
import "../polyfills/installPdfWorker";
import { PDFParse } from "pdf-parse";
import type { TextResult } from "pdf-parse";

function textFromPdfParseResult(result: TextResult): string {
  let text = (result.text ?? "").trim();
  if (text.length > 0) return text;
  if (!result.pages?.length) return "";
  return result.pages
    .map((p) => p.text?.trim() ?? "")
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

async function safeDestroyParser(parser: PDFParse): Promise<void> {
  try {
    await parser.destroy();
  } catch (e) {
    console.warn(
      "[extractTextFromPdfBuffer] parser.destroy() failed (ignored):",
      e instanceof Error ? e.message : e,
    );
  }
}

/**
 * Extract plain text from a PDF buffer for resume screening.
 * Clones bytes before parsing: pdfjs transfers the backing ArrayBuffer to a
 * worker/fake-worker channel; reusing the caller's view can leave it empty.
 *
 * `parser.destroy()` must not throw after a successful `getText()`: a
 * throwing `finally` (or destroy after return) would discard the extracted
 * text and surface as generic "PDF text extraction failed" with empty resume
 * for the LLM.
 */
export async function extractTextFromPdfBuffer(
  buf: Uint8Array,
): Promise<string> {
  const data = new Uint8Array(buf.byteLength);
  data.set(buf);

  const parser = new PDFParse({ data });
  try {
    const result = await parser.getText();
    const text = textFromPdfParseResult(result);
    await safeDestroyParser(parser);
    return text;
  } catch (e) {
    await safeDestroyParser(parser);
    throw e;
  }
}
