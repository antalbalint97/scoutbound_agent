import type { DemoRun, IcpInput, RunMode, RunQuality, RunStatus } from "@revon-tinyfish/contracts";
import { mapCandidateToLead } from "../domain/leads/mappers.js";
import { rankLeads } from "../domain/leads/ranking.js";
import type { DirectoryCandidate, WebsiteInspection } from "../domain/leads/schemas.js";
import { discoverCompanies } from "../integrations/tinyfish/discoverCompanies.js";
import { inspectWebsite } from "../integrations/tinyfish/inspectWebsite.js";
import { createMockDirectoryDiscovery, createMockWebsiteInspection } from "../mocks/sampleLeads.js";
import {
  createRun,
  failRun,
  finishRun,
  setStepStatus,
  updateRunState,
  updateSummary,
} from "../services/runStore.js";

interface InspectedCandidate {
  candidate: DirectoryCandidate;
  inspection: WebsiteInspection;
}

function resolveLiveMode(): { mode: RunMode; reason?: string; allowFallback: boolean } {
  const forceMock = (process.env.TINYFISH_FORCE_MOCK ?? "false").toLowerCase() === "true";
  const hasApiKey = Boolean(process.env.TINYFISH_API_KEY?.trim());
  const allowFallback = (process.env.TINYFISH_ENABLE_MOCK_FALLBACK ?? "true").toLowerCase() !== "false";

  if (forceMock) {
    return {
      mode: "mock",
      reason: "TINYFISH_FORCE_MOCK is enabled, so the run is explicitly using mock mode.",
      allowFallback,
    };
  }

  if (!hasApiKey) {
    return {
      mode: "mock",
      reason: "TINYFISH_API_KEY is not configured, so the run is explicitly using mock mode.",
      allowFallback,
    };
  }

  return { mode: "live", allowFallback };
}

function combineStatus(base: RunStatus, degraded: boolean): Extract<RunStatus, "completed" | "partial"> {
  return degraded || base === "partial" ? "partial" : "completed";
}

