import { randomUUID } from "node:crypto";
import type { DemoRun, IcpInput, RunMode, RunQuality, RunStatus } from "@revon-tinyfish/contracts";
import { processLeadCandidates } from "../domain/leads/processing.js";
import { createEmptyWebsiteInspection, type DirectoryCandidate, type WebsiteInspection } from "../domain/leads/schemas.js";
import {
  getTinyFishRunsByIds,
  startTinyFishAutomationAsync,
  type TinyFishRunSnapshot,
} from "../integrations/tinyfish/client.js";
import {
  createDirectoryDiscoveryTask,
  parseDirectoryDiscoveryResult,
  type DirectoryDiscoveryResult,
} from "../integrations/tinyfish/discoverCompanies.js";
import {
  createWebsiteInspectionTask,
  parseWebsiteInspectionResult,
} from "../integrations/tinyfish/inspectWebsite.js";
import { logApiTrace, type DiscoveryTraceContext, withRunId } from "../lib/debugTrace.js";
import { createMockDirectoryDiscovery, createMockWebsiteInspection } from "../mocks/sampleLeads.js";
import {
  createDiscoverySession,
  getDiscoverySession,
  getInspectionSessionMetrics,
  setDirectorySessionJob,
  updateDirectorySessionJob,
  updateInspectionSessionJob,
  upsertInspectionSessionJob,
} from "../services/sessionStore.js";
import {
  createTelemetrySession,
  finalizeTelemetrySession,
  getTelemetrySession,
  syncTelemetrySessionWithRun,
  updateTinyFishRunTelemetry,
  upsertTinyFishRunTelemetry,
} from "../services/telemetryStore.js";
import { persistDiscoveryRun } from "../services/persistenceService.js";
import {
  createRun,
  getRun,
  failRun,
  finishRun,
  setStepStatus,
  updateRunLeads,
  updateRunState,
  updateSummary,
} from "../services/runStore.js";

interface InspectedCandidate {
  candidate: DirectoryCandidate;
  inspection: WebsiteInspection;
  inspectionRunIds?: string[] | undefined;
}

interface RunProjection {
  rankedLeads: DemoRun["leads"];
  decisionMakersFound: number;
  partialLeadCount: number;
  qualifiedLeadCount: number;
}

interface OrchestrationConfig {
  pollIntervalMs: number;
  asyncRunTimeoutMs: number;
  inspectionConcurrency: number;
  maxCompaniesToInspect: number;
}

interface PollResult {
  completed: TinyFishRunSnapshot[];
  failed: Array<{ snapshot?: TinyFishRunSnapshot; runId: string; error: string }>;
  pending: TinyFishRunSnapshot[];
}

interface ActiveInspectionJob {
  jobId: string;
  candidate: DirectoryCandidate;
  submittedAt: number;
  submittedAtIso: string;
}

export interface DiscoveryDependencies {
  startTinyFishAutomationAsync: typeof startTinyFishAutomationAsync;
  getTinyFishRunsByIds: typeof getTinyFishRunsByIds;
  sleep: (ms: number) => Promise<void>;
  createMockDirectoryDiscovery: typeof createMockDirectoryDiscovery;
  createMockWebsiteInspection: typeof createMockWebsiteInspection;
}

const defaultDependencies: DiscoveryDependencies = {
  startTinyFishAutomationAsync,
  getTinyFishRunsByIds,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  createMockDirectoryDiscovery,
  createMockWebsiteInspection,
};

