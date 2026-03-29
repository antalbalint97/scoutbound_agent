import { logApiTrace, type DiscoveryTraceContext } from "../../lib/debugTrace.js";

const DEFAULT_TINYFISH_SSE_URL = "https://agent.tinyfish.ai/v1/automation/run-sse";
const DEFAULT_TINYFISH_ASYNC_URL = "https://agent.tinyfish.ai/v1/automation/run-async";
const DEFAULT_TINYFISH_RUNS_BATCH_URL = "https://agent.tinyfish.ai/v1/runs/batch";
const DEFAULT_TINYFISH_TIMEOUT_MS = 180_000;

interface TinyFishStreamEvent {
  type: string;
  run_id?: string;
  streaming_url?: string;
  purpose?: string;
  status?: string;
  result?: unknown;
  resultJson?: unknown;
  error?: string | null;
}

interface TinyFishAsyncRunResponse {
  run_id?: string | null;
  error?: unknown;
}

interface TinyFishRunResponse {
  run_id?: string;
  status?: string;
  result?: unknown;
  error?: unknown;
  credit_usage?: unknown;
  creditUsage?: unknown;
  usage?: unknown;
  metadata?: unknown;
  created_at?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  streaming_url?: string | null;
}

interface TinyFishBatchRunsResponse {
  data?: TinyFishRunResponse[];
  not_found?: string[] | null;
}

export type TinyFishAsyncRunStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface RunTinyFishAutomationInput {
  apiKey: string;
  url: string;
  goal: string;
  timeoutMs?: number;
  trace?: DiscoveryTraceContext | undefined;
}

export interface StartTinyFishAutomationAsyncInput {
  apiKey: string;
  url: string;
  goal: string;
  trace?: DiscoveryTraceContext | undefined;
}

export interface TinyFishAsyncRunHandle {
  runId: string;
}

export interface TinyFishRunSnapshot {
  runId: string;
  status: TinyFishAsyncRunStatus;
  rawStatus: string;
  result: unknown;
  error: string | null;
  creditUsage: number | null;
  createdAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  streamingUrl: string | null;
}

export interface TinyFishBatchRunSnapshotResult {
  runs: TinyFishRunSnapshot[];
  notFound: string[];
}

function buildTinyFishInvocationKey(
  trace: DiscoveryTraceContext | undefined,
  suffix: string,
  target: string,
): string {
  return `${trace?.runId ?? trace?.correlationId ?? target}|${suffix}|${target}`;
}

function extractEventPayload(eventBlock: string): string | null {
  const dataLines = eventBlock
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart());

  if (dataLines.length === 0) {
    return null;
  }

  return dataLines.join("\n").trim();
}

function summarizeTinyFishError(event: TinyFishStreamEvent): string {
  if (typeof event.error === "string" && event.error.trim()) {
    return event.error.trim();
  }

  return `TinyFish failed with status ${event.status ?? event.type ?? "UNKNOWN"}.`;
}

function extractTinyFishErrorMessage(value: unknown): string | null {
  if (!value) {
    return null;
  }

  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (typeof value === "object") {
    const objectValue = value as Record<string, unknown>;
    const message =
      objectValue.message ??
      objectValue.error ??
      objectValue.detail ??
      objectValue.code;

    if (typeof message === "string" && message.trim()) {
      return message.trim();
    }
  }

  return null;
}

function normalizeTinyFishRunStatus(status: unknown): TinyFishAsyncRunStatus {
  const normalized = typeof status === "string" ? status.trim().toUpperCase() : "RUNNING";

  if (normalized === "COMPLETED") {
    return "completed";
  }
  if (normalized === "FAILED" || normalized === "ERROR") {
    return "failed";
  }
  if (normalized === "CANCELLED" || normalized === "CANCELED") {
    return "cancelled";
  }
  if (normalized === "QUEUED" || normalized === "PENDING" || normalized === "STARTED") {
    return "queued";
  }
  return "running";
}

function createJsonHeaders(apiKey: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    "X-API-Key": apiKey,
  };
}

function extractNumeric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function extractCreditUsage(value: TinyFishRunResponse): number | null {
  const direct = extractNumeric(value.credit_usage ?? value.creditUsage);
  if (direct !== null) {
    return direct;
  }

  if (value.usage && typeof value.usage === "object") {
    const usageObject = value.usage as Record<string, unknown>;
    const usageValue =
      extractNumeric(usageObject.credit_usage) ??
      extractNumeric(usageObject.credits_used) ??
      extractNumeric(usageObject.total_credits);
    if (usageValue !== null) {
      return usageValue;
    }
  }

  if (value.metadata && typeof value.metadata === "object") {
    const metadataObject = value.metadata as Record<string, unknown>;
    const metadataValue =
      extractNumeric(metadataObject.credit_usage) ??
      extractNumeric(metadataObject.credits_used) ??
      extractNumeric(metadataObject.total_credits);
    if (metadataValue !== null) {
      return metadataValue;
    }
  }

  return null;
}

