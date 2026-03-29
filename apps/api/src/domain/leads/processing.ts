import {
  leadScorerInputSchema,
  type IcpInput,
  type LeadAgentContext,
  type LeadCaptureMode,
  type LeadRecord,
  type LeadScorerInput,
} from "@revon-tinyfish/contracts";
import { normalizeLeadCandidate } from "./mappers.js";
import { applyScoreToLead, scoreLeadInput, sortLeadRecords } from "./ranking.js";
import type { DirectoryCandidate, WebsiteInspection } from "./schemas.js";

export interface LeadProcessingItem {
  candidate: DirectoryCandidate;
  inspection: WebsiteInspection;
  inspectionRunIds?: string[] | undefined;
}

export interface LeadProcessingSessionContext {
  agentSessionId?: string;
  correlationId?: string | null;
  directoryUrl?: string | null;
  directoryRunId?: string | null;
  runStartedAt?: string | null;
}

interface ProcessLeadCandidateOptions {
  captureMode?: LeadCaptureMode;
  sessionContext?: LeadProcessingSessionContext;
}

function splitKeywords(keywords: string): string[] {
  return keywords
    .split(/[,|]/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2);
}

function extractDomain(websiteUrl: string): string {
  try {
    return new URL(websiteUrl).hostname.replace(/^www\./, "");
  } catch {
    return websiteUrl;
  }
}

function collectSearchText(lead: ReturnType<typeof normalizeLeadCandidate>): string {
  return [
    lead.summary,
    lead.industry,
    lead.location,
    lead.companySize,
    lead.services.join(" "),
    lead.positioningSignals.join(" "),
    lead.contacts.map((contact) => `${contact.name} ${contact.role}`).join(" "),
    lead.rawExtraction.directory.shortDescription,
    lead.rawExtraction.directory.primaryService,
    lead.rawExtraction.directory.listingFacts.join(" "),
    lead.rawExtraction.website.pageFindings.flatMap((item) => item.findings).join(" "),
    lead.evidence.map((item) => `${item.title} ${item.summary} ${item.snippet ?? ""}`).join(" "),
  ]
    .join(" ")
    .trim();
}

function buildAgentContext(
  candidate: DirectoryCandidate,
  sessionContext?: LeadProcessingSessionContext,
  captureMode?: LeadCaptureMode,
  inspectionRunIds?: string[],
): Partial<LeadAgentContext> {
  return {
    agentSessionId: sessionContext?.agentSessionId ?? `local-${extractDomain(candidate.websiteUrl)}`,
    correlationId: sessionContext?.correlationId ?? null,
    directoryUrl: sessionContext?.directoryUrl ?? candidate.directoryUrl ?? null,
    directoryRunId: sessionContext?.directoryRunId ?? null,
    inspectionRunIds: inspectionRunIds ?? [],
    tinyfishRunIds: [
      ...(sessionContext?.directoryRunId ? [sessionContext.directoryRunId] : []),
      ...(inspectionRunIds ?? []),
    ],
    captureMode: captureMode ?? "live",
    runStartedAt: sessionContext?.runStartedAt ?? null,
  };
}

export function buildLeadScorerInput(
  input: IcpInput,
  lead: ReturnType<typeof normalizeLeadCandidate>,
): LeadScorerInput {
  return leadScorerInputSchema.parse({
    session: lead.agentContext,
    icp: input,
    company: {
      companyName: lead.companyName,
      websiteUrl: lead.websiteUrl,
      companyDomain: lead.companyDomain,
      directoryUrl: lead.directoryUrl,
      discoverySource: lead.discoverySource,
      location: lead.location,
      companySize: lead.companySize,
      industry: lead.industry,
      summary: lead.summary,
      services: lead.services,
      qualityNotes: lead.qualityNotes,
    },
    contacts: lead.contacts,
    evidenceSources: lead.evidence,
    fieldAssessments: lead.fieldAssessments,
    rawExtraction: lead.rawExtraction,
    inspectionStatus: lead.inspectionStatus,
    scoringSignals: {
      searchText: collectSearchText(lead),
      keywordTerms: splitKeywords(input.keywords),
      counts: {
        contactCount: lead.contacts.length,
        publicEmailCount: lead.contacts.filter((contact) => Boolean(contact.email)).length,
        decisionMakerCount: lead.contacts.filter((contact) => contact.isDecisionMaker).length,
        evidenceCount: lead.evidence.length,
        pageFindingCount: lead.rawExtraction.website.pageFindings.length,
      },
      missingFields: lead.rawExtraction.website.missingFields,
      uncertainFields: lead.rawExtraction.website.uncertainFields,
    },
    uncertaintySummary: {
      missingFields: lead.rawExtraction.website.missingFields,
      uncertainFields: lead.rawExtraction.website.uncertainFields,
      qualityNotes: lead.qualityNotes,
    },
  });
}

export function processLeadCandidates(
  input: IcpInput,
  inspections: LeadProcessingItem[],
  options?: ProcessLeadCandidateOptions,
): LeadRecord[] {
  const normalizedLeads = inspections.map(({ candidate, inspection, inspectionRunIds }) =>
    normalizeLeadCandidate(candidate, inspection, {
      captureMode: options?.captureMode,
      agentContext: buildAgentContext(candidate, options?.sessionContext, options?.captureMode, inspectionRunIds),
    }),
  );

  const scoredLeads = normalizedLeads.map((lead) =>
    applyScoreToLead(lead, scoreLeadInput(buildLeadScorerInput(input, lead))),
  );
  return sortLeadRecords(scoredLeads);
}
