import type { DemoRun, RevonAdapterStatus } from "@revon-tinyfish/contracts";

interface PushToRevonButtonProps {
  run: DemoRun | null;
  revonStatus: RevonAdapterStatus | null;
  isSubmitting: boolean;
  onPush: () => Promise<void>;
  selectedLeadIds?: string[] | undefined;
}

export function PushToRevonButton({
  run,
  revonStatus,
  isSubmitting,
  onPush,
  selectedLeadIds,
}: PushToRevonButtonProps) {
  const selectedLeadIdSet = selectedLeadIds ? new Set(selectedLeadIds) : null;
  const qualifiedCount =
    run?.leads.filter(
      (lead) =>
        lead.score.qualificationState === "qualified" &&
        (!selectedLeadIdSet || selectedLeadIdSet.has(lead.id)),
    ).length ?? 0;
  const canPush = Boolean(run && (run.status === "completed" || run.status === "partial") && qualifiedCount > 0);

  return (
    <section className="panel panel-push">
      <div className="panel-header compact">
        <p className="eyebrow">Revon handoff</p>
        <h2>Push qualified leads</h2>
      </div>

      <p className="muted">
        Destination: {revonStatus?.destination ?? "loading..."}
        {revonStatus?.dryRun ? " (dry-run mode)" : ""}
      </p>

      {run?.status === "partial" ? (
        <p className="muted">
          This run completed with degradation. Push is still allowed for reviewable qualified leads.
        </p>
      ) : null}

      <button
        className="primary-button"
        disabled={!canPush || isSubmitting}
        onClick={() => void onPush()}
        type="button"
      >
        {isSubmitting ? "Pushing..." : `Push ${qualifiedCount} selected qualified lead(s) to Revon`}
      </button>

      {run?.push.message ? <p className="success-note">{run.push.message}</p> : null}
      {run?.push.status === "completed" ? (
        <p className="muted">
          Push mode: {run.push.dryRun ? "dry-run" : "live"} | Companies: {run.push.pushedCompanyCount}
          {" | "}Contacts: {run.push.pushedContactCount}
        </p>
      ) : null}
      {run?.push.error ? <p className="inline-error">{run.push.error}</p> : null}
    </section>
  );
}
