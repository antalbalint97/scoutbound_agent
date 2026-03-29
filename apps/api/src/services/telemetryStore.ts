import {
  experimentComparisonSchema,
  experimentVariantSummarySchema,
  sessionTelemetrySchema,
  tinyFishRunTelemetrySchema,
  type DemoRun,
  type ExperimentComparison,
  type ExperimentVariantSummary,
  type LeadRecord,
  type SessionTelemetry,
  type TinyFishRunTelemetry,
} from "@revon-tinyfish/contracts";

const telemetrySessions = new Map<string, SessionTelemetry>();
const MAX_TELEMETRY_SESSIONS = Math.max(
  10,
  Number.parseInt(process.env.TELEMETRY_MAX_SESSIONS ?? "200", 10) || 200,
);

function cloneTelemetry<T>(value: T): T {
  return structuredClone(value);
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function averageNullable(values: Array<number | null>): number | null {
  const filtered = values.filter((value): value is number => value !== null);
  if (filtered.length === 0) {
    return null;
  }
  return average(filtered);
}

function roundMetric(value: number): number {
  return Number(value.toFixed(2));
}

function pruneOldSessions(): void {
  while (telemetrySessions.size > MAX_TELEMETRY_SESSIONS) {
    const oldestKey = telemetrySessions.keys().next().value;
    if (!oldestKey) {
      break;
    }
    telemetrySessions.delete(oldestKey);
  }
}

function computeSessionMetrics(base: SessionTelemetry, leads: LeadRecord[] = []): SessionTelemetry {
  const inspectionRuns = base.tinyfishRuns.filter((run) => run.stage === "website_inspection");
  const qualifiedLeads = leads.filter((lead) => lead.score.qualificationState === "qualified");
  const reviewLeads = leads.filter((lead) => lead.score.qualificationState === "review");
  const unqualifiedLeads = leads.filter((lead) => lead.score.qualificationState === "unqualified");
  const usableLeads = leads.filter((lead) => lead.inspectionStatus !== "failed");
  const highConfidenceLeads = leads.filter((lead) => lead.score.confidence === "high");
  const decisionMakerLeadCount = leads.filter((lead) =>
    lead.contacts.some((contact) => contact.isDecisionMaker),
  ).length;
  const publicEmailLeadCount = leads.filter((lead) =>
    lead.contacts.some((contact) => Boolean(contact.email)),
  ).length;
  const totalDecisionMakersFound = leads.reduce(
    (total, lead) => total + lead.contacts.filter((contact) => contact.isDecisionMaker).length,
    0,
  );
  const totalPublicEmailsFound = new Set(
    leads.flatMap((lead) =>
      lead.contacts
        .map((contact) => contact.email?.toLowerCase() ?? null)
        .filter((email): email is string => Boolean(email)),
    ),
  ).size;
  const totalCompaniesInspected = inspectionRuns.length;
  const totalCompletedInspections = inspectionRuns.filter(
    (run) => run.inspectionStatus === "completed",
  ).length;
  const totalPartialInspections = inspectionRuns.filter(
    (run) => run.inspectionStatus === "partial",
  ).length;
  const totalFailedInspections = inspectionRuns.filter(
    (run) =>
      run.finalStatus === "failed" ||
      run.finalStatus === "cancelled" ||
      run.finalStatus === "timed_out" ||
      run.inspectionStatus === "failed",
  ).length;
  const creditsAvailable = base.tinyfishRuns.some((run) => run.creditUsage !== null);
  const totalWallClockMs =
    base.totalWallClockMs > 0
      ? base.totalWallClockMs
      : base.runCompletedAt && base.runStartedAt
        ? Math.max(0, Date.parse(base.runCompletedAt) - Date.parse(base.runStartedAt))
        : 0;

  return sessionTelemetrySchema.parse({
    ...base,
    totalCompaniesInspected,
    totalCompletedInspections,
    totalPartialInspections,
    totalFailedInspections,
    totalQualifiedLeads: qualifiedLeads.length,
    totalReviewLeads: reviewLeads.length,
    totalUnqualifiedLeads: unqualifiedLeads.length,
    totalDecisionMakersFound,
    totalPublicEmailsFound,
    totalWallClockMs,
    qualityMetrics: {
      usableLeadCount: usableLeads.length,
      highConfidenceLeadCount: highConfidenceLeads.length,
      averageFitScore: roundMetric(average(leads.map((lead) => lead.score.fitScore))),
      averageContactabilityScore: roundMetric(
        average(leads.map((lead) => lead.score.contactabilityScore)),
      ),
      averageQualityScore: roundMetric(average(leads.map((lead) => lead.score.qualityScore))),
      averageTotalScore: roundMetric(average(leads.map((lead) => lead.score.totalScore))),
      averageContactsPerUsableLead: usableLeads.length
        ? roundMetric(
            usableLeads.reduce((total, lead) => total + lead.contacts.length, 0) / usableLeads.length,
          )
        : 0,
      averageEvidenceSourcesPerLead: leads.length
        ? roundMetric(leads.reduce((total, lead) => total + lead.evidence.length, 0) / leads.length)
        : 0,
      percentageWithDecisionMaker: leads.length
        ? roundMetric((decisionMakerLeadCount / leads.length) * 100)
        : 0,
      percentageWithPublicEmail: leads.length
        ? roundMetric((publicEmailLeadCount / leads.length) * 100)
        : 0,
      percentageWithCompletedInspection: leads.length
        ? roundMetric(
            (leads.filter((lead) => lead.inspectionStatus === "completed").length / leads.length) * 100,
          )
        : 0,
      percentagePartialOrFailed: leads.length
        ? roundMetric(
            (leads.filter((lead) => lead.inspectionStatus !== "completed").length / leads.length) * 100,
          )
        : 0,
    },
    costMetrics: {
      secondsPerQualifiedLead: qualifiedLeads.length
        ? roundMetric(totalWallClockMs / 1000 / qualifiedLeads.length)
        : null,
      secondsPerUsableLead: usableLeads.length
        ? roundMetric(totalWallClockMs / 1000 / usableLeads.length)
        : null,
      runsPerSession: base.tinyfishRuns.length,
      inspectionsPerQualifiedLead: qualifiedLeads.length
        ? roundMetric(totalCompaniesInspected / qualifiedLeads.length)
        : null,
      creditsPerSession: creditsAvailable
        ? roundMetric(
            base.tinyfishRuns.reduce((total, run) => total + (run.creditUsage ?? 0), 0),
          )
        : null,
      creditsPerUsableLead:
        creditsAvailable && usableLeads.length
          ? roundMetric(
              base.tinyfishRuns.reduce((total, run) => total + (run.creditUsage ?? 0), 0) /
                usableLeads.length,
            )
          : null,
    },
    creditsAvailable,
  });
}

export function createTelemetrySession(input: {
  sessionId: string;
  agentSessionId: string;
  correlationId?: string | null;
  experimentLabel: string;
  captureMode: "live" | "mock";
  directoryUrl?: string | null;
  runStartedAt: string;
}): SessionTelemetry {
  const session = sessionTelemetrySchema.parse({
    sessionId: input.sessionId,
    agentSessionId: input.agentSessionId,
    correlationId: input.correlationId ?? null,
    experimentLabel: input.experimentLabel,
    captureMode: input.captureMode,
    directoryUrl: input.directoryUrl ?? null,
    runStartedAt: input.runStartedAt,
    tinyfishRuns: [],
  });

  telemetrySessions.set(session.sessionId, session);
  pruneOldSessions();
  return cloneTelemetry(session);
}

export function getTelemetrySession(sessionId: string): SessionTelemetry | undefined {
  const session = telemetrySessions.get(sessionId);
  return session ? cloneTelemetry(session) : undefined;
}

export function listTelemetrySessions(): SessionTelemetry[] {
  return [...telemetrySessions.values()]
    .map((session) => cloneTelemetry(session))
    .sort((left, right) => right.runStartedAt.localeCompare(left.runStartedAt));
}

export function updateTelemetrySession(
  sessionId: string,
  patch: Partial<SessionTelemetry>,
  leads?: LeadRecord[],
): SessionTelemetry | undefined {
  const existing = telemetrySessions.get(sessionId);
  if (!existing) {
    return undefined;
  }

  const merged = sessionTelemetrySchema.parse({
    ...existing,
    ...patch,
    tinyfishRuns: patch.tinyfishRuns ?? existing.tinyfishRuns,
  });
  const next = computeSessionMetrics(merged, leads);
  telemetrySessions.set(sessionId, next);
  return cloneTelemetry(next);
}

export function upsertTinyFishRunTelemetry(
  sessionId: string,
  runTelemetry: TinyFishRunTelemetry,
  leads?: LeadRecord[],
): SessionTelemetry | undefined {
  const existing = telemetrySessions.get(sessionId);
  if (!existing) {
    return undefined;
  }

  const parsedRun = tinyFishRunTelemetrySchema.parse(runTelemetry);
  const index = existing.tinyfishRuns.findIndex((item) => item.tinyfishRunId === parsedRun.tinyfishRunId);
  const nextRuns = [...existing.tinyfishRuns];
  if (index >= 0) {
    nextRuns[index] = parsedRun;
  } else {
    nextRuns.push(parsedRun);
  }

  return updateTelemetrySession(
    sessionId,
    {
      tinyfishRuns: nextRuns,
    },
    leads,
  );
}

export function updateTinyFishRunTelemetry(
  sessionId: string,
  tinyfishRunId: string,
  patch: Partial<TinyFishRunTelemetry>,
  leads?: LeadRecord[],
): SessionTelemetry | undefined {
  const existing = telemetrySessions.get(sessionId);
  if (!existing) {
    return undefined;
  }

  const current = existing.tinyfishRuns.find((item) => item.tinyfishRunId === tinyfishRunId);
  if (!current) {
    return undefined;
  }

  return upsertTinyFishRunTelemetry(
    sessionId,
    {
      ...current,
      ...patch,
      tinyfishRunId,
      parentSessionId: current.parentSessionId,
    },
    leads,
  );
}

export function syncTelemetrySessionWithRun(
  sessionId: string,
  run: DemoRun,
  leads?: LeadRecord[],
): SessionTelemetry | undefined {
  return updateTelemetrySession(
    sessionId,
    {
      captureMode: run.mode,
      runStatus: run.status,
      runQuality: run.quality,
      directoryUrl: run.summary.directoryUrl,
      runCompletedAt: run.completedAt ?? null,
      totalWallClockMs: run.summary.wallTimeMs,
      totalCompaniesFound: run.summary.companiesFound,
    },
    leads ?? run.leads,
  );
}

export function finalizeTelemetrySession(sessionId: string, run: DemoRun): SessionTelemetry | undefined {
  return syncTelemetrySessionWithRun(sessionId, run, run.leads);
}

export function listExperimentVariantSummaries(): ExperimentVariantSummary[] {
  const grouped = new Map<string, SessionTelemetry[]>();
  for (const session of telemetrySessions.values()) {
    const bucket = grouped.get(session.experimentLabel) ?? [];
    bucket.push(session);
    grouped.set(session.experimentLabel, bucket);
  }

  return [...grouped.entries()]
    .map(([experimentLabel, sessions]) =>
      experimentVariantSummarySchema.parse({
        experimentLabel,
        sessionCount: sessions.length,
        averageWallClockMs: roundMetric(average(sessions.map((session) => session.totalWallClockMs))),
        averageQualifiedLeadCount: roundMetric(
          average(sessions.map((session) => session.totalQualifiedLeads)),
        ),
        averageUsableLeadCount: roundMetric(
          average(sessions.map((session) => session.qualityMetrics.usableLeadCount)),
        ),
        averageTotalScore: roundMetric(
          average(sessions.map((session) => session.qualityMetrics.averageTotalScore)),
        ),
        averagePartialOrFailedPercentage: roundMetric(
          average(sessions.map((session) => session.qualityMetrics.percentagePartialOrFailed)),
        ),
        averageSecondsPerQualifiedLead: averageNullable(
          sessions.map((session) => session.costMetrics.secondsPerQualifiedLead),
        ),
        averageCreditsPerUsableLead: averageNullable(
          sessions.map((session) => session.costMetrics.creditsPerUsableLead),
        ),
      }),
    )
    .sort((left, right) => left.experimentLabel.localeCompare(right.experimentLabel));
}

export function compareExperimentVariants(
  leftLabel: string,
  rightLabel: string,
): ExperimentComparison | null {
  const variants = listExperimentVariantSummaries();
  const left = variants.find((variant) => variant.experimentLabel === leftLabel);
  const right = variants.find((variant) => variant.experimentLabel === rightLabel);

  if (!left || !right) {
    return null;
  }

  return experimentComparisonSchema.parse({
    left,
    right,
    delta: {
      wallClockMs: roundMetric(right.averageWallClockMs - left.averageWallClockMs),
      qualifiedLeadCount: roundMetric(right.averageQualifiedLeadCount - left.averageQualifiedLeadCount),
      usableLeadCount: roundMetric(right.averageUsableLeadCount - left.averageUsableLeadCount),
      averageTotalScore: roundMetric(right.averageTotalScore - left.averageTotalScore),
      partialOrFailedPercentage: roundMetric(
        right.averagePartialOrFailedPercentage - left.averagePartialOrFailedPercentage,
      ),
      secondsPerQualifiedLead:
        left.averageSecondsPerQualifiedLead !== null && right.averageSecondsPerQualifiedLead !== null
          ? roundMetric(right.averageSecondsPerQualifiedLead - left.averageSecondsPerQualifiedLead)
          : null,
    },
  });
}

export function resetTelemetryStore(): void {
  telemetrySessions.clear();
}
