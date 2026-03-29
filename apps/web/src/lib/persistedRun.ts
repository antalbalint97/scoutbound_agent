import type { DemoRun, PersistedSessionDetail } from "@revon-tinyfish/contracts";

export function toDemoRunFromPersistedSession(session: PersistedSessionDetail): DemoRun {
  const pushedLeads = session.leads.filter(
    (lead) => lead.revon.pushStatus === "succeeded" || lead.revon.pushStatus === "dry_run",
  );

  return {
    id: session.id,
    status: session.status,
    mode: session.mode,
    quality: session.quality,
    experimentLabel: session.experimentLabel,
    startedAt: session.startedAt,
    ...(session.completedAt ? { completedAt: session.completedAt } : {}),
    input: session.input,
    steps: session.steps,
    summary: session.summary,
    leads: session.leads,
    push: {
      status: session.importStatus,
      dryRun: session.importDryRun,
      pushedCompanyCount: pushedLeads.length,
      pushedContactCount: pushedLeads.reduce(
        (total, lead) => total + Math.max(lead.contacts.length, 1),
        0,
      ),
      destination: session.importDestination ?? "not-configured",
      requestId: session.importRequestId,
      message: session.importMessage,
      error: session.importError,
      pushedAt: session.importPushedAt,
    },
    notes: session.notes,
    ...(session.modeReason ? { modeReason: session.modeReason } : {}),
    ...(session.error ? { error: session.error } : {}),
  };
}
