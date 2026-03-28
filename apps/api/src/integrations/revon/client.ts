import {
  revonAdapterStatusSchema,
  revonImportPayloadSchema,
  revonPushResultSchema,
  type LeadRecord,
  type RevonAdapterStatus,
  type RevonPushResult,
} from "@revon-tinyfish/contracts";
import { mapLeadToRevonRecords } from "./mapper.js";

function getDryRun(): boolean {
  return (process.env.REVON_DRY_RUN ?? "true").toLowerCase() !== "false";
}

function getDestination(): string {
  return process.env.REVON_IMPORT_URL?.trim() || "not-configured";
}

export function getRevonAdapterStatus(): RevonAdapterStatus {
  return revonAdapterStatusSchema.parse({
    configured: Boolean(process.env.REVON_IMPORT_URL?.trim()),
    dryRun: getDryRun(),
    destination: getDestination(),
  });
}

export async function pushQualifiedLeadsToRevon(
  runId: string,
  leads: LeadRecord[],
): Promise<RevonPushResult> {
  const destination = getDestination();
  const dryRun = getDryRun();
  const records = leads.flatMap((lead) => mapLeadToRevonRecords(lead));

  if (!process.env.REVON_IMPORT_URL?.trim() || dryRun) {
    return revonPushResultSchema.parse({
      dryRun: true,
      destination,
      pushedCompanyCount: leads.length,
      pushedContactCount: records.length,
      message: process.env.REVON_IMPORT_URL?.trim()
        ? "Dry run enabled. No data was sent to Revon."
        : "REVON_IMPORT_URL is not configured. Returning a dry-run result.",
    });
  }

  const payload = revonImportPayloadSchema.parse({
    source: "tinyfish-demo",
    runId,
    sentAt: new Date().toISOString(),
    leads: records,
  });

  const response = await fetch(process.env.REVON_IMPORT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.REVON_API_TOKEN
        ? { Authorization: `Bearer ${process.env.REVON_API_TOKEN}` }
        : {}),
      ...(process.env.REVON_IMPORT_MODE
        ? { "X-Revon-Import-Mode": process.env.REVON_IMPORT_MODE }
        : {}),
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Revon import failed with HTTP ${response.status} ${response.statusText}.`);
  }

  let message = "Lead payload sent to Revon.";
  try {
    const data = (await response.json()) as { message?: string };
    if (data.message) {
      message = data.message;
    }
  } catch {
    // Accept non-JSON success responses.
  }

  return revonPushResultSchema.parse({
    dryRun: false,
    destination,
    pushedCompanyCount: leads.length,
    pushedContactCount: records.length,
    requestId:
      response.headers.get("x-request-id") ??
      response.headers.get("x-vektr-import-id") ??
      undefined,
    message,
  });
}
