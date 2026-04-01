import { Router, type Request, type Response } from "express";
import {
  icpInputSchema,
  pushRunRequestSchema,
  startRunRequestSchema,
  startRunResponseSchema,
} from "@revon-tinyfish/contracts";
import { buildIcpSignature, getCorrelationId, logApiTrace } from "../lib/debugTrace.js";
import { startDiscoveryRun } from "../orchestrators/discoveryRun.js";
import { pushQualifiedLeadsToRevon } from "../integrations/revon/client.js";
import { persistDiscoveryRun } from "../services/persistenceService.js";
import { getTelemetrySession } from "../services/telemetryStore.js";
import { getRun, updatePushState } from "../services/runStore.js";

const router = Router();

function resolveDefaultExperimentLabel(): string {
  const explicit = process.env.EXPERIMENT_LABEL?.trim();
  if (explicit) {
    return explicit;
  }

  const concurrency = Number.parseInt(process.env.TINYFISH_INSPECTION_CONCURRENCY ?? "2", 10);
  return [
    process.env.TINYFISH_DISCOVERY_PROMPT_VARIANT?.trim() || "discovery_prompt_v1",
    process.env.TINYFISH_INSPECTION_DEPTH_LABEL?.trim() || "inspect_depth_homepage_contact_about_team",
    `concurrency_${Number.isFinite(concurrency) && concurrency > 0 ? concurrency : 2}`,
    process.env.SCORER_VARIANT_LABEL?.trim() || "scorer_typescript_v1",
  ].join("__");
}

function parseStartRunPayload(body: unknown): {
  input: ReturnType<typeof icpInputSchema.parse>;
  experimentLabel: string;
  promptOverride: string;
} | null {
  const envelope = startRunRequestSchema.safeParse(body);
  if (envelope.success) {
    return {
      input: envelope.data.input,
      experimentLabel: envelope.data.experimentLabel ?? resolveDefaultExperimentLabel(),
      promptOverride: envelope.data.promptOverride,
    };
  }

  const legacy = icpInputSchema.safeParse(body);
  if (legacy.success) {
    return {
      input: legacy.data,
      experimentLabel: resolveDefaultExperimentLabel(),
      promptOverride: "",
    };
  }

  return null;
}

router.post("/", (request: Request, response: Response) => {
  const correlationId = getCorrelationId(request.header("x-correlation-id"));
  response.setHeader("X-Correlation-Id", correlationId);

  logApiTrace("POST /api/runs.received", {
    correlationId,
    invocationKey: correlationId,
    details: {
      method: request.method,
      path: request.originalUrl,
    },
  });

  const parsed = parseStartRunPayload(request.body);
  if (!parsed) {
    const envelope = startRunRequestSchema.safeParse(request.body);
    const legacy = icpInputSchema.safeParse(request.body);
    const errorSource = envelope.success ? legacy : envelope;
    const issues = errorSource.success
      ? []
      : errorSource.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        }));

    logApiTrace("POST /api/runs.invalid", {
      correlationId,
      invocationKey: correlationId,
      details: {
        contentType: request.header("content-type"),
        bodyKeys:
          request.body && typeof request.body === "object" && !Array.isArray(request.body)
            ? Object.keys(request.body)
            : [],
        issues,
      },
    });
    response.status(400).json({
      error: "Invalid run input.",
      issues: errorSource.success ? {} : errorSource.error.flatten(),
    });
    return;
  }

  const payloadSignature = buildIcpSignature(parsed.input, parsed.promptOverride);
  logApiTrace("POST /api/runs.valid", {
    correlationId,
    invocationKey: correlationId,
    details: {
      payloadSignature,
      experimentLabel: parsed.experimentLabel,
    },
  });

  const run = startDiscoveryRun(
    parsed.input,
    undefined,
    {
      correlationId,
      payloadSignature,
      experimentLabel: parsed.experimentLabel,
    },
    {
      promptOverride: parsed.promptOverride,
    },
  );
  logApiTrace("POST /api/runs.accepted", {
    correlationId,
    runId: run.id,
    invocationKey: correlationId,
    details: {
      payloadSignature,
      mode: run.mode,
      experimentLabel: run.experimentLabel,
    },
  });
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
    (lead) => requestedLeadIds.has(lead.id) && lead.score.qualificationState === "qualified",
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
    if (updatedRun) {
      try {
        await persistDiscoveryRun(updatedRun, getTelemetrySession(updatedRun.id) ?? null);
      } catch (persistError) {
        console.error(
          `[tinyfish-demo] failed to persist Revon push state for ${updatedRun.id}: ${
            persistError instanceof Error ? persistError.message : "Unknown persistence error."
          }`,
        );
      }
    }
    response.json(updatedRun);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Revon push failed.";
    const updatedRun = updatePushState(run.id, {
      status: "error",
      error: message,
      message: null,
    });
    if (updatedRun) {
      try {
        await persistDiscoveryRun(updatedRun, getTelemetrySession(updatedRun.id) ?? null);
      } catch (persistError) {
        console.error(
          `[tinyfish-demo] failed to persist Revon push error for ${updatedRun.id}: ${
            persistError instanceof Error ? persistError.message : "Unknown persistence error."
          }`,
        );
      }
    }
    response.status(502).json(updatedRun);
  }
});

export default router;
