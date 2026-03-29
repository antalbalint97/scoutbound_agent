import {
  demoRunSchema,
  persistedSessionDetailSchema,
  persistedSessionListResponseSchema,
  persistedSessionPushResponseSchema,
  sessionTelemetrySchema,
  telemetryVariantListResponseSchema,
  revonAdapterStatusSchema,
  startRunRequestSchema,
  startRunResponseSchema,
  type DemoRun,
  type PersistedSessionDetail,
  type PersistedSessionPushResponse,
  type PersistedSessionSummary,
  type ExperimentVariantSummary,
  type RevonAdapterStatus,
  type SessionTelemetry,
  type StartRunRequest,
} from "@revon-tinyfish/contracts";
import { logWebTrace } from "./debugTrace";

function resolveApiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim();
  return configured ? configured.replace(/\/$/, "") : "";
}

const API_BASE_URL = resolveApiBaseUrl();

interface RequestTraceOptions {
  component: string;
  correlationId?: string;
  runId?: string;
  invocationKey?: string;
  details?: Record<string, unknown>;
}

async function requestRaw(path: string, init?: RequestInit): Promise<Response> {
  const mergedHeaders = new Headers(init?.headers);

  if (!mergedHeaders.has("Content-Type") && init?.body) {
    mergedHeaders.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: mergedHeaders,
  });

  if (!response.ok) {
    let message = `Request failed with HTTP ${response.status}.`;
    try {
      const data = (await response.json()) as { error?: string };
      if (data.error) {
        message = data.error;
      }
    } catch {
      // Ignore JSON parse failures.
    }
    throw new Error(message);
  }

  return response;
}

async function request<T>(path: string, init?: RequestInit, trace?: RequestTraceOptions): Promise<T> {
  if (trace) {
    logWebTrace(trace.component, {
      correlationId: trace.correlationId,
      runId: trace.runId,
      invocationKey: trace.invocationKey,
      details: {
        method: init?.method ?? "GET",
        path,
        ...trace.details,
      },
    });
  }

  const mergedHeaders = new Headers(init?.headers);

  if (!mergedHeaders.has("Content-Type") && init?.body) {
    mergedHeaders.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: mergedHeaders,
  });

  if (trace) {
    logWebTrace(`${trace.component}.response`, {
      correlationId: trace.correlationId,
      runId: trace.runId,
      invocationKey: trace.invocationKey,
      details: {
        path,
        status: response.status,
        ok: response.ok,
      },
    });
  }

  if (!response.ok) {
    let message = `Request failed with HTTP ${response.status}.`;
    try {
      const data = (await response.json()) as { error?: string };
      if (data.error) {
        message = data.error;
      }
    } catch {
      // Ignore JSON parse failures.
    }
    throw new Error(message);
  }

  return (await response.json()) as T;
}

export async function startRun(
  input: StartRunRequest,
  trace?: {
    correlationId: string;
    payloadSignature: string;
  },
): Promise<string> {
  const payload = startRunRequestSchema.parse(input);
  const data = await request<unknown>(
    "/api/runs",
    {
      method: "POST",
      ...(trace
        ? {
            headers: {
              "X-Correlation-Id": trace.correlationId,
            },
          }
        : {}),
      body: JSON.stringify(payload),
    },
    trace
      ? {
          component: "api.startRun",
          correlationId: trace.correlationId,
          invocationKey: trace.correlationId,
          details: {
            payloadSignature: trace.payloadSignature,
            experimentLabel: input.experimentLabel,
          },
        }
      : undefined,
  );

  const parsed = startRunResponseSchema.parse(data).runId;

  if (trace) {
    logWebTrace("api.startRun.parsedResponse", {
      correlationId: trace.correlationId,
      runId: parsed,
      invocationKey: trace.correlationId,
    });
  }

  return parsed;
}

export async function getRun(runId: string): Promise<DemoRun> {
  const data = await request<unknown>(`/api/runs/${runId}`);
  return demoRunSchema.parse(data);
}

export async function getTelemetrySession(sessionId: string): Promise<SessionTelemetry> {
  const data = await request<unknown>(`/api/telemetry/sessions/${sessionId}`);
  return sessionTelemetrySchema.parse(data);
}

export async function listSavedSessions(): Promise<PersistedSessionSummary[]> {
  const data = await request<unknown>("/api/sessions");
  const parsed = persistedSessionListResponseSchema.parse(data);
  return parsed.items;
}

export async function getSavedSession(sessionId: string): Promise<PersistedSessionDetail> {
  const data = await request<unknown>(`/api/sessions/${sessionId}`);
  return persistedSessionDetailSchema.parse(data);
}

export async function listTelemetryVariants(): Promise<ExperimentVariantSummary[]> {
  const data = await request<unknown>("/api/telemetry/variants");
  return telemetryVariantListResponseSchema.parse(data).variants;
}

function buildLeadIdsQuery(leadIds?: string[]): string {
  return leadIds !== undefined ? `?leadIds=${encodeURIComponent(leadIds.join(","))}` : "";
}

export async function downloadSavedSessionJsonExport(
  sessionId: string,
  leadIds?: string[],
): Promise<Blob> {
  const response = await requestRaw(
    `/api/sessions/${sessionId}/export.json${buildLeadIdsQuery(leadIds)}`,
  );
  return response.blob();
}

export async function downloadSavedSessionCsvExport(
  sessionId: string,
  leadIds?: string[],
): Promise<Blob> {
  const response = await requestRaw(
    `/api/sessions/${sessionId}/export.csv${buildLeadIdsQuery(leadIds)}`,
  );
  return response.blob();
}

export async function pushSavedSessionLeads(
  sessionId: string,
  leadIds?: string[],
): Promise<PersistedSessionPushResponse> {
  const data = await request<unknown>(`/api/sessions/${sessionId}/push-to-revon`, {
    method: "POST",
    body: JSON.stringify(leadIds !== undefined ? { leadIds } : {}),
  });

  return persistedSessionPushResponseSchema.parse(data);
}

export async function pushQualifiedLeads(runId: string, leadIds?: string[]): Promise<DemoRun> {
  const data = await request<unknown>(`/api/runs/${runId}/push`, {
    method: "POST",
    body: JSON.stringify(leadIds !== undefined ? { leadIds } : {}),
  });

  return demoRunSchema.parse(data);
}

export async function getRevonStatus(): Promise<RevonAdapterStatus> {
  const data = await request<unknown>("/api/revon/status");
  return revonAdapterStatusSchema.parse(data);
}
