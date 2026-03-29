import type { DemoRun, RevonAdapterStatus } from "@revon-tinyfish/contracts";

interface PushToRevonButtonProps {
  run: DemoRun | null;
  revonStatus: RevonAdapterStatus | null;
  isSubmitting: boolean;
  onPush: () => Promise<void>;
  selectedLeadIds?: string[] | undefined;
  summary?:
    | {
        attempted: number;
        succeeded: number;
        failed: number;
        dryRun: boolean;
        requestId: string | null;
        message: string | null;
      }
    | undefined;
}

export function PushToRevonButton({
  run,
  revonStatus,
  isSubmitting,
  onPush,
  selectedLeadIds,
  summary,
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
        <p className="eyebrow">Revon sync</p>
        <h2>Sync shortlist for outbound sequencing</h2>
      </div>

      <p className="muted">
        Push qualified prospects into Revon to queue them for outbound sequencing. Destination: {revonStatus?.destination ?? "loading..."}
        {revonStatus?.dryRun ? " (dry-run mode)" : ""}
      </p>

      {run?.status === "partial" ? (
        <p className="muted">
          This workflow completed with degraded output. Sync is available for reviewable qualified prospects.
        </p>
      ) : null}

      <button
        className="primary-button"
        disabled
        onClick={() => void onPush()}
        type="button"
      >
        CRM sync (disabled for submission build)
      </button>

      <p className="muted" style={{ marginTop: "12px", fontStyle: "italic" }}>
        Revon sync integration is temporarily disabled in this standalone submission build.
      </p>

      {run?.push.message ? <p className="success-note">{run.push.message}</p> : null}
      {run?.push.status === "completed" ? (
        <p className="muted">
          {run.push.pushedCompanyCount} prospect{run.push.pushedCompanyCount !== 1 ? "s" : ""} queued for outreach
          {" | "}{run.push.pushedContactCount} contact{run.push.pushedContactCount !== 1 ? "s" : ""}
          {" | "}{run.push.dryRun ? "dry-run" : "live sync"}
        </p>
      ) : null}
      {summary ? (
        <ul className="stack-list compact-list">
          <li>
            Attempted {summary.attempted} | Succeeded {summary.succeeded} | Failed {summary.failed}
          </li>
          <li>
            {summary.dryRun ? "Dry-run mode" : "Live sync"}
            {summary.requestId ? ` | request ${summary.requestId}` : ""}
            {summary.message ? ` | ${summary.message}` : ""}
          </li>
        </ul>
      ) : null}
      {run?.push.error ? <p className="inline-error">{run.push.error}</p> : null}
    </section>
  );
}