async function readTinyFishStream(
  response: Response,
  timeoutMs: number,
  requestUrl: string,
  trace?: DiscoveryTraceContext,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const reader = response.body?.getReader();
    if (!reader) {
      reject(new Error("TinyFish response body is not readable."));
      return;
    }

    let settled = false;
    let buffer = "";
    let tinyfishRunId: string | undefined;
    let streamingUrl: string | undefined;
    let hasLoggedFirstEvent = false;
    let lastProgressPurpose: string | undefined;

    const decoder = new TextDecoder();

    const settle = (callback: () => void): void => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);
      void reader.cancel().catch(() => undefined);
      callback();
    };

    const fail = (message: string): void => {
      logApiTrace("tinyfish.client.stream.fail", {
        correlationId: trace?.correlationId,
        runId: trace?.runId,
        invocationKey: buildTinyFishInvocationKey(trace, "stream-fail", requestUrl),
        details: {
          targetUrl: requestUrl,
          tinyfishRunId,
          message,
        },
      });
      settle(() => reject(new Error(message)));
    };

    const timer = setTimeout(() => {
      fail(`TinyFish timed out after ${timeoutMs}ms.`);
    }, timeoutMs);

    logApiTrace("tinyfish.client.stream.attach", {
      correlationId: trace?.correlationId,
      runId: trace?.runId,
      invocationKey: buildTinyFishInvocationKey(trace, "stream-attach", requestUrl),
      details: {
        targetUrl: requestUrl,
        timeoutMs,
      },
    });

    const handleEvent = (event: TinyFishStreamEvent): void => {
      if (!hasLoggedFirstEvent) {
        hasLoggedFirstEvent = true;
        logApiTrace("tinyfish.client.event.first", {
          correlationId: trace?.correlationId,
          runId: trace?.runId,
          invocationKey: buildTinyFishInvocationKey(trace, "first-event", requestUrl),
          details: {
            targetUrl: requestUrl,
            eventType: event.type,
          },
        });
      }

      if (event.run_id && event.run_id !== tinyfishRunId) {
        tinyfishRunId = event.run_id;
      }

      if (event.streaming_url && event.streaming_url !== streamingUrl) {
        streamingUrl = event.streaming_url;
      }

      const shouldLogProgress = event.type === "PROGRESS" && event.purpose && event.purpose !== lastProgressPurpose;
      if (shouldLogProgress) {
        lastProgressPurpose = event.purpose;
      }

      if (event.type !== "PROGRESS" || shouldLogProgress) {
        logApiTrace("tinyfish.client.event", {
          correlationId: trace?.correlationId,
          runId: trace?.runId,
          invocationKey: `${tinyfishRunId ?? trace?.runId ?? trace?.correlationId ?? requestUrl}|${requestUrl}|${event.type}|${event.purpose ?? event.status ?? event.streaming_url ?? "-"}`,
          details: {
            targetUrl: requestUrl,
            tinyfishRunId,
            eventType: event.type,
            purpose: event.purpose,
            status: event.status,
            streamingUrl,
          },
        });
      }

      if (event.type === "COMPLETE") {
        if (event.status !== "COMPLETED") {
          fail(summarizeTinyFishError(event));
          return;
        }

        const finalResult = event.result ?? event.resultJson;
        if (typeof finalResult === "undefined") {
          fail("TinyFish COMPLETE event did not include a result payload.");
          return;
        }

        settle(() => resolve(finalResult));
        return;
      }

      if (event.type === "ERROR" || event.type === "FAILED" || event.status === "FAILED") {
        fail(summarizeTinyFishError(event));
      }
    };

    const processEventBlock = (eventBlock: string): void => {
      if (settled) {
        return;
      }

      const rawPayload = extractEventPayload(eventBlock);
      if (!rawPayload || rawPayload === "[DONE]") {
        return;
      }

      try {
        handleEvent(JSON.parse(rawPayload) as TinyFishStreamEvent);
      } catch {
        // Ignore incomplete or non-JSON fragments until a complete event arrives.
      }
    };

    const pump = async (): Promise<void> => {
      try {
        while (!settled) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const eventBlocks = buffer.split(/\r?\n\r?\n/);
          buffer = eventBlocks.pop() ?? "";

          for (const eventBlock of eventBlocks) {
            processEventBlock(eventBlock);
            if (settled) {
              return;
            }
          }
        }

        if (!settled && buffer.trim()) {
          processEventBlock(buffer);
        }

        if (!settled) {
          fail("TinyFish stream ended before a usable COMPLETE event was received.");
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "TinyFish stream failed unexpectedly.";
        fail(message);
      }
    };

    void pump();
  });
}

