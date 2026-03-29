import { useEffect, useState } from "react";
import type {
  DemoRun,
  ExperimentVariantSummary,
  PersistedSessionSummary,
  RevonAdapterStatus,
  SessionTelemetry,
  StartRunRequest,
} from "@revon-tinyfish/contracts";
import { EvidencePanel } from "../components/EvidencePanel";
import { IcpForm } from "../components/IcpForm";
import { LeadTable } from "../components/LeadTable";
import { PushToRevonButton } from "../components/PushToRevonButton";
import { RunTimeline } from "../components/RunTimeline";
import { SavedSessionList } from "../components/SavedSessionList";
import { TelemetryPanel } from "../components/TelemetryPanel";
import { logWebTrace } from "../lib/debugTrace";
import {
  getRevonStatus,
  getRun,
  getTelemetrySession,
  listSavedSessions,
  listTelemetryVariants,
  pushQualifiedLeads,
  startRun,
} from "../lib/api";

interface TinyFishDemoPageProps {
  onOpenSavedSession: (sessionId: string) => void;
}

export function TinyFishDemoPage({ onOpenSavedSession }: TinyFishDemoPageProps) {
  const [run, setRun] = useState<DemoRun | null>(null);
  const [telemetry, setTelemetry] = useState<SessionTelemetry | null>(null);
  const [variantSummary, setVariantSummary] = useState<ExperimentVariantSummary | null>(null);
  const [savedSessions, setSavedSessions] = useState<PersistedSessionSummary[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [revonStatus, setRevonStatus] = useState<RevonAdapterStatus | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [isRefreshingTelemetry, setIsRefreshingTelemetry] = useState(false);
  const [isLoadingSavedSessions, setIsLoadingSavedSessions] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [telemetryError, setTelemetryError] = useState<string | null>(null);
  const [savedSessionError, setSavedSessionError] = useState<string | null>(null);

  async function refreshSavedSessions() {
    setIsLoadingSavedSessions(true);

    try {
      const sessions = await listSavedSessions();
      setSavedSessions(sessions);
      setSavedSessionError(null);
    } catch (error) {
      setSavedSessionError(
        error instanceof Error ? error.message : "Failed to load persisted discovery sessions.",
      );
    } finally {
      setIsLoadingSavedSessions(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadStatus() {
      try {
        const [status, sessions] = await Promise.all([getRevonStatus(), listSavedSessions()]);
        if (!cancelled) {
          setRevonStatus(status);
          setSavedSessions(sessions);
          setSavedSessionError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setPageError(error instanceof Error ? error.message : "Failed to load Revon adapter status.");
        }
      }
    }

    void loadStatus();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!run || run.status === "running") {
      return;
    }

    void refreshSavedSessions();
  }, [run?.id, run?.status]);

  useEffect(() => {
    if (!run || run.status !== "running") {
      return;
    }

    let cancelled = false;
    const interval = window.setInterval(async () => {
      try {
        const latestRun = await getRun(run.id);
        if (!cancelled) {
          setRun(latestRun);
        }
      } catch (error) {
        if (!cancelled) {
          setPageError(error instanceof Error ? error.message : "Polling the run failed.");
        }
      }
    }, 1500);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [run]);

  useEffect(() => {
    if (!run) {
      setTelemetry(null);
      setTelemetryError(null);
      return;
    }

    const runId = run.id;
    let cancelled = false;

    async function loadTelemetrySnapshot() {
      setIsRefreshingTelemetry(true);

      try {
        const session = await getTelemetrySession(runId);
        if (!cancelled) {
          setTelemetry(session);
          setTelemetryError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setTelemetryError(
            error instanceof Error ? error.message : "Failed to load telemetry for this session.",
          );
        }
      } finally {
        if (!cancelled) {
          setIsRefreshingTelemetry(false);
        }
      }
    }

    void loadTelemetrySnapshot();

    if (run.status !== "running") {
      return () => {
        cancelled = true;
      };
    }

    const interval = window.setInterval(() => {
      void loadTelemetrySnapshot();
    }, 1500);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [run?.id, run?.status]);

  useEffect(() => {
    if (!run) {
      setVariantSummary(null);
      return;
    }

    const experimentLabel = run.experimentLabel;
    let cancelled = false;

    async function loadVariantSummary() {
      try {
        const variants = await listTelemetryVariants();
        const matchingVariant =
          variants.find((variant) => variant.experimentLabel === experimentLabel) ?? null;
        if (!cancelled) {
          setVariantSummary(matchingVariant);
        }
      } catch {
        if (!cancelled) {
          setVariantSummary(null);
        }
      }
    }

    void loadVariantSummary();

    return () => {
      cancelled = true;
    };
  }, [run?.id, run?.status, run?.experimentLabel]);

  useEffect(() => {
    if (!selectedLeadId && run?.leads[0]) {
      const preferredLead =
        run.leads.find((lead) => lead.score.qualificationState === "qualified") ??
        run.leads[0];
      setSelectedLeadId(preferredLead.id);
    }
  }, [run, selectedLeadId]);

  async function handleStart(
    input: StartRunRequest,
    trace: {
      correlationId: string;
      payloadSignature: string;
    },
  ) {
    logWebTrace("TinyFishDemoPage.handleStart", {
      correlationId: trace.correlationId,
      invocationKey: trace.correlationId,
      details: {
        payloadSignature: trace.payloadSignature,
        experimentLabel: input.experimentLabel,
      },
    });

    setIsStarting(true);
    setPageError(null);
    setTelemetryError(null);
    setSelectedLeadId(null);
    setTelemetry(null);
    setVariantSummary(null);

    try {
      const runId = await startRun(input, trace);
      logWebTrace("TinyFishDemoPage.handleStart.runAccepted", {
        correlationId: trace.correlationId,
        runId,
        invocationKey: trace.correlationId,
      });
      const freshRun = await getRun(runId);
      setRun(freshRun);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Failed to start the TinyFish run.");
    } finally {
      setIsStarting(false);
    }
  }

  async function handlePush() {
    if (!run) {
      return;
    }

    setIsPushing(true);
    setPageError(null);

    try {
      const leadIds = run.leads
        .filter((lead) => lead.score.qualificationState === "qualified")
        .map((lead) => lead.id);
      const updatedRun = await pushQualifiedLeads(run.id, leadIds);
      setRun(updatedRun);
      const status = await getRevonStatus();
      setRevonStatus(status);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Failed to push leads to Revon.");
    } finally {
      setIsPushing(false);
    }
  }

  const selectedLead = run?.leads.find((lead) => lead.id === selectedLeadId) ?? null;

  return (
    <main className="page-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Revon x TinyFish</p>
          <h1>Autonomous lead acquisition, shown as a real web-agent workflow.</h1>
        </div>
        <p className="hero-copy">
          The demo keeps the reviewable surface small: frontend, orchestration, TinyFish
          integration, and a narrow Revon adapter. The agent still does live multi-step work on
          websites and returns ranked, evidence-backed leads.
        </p>
      </section>

      {pageError ? <p className="inline-error page-error">{pageError}</p> : null}

      <section className="top-grid">
        <IcpForm isSubmitting={isStarting} onSubmit={handleStart} />
        <div className="trace-column">
          <RunTimeline run={run} />
          <TelemetryPanel
            error={telemetryError}
            isRefreshing={isRefreshingTelemetry}
            run={run}
            telemetry={telemetry}
            variantSummary={variantSummary}
          />
        </div>
      </section>

      <section className="top-grid">
        <SavedSessionList
          error={savedSessionError}
          isLoading={isLoadingSavedSessions}
          onOpenSession={onOpenSavedSession}
          sessions={savedSessions}
        />
        <section className="panel">
          <div className="panel-header compact">
            <p className="eyebrow">Saved results</p>
            <h2>Persisted discovery library</h2>
          </div>
          <p className="muted">
            Every completed run is now saved automatically. Open any saved session to inspect
            evidence, export JSON or CSV, and hand selected qualified leads to Revon later.
          </p>
        </section>
      </section>

      <section className="bottom-grid">
        <div className="results-column">
          <PushToRevonButton
            isSubmitting={isPushing}
            onPush={handlePush}
            revonStatus={revonStatus}
            run={run}
          />
          <LeadTable
            leads={run?.leads ?? []}
            onSelect={setSelectedLeadId}
            selectedLeadId={selectedLeadId}
          />
        </div>

        <EvidencePanel lead={selectedLead} />
      </section>
    </main>
  );
}
