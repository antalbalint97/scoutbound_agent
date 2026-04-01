import { z } from "zod";

export const zohoAdapterStatusSchema = z.object({
  configured: z.boolean(),
  dryRun: z.boolean(),
  destination: z.string(),
  module: z.string(),
});

export const zohoPushResultSchema = z.object({
  mode: z.enum(["dry-run", "live"]),
  dryRun: z.boolean(),
  destination: z.string(),
  module: z.string(),
  pushedCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
  message: z.string().optional(),
});

export const zohoConnectionTestResultSchema = z.object({
  configured: z.boolean(),
  dryRun: z.boolean(),
  destination: z.string(),
  module: z.string(),
  success: z.boolean(),
  message: z.string(),
});

export type ZohoAdapterStatus = z.infer<typeof zohoAdapterStatusSchema>;
export type ZohoPushResult = z.infer<typeof zohoPushResultSchema>;
export type ZohoConnectionTestResult = z.infer<typeof zohoConnectionTestResultSchema>;
