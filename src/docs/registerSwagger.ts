import type { Express } from "express";
import swaggerUi from "swagger-ui-express";
import { openApiSpec } from "./openapi";

export function registerSwagger(app: Express): void {
  app.get("/openapi.json", (_req, res) => {
    res.json(openApiSpec);
  });

  app.use(
    "/api-docs",
    swaggerUi.serve,
    swaggerUi.setup(openApiSpec, {
      customSiteTitle: "Hirevine API docs",
      explorer: true,
      swaggerOptions: {
        // Send cookies on Try it out (needed after POST /api/auth/login or register).
        withCredentials: true,
        // Ensures fetch uses credentialed mode (covers cross-origin API vs docs host).
        requestInterceptor: (request: { credentials?: string }) => {
          request.credentials = "include";
          return request;
        },
      },
    }),
  );
}
