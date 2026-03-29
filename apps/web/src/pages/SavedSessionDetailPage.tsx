import { useEffect, useState } from "react";
import type {
  ExperimentVariantSummary,
  PersistedSessionDetail,
  PersistedSessionPushResponse,
  RevonAdapterStatus,
} from "@revon-tinyfish/contracts";
import { ConsoleLayout } from "../components/ConsoleLayout";
import { EvidencePanel } from "../components/EvidencePanel";
import { ExportPanel } from "../components/ExportPanel";
import { PushToRevonButton } from "../components/PushToRevonButton";
import { SessionLeadTable } from "../components/SessionLeadTable";
import { TelemetryPanel } from "../components/TelemetryPanel";
import {
  downloadSavedSessionCsvExport,
  downloadSavedSessionJsonExport,
  getRevonStatus,
  getSavedSession,
  listTelemetryVariants,
  pushSavedSessionLeads,
} from "../lib/api";
import { getEffectiveQualificationState } from "../lib/leadQualification";
import { toDemoRunFromPersistedSession } from "../lib/persistedRun";
import { getActiveExecution } from "../lib/activeExecution";

interface SavedSessionDetailPageProps {
  sessionId: string;
  onBack: () => void;
}

function downloadFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return "—";
  }

  return new Date(value).toLocaleString();
}

function sessionRevonStatusLabel(session: PersistedSessionDetail): string {
  if (session.importStatus === "running") {
    return "Pending push";
  }
  if (session.importStatus === "error") {
    return "Push failed";
  }
  if (session.importStatus === "completed") {
    return session.importDryRun ? "Dry run" : "Synced to CRM";
  }

  return "Not attempted";
}

