/**
 * pdfjs (via `pdf-parse`) expects browser geometry globals. Node on Vercel serverless does not
 * define them; `pdf-parse` already depends on `@napi-rs/canvas`, which provides compatible
 * implementations. Install on `globalThis` before any `import("pdf-parse")`.
 *
 * @see https://github.com/mozilla/pdf.js/issues — DOMMatrix in Node
 */
import { DOMMatrix, DOMPoint, DOMRect } from "@napi-rs/canvas";

const g = globalThis as Record<string, unknown>;

if (typeof globalThis.DOMMatrix === "undefined") {
  g.DOMMatrix = DOMMatrix;
}
if (typeof globalThis.DOMPoint === "undefined") {
  g.DOMPoint = DOMPoint;
}
if (typeof globalThis.DOMRect === "undefined") {
  g.DOMRect = DOMRect;
}