async function executeRun(runId: string, input: IcpInput, initialMode: RunMode, allowFallback: boolean): Promise<void> {
  let mode: RunMode = initialMode;
  let quality: RunQuality = "healthy";
  const runNotes: string[] = [];
  const apiKey = process.env.TINYFISH_API_KEY?.trim();

  try {
    setStepStatus(runId, "discovering_companies", "running", "Scanning public directories for matching companies...");

    let discovery;
    if (mode === "mock") {
      discovery = createMockDirectoryDiscovery(input);
    } else {
      try {
        discovery = await discoverCompanies(apiKey!, input);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "TinyFish directory discovery failed unexpectedly.";
        console.warn(`[tinyfish-demo] live discovery failed, evaluating fallback :: ${message}`);

        if (!allowFallback) {
          throw error;
        }

        mode = "mock";
        quality = "degraded";
        runNotes.push(`Live TinyFish discovery failed. Mock fallback activated: ${message}`);
        updateRunState(runId, {
          mode,
          quality,
          modeReason: "Live TinyFish discovery failed and the run degraded into explicit mock fallback mode.",
          notes: runNotes,
        });
        discovery = createMockDirectoryDiscovery(input);
      }
    }

    if (discovery.candidates.length === 0) {
      throw new Error("No candidate companies were found in the selected directory slice.");
    }

    if (discovery.warnings.length > 0) {
      quality = "degraded";
      runNotes.push(...discovery.warnings);
    }

    updateRunState(runId, {
      mode,
      quality,
      notes: runNotes,
      ...(mode === "mock"
        ? {
            modeReason:
              initialMode === "mock"
                ? "This run is explicitly using mock mode."
                : "Live TinyFish discovery degraded and switched to explicit mock fallback mode.",
          }
        : {}),
    });
    updateSummary(runId, {
      directoryUrl: discovery.directoryUrl,
      companiesFound: discovery.candidates.length,
    });
    setStepStatus(
      runId,
      "discovering_companies",
      discovery.warnings.length > 0 ? "partial" : "completed",
      `Found ${discovery.candidates.length} candidate companies in the public directory.`,
    );

    setStepStatus(runId, "visiting_websites", "running", "Opening company websites with TinyFish...");
    const inspections: InspectedCandidate[] = [];
    let websiteFailures = 0;

    for (const [index, candidate] of discovery.candidates.entries()) {
      setStepStatus(
        runId,
        "visiting_websites",
        "running",
        `Opening ${candidate.companyName} (${index + 1}/${discovery.candidates.length})...`,
      );

      const inspection =
        mode === "mock"
          ? createMockWebsiteInspection(candidate, input, index)
          : await inspectWebsite(apiKey!, input, candidate);

      if (inspection.inspectionStatus === "failed") {
        websiteFailures += 1;
        quality = "degraded";
      }
      if (inspection.inspectionStatus === "partial") {
        quality = "degraded";
      }

      inspections.push({ candidate, inspection });
      updateSummary(runId, {
        websitesVisited: inspections.length,
        websiteFailures,
      });
    }

    if (inspections.length === 0) {
      throw new Error("No company websites were inspected.");
    }

    const websiteStepStatus =
      websiteFailures === 0 ? "completed" : websiteFailures < inspections.length ? "partial" : "failed";
    setStepStatus(
      runId,
      "visiting_websites",
      websiteStepStatus,
      websiteFailures === 0
        ? `Visited ${inspections.length} live company website${inspections.length === 1 ? "" : "s"}.`
        : `Visited ${inspections.length} company website${inspections.length === 1 ? "" : "s"}, with ${websiteFailures} failure${websiteFailures === 1 ? "" : "s"}.`,
    );

    if (websiteFailures === inspections.length) {
      throw new Error("Website inspection failed for every shortlisted company.");
    }

    setStepStatus(runId, "extracting_contacts", "running", "Extracting structured contacts and proof points...");
    const mappedLeads = inspections.map(({ candidate, inspection }, index) => {
      setStepStatus(
        runId,
        "extracting_contacts",
        "running",
        `Extracting signals from ${candidate.companyName} (${index + 1}/${inspections.length})...`,
      );
      return mapCandidateToLead(candidate, inspection, { captureMode: mode });
    });

    const decisionMakersFound = mappedLeads.reduce(
      (total, lead) => total + lead.contacts.filter((contact) => contact.isDecisionMaker).length,
      0,
    );
    const partialLeadCount = mappedLeads.filter((lead) => lead.inspectionStatus !== "completed").length;

    if (partialLeadCount > 0) {
      quality = "degraded";
    }

    updateSummary(runId, {
      decisionMakersFound,
      partialLeadCount,
    });
    setStepStatus(
      runId,
      "extracting_contacts",
      partialLeadCount > 0 ? "partial" : "completed",
      partialLeadCount > 0
        ? `Extracted structured data with ${partialLeadCount} partial or failed lead capture(s).`
        : `Captured ${decisionMakersFound} decision-maker signal${decisionMakersFound === 1 ? "" : "s"}.`,
    );

    setStepStatus(runId, "ranking_leads", "running", "Scoring fit and contactability...");
    const rankedLeads = rankLeads(input, mappedLeads);
    const qualifiedLeadCount = rankedLeads.filter(
      (lead) => lead.score.priority !== "low" && lead.inspectionStatus !== "failed",
    ).length;

    updateSummary(runId, {
      qualifiedLeadCount,
    });
    setStepStatus(
      runId,
      "ranking_leads",
      quality === "degraded" ? "partial" : "completed",
      `${qualifiedLeadCount} lead${qualifiedLeadCount === 1 ? "" : "s"} ranked as demo-ready.`,
    );

    const finalStatus = combineStatus("completed", quality === "degraded");

    if (qualifiedLeadCount > 0) {
      setStepStatus(
        runId,
        "ready_for_revon",
        finalStatus === "partial" ? "partial" : "completed",
        `${qualifiedLeadCount} qualified lead${qualifiedLeadCount === 1 ? "" : "s"} ready for Revon handoff.`,
      );
    } else {
      quality = "degraded";
      runNotes.push("No qualified leads were produced from the current run.");
      setStepStatus(
        runId,
        "ready_for_revon",
        "skipped",
        "No qualified leads were produced, so Revon handoff is skipped.",
      );
    }

    finishRun(runId, {
      leads: rankedLeads,
      status: combineStatus("completed", quality === "degraded" || qualifiedLeadCount === 0),
      quality,
      notes: runNotes,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The TinyFish discovery run failed.";
    failRun(runId, message, undefined, runNotes);
  }
}

export function startDiscoveryRun(input: IcpInput): DemoRun {
  const resolved = resolveLiveMode();
  const run = createRun(input, resolved.reason
    ? {
        mode: resolved.mode,
        modeReason: resolved.reason,
      }
    : {
        mode: resolved.mode,
      });

  console.log(`[tinyfish-demo] starting discovery run ${run.id} in ${resolved.mode} mode`);
  void executeRun(run.id, input, resolved.mode, resolved.allowFallback);
  return run;
}
