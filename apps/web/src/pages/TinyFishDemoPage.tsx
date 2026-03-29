import { useEffect, useState } from "react";
import type { PersistedSessionSummary } from "@revon-tinyfish/contracts";
import { SavedSessionList } from "../components/SavedSessionList";
import { listSavedSessions } from "../lib/api";
import { navigateToConsoleRuns, navigateToConsoleSessions } from "../lib/routes";

interface TinyFishDemoPageProps {
  onOpenSavedSession: (sessionId: string) => void;
}

export function TinyFishDemoPage({ onOpenSavedSession }: TinyFishDemoPageProps) {
  const [savedSessions, setSavedSessions] = useState<PersistedSessionSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadSessions() {
      setIsLoading(true);
      try {
        const sessions = await listSavedSessions();
        if (!cancelled) {
          setSavedSessions(sessions);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load workflow history.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadSessions();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="page-shell">
      <section className="hero landing-hero">
        <div>
          <p className="eyebrow">Revon × TinyFish</p>
          <h1>Autonomous outbound prospect sourcing for modern revenue teams</h1>
          <p className="hero-copy landing-copy">
            Replace manual SDR research with a web-agent workflow that navigates live company websites, scores fit, extracts contact signals, and delivers CRM-ready shortlists.
          </p>
          <div className="button-row landing-actions">
            <button className="primary-button" onClick={navigateToConsoleRuns} type="button">
              Open operator console
            </button>
            <button className="secondary-button" onClick={navigateToConsoleSessions} type="button">
              View workflow history
            </button>
          </div>
        </div>

        <section className="panel landing-panel hero-snapshot">
          <div className="panel-header compact">
            <p className="eyebrow">Live sourcing overview</p>
            <h2>{savedSessions.length > 0 ? "Latest workflow snapshot" : "No workflow executed yet"}</h2>
          </div>
          {savedSessions.length > 0 ? (
            <div className="summary-cards">
              <div className="summary-card">
                <span className="summary-card-label">Prospects discovered</span>
                <span className="summary-card-value">{savedSessions[0].leadCount}</span>
              </div>
              <div className="summary-card">
                <span className="summary-card-label">Qualified</span>
                <span className="summary-card-value" style={{ color: "#2e7750" }}>{savedSessions[0].qualifiedLeadCount}</span>
              </div>
              <div className="summary-card">
                <span className="summary-card-label">Evidence captured</span>
                <span className="summary-card-value">-</span>
              </div>
              <div className="summary-card">
                <span className="summary-card-label">CRM sync ready</span>
                <span className="summary-card-value">{savedSessions[0].qualifiedLeadCount}</span>
              </div>
            </div>
          ) : (
            <div className="empty-state" style={{ padding: "0 0 16px 0", textAlign: "left", alignItems: "flex-start" }}>
              <p style={{ maxWidth: "100%" }}>Launch a sourcing workflow to see real prospect, qualification, evidence, and CRM sync metrics here.</p>
            </div>
          )}
        </section>
      </section>

      <div className="persona-strip">
        <span className="persona-strip-label">Built for:</span>
        <div className="persona-chips">
          {(["SDR teams", "RevOps teams", "Lead generation agencies", "Founders doing outbound"] as const).map((p) => (
            <span className="persona-chip" key={p}>{p}</span>
          ))}
        </div>
      </div>

      <section className="business-value-section">
        <div className="value-cards">
          <div className="summary-card value-card">
            <h4 className="value-card-title">Faster campaign prep</h4>
            <p>
              Replace hours of manual directory browsing and website inspection with an autonomous workflow that builds lists while your team sleeps.
            </p>
          </div>
          <div className="summary-card value-card">
            <h4 className="value-card-title">Consistent qualification</h4>
            <p>
              Every prospect is evaluated against the exact same ICP criteria. Eliminate human error and inconsistent scoring from your pipeline.
            </p>
          </div>
          <div className="summary-card value-card">
            <h4 className="value-card-title">CRM-ready handoff</h4>
            <p>
              Shortlists are delivered with extracted contact signals and full evidence trails, ready to be synced directly into Revon for outbound sequencing.
            </p>
          </div>
        </div>
      </section>

      <section className="tf-rationale">
        <div className="tf-rationale-header">
          <p className="eyebrow">Why TinyFish</p>
          <h3>This workflow depends on real browser automation</h3>
          <p className="tf-rationale-sub">LLMs can qualify and reason. They cannot navigate. TinyFish bridges that gap.</p>
        </div>
        <div className="tf-rationale-grid summary-cards">
          <div className="summary-card tf-card">
            <strong className="tf-card-title">Live websites, not stale databases</strong>
            <p>Company fit signals update continuously. Only a live browser sees the current state.</p>
          </div>
          <div className="summary-card tf-card">
            <strong className="tf-card-title">Dynamic navigation and interaction</strong>
            <p>Reaching the right content requires scrolling and clicking—interactions static APIs cannot perform.</p>
          </div>
          <div className="summary-card tf-card">
            <strong className="tf-card-title">Stateful multi-step browsing</strong>
            <p>Discovery, inspection, and extraction span multiple coordinated runs with shared state.</p>
          </div>
          <div className="summary-card tf-card">
            <strong className="tf-card-title">Evidence captured inside business workflow</strong>
            <p>Every agent run is tracked and surfaced in the operator console with a full evidence trail.</p>
          </div>
        </div>
      </section>

      <section className="top-grid landing-grid">
        <SavedSessionList
          error={error}
          isLoading={isLoading}
          onOpenSession={onOpenSavedSession}
          sessions={savedSessions}
        />
        <section className="panel workflow-panel">
          <div className="panel-header compact">
            <p className="eyebrow">The manual workflow today</p>
            <h2>What the product automates</h2>
          </div>
          <div className="workflow-compare">
            <div className="workflow-col-before">
              <span className="workflow-col-label">Manual workflow</span>
              <ul>
                <li>browse directories manually</li>
                <li>inspect company websites one by one</li>
                <li>assess ICP fit by hand</li>
                <li>search for contact clues</li>
                <li>build a spreadsheet</li>
                <li>copy into CRM</li>
              </ul>
            </div>
            <div className="workflow-arrow">→</div>
            <div className="workflow-col-after">
              <span className="workflow-col-label">Automated workflow</span>
              <ul>
                <li>define ICP once</li>
                <li>launch sourcing workflow</li>
                <li>agent navigates sites autonomously</li>
                <li>prospects ranked by fit and reachability</li>
                <li>review evidence-backed shortlist</li>
                <li>sync into Revon</li>
              </ul>
            </div>
          </div>
        </section>
      </section>
          <section className="product-preview-section">
        <div className="panel-header compact preview-header">
          <p className="eyebrow">Product capabilities</p>
          <h2>Inside the operator console</h2>
        </div>
        <div className="summary-cards" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
          <div className="summary-card">
            <span className="summary-card-label">Execution</span>
            <p className="summary-card-value" style={{ fontSize: "1.1rem", marginBottom: "8px" }}>Launch sourcing workflows</p>
            <p className="summary-card-sub">Define ICP parameters and initiate autonomous web agent runs.</p>
          </div>
          <div className="summary-card">
            <span className="summary-card-label">Monitoring</span>
            <p className="summary-card-value" style={{ fontSize: "1.1rem", marginBottom: "8px" }}>Monitor live execution trace</p>
            <p className="summary-card-sub">Track agent reasoning and browser actions in real-time.</p>
          </div>
          <div className="summary-card">
            <span className="summary-card-label">Review</span>
            <p className="summary-card-value" style={{ fontSize: "1.1rem", marginBottom: "8px" }}>Review ranked prospects</p>
            <p className="summary-card-sub">Inspect automatically scored leads based on ICP fit.</p>
          </div>
          <div className="summary-card">
            <span className="summary-card-label">Evidence</span>
            <p className="summary-card-value" style={{ fontSize: "1.1rem", marginBottom: "8px" }}>Inspect evidence and contacts</p>
            <p className="summary-card-sub">Access captured screenshots and extracted contact signals.</p>
          </div>
          <div className="summary-card">
            <span className="summary-card-label">Export</span>
            <p className="summary-card-value" style={{ fontSize: "1.1rem", marginBottom: "8px" }}>Export JSON / CSV shortlists</p>
            <p className="summary-card-sub">Download qualified prospect data for external tools.</p>
          </div>
          <div className="summary-card">
            <span className="summary-card-label">Integration</span>
            <p className="summary-card-value" style={{ fontSize: "1.1rem", marginBottom: "8px" }}>Sync qualified leads to Revon</p>
            <p className="summary-card-sub">(disabled in submission build)</p>
          </div>
        </div>
      </section>
    </main>
  );
}
