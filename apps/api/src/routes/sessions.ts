import { Router, type Request, type Response } from "express";
import { pushRunRequestSchema, type PersistedLeadRevonState } from "@revon-tinyfish/contracts";
import { pushQualifiedLeadsToRevon } from "../integrations/revon/client.js";
import {
  buildPersistedSessionCsvExport,
  buildPersistedSessionJsonExport,
  getPersistedSession,
  isExportPayloadTooLarge,
  listPersistedSessions,
  serializePersistedSessionJsonExport,
  updatePersistedLeadRevonStates,
  updatePersistedImportState,
} from "../services/persistenceService.js";

const router = Router();

function parseLeadIdsQuery(request: Request): string[] | undefined {
  return typeof request.query.leadIds === "string"
    ? request.query.leadIds
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    : undefined;
}

function parseIncludeTelemetryQuery(request: Request): boolean {
  return String(request.query.includeTelemetry ?? "true").toLowerCase() !== "false";
}

async function handlePushToRevon(request: Request, response: Response) {
  const sessionId = request.params.sessionId;
  if (!sessionId || Array.isArray(sessionId)) {
    response.status(400).json({ error: "A valid session id is required." });
    return;
  }

  const session = await getPersistedSession(sessionId);
  if (!session) {
    response.status(404).json({ error: "Persisted session not found." });
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

  const requestedLeadIds = new Set(parsed.data.leadIds ?? session.leads.map((lead) => lead.id));
  const leadsToPush = session.leads.filter(
    (lead) => requestedLeadIds.has(lead.id) && lead.score.qualificationState === "qualified",
  );

  if (leadsToPush.length === 0) {
    response.status(400).json({ error: "No qualified leads were selected for push." });
    return;
  }

  const attemptedAt = new Date().toISOString();
  const pendingLeadStateUpdates = leadsToPush.map((lead) => ({
    leadId: lead.id,
    state: {
      importedToRevon: lead.revon.importedToRevon,
      pushStatus: "pending" as const,
      lastAttemptedAt: attemptedAt,
      lastSucceededAt: lead.revon.lastSucceededAt,
      requestId: null,
      error: lead.revon.error,
    },
  }));

  await updatePersistedLeadRevonStates(sessionId, pendingLeadStateUpdates);
  await updatePersistedImportState(sessionId, {
    status: "running",
    error: null,
    message: null,
  });

  try {
    const result = await pushQualifiedLeadsToRevon(sessionId, leadsToPush);
    const leadStateUpdates = leadsToPush.map((lead) => {
      const nextState: PersistedLeadRevonState = {
        importedToRevon: result.dryRun ? false : true,
        pushStatus: result.dryRun ? "dry_run" : "succeeded",
        lastAttemptedAt: attemptedAt,
        lastSucceededAt: result.dryRun ? lead.revon.lastSucceededAt : attemptedAt,
        requestId: result.requestId ?? null,
        error: lead.revon.error,
      };

      return {
        leadId: lead.id,
        state: nextState,
      };
    });

    await updatePersistedLeadRevonStates(sessionId, leadStateUpdates);
    await updatePersistedImportState(sessionId, {
      status: "completed",
      dryRun: result.dryRun,
      destination: result.destination,
      requestId: result.requestId ?? null,
      message: result.message ?? null,
      error: null,
      pushedAt: attemptedAt,
    });

    const updated = await getPersistedSession(sessionId);
    response.json({
      summary: {
        attempted: leadsToPush.length,
        succeeded: leadsToPush.length,
        failed: 0,
        dryRun: result.dryRun,
        destination: result.destination,
        requestId: result.requestId ?? null,
        message: result.message ?? null,
      },
      session: updated,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Revon push failed.";
    const leadStateUpdates = leadsToPush.map((lead) => ({
      leadId: lead.id,
      state: {
        importedToRevon: lead.revon.importedToRevon,
        pushStatus: "failed" as const,
        lastAttemptedAt: attemptedAt,
        lastSucceededAt: lead.revon.lastSucceededAt,
        requestId: null,
        error: message,
      },
    }));

    await updatePersistedLeadRevonStates(sessionId, leadStateUpdates);
    await updatePersistedImportState(sessionId, {
      status: "error",
      dryRun: false,
      destination: process.env.REVON_IMPORT_URL?.trim() || "not-configured",
      requestId: null,
      error: message,
      message: null,
      pushedAt: attemptedAt,
    });

    const updated = await getPersistedSession(sessionId);
    response.json({
      summary: {
        attempted: leadsToPush.length,
        succeeded: 0,
        failed: leadsToPush.length,
        dryRun: false,
        destination: process.env.REVON_IMPORT_URL?.trim() || "not-configured",
        requestId: null,
        message,
      },
      session: updated,
    });
  }
}

router.get("/", async (request: Request, response: Response) => {
  const limit = Number.parseInt(String(request.query.limit ?? "25"), 10);
  const cursor =
    typeof request.query.cursor === "string" && request.query.cursor.trim().length > 0
      ? request.query.cursor.trim()
      : undefined;
  const page = await listPersistedSessions(limit, cursor);
  response.json({
    items: page.items,
    nextCursor: page.nextCursor,
    sessions: page.items,
  });
});

router.get("/:sessionId", async (request: Request, response: Response) => {
  const sessionId = request.params.sessionId;
  if (!sessionId || Array.isArray(sessionId)) {
    response.status(400).json({ error: "A valid session id is required." });
    return;
  }

  const session = await getPersistedSession(sessionId);
  if (!session) {
    response.status(404).json({ error: "Persisted session not found." });
    return;
  }

  response.json(session);
});

router.get("/:sessionId/export.json", async (request: Request, response: Response) => {
  const sessionId = request.params.sessionId;
  if (!sessionId || Array.isArray(sessionId)) {
    response.status(400).json({ error: "A valid session id is required." });
    return;
  }

  const payload = await buildPersistedSessionJsonExport(sessionId, parseLeadIdsQuery(request), {
    includeTelemetry: parseIncludeTelemetryQuery(request),
  });
  if (!payload) {
    response.status(404).json({ error: "Persisted session not found." });
    return;
  }

  if (payload.leads.length === 0) {
    response.status(400).json({ error: "No leads selected for export" });
    return;
  }

  const content = serializePersistedSessionJsonExport(payload);
  if (isExportPayloadTooLarge(content)) {
    response.status(413).json({ error: "Export exceeds configured size limit" });
    return;
  }

  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Content-Disposition", `attachment; filename="${sessionId}-export.json"`);
  response.send(content);
});

router.get("/:sessionId/export.csv", async (request: Request, response: Response) => {
  const sessionId = request.params.sessionId;
  if (!sessionId || Array.isArray(sessionId)) {
    response.status(400).json({ error: "A valid session id is required." });
    return;
  }

  const jsonSelection = await buildPersistedSessionJsonExport(sessionId, parseLeadIdsQuery(request), {
    includeTelemetry: false,
  });
  if (!jsonSelection) {
    response.status(404).json({ error: "Persisted session not found." });
    return;
  }

  if (jsonSelection.leads.length === 0) {
    response.status(400).json({ error: "No leads selected for export" });
    return;
  }

  const payload = await buildPersistedSessionCsvExport(sessionId, parseLeadIdsQuery(request));
  if (!payload) {
    response.status(404).json({ error: "Persisted session not found." });
    return;
  }

  if (isExportPayloadTooLarge(payload.content)) {
    response.status(413).json({ error: "Export exceeds configured size limit" });
    return;
  }

  response.setHeader("Content-Type", "text/csv; charset=utf-8");
  response.setHeader("Content-Disposition", `attachment; filename="${payload.filename}"`);
  response.send(payload.content);
});

router.get("/:sessionId/export", async (request: Request, response: Response) => {
  const sessionId = request.params.sessionId;
  if (!sessionId || Array.isArray(sessionId)) {
    response.status(400).json({ error: "A valid session id is required." });
    return;
  }

  const payload = await buildPersistedSessionJsonExport(sessionId, parseLeadIdsQuery(request), {
    includeTelemetry: parseIncludeTelemetryQuery(request),
  });
  if (!payload) {
    response.status(404).json({ error: "Persisted session not found." });
    return;
  }

  if (payload.leads.length === 0) {
    response.status(400).json({ error: "No leads selected for export" });
    return;
  }

  const content = serializePersistedSessionJsonExport(payload);
  if (isExportPayloadTooLarge(content)) {
    response.status(413).json({ error: "Export exceeds configured size limit" });
    return;
  }

  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.send(content);
});

router.post("/:sessionId/push", handlePushToRevon);
router.post("/:sessionId/push-to-revon", handlePushToRevon);

export default router;
