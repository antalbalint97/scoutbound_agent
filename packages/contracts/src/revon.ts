import { z } from "zod";
import {
  dataConfidenceSchema,
  leadCaptureModeSchema,
  leadFieldAssessmentStatusSchema,
  leadInspectionStatusSchema,
  leadQualificationStateSchema,
  leadRawExtractionSchema,
  leadScoreSchema,
  leadEvidenceKindSchema,
} from "./lead.js";

export const revonEvidenceSourceSchema = z.object({
  kind: leadEvidenceKindSchema,
  source_url: z.string().url(),
  source_label: z.string().default(""),
  title: z.string(),
  confidence: dataConfidenceSchema.default("medium"),
});

export const revonFieldConfidenceSchema = z.object({
  field: z.string(),
  status: leadFieldAssessmentStatusSchema,
  confidence: dataConfidenceSchema.default("medium"),
  source_urls: z.array(z.string().url()).default([]),
  notes: z.array(z.string()).default([]),
});

export const revonLeadRawPayloadSchema = z.object({
  agent_session_id: z.string(),
  correlation_id: z.string().nullable().default(null),
  tinyfish_run_ids: z.array(z.string()).default([]),
  capture_mode: leadCaptureModeSchema,
  inspection_status: leadInspectionStatusSchema,
  qualification_state: leadQualificationStateSchema,
  qualification_reasons: z.array(z.string()).default([]),
  evidence_sources: z.array(revonEvidenceSourceSchema).default([]),
  field_confidence: z.array(revonFieldConfidenceSchema).default([]),
  uncertainty: z.object({
    missing_fields: z.array(z.string()).default([]),
    uncertain_fields: z.array(z.string()).default([]),
    quality_notes: z.array(z.string()).default([]),
  }),
  raw_extraction: leadRawExtractionSchema,
  score: leadScoreSchema,
  summary: z.string().default(""),
  services: z.array(z.string()).default([]),
  is_decision_maker: z.boolean().optional(),
});

export const revonWebhookLeadSchema = z.object({
  email: z.string().email().optional(),
  full_name: z.string().optional(),
  job_title: z.string().optional(),
  company: z.string().optional(),
  company_domain: z.string().optional(),
  website: z.string().url().optional(),
  source_ref: z.string().optional(),
  agent_session_id: z.string().optional(),
  tinyfish_run_ids: z.array(z.string()).optional(),
  capture_mode: leadCaptureModeSchema.optional(),
  inspection_status: leadInspectionStatusSchema.optional(),
  qualification_state: leadQualificationStateSchema.optional(),
  raw_payload: revonLeadRawPayloadSchema.optional(),
});

export const revonImportPayloadSchema = z.object({
  source: z.literal("tinyfish-demo"),
  runId: z.string(),
  sentAt: z.string(),
  leads: z.array(revonWebhookLeadSchema),
});

export const revonPushResultSchema = z.object({
  mode: z.enum(["dry-run", "live"]),
  dryRun: z.boolean(),
  destination: z.string(),
  pushedCompanyCount: z.number().int().nonnegative(),
  pushedContactCount: z.number().int().nonnegative(),
  requestId: z.string().optional(),
  message: z.string().optional(),
});

export const revonAdapterStatusSchema = z.object({
  configured: z.boolean(),
  dryRun: z.boolean(),
  destination: z.string(),
});

export type RevonEvidenceSource = z.infer<typeof revonEvidenceSourceSchema>;
export type RevonFieldConfidence = z.infer<typeof revonFieldConfidenceSchema>;
export type RevonLeadRawPayload = z.infer<typeof revonLeadRawPayloadSchema>;
export type RevonWebhookLead = z.infer<typeof revonWebhookLeadSchema>;
export type RevonImportPayload = z.infer<typeof revonImportPayloadSchema>;
export type RevonPushResult = z.infer<typeof revonPushResultSchema>;
export type RevonAdapterStatus = z.infer<typeof revonAdapterStatusSchema>;
