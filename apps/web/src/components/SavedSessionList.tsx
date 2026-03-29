import type { PersistedSessionSummary } from "@revon-tinyfish/contracts";

interface SavedSessionListProps {
  sessions: PersistedSessionSummary[];
  isLoading: boolean;
  error: string | null;
  onOpenSession: (sessionId: string) => void;
}

function formatStartedAt(value: string): string {
  return new Date(value).toLocaleString();
}

export function SavedSessionList({
  sessions,
  isLoading,
  error,
  onOpenSession,
}: SavedSessionListProps) {
  return (
    <section className="panel">
      <div className="panel-header compact">
        <p className="eyebrow">Saved sessions</p>
        <h2>Recent discoveries</h2>
      </div>

      {error ? <p className="inline-error">{error}</p> : null}

      {isLoading ? (
        <p className="muted">Loading saved sessions...</p>
      ) : sessions.length === 0 ? (
        <p className="muted">No persisted sessions yet. Finish a discovery run and it will appear here.</p>
      ) : (
        <ul className="stack-list compact-list">
          {sessions.map((session) => (
            <li key={session.id}>
              <div className="saved-session-top">
                <div>
                  <strong>{session.experimentLabel}</strong>
                  <p className="muted">{formatStartedAt(session.startedAt)}</p>
                </div>
                <span className={`status-pill status-${session.status}`}>{session.status}</span>
              </div>
              <div className="meta-row">
                <span>{session.mode}</span>
                <span>{session.quality}</span>
                <span>{session.qualifiedLeadCount} qualified</span>
                <span>{session.usableLeadCount} usable</span>
              </div>
              <button
                className="secondary-button"
                onClick={() => onOpenSession(session.id)}
                type="button"
              >
                Open saved session
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
