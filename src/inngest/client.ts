import { Inngest } from "inngest";

const isProduction = process.env.NODE_ENV === "production";
const hasSigningKey = Boolean(process.env.INNGEST_SIGNING_KEY?.trim());

/**
 * `INNGEST_DEV` is the official switch (see Inngest JS SDK `mode`):
 * - `1` / `true` → local dev server (`npm run inngest:dev`), even with prod `NODE_ENV` + signing key.
 * - `0` / `false` → stay on cloud when keys are set (e.g. test cloud from a laptop).
 * - `http://127.0.0.1:8288` (or any URL) → dev server at that URL.
 *
 * Without signing key + non-production `NODE_ENV`, we default to dev so plain `npm run dev`
 * works. **If you load `.env.production` on localhost** (keys + `NODE_ENV=production`), you must
 * set `INNGEST_DEV=1` (or the URL) or `/api/inngest` reports `mode: "cloud"` and `inngest dev`
 * will not drive your app the way you expect.
 */
function readInngestDevPreference(): boolean | undefined {
  const raw = process.env.INNGEST_DEV?.trim();
  if (!raw) return undefined;
  const v = raw.toLowerCase();
  if (v === "1" || v === "true") return true;
  if (v === "0" || v === "false") return false;
  if (raw.includes("://")) return true;
  return undefined;
}

const inngestDevPreference = readInngestDevPreference();
const preferInngestDevServer =
  inngestDevPreference === true ||
  (inngestDevPreference !== false && !isProduction && !hasSigningKey);

export const inngest = new Inngest({
  id: "hirevine",
  name: "Hirevine",
  ...(preferInngestDevServer ? { isDev: true as const } : {}),
});
