import { createApp } from "./app";
import { env } from "./config/env";
import { connectDb } from "./db/connect";
import "./models";

async function main() {
  await connectDb();
  console.log("Database connected");
  const app = createApp();
  app.listen(env.port, () => {
    console.log(`Listening on PORT ${env.port}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
