import { randomUUID } from "node:crypto";
import { leadRecordSchema, type LeadContact, type LeadRecord } from "@revon-tinyfish/contracts";
import { createEvidence, dedupeEvidence } from "./evidence.js";
import { createEmptyWebsiteInspection, type DirectoryCandidate, type WebsiteInspection } from "./schemas.js";

function extractDomain(websiteUrl: string): string {
  try {
    return new URL(websiteUrl).hostname.replace(/^www\./, "");
  } catch {
    return websiteUrl;
  }
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
      isDecisionMaker: /founder|ceo|chief|head|director|vp|partner|owner|president/i.test(
        member.role,
      ),
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

export function mapCandidateToLead(
  candidate: DirectoryCandidate,
  inspectionInput?: WebsiteInspection,
  options?: {
    captureMode?: "live" | "mock";
  },
): LeadRecord {
  const inspection = inspectionInput ?? createEmptyWebsiteInspection(candidate.websiteUrl);
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
        title: "Homepage positioning",
        summary: inspection.summary || candidate.shortDescription || "Homepage content reviewed.",
        snippet: null,
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
            snippet: null,
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
            summary: inspection.signals[0] || "About page reviewed for positioning signals.",
            snippet: null,
            confidence: inspection.signals[0] ? "high" : "medium",
            qualityNote: inspection.signals[0] ? null : "About page was found but yielded limited signals.",
          })
        : null,
      inspection.teamPageUrl
        ? createEvidence({
            kind: "team_page",
            sourceUrl: inspection.teamPageUrl,
            sourceLabel: "team page",
            title: "Team page",
            summary: inspection.team.length
              ? `Detected ${inspection.team.length} team members.`
              : "Team page inspected during agent workflow.",
            snippet: null,
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
  ];

  return leadRecordSchema.parse({
    id: randomUUID(),
    companyName: candidate.companyName,
    websiteUrl: candidate.websiteUrl,
    companyDomain: extractDomain(candidate.websiteUrl),
    directoryUrl: candidate.directoryUrl,
    discoverySource: candidate.directoryUrl ? "clutch.co" : "website",
    captureMode: options?.captureMode ?? "live",
    inspectionStatus: inspection.inspectionStatus,
    location: candidate.location,
    companySize: candidate.employeeRange,
    industry: candidate.primaryService,
    summary: inspection.summary || candidate.shortDescription,
    services: inspection.services,
    contacts,
    positioningSignals: inspection.signals,
    evidence,
    matchReasons: candidate.matchReasons,
    qualityNotes,
    score: {
      fitScore: 0,
      contactabilityScore: 0,
      priority: "low",
      reasons: [],
      confidence:
        inspection.inspectionStatus === "completed"
          ? "medium"
          : inspection.inspectionStatus === "partial"
            ? "low"
            : "low",
      qualityNotes: [],
    },
  });
}