export async function runTinyFishAutomation({
  apiKey,
  url,
  goal,
  timeoutMs = DEFAULT_TINYFISH_TIMEOUT_MS,
  trace,
}: RunTinyFishAutomationInput): Promise<unknown> {
  const endpoint = process.env.TINYFISH_BASE_URL?.trim() || DEFAULT_TINYFISH_SSE_URL;
  logApiTrace("tinyfish.client.invoke", {
    correlationId: trace?.correlationId,
    runId: trace?.runId,
    invocationKey: buildTinyFishInvocationKey(trace, "invoke", url),
    details: {
      endpoint,
      targetUrl: url,
      timeoutMs,
    },
  });

  const response = await fetch(endpoint, {
    method: "POST",
    headers: createJsonHeaders(apiKey),
    body: JSON.stringify({
      url,
      goal,
    }),
  });

  logApiTrace("tinyfish.client.response", {
    correlationId: trace?.correlationId,
    runId: trace?.runId,
    invocationKey: buildTinyFishInvocationKey(trace, "response", url),
    details: {
      targetUrl: url,
      status: response.status,
      statusText: response.statusText,
    },
  });

  if (!response.ok) {
    throw new Error(`TinyFish returned HTTP ${response.status} ${response.statusText}.`);
  }

  return readTinyFishStream(response, timeoutMs, url, trace);
}

export async function startTinyFishAutomationAsync({
  apiKey,
  url,
  goal,
  trace,
}: StartTinyFishAutomationAsyncInput): Promise<TinyFishAsyncRunHandle> {
  const endpoint = process.env.TINYFISH_ASYNC_URL?.trim() || DEFAULT_TINYFISH_ASYNC_URL;
  logApiTrace("tinyfish.client.async.submit", {
    correlationId: trace?.correlationId,
    runId: trace?.runId,
    invocationKey: buildTinyFishInvocationKey(trace, "async-submit", url),
    details: {
      endpoint,
      targetUrl: url,
    },
  });

  const response = await fetch(endpoint, {
    method: "POST",
    headers: createJsonHeaders(apiKey),
    body: JSON.stringify({
      url,
      goal,
    }),
  });

  logApiTrace("tinyfish.client.async.submit.response", {
    correlationId: trace?.correlationId,
    runId: trace?.runId,
    invocationKey: buildTinyFishInvocationKey(trace, "async-submit-response", url),
    details: {
      targetUrl: url,
      status: response.status,
      statusText: response.statusText,
    },
  });

  if (!response.ok) {
    throw new Error(`TinyFish async submit returned HTTP ${response.status} ${response.statusText}.`);
  }

  const payload = (await response.json()) as TinyFishAsyncRunResponse;
  const runId = typeof payload.run_id === "string" && payload.run_id.trim() ? payload.run_id.trim() : null;

  if (!runId) {
    const message = extractTinyFishErrorMessage(payload.error) ?? "TinyFish async submit did not return a run_id.";
    throw new Error(message);
  }

  return {
    runId,
  };
}

export async function getTinyFishRunsByIds(
  apiKey: string,
  runIds: string[],
  trace?: DiscoveryTraceContext,
): Promise<TinyFishBatchRunSnapshotResult> {
  if (runIds.length === 0) {
    return {
      runs: [],
      notFound: [],
    };
  }

  const endpoint = process.env.TINYFISH_RUNS_BATCH_URL?.trim() || DEFAULT_TINYFISH_RUNS_BATCH_URL;
  logApiTrace("tinyfish.client.async.poll", {
    correlationId: trace?.correlationId,
    runId: trace?.runId,
    invocationKey: `${trace?.runId ?? trace?.correlationId ?? "batch"}|poll|${runIds.join(",")}`,
    details: {
      endpoint,
      runCount: runIds.length,
    },
  });

  const response = await fetch(endpoint, {
    method: "POST",
    headers: createJsonHeaders(apiKey),
    body: JSON.stringify({
      run_ids: runIds,
    }),
  });

  if (!response.ok) {
    throw new Error(`TinyFish batch poll returned HTTP ${response.status} ${response.statusText}.`);
  }

  const payload = (await response.json()) as TinyFishBatchRunsResponse;
  const runs: TinyFishRunSnapshot[] = [];

  if (Array.isArray(payload.data)) {
    for (const item of payload.data) {
      const runId = typeof item.run_id === "string" ? item.run_id.trim() : "";
      if (!runId) {
        continue;
      }

      runs.push({
        runId,
        status: normalizeTinyFishRunStatus(item.status),
        rawStatus: typeof item.status === "string" ? item.status : "UNKNOWN",
        result: item.result ?? null,
        error: extractTinyFishErrorMessage(item.error),
        creditUsage: extractCreditUsage(item),
        createdAt: item.created_at ?? null,
        startedAt: item.started_at ?? null,
        finishedAt: item.finished_at ?? null,
        streamingUrl: item.streaming_url ?? null,
      });
    }
  }

  const notFound = Array.isArray(payload.not_found) ? payload.not_found.filter(Boolean) : [];

  logApiTrace("tinyfish.client.async.poll.response", {
    correlationId: trace?.correlationId,
    runId: trace?.runId,
    invocationKey: `${trace?.runId ?? trace?.correlationId ?? "batch"}|poll-response|${runIds.join(",")}`,
    details: {
      runCount: runs.length,
      notFoundCount: notFound.length,
      statuses: runs.map((run) => `${run.runId}:${run.rawStatus}`),
    },
  });

  return {
    runs,
    notFound,
  };
}
