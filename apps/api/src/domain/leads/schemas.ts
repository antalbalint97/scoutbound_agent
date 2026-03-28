import {
  dataConfidenceSchema,
  leadEvidenceKindSchema,
  leadInspectionStatusSchema,
} from "@revon-tinyfish/contracts";
import { z } from "zod";

export const directoryCandidateSchema = z.object({
  companyName: z.string(),
  websiteUrl: z.string().url(),
  directoryUrl: z.string().url().nullable().default(null),
  location: z.string().default(""),
  shortDescription: z.string().default(""),
  primaryService: z.string().default(""),
  employeeRange: z.string().default(""),
  rating: z.number().nullable().default(null),
  matchReasons: z.array(z.string()).default([]),
  evidenceSnippet: z.string().nullable().default(null),
  qualityNotes: z.array(z.string()).default([]),
});

export const websiteTeamMemberSchema = z.object({
  name: z.string(),
  role: z.string(),
});

export const inspectionEvidenceSchema = z.object({
  kind: leadEvidenceKindSchema,
  sourceUrl: z.string().url(),
  sourceLabel: z.string().default(""),
  title: z.string(),
  summary: z.string(),
  snippet: z.string().nullable().default(null),
  confidence: dataConfidenceSchema.default("medium"),
  qualityNote: z.string().nullable().default(null),
});

export const websiteInspectionSchema = z.object({
  homepageUrl: z.string().url(),
  contactPageUrl: z.string().url().nullable().default(null),
  aboutPageUrl: z.string().url().nullable().default(null),
  teamPageUrl: z.string().url().nullable().default(null),
  summary: z.string().default(""),
  services: z.array(z.string()).default([]),
  emails: z.array(z.string().email()).default([]),
  team: z.array(websiteTeamMemberSchema).default([]),
  signals: z.array(z.string()).default([]),
  evidence: z.array(inspectionEvidenceSchema).default([]),
  inspectionStatus: leadInspectionStatusSchema.default("completed"),
  missingFields: z.array(z.string()).default([]),
  uncertainFields: z.array(z.string()).default([]),
  qualityNotes: z.array(z.string()).default([]),
});

export type DirectoryCandidate = z.infer<typeof directoryCandidateSchema>;
export type WebsiteTeamMember = z.infer<typeof websiteTeamMemberSchema>;
export type InspectionEvidence = z.infer<typeof inspectionEvidenceSchema>;
export type WebsiteInspection = z.infer<typeof websiteInspectionSchema>;

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
    signals: [],
    evidence: [],
    inspectionStatus: "failed",
    missingFields: ["summary", "emails", "team", "signals"],
    uncertainFields: [],
    qualityNotes: ["No structured website inspection data was captured."],
    ...overrides,
  });
}
