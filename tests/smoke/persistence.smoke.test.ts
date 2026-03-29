import { beforeEach, describe, expect, it } from "vitest";
import { DEMO_PRESETS } from "../../apps/web/src/demoPresets";
import { startDiscoveryRun } from "../../apps/api/src/orchestrators/discoveryRun";
import {
  buildPersistedSessionCsvExport,
  buildPersistedSessionJsonExport,
  buildPersistedRevonExport,
  getPersistedSession,
  listPersistedSessions,
  updatePersistedLeadRevonStates,
} from "../../apps/api/src/services/persistenceService";
import { applyEnv, resetSmokeRunStore, waitForRunCompletion } from "./utils/orchestrationHarness";

const input = DEMO_PRESETS[0]?.input ?? {
  targetMarket: "Digital marketing",
  location: "London",
  companySize: "11-50",
  keywords: "B2B, SaaS, growth",
  decisionMakerRole: "Founder",
  maxResults: 2,
};

describe("persistence smoke", () => {
  beforeEach(() => {
    resetSmokeRunStore();
  });

  it("persists completed discovery sessions with leads, contacts, and exportable payloads", async () => {
    const restoreEnv = applyEnv({
      TINYFISH_API_KEY: undefined,
      TINYFISH_FORCE_MOCK: "false",
      TINYFISH_ENABLE_MOCK_FALLBACK: "true",
    });

    try {
      const run = startDiscoveryRun(input, undefined, {
        correlationId: "corr-persistence",
        payloadSignature: "persistence-smoke",
        experimentLabel: "persistence_smoke_variant",
      });

      const completed = await waitForRunCompletion(run.id);
      const persisted = await getPersistedSession(completed.id);
      const sessions = await listPersistedSessions();
      const jsonExport = await buildPersistedSessionJsonExport(completed.id);
      const csvExport = await buildPersistedSessionCsvExport(completed.id);
      const exportPayload = await buildPersistedRevonExport(completed.id);
      const leadForDryRun = persisted?.leads[0] ?? null;

      expect(persisted).not.toBeNull();
      expect(persisted?.id).toBe(completed.id);
      expect(persisted?.status).toBe(completed.status);
      expect(persisted?.lifecycleStatus).toBe("completed");
      expect(persisted?.experimentLabel).toBe("persistence_smoke_variant");
      expect(persisted?.leads.length).toBe(completed.leads.length);
      expect(persisted?.leads[0]?.contacts.length ?? 0).toBeGreaterThan(0);
      expect(persisted?.leads[0]?.revon.pushStatus).toBe("not_attempted");
      expect(sessions.items[0]?.id).toBe(completed.id);
      expect(jsonExport?.exportType).toBe("tinyfish-session-json");
      expect(jsonExport?.export_version).toBe("v1");
      expect(jsonExport?.export_schema).toBe("revon.discovery.session.export.v1");
      expect(jsonExport?.session.id).toBe(completed.id);
      expect(jsonExport?.leads[0]?.score.totalScore).toBeDefined();
      expect(jsonExport?.leads[0]?.revon.pushStatus).toBe("not_attempted");
      expect(csvExport?.content).toContain("session_id,experiment_label,session_status");
      expect(csvExport?.content).toContain(completed.id);
      expect(csvExport?.content.charCodeAt(0)).toBe(0xfeff);
      expect(csvExport?.content).toContain(
        "revon_imported_to_revon,revon_push_status,revon_last_attempted_at",
      );
      expect(csvExport?.content).toContain("ranking_reasons_joined");
      expect(csvExport?.content).toContain("evidence_count");
      expect(exportPayload?.runId).toBe(completed.id);
      expect(exportPayload?.leads.length ?? 0).toBeGreaterThan(0);

      if (leadForDryRun) {
        await updatePersistedLeadRevonStates(completed.id, [
          {
            leadId: leadForDryRun.id,
            state: {
              importedToRevon: false,
              pushStatus: "dry_run",
              lastAttemptedAt: "2026-03-29T10:00:00.000Z",
              lastSucceededAt: null,
              requestId: "req-dry-smoke",
              error: null,
            },
          },
        ]);

        const refreshed = await getPersistedSession(completed.id);
        const refreshedJsonExport = await buildPersistedSessionJsonExport(completed.id, [leadForDryRun.id]);
        const refreshedCsvExport = await buildPersistedSessionCsvExport(completed.id, [leadForDryRun.id]);

        expect(refreshed?.leads[0]?.revon.pushStatus).toBe("dry_run");
        expect(refreshed?.leads[0]?.revonStatusLabel).toBe("Dry run");
        expect(refreshed?.leads[0]?.revon.requestId).toBe("req-dry-smoke");
        expect(refreshedJsonExport?.leads[0]?.revon.lastAttemptedAt).toBe("2026-03-29T10:00:00.000Z");
        expect(refreshedCsvExport?.content).toContain("dry_run");
        expect(refreshedCsvExport?.content).toContain("2026-03-29T10:00:00.000Z");
      }
    } finally {
      restoreEnv();
    }
  });
});
