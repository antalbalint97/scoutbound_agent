import type { DemoRun } from "@revon-tinyfish/contracts";

interface RunTimelineProps {
  run: DemoRun | null;
}

function statusLabel(status: DemoRun["steps"][number]["status"]): string {
  if (status === "running") {
    return "Running";
  }
  if (status === "completed") {
    return "Completed";
  }
  if (status === "partial") {
    return "Partial";
  }
  if (status === "failed") {
    return "Failed";
  }
  if (status === "skipped") {
    return "Skipped";
  }
  return "Pending";
}

function runStatusLabel(status: DemoRun["status"]): string {
  if (status === "completed") {
    return "Completed";
  }
  if (status === "partial") {
    return "Completed with degradation";
  }
  if (status === "failed") {
    return "Failed";
  }
  return "Running";
}

export function RunTimeline({ run }: RunTimelineProps) {
  return (
    <section className="panel">
      <div className="panel-header compact">
        <p className="eyebrow">Run status</p>
        <h2>Agent trace</h2>
      </div>

      {!run ? (
        <p className="muted">
          No run yet. Start with an ICP and the demo will stream a live timeline here.
        </p>
      ) : (
        <>
          <div className="badge-row">
            <span className={`status-pill mode-${run.mode}`}>
              {run.mode === "live" ? "Live TinyFish" : "Mock backup"}
            </span>
            <span className={`status-pill quality-${run.quality}`}>
              {run.quality === "healthy" ? "Healthy" : "Degraded"}
            </span>
            <span className={`status-pill status-${run.status}`}>{runStatusLabel(run.status)}</span>
          </div>

          {run.modeReason ? <p className="muted mode-reason">{run.modeReason}</p> : null}

          <div className="summary-grid">
            <article>
              <span>Companies found</span>
              <strong>{run.summary.companiesFound}</strong>
            </article>
            <article>
              <span>Websites visited</span>
              <strong>{run.summary.websitesVisited}</strong>
            </article>
            <article>
              <span>Website failures</span>
              <strong>{run.summary.websiteFailures}</strong>
            </article>
            <article>
              <span>Partial leads</span>
              <strong>{run.summary.partialLeadCount}</strong>
            </article>
            <article>
              <span>Decision makers</span>
              <strong>{run.summary.decisionMakersFound}</strong>
            </article>
            <article>
              <span>Qualified leads</span>
              <strong>{run.summary.qualifiedLeadCount}</strong>
            </article>
          </div>

          {run.summary.directoryUrl ? (
            <p className="muted">
              Directory source:{" "}
              <a href={run.summary.directoryUrl} rel="noreferrer" target="_blank">
                {run.summary.directoryUrl}
              </a>
            </p>
          ) : null}

          <ol className="timeline">
            {run.steps.map((step) => (
              <li key={step.key}>
                <div className={`status-pill status-${step.status}`}>{statusLabel(step.status)}</div>
                <div>
                  <strong>{step.label}</strong>
                  <p>{step.detail ?? "Waiting for this step to begin."}</p>
                </div>
              </li>
            ))}
          </ol>

          {run.notes.length > 0 ? (
            <div className="run-notes">
              <h3>Run notes</h3>
              <ul className="stack-list compact-list">
                {run.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {run.error ? <p className="inline-error">{run.error}</p> : null}
        </>
      )}
    </section>
  );
}
