import type { ReactNode } from "react";
import { Rocket, History, ArrowLeft, ChevronRight } from "lucide-react";
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
    if (!target) {
      return;
    }

    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <main className="console-shell" data-testid="console-shell">
      <aside className="console-sidebar" data-testid="console-sidebar">
        <div className="console-brand">
          <div style={{ marginBottom: 16 }}>
            <img src="/scoutbound_logo_dark_2x.png" alt="Scoutbound" style={{ height: 24, width: "auto" }} />
          </div>
          <h1>Prospect Sourcing</h1>
          <p className="muted">
            Evidence-driven outbound prospect sourcing console
          </p>
        </div>

        <nav className="console-nav" data-testid="console-nav">
          <button
            className={`console-nav-item ${activeNav === "runs" ? "active" : ""}`}
            onClick={navigateToConsoleRuns}
            type="button"
            data-testid="nav-launch-sourcing"
          >
            <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Rocket size={16} />
              Launch Sourcing
            </span>
          </button>
          <button
            className={`console-nav-item ${activeNav === "sessions" ? "active" : ""}`}
            onClick={navigateToConsoleSessions}
            type="button"
            data-testid="nav-history"
          >
            <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <History size={16} />
              History
            </span>
          </button>

          {sectionLinks.length > 0 && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border-default)" }}>
              <span style={{
                fontSize: "0.7rem",
                fontWeight: 600,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "var(--text-muted)",
                display: "block",
                marginBottom: 8,
                paddingLeft: 14
              }}>
                Sections
              </span>
              {sectionLinks.map((item) => (
                <button
                  className={`console-nav-item subtle ${activeSectionId === item.id ? "active" : ""}`}
                  key={item.id}
                  onClick={() => {
                    if (item.onClick) {
                      item.onClick();
                    } else {
                      scrollToSection(item.id);
                    }
                  }}
                  type="button"
                  data-testid={`nav-section-${item.id}`}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <ChevronRight size={14} />
                    {item.label}
                  </span>
                </button>
              ))}
            </div>
          )}

          <div style={{ marginTop: "auto", paddingTop: 24 }}>
            <button
              className="console-nav-item"
              style={{
                color: "var(--text-muted)",
                borderTop: "1px solid var(--border-default)",
                borderRadius: 0,
                paddingTop: 16,
                marginTop: 8
              }}
              onClick={() => window.location.href = "/"}
              type="button"
              data-testid="nav-back-landing"
            >
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <ArrowLeft size={16} />
                Back to Landing
              </span>
            </button>
          </div>
        </nav>
      </aside>

      <section className="console-main">
        <header className="console-header" data-testid="console-header">
          <div>
            <p className="eyebrow">Scoutbound Console</p>
            <h2>{title}</h2>
          </div>
          {subtitle ? <p className="console-subtitle">{subtitle}</p> : null}
        </header>

        <div className="console-content" data-testid="console-content">
          {children}
        </div>
      </section>
    </main>
  );
}
