import { randomUUID } from "node:crypto";
import {
  leadAgentContextSchema,
  leadFieldAssessmentSchema,
  normalizedLeadRecordSchema,
  type LeadAgentContext,
  type LeadContact,
  type LeadFieldAssessment,
  type NormalizedLeadRecord,
} from "@revon-tinyfish/contracts";
import { createEvidence, dedupeEvidence } from "./evidence.js";
import {
  createEmptyWebsiteInspection,
  type DirectoryCandidate,
  type WebsiteInspection,
  type WebsitePageFinding,
} from "./schemas.js";

function extractDomain(websiteUrl: string): string {
  try {
    return new URL(websiteUrl).hostname.replace(/^www\./, "");
  } catch {
    return websiteUrl;
  }
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}

function isDecisionMakerRole(role: string): boolean {
  return /founder|ceo|chief|head|director|vp|partner|owner|president/i.test(role);
}

function buildContacts(inspection: WebsiteInspection): LeadContact[] {
  const emailPool = inspection.emails.map((email) => email.toLowerCase());
  const contacts = inspection.team.map((member) => {
    const firstName = member.name.split(" ")[0]?.toLowerCase() ?? "";
    const matchedEmail = emailPool.find((email) => firstName && email.includes(firstName)) ?? null;

    return {
      id: randomUUID(),
      name: member.name,
      role: member.role,
      email: matchedEmail,
      linkedinUrl: null,
      isDecisionMaker: isDecisionMakerRole(member.role),
    };
  });

  if (contacts.length > 0) {
    return contacts;
  }

  if (inspection.emails[0]) {
    return [
      {
        id: randomUUID(),
        name: "General contact",
        role: "Inbox",
        email: inspection.emails[0],
        linkedinUrl: null,
        isDecisionMaker: false,
      },
    ];
  }

  return [];
}

function summarizePageFinding(pageFinding: WebsitePageFinding): string {
  if (pageFinding.findings.length > 0) {
    return pageFinding.findings.join(" | ");
  }
  if (pageFinding.missingFields.length > 0) {
    return `Page reviewed with missing fields: ${pageFinding.missingFields.join(", ")}.`;
  }
  return "Page reviewed during TinyFish extraction.";
}

function buildPageFindingEvidence(pageFinding: WebsitePageFinding) {
  return createEvidence({
    kind: pageFinding.kind,
    sourceUrl: pageFinding.sourceUrl,
    sourceLabel: pageFinding.sourceLabel,
    title: `${pageFinding.sourceLabel || "page"} findings`,
    summary: summarizePageFinding(pageFinding),
    snippet: pageFinding.findings[0] ?? null,
    confidence: pageFinding.uncertainFields.length > 0 ? "medium" : "high",
    qualityNote: pageFinding.qualityNotes[0] ?? null,
  });
}

function buildPositioningSignals(candidate: DirectoryCandidate, inspection: WebsiteInspection): string[] {
  return [
    candidate.primaryService,
    ...candidate.listingFacts,
    ...inspection.services,
    ...inspection.pageFindings.flatMap((item) => item.findings),
  ]
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item, index, collection) => collection.indexOf(item) === index)
    .slice(0, 8);
}

function buildAgentContext(
  captureMode: "live" | "mock",
  candidate: DirectoryCandidate,
  options?: {
    agentContext?: Partial<LeadAgentContext>;
  },
): LeadAgentContext {
  const inspectionRunIds = uniqueStrings(options?.agentContext?.inspectionRunIds ?? []);
  const tinyfishRunIds = uniqueStrings([
    options?.agentContext?.directoryRunId ?? null,
    ...(options?.agentContext?.tinyfishRunIds ?? []),
    ...inspectionRunIds,
  ]);

  return leadAgentContextSchema.parse({
    agentSessionId: options?.agentContext?.agentSessionId ?? `local-${extractDomain(candidate.websiteUrl)}`,
    correlationId: options?.agentContext?.correlationId ?? null,
    directoryUrl: options?.agentContext?.directoryUrl ?? candidate.directoryUrl ?? null,
    directoryRunId: options?.agentContext?.directoryRunId ?? null,
    inspectionRunIds,
    tinyfishRunIds,
    captureMode,
    runStartedAt: options?.agentContext?.runStartedAt ?? null,
  });
}

function buildFieldAssessment(input: {
  field: string;
  present: boolean;
  uncertain?: boolean;
  sourceUrls?: string[];
  notes?: string[];
  presentConfidence?: "high" | "medium" | "low";
}): LeadFieldAssessment {
  const status = input.uncertain ? "uncertain" : input.present ? "present" : "missing";
  const confidence = !input.present
    ? "low"
    : input.presentConfidence
      ? input.presentConfidence
      : input.uncertain
        ? "medium"
        : "high";

  return leadFieldAssessmentSchema.parse({
    field: input.field,
    status,
    confidence,
    sourceUrls: uniqueStrings(input.sourceUrls ?? []),
    notes: input.notes ?? [],
  });
}

