import { afterEach, describe, expect, it, vi } from "vitest";
import { DEMO_PRESETS } from "../../apps/web/src/demoPresets";
import { createMockDirectoryDiscovery, createMockWebsiteInspection } from "../../apps/api/src/mocks/sampleLeads";
import { processLeadCandidates } from "../../apps/api/src/domain/leads/processing";
import { pushQualifiedLeadsToRevon } from "../../apps/api/src/integrations/revon/client";
import { applyEnv } from "./utils/orchestrationHarness";

const input = DEMO_PRESETS[0]?.input ?? {
  targetMarket: "Digital marketing",
  location: "London",
  companySize: "11-50",
  keywords: "B2B, SaaS, growth",
  decisionMakerRole: "Founder",
  maxResults: 1,
};

function buildLead() {
  const candidate = createMockDirectoryDiscovery({ ...input, maxResults: 1 }).candidates[0]!;
  const inspection = createMockWebsiteInspection(candidate, input, 0);
  return processLeadCandidates(
    input,
    [{ candidate, inspection }],
    {
      captureMode: "mock",
      sessionContext: {
        agentSessionId: "agent-session-123",
        correlationId: "corr-123",
        directoryUrl: candidate.directoryUrl,
        directoryRunId: "dir-run-123",
        runStartedAt: "2026-03-29T00:00:00.000Z",
      },
    },
  )[0]!;
}

describe("revon adapter smoke", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("stays in explicit dry-run mode when no Revon endpoint is configured", async () => {
    const restoreEnv = applyEnv({
      REVON_IMPORT_URL: undefined,
      REVON_DRY_RUN: "true",
      REVON_API_TOKEN: undefined,
    });

    try {
      const result = await pushQualifiedLeadsToRevon("run-dry", [buildLead()]);
      expect(result.mode).toBe("dry-run");
      expect(result.dryRun).toBe(true);
      expect(result.pushedCompanyCount).toBe(1);
    } finally {
      restoreEnv();
    }
  });

  it("posts live payloads when Revon live mode is configured", async () => {
    const restoreEnv = applyEnv({
      REVON_IMPORT_URL: "https://revon.example/import",
      REVON_DRY_RUN: "false",
      REVON_API_TOKEN: "secret",
      REVON_IMPORT_MODE: "webhook",
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: "Import accepted" }),
      headers: new Headers({ "x-request-id": "req-123" }),
      status: 200,
      statusText: "OK",
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      const result = await pushQualifiedLeadsToRevon("run-live", [buildLead()]);
      expect(result.mode).toBe("live");
      expect(result.dryRun).toBe(false);
      expect(result.requestId).toBe("req-123");
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(String(fetchMock.mock.calls[0]?.[0])).toBe("https://revon.example/import");
      const request = fetchMock.mock.calls[0]?.[1];
      const payload = JSON.parse(String(request?.body)) as {
        leads: Array<{ agent_session_id?: string; raw_payload?: { tinyfish_run_ids?: string[] } }>;
      };
      expect(payload.leads[0]?.agent_session_id).toBe("agent-session-123");
      expect(payload.leads[0]?.raw_payload?.tinyfish_run_ids).toContain("dir-run-123");
    } finally {
      restoreEnv();
      vi.unstubAllGlobals();
    }
  });
});
