import { z } from "zod";

export const companySizeSchema = z.enum([
  "any",
  "1-10",
  "11-50",
  "51-200",
  "201-1000",
  "1000+",
]);

export const dataConfidenceSchema = z.enum(["high", "medium", "low"]);
export const leadCaptureModeSchema = z.enum(["live", "mock"]);
export const leadInspectionStatusSchema = z.enum(["completed", "partial", "failed"]);

export const icpInputSchema = z.object({
  targetMarket: z.string().trim().min(2, "Target market is required"),
  location: z.string().trim().min(2, "Location is required"),
  companySize: companySizeSchema.default("any"),
  keywords: z.string().trim().max(240).default(""),
  decisionMakerRole: z.string().trim().min(2).max(120).default("Founder or Head of Growth"),
  maxResults: z.coerce.number().int().min(1).max(8).default(5),
});

export const leadPrioritySchema = z.enum(["high", "medium", "low"]);

export const leadContactSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  email: z.string().email().nullable(),
  linkedinUrl: z.string().url().nullable(),
  isDecisionMaker: z.boolean(),
});

export const leadEvidenceKindSchema = z.enum([
  "directory_listing",
  "homepage",
  "contact_page",
  "about_page",
  "team_page",
  "footer",
  "other",
]);

export const leadEvidenceSchema = z.object({
  id: z.string(),
  kind: leadEvidenceKindSchema,
  sourceUrl: z.string().url(),
  sourceLabel: z.string().default(""),
  title: z.string(),
  summary: z.string(),
  snippet: z.string().nullable().default(null),
  confidence: dataConfidenceSchema.default("medium"),
  qualityNote: z.string().nullable().default(null),
});

export const leadScoreSchema = z.object({
  fitScore: z.number().min(0).max(100),
  contactabilityScore: z.number().min(0).max(100),
  priority: leadPrioritySchema,
  reasons: z.array(z.string()).default([]),
  confidence: dataConfidenceSchema.default("medium"),
  qualityNotes: z.array(z.string()).default([]),
});

export const leadRecordSchema = z.object({
  id: z.string(),
  companyName: z.string(),
  websiteUrl: z.string().url(),
  companyDomain: z.string(),
  directoryUrl: z.string().url().nullable().default(null),
  discoverySource: z.string().default(""),
  captureMode: leadCaptureModeSchema.default("live"),
  inspectionStatus: leadInspectionStatusSchema.default("completed"),
  location: z.string().default(""),
  companySize: z.string().default(""),
  industry: z.string().default(""),
  summary: z.string().default(""),
  services: z.array(z.string()).default([]),
  contacts: z.array(leadContactSchema).default([]),
  positioningSignals: z.array(z.string()).default([]),
  evidence: z.array(leadEvidenceSchema).default([]),
  matchReasons: z.array(z.string()).default([]),
  qualityNotes: z.array(z.string()).default([]),
  score: leadScoreSchema,
});

export type CompanySize = z.infer<typeof companySizeSchema>;
export type DataConfidence = z.infer<typeof dataConfidenceSchema>;
export type LeadCaptureMode = z.infer<typeof leadCaptureModeSchema>;
export type LeadInspectionStatus = z.infer<typeof leadInspectionStatusSchema>;
export type IcpInput = z.infer<typeof icpInputSchema>;
export type LeadPriority = z.infer<typeof leadPrioritySchema>;
export type LeadContact = z.infer<typeof leadContactSchema>;
export type LeadEvidence = z.infer<typeof leadEvidenceSchema>;
export type LeadScore = z.infer<typeof leadScoreSchema>;
export type LeadRecord = z.infer<typeof leadRecordSchema>;
