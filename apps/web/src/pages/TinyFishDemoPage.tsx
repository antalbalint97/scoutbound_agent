import { ArrowRight, Database, Radar, Sparkles, ShieldCheck, Workflow } from "lucide-react";
import { navigateToConsoleRuns, navigateToConsoleSessions } from "../lib/routes";

export function TinyFishDemoPage() {
  return (
    <>
      <nav className="landing-nav landing-nav-modern">
        <div className="landing-nav-inner">
          <div className="landing-logo">
            <img src="/scoutbound_appicon_blue_512.png" alt="Scoutbound" style={{ height: 32, width: 32 }} />
            <div>
              <div style={{ fontSize: "0.92rem", fontWeight: 800, letterSpacing: "-0.03em" }}>Scoutbound</div>
              <div className="landing-logo-sub">Powered by TinyFish</div>
            </div>
          </div>
          <div className="landing-nav-actions">
            <span className="landing-nav-badge">Demo mode</span>
            <button className="ghost-button" onClick={navigateToConsoleSessions} type="button">
              History
            </button>
            <button className="primary-button" onClick={navigateToConsoleRuns} type="button">
              Open Console
            </button>
          </div>
        </div>
      </nav>

      <main className="page-shell landing-shell">
        <section className="hero landing-hero">
          <div className="landing-hero-copy">
            <p className="eyebrow">Scoutbound - live web agent demo</p>
            <h1>Prospect sourcing that looks and feels like an operating system.</h1>
            <p className="hero-copy landing-copy">
              Launch a real browsing workflow, watch it inspect live company sites, review the scored shortlist,
              and test the CRM handoff in one place.
            </p>
            <div className="button-row landing-actions">
              <button className="primary-button" onClick={navigateToConsoleRuns} type="button">
                Open operator console
              </button>
              <button className="secondary-button" onClick={navigateToConsoleSessions} type="button">
                View workflow history
              </button>
            </div>
            <div className="landing-status-row">
              <span className="console-chip console-chip-primary">
                <Sparkles size={12} />
                Prompt editable
              </span>
              <span className="console-chip">
                <Workflow size={12} />
                3-5 minute live run
              </span>
              <span className="console-chip">
                <ShieldCheck size={12} />
                Zoho test ready
              </span>
            </div>
          </div>

          <section className="panel landing-panel hero-snapshot landing-spotlight">
            <div className="panel-header compact">
              <p className="eyebrow">Live sourcing overview</p>
              <h2>Ready to launch a real run</h2>
            </div>
            <div className="empty-state landing-empty">
              <p className="empty-state-title">Prompt-first, traceable, CRM-ready</p>
              <p>
                The operator console shows the prompt, live trace, lead scoring, and Zoho handoff once you start
                a workflow.
              </p>
              <div className="landing-empty-grid">
                <span className="landing-empty-pill">
                  <Radar size={12} />
                  Live browsing
                </span>
                <span className="landing-empty-pill">
                  <Database size={12} />
                  Evidence trail
                </span>
                <span className="landing-empty-pill">
                  <ShieldCheck size={12} />
                  CRM handoff
                </span>
              </div>
            </div>
            <div className="landing-spotlight-footer">
              <div>
                <p className="landing-foot-label">Where to inspect history</p>
                <strong>Console history tab or workflow detail pages</strong>
              </div>
              <button className="ghost-button" onClick={navigateToConsoleSessions} type="button">
                Open history <ArrowRight size={14} />
              </button>
            </div>
          </section>
        </section>

        <section className="landing-proof-strip">
          <div className="landing-proof-card">
            <span className="summary-card-label">Built for</span>
            <strong>SDR teams, RevOps, agencies, founders</strong>
          </div>
          <div className="landing-proof-card">
            <span className="summary-card-label">Core signal</span>
            <strong>Live web browsing, not a database wrapper</strong>
          </div>
          <div className="landing-proof-card">
            <span className="summary-card-label">Judge-friendly</span>
            <strong>Prompt, trace, evidence, CRM push</strong>
          </div>
        </section>

        <section className="landing-story section-block">
          <div className="section-header landing-section-header">
            <p className="eyebrow">Why it matters now</p>
            <h2>Manual prospect research is still expensive, inconsistent, and hard to audit.</h2>
            <p>Scoutbound turns that work into a traceable live workflow: browse, evaluate, enrich, and sync.</p>
          </div>
          <div className="value-cards landing-value-grid">
            <div className="summary-card value-card">
              <h4 className="value-card-title">Faster campaign prep</h4>
              <p>
                Replace hours of manual directory browsing and website inspection with an autonomous workflow that
                builds lists while your team sleeps.
              </p>
            </div>
            <div className="summary-card value-card">
              <h4 className="value-card-title">Consistent qualification</h4>
              <p>
                Every prospect is evaluated against the exact same ICP criteria. Eliminate human error and
                inconsistent scoring from your pipeline.
              </p>
            </div>
            <div className="summary-card value-card">
              <h4 className="value-card-title">CRM-ready handoff</h4>
              <p>
                Shortlists are delivered with extracted contact signals and full evidence trails, ready to be synced
                directly into your CRM for outbound sequencing.
              </p>
            </div>
          </div>
        </section>

        <section className="panel workflow-panel landing-workflow-panel">
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
            <div className="workflow-arrow">{"->"}</div>
            <div className="workflow-col-after">
              <span className="workflow-col-label">Automated workflow</span>
              <ul>
                <li>define ICP once</li>
                <li>launch sourcing workflow</li>
                <li>agent navigates sites autonomously</li>
                <li>prospects ranked by fit and reachability</li>
                <li>review evidence-backed shortlist</li>
                <li>CRM sync</li>
              </ul>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
