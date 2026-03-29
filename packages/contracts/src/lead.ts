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
export const leadPrioritySchema = z.enum(["high", "medium", "low"]);
export const leadQualificationStateSchema = z.enum(["qualified", "review", "unqualified"]);

export const icpInputSchema = z.object({
  targetMarket: z.string().trim().min(2, "Target market is required"),
  location: z.string().trim().min(2, "Location is required"),
  companySize: companySizeSchema.default("any"),
  keywords: z.string().trim().max(240).default(""),
  decisionMakerRole: z.string().trim().min(2).max(120).default("Founder or Head of Growth"),
  maxResults: z.coerce.number().int().min(1).max(8).default(5),
});

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

export const leadFieldAssessmentStatusSchema = z.enum(["present", "missing", "uncertain"]);

export const leadFieldAssessmentSchema = z.object({
  field: z.string(),
  status: leadFieldAssessmentStatusSchema,
  confidence: dataConfidenceSchema.default("medium"),
  sourceUrls: z.array(z.string().url()).default([]),
  notes: z.array(z.string()).default([]),
});

export const leadAgentContextSchema = z.object({
  agentSessionId: z.string(),
  correlationId: z.string().nullable().default(null),
  directoryUrl: z.string().url().nullable().default(null),
  directoryRunId: z.string().nullable().default(null),
  inspectionRunIds: z.array(z.string()).default([]),
  tinyfishRunIds: z.array(z.string()).default([]),
  captureMode: leadCaptureModeSchema.default("live"),
  runStartedAt: z.string().nullable().default(null),
});

export const rawEvidenceSchema = z.object({
  kind: leadEvidenceKindSchema,
  sourceUrl: z.string().url(),
  sourceLabel: z.string().default(""),
  title: z.string(),
  summary: z.string(),
  snippet: z.string().nullable().default(null),
  confidence: dataConfidenceSchema.default("medium"),
  qualityNote: z.string().nullable().default(null),
});

export const rawDirectoryExtractionSchema = z.object({
  companyName: z.string(),
  websiteUrl: z.string().url(),
  directoryUrl: z.string().url().nullable().default(null),
  location: z.string().default(""),
  shortDescription: z.string().default(""),
  primaryService: z.string().default(""),
  employeeRange: z.string().default(""),
  rating: z.number().nullable().default(null),
  listingFacts: z.array(z.string()).default([]),
  evidenceSnippet: z.string().nullable().default(null),
  qualityNotes: z.array(z.string()).default([]),
});

export const rawWebsitePageFindingSchema = z.object({
  kind: leadEvidenceKindSchema.default("other"),
  sourceUrl: z.string().url(),
  sourceLabel: z.string().default(""),
  findings: z.array(z.string()).default([]),
  missingFields: z.array(z.string()).default([]),
  uncertainFields: z.array(z.string()).default([]),
  qualityNotes: z.array(z.string()).default([]),
});

export const rawWebsiteTeamMemberSchema = z.object({
  name: z.string(),
  role: z.string(),
});

export const rawWebsiteExtractionSchema = z.object({
  homepageUrl: z.string().url(),
  contactPageUrl: z.string().url().nullable().default(null),
  aboutPageUrl: z.string().url().nullable().default(null),
  teamPageUrl: z.string().url().nullable().default(null),
  summary: z.string().default(""),
  services: z.array(z.string()).default([]),
  emails: z.array(z.string().email()).default([]),
  team: z.array(rawWebsiteTeamMemberSchema).default([]),
  evidence: z.array(rawEvidenceSchema).default([]),
  pageFindings: z.array(rawWebsitePageFindingSchema).default([]),
  inspectionStatus: leadInspectionStatusSchema.default("completed"),
  missingFields: z.array(z.string()).default([]),
  uncertainFields: z.array(z.string()).default([]),
  qualityNotes: z.array(z.string()).default([]),
});

export const leadRawExtractionSchema = z.object({
  directory: rawDirectoryExtractionSchema,
  website: rawWebsiteExtractionSchema,
});

export const normalizedLeadRecordSchema = z.object({
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
  fieldAssessments: z.array(leadFieldAssessmentSchema).default([]),
  agentContext: leadAgentContextSchema,
  rawExtraction: leadRawExtractionSchema,
});

export const leadScoreDimensionExplanationSchema = z.object({
  score: z.number().min(0).max(100),
  summary: z.string(),
  reasons: z.array(z.string()).default([]),
  notes: z.array(z.string()).default([]),
});

export const leadScoreExplanationsSchema = z.object({
  fit: leadScoreDimensionExplanationSchema,
  contactability: leadScoreDimensionExplanationSchema,
  quality: leadScoreDimensionExplanationSchema,
  decisionMaker: leadScoreDimensionExplanationSchema,
  total: leadScoreDimensionExplanationSchema,
});

export const leadScoreSchema = z.object({
  fitScore: z.number().min(0).max(100),
  contactabilityScore: z.number().min(0).max(100),
  qualityScore: z.number().min(0).max(100),
  decisionMakerScore: z.number().min(0).max(100),
  totalScore: z.number().min(0).max(100),
  priority: leadPrioritySchema,
  qualificationState: leadQualificationStateSchema.default("review"),
  reasons: z.array(z.string()).default([]),
  confidence: dataConfidenceSchema.default("medium"),
  qualityNotes: z.array(z.string()).default([]),
  explanations: leadScoreExplanationsSchema,
});

export const leadRecordSchema = normalizedLeadRecordSchema.extend({
  score: leadScoreSchema,
});

export type CompanySize = z.infer<typeof companySizeSchema>;
export type DataConfidence = z.infer<typeof dataConfidenceSchema>;
export type LeadCaptureMode = z.infer<typeof leadCaptureModeSchema>;
export type LeadInspectionStatus = z.infer<typeof leadInspectionStatusSchema>;
export type LeadPriority = z.infer<typeof leadPrioritySchema>;
export type LeadQualificationState = z.infer<typeof leadQualificationStateSchema>;
export type IcpInput = z.infer<typeof icpInputSchema>;
export type LeadContact = z.infer<typeof leadContactSchema>;
export type LeadEvidence = z.infer<typeof leadEvidenceSchema>;
export type LeadFieldAssessmentStatus = z.infer<typeof leadFieldAssessmentStatusSchema>;
export type LeadFieldAssessment = z.infer<typeof leadFieldAssessmentSchema>;
export type LeadAgentContext = z.infer<typeof leadAgentContextSchema>;
export type RawEvidence = z.infer<typeof rawEvidenceSchema>;
export type RawDirectoryExtraction = z.infer<typeof rawDirectoryExtractionSchema>;
export type RawWebsitePageFinding = z.infer<typeof rawWebsitePageFindingSchema>;
export type RawWebsiteTeamMember = z.infer<typeof rawWebsiteTeamMemberSchema>;
export type RawWebsiteExtraction = z.infer<typeof rawWebsiteExtractionSchema>;
export type LeadRawExtraction = z.infer<typeof leadRawExtractionSchema>;
export type NormalizedLeadRecord = z.infer<typeof normalizedLeadRecordSchema>;
export type LeadScoreDimensionExplanation = z.infer<typeof leadScoreDimensionExplanationSchema>;
export type LeadScoreExplanations = z.infer<typeof leadScoreExplanationsSchema>;
export type LeadScore = z.infer<typeof leadScoreSchema>;
export type LeadRecord = z.infer<typeof leadRecordSchema>;
