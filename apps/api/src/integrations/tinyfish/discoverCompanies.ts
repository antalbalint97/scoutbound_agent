import type { IcpInput } from "@revon-tinyfish/contracts";
import { runTinyFishAutomation } from "./client.js";
import { parseDirectoryCandidates } from "./parseResults.js";
import { buildDirectoryGoal, buildDirectoryUrl } from "./prompts.js";

export interface DirectoryDiscoveryResult {
  directoryUrl: string;
  candidates: Array<ReturnType<typeof parseDirectoryCandidates>["candidates"][number]>;
  warnings: string[];
}

export async function discoverCompanies(apiKey: string, input: IcpInput): Promise<DirectoryDiscoveryResult> {
  const directoryUrl = buildDirectoryUrl(input);
  console.log(`[tinyfish-demo] directory discovery -> ${directoryUrl}`);
  const raw = await runTinyFishAutomation({
    apiKey,
    url: directoryUrl,
    goal: buildDirectoryGoal(input),
    timeoutMs: 90_000,
  });
  const parsed = parseDirectoryCandidates(raw);

  return {
    directoryUrl,
    candidates: parsed.candidates,
    warnings: parsed.warnings,
  };
}
