import { useEffect, useState } from "react";
import type {
  DemoRun,
  ExperimentVariantSummary,
  RevonAdapterStatus,
  SessionTelemetry,
  StartRunRequest,
} from "@revon-tinyfish/contracts";
import { ConsoleLayout } from "../components/ConsoleLayout";
import { EvidencePanel } from "../components/EvidencePanel";
import { IcpForm } from "../components/IcpForm";
import { LeadTable } from "../components/LeadTable";
import { PushToRevonButton } from "../components/PushToRevonButton";
import { RunTimeline } from "../components/RunTimeline";
import { TelemetryPanel } from "../components/TelemetryPanel";
import { logWebTrace } from "../lib/debugTrace";
import {
  getRevonStatus,
  getRun,
  getTelemetrySession,
  listTelemetryVariants,
  pushQualifiedLeads,
  startRun,
} from "../lib/api";

export function ConsoleRunsPage() {
  const [run, setRun] = useState<DemoRun | null>(null);
  const [telemetry, setTelemetry] = useState<SessionTelemetry | null>(null);
  const [variantSummary, setVariantSummary] = useState<ExperimentVariantSummary | null>(null);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [revonStatus, setRevonStatus] = useState<RevonAdapterStatus | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [isRefreshingTelemetry, setIsRefreshingTelemetry] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [telemetryError, setTelemetryError] = useState<string | null>(null);

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
        run.leads.find((lead) => lead.score.qualificationState === "qualified") ?? run.leads[0];
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
    logWebTrace("ConsoleRunsPage.handleStart", {
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
    <ConsoleLayout
      activeNav="runs"
      title="Prospect sourcing workflow"
      subtitle="Configure ICP parameters, launch an autonomous sourcing workflow, and inspect the qualified prospect shortlist as it forms."
      sectionLinks={[
        { id: "console-runs-leads", label: "Prospects" },
        { id: "console-runs-revon", label: "CRM sync (disabled)" },
        { id: "console-runs-telemetry", label: "Telemetry" },
      ]}
    >
      {pageError ? <p className="inline-error page-error">{pageError}</p> : null}

      <section className="console-grid console-grid-runs">
        <IcpForm
          description="Define the ICP parameters, geography, and execution constraints. The agent will navigate live websites and return a ranked prospect shortlist."
          eyebrow="Workflow objective"
          isSubmitting={isStarting}
          operatorMode
          showPresets={false}
          title="Configure prospect sourcing"
          onSubmit={handleStart}
        />

        <div className="trace-column">
          <RunTimeline run={run} />
          <div id="console-runs-telemetry">
            <TelemetryPanel
              error={telemetryError}
              isRefreshing={isRefreshingTelemetry}
              run={run}
              telemetry={telemetry}
              variantSummary={variantSummary}
            />
          </div>
        </div>
      </section>

      <section className="console-grid console-grid-detail">
        <div className="results-column">
          <div id="console-runs-revon">
            <PushToRevonButton
              isSubmitting={isPushing}
              onPush={handlePush}
              revonStatus={revonStatus}
              run={run}
            />
          </div>
          <div id="console-runs-leads">
            <LeadTable
              leads={run?.leads ?? []}
              onSelect={setSelectedLeadId}
              selectedLeadId={selectedLeadId}
            />
          </div>
        </div>

        <EvidencePanel lead={selectedLead} />
      </section>
    </ConsoleLayout>
  );
}
