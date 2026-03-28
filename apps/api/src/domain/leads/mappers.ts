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
    const matchedEmail =
      emailPool.find((email) => firstName && email.includes(firstName)) ??
      inspection.emails[0] ??
      null;

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
): LeadRecord {
  const inspection = inspectionInput ?? createEmptyWebsiteInspection(candidate.websiteUrl);
  const contacts = buildContacts(inspection);
  const evidence = dedupeEvidence(
    [
      candidate.directoryUrl
        ? createEvidence({
            kind: "directory_listing",
            sourceUrl: candidate.directoryUrl,
            title: "Directory listing",
            summary: candidate.shortDescription || "Matched from a public B2B directory listing.",
          })
        : null,
      createEvidence({
        kind: "homepage",
        sourceUrl: inspection.homepageUrl,
        title: "Homepage positioning",
        summary: inspection.summary || candidate.shortDescription || "Homepage content reviewed.",
      }),
      inspection.contactPageUrl
        ? createEvidence({
            kind: "contact_page",
            sourceUrl: inspection.contactPageUrl,
            title: "Contact page",
            summary: inspection.emails.length
              ? `Public email(s) found: ${inspection.emails.join(", ")}`
              : "Contact page located during browse.",
          })
        : null,
      inspection.aboutPageUrl
        ? createEvidence({
            kind: "about_page",
            sourceUrl: inspection.aboutPageUrl,
            title: "About page",
            summary: inspection.signals[0] || "About page reviewed for positioning signals.",
          })
        : null,
      inspection.teamPageUrl
        ? createEvidence({
            kind: "team_page",
            sourceUrl: inspection.teamPageUrl,
            title: "Team page",
            summary: inspection.team.length
              ? `Detected ${inspection.team.length} team members.`
              : "Team page inspected during agent workflow.",
          })
        : null,
    ].filter((item): item is NonNullable<typeof item> => Boolean(item)),
  );

  return leadRecordSchema.parse({
    id: randomUUID(),
    companyName: candidate.companyName,
    websiteUrl: candidate.websiteUrl,
    companyDomain: extractDomain(candidate.websiteUrl),
    directoryUrl: candidate.directoryUrl,
    location: candidate.location,
    companySize: candidate.employeeRange,
    industry: candidate.primaryService,
    summary: inspection.summary || candidate.shortDescription,
    services: inspection.services,
    contacts,
    positioningSignals: inspection.signals,
    evidence,
    score: {
      fitScore: 0,
      contactabilityScore: 0,
      priority: "low",
      reasons: [],
    },
  });
}
