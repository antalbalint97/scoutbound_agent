import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import dotenv from "dotenv";
import express, { type Request } from "express";
import revonRouter from "./routes/revon.js";
import runsRouter from "./routes/runs.js";
import sessionsRouter from "./routes/sessions.js";
import telemetryRouter from "./routes/telemetry.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootEnvPath = path.resolve(__dirname, "../../../.env");
const apiEnvPath = path.resolve(__dirname, "../../.env");
const localDevOrigins = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
]);

export function loadEnvironment(): void {
  dotenv.config({
    path: rootEnvPath,
  });
  dotenv.config({
    path: apiEnvPath,
  });
}

function isAllowedOrigin(
  request: Request,
  originHeader: string | undefined,
  isProduction: boolean,
  configuredOriginSet: Set<string>,
): boolean {
  if (!originHeader) {
    return true;
  }

  const requestHost = request.get("host");
  const requestOrigin = requestHost ? `${request.protocol}://${requestHost}` : null;
  if (requestOrigin && originHeader === requestOrigin) {
    return true;
  }

  if (configuredOriginSet.has(originHeader)) {
    return true;
  }

  if (!isProduction && localDevOrigins.has(originHeader)) {
    return true;
  }

  return false;
}

export function createApiApp() {
  const isProduction = (process.env.NODE_ENV ?? "development") === "production";
  const configuredOrigins = (process.env.WEB_ORIGIN ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const configuredOriginSet = new Set(configuredOrigins);

  const app = express();

  app.use(
    cors((request, callback) => {
      callback(null, {
        origin: isAllowedOrigin(
          request,
          request.header("Origin") ?? undefined,
          isProduction,
          configuredOriginSet,
        ),
        optionsSuccessStatus: 204,
      });
    }),
  );
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_request, response) => {
    response.json({
      ok: true,
      service: "revon-tinyfish-demo-api",
      now: new Date().toISOString(),
    });
  });

  app.use("/api/runs", runsRouter);
  app.use("/api/sessions", sessionsRouter);
  app.use("/api/revon", revonRouter);
  app.use("/api/telemetry", telemetryRouter);

  return {
    app,
    configuredOrigins,
    isProduction,
  };
}
