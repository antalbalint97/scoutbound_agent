import type { IcpInput } from "@revon-tinyfish/contracts";
import type { DiscoveryTraceContext } from "../../lib/debugTrace.js";
import { logApiTrace } from "../../lib/debugTrace.js";
import { runTinyFishAutomation } from "./client.js";
import { parseDirectoryCandidates } from "./parseResults.js";
import { buildDirectoryGoal, buildDirectoryUrl } from "./prompts.js";

export interface DirectoryDiscoveryTask {
  directoryUrl: string;
  goal: string;
}

export interface DirectoryDiscoveryResult {
  directoryUrl: string;
  candidates: Array<ReturnType<typeof parseDirectoryCandidates>["candidates"][number]>;
  warnings: string[];
}

export function createDirectoryDiscoveryTask(input: IcpInput): DirectoryDiscoveryTask {
  return {
    directoryUrl: buildDirectoryUrl(input),
    goal: buildDirectoryGoal(input),
  };
}

export function parseDirectoryDiscoveryResult(directoryUrl: string, raw: unknown): DirectoryDiscoveryResult {
  const parsed = parseDirectoryCandidates(raw);

  return {
    directoryUrl,
    candidates: parsed.candidates,
    warnings: parsed.warnings,
  };
}

export async function discoverCompanies(
  apiKey: string,
  input: IcpInput,
  trace?: DiscoveryTraceContext,
): Promise<DirectoryDiscoveryResult> {
  const task = createDirectoryDiscoveryTask(input);
  logApiTrace("discoverCompanies.start", {
    correlationId: trace?.correlationId,
    runId: trace?.runId,
    invocationKey: `${trace?.runId ?? trace?.correlationId ?? "no-trace"}|${task.directoryUrl}`,
    details: {
      directoryUrl: task.directoryUrl,
      payloadSignature: trace?.payloadSignature,
    },
  });
  console.log(`[tinyfish-demo] directory discovery -> ${task.directoryUrl}`);
  const raw = await runTinyFishAutomation({
    apiKey,
    url: task.directoryUrl,
    goal: task.goal,
    trace,
  });

  return parseDirectoryDiscoveryResult(task.directoryUrl, raw);
}
