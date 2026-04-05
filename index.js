/**
 * Vercel entry: one function handles every path (no `api/` + rewrites).
 * Requires `npm run build` so `dist/` exists.
 */
module.exports = require("./dist/vercelApp.js").default;
