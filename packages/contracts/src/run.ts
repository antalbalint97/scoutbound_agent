import { z } from "zod";
import { icpInputSchema, leadRecordSchema } from "./lead.js";

export const runStatusSchema = z.enum(["running", "completed", "partial", "failed"]);
export const runModeSchema = z.enum(["live", "mock"]);
export const runQualitySchema = z.enum(["healthy", "degraded"]);

export const runStepKeySchema = z.enum([
  "discovering_companies",
  "visiting_websites",
  "extracting_contacts",
  "ranking_leads",
  "ready_for_revon",
]);

export const runStepStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "partial",
  "failed",
  "skipped",
]);

export const runStepSchema = z.object({
  key: runStepKeySchema,
  label: z.string(),
  status: runStepStatusSchema,
  detail: z.string().optional(),
});

export const runSummarySchema = z.object({
  directoryUrl: z.string().url().nullable().default(null),
  companiesFound: z.number().int().nonnegative().default(0),
  websitesVisited: z.number().int().nonnegative().default(0),
  websiteFailures: z.number().int().nonnegative().default(0),
  partialLeadCount: z.number().int().nonnegative().default(0),
  decisionMakersFound: z.number().int().nonnegative().default(0),
  qualifiedLeadCount: z.number().int().nonnegative().default(0),
});

export const runPushStateSchema = z.object({
  status: z.enum(["idle", "running", "completed", "error"]).default("idle"),
  dryRun: z.boolean().default(true),
  pushedCompanyCount: z.number().int().nonnegative().default(0),
  pushedContactCount: z.number().int().nonnegative().default(0),
  destination: z.string().default("not-configured"),
  requestId: z.string().nullable().default(null),
  message: z.string().nullable().default(null),
  error: z.string().nullable().default(null),
  pushedAt: z.string().nullable().default(null),
});

export const demoRunSchema = z.object({
  id: z.string(),
  status: runStatusSchema,
  mode: runModeSchema,
  quality: runQualitySchema,
  startedAt: z.string(),
  completedAt: z.string().optional(),
  input: icpInputSchema,
  steps: z.array(runStepSchema),
  summary: runSummarySchema,
  leads: z.array(leadRecordSchema).default([]),
  push: runPushStateSchema,
  notes: z.array(z.string()).default([]),
  modeReason: z.string().optional(),
  error: z.string().optional(),
});

export const startRunResponseSchema = z.object({
  runId: z.string(),
});

export const pushRunRequestSchema = z.object({
  leadIds: z.array(z.string()).max(20).optional(),
});

export type RunStatus = z.infer<typeof runStatusSchema>;
export type RunMode = z.infer<typeof runModeSchema>;
export type RunQuality = z.infer<typeof runQualitySchema>;
export type RunStepKey = z.infer<typeof runStepKeySchema>;
export type RunStepStatus = z.infer<typeof runStepStatusSchema>;
export type RunStep = z.infer<typeof runStepSchema>;
export type RunSummary = z.infer<typeof runSummarySchema>;
export type RunPushState = z.infer<typeof runPushStateSchema>;
export type DemoRun = z.infer<typeof demoRunSchema>;
export type StartRunResponse = z.infer<typeof startRunResponseSchema>;
export type PushRunRequest = z.infer<typeof pushRunRequestSchema>;
