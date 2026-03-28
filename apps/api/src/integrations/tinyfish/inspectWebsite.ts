import type { IcpInput } from "@revon-tinyfish/contracts";
import type { DirectoryCandidate, WebsiteInspection } from "../../domain/leads/schemas.js";
import { createEmptyWebsiteInspection } from "../../domain/leads/schemas.js";
import { runTinyFishAutomation } from "./client.js";
import { parseWebsiteInspection } from "./parseResults.js";
import { buildWebsiteGoal } from "./prompts.js";

export async function inspectWebsite(
  apiKey: string,
  input: IcpInput,
  candidate: DirectoryCandidate,
): Promise<WebsiteInspection> {
  try {
    console.log(`[tinyfish-demo] website inspection -> ${candidate.websiteUrl}`);
    const raw = await runTinyFishAutomation({
      apiKey,
      url: candidate.websiteUrl,
      goal: buildWebsiteGoal(input),
      timeoutMs: 60_000,
    });

    return parseWebsiteInspection(raw, candidate.websiteUrl);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "TinyFish website inspection failed unexpectedly.";
    console.warn(`[tinyfish-demo] website inspection failed -> ${candidate.websiteUrl} :: ${message}`);
    return createEmptyWebsiteInspection(candidate.websiteUrl, {
      inspectionStatus: "failed",
      qualityNotes: [message],
      missingFields: ["summary", "emails", "team", "signals"],
    });
  }
}
