import type { DemoRun, ExperimentVariantSummary, SessionTelemetry } from "@revon-tinyfish/contracts";

interface TelemetryPanelProps {
  run: DemoRun | null;
  telemetry: SessionTelemetry | null;
  variantSummary: ExperimentVariantSummary | null;
  isRefreshing: boolean;
  error: string | null;
}

function formatWallTime(ms: number): string {
  if (ms <= 0) {
    return "0s";
  }

  if (ms < 1000) {
    return `${ms}ms`;
  }

  return `${(ms / 1000).toFixed(ms >= 10_000 ? 0 : 1)}s`;
}

function formatNullableMetric(value: number | null, suffix = ""): string {
  if (value === null) {
    return "n/a";
  }

  return `${value}${suffix}`;
}

function runLabel(status: SessionTelemetry["runStatus"]): string {
  if (status === "completed") {
    return "Completed";
  }
  if (status === "partial") {
    return "Partial";
  }
  if (status === "failed") {
    return "Failed";
  }
  return "Running";
}

function tinyFishRunLabel(status: SessionTelemetry["tinyfishRuns"][number]["finalStatus"]): string {
  if (status === "timed_out") {
    return "Timed out";
  }

  return status.replace(/_/g, " ");
}

export function TelemetryPanel({
  run,
  telemetry,
  variantSummary,
  isRefreshing,
  error,
}: TelemetryPanelProps) {
  return (
    <section className="panel">
      <div className="panel-header compact">
        <p className="eyebrow">Experiment telemetry</p>
        <h2>Optimization trace</h2>
      </div>

      {!run ? (
        <p className="muted">
          Start a run to capture session telemetry, TinyFish run timings, and experiment metrics.
        </p>
      ) : (
        <>
          <div className="badge-row">
            <span className={`status-pill status-${telemetry?.runStatus ?? run.status}`}>
              {runLabel(telemetry?.runStatus ?? run.status)}
            </span>
            <span className={`status-pill mode-${telemetry?.captureMode ?? run.mode}`}>
              {telemetry?.captureMode === "mock" || run.mode === "mock" ? "Mock path" : "Live path"}
            </span>
            <span className={`status-pill quality-${telemetry?.runQuality ?? run.quality}`}>
              {telemetry?.runQuality === "degraded" || run.quality === "degraded" ? "Degraded" : "Healthy"}
            </span>
            {telemetry?.creditsAvailable ? <span className="status-pill">Credits attached</span> : null}
            {isRefreshing ? <span className="status-pill status-running">Refreshing</span> : null}
          </div>

          <div className="telemetry-meta">
            <span>Session {run.id}</span>
            {telemetry?.correlationId ? <span>Correlation {telemetry.correlationId}</span> : null}
            <span>Experiment {run.experimentLabel}</span>
          </div>

          {error ? <p className="inline-error">{error}</p> : null}

          {telemetry ? (
            <>
              <div className="summary-grid telemetry-grid">
                <article>
                  <span>Wall clock</span>
                  <strong>{formatWallTime(telemetry.totalWallClockMs)}</strong>
                </article>
                <article>
                  <span>Qualified leads</span>
                  <strong>{telemetry.totalQualifiedLeads}</strong>
                </article>
                <article>
                  <span>Usable leads</span>
                  <strong>{telemetry.qualityMetrics.usableLeadCount}</strong>
                </article>
                <article>
                  <span>Partial or failed</span>
                  <strong>{telemetry.qualityMetrics.percentagePartialOrFailed}%</strong>
                </article>
                <article>
                  <span>Decision makers</span>
                  <strong>{telemetry.totalDecisionMakersFound}</strong>
                </article>
                <article>
                  <span>Public emails</span>
                  <strong>{telemetry.totalPublicEmailsFound}</strong>
                </article>
                <article>
                  <span>Runs per session</span>
                  <strong>{telemetry.costMetrics.runsPerSession}</strong>
                </article>
                <article>
                  <span>Seconds per qualified</span>
                  <strong>{formatNullableMetric(telemetry.costMetrics.secondsPerQualifiedLead, "s")}</strong>
                </article>
              </div>

              <div className="telemetry-sections">
                <section className="telemetry-section">
                  <h3>Variant benchmark</h3>
                  {variantSummary ? (
                    <div className="summary-grid telemetry-grid compact-grid">
                      <article>
                        <span>Sessions</span>
                        <strong>{variantSummary.sessionCount}</strong>
                      </article>
                      <article>
                        <span>Avg wall clock</span>
                        <strong>{formatWallTime(variantSummary.averageWallClockMs)}</strong>
                      </article>
                      <article>
                        <span>Avg qualified</span>
                        <strong>{variantSummary.averageQualifiedLeadCount}</strong>
                      </article>
                      <article>
                        <span>Avg partial or failed</span>
                        <strong>{variantSummary.averagePartialOrFailedPercentage}%</strong>
                      </article>
                    </div>
                  ) : (
                    <p className="muted">
                      No variant aggregate yet. Finish one or more runs with this experiment label to compare them.
                    </p>
                  )}
                </section>

                <section className="telemetry-section">
                  <h3>TinyFish runs</h3>
                  {telemetry.tinyfishRuns.length === 0 ? (
                    <p className="muted">TinyFish run telemetry will appear here as the session progresses.</p>
                  ) : (
                    <ul className="stack-list compact-list telemetry-run-list">
                      {telemetry.tinyfishRuns.map((tinyfishRun) => (
                        <li key={tinyfishRun.tinyfishRunId}>
                          <div className="telemetry-run-top">
                            <strong>
                              {tinyfishRun.stage === "directory_discovery"
                                ? "Directory discovery"
                                : tinyfishRun.companyName || "Website inspection"}
                            </strong>
                            <span className={`status-pill status-${tinyfishRun.finalStatus}`}>
                              {tinyFishRunLabel(tinyfishRun.finalStatus)}
                            </span>
                          </div>
                          <p className="muted telemetry-run-copy">{tinyfishRun.targetUrl}</p>
                          <div className="meta-row">
                            <span>run {tinyfishRun.tinyfishRunId}</span>
                            {tinyfishRun.inspectionStatus ? <span>{tinyfishRun.inspectionStatus}</span> : null}
                            <span>{formatNullableMetric(tinyfishRun.durationMs, "ms")}</span>
                            <span>
                              credits {tinyfishRun.creditUsage === null ? "n/a" : tinyfishRun.creditUsage}
                            </span>
                            {tinyfishRun.timeoutFlag ? <span>timeout</span> : null}
                            {tinyfishRun.degradedFlag ? <span>degraded</span> : null}
                          </div>
                          {tinyfishRun.errorMessage ? (
                            <p className="inline-error telemetry-inline-error">{tinyfishRun.errorMessage}</p>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            </>
          ) : (
            <p className="muted">Telemetry snapshot not loaded yet.</p>
          )}
        </>
      )}
    </section>
  );
}
