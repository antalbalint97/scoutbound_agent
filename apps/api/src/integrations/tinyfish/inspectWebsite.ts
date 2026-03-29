import type { IcpInput } from "@revon-tinyfish/contracts";
import type { DirectoryCandidate, WebsiteInspection } from "../../domain/leads/schemas.js";
import { createEmptyWebsiteInspection } from "../../domain/leads/schemas.js";
import type { DiscoveryTraceContext } from "../../lib/debugTrace.js";
import { logApiTrace } from "../../lib/debugTrace.js";
import { runTinyFishAutomation } from "./client.js";
import { parseWebsiteInspection } from "./parseResults.js";
import { buildWebsiteGoal } from "./prompts.js";

export interface WebsiteInspectionTask {
  websiteUrl: string;
  goal: string;
}

export function createWebsiteInspectionTask(
  input: IcpInput,
  candidate: DirectoryCandidate,
): WebsiteInspectionTask {
  return {
    websiteUrl: candidate.websiteUrl,
    goal: buildWebsiteGoal(input),
  };
}

export function parseWebsiteInspectionResult(
  candidate: DirectoryCandidate,
  raw: unknown,
): WebsiteInspection {
  return parseWebsiteInspection(raw, candidate.websiteUrl);
}

export async function inspectWebsite(
  apiKey: string,
  input: IcpInput,
  candidate: DirectoryCandidate,
  trace?: DiscoveryTraceContext,
): Promise<WebsiteInspection> {
  try {
    const task = createWebsiteInspectionTask(input, candidate);
    logApiTrace("inspectWebsite.start", {
      correlationId: trace?.correlationId,
      runId: trace?.runId,
      invocationKey: `${trace?.runId ?? trace?.correlationId ?? "no-trace"}|${candidate.websiteUrl}`,
      details: {
        websiteUrl: candidate.websiteUrl,
        companyName: candidate.companyName,
      },
    });
    console.log(`[tinyfish-demo] website inspection -> ${candidate.websiteUrl}`);
    const raw = await runTinyFishAutomation({
      apiKey,
      url: task.websiteUrl,
      goal: task.goal,
      trace,
    });

    return parseWebsiteInspectionResult(candidate, raw);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "TinyFish website inspection failed unexpectedly.";
    console.warn(`[tinyfish-demo] website inspection failed -> ${candidate.websiteUrl} :: ${message}`);
    return createEmptyWebsiteInspection(candidate.websiteUrl, {
      inspectionStatus: "failed",
      qualityNotes: [message],
      missingFields: ["summary", "services", "emails", "team"],
    });
  }
}
