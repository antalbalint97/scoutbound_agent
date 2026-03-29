import { z } from "zod";
import {
  dataConfidenceSchema,
  leadInspectionStatusSchema,
  leadQualificationStateSchema,
} from "./lead.js";
import { experimentLabelSchema, runModeSchema, runQualitySchema, runStatusSchema } from "./run.js";

export const telemetryRunStageSchema = z.enum(["directory_discovery", "website_inspection"]);
export const telemetryRunFinalStatusSchema = z.enum([
  "pending",
  "submitted",
  "polling",
  "completed",
  "partial",
  "failed",
  "cancelled",
  "timed_out",
]);

export const tinyFishRunTelemetrySchema = z.object({
  tinyfishRunId: z.string(),
  parentSessionId: z.string(),
  stage: telemetryRunStageSchema,
  targetUrl: z.string().url(),
  startedAt: z.string().nullable().default(null),
  completedAt: z.string().nullable().default(null),
  durationMs: z.number().int().nonnegative().nullable().default(null),
  finalStatus: telemetryRunFinalStatusSchema,
  inspectionStatus: leadInspectionStatusSchema.nullable().default(null),
  companyName: z.string().nullable().default(null),
  creditUsage: z.number().nonnegative().nullable().default(null),
  timeoutFlag: z.boolean().default(false),
  degradedFlag: z.boolean().default(false),
  errorMessage: z.string().nullable().default(null),
});

export const sessionQualityMetricsSchema = z.object({
  usableLeadCount: z.number().int().nonnegative().default(0),
  highConfidenceLeadCount: z.number().int().nonnegative().default(0),
  averageFitScore: z.number().nonnegative().default(0),
  averageContactabilityScore: z.number().nonnegative().default(0),
  averageQualityScore: z.number().nonnegative().default(0),
  averageTotalScore: z.number().nonnegative().default(0),
  averageContactsPerUsableLead: z.number().nonnegative().default(0),
  averageEvidenceSourcesPerLead: z.number().nonnegative().default(0),
  percentageWithDecisionMaker: z.number().min(0).max(100).default(0),
  percentageWithPublicEmail: z.number().min(0).max(100).default(0),
  percentageWithCompletedInspection: z.number().min(0).max(100).default(0),
  percentagePartialOrFailed: z.number().min(0).max(100).default(0),
});

export const sessionCostMetricsSchema = z.object({
  secondsPerQualifiedLead: z.number().nonnegative().nullable().default(null),
  secondsPerUsableLead: z.number().nonnegative().nullable().default(null),
  runsPerSession: z.number().nonnegative().default(0),
  inspectionsPerQualifiedLead: z.number().nonnegative().nullable().default(null),
  creditsPerSession: z.number().nonnegative().nullable().default(null),
  creditsPerUsableLead: z.number().nonnegative().nullable().default(null),
});

const DEFAULT_SESSION_QUALITY_METRICS = {
  usableLeadCount: 0,
  highConfidenceLeadCount: 0,
  averageFitScore: 0,
  averageContactabilityScore: 0,
  averageQualityScore: 0,
  averageTotalScore: 0,
  averageContactsPerUsableLead: 0,
  averageEvidenceSourcesPerLead: 0,
  percentageWithDecisionMaker: 0,
  percentageWithPublicEmail: 0,
  percentageWithCompletedInspection: 0,
  percentagePartialOrFailed: 0,
} satisfies z.input<typeof sessionQualityMetricsSchema>;

const DEFAULT_SESSION_COST_METRICS = {
  secondsPerQualifiedLead: null,
  secondsPerUsableLead: null,
  runsPerSession: 0,
  inspectionsPerQualifiedLead: null,
  creditsPerSession: null,
  creditsPerUsableLead: null,
} satisfies z.input<typeof sessionCostMetricsSchema>;

export const sessionTelemetrySchema = z.object({
  sessionId: z.string(),
  agentSessionId: z.string(),
  correlationId: z.string().nullable().default(null),
  experimentLabel: experimentLabelSchema,
  captureMode: runModeSchema,
  runStatus: runStatusSchema.default("running"),
  runQuality: runQualitySchema.default("healthy"),
  directoryUrl: z.string().url().nullable().default(null),
  runStartedAt: z.string(),
  runCompletedAt: z.string().nullable().default(null),
  totalWallClockMs: z.number().int().nonnegative().default(0),
  totalCompaniesFound: z.number().int().nonnegative().default(0),
  totalCompaniesInspected: z.number().int().nonnegative().default(0),
  totalCompletedInspections: z.number().int().nonnegative().default(0),
  totalPartialInspections: z.number().int().nonnegative().default(0),
  totalFailedInspections: z.number().int().nonnegative().default(0),
  totalQualifiedLeads: z.number().int().nonnegative().default(0),
  totalReviewLeads: z.number().int().nonnegative().default(0),
  totalUnqualifiedLeads: z.number().int().nonnegative().default(0),
  totalDecisionMakersFound: z.number().int().nonnegative().default(0),
  totalPublicEmailsFound: z.number().int().nonnegative().default(0),
  qualityMetrics: sessionQualityMetricsSchema.default(DEFAULT_SESSION_QUALITY_METRICS),
  costMetrics: sessionCostMetricsSchema.default(DEFAULT_SESSION_COST_METRICS),
  creditsAvailable: z.boolean().default(false),
  tinyfishRuns: z.array(tinyFishRunTelemetrySchema).default([]),
});

export const experimentVariantSummarySchema = z.object({
  experimentLabel: experimentLabelSchema,
  sessionCount: z.number().int().nonnegative(),
  averageWallClockMs: z.number().nonnegative(),
  averageQualifiedLeadCount: z.number().nonnegative(),
  averageUsableLeadCount: z.number().nonnegative(),
  averageTotalScore: z.number().nonnegative(),
  averagePartialOrFailedPercentage: z.number().nonnegative(),
  averageSecondsPerQualifiedLead: z.number().nonnegative().nullable(),
  averageCreditsPerUsableLead: z.number().nonnegative().nullable(),
});

export const telemetrySessionListResponseSchema = z.object({
  sessions: z.array(sessionTelemetrySchema),
});

export const telemetryVariantListResponseSchema = z.object({
  variants: z.array(experimentVariantSummarySchema),
});

export const experimentComparisonSchema = z.object({
  left: experimentVariantSummarySchema,
  right: experimentVariantSummarySchema,
  delta: z.object({
    wallClockMs: z.number(),
    qualifiedLeadCount: z.number(),
    usableLeadCount: z.number(),
    averageTotalScore: z.number(),
    partialOrFailedPercentage: z.number(),
    secondsPerQualifiedLead: z.number().nullable(),
  }),
});

export const leadConfidenceSummarySchema = z.object({
  field: z.string(),
  confidence: dataConfidenceSchema,
  qualificationState: leadQualificationStateSchema,
});

export type TelemetryRunStage = z.infer<typeof telemetryRunStageSchema>;
export type TelemetryRunFinalStatus = z.infer<typeof telemetryRunFinalStatusSchema>;
export type TinyFishRunTelemetry = z.infer<typeof tinyFishRunTelemetrySchema>;
export type SessionQualityMetrics = z.infer<typeof sessionQualityMetricsSchema>;
export type SessionCostMetrics = z.infer<typeof sessionCostMetricsSchema>;
export type SessionTelemetry = z.infer<typeof sessionTelemetrySchema>;
export type ExperimentVariantSummary = z.infer<typeof experimentVariantSummarySchema>;
export type ExperimentComparison = z.infer<typeof experimentComparisonSchema>;
