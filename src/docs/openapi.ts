import type { OpenAPIV3 } from "openapi-types";

export const openApiSpec: OpenAPIV3.Document = {
  openapi: "3.0.3",
  info: {
    title: "Hirevine API",
    version: "0.1.0",
    description:
      'Hirevine hiring automation backend (Express + MongoDB). Responses: success `{ "success": true, "data": ... }`, error `{ "success": false, "error": { "code", "message" } }`. **Auth:** Login/Register set an HTTP-only cookie and return the same JWT as `accessToken` in the body. **Swagger:** Stay on one host only (`localhost` *or* `127.0.0.1`, not both). Use credentialed Try it out first; if `/me` is still 401, click **Authorize**, choose **Bearer**, paste `accessToken` from the login response. **Production on http://** (e.g. local): set `AUTH_COOKIE_SECURE=false` or the browser will drop the cookie.',
  },
  servers: [
    {
      url: "/",
      description: "This server (e.g. http://localhost:8000)",
    },
  ],
  tags: [
    { name: "System", description: "Health and metadata" },
    {
      name: "Auth",
      description:
        "Email/password; JWT in HTTP-only cookie and optional Bearer header (`Authorization: Bearer <accessToken>`)",
    },
  ],
  paths: {
    "/health": {
      get: {
        tags: ["System"],
        summary: "Health check",
        operationId: "getHealth",
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/HealthSuccess" },
              },
            },
          },
        },
      },
    },
    "/api": {
      get: {
        tags: ["System"],
        summary: "API metadata",
        operationId: "getApiMeta",
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ApiMetaSuccess" },
              },
            },
          },
        },
      },
    },
    "/api/auth/me": {
      get: {
        tags: ["Auth"],
        summary: "Current user",
        operationId: "authMe",
        description:
          "Cookie session (after Login/Register in this UI) or **Authorize → Bearer** with `accessToken` from login.",
        security: [{}, { bearerAuth: [] }],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AuthUserSuccess" },
              },
            },
          },
          "401": {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorEnvelope" },
              },
            },
          },
        },
      },
    },
    "/api/auth/register": {
      post: {
        tags: ["Auth"],
        summary: "Register",
        operationId: "authRegister",
        description:
          "Creates a user and sets the session cookie on this origin. Self-registration role: `recruiter` (default) or `candidate`. After success, **Current user** works in Try it out without pasting the cookie.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/RegisterRequest" },
            },
          },
        },
        responses: {
          "201": {
            description: "Created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AuthSessionSuccess" },
              },
            },
          },
          "400": {
            description: "Validation error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorEnvelope" },
              },
            },
          },
          "409": {
            description: "Email already registered",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorEnvelope" },
              },
            },
          },
        },
      },
    },
    "/api/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Login",
        operationId: "authLogin",
        description:
          "Sets the session cookie. Use this (or Register) before **Current user** in Try it out.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/LoginRequest" },
            },
          },
        },
        responses: {
          "200": {
            description: "OK; Set-Cookie session",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AuthSessionSuccess" },
              },
            },
          },
          "400": {
            description: "Validation error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorEnvelope" },
              },
            },
          },
          "401": {
            description: "Invalid credentials",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorEnvelope" },
              },
            },
          },
        },
      },
    },
    "/api/auth/logout": {
      post: {
        tags: ["Auth"],
        summary: "Logout",
        operationId: "authLogout",
        responses: {
          "200": {
            description: "Cookie cleared",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/EmptySuccess" },
              },
            },
          },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "Paste `accessToken` from POST /api/auth/login (or register) response body.",
      },
    },
    schemas: {
      HealthSuccess: {
        type: "object",
        properties: {
          success: { type: "boolean", enum: [true] },
          data: {
            type: "object",
            properties: { service: { type: "string" } },
            required: ["service"],
          },
        },
        required: ["success", "data"],
      },
      ApiMetaSuccess: {
        type: "object",
        properties: {
          success: { type: "boolean", enum: [true] },
          data: {
            type: "object",
            properties: {
              name: { type: "string" },
              version: { type: "string" },
            },
            required: ["name", "version"],
          },
        },
        required: ["success", "data"],
      },
      PublicUser: {
        type: "object",
        properties: {
          id: { type: "string" },
          email: { type: "string", format: "email" },
          role: {
            type: "string",
            enum: ["recruiter", "candidate", "admin"],
          },
          organizationId: {
            type: "string",
            nullable: true,
            description:
              "Employer org for recruiters; often null for marketplace candidates.",
          },
          createdAt: { type: "string", format: "date-time" },
        },
        required: ["id", "email", "role", "organizationId", "createdAt"],
      },
      AuthUserSuccess: {
        type: "object",
        properties: {
          success: { type: "boolean", enum: [true] },
          data: {
            type: "object",
            properties: {
              user: { $ref: "#/components/schemas/PublicUser" },
            },
            required: ["user"],
          },
        },
        required: ["success", "data"],
      },
      AuthSessionSuccess: {
        type: "object",
        properties: {
          success: { type: "boolean", enum: [true] },
          data: {
            type: "object",
            properties: {
              user: { $ref: "#/components/schemas/PublicUser" },
              accessToken: {
                type: "string",
                description: "Same JWT as the session cookie; use as Bearer if the cookie is not sent.",
              },
            },
            required: ["user", "accessToken"],
          },
        },
        required: ["success", "data"],
      },
      EmptySuccess: {
        type: "object",
        properties: {
          success: { type: "boolean", enum: [true] },
          data: { nullable: true },
        },
        required: ["success", "data"],
      },
      RegisterRequest: {
        type: "object",
        properties: {
          email: { type: "string", format: "email" },
          password: { type: "string", minLength: 8 },
          role: { type: "string", enum: ["recruiter", "candidate"] },
        },
        required: ["email", "password"],
      },
      LoginRequest: {
        type: "object",
        properties: {
          email: { type: "string" },
          password: { type: "string" },
        },
        required: ["email", "password"],
      },
      ErrorEnvelope: {
        type: "object",
        properties: {
          success: { type: "boolean", enum: [false] },
          error: {
            type: "object",
            properties: {
              code: { type: "string" },
              message: { type: "string" },
            },
            required: ["code", "message"],
          },
        },
        required: ["success", "error"],
      },
    },
  },
};