async function persistRunSnapshotSafely(
  run: DemoRun,
  telemetry: ReturnType<typeof getTelemetrySession>,
  correlationId?: string,
): Promise<void> {
  try {
    await persistDiscoveryRun(run, telemetry ?? null);
    logApiTrace("persistence.session.saved", {
      correlationId,
      runId: run.id,
      invocationKey: `${run.id}|persist`,
      details: {
        status: run.status,
        leadCount: run.leads.length,
        qualifiedLeadCount: run.summary.qualifiedLeadCount,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown persistence error.";
    console.error(`[tinyfish-demo] failed to persist session ${run.id}: ${message}`);
    logApiTrace("persistence.session.failed", {
      correlationId,
      runId: run.id,
      invocationKey: `${run.id}|persist`,
      details: {
        status: run.status,
        error: message,
      },
    });
  }
}

function resolveLiveMode(): { mode: RunMode; reason?: string; allowFallback: boolean } {
  const forceMock = (process.env.TINYFISH_FORCE_MOCK ?? "false").toLowerCase() === "true";
  const hasApiKey = Boolean(process.env.TINYFISH_API_KEY?.trim());
  const allowFallback = (process.env.TINYFISH_ENABLE_MOCK_FALLBACK ?? "true").toLowerCase() !== "false";

  if (forceMock) {
    return {
      mode: "mock",
      reason: "TINYFISH_FORCE_MOCK is enabled, so the run is explicitly using mock mode.",
      allowFallback,
    };
  }

  if (!hasApiKey) {
    return {
      mode: "mock",
      reason: "TINYFISH_API_KEY is not configured, so the run is explicitly using mock mode.",
      allowFallback,
    };
  }

  return { mode: "live", allowFallback };
}

function combineStatus(base: RunStatus, degraded: boolean): Extract<RunStatus, "completed" | "partial"> {
  return degraded || base === "partial" ? "partial" : "completed";
}

function resolveOrchestrationConfig(): OrchestrationConfig {
  const pollIntervalMs = Number.parseInt(process.env.TINYFISH_POLL_INTERVAL_MS ?? "3000", 10);
  const asyncRunTimeoutMs = Number.parseInt(process.env.TINYFISH_ASYNC_RUN_TIMEOUT_MS ?? "300000", 10);
  const inspectionConcurrency = Number.parseInt(process.env.TINYFISH_INSPECTION_CONCURRENCY ?? "4", 10);
  const maxCompaniesToInspect = Number.parseInt(process.env.TINYFISH_MAX_COMPANIES_TO_INSPECT ?? "5", 10);

  return {
    pollIntervalMs: Number.isFinite(pollIntervalMs) && pollIntervalMs > 500 ? pollIntervalMs : 3000,
    asyncRunTimeoutMs:
      Number.isFinite(asyncRunTimeoutMs) && asyncRunTimeoutMs > 30_000 ? asyncRunTimeoutMs : 300_000,
    inspectionConcurrency:
      Number.isFinite(inspectionConcurrency) && inspectionConcurrency > 0 ? inspectionConcurrency : 4,
    maxCompaniesToInspect:
      Number.isFinite(maxCompaniesToInspect) && maxCompaniesToInspect > 0 ? maxCompaniesToInspect : 5,
  };
}

function createFailedInspection(candidate: DirectoryCandidate, message: string): WebsiteInspection {
  return createEmptyWebsiteInspection(candidate.websiteUrl, {
    inspectionStatus: "failed",
    qualityNotes: [message],
    missingFields: ["summary", "services", "emails", "team"],
  });
}

function calculateDurationMs(startedAt?: string | null, finishedAt?: string | null): number | null {
  if (!startedAt || !finishedAt) {
    return null;
  }

  const startedAtMs = Date.parse(startedAt);
  const finishedAtMs = Date.parse(finishedAt);

  if (!Number.isFinite(startedAtMs) || !Number.isFinite(finishedAtMs) || finishedAtMs < startedAtMs) {
    return null;
  }

  return finishedAtMs - startedAtMs;
}

function isTimeoutMessage(message: string): boolean {
  return /timed out/i.test(message);
}

function computeUsableLeadCount(leads: DemoRun["leads"]): number {
  return leads.filter((lead) => lead.inspectionStatus !== "failed").length;
}

function updateInspectionAggregateSummary(
  runId: string,
  wallTimeMs: number,
  projection?: RunProjection,
): void {
  const metrics = getInspectionSessionMetrics(runId);
  updateSummary(runId, {
    totalCompanies: metrics.totalCompanies,
    inspectionsStarted: metrics.startedInspections,
    inspectionsCompleted: metrics.completedInspections,
    inspectionsFailed: metrics.failedInspections,
    inspectionsPartial: metrics.partialInspections,
    wallTimeMs,
    ...(projection
      ? {
          usableLeadCount: computeUsableLeadCount(projection.rankedLeads),
        }
      : {}),
  });

  const currentRun = getRun(runId);
  if (currentRun) {
    syncTelemetrySessionWithRun(runId, currentRun);
  }
}

function projectLeads(
  runId: string,
  input: IcpInput,
  mode: RunMode,
  inspections: InspectedCandidate[],
): RunProjection {
  const session = getDiscoverySession(runId);
  const currentRun = getRun(runId);
  const rankedLeads = processLeadCandidates(input, inspections, {
    captureMode: mode,
    sessionContext: {
      agentSessionId: runId,
      correlationId: session?.correlationId ?? null,
      directoryUrl: session?.directoryJob?.targetUrl ?? currentRun?.summary.directoryUrl ?? null,
      directoryRunId: session?.directoryJob?.tinyfishRunId ?? null,
      runStartedAt: currentRun?.startedAt ?? null,
    },
  });

  return {
    rankedLeads,
    decisionMakersFound: rankedLeads.reduce(
      (total, lead) => total + lead.contacts.filter((contact) => contact.isDecisionMaker).length,
      0,
    ),
    partialLeadCount: rankedLeads.filter((lead) => lead.inspectionStatus !== "completed").length,
    qualifiedLeadCount: rankedLeads.filter((lead) => lead.score.qualificationState === "qualified").length,
  };
}

function applyLeadProjection(
  runId: string,
  input: IcpInput,
  mode: RunMode,
  inspections: InspectedCandidate[],
): RunProjection {
  const projection = projectLeads(runId, input, mode, inspections);
  updateRunLeads(runId, projection.rankedLeads);
  updateSummary(runId, {
    decisionMakersFound: projection.decisionMakersFound,
    partialLeadCount: projection.partialLeadCount,
    qualifiedLeadCount: projection.qualifiedLeadCount,
  });
  const currentRun = getRun(runId);
  if (currentRun) {
    syncTelemetrySessionWithRun(runId, currentRun);
  }

  return projection;
}

async function pollTinyFishRunsUntilSettled(
  apiKey: string,
  runIds: string[],
  runTrace: DiscoveryTraceContext,
  dependencies: DiscoveryDependencies,
  config: OrchestrationConfig,
): Promise<PollResult> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < config.asyncRunTimeoutMs) {
    const batch = await dependencies.getTinyFishRunsByIds(apiKey, runIds, runTrace);
    const missing = new Set(batch.notFound);
    const completed: TinyFishRunSnapshot[] = [];
    const failed: Array<{ snapshot?: TinyFishRunSnapshot; runId: string; error: string }> = [];
    const pending: TinyFishRunSnapshot[] = [];

    for (const runId of runIds) {
      if (missing.has(runId)) {
        failed.push({
          runId,
          error: `TinyFish run ${runId} was not found during polling.`,
        });
        continue;
      }

      const snapshot = batch.runs.find((item) => item.runId === runId);
      if (!snapshot) {
        pending.push({
          runId,
          status: "running",
          rawStatus: "UNKNOWN",
          result: null,
          error: null,
          creditUsage: null,
          createdAt: null,
          startedAt: null,
          finishedAt: null,
          streamingUrl: null,
        });
        continue;
      }

      if (snapshot.status === "completed") {
        completed.push(snapshot);
        continue;
      }

      if (snapshot.status === "failed" || snapshot.status === "cancelled") {
        failed.push({
          snapshot,
          runId: snapshot.runId,
          error: snapshot.error ?? `TinyFish run ${snapshot.runId} ended with status ${snapshot.rawStatus}.`,
        });
        continue;
      }

      pending.push(snapshot);
    }

    if (completed.length > 0 || failed.length > 0 || pending.length === 0) {
      return {
        completed,
        failed,
        pending,
      };
    }

    await dependencies.sleep(config.pollIntervalMs);
  }

  logApiTrace("inspection.poll.timeout", {
    correlationId: runTrace.correlationId,
    runId: runTrace.runId,
    invocationKey: `${runTrace.runId ?? runTrace.correlationId ?? "run"}|poll-timeout|${runIds.join(",")}`,
    details: {
      timedOutRunIds: runIds,
      timeoutMs: config.asyncRunTimeoutMs,
    },
  });
  return {
    completed: [],
    failed: runIds.map((runId) => ({
      runId,
      error: `Timed out waiting for TinyFish run ${runId}.`,
    })),
    pending: [],
  };
}

async function waitForTinyFishRun(
  apiKey: string,
  tinyfishRunId: string,
  runTrace: DiscoveryTraceContext,
  dependencies: DiscoveryDependencies,
  config: OrchestrationConfig,
): Promise<TinyFishRunSnapshot> {
  while (true) {
    const result = await pollTinyFishRunsUntilSettled(
      apiKey,
      [tinyfishRunId],
      runTrace,
      dependencies,
      config,
    );

    if (result.completed[0]) {
      return result.completed[0];
    }

    if (result.failed[0]) {
      throw new Error(result.failed[0].error);
    }

    if (result.pending.length === 0) {
      throw new Error(`TinyFish run ${tinyfishRunId} finished without a usable snapshot.`);
    }
  }
}

async function executeMockRun(
  runId: string,
  input: IcpInput,
  initialMode: RunMode,
  dependencies: DiscoveryDependencies,
  runNotes: string[],
  startingQuality: RunQuality = "healthy",
): Promise<{ quality: RunQuality; notes: string[] }> {
  const sessionStartedAt = Date.now();
  let quality: RunQuality = startingQuality;

  setStepStatus(runId, "discovering_companies", "running", "Generating mock directory candidates...");
  const discovery = dependencies.createMockDirectoryDiscovery(input);

  updateRunState(runId, {
    mode: "mock",
    quality,
    notes: runNotes,
    modeReason:
      initialMode === "mock"
        ? "This run is explicitly using mock mode."
        : "Live TinyFish discovery degraded and switched to explicit mock fallback mode.",
  });
  updateSummary(runId, {
    directoryUrl: discovery.directoryUrl,
    companiesFound: discovery.candidates.length,
    totalCompanies: discovery.candidates.length,
  });
  setStepStatus(
    runId,
    "discovering_companies",
    "completed",
    `Loaded ${discovery.candidates.length} mock company candidates.`,
  );

  setStepStatus(runId, "visiting_websites", "running", "Synthesizing mock company website inspections...");
  const inspections = discovery.candidates.map((candidate, index) => ({
    candidate,
    inspection: dependencies.createMockWebsiteInspection(candidate, input, index),
  }));

  updateSummary(runId, {
    websitesVisited: inspections.length,
    websiteFailures: 0,
  });
  setStepStatus(
    runId,
    "visiting_websites",
    "completed",
    `Prepared ${inspections.length} mock website inspection${inspections.length === 1 ? "" : "s"}.`,
  );

  setStepStatus(runId, "extracting_contacts", "running", "Building structured mock lead data...");
  const projection = applyLeadProjection(runId, input, "mock", inspections);
  updateSummary(runId, {
    inspectionsStarted: inspections.length,
    inspectionsCompleted: inspections.length,
    inspectionsFailed: 0,
    inspectionsPartial: 0,
    usableLeadCount: computeUsableLeadCount(projection.rankedLeads),
    wallTimeMs: Date.now() - sessionStartedAt,
  });
  setStepStatus(
    runId,
    "extracting_contacts",
    "completed",
    `Captured ${projection.decisionMakersFound} mock decision-maker signal${projection.decisionMakersFound === 1 ? "" : "s"}.`,
  );

  setStepStatus(runId, "ranking_leads", "running", "Scoring mock lead quality...");
  setStepStatus(
    runId,
    "ranking_leads",
    "completed",
    `${projection.qualifiedLeadCount} mock lead${projection.qualifiedLeadCount === 1 ? "" : "s"} ranked as demo-ready.`,
  );

  if (projection.qualifiedLeadCount > 0) {
    setStepStatus(
      runId,
      "ready_for_revon",
      "completed",
      `${projection.qualifiedLeadCount} qualified lead${projection.qualifiedLeadCount === 1 ? "" : "s"} ready for Revon handoff.`,
    );
  } else {
    quality = "degraded";
    runNotes.push("No qualified leads were produced from the current run.");
    setStepStatus(
      runId,
      "ready_for_revon",
      "skipped",
      "No qualified leads were produced, so Revon handoff is skipped.",
    );
  }

  finishRun(runId, {
    leads: projectLeads(runId, input, "mock", inspections).rankedLeads,
    status: combineStatus("completed", quality === "degraded" || projection.qualifiedLeadCount === 0),
    quality,
    notes: runNotes,
  });
  logApiTrace("inspection.session.metrics", {
    correlationId: undefined,
    runId,
    invocationKey: `${runId}|session-metrics`,
    details: {
      mode: "mock",
      wallTimeMs: Date.now() - sessionStartedAt,
      usableLeadCount: computeUsableLeadCount(projection.rankedLeads),
      qualifiedLeadCount: projection.qualifiedLeadCount,
    },
  });

  return {
    quality,
    notes: runNotes,
  };
}

async function executeLiveAsyncRun(
  runId: string,
  input: IcpInput,
  dependencies: DiscoveryDependencies,
  runTrace: DiscoveryTraceContext,
): Promise<{ quality: RunQuality; notes: string[] }> {
  const sessionStartedAt = Date.now();
  const apiKey = process.env.TINYFISH_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("TINYFISH_API_KEY is required for live async discovery.");
  }

  const config = resolveOrchestrationConfig();
  console.log("inspection concurrency:", config.inspectionConcurrency);
  console.log("inspection candidate cap:", config.maxCompaniesToInspect);

  let quality: RunQuality = "healthy";
  const runNotes: string[] = [];

  createDiscoverySession(runId, {
    mode: "live",
    correlationId: runTrace.correlationId,
  });

  const directoryTask = createDirectoryDiscoveryTask(input);
  setStepStatus(runId, "discovering_companies", "running", "Submitting async TinyFish directory discovery...");
  const directorySubmittedAtIso = new Date().toISOString();
  const directoryHandle = await dependencies.startTinyFishAutomationAsync({
    apiKey,
    url: directoryTask.directoryUrl,
    goal: directoryTask.goal,
    trace: runTrace,
  });

  setDirectorySessionJob(runId, {
    id: "directory",
    kind: "directory_discovery",
    targetUrl: directoryTask.directoryUrl,
    tinyfishRunId: directoryHandle.runId,
    status: "submitted",
    submittedAt: directorySubmittedAtIso,
  });
  upsertTinyFishRunTelemetry(runId, {
    tinyfishRunId: directoryHandle.runId,
    parentSessionId: runId,
    stage: "directory_discovery",
    targetUrl: directoryTask.directoryUrl,
    startedAt: directorySubmittedAtIso,
    completedAt: null,
    durationMs: null,
    finalStatus: "submitted",
    inspectionStatus: null,
    companyName: null,
    creditUsage: null,
    timeoutFlag: false,
    degradedFlag: false,
    errorMessage: null,
  });
  setStepStatus(
    runId,
    "discovering_companies",
    "running",
    `TinyFish directory run ${directoryHandle.runId} submitted. Polling for results...`,
  );

  let directorySnapshot: TinyFishRunSnapshot;
  try {
    directorySnapshot = await waitForTinyFishRun(
      apiKey,
      directoryHandle.runId,
      runTrace,
      dependencies,
      config,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Directory discovery polling failed.";
    updateTinyFishRunTelemetry(runId, directoryHandle.runId, {
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - Date.parse(directorySubmittedAtIso),
      finalStatus: isTimeoutMessage(message) ? "timed_out" : "failed",
      timeoutFlag: isTimeoutMessage(message),
      degradedFlag: true,
      errorMessage: message,
    });
    throw error;
  }

  updateDirectorySessionJob(runId, {
    status: "completed",
    startedAt: directorySnapshot.startedAt,
    finishedAt: directorySnapshot.finishedAt,
    rawResult: directorySnapshot.result,
    error: directorySnapshot.error,
  });

  const discovery: DirectoryDiscoveryResult = parseDirectoryDiscoveryResult(
    directoryTask.directoryUrl,
    directorySnapshot.result,
  );

  discovery.candidates = discovery.candidates.slice(0, config.maxCompaniesToInspect);

  if (discovery.candidates.length === 0) {
    throw new Error("No candidate companies were found in the selected directory slice.");
  }

  if (discovery.warnings.length > 0) {
    quality = "degraded";
    runNotes.push(...discovery.warnings);
  }
  updateTinyFishRunTelemetry(runId, directoryHandle.runId, {
    startedAt: directorySnapshot.startedAt ?? directorySubmittedAtIso,
    completedAt: directorySnapshot.finishedAt ?? new Date().toISOString(),
    durationMs:
      calculateDurationMs(directorySnapshot.startedAt, directorySnapshot.finishedAt) ??
      Date.now() - Date.parse(directorySubmittedAtIso),
    finalStatus: discovery.warnings.length > 0 ? "partial" : "completed",
    creditUsage: directorySnapshot.creditUsage,
    timeoutFlag: false,
    degradedFlag: discovery.warnings.length > 0,
    errorMessage: directorySnapshot.error,
  });

  updateRunState(runId, {
    mode: "live",
    quality,
    notes: runNotes,
  });
  updateSummary(runId, {
    directoryUrl: discovery.directoryUrl,
    companiesFound: discovery.candidates.length,
    totalCompanies: discovery.candidates.length,
  });
  updateInspectionAggregateSummary(runId, Date.now() - sessionStartedAt);
  setStepStatus(
    runId,
    "discovering_companies",
    discovery.warnings.length > 0 ? "partial" : "completed",
    `Directory run completed with ${discovery.candidates.length} candidate compan${discovery.candidates.length === 1 ? "y" : "ies"}.`,
  );

  setStepStatus(
    runId,
    "visiting_websites",
    "running",
    `Submitting async TinyFish website inspections with concurrency ${config.inspectionConcurrency}.`,
  );
  setStepStatus(runId, "extracting_contacts", "running", "Waiting for the first website inspection result...");
  setStepStatus(runId, "ranking_leads", "running", "Waiting for the first ranked lead...");

  const pendingCandidates = [...discovery.candidates];
  const activeJobs = new Map<string, ActiveInspectionJob>();
  const completedInspections: InspectedCandidate[] = [];
  let websiteFailures = 0;

  while (pendingCandidates.length > 0 || activeJobs.size > 0) {
    while (pendingCandidates.length > 0 && activeJobs.size < config.inspectionConcurrency) {
      const candidate = pendingCandidates.shift()!;
      const task = createWebsiteInspectionTask(input, candidate);
      logApiTrace("inspection.submit.start", {
        correlationId: runTrace.correlationId,
        runId,
        invocationKey: `${runId}|submit|${candidate.websiteUrl}`,
        details: {
          companyName: candidate.companyName,
          websiteUrl: candidate.websiteUrl,
          activeInspections: activeJobs.size,
          concurrencyLimit: config.inspectionConcurrency,
        },
      });
      const handle = await dependencies.startTinyFishAutomationAsync({
        apiKey,
        url: task.websiteUrl,
        goal: task.goal,
        trace: runTrace,
      });

      const jobId = randomUUID();
      const submittedAtIso = new Date().toISOString();
      upsertInspectionSessionJob(runId, {
        id: jobId,
        kind: "website_inspection",
        targetUrl: candidate.websiteUrl,
        companyName: candidate.companyName,
        tinyfishRunId: handle.runId,
        status: "submitted",
        submittedAt: submittedAtIso,
      });
      activeJobs.set(handle.runId, {
        jobId,
        candidate,
        submittedAt: Date.now(),
        submittedAtIso,
      });
      upsertTinyFishRunTelemetry(runId, {
        tinyfishRunId: handle.runId,
        parentSessionId: runId,
        stage: "website_inspection",
        targetUrl: candidate.websiteUrl,
        startedAt: submittedAtIso,
        completedAt: null,
        durationMs: null,
        finalStatus: "submitted",
        inspectionStatus: null,
        companyName: candidate.companyName,
        creditUsage: null,
        timeoutFlag: false,
        degradedFlag: false,
        errorMessage: null,
      });
      logApiTrace("inspection.submit.accepted", {
        correlationId: runTrace.correlationId,
        runId,
        invocationKey: `${runId}|submit-accepted|${candidate.websiteUrl}`,
        details: {
          companyName: candidate.companyName,
          websiteUrl: candidate.websiteUrl,
          tinyfishRunId: handle.runId,
          submittedAt: submittedAtIso,
        },
      });
    }

    if (activeJobs.size === 0) {
      break;
    }

    logApiTrace("inspection.poll.start", {
      correlationId: runTrace.correlationId,
      runId,
      invocationKey: `${runId}|poll|${[...activeJobs.keys()].join(",")}`,
      details: {
        activeInspections: activeJobs.size,
        pendingCompanies: pendingCandidates.length,
        runIds: [...activeJobs.keys()],
      },
    });
    setStepStatus(
      runId,
      "visiting_websites",
      "running",
      `Polling ${activeJobs.size} active website inspection run${activeJobs.size === 1 ? "" : "s"} while ${completedInspections.length}/${discovery.candidates.length} result${completedInspections.length === 1 ? "" : "s"} are complete.`,
    );

    const pollResult = await pollTinyFishRunsUntilSettled(
      apiKey,
      [...activeJobs.keys()],
      runTrace,
      dependencies,
      config,
    );
    logApiTrace("inspection.poll.completed", {
      correlationId: runTrace.correlationId,
      runId,
      invocationKey: `${runId}|poll-complete|${[...activeJobs.keys()].join(",")}`,
      details: {
        completedRuns: pollResult.completed.map((snapshot) => snapshot.runId),
        failedRuns: pollResult.failed.map((failedRun) => failedRun.runId),
        pendingRuns: pollResult.pending.map((snapshot) => snapshot.runId),
      },
    });

    for (const snapshot of pollResult.pending) {
      const active = activeJobs.get(snapshot.runId);
      if (!active) {
        continue;
      }

      updateInspectionSessionJob(runId, active.jobId, {
        status: "polling",
        startedAt: snapshot.startedAt,
        finishedAt: snapshot.finishedAt,
        lastPolledAt: new Date().toISOString(),
        error: snapshot.error,
        durationMs: calculateDurationMs(snapshot.startedAt, snapshot.finishedAt),
      });
      updateTinyFishRunTelemetry(runId, snapshot.runId, {
        startedAt: snapshot.startedAt ?? active.submittedAtIso,
        completedAt: snapshot.finishedAt,
        durationMs: calculateDurationMs(snapshot.startedAt, snapshot.finishedAt),
        finalStatus: "polling",
        creditUsage: snapshot.creditUsage,
        errorMessage: snapshot.error,
      });
    }

    for (const failedRun of pollResult.failed) {
      const active = activeJobs.get(failedRun.runId);
      if (!active) {
        continue;
      }

      activeJobs.delete(failedRun.runId);
      websiteFailures += 1;
      quality = "degraded";

      updateInspectionSessionJob(runId, active.jobId, {
        status:
          failedRun.snapshot?.status === "cancelled"
            ? "cancelled"
            : "failed",
        startedAt: failedRun.snapshot?.startedAt,
        finishedAt: failedRun.snapshot?.finishedAt,
        lastPolledAt: new Date().toISOString(),
        error: failedRun.error,
        durationMs:
          calculateDurationMs(failedRun.snapshot?.startedAt, failedRun.snapshot?.finishedAt) ??
          Date.now() - active.submittedAt,
        rawResult: failedRun.snapshot?.result,
      });
      updateTinyFishRunTelemetry(runId, failedRun.runId, {
        startedAt: failedRun.snapshot?.startedAt ?? active.submittedAtIso,
        completedAt: failedRun.snapshot?.finishedAt ?? new Date().toISOString(),
        durationMs:
          calculateDurationMs(failedRun.snapshot?.startedAt, failedRun.snapshot?.finishedAt) ??
          Date.now() - active.submittedAt,
        finalStatus:
          failedRun.snapshot?.status === "cancelled"
            ? "cancelled"
            : isTimeoutMessage(failedRun.error)
              ? "timed_out"
              : "failed",
        inspectionStatus: "failed",
        creditUsage: failedRun.snapshot?.creditUsage ?? null,
        timeoutFlag: isTimeoutMessage(failedRun.error),
        degradedFlag: true,
        errorMessage: failedRun.error,
      });
      logApiTrace("inspection.failed", {
        correlationId: runTrace.correlationId,
        runId,
        invocationKey: `${runId}|failed|${active.candidate.websiteUrl}`,
        details: {
          companyName: active.candidate.companyName,
          websiteUrl: active.candidate.websiteUrl,
          tinyfishRunId: failedRun.runId,
          error: failedRun.error,
        },
      });

      completedInspections.push({
        candidate: active.candidate,
        inspection: createFailedInspection(active.candidate, failedRun.error),
        inspectionRunIds: [failedRun.runId],
      });
    }

    for (const snapshot of pollResult.completed) {
      const active = activeJobs.get(snapshot.runId);
      if (!active) {
        continue;
      }

      activeJobs.delete(snapshot.runId);
      const inspection = parseWebsiteInspectionResult(active.candidate, snapshot.result);
      updateInspectionSessionJob(runId, active.jobId, {
        status: inspection.inspectionStatus === "partial" ? "partial" : "completed",
        startedAt: snapshot.startedAt,
        finishedAt: snapshot.finishedAt,
        lastPolledAt: new Date().toISOString(),
        error: snapshot.error,
        durationMs:
          calculateDurationMs(snapshot.startedAt, snapshot.finishedAt) ??
          Date.now() - active.submittedAt,
        rawResult: snapshot.result,
      });
      updateTinyFishRunTelemetry(runId, snapshot.runId, {
        startedAt: snapshot.startedAt ?? active.submittedAtIso,
        completedAt: snapshot.finishedAt ?? new Date().toISOString(),
        durationMs:
          calculateDurationMs(snapshot.startedAt, snapshot.finishedAt) ??
          Date.now() - active.submittedAt,
        finalStatus: inspection.inspectionStatus === "partial" ? "partial" : "completed",
        inspectionStatus: inspection.inspectionStatus,
        creditUsage: snapshot.creditUsage,
        timeoutFlag: false,
        degradedFlag: inspection.inspectionStatus !== "completed",
        errorMessage: snapshot.error,
      });
      logApiTrace("inspection.completed", {
        correlationId: runTrace.correlationId,
        runId,
        invocationKey: `${runId}|completed|${active.candidate.websiteUrl}`,
        details: {
          companyName: active.candidate.companyName,
          websiteUrl: active.candidate.websiteUrl,
          tinyfishRunId: snapshot.runId,
          inspectionStatus: inspection.inspectionStatus,
          durationMs:
            calculateDurationMs(snapshot.startedAt, snapshot.finishedAt) ??
            Date.now() - active.submittedAt,
        },
      });
      if (inspection.inspectionStatus !== "completed") {
        quality = "degraded";
      }
      if (inspection.inspectionStatus === "failed") {
        websiteFailures += 1;
      }

      completedInspections.push({
        candidate: active.candidate,
        inspection,
        inspectionRunIds: [snapshot.runId],
      });
    }

    const projection = applyLeadProjection(runId, input, "live", completedInspections);
    if (projection.partialLeadCount > 0) {
      quality = "degraded";
    }

    updateRunState(runId, {
      quality,
      notes: runNotes,
    });
    updateSummary(runId, {
      websitesVisited: completedInspections.length,
      websiteFailures,
    });
    updateInspectionAggregateSummary(runId, Date.now() - sessionStartedAt, projection);
    setStepStatus(
      runId,
      "extracting_contacts",
      "running",
      `Normalized ${completedInspections.length}/${discovery.candidates.length} inspection result${completedInspections.length === 1 ? "" : "s"}.`,
    );
    setStepStatus(
      runId,
      "ranking_leads",
      "running",
      `Ranked ${projection.rankedLeads.length} lead${projection.rankedLeads.length === 1 ? "" : "s"} so far, with ${projection.qualifiedLeadCount} currently qualified.`,
    );
  }

  if (completedInspections.length === 0) {
    throw new Error("No company websites were inspected.");
  }

  if (websiteFailures === completedInspections.length) {
    throw new Error("Website inspection failed for every shortlisted company.");
  }

  const finalProjection = applyLeadProjection(runId, input, "live", completedInspections);
  if (finalProjection.partialLeadCount > 0) {
    quality = "degraded";
  }

  updateRunState(runId, {
    quality,
    notes: runNotes,
  });
  updateSummary(runId, {
    websitesVisited: completedInspections.length,
    websiteFailures,
  });
  updateInspectionAggregateSummary(runId, Date.now() - sessionStartedAt, finalProjection);

  const websiteStepStatus =
    websiteFailures === 0
      ? "completed"
      : websiteFailures < completedInspections.length
        ? "partial"
        : "failed";
  setStepStatus(
    runId,
    "visiting_websites",
    websiteStepStatus,
    websiteFailures === 0
      ? `Completed ${completedInspections.length} TinyFish website inspection run${completedInspections.length === 1 ? "" : "s"}.`
      : `Completed ${completedInspections.length} inspection run${completedInspections.length === 1 ? "" : "s"}, with ${websiteFailures} failure${websiteFailures === 1 ? "" : "s"}.`,
  );
  setStepStatus(
    runId,
    "extracting_contacts",
    finalProjection.partialLeadCount > 0 ? "partial" : "completed",
    finalProjection.partialLeadCount > 0
      ? `Extracted structured data with ${finalProjection.partialLeadCount} partial or failed lead capture(s).`
      : `Captured ${finalProjection.decisionMakersFound} decision-maker signal${finalProjection.decisionMakersFound === 1 ? "" : "s"}.`,
  );
  setStepStatus(
    runId,
    "ranking_leads",
    quality === "degraded" ? "partial" : "completed",
    `${finalProjection.qualifiedLeadCount} lead${finalProjection.qualifiedLeadCount === 1 ? "" : "s"} ranked as demo-ready.`,
  );

  if (finalProjection.qualifiedLeadCount > 0) {
    setStepStatus(
      runId,
      "ready_for_revon",
      quality === "degraded" ? "partial" : "completed",
      `${finalProjection.qualifiedLeadCount} qualified lead${finalProjection.qualifiedLeadCount === 1 ? "" : "s"} ready for Revon handoff.`,
    );
  } else {
    quality = "degraded";
    runNotes.push("No qualified leads were produced from the current run.");
    setStepStatus(
      runId,
      "ready_for_revon",
      "skipped",
      "No qualified leads were produced, so Revon handoff is skipped.",
    );
  }

  finishRun(runId, {
    leads: finalProjection.rankedLeads,
    status: combineStatus("completed", quality === "degraded" || finalProjection.qualifiedLeadCount === 0),
    quality,
    notes: runNotes,
  });
  logApiTrace("inspection.session.metrics", {
    correlationId: runTrace.correlationId,
    runId,
    invocationKey: `${runId}|session-metrics`,
    details: {
      mode: "live",
      concurrencyLimit: config.inspectionConcurrency,
      wallTimeMs: Date.now() - sessionStartedAt,
      usableLeadCount: computeUsableLeadCount(finalProjection.rankedLeads),
      qualifiedLeadCount: finalProjection.qualifiedLeadCount,
    },
  });

  return {
    quality,
    notes: runNotes,
  };
}

async function executeRun(
  runId: string,
  input: IcpInput,
  initialMode: RunMode,
  allowFallback: boolean,
  dependencies: DiscoveryDependencies,
  trace?: DiscoveryTraceContext,
): Promise<void> {
  const runTrace = withRunId(trace, runId);

  logApiTrace("discoveryRun.executeRun.start", {
    correlationId: runTrace.correlationId,
    runId,
    invocationKey: runId,
    details: {
      initialMode,
      allowFallback,
      payloadSignature: runTrace.payloadSignature,
    },
  });

  try {
    if (initialMode === "mock") {
      await executeMockRun(runId, input, initialMode, dependencies, []);
      return;
    }

    try {
      await executeLiveAsyncRun(runId, input, dependencies, runTrace);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Live TinyFish directory discovery failed unexpectedly.";
      console.warn(`[tinyfish-demo] live async discovery failed, evaluating fallback :: ${message}`);
      const currentRun = getRun(runId);
      const canFallbackToMock =
        allowFallback &&
        currentRun?.summary.companiesFound === 0 &&
        currentRun.summary.websitesVisited === 0 &&
        (currentRun.leads.length ?? 0) === 0;

      if (!canFallbackToMock) {
        throw error;
      }

      const runNotes = [`Live TinyFish discovery failed. Mock fallback activated: ${message}`];
      updateRunState(runId, {
        mode: "mock",
        quality: "degraded",
        modeReason: "Live TinyFish discovery failed and the run degraded into explicit mock fallback mode.",
        notes: runNotes,
      });
      await executeMockRun(runId, input, "live", dependencies, runNotes, "degraded");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "The TinyFish discovery run failed.";
    failRun(runId, message);
  } finally {
    const completedRun = getRun(runId);
    if (completedRun) {
      const telemetry = finalizeTelemetrySession(runId, completedRun);
      await persistRunSnapshotSafely(completedRun, telemetry, runTrace.correlationId);
      if (telemetry) {
        logApiTrace("telemetry.session.finalized", {
          correlationId: runTrace.correlationId,
          runId,
          invocationKey: `${runId}|telemetry`,
          details: {
            experimentLabel: telemetry.experimentLabel,
            wallClockMs: telemetry.totalWallClockMs,
            qualifiedLeads: telemetry.totalQualifiedLeads,
            usableLeads: telemetry.qualityMetrics.usableLeadCount,
            partialOrFailedPercentage: telemetry.qualityMetrics.percentagePartialOrFailed,
            creditsPerSession: telemetry.costMetrics.creditsPerSession,
          },
        });
      }
    }
  }
}

export function startDiscoveryRun(
  input: IcpInput,
  dependencies: DiscoveryDependencies = defaultDependencies,
  trace?: DiscoveryTraceContext,
): DemoRun {
  const resolved = resolveLiveMode();
  const runOptions: {
    mode: RunMode;
    modeReason?: string;
    experimentLabel?: string;
  } = {
    mode: resolved.mode,
  };

  if (resolved.reason) {
    runOptions.modeReason = resolved.reason;
  }

  if (trace?.experimentLabel) {
    runOptions.experimentLabel = trace.experimentLabel;
  }

  const run = createRun(input, runOptions);
  createTelemetrySession({
    sessionId: run.id,
    agentSessionId: run.id,
    correlationId: trace?.correlationId ?? null,
    experimentLabel: run.experimentLabel,
    captureMode: run.mode,
    runStartedAt: run.startedAt,
  });
  void persistRunSnapshotSafely(run, getTelemetrySession(run.id), trace?.correlationId);

  logApiTrace("startDiscoveryRun", {
    correlationId: trace?.correlationId,
    runId: run.id,
    invocationKey: trace?.correlationId ?? run.id,
    details: {
      mode: resolved.mode,
      allowFallback: resolved.allowFallback,
      payloadSignature: trace?.payloadSignature,
      experimentLabel: run.experimentLabel,
    },
  });
  console.log(`[tinyfish-demo] starting discovery run ${run.id} in ${resolved.mode} mode`);
  void executeRun(run.id, input, resolved.mode, resolved.allowFallback, dependencies, trace);
  return run;
}
