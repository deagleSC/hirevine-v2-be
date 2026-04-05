import type { Express } from "express";
import { openApiSpec } from "./openapi";

const SWAGGER_UI_VERSION = "5.11.0";

/**
 * Swagger UI from CDN — Vercel does not serve `express.static` / swagger-ui-express assets
 * from node_modules, which otherwise yields a blank /api-docs page.
 */
function swaggerUiHtml(): string {
  const v = SWAGGER_UI_VERSION;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Hirevine API docs</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@${v}/swagger-ui.css" crossorigin />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@${v}/swagger-ui-bundle.js" crossorigin></script>
  <script src="https://unpkg.com/swagger-ui-dist@${v}/swagger-ui-standalone-preset.js" crossorigin></script>
  <script>
    window.onload = function () {
      window.ui = SwaggerUIBundle({
        url: "/openapi.json",
        dom_id: "#swagger-ui",
        presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
        layout: "StandaloneLayout",
        withCredentials: true,
        requestInterceptor: function (req) {
          req.credentials = "include";
          return req;
        },
      });
    };
  </script>
</body>
</html>`;
}

export function registerSwagger(app: Express): void {
  app.get("/openapi.json", (_req, res) => {
    res.json(openApiSpec);
  });

  app.get(["/api-docs", "/api-docs/"], (_req, res) => {
    res.type("html").send(swaggerUiHtml());
  });
}