export function SavedSessionDetailPage({ sessionId, onBack }: SavedSessionDetailPageProps) {
  const [session, setSession] = useState<PersistedSessionDetail | null>(null);
  const [revonStatus, setRevonStatus] = useState<RevonAdapterStatus | null>(null);
  const [variantSummary, setVariantSummary] = useState<ExperimentVariantSummary | null>(null);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [pageError, setPageError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPushing, setIsPushing] = useState(false);
  const [isExportingJson, setIsExportingJson] = useState(false);
  const [isExportingCsv, setIsExportingCsv] = useState(false);
  const [includeTelemetry, setIncludeTelemetry] = useState(true);
  const [pushSummary, setPushSummary] = useState<PersistedSessionPushResponse["summary"] | null>(null);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"session-leads" | "session-evidence" | "session-exports" | "session-revon" | "session-telemetry">("session-leads");
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadPage() {
      setIsLoading(true);
      setPageError(null);
      setSession(null);
      setSelectedLeadId(null);
      setSelectedLeadIds([]);

      try {
        const [savedSession, status, variants] = await Promise.all([
          getSavedSession(sessionId),
          getRevonStatus(),
          listTelemetryVariants(),
        ]);

        if (cancelled) {
          return;
        }

        setSession(savedSession);
        setRevonStatus(status);
        setVariantSummary(
          variants.find((variant) => variant.experimentLabel === savedSession.experimentLabel) ?? null,
        );

        const defaultSelectedLeadIds = savedSession.leads.map((lead) => lead.id);
        setSelectedLeadIds(defaultSelectedLeadIds);

        const preferredLead =
          savedSession.leads.find((lead) => getEffectiveQualificationState(lead) === "qualified") ??
          savedSession.leads[0] ??
          null;
        setSelectedLeadId(preferredLead?.id ?? null);
      } catch (error) {
        if (!cancelled) {
          setPageError(error instanceof Error ? error.message : "Failed to load the saved session.");
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
  }, [sessionId]);

  useEffect(() => {
    const activeStates: Array<typeof session.lifecycleStatus> = ["created", "running"];
    if (!session || !activeStates.includes(session.lifecycleStatus)) {
      if (session && (session.status === "completed" || session.status === "failed")) {
        console.log(`[SavedSessionDetailPage] Execution ${session.status}, polling stopped`);
      }
      return;
    }

    console.log(`[SavedSessionDetailPage] Resuming polling for session: ${session.id}`);

    let cancelled = false;
    const interval = window.setInterval(async () => {
      setIsRefreshing(true);
      try {
        const latestSession = await getSavedSession(session.id);
        if (!cancelled) {
          setSession(latestSession);
        }
      } catch (error) {
        console.error("[SavedSessionDetailPage] Polling failed", error);
      } finally {
        if (!cancelled) {
          setIsRefreshing(false);
        }
      }
    }, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [session?.id, session?.lifecycleStatus]);

  function toggleLeadSelection(leadId: string) {
    setSelectedLeadIds((current) =>
      current.includes(leadId) ? current.filter((entry) => entry !== leadId) : [...current, leadId],
    );
  }

  async function handleDownloadJson() {
    if (!session) {
      return;
    }

    setIsExportingJson(true);
    setExportSuccess(null);
    setPageError(null);

    try {
      const blob = await downloadSavedSessionJsonExport(session.id, selectedLeadIds, {
        includeTelemetry,
      });
      downloadFile(`${session.id}-export.json`, await blob.text(), "application/json");
      setExportSuccess(`JSON exported — ${selectedLeadIds.length} prospect${selectedLeadIds.length !== 1 ? "s" : ""}`);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Failed to export JSON.");
    } finally {
      setIsExportingJson(false);
    }
  }

  async function handleDownloadCsv() {
    if (!session) {
      return;
    }

    setIsExportingCsv(true);
    setExportSuccess(null);
    setPageError(null);

    try {
      const blob = await downloadSavedSessionCsvExport(session.id, selectedLeadIds);
      downloadFile(`${session.id}-export.csv`, await blob.text(), "text/csv;charset=utf-8");
      setExportSuccess(`CSV exported — ${selectedLeadIds.length} prospect${selectedLeadIds.length !== 1 ? "s" : ""}`);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Failed to export CSV.");
    } finally {
      setIsExportingCsv(false);
    }
  }

  function handleSelectAllQualified() {
    if (!session) return;
    const qualifiedIds = session.leads
      .filter((l) => getEffectiveQualificationState(l) === "qualified")
      .map((l) => l.id);
    setSelectedLeadIds(qualifiedIds);
  }

  async function handlePush() {
    if (!session) {
      return;
    }

    setIsPushing(true);
    setPageError(null);

    try {
      const response = await pushSavedSessionLeads(session.id, selectedLeadIds);
      setPushSummary(response.summary);
      if (response.session) {
        setSession(response.session);
      }
      const status = await getRevonStatus();
      setRevonStatus(status);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Failed to sync saved session leads to CRM.");
    } finally {
      setIsPushing(false);
    }
  }

  const selectedLead = session?.leads.find((lead) => lead.id === selectedLeadId) ?? null;
  const demoRun = session ? toDemoRunFromPersistedSession(session) : null;

  const sectionLinks = [
    { id: "session-leads", label: "Prospects", onClick: () => setActiveTab("session-leads") as void },
    { id: "session-evidence", label: "Evidence", onClick: () => setActiveTab("session-evidence") as void },
    { id: "session-exports", label: "Exports", onClick: () => setActiveTab("session-exports") as void },
    { id: "session-revon", label: "CRM sync (disabled)", onClick: () => setActiveTab("session-revon") as void },
  ];

  if (session?.telemetry) {
    sectionLinks.push({ id: "session-telemetry", label: "Telemetry", onClick: () => setActiveTab("session-telemetry") as void });
  }

  return (
    <ConsoleLayout
      activeNav="sessions"
      title="Workflow execution detail"
      subtitle="Review the qualified prospect shortlist, inspect evidence and contacts, export results, and sync selected prospects to CRM."
      sectionLinks={sectionLinks}
      activeSectionId={activeTab}
    >
      <button className="secondary-button inline-back" onClick={onBack} type="button">
        Back to workflow history
      </button>

      {pageError ? <p className="inline-error page-error">{pageError}</p> : null}

      {isRefreshing && (
        <div className="refresh-indicator">
          <span className="spinner" /> Refreshing execution state…
        </div>
      )}

      {isLoading ? (
        <section className="panel">
          <div className="summary-cards">
            {Array.from({ length: 6 }, (_, i) => (
              <div className="summary-card" key={i}>
                <span className="skeleton skeleton-line short" style={{ marginBottom: 8 }} />
                <span className="skeleton skeleton-line medium" />
              </div>
            ))}
          </div>
          <div className="panel" style={{ padding: "32px 22px" }}>
            <span className="skeleton skeleton-line wide" style={{ marginBottom: 12 }} />
            <span className="skeleton skeleton-line medium" style={{ marginBottom: 8 }} />
            <span className="skeleton skeleton-line short" />
          </div>
        </section>
      ) : session ? (
        <>
          {(() => {
            const qualifiedCount = session.leads.filter(
              (l) => getEffectiveQualificationState(l) === "qualified",
            ).length;
            return (
              <div className="summary-cards">
                <div className="summary-card">
                  <span className="summary-card-label">Status</span>
                  <span className="summary-card-value">{session.lifecycleStatus.replace(/_/g, " ")}</span>
                  <span className="summary-card-sub">{session.mode} · {session.quality}</span>
                </div>
                <div className="summary-card">
                  <span className="summary-card-label">Prospects</span>
                  <span className="summary-card-value">{session.leadCount}</span>
                  <span className="summary-card-sub">total found</span>
                </div>
                <div className="summary-card">
                  <span className="summary-card-label">Qualified</span>
                  <span className="summary-card-value">{qualifiedCount}</span>
                  <span className="summary-card-sub">
                    {session.leadCount > 0
                      ? `${Math.round((qualifiedCount / session.leadCount) * 100)}% of total`
                      : "none found"}
                  </span>
                </div>
                <div className="summary-card">
                  <span className="summary-card-label">Selected</span>
                  <span className="summary-card-value">{selectedLeadIds.length}</span>
                  <span className="summary-card-sub">for export / sync</span>
                </div>
                <div className="summary-card">
                  <span className="summary-card-label">CRM sync</span>
                  <span className="summary-card-value" style={{ fontSize: "1rem" }}>
                    {sessionRevonStatusLabel(session)}
                  </span>
                  <span className="summary-card-sub">{session.importDryRun ? "dry-run mode" : "live"}</span>
                </div>
                <div className="summary-card">
                  <span className="summary-card-label">Completed</span>
                  <span className="summary-card-value" style={{ fontSize: "0.88rem", fontWeight: 500 }}>
                    {formatDateTime(session.completedAt ?? session.startedAt)}
                  </span>
                  <span className="summary-card-sub">{session.experimentLabel}</span>
                </div>
              </div>
            );
          })()}

          <section className="console-grid">
            <div className="results-column">
              {activeTab === "session-leads" && (
                <div id="session-leads">
                  {(session.lifecycleStatus === "created" || session.lifecycleStatus === "running") && session.leads.length === 0 && (
                    <div className="empty-state">
                      <p className="empty-state-title">Sourcing in progress</p>
                      <p>Execution is still in progress. Prospect results will appear here as the workflow completes.</p>
                    </div>
                  )}
                  <SessionLeadTable
                    leads={session.leads}
                    onSelect={setSelectedLeadId}
                    onSelectLeads={setSelectedLeadIds}
                    onToggleLeadSelection={toggleLeadSelection}
                    selectedLeadId={selectedLeadId}
                    selectedLeadIds={selectedLeadIds}
                  />
                </div>
              )}

              {activeTab === "session-evidence" && (
                <div id="session-evidence">
                  <EvidencePanel lead={selectedLead} />
                </div>
              )}

              {activeTab === "session-exports" && (
                <div id="session-exports">
                  <ExportPanel
                    exportSuccess={exportSuccess}
                    includeTelemetry={includeTelemetry}
                    isExportingCsv={isExportingCsv}
                    isExportingJson={isExportingJson}
                    onDownloadCsv={() => void handleDownloadCsv()}
                    onDownloadJson={handleDownloadJson}
                    onToggleIncludeTelemetry={setIncludeTelemetry}
                    selectedCount={selectedLeadIds.length}
                  />
                </div>
              )}

              {activeTab === "session-revon" && (
                <div id="session-revon">
                  <PushToRevonButton
                    isSubmitting={isPushing}
                    onPush={handlePush}
                    revonStatus={revonStatus}
                    run={demoRun}
                    selectedLeadIds={selectedLeadIds}
                    summary={pushSummary ?? undefined}
                  />
                </div>
              )}

              {activeTab === "session-telemetry" && includeTelemetry && session.telemetry && (
                <div id="session-telemetry">
                  <TelemetryPanel
                    error={null}
                    isRefreshing={false}
                    run={demoRun}
                    telemetry={session.telemetry}
                    variantSummary={variantSummary}
                  />
                </div>
              )}
            </div>
          </section>
        </>
      ) : null}
    </ConsoleLayout>
  );
}
