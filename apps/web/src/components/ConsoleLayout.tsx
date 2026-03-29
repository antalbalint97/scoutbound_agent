import type { ReactNode } from "react";
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
    <main className="console-shell">
      <aside className="console-sidebar">
        <div className="console-brand">
          <p className="eyebrow">Revon outbound</p>
          <h1>Prospect sourcing</h1>
          <p className="muted">
            Autonomous web-agent workflow for prospect discovery, review, export, and CRM sync.
          </p>
        </div>

        <nav className="console-nav">
          <button
            className={`console-nav-item ${activeNav === "runs" ? "active" : ""}`}
            onClick={navigateToConsoleRuns}
            type="button"
          >
            Workflows
          </button>
          <button
            className={`console-nav-item ${activeNav === "sessions" ? "active" : ""}`}
            onClick={navigateToConsoleSessions}
            type="button"
          >
            History
          </button>
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
            >
              {item.label}
            </button>
          ))}
          <button
            className="console-nav-item"
            style={{ marginTop: "16px", color: "var(--muted)", borderTop: "1px solid var(--stroke)", borderRadius: 0, paddingTop: "16px" }}
            onClick={() => window.location.href = "/"}
            type="button"
          >
            ← Back to landing
          </button>
        </nav>
      </aside>

      <section className="console-main">
        <header className="console-header">
          <div>
            <p className="eyebrow">Outbound operator console</p>
            <h2>{title}</h2>
          </div>
          {subtitle ? <p className="console-subtitle">{subtitle}</p> : null}
        </header>

        <div className="console-content">{children}</div>
      </section>
    </main>
  );
}
