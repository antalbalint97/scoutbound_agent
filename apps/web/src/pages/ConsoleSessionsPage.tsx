import { useEffect, useState } from "react";
import type { PersistedSessionSummary } from "@revon-tinyfish/contracts";
import { ConsoleLayout } from "../components/ConsoleLayout";
import { listSavedSessionsPage } from "../lib/api";
import { getActiveExecution } from "../lib/activeExecution";

interface ConsoleSessionsPageProps {
  onOpenSession: (sessionId: string) => void;
}

const PAGE_SIZE = 10;

function formatRelativeTime(value: string | null): string {
  if (!value) return "—";
  const ms = Date.now() - new Date(value).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  if (ms < 604_800_000) return `${Math.floor(ms / 86_400_000)}d ago`;
  return new Date(value).toLocaleDateString();
}

function formatFullDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function lifecycleLabel(status: PersistedSessionSummary["lifecycleStatus"]): string {
  if (status === "pushed_complete") return "Synced";
  if (status === "pushed_partial") return "Partial sync";
  if (status === "completed") return "Completed";
  if (status === "running") return "Running";
  if (status === "failed") return "Failed";
  return "Created";
}

function LifecycleBadge({ status }: { status: PersistedSessionSummary["lifecycleStatus"] }) {
  return (
    <span className={`lifecycle-badge lifecycle-${status}`}>{lifecycleLabel(status)}</span>
  );
}

function crmSyncLabel(session: PersistedSessionSummary): string {
  if (session.importStatus === "running") return "Pending";
  if (session.importStatus === "error") return "Failed";
  if (session.importStatus === "completed") return session.importDryRun ? "Dry run" : "Synced";
  return "—";
}

function CrmSyncBadge({ session }: { session: PersistedSessionSummary }) {
  const label = crmSyncLabel(session);
  const cls =
    label === "Synced"
      ? "sync-synced"
      : label === "Dry run"
        ? "sync-dryrun"
        : label === "Failed"
          ? "sync-failed"
          : "sync-none";
  return <span className={`sync-badge ${cls}`}>{label}</span>;
}

export function ConsoleSessionsPage({ onOpenSession }: ConsoleSessionsPageProps) {
  const [sessions, setSessions] = useState<PersistedSessionSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [cursorHistory, setCursorHistory] = useState<Array<string | null>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  useEffect(() => {
    const active = getActiveExecution();
    setActiveSessionId(active?.sessionId ?? null);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadPage() {
      setIsLoading(true);
      try {
        const page = await listSavedSessionsPage(PAGE_SIZE, cursor ?? undefined);
        if (!cancelled) {
          setSessions(page.items);
          setNextCursor(page.nextCursor);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load sessions.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadPage();

    return () => {
      cancelled = true;
    };
  }, [cursor]);

  function goToNextPage() {
    if (!nextCursor) {
      return;
    }

    setCursorHistory((current) => [...current, cursor]);
    setCursor(nextCursor);
  }

  function goToPreviousPage() {
    setCursorHistory((current) => {
      const previous = [...current];
      const lastCursor = previous.pop() ?? null;
      setCursor(lastCursor);
      return previous;
    });
  }

  return (
    <ConsoleLayout
      activeNav="sessions"
      title="Workflow execution history"
      subtitle="Browse completed prospect sourcing executions, inspect status and output quality, and open the detail surface for any workflow."
    >
      {error ? <p className="inline-error page-error">{error}</p> : null}

      <section className="panel">
        <div className="panel-header compact">
          <p className="eyebrow">Execution library</p>
          <h2>Prospect sourcing history</h2>
        </div>

        {isLoading ? (
          <div className="table-scroll">
            <table className="console-table">
              <thead>
                <tr>
                  <th>Execution ID</th>
                  <th>Status</th>
                  <th>Mode</th>
                  <th>Experiment</th>
                  <th>Started</th>
                  <th>Completed</th>
                  <th>Prospects</th>
                  <th>CRM sync (disabled)</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 6 }, (_, i) => (
                  <tr key={i}>
                    <td><span className="skeleton skeleton-line wide" /></td>
                    <td><span className="skeleton skeleton-line medium" /></td>
                    <td><span className="skeleton skeleton-line short" /></td>
                    <td><span className="skeleton skeleton-line medium" /></td>
                    <td><span className="skeleton skeleton-line medium" /></td>
                    <td><span className="skeleton skeleton-line medium" /></td>
                    <td><span className="skeleton skeleton-line short" /></td>
                    <td><span className="skeleton skeleton-line short" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : sessions.length === 0 ? (
          <div className="empty-state">
            <p className="empty-state-title">No workflow executions yet</p>
            <p>Launch a prospect sourcing workflow and completed executions will appear here.</p>
          </div>
        ) : (
          <>
            <div className="table-scroll">
              <table className="console-table">
                <thead>
                  <tr>
                    <th>Execution ID</th>
                    <th>Status</th>
                    <th>Mode</th>
                    <th>Experiment</th>
                    <th>Started</th>
                    <th>Completed</th>
                    <th>Prospects</th>
                    <th>CRM sync (disabled)</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((session) => (
                    <tr
                      key={session.id}
                      onClick={() => onOpenSession(session.id)}
                      className={session.id === activeSessionId ? "active-row" : ""}
                    >
                      <td title={session.id}>
                        {session.id.slice(0, 12)}…
                        {session.id === activeSessionId && (
                          <span className="active-marker" title="Currently active session">
                            {" "}
                            (Active)
                          </span>
                        )}
                      </td>
                      <td>
                        <LifecycleBadge status={session.lifecycleStatus} />
                      </td>
                      <td>{session.mode}</td>
                      <td>{session.experimentLabel}</td>
                      <td title={formatFullDateTime(session.startedAt)}>
                        {formatRelativeTime(session.startedAt)}
                      </td>
                      <td title={formatFullDateTime(session.completedAt)}>
                        {formatRelativeTime(session.completedAt)}
                      </td>
                      <td>
                        <span title={`${session.leadCount} total`}>
                          {session.qualifiedLeadCount} / {session.leadCount}
                        </span>
                      </td>
                      <td>
                        <CrmSyncBadge session={session} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="table-pagination">
              <button
                className="secondary-button"
                disabled={cursorHistory.length === 0}
                onClick={goToPreviousPage}
                type="button"
              >
                Previous
              </button>
              <button
                className="secondary-button"
                disabled={!nextCursor}
                onClick={goToNextPage}
                type="button"
              >
                Next
              </button>
            </div>
          </>
        )}
      </section>
    </ConsoleLayout>
  );
}
