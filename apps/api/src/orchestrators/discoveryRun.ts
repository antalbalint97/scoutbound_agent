import type { DemoRun, IcpInput } from "@revon-tinyfish/contracts";
import { mapCandidateToLead } from "../domain/leads/mappers.js";
import { rankLeads } from "../domain/leads/ranking.js";
import type { DirectoryCandidate, WebsiteInspection } from "../domain/leads/schemas.js";
import { discoverCompanies } from "../integrations/tinyfish/discoverCompanies.js";
import { inspectWebsite } from "../integrations/tinyfish/inspectWebsite.js";
import { createMockDirectoryDiscovery, createMockWebsiteInspection } from "../mocks/sampleLeads.js";
import {
  activateStep,
  completeStep,
  createRun,
  failRun,
  finishRun,
  updateSummary,
} from "../services/runStore.js";

interface InspectedCandidate {
  candidate: DirectoryCandidate;
  inspection: WebsiteInspection;
}

function useMockMode(): boolean {
  return !process.env.TINYFISH_API_KEY || (process.env.TINYFISH_FORCE_MOCK ?? "false").toLowerCase() === "true";
}

async function executeRun(runId: string, input: IcpInput): Promise<void> {
  const mockMode = useMockMode();

  try {
    activateStep(runId, "discovering_companies", "Scanning public directories for matching companies...");

    const discovery = mockMode
      ? createMockDirectoryDiscovery(input)
      : await discoverCompanies(process.env.TINYFISH_API_KEY!, input);

    if (discovery.candidates.length === 0) {
      throw new Error("No candidate companies were found in the selected directory slice.");
    }

    updateSummary(runId, {
      directoryUrl: discovery.directoryUrl,
      companiesFound: discovery.candidates.length,
    });
    completeStep(
      runId,
      "discovering_companies",
      `Found ${discovery.candidates.length} candidate companies in the public directory.`,
    );

    activateStep(runId, "visiting_websites", "Opening company websites with TinyFish...");
    const inspections: InspectedCandidate[] = [];

    for (const [index, candidate] of discovery.candidates.entries()) {
      activateStep(
        runId,
        "visiting_websites",
        `Opening ${candidate.companyName} (${index + 1}/${discovery.candidates.length})...`,
      );

      const inspection = mockMode
        ? createMockWebsiteInspection(candidate, input, index)
        : await inspectWebsite(process.env.TINYFISH_API_KEY!, input, candidate);

      inspections.push({ candidate, inspection });
      updateSummary(runId, {
        websitesVisited: inspections.length,
      });
    }

    completeStep(
      runId,
      "visiting_websites",
      `Visited ${inspections.length} live company website${inspections.length === 1 ? "" : "s"}.`,
    );

    activateStep(runId, "extracting_contacts", "Extracting structured contacts and proof points...");
    const mappedLeads = inspections.map(({ candidate, inspection }, index) => {
      activateStep(
        runId,
        "extracting_contacts",
        `Extracting signals from ${candidate.companyName} (${index + 1}/${inspections.length})...`,
      );
      return mapCandidateToLead(candidate, inspection);
    });

    const decisionMakersFound = mappedLeads.reduce(
      (total, lead) => total + lead.contacts.filter((contact) => contact.isDecisionMaker).length,
      0,
    );

    updateSummary(runId, {
      decisionMakersFound,
    });
    completeStep(
      runId,
      "extracting_contacts",
      `Captured ${decisionMakersFound} decision-maker signal${decisionMakersFound === 1 ? "" : "s"}.`,
    );

    activateStep(runId, "ranking_leads", "Scoring fit and contactability...");
    const rankedLeads = rankLeads(input, mappedLeads);
    const qualifiedLeadCount = rankedLeads.filter((lead) => lead.score.priority !== "low").length;

    updateSummary(runId, {
      qualifiedLeadCount,
    });
    completeStep(
      runId,
      "ranking_leads",
      `${qualifiedLeadCount} lead${qualifiedLeadCount === 1 ? "" : "s"} ranked as demo-ready.`,
    );

    activateStep(runId, "ready_for_revon", "Packaging the shortlist for Revon...");
    completeStep(
      runId,
      "ready_for_revon",
      `${qualifiedLeadCount} qualified lead${qualifiedLeadCount === 1 ? "" : "s"} ready for Revon handoff.`,
    );
    finishRun(runId, rankedLeads);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The TinyFish discovery run failed.";
    failRun(runId, message);
  }
}

export function startDiscoveryRun(input: IcpInput): DemoRun {
  const run = createRun(input);
  void executeRun(run.id, input);
  return run;
}
