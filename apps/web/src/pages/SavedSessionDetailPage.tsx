import { useEffect, useState } from "react";
import type {
  ExperimentVariantSummary,
  PersistedSessionDetail,
  RevonAdapterStatus,
} from "@revon-tinyfish/contracts";
import { EvidencePanel } from "../components/EvidencePanel";
import { ExportPanel } from "../components/ExportPanel";
import { LeadTable } from "../components/LeadTable";
import { PushToRevonButton } from "../components/PushToRevonButton";
import { RunTimeline } from "../components/RunTimeline";
import { TelemetryPanel } from "../components/TelemetryPanel";
import {
  downloadSavedSessionCsvExport,
  downloadSavedSessionJsonExport,
  getRevonStatus,
  getSavedSession,
  listTelemetryVariants,
  pushSavedSessionLeads,
} from "../lib/api";
import { toDemoRunFromPersistedSession } from "../lib/persistedRun";

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

  useEffect(() => {
    let cancelled = false;

    async function loadPage() {
      setIsLoading(true);
      setPageError(null);

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
          savedSession.leads.find((lead) => lead.score.qualificationState === "qualified") ??
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
    setPageError(null);

    try {
      const blob = await downloadSavedSessionJsonExport(session.id, selectedLeadIds);
      downloadFile(`${session.id}-export.json`, await blob.text(), "application/json");
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
    setPageError(null);

    try {
      const blob = await downloadSavedSessionCsvExport(session.id, selectedLeadIds);
      downloadFile(`${session.id}-export.csv`, await blob.text(), "text/csv;charset=utf-8");
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Failed to export CSV.");
    } finally {
      setIsExportingCsv(false);
    }
  }

  async function handlePush() {
    if (!session) {
      return;
    }

    setIsPushing(true);
    setPageError(null);

    try {
      const response = await pushSavedSessionLeads(session.id, selectedLeadIds);
      if (response.session) {
        setSession(response.session);
      }
      const status = await getRevonStatus();
      setRevonStatus(status);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Failed to push saved session leads.");
    } finally {
      setIsPushing(false);
    }
  }

  const selectedLead = session?.leads.find((lead) => lead.id === selectedLeadId) ?? null;
  const demoRun = session ? toDemoRunFromPersistedSession(session) : null;

  return (
    <main className="page-shell">
      <section className="hero">
        <div>
          <button className="secondary-button inline-back" onClick={onBack} type="button">
            Back to launcher
          </button>
          <p className="eyebrow">Saved session</p>
          <h1>Review persisted lead discovery results.</h1>
        </div>
        <p className="hero-copy">
          Open a completed discovery session, inspect evidence, export selected leads, and push the
          reviewable shortlist to Revon.
        </p>
      </section>

      {pageError ? <p className="inline-error page-error">{pageError}</p> : null}

      {isLoading ? (
        <section className="panel">
          <p className="muted">Loading saved session...</p>
        </section>
      ) : (
        <>
          <section className="top-grid">
            <div className="trace-column">
              <RunTimeline run={demoRun} />
              <TelemetryPanel
                error={null}
                isRefreshing={false}
                run={demoRun}
                telemetry={session?.telemetry ?? null}
                variantSummary={variantSummary}
              />
            </div>
            <div className="trace-column">
              <ExportPanel
                isExportingCsv={isExportingCsv}
                isExportingJson={isExportingJson}
                onDownloadCsv={() => void handleDownloadCsv()}
                onDownloadJson={handleDownloadJson}
                selectedCount={selectedLeadIds.length}
              />
              <PushToRevonButton
                isSubmitting={isPushing}
                onPush={handlePush}
                revonStatus={revonStatus}
                run={demoRun}
                selectedLeadIds={selectedLeadIds}
              />
            </div>
          </section>

          <section className="bottom-grid">
            <div className="results-column">
              <LeadTable
                leads={session?.leads ?? []}
                onSelect={setSelectedLeadId}
                onToggleLeadSelection={toggleLeadSelection}
                selectedLeadId={selectedLeadId}
                selectedLeadIds={selectedLeadIds}
              />
            </div>

            <EvidencePanel lead={selectedLead} />
          </section>
        </>
      )}
    </main>
  );
}
