import type { ReactNode } from "react";
import { Rocket, History, ChevronRight, Home, Sparkles, ShieldCheck, Radar } from "lucide-react";
import { navigateToConsoleRuns, navigateToConsoleSessions } from "../lib/routes";

interface ConsoleLayoutProps {
  title: string;
  subtitle?: string;
  activeNav: "runs" | "sessions";
  children: ReactNode;
  sectionLinks?: Array<{
    id: string;
    label: string;
    onClick?: () => void;
  }>;
  activeSectionId?: string;
}

const NAV_ITEMS = [
  {
    key: "runs" as const,
    label: "Launch Sourcing",
    description: "Start a new workflow",
    icon: Rocket,
    onClick: navigateToConsoleRuns,
  },
  {
    key: "sessions" as const,
    label: "Workflow History",
    description: "Saved sessions & exports",
    icon: History,
    onClick: navigateToConsoleSessions,
  },
];

export function ConsoleLayout({
  title,
  subtitle,
  activeNav,
  children,
  sectionLinks = [],
  activeSectionId,
}: ConsoleLayoutProps) {
  function scrollToSection(id: string) {
    const target = document.getElementById(id);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <main className="console-shell" data-testid="console-shell">
      {/* ── Sidebar ── */}
      <aside className="console-sidebar" data-testid="console-sidebar">

        {/* Logo — same as landing nav */}
        <div className="console-logo-row">
          <img
            src="/scoutbound_appicon_blue_512.png"
            alt="Scoutbound"
            style={{ height: 28, width: 28 }}
          />
          <span className="console-logo-badge">Console</span>
        </div>

        <div className="console-sidebar-callout">
          <p className="console-sidebar-callout-label">Command center</p>
          <div className="console-sidebar-callout-row">
            <span className="console-chip console-chip-primary">
              <Sparkles size={12} />
              Live web agent
            </span>
            <span className="console-chip">
              <ShieldCheck size={12} />
              CRM-ready
            </span>
          </div>
          <p className="console-sidebar-callout-copy">
            Broad prompts, real browsing, evidence trails, and a push path that can be tested in production.
          </p>
        </div>

        {/* Primary nav */}
        <nav className="console-nav" data-testid="console-nav">
          <span className="console-nav-group-label">Workspace</span>
          {NAV_ITEMS.map(({ key, label, description, icon: Icon, onClick }) => (
            <button
              key={key}
              className={`console-nav-item ${activeNav === key ? "active" : ""}`}
              onClick={onClick}
              type="button"
              data-testid={`nav-${key}`}
            >
              <span className="console-nav-icon">
                <Icon size={16} />
              </span>
              <span className="console-nav-text">
                <span className="console-nav-label">{label}</span>
                <span className="console-nav-desc">{description}</span>
              </span>
            </button>
          ))}

          {/* Section links (contextual, per-page) */}
          {sectionLinks.length > 0 && (
            <>
              <span className="console-nav-group-label" style={{ marginTop: 12 }}>
                On this page
              </span>
              {sectionLinks.map((item) => (
                <button
                  className={`console-nav-item subtle ${activeSectionId === item.id ? "active" : ""}`}
                  key={item.id}
                  onClick={() => {
                    if (item.onClick) item.onClick();
                    else scrollToSection(item.id);
                  }}
                  type="button"
                  data-testid={`nav-section-${item.id}`}
                >
                  <span className="console-nav-icon">
                    <ChevronRight size={13} />
                  </span>
                  <span className="console-nav-text">
                    <span className="console-nav-label">{item.label}</span>
                  </span>
                </button>
              ))}
            </>
          )}
        </nav>

        {/* Footer */}
        <div className="console-sidebar-footer">
          <button
            className="console-nav-item console-back-btn"
            onClick={() => (window.location.href = "/")}
            type="button"
            data-testid="nav-back-landing"
          >
            <span className="console-nav-icon">
              <Home size={15} />
            </span>
            <span className="console-nav-text">
              <span className="console-nav-label">Back to Home</span>
            </span>
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <section className="console-main">
        <header className="console-header" data-testid="console-header">
          <div className="console-header-inner">
            <div className="console-header-copy">
              <p className="console-header-kicker">
                <Radar size={14} />
                Operator workspace
              </p>
              <h2>{title}</h2>
              {subtitle ? <p className="console-subtitle">{subtitle}</p> : null}
            </div>
            <div className="console-header-status">
              <span className="console-chip console-chip-primary">Prompt editable</span>
              <span className="console-chip">Zoho test ready</span>
              <span className="console-chip">History-aware</span>
            </div>
          </div>
        </header>

        <div className="console-content" data-testid="console-content">
          {children}
        </div>
      </section>
    </main>
  );
}
