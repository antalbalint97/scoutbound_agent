import type { DemoRun } from "@revon-tinyfish/contracts";

interface RunTimelineProps {
  run: DemoRun | null;
}

function statusLabel(status: DemoRun["steps"][number]["status"]): string {
  if (status === "active") {
    return "Running";
  }
  if (status === "done") {
    return "Done";
  }
  if (status === "error") {
    return "Error";
  }
  return "Pending";
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

          {run.error ? <p className="inline-error">{run.error}</p> : null}
        </>
      )}
    </section>
  );
}
