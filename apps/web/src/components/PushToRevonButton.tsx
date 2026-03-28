import type { DemoRun, RevonAdapterStatus } from "@revon-tinyfish/contracts";

interface PushToRevonButtonProps {
  run: DemoRun | null;
  revonStatus: RevonAdapterStatus | null;
  isSubmitting: boolean;
  onPush: () => Promise<void>;
}

export function PushToRevonButton({
  run,
  revonStatus,
  isSubmitting,
  onPush,
}: PushToRevonButtonProps) {
  const qualifiedCount =
    run?.leads.filter((lead) => lead.score.priority !== "low").length ?? 0;
  const canPush = Boolean(run && run.status === "completed" && qualifiedCount > 0);

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

      <button
        className="primary-button"
        disabled={!canPush || isSubmitting}
        onClick={() => void onPush()}
        type="button"
      >
        {isSubmitting ? "Pushing..." : `Push ${qualifiedCount} qualified lead(s) to Revon`}
      </button>

      {run?.push.message ? <p className="success-note">{run.push.message}</p> : null}
      {run?.push.error ? <p className="inline-error">{run.push.error}</p> : null}
    </section>
  );
}
