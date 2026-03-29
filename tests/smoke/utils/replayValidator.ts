import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { leadRecordSchema, type IcpInput, type LeadRecord } from "@revon-tinyfish/contracts";
import { processLeadCandidates } from "../../../apps/api/src/domain/leads/processing";
import { parseDirectoryCandidates, parseWebsiteInspection } from "../../../apps/api/src/integrations/tinyfish/parseResults";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const generatedDir = path.resolve(__dirname, "../fixtures/generated");

export interface ReplayFixture {
  id: string;
  presetId: string;
  input: IcpInput;
  mode: "live" | "mock";
  directoryRaw: unknown;
  websiteRaws: unknown[];
  expectations: {
    expectedLeadCount: number;
    minimumQualifiedLeads: number;
    expectedPartialLeadCount: number;
  };
}

export interface ReplayValidationResult {
  leads: LeadRecord[];
  warnings: string[];
  partialLeadCount: number;
  qualifiedLeadCount: number;
}

export async function loadGeneratedFixture<T>(filename: string): Promise<T> {
  const raw = await readFile(path.join(generatedDir, filename), "utf8");
  return JSON.parse(raw) as T;
}

export function replaySampleRunFixture(fixture: ReplayFixture): ReplayValidationResult {
  const directoryResult = parseDirectoryCandidates(fixture.directoryRaw);
  const candidates = directoryResult.candidates.slice(0, fixture.websiteRaws.length);

  const leads = processLeadCandidates(
    fixture.input,
    candidates.map((candidate, index) => ({
      candidate,
      inspection: parseWebsiteInspection(fixture.websiteRaws[index], candidate.websiteUrl),
    })),
    {
      captureMode: fixture.mode,
    },
  ).map((lead) => leadRecordSchema.parse(lead));

  return {
    leads,
    warnings: directoryResult.warnings,
    partialLeadCount: leads.filter((lead) => lead.inspectionStatus !== "completed").length,
    qualifiedLeadCount: leads.filter((lead) => lead.score.qualificationState === "qualified").length,
  };
}
