import { z } from "zod";
import { leadRecordSchema } from "./lead.js";
import { demoRunSchema } from "./run.js";
import { sessionTelemetrySchema } from "./telemetry.js";

export const persistedLeadPushStatusSchema = z.enum([
  "not_attempted",
  "dry_run",
  "pending",
  "succeeded",
  "failed",
]);

export const persistedSessionLifecycleStatusSchema = z.enum([
  "created",
  "running",
  "completed",
  "failed",
  "pushed_partial",
  "pushed_complete",
]);

export const persistedLeadRevonStateSchema = z.object({
  importedToRevon: z.boolean().default(false),
  pushStatus: persistedLeadPushStatusSchema.default("not_attempted"),
  lastAttemptedAt: z.string().nullable().default(null),
  lastSucceededAt: z.string().nullable().default(null),
  requestId: z.string().nullable().default(null),
  error: z.string().nullable().default(null),
});

export const persistedLeadRecordSchema = leadRecordSchema.extend({
  revon: persistedLeadRevonStateSchema,
  revonStatusLabel: z.string().default("Not attempted"),
});

export const persistedSessionSummarySchema = z.object({
  id: z.string(),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
  status: demoRunSchema.shape.status,
  lifecycleStatus: persistedSessionLifecycleStatusSchema,
  mode: demoRunSchema.shape.mode,
  quality: demoRunSchema.shape.quality,
  experimentLabel: z.string(),
  directoryUrl: z.string().nullable(),
  leadCount: z.number().int().nonnegative(),
  qualifiedLeadCount: z.number().int().nonnegative(),
  usableLeadCount: z.number().int().nonnegative(),
  publicEmailCount: z.number().int().nonnegative(),
  decisionMakerCount: z.number().int().nonnegative(),
  importStatus: demoRunSchema.shape.push.shape.status,
  importDryRun: z.boolean(),
  importDestination: z.string().nullable(),
  importRequestId: z.string().nullable(),
  importMessage: z.string().nullable(),
  importError: z.string().nullable(),
  importPushedAt: z.string().nullable(),
});

export const persistedSessionDetailSchema = persistedSessionSummarySchema.extend({
  correlationId: z.string().nullable(),
  modeReason: z.string().nullable(),
  error: z.string().nullable(),
  input: demoRunSchema.shape.input,
  steps: demoRunSchema.shape.steps,
  summary: demoRunSchema.shape.summary,
  notes: demoRunSchema.shape.notes,
  telemetry: sessionTelemetrySchema.nullable(),
  leads: z.array(persistedLeadRecordSchema),
});

export const persistedSessionListResponseSchema = z.object({
  items: z.array(persistedSessionSummarySchema),
  nextCursor: z.string().nullable(),
  sessions: z.array(persistedSessionSummarySchema),
});

export const persistedSessionPushResponseSchema = z.object({
  summary: z.object({
    attempted: z.number().int().nonnegative(),
    succeeded: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    dryRun: z.boolean(),
    destination: z.string(),
    requestId: z.string().nullable(),
    message: z.string().nullable(),
  }),
  session: persistedSessionDetailSchema.nullable(),
});

export const persistedSessionExportLeadSchema = persistedLeadRecordSchema.extend({
  rank: z.number().int().nonnegative(),
});

export const persistedSessionJsonExportSchema = z.object({
  exportType: z.literal("tinyfish-session-json"),
  export_version: z.literal("v1"),
  export_schema: z.literal("revon.discovery.session.export.v1"),
  exportedAt: z.string(),
  session: persistedSessionDetailSchema.omit({ leads: true }).extend({
    selectedLeadCount: z.number().int().nonnegative(),
  }),
  leads: z.array(persistedSessionExportLeadSchema),
});

export const persistedSessionCsvRowSchema = z.object({
  session_id: z.string(),
  experiment_label: z.string(),
  session_status: demoRunSchema.shape.status,
  session_mode: demoRunSchema.shape.mode,
  session_quality: demoRunSchema.shape.quality,
  session_started_at: z.string(),
  session_completed_at: z.string(),
  lead_rank: z.string(),
  lead_id: z.string(),
  company_name: z.string(),
  company_domain: z.string(),
  website_url: z.string(),
  directory_url: z.string(),
  location: z.string(),
  company_size: z.string(),
  industry: z.string(),
  qualification_state: z.string(),
  priority: z.string(),
  confidence: z.string(),
  inspection_status: z.string(),
  total_score: z.string(),
  fit_score: z.string(),
  contactability_score: z.string(),
  quality_score: z.string(),
  decision_maker_score: z.string(),
  ranking_reasons_joined: z.string(),
  quality_notes: z.string(),
  services: z.string(),
  evidence_count: z.string(),
  top_evidence_title: z.string(),
  top_evidence_url: z.string(),
  top_evidence_summary: z.string(),
  contact_name: z.string(),
  contact_role: z.string(),
  contact_email: z.string(),
  contact_linkedin_url: z.string(),
  contact_is_decision_maker: z.string(),
  revon_imported_to_revon: z.string(),
  revon_push_status: z.string(),
  revon_last_attempted_at: z.string(),
});

export const persistedSessionCsvColumns = persistedSessionCsvRowSchema.keyof().options;

export type PersistedSessionSummary = z.infer<typeof persistedSessionSummarySchema>;
export type PersistedLeadPushStatus = z.infer<typeof persistedLeadPushStatusSchema>;
export type PersistedSessionLifecycleStatus = z.infer<typeof persistedSessionLifecycleStatusSchema>;
export type PersistedLeadRevonState = z.infer<typeof persistedLeadRevonStateSchema>;
export type PersistedLeadRecord = z.infer<typeof persistedLeadRecordSchema>;
export type PersistedSessionDetail = z.infer<typeof persistedSessionDetailSchema>;
export type PersistedSessionListResponse = z.infer<typeof persistedSessionListResponseSchema>;
export type PersistedSessionPushResponse = z.infer<typeof persistedSessionPushResponseSchema>;
export type PersistedSessionExportLead = z.infer<typeof persistedSessionExportLeadSchema>;
export type PersistedSessionJsonExport = z.infer<typeof persistedSessionJsonExportSchema>;
export type PersistedSessionCsvRow = z.infer<typeof persistedSessionCsvRowSchema>;
