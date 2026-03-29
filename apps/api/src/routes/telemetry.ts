import { Router, type Request, type Response } from "express";
import { compareExperimentVariants, getTelemetrySession, listExperimentVariantSummaries, listTelemetrySessions } from "../services/telemetryStore.js";

const router = Router();

router.get("/sessions", (_request: Request, response: Response) => {
  response.json({
    sessions: listTelemetrySessions(),
  });
});

router.get("/sessions/:sessionId", (request: Request, response: Response) => {
  const sessionId = request.params.sessionId;
  if (!sessionId || Array.isArray(sessionId)) {
    response.status(400).json({ error: "A valid session id is required." });
    return;
  }

  const session = getTelemetrySession(sessionId);
  if (!session) {
    response.status(404).json({ error: "Telemetry session not found." });
    return;
  }

  response.json(session);
});

router.get("/variants", (_request: Request, response: Response) => {
  response.json({
    variants: listExperimentVariantSummaries(),
  });
});

router.get("/compare", (request: Request, response: Response) => {
  const left = typeof request.query.left === "string" ? request.query.left.trim() : "";
  const right = typeof request.query.right === "string" ? request.query.right.trim() : "";

  if (!left || !right) {
    response.status(400).json({
      error: "Both left and right experiment labels are required.",
    });
    return;
  }

  const comparison = compareExperimentVariants(left, right);
  if (!comparison) {
    response.status(404).json({
      error: "One or both experiment labels were not found in telemetry.",
    });
    return;
  }

  response.json(comparison);
});

export default router;
