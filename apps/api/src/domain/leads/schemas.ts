import {
  rawDirectoryExtractionSchema,
  rawEvidenceSchema,
  rawWebsiteExtractionSchema,
  rawWebsitePageFindingSchema,
  rawWebsiteTeamMemberSchema,
  type RawDirectoryExtraction,
  type RawEvidence,
  type RawWebsiteExtraction,
  type RawWebsitePageFinding,
  type RawWebsiteTeamMember,
} from "@revon-tinyfish/contracts";

export const directoryCandidateSchema = rawDirectoryExtractionSchema;
export const websiteTeamMemberSchema = rawWebsiteTeamMemberSchema;
export const inspectionEvidenceSchema = rawEvidenceSchema;
export const websitePageFindingSchema = rawWebsitePageFindingSchema;
export const websiteInspectionSchema = rawWebsiteExtractionSchema;

export type DirectoryCandidate = RawDirectoryExtraction;
export type WebsiteTeamMember = RawWebsiteTeamMember;
export type InspectionEvidence = RawEvidence;
export type WebsitePageFinding = RawWebsitePageFinding;
export type WebsiteInspection = RawWebsiteExtraction;

export function createEmptyWebsiteInspection(
  websiteUrl: string,
  overrides?: Partial<WebsiteInspection>,
): WebsiteInspection {
  return websiteInspectionSchema.parse({
    homepageUrl: websiteUrl,
    contactPageUrl: null,
    aboutPageUrl: null,
    teamPageUrl: null,
    summary: "",
    services: [],
    emails: [],
    team: [],
    evidence: [],
    pageFindings: [],
    inspectionStatus: "failed",
    missingFields: ["summary", "services", "emails", "team"],
    uncertainFields: [],
    qualityNotes: ["No structured website inspection data was captured."],
    ...overrides,
  });
}
