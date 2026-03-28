import { Router, type Request, type Response } from "express";
import { icpInputSchema, pushRunRequestSchema, startRunResponseSchema } from "@revon-tinyfish/contracts";
import { startDiscoveryRun } from "../orchestrators/discoveryRun.js";
import { pushQualifiedLeadsToRevon } from "../integrations/revon/client.js";
import { getRun, updatePushState } from "../services/runStore.js";

const router = Router();

router.post("/", (request: Request, response: Response) => {
  const parsed = icpInputSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({
      error: "Invalid run input.",
      issues: parsed.error.flatten(),
    });
    return;
  }

  const run = startDiscoveryRun(parsed.data);
  response.status(202).json(startRunResponseSchema.parse({ runId: run.id }));
});

router.get("/:runId", (request: Request, response: Response) => {
  const runId = request.params.runId;
  if (!runId || Array.isArray(runId)) {
    response.status(400).json({ error: "A valid run id is required." });
    return;
  }

  const run = getRun(runId);
  if (!run) {
    response.status(404).json({ error: "Run not found." });
    return;
  }

  response.json(run);
});

router.post("/:runId/push", async (request: Request, response: Response) => {
  const runId = request.params.runId;
  if (!runId || Array.isArray(runId)) {
    response.status(400).json({ error: "A valid run id is required." });
    return;
  }

  const run = getRun(runId);
  if (!run) {
    response.status(404).json({ error: "Run not found." });
    return;
  }

  if (run.status !== "completed" && run.status !== "partial") {
    response.status(409).json({ error: "Run must be completed or partial before pushing to Revon." });
    return;
  }

  const parsed = pushRunRequestSchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    response.status(400).json({
      error: "Invalid push payload.",
      issues: parsed.error.flatten(),
    });
    return;
  }

  const requestedLeadIds = new Set(parsed.data.leadIds ?? run.leads.map((lead) => lead.id));
  const leadsToPush = run.leads.filter(
    (lead) => requestedLeadIds.has(lead.id) && lead.score.priority !== "low",
  );

  if (leadsToPush.length === 0) {
    response.status(400).json({ error: "No qualified leads were selected for push." });
    return;
  }

  updatePushState(run.id, {
    status: "running",
    error: null,
    message: null,
  });

  try {
    const result = await pushQualifiedLeadsToRevon(run.id, leadsToPush);
    const updatedRun = updatePushState(run.id, {
      status: "completed",
      dryRun: result.dryRun,
      destination: result.destination,
      pushedCompanyCount: result.pushedCompanyCount,
      pushedContactCount: result.pushedContactCount,
      requestId: result.requestId ?? null,
      message: result.message ?? null,
      pushedAt: new Date().toISOString(),
      error: null,
    });
    response.json(updatedRun);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Revon push failed.";
    const updatedRun = updatePushState(run.id, {
      status: "error",
      error: message,
      message: null,
    });
    response.status(502).json(updatedRun);
  }
});

export default router;
