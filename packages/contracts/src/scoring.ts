import { z } from "zod";
import {
  icpInputSchema,
  leadAgentContextSchema,
  leadContactSchema,
  leadEvidenceSchema,
  leadFieldAssessmentSchema,
  leadInspectionStatusSchema,
  leadPrioritySchema,
  leadQualificationStateSchema,
  leadRawExtractionSchema,
  leadScoreExplanationsSchema,
  leadScoreSchema,
} from "./lead.js";

export const scorerNormalizedCompanySchema = z.object({
  companyName: z.string(),
  websiteUrl: z.string().url(),
  companyDomain: z.string(),
  directoryUrl: z.string().url().nullable().default(null),
  discoverySource: z.string().default(""),
  location: z.string().default(""),
  companySize: z.string().default(""),
  industry: z.string().default(""),
  summary: z.string().default(""),
  services: z.array(z.string()).default([]),
  qualityNotes: z.array(z.string()).default([]),
});

export const scorerSignalCountsSchema = z.object({
  contactCount: z.number().int().nonnegative().default(0),
  publicEmailCount: z.number().int().nonnegative().default(0),
  decisionMakerCount: z.number().int().nonnegative().default(0),
  evidenceCount: z.number().int().nonnegative().default(0),
  pageFindingCount: z.number().int().nonnegative().default(0),
});

export const scorerSignalsSchema = z.object({
  searchText: z.string(),
  keywordTerms: z.array(z.string()).default([]),
  counts: scorerSignalCountsSchema,
  missingFields: z.array(z.string()).default([]),
  uncertainFields: z.array(z.string()).default([]),
});

export const scorerUncertaintySummarySchema = z.object({
  missingFields: z.array(z.string()).default([]),
  uncertainFields: z.array(z.string()).default([]),
  qualityNotes: z.array(z.string()).default([]),
});

export const leadScorerInputSchema = z.object({
  session: leadAgentContextSchema,
  icp: icpInputSchema,
  company: scorerNormalizedCompanySchema,
  contacts: z.array(leadContactSchema).default([]),
  evidenceSources: z.array(leadEvidenceSchema).default([]),
  fieldAssessments: z.array(leadFieldAssessmentSchema).default([]),
  rawExtraction: leadRawExtractionSchema,
  inspectionStatus: leadInspectionStatusSchema,
  scoringSignals: scorerSignalsSchema,
  uncertaintySummary: scorerUncertaintySummarySchema,
});

export const leadScorerOutputSchema = leadScoreSchema;

export const scorerResultEnvelopeSchema = z.object({
  fitScore: z.number().min(0).max(100),
  contactabilityScore: z.number().min(0).max(100),
  qualityScore: z.number().min(0).max(100),
  decisionMakerScore: z.number().min(0).max(100),
  totalScore: z.number().min(0).max(100),
  priority: leadPrioritySchema,
  qualificationState: leadQualificationStateSchema,
  reasons: z.array(z.string()).default([]),
  qualityNotes: z.array(z.string()).default([]),
  explanations: leadScoreExplanationsSchema,
});

export type ScorerNormalizedCompany = z.infer<typeof scorerNormalizedCompanySchema>;
export type ScorerSignalCounts = z.infer<typeof scorerSignalCountsSchema>;
export type ScorerSignals = z.infer<typeof scorerSignalsSchema>;
export type ScorerUncertaintySummary = z.infer<typeof scorerUncertaintySummarySchema>;
export type LeadScorerInput = z.infer<typeof leadScorerInputSchema>;
export type LeadScorerOutput = z.infer<typeof leadScorerOutputSchema>;
export type ScorerResultEnvelope = z.infer<typeof scorerResultEnvelopeSchema>;
