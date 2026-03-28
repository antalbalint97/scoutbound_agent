import type { IcpInput } from "@revon-tinyfish/contracts";
import { runTinyFishAutomation } from "./client.js";
import { parseDirectoryCandidates } from "./parseResults.js";
import { buildDirectoryGoal, buildDirectoryUrl } from "./prompts.js";

export interface DirectoryDiscoveryResult {
  directoryUrl: string;
  candidates: ReturnType<typeof parseDirectoryCandidates>;
}

export async function discoverCompanies(apiKey: string, input: IcpInput): Promise<DirectoryDiscoveryResult> {
  const directoryUrl = buildDirectoryUrl(input);
  const raw = await runTinyFishAutomation({
    apiKey,
    url: directoryUrl,
    goal: buildDirectoryGoal(input),
    timeoutMs: 90_000,
  });

  return {
    directoryUrl,
    candidates: parseDirectoryCandidates(raw),
  };
}