function buildFieldAssessments(
  candidate: DirectoryCandidate,
  inspection: WebsiteInspection,
  contacts: LeadContact[],
  evidenceSourceUrls: string[],
): LeadFieldAssessment[] {
  const uncertain = new Set(inspection.uncertainFields);
  const sourceUrls = {
    directory: uniqueStrings([candidate.directoryUrl]),
    homepage: uniqueStrings([inspection.homepageUrl]),
    contact: uniqueStrings([inspection.contactPageUrl]),
    about: uniqueStrings([inspection.aboutPageUrl]),
    team: uniqueStrings([inspection.teamPageUrl]),
    all: uniqueStrings(evidenceSourceUrls),
  };

  return [
    buildFieldAssessment({
      field: "company_summary",
      present: Boolean(inspection.summary || candidate.shortDescription),
      uncertain: uncertain.has("summary"),
      sourceUrls: sourceUrls.homepage,
      notes: inspection.summary ? [] : ["Fell back to directory summary text."],
    }),
    buildFieldAssessment({
      field: "services",
      present: inspection.services.length > 0 || Boolean(candidate.primaryService),
      uncertain: uncertain.has("services"),
      sourceUrls: sourceUrls.all,
      notes: inspection.services.length > 0 ? [] : ["No explicit website service list was captured."],
    }),
    buildFieldAssessment({
      field: "location",
      present: Boolean(candidate.location),
      uncertain: uncertain.has("location"),
      sourceUrls: [...sourceUrls.directory, ...sourceUrls.homepage],
    }),
    buildFieldAssessment({
      field: "company_size",
      present: Boolean(candidate.employeeRange),
      uncertain: uncertain.has("company_size") || uncertain.has("employee_range"),
      sourceUrls: sourceUrls.directory,
    }),
    buildFieldAssessment({
      field: "public_email",
      present: inspection.emails.length > 0,
      uncertain: uncertain.has("emails"),
      sourceUrls: sourceUrls.contact.length > 0 ? sourceUrls.contact : sourceUrls.all,
      notes: inspection.emails.length > 0 ? [] : ["No explicit public email was captured."],
      presentConfidence: inspection.emails.length > 0 ? "high" : "low",
    }),
    buildFieldAssessment({
      field: "team_contacts",
      present: inspection.team.length > 0,
      uncertain: uncertain.has("team"),
      sourceUrls: sourceUrls.team.length > 0 ? sourceUrls.team : sourceUrls.all,
      notes: inspection.team.length > 0 ? [] : ["No named team members were captured."],
    }),
    buildFieldAssessment({
      field: "decision_maker_coverage",
      present: contacts.some((contact) => contact.isDecisionMaker),
      uncertain: uncertain.has("decision_maker") || uncertain.has("decision-maker relevance"),
      sourceUrls: sourceUrls.team.length > 0 ? sourceUrls.team : sourceUrls.all,
      notes: contacts.some((contact) => contact.isDecisionMaker)
        ? []
        : ["No explicit decision-maker title was captured."],
    }),
    buildFieldAssessment({
      field: "evidence_coverage",
      present: evidenceSourceUrls.length > 0,
      uncertain: uncertain.has("evidence"),
      sourceUrls: sourceUrls.all,
      notes: evidenceSourceUrls.length >= 3 ? [] : ["Limited evidence coverage was captured for this lead."],
      presentConfidence: evidenceSourceUrls.length >= 3 ? "high" : "medium",
    }),
  ];
}

