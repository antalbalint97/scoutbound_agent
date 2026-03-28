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
    const raw = await runTinyFishAutomation({
      apiKey,
      url: candidate.websiteUrl,
      goal: buildWebsiteGoal(input),
      timeoutMs: 60_000,
    });

    return parseWebsiteInspection(raw, candidate.websiteUrl);
  } catch {
    return createEmptyWebsiteInspection(candidate.websiteUrl);
  }
}
