import { useEffect, useState } from "react";
import { Activity, Database, FileSearch, ListChecks, Sparkles, Settings2 } from "lucide-react";
import type {
  DemoRun,
  ExperimentVariantSummary,
  ZohoAdapterStatus,
  SessionTelemetry,
  StartRunRequest,
} from "@revon-tinyfish/contracts";
import { ConsoleLayout } from "../components/ConsoleLayout";
import { EvidencePanel } from "../components/EvidencePanel";
import { IcpForm } from "../components/IcpForm";
import { LeadTable } from "../components/LeadTable";
import { PushToZohoButton } from "../components/PushToZohoButton";
import { RunTimeline } from "../components/RunTimeline";
import { TelemetryPanel } from "../components/TelemetryPanel";
import { logWebTrace } from "../lib/debugTrace";
import { getEffectiveQualificationState } from "../lib/leadQualification";
import {
  getZohoStatus,
  getRun,
  getTelemetrySession,
  listTelemetryVariants,
  pushLeadsToZoho,
  testZohoConnection,
  startRun,
  type ZohoConnectionTestResult,
  type ZohoPushSummary,
} from "../lib/api";
import {
  clearActiveExecution,
  getActiveExecution,
  saveActiveExecution,
} from "../lib/activeExecution";

type WorkspaceTab = "setup" | "trace" | "leads" | "evidence" | "zoho" | "telemetry";

const WORKSPACE_TAB_STORAGE_KEY = "scoutbound.console.workspaceTab";

function readStoredWorkspaceTab(): WorkspaceTab {
  if (typeof window === "undefined") {
    return "setup";
  }

  const rawValue = window.localStorage.getItem(WORKSPACE_TAB_STORAGE_KEY);
  if (
    rawValue === "setup" ||
    rawValue === "trace" ||
    rawValue === "leads" ||
    rawValue === "evidence" ||
    rawValue === "zoho" ||
    rawValue === "telemetry"
  ) {
    return rawValue;
  }

  return "setup";
}

