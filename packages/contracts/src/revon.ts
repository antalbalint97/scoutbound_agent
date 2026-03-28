import { z } from "zod";

export const revonWebhookLeadSchema = z.object({
  email: z.string().email().optional(),
  full_name: z.string().optional(),
  job_title: z.string().optional(),
  company: z.string().optional(),
  company_domain: z.string().optional(),
  website: z.string().url().optional(),
  source_ref: z.string().optional(),
  raw_payload: z.record(z.string(), z.unknown()).optional(),
});

export const revonImportPayloadSchema = z.object({
  source: z.literal("tinyfish-demo"),
  runId: z.string(),
  sentAt: z.string(),
  leads: z.array(revonWebhookLeadSchema),
});

export const revonPushResultSchema = z.object({
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

export type RevonWebhookLead = z.infer<typeof revonWebhookLeadSchema>;
export type RevonImportPayload = z.infer<typeof revonImportPayloadSchema>;
export type RevonPushResult = z.infer<typeof revonPushResultSchema>;
export type RevonAdapterStatus = z.infer<typeof revonAdapterStatusSchema>;
