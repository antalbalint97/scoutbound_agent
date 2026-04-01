import {
  zohoAdapterStatusSchema,
  zohoConnectionTestResultSchema,
  zohoPushResultSchema,
  type LeadRecord,
  type ZohoConnectionTestResult,
  type ZohoAdapterStatus,
  type ZohoPushResult,
} from "@revon-tinyfish/contracts";
import { getZohoAccessToken, invalidateZohoTokenCache } from "./auth.js";
import { mapLeadToZohoRecords } from "./mapper.js";

const BATCH_SIZE = 100;

function isConfigured(): boolean {
  return Boolean(
    process.env.ZOHO_CLIENT_ID?.trim() &&
    process.env.ZOHO_CLIENT_SECRET?.trim() &&
    process.env.ZOHO_REFRESH_TOKEN?.trim(),
  );
}

function getDryRun(): boolean {
  return (process.env.ZOHO_DRY_RUN ?? "true").toLowerCase() !== "false";
}

function getApiBaseUrl(): string {
  return (process.env.ZOHO_API_BASE_URL ?? "https://www.zohoapis.eu/crm/v6").replace(/\/$/, "");
}

function getModule(): string {
  return process.env.ZOHO_MODULE?.trim() || "Leads";
}

export function getZohoAdapterStatus(): ZohoAdapterStatus {
  return zohoAdapterStatusSchema.parse({
    configured: isConfigured(),
    dryRun: getDryRun(),
    destination: getApiBaseUrl(),
    module: getModule(),
  });
}

export async function testZohoConnection(): Promise<ZohoConnectionTestResult> {
  const configured = isConfigured();
  const dryRun = getDryRun();
  const destination = getApiBaseUrl();
  const module = getModule();

  if (!configured) {
    return zohoConnectionTestResultSchema.parse({
      configured: false,
      dryRun,
      destination,
      module,
      success: false,
      message:
        "Zoho OAuth credentials are not configured (ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN).",
    });
  }

  if (dryRun) {
    return zohoConnectionTestResultSchema.parse({
      configured: true,
      dryRun: true,
      destination,
      module,
      success: true,
      message:
        "Zoho credentials are configured. Dry-run mode is enabled, so live CRM writes are still disabled.",
    });
  }

  const accessToken = await getZohoAccessToken();
  const response = await fetch(`${destination}/settings/modules`, {
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
    },
  });

  if (response.status === 401) {
    invalidateZohoTokenCache();
    throw new Error("Zoho API returned 401 Unauthorized while testing the connection.");
  }

  if (!response.ok) {
    throw new Error(`Zoho connection test failed with HTTP ${response.status} ${response.statusText}.`);
  }

  return zohoConnectionTestResultSchema.parse({
    configured: true,
    dryRun: false,
    destination,
    module,
    success: true,
    message: "Zoho CRM connection verified successfully.",
  });
}

async function pushBatch(
  records: Record<string, unknown>[],
  accessToken: string,
): Promise<{ pushedCount: number; failedCount: number }> {
  const url = `${getApiBaseUrl()}/${getModule()}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ data: records }),
  });

  if (response.status === 401) {
    invalidateZohoTokenCache();
    throw new Error("Zoho API returned 401 Unauthorized. Token may have been revoked.");
  }

  if (!response.ok) {
    throw new Error(`Zoho CRM API returned HTTP ${response.status} ${response.statusText}.`);
  }

  const body = (await response.json()) as {
    data?: Array<{ code: string; status: string }>;
  };

  let pushedCount = 0;
  let failedCount = 0;

  for (const item of body.data ?? []) {
    if (item.status === "success") {
      pushedCount++;
    } else {
      failedCount++;
      console.warn(`[zoho] Record push failed: code=${item.code} status=${item.status}`);
    }
  }

  return { pushedCount, failedCount };
}

export async function pushQualifiedLeadsToZoho(leads: LeadRecord[]): Promise<ZohoPushResult> {
  const dryRun = getDryRun();
  const destination = getApiBaseUrl();
  const module = getModule();
  const allRecords = leads.flatMap((lead) => mapLeadToZohoRecords(lead));

  console.log(
    `[zoho] push -> mode=${!isConfigured() || dryRun ? "dry-run" : "live"} leads=${leads.length} records=${allRecords.length} module=${module}`,
  );

  if (!isConfigured() || dryRun) {
    return zohoPushResultSchema.parse({
      mode: "dry-run",
      dryRun: true,
      destination,
      module,
      pushedCount: allRecords.length,
      failedCount: 0,
      message: isConfigured()
        ? "Dry run enabled. No data was sent to Zoho CRM."
        : "Zoho credentials are not configured. Returning a dry-run result.",
    });
  }

  const accessToken = await getZohoAccessToken();

  let totalPushed = 0;
  let totalFailed = 0;

  for (let i = 0; i < allRecords.length; i += BATCH_SIZE) {
    const batch = allRecords.slice(i, i + BATCH_SIZE);
    const { pushedCount, failedCount } = await pushBatch(batch as Record<string, unknown>[], accessToken);
    totalPushed += pushedCount;
    totalFailed += failedCount;
  }

  return zohoPushResultSchema.parse({
    mode: "live",
    dryRun: false,
    destination,
    module,
    pushedCount: totalPushed,
    failedCount: totalFailed,
    message: `${totalPushed} record${totalPushed !== 1 ? "s" : ""} pushed to Zoho CRM ${module}.${totalFailed > 0 ? ` ${totalFailed} failed.` : ""}`,
  });
}
