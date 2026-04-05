/**
 * Default export consumed by root `index.js` after `tsc` → `dist/vercelApp.js`.
 * Named `vercelApp` (not `index`) so Vercel does not treat this as a second auto-entry.
 */
import { createApp } from "./app";
import "./models";

const app = createApp();
export default app;
