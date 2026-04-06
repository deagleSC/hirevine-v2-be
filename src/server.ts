import express from "express";
import { createApp } from "./app";
import { env } from "./config/env";
import { ensureDb } from "./db/connect";
import "./models";

const api = createApp();
const app = express();

app.use((_req, res, next) => {
  ensureDb()
    .then(() => next())
    .catch((err) => {
      console.error(err);
      if (!res.headersSent) {
        res.status(503).json({
          success: false,
          error: {
            code: "SERVICE_UNAVAILABLE",
            message: "Database unavailable",
          },
        });
      }
    });
});

app.use(api);

async function main() {
  await ensureDb();
  console.log("Database connected");
  app.listen(env.port, () => {
    console.log(`Listening on PORT ${env.port}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
