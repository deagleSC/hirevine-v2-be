/**
 * pdf.js "fake worker" in Node uses `import(workerSrc)` where `workerSrc` defaults to a relative
 * `./pdf.worker.mjs`. That resolves incorrectly under Vercel's bundler and the worker file may be
 * omitted from the serverless trace — both cause "Cannot find module ... pdf.worker.mjs".
 *
 * Point `GlobalWorkerOptions.workerSrc` at the real file under `node_modules/pdf-parse` using a
 * `file:` URL. Pair with `vercel.json` `includeFiles` for `pdf-parse/dist/**`.
 */
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { PDFParse } from "pdf-parse";

const nodeRequire = createRequire(join(process.cwd(), "package.json"));

try {
  const pkgDir = dirname(nodeRequire.resolve("pdf-parse/package.json"));
  const workerAbs = join(pkgDir, "dist/pdf-parse/cjs/pdf.worker.mjs");
  PDFParse.setWorker(pathToFileURL(workerAbs).href);
} catch (e) {
  console.warn(
    "[installPdfWorker] could not set pdf.worker path (pdf text may fail):",
    e instanceof Error ? e.message : e,
  );
}
