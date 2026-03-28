import { useEffect, useState } from "react";
import type { DemoRun, RevonAdapterStatus } from "@revon-tinyfish/contracts";
import { EvidencePanel } from "../components/EvidencePanel";
import { IcpForm } from "../components/IcpForm";
import { LeadTable } from "../components/LeadTable";
import { PushToRevonButton } from "../components/PushToRevonButton";
import { RunTimeline } from "../components/RunTimeline";
import { getRevonStatus, getRun, pushQualifiedLeads, startRun } from "../lib/api";

export function TinyFishDemoPage() {
  const [run, setRun] = useState<DemoRun | null>(null);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [revonStatus, setRevonStatus] = useState<RevonAdapterStatus | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadStatus() {
      try {
        const status = await getRevonStatus();
        if (!cancelled) {
          setRevonStatus(status);
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
    if (!selectedLeadId && run?.leads[0]) {
      const preferredLead =
        run.leads.find((lead) => lead.score.priority !== "low" && lead.inspectionStatus !== "failed") ??
        run.leads[0];
      setSelectedLeadId(preferredLead.id);
    }
  }, [run, selectedLeadId]);

  async function handleStart(input: Parameters<typeof startRun>[0]) {
    setIsStarting(true);
    setPageError(null);
    setSelectedLeadId(null);

    try {
      const runId = await startRun(input);
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
        .filter((lead) => lead.score.priority !== "low")
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
        <RunTimeline run={run} />
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
