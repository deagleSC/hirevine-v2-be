import { Inngest } from "inngest";

const isProduction = process.env.NODE_ENV === "production";
const hasSigningKey = Boolean(process.env.INNGEST_SIGNING_KEY?.trim());

/**
 * Without this, the SDK defaults to "cloud" mode and `/api/inngest` returns 500
 * (`internal_server_error`) when `INNGEST_SIGNING_KEY` is unset — including local `npm run dev`.
 * Production (e.g. Vercel) must set `INNGEST_SIGNING_KEY` from the Inngest dashboard.
 */
export const inngest = new Inngest({
  id: "hirevine",
  name: "Hirevine",
  ...(!isProduction && !hasSigningKey ? { isDev: true as const } : {}),
});