export function normalizeLeadCandidate(
  candidate: DirectoryCandidate,
  inspectionInput?: WebsiteInspection,
  options?: {
    captureMode?: "live" | "mock" | undefined;
    agentContext?: Partial<LeadAgentContext> | undefined;
  },
): NormalizedLeadRecord {
  const inspection = inspectionInput ?? createEmptyWebsiteInspection(candidate.websiteUrl);
  const captureMode = options?.captureMode ?? "live";
  const contacts = buildContacts(inspection);
  const evidence = dedupeEvidence(
    [
      candidate.directoryUrl
        ? createEvidence({
            kind: "directory_listing",
            sourceUrl: candidate.directoryUrl,
            sourceLabel: "directory listing",
            title: "Directory listing",
            summary: candidate.shortDescription || "Matched from a public B2B directory listing.",
            snippet: candidate.evidenceSnippet,
            confidence: candidate.evidenceSnippet ? "high" : "medium",
            qualityNote: candidate.qualityNotes[0] ?? null,
          })
        : null,
      createEvidence({
        kind: "homepage",
        sourceUrl: inspection.homepageUrl,
        sourceLabel: "homepage",
        title: "Homepage review",
        summary: inspection.summary || candidate.shortDescription || "Homepage content reviewed.",
        snippet: inspection.pageFindings[0]?.findings[0] ?? null,
        confidence:
          inspection.inspectionStatus === "completed"
            ? "high"
            : inspection.inspectionStatus === "partial"
              ? "medium"
              : "low",
        qualityNote: inspection.qualityNotes[0] ?? null,
      }),
      inspection.contactPageUrl
        ? createEvidence({
            kind: "contact_page",
            sourceUrl: inspection.contactPageUrl,
            sourceLabel: "contact page",
            title: "Contact page",
            summary: inspection.emails.length
              ? `Public email(s) found: ${inspection.emails.join(", ")}`
              : "Contact page located during browse.",
            snippet: inspection.emails[0] ?? null,
            confidence: inspection.emails.length ? "high" : "medium",
            qualityNote: inspection.emails.length ? null : "No explicit email was visible on the contact page.",
          })
        : null,
      inspection.aboutPageUrl
        ? createEvidence({
            kind: "about_page",
            sourceUrl: inspection.aboutPageUrl,
            sourceLabel: "about page",
            title: "About page",
            summary:
              inspection.pageFindings.find((item) => item.kind === "about_page")?.findings.join(" | ") ||
              "About page reviewed.",
            snippet:
              inspection.pageFindings.find((item) => item.kind === "about_page")?.findings[0] ?? null,
            confidence: "medium",
            qualityNote:
              inspection.pageFindings.find((item) => item.kind === "about_page")?.qualityNotes[0] ?? null,
          })
        : null,
      inspection.teamPageUrl
        ? createEvidence({
            kind: "team_page",
            sourceUrl: inspection.teamPageUrl,
            sourceLabel: "team page",
            title: "Team page",
            summary: inspection.team.length
              ? `Detected ${inspection.team.length} team member${inspection.team.length === 1 ? "" : "s"}.`
              : "Team page inspected during agent workflow.",
            snippet: inspection.team[0] ? `${inspection.team[0].name} | ${inspection.team[0].role}` : null,
            confidence: inspection.team.length ? "high" : "medium",
            qualityNote: inspection.team.length ? null : "No named team members were captured from the team page.",
          })
        : null,
      ...inspection.evidence.map((item) =>
        createEvidence({
          kind: item.kind,
          sourceUrl: item.sourceUrl,
          sourceLabel: item.sourceLabel,
          title: item.title,
          summary: item.summary,
          snippet: item.snippet,
          confidence: item.confidence,
          qualityNote: item.qualityNote,
        }),
      ),
      ...inspection.pageFindings.map((item) => buildPageFindingEvidence(item)),
    ].filter((item): item is NonNullable<typeof item> => Boolean(item)),
  );

  const qualityNotes = [
    ...candidate.qualityNotes,
    ...inspection.qualityNotes,
    ...(inspection.missingFields.length > 0
      ? [`Missing or unavailable fields: ${inspection.missingFields.join(", ")}.`]
      : []),
    ...(inspection.uncertainFields.length > 0
      ? [`Uncertain fields: ${inspection.uncertainFields.join(", ")}.`]
      : []),
  ].filter((note, index, collection) => collection.indexOf(note) === index);

  const agentContext = buildAgentContext(
    captureMode,
    candidate,
    options?.agentContext
      ? {
          agentContext: options.agentContext,
        }
      : undefined,
  );
  const fieldAssessments = buildFieldAssessments(
    candidate,
    inspection,
    contacts,
    evidence.map((item) => item.sourceUrl),
  );

  return normalizedLeadRecordSchema.parse({
    id: randomUUID(),
    companyName: candidate.companyName,
    websiteUrl: candidate.websiteUrl,
    companyDomain: extractDomain(candidate.websiteUrl),
    directoryUrl: candidate.directoryUrl,
    discoverySource: candidate.directoryUrl ? "clutch.co" : "website",
    captureMode,
    inspectionStatus: inspection.inspectionStatus,
    location: candidate.location,
    companySize: candidate.employeeRange,
    industry: candidate.primaryService,
    summary: inspection.summary || candidate.shortDescription,
    services: inspection.services,
    contacts,
    positioningSignals: buildPositioningSignals(candidate, inspection),
    evidence,
    matchReasons: [],
    qualityNotes,
    fieldAssessments,
    agentContext,
    rawExtraction: {
      directory: candidate,
      website: inspection,
    },
  });
}

export function mapCandidateToLead(
  candidate: DirectoryCandidate,
  inspectionInput?: WebsiteInspection,
  options?: {
    captureMode?: "live" | "mock" | undefined;
    agentContext?: Partial<LeadAgentContext> | undefined;
  },
): NormalizedLeadRecord {
  return normalizeLeadCandidate(candidate, inspectionInput, options);
}
