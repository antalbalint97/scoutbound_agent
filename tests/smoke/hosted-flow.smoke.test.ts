import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import {
  demoRunSchema,
  persistedSessionDetailSchema,
  persistedSessionJsonExportSchema,
  persistedSessionListResponseSchema,
  persistedSessionPushResponseSchema,
  startRunResponseSchema,
} from "@revon-tinyfish/contracts";
import { DEMO_PRESETS } from "../../apps/web/src/demoPresets";
import { createApiApp } from "../../apps/api/src/app";
import { applyEnv, resetSmokeRunStore } from "./utils/orchestrationHarness";

const input = DEMO_PRESETS[0]?.input ?? {
  targetMarket: "Digital marketing",
  location: "London",
  companySize: "11-50",
  keywords: "B2B, SaaS, growth",
  decisionMakerRole: "Founder",
  maxResults: 3,
};

async function startServer(): Promise<{ server: Server; baseUrl: string }> {
  const { app } = createApiApp();

  const server = await new Promise<Server>((resolve) => {
    const listeningServer = app.listen(0, "127.0.0.1", () => resolve(listeningServer));
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to resolve smoke test server address.");
  }

  return {
    server,
    baseUrl: `http://127.0.0.1:${(address as AddressInfo).port}`,
  };
}

async function stopServer(server: Server | null): Promise<void> {
  if (!server) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function requestJson<T>(
  baseUrl: string,
  path: string,
  init?: RequestInit,
): Promise<{ status: number; data: T; headers: Headers }> {
  const response = await fetch(`${baseUrl}${path}`, init);
  const data = (await response.json()) as T;
  return {
    status: response.status,
    data,
    headers: response.headers,
  };
}

async function waitForRunCompletion(baseUrl: string, runId: string, timeoutMs: number = 5000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const response = await requestJson<unknown>(baseUrl, `/api/runs/${runId}`);
    const run = demoRunSchema.parse(response.data);
    if (run.status !== "running") {
      return run;
    }

    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error(`Timed out waiting for API run ${runId}.`);
}

async function waitForPersistedSession(
  baseUrl: string,
  sessionId: string,
  timeoutMs: number = 5000,
) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const response = await fetch(`${baseUrl}/api/sessions/${sessionId}`);
    if (response.status === 200) {
      return persistedSessionDetailSchema.parse(await response.json());
    }

    if (response.status !== 404) {
      throw new Error(`Unexpected status ${response.status} while loading persisted session.`);
    }

    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error(`Timed out waiting for persisted session ${sessionId}.`);
}

describe("hosted flow smoke", () => {
  let server: Server | null = null;

  beforeEach(() => {
    resetSmokeRunStore();
  });

  afterEach(async () => {
    await stopServer(server);
    server = null;
  });

  it("supports the hosted product slice flow end to end over HTTP", async () => {
    const restoreEnv = applyEnv({
      NODE_ENV: "test",
      WEB_ORIGIN: "http://127.0.0.1:5173",
      TINYFISH_API_KEY: undefined,
      TINYFISH_FORCE_MOCK: "false",
      TINYFISH_ENABLE_MOCK_FALLBACK: "true",
      REVON_IMPORT_URL: undefined,
      REVON_DRY_RUN: "true",
    });

    try {
      const started = await startServer();
      server = started.server;

      const createRunResponse = await requestJson<unknown>(started.baseUrl, "/api/runs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Correlation-Id": "corr-hosted-flow",
        },
        body: JSON.stringify({
          input,
          experimentLabel: "hosted_flow_smoke_variant",
        }),
      });

      expect(createRunResponse.status).toBe(202);
      expect(createRunResponse.headers.get("x-correlation-id")).toBe("corr-hosted-flow");

      const { runId } = startRunResponseSchema.parse(createRunResponse.data);
      const completedRun = await waitForRunCompletion(started.baseUrl, runId);
      const persistedSession = await waitForPersistedSession(started.baseUrl, runId);

      expect(persistedSession.id).toBe(runId);
      expect(persistedSession.telemetry).not.toBeNull();
      expect(persistedSession.lifecycleStatus).toBe("completed");
      expect(persistedSession.leads.length).toBeGreaterThan(0);
      expect(persistedSession.leads[0]?.evidence.length ?? 0).toBeGreaterThan(0);
      expect(persistedSession.leads[0]?.score.totalScore).toBeDefined();
      expect(persistedSession.leads[0]?.score.qualificationState).toBeDefined();
      expect(persistedSession.leads[0]?.revon.pushStatus).toBe("not_attempted");
      expect(persistedSession.leads[0]?.revonStatusLabel).toBe("Not attempted");
      expect(completedRun.summary.qualifiedLeadCount).toBe(persistedSession.summary.qualifiedLeadCount);

      const secondRunResponse = await requestJson<unknown>(started.baseUrl, "/api/runs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Correlation-Id": "corr-hosted-flow-2",
        },
        body: JSON.stringify({
          input: { ...input, maxResults: 2 },
          experimentLabel: "hosted_flow_smoke_variant",
        }),
      });
      const secondRunId = startRunResponseSchema.parse(secondRunResponse.data).runId;
      await waitForRunCompletion(started.baseUrl, secondRunId);
      await waitForPersistedSession(started.baseUrl, secondRunId);

      const sessionListResponse = await requestJson<unknown>(started.baseUrl, "/api/sessions?limit=1");
      const sessionList = persistedSessionListResponseSchema.parse(sessionListResponse.data);
      expect(sessionList.items).toHaveLength(1);
      expect(sessionList.sessions).toHaveLength(1);
      expect(sessionList.nextCursor).not.toBeNull();

      const pagedSessionListResponse = await requestJson<unknown>(
        started.baseUrl,
        `/api/sessions?limit=2&cursor=${encodeURIComponent(sessionList.nextCursor ?? "")}`,
      );
      const pagedSessionList = persistedSessionListResponseSchema.parse(pagedSessionListResponse.data);
      expect(pagedSessionList.items.some((session) => session.id === runId)).toBe(true);

      const qualifiedLeadIds = persistedSession.leads
        .filter((lead) => lead.score.qualificationState === "qualified")
        .map((lead) => lead.id);
      expect(qualifiedLeadIds.length).toBeGreaterThan(0);

      const jsonExportResponse = await fetch(
        `${started.baseUrl}/api/sessions/${runId}/export.json?leadIds=${encodeURIComponent(qualifiedLeadIds.join(","))}`,
      );
      expect(jsonExportResponse.status).toBe(200);
      expect(jsonExportResponse.headers.get("content-type")).toContain("application/json");
      const jsonExport = persistedSessionJsonExportSchema.parse(await jsonExportResponse.json());
      expect(jsonExport.export_version).toBe("v1");
      expect(jsonExport.export_schema).toBe("revon.discovery.session.export.v1");
      expect(jsonExport.session.id).toBe(runId);
      expect(jsonExport.session.telemetry).not.toBeNull();
      expect(jsonExport.leads.every((lead) => lead.evidence.length > 0)).toBe(true);
      expect(jsonExport.leads.every((lead) => typeof lead.score.totalScore === "number")).toBe(true);

      const jsonExportWithoutTelemetryResponse = await fetch(
        `${started.baseUrl}/api/sessions/${runId}/export.json?leadIds=${encodeURIComponent(qualifiedLeadIds.join(","))}&includeTelemetry=false`,
      );
      expect(jsonExportWithoutTelemetryResponse.status).toBe(200);
      const jsonExportWithoutTelemetry = persistedSessionJsonExportSchema.parse(
        await jsonExportWithoutTelemetryResponse.json(),
      );
      expect(jsonExportWithoutTelemetry.session.telemetry).toBeNull();

      const csvExportResponse = await fetch(
        `${started.baseUrl}/api/sessions/${runId}/export.csv?leadIds=${encodeURIComponent(qualifiedLeadIds.join(","))}`,
      );
      expect(csvExportResponse.status).toBe(200);
      expect(csvExportResponse.headers.get("content-type")).toContain("text/csv");
      const csvExportBytes = new Uint8Array(await csvExportResponse.arrayBuffer());
      expect(Array.from(csvExportBytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
      const csvExport = new TextDecoder("utf-8").decode(csvExportBytes);
      expect(csvExport).toContain("session_id,experiment_label,session_status");
      expect(csvExport).toContain("qualification_state");
      expect(csvExport).toContain("ranking_reasons_joined");
      expect(csvExport).toContain("evidence_count");
      expect(csvExport).toContain(runId);

      const emptyExportResponse = await fetch(
        `${started.baseUrl}/api/sessions/${runId}/export.csv?leadIds=`,
      );
      expect(emptyExportResponse.status).toBe(400);
      expect((await emptyExportResponse.json()) as { error: string }).toEqual({
        error: "No leads selected for export",
      });

      process.env.MAX_EXPORT_MB = "0.00001";
      const oversizedExportResponse = await fetch(
        `${started.baseUrl}/api/sessions/${runId}/export.json?leadIds=${encodeURIComponent(qualifiedLeadIds.join(","))}`,
      );
      expect(oversizedExportResponse.status).toBe(413);
      expect((await oversizedExportResponse.json()) as { error: string }).toEqual({
        error: "Export exceeds configured size limit",
      });
      delete process.env.MAX_EXPORT_MB;

      const pushResponse = await requestJson<unknown>(
        started.baseUrl,
        `/api/sessions/${runId}/push-to-revon`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ leadIds: qualifiedLeadIds }),
        },
      );

      expect(pushResponse.status).toBe(200);
      const pushPayload = persistedSessionPushResponseSchema.parse(pushResponse.data);
      expect(pushPayload.summary.attempted).toBe(qualifiedLeadIds.length);
      expect(pushPayload.summary.succeeded).toBe(qualifiedLeadIds.length);
      expect(pushPayload.summary.failed).toBe(0);
      expect(pushPayload.summary.dryRun).toBe(true);
      expect(pushPayload.session?.importStatus).toBe("completed");
      expect(pushPayload.session?.lifecycleStatus).toBe("pushed_complete");

      const refreshedSession = await waitForPersistedSession(started.baseUrl, runId);
      const pushedLeads = refreshedSession.leads.filter((lead) => qualifiedLeadIds.includes(lead.id));
      expect(pushedLeads.length).toBe(qualifiedLeadIds.length);
      expect(refreshedSession.lifecycleStatus).toBe("pushed_complete");
      expect(pushedLeads.every((lead) => lead.revon.pushStatus === "dry_run")).toBe(true);
      expect(pushedLeads.every((lead) => lead.revon.lastAttemptedAt !== null)).toBe(true);
      expect(pushedLeads.every((lead) => lead.revonStatusLabel === "Dry run")).toBe(true);
      expect(pushedLeads.every((lead) => lead.evidence.length > 0)).toBe(true);
      expect(
        pushedLeads.every(
          (lead) =>
            lead.score.qualificationState === "qualified" &&
            typeof lead.score.totalScore === "number",
        ),
      ).toBe(true);
    } finally {
      restoreEnv();
    }
  });
});
