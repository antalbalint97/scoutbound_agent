import type { RunMode } from "@revon-tinyfish/contracts";

export type SessionJobKind = "directory_discovery" | "website_inspection";
export type SessionJobStatus =
  | "pending"
  | "submitted"
  | "polling"
  | "completed"
  | "partial"
  | "failed"
  | "cancelled";

export interface SessionJobRecord {
  id: string;
  kind: SessionJobKind;
  targetUrl: string;
  companyName?: string | undefined;
  tinyfishRunId?: string | undefined;
  status: SessionJobStatus;
  submittedAt?: string | undefined;
  startedAt?: string | null | undefined;
  finishedAt?: string | null | undefined;
  lastPolledAt?: string | undefined;
  error?: string | null | undefined;
  durationMs?: number | null | undefined;
  rawResult?: unknown;
}

export interface DiscoverySessionRecord {
  runId: string;
  mode: RunMode;
  correlationId?: string | undefined;
  directoryJob: SessionJobRecord | null;
  inspectionJobs: SessionJobRecord[];
}

const sessions = new Map<string, DiscoverySessionRecord>();

function cloneSession(session: DiscoverySessionRecord): DiscoverySessionRecord {
  return structuredClone(session);
}

export function createDiscoverySession(
  runId: string,
  options: {
    mode: RunMode;
    correlationId?: string;
  },
): DiscoverySessionRecord {
  const session: DiscoverySessionRecord = {
    runId,
    mode: options.mode,
    directoryJob: null,
    inspectionJobs: [],
    ...(options.correlationId ? { correlationId: options.correlationId } : {}),
  };

  sessions.set(runId, session);
  return cloneSession(session);
}

export function getDiscoverySession(runId: string): DiscoverySessionRecord | undefined {
  const session = sessions.get(runId);
  return session ? cloneSession(session) : undefined;
}

export function mutateDiscoverySession(
  runId: string,
  mutate: (session: DiscoverySessionRecord) => void,
): DiscoverySessionRecord | undefined {
  const session = sessions.get(runId);
  if (!session) {
    return undefined;
  }

  mutate(session);
  return cloneSession(session);
}

export function setDirectorySessionJob(runId: string, job: SessionJobRecord): DiscoverySessionRecord | undefined {
  return mutateDiscoverySession(runId, (session) => {
    session.directoryJob = job;
  });
}

export function updateDirectorySessionJob(
  runId: string,
  patch: Partial<SessionJobRecord>,
): DiscoverySessionRecord | undefined {
  return mutateDiscoverySession(runId, (session) => {
    if (!session.directoryJob) {
      return;
    }

    session.directoryJob = {
      ...session.directoryJob,
      ...patch,
    } as SessionJobRecord;
  });
}

export function upsertInspectionSessionJob(
  runId: string,
  job: SessionJobRecord,
): DiscoverySessionRecord | undefined {
  return mutateDiscoverySession(runId, (session) => {
    const index = session.inspectionJobs.findIndex((existing) => existing.id === job.id);
    if (index >= 0) {
      session.inspectionJobs[index] = job;
      return;
    }

    session.inspectionJobs.push(job);
  });
}

export function updateInspectionSessionJob(
  runId: string,
  jobId: string,
  patch: Partial<SessionJobRecord>,
): DiscoverySessionRecord | undefined {
  return mutateDiscoverySession(runId, (session) => {
    const index = session.inspectionJobs.findIndex((job) => job.id === jobId);
    if (index < 0) {
      return;
    }

    session.inspectionJobs[index] = {
      ...session.inspectionJobs[index],
      ...patch,
    } as SessionJobRecord;
  });
}

export interface InspectionSessionMetrics {
  totalCompanies: number;
  startedInspections: number;
  completedInspections: number;
  failedInspections: number;
  partialInspections: number;
}

export function getInspectionSessionMetrics(runId: string): InspectionSessionMetrics {
  const session = sessions.get(runId);
  const inspectionJobs = session?.inspectionJobs ?? [];

  return {
    totalCompanies: inspectionJobs.length,
    startedInspections: inspectionJobs.filter(
      (job) => job.status !== "pending",
    ).length,
    completedInspections: inspectionJobs.filter((job) => job.status === "completed").length,
    failedInspections: inspectionJobs.filter(
      (job) => job.status === "failed" || job.status === "cancelled",
    ).length,
    partialInspections: inspectionJobs.filter((job) => job.status === "partial").length,
  };
}

export function resetDiscoverySessions(): void {
  sessions.clear();
}
