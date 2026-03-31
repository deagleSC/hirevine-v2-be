/**
 * Vercel serverless entry: runs the compiled Express app after ensuring MongoDB.
 * Requires `npm run build` so `dist/` exists (configured in vercel.json).
 */
const { createApp } = require("../dist/app");
const { connectDb } = require("../dist/db/connect");
require("../dist/models");

const expressApp = createApp();

let connectPromise = null;

function ensureDb() {
  if (!connectPromise) {
    connectPromise = connectDb().catch((err) => {
      connectPromise = null;
      throw err;
    });
  }
  return connectPromise;
}

module.exports = async (req, res) => {
  try {
    await ensureDb();
    expressApp(req, res);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      res.status(503).json({
        success: false,
        error: { code: "SERVICE_UNAVAILABLE", message: "Database unavailable" },
      });
    }
  }
};