export function ConsoleRunsPage() {
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<WorkspaceTab>(() => readStoredWorkspaceTab());
  const [run, setRun] = useState<DemoRun | null>(null);
  const [telemetry, setTelemetry] = useState<SessionTelemetry | null>(null);
  const [variantSummary, setVariantSummary] = useState<ExperimentVariantSummary | null>(null);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [zohoStatus, setZohoStatus] = useState<ZohoAdapterStatus | null>(null);
  const [zohoConnectionTest, setZohoConnectionTest] = useState<ZohoConnectionTestResult | null>(null);
  const [zohoPushSummary, setZohoPushSummary] = useState<ZohoPushSummary | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [isTestingZohoConnection, setIsTestingZohoConnection] = useState(false);
  const [isRefreshingTelemetry, setIsRefreshingTelemetry] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [telemetryError, setTelemetryError] = useState<string | null>(null);

  useEffect(() => {
    window.localStorage.setItem(WORKSPACE_TAB_STORAGE_KEY, activeWorkspaceTab);
  }, [activeWorkspaceTab]);

  useEffect(() => {
    let cancelled = false;

    async function loadStatus() {
      try {
        const status = await getZohoStatus();
        if (!cancelled) {
          setZohoStatus(status);
          setZohoConnectionTest(null);
        }
      } catch (error) {
        if (!cancelled) {
          setPageError(error instanceof Error ? error.message : "Failed to load CRM adapter status.");
        }
      }
    }

    void loadStatus();

    async function restoreSession() {
      const active = getActiveExecution();
      if (active) {
        console.log(`[ConsoleRunsPage] Restoring active session: ${active.sessionId}`);
        setIsStarting(true);
        try {
          const restoredRun = await getRun(active.sessionId);
          if (!cancelled) {
            setRun(restoredRun);
          }
        } catch (error) {
          console.error("[ConsoleRunsPage] Failed to restore session", error);
          clearActiveExecution();
        } finally {
          if (!cancelled) {
            setIsStarting(false);
          }
        }
      }
    }

    void restoreSession();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const activeStates: Array<DemoRun["status"]> = ["running", "partial"];
    if (!run || !activeStates.includes(run.status)) {
      if (run && (run.status === "completed" || run.status === "failed")) {
        console.log(`[ConsoleRunsPage] Execution ${run.status}, polling stopped`);
      }
      return;
    }

    console.log(`[ConsoleRunsPage] Resuming polling for run: ${run.id}`);

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
  }, [run?.id, run?.status]);

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
        run.leads.find((lead) => getEffectiveQualificationState(lead) === "qualified") ??
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
    logWebTrace("ConsoleRunsPage.handleStart", {
      correlationId: trace.correlationId,
      invocationKey: trace.correlationId,
      details: {
        payloadSignature: trace.payloadSignature,
        experimentLabel: input.experimentLabel,
        promptOverride: input.promptOverride,
      },
    });

    setIsStarting(true);
    setPageError(null);
    setTelemetryError(null);
    setSelectedLeadId(null);
    setTelemetry(null);
    setVariantSummary(null);
    setZohoConnectionTest(null);
    setZohoPushSummary(null);

    try {
      const runId = await startRun(input, trace);
      saveActiveExecution({
        sessionId: runId,
        startedAt: new Date().toISOString(),
      });
      const freshRun = await getRun(runId);
      setRun(freshRun);
      setActiveWorkspaceTab((current) => (current === "setup" ? "trace" : current));
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Failed to start the Scoutbound run.");
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
        .filter((lead) => getEffectiveQualificationState(lead) === "qualified")
        .map((lead) => lead.id);
      const summary = await pushLeadsToZoho(run.id, leadIds);
      setZohoPushSummary(summary);
      const status = await getZohoStatus();
      setZohoStatus(status);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Failed to sync leads to Zoho CRM.");
    } finally {
      setIsPushing(false);
    }
  }

  async function handleTestZohoConnection() {
    setIsTestingZohoConnection(true);
    setPageError(null);

    try {
      const result = await testZohoConnection();
      setZohoConnectionTest(result);
      const status = await getZohoStatus();
      setZohoStatus(status);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Failed to test the Zoho connection.");
    } finally {
      setIsTestingZohoConnection(false);
    }
  }

  const selectedLead = run?.leads.find((lead) => lead.id === selectedLeadId) ?? null;
  const qualifiedCount = run?.leads.filter((l) => getEffectiveQualificationState(l) === "qualified").length ?? 0;
  const tabMeta = {
    setup: "Configure",
    trace: run?.status ? run.status : "idle",
    leads: `${run?.leads.length ?? 0} leads`,
    evidence: selectedLead ? selectedLead.companyName : "select a lead",
    zoho: `${qualifiedCount} ready`,
    telemetry: telemetry ? "loaded" : "snapshot",
  };

  return (
    <ConsoleLayout
      activeNav="runs"
      title="Prospect sourcing workflow"
      subtitle="Configure ICP parameters, launch an autonomous sourcing workflow, and inspect the qualified prospect shortlist as it forms."
    >
      {pageError ? <p className="inline-error page-error">{pageError}</p> : null}

      <section className="console-workspace">
        <div className="tab-strip workspace-tab-strip" role="tablist" aria-label="Run workspace tabs">
          {(
            [
              { id: "setup", label: "Setup", icon: Settings2, meta: "Edit ICP" },
              { id: "trace", label: "Trace", icon: Activity, meta: tabMeta.trace },
              { id: "leads", label: "Leads", icon: ListChecks, meta: tabMeta.leads },
              { id: "evidence", label: "Evidence", icon: FileSearch, meta: tabMeta.evidence },
              { id: "zoho", label: "Zoho", icon: Database, meta: tabMeta.zoho },
              { id: "telemetry", label: "Telemetry", icon: Sparkles, meta: tabMeta.telemetry },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              className={`tab-pill workspace-tab-pill ${activeWorkspaceTab === tab.id ? "active" : ""}`}
              onClick={() => setActiveWorkspaceTab(tab.id)}
              type="button"
              role="tab"
              aria-selected={activeWorkspaceTab === tab.id}
            >
              <span className="workspace-tab-pill-label">
                <tab.icon size={14} />
                {tab.label}
              </span>
              <span className="workspace-tab-pill-meta">{tab.meta}</span>
            </button>
          ))}
        </div>

        <div className="workspace-tab-stage">
          <section className="workspace-tab-pane" hidden={activeWorkspaceTab !== "setup"}>
            <IcpForm
              description="Define the ICP parameters, geography, and execution constraints. The agent will navigate live websites and return a ranked prospect shortlist."
              eyebrow="Workflow objective"
              isSubmitting={isStarting}
              operatorMode
              showPresets={false}
              title="Configure prospect sourcing"
              onSubmit={handleStart}
            />
          </section>

          <section className="workspace-tab-pane" hidden={activeWorkspaceTab !== "trace"}>
            <RunTimeline run={run} />
          </section>

          <section className="workspace-tab-pane" hidden={activeWorkspaceTab !== "leads"}>
            <LeadTable
              leads={run?.leads ?? []}
              onSelect={setSelectedLeadId}
              selectedLeadId={selectedLeadId}
            />
          </section>

          <section className="workspace-tab-pane" hidden={activeWorkspaceTab !== "evidence"}>
            <EvidencePanel lead={selectedLead} />
          </section>

          <section className="workspace-tab-pane" hidden={activeWorkspaceTab !== "zoho"}>
            <PushToZohoButton
              isSubmitting={isPushing}
              isTestingConnection={isTestingZohoConnection}
              onPush={handlePush}
              onTestConnection={handleTestZohoConnection}
              connectionTest={zohoConnectionTest ?? undefined}
              zohoStatus={zohoStatus}
              qualifiedCount={qualifiedCount}
              summary={zohoPushSummary ?? undefined}
            />
          </section>

          <section className="workspace-tab-pane" hidden={activeWorkspaceTab !== "telemetry"}>
            <TelemetryPanel
              error={telemetryError}
              isRefreshing={isRefreshingTelemetry}
              run={run}
              telemetry={telemetry}
              variantSummary={variantSummary}
            />
          </section>
        </div>
      </section>
    </ConsoleLayout>
  );
}
