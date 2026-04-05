import { serve } from "inngest/express";
import { inngest } from "./client";
import { inngestFunctions } from "./functions";

export const inngestServeHandler = serve({
  client: inngest,
  functions: [...inngestFunctions],
});
