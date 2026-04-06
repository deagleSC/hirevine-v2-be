import mongoose from "mongoose";
import { env } from "../config/env";

export async function connectDb(): Promise<void> {
  if (mongoose.connection.readyState === 1) return;
  mongoose.set("strictQuery", true);
  await mongoose.connect(env.mongodbUri);
}

let connectPromise: Promise<void> | null = null;

/** Reuses one in-flight connect; clears on failure so the next call can retry (serverless-friendly). */
export function ensureDb(): Promise<void> {
  if (!connectPromise) {
    connectPromise = connectDb().catch((err) => {
      connectPromise = null;
      throw err;
    });
  }
  return connectPromise;
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
  connectPromise = null;
}
