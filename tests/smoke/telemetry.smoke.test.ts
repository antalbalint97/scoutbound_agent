import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEMO_PRESETS } from "../../apps/web/src/demoPresets";
import { createMockDirectoryDiscovery, createMockWebsiteInspection } from "../../apps/api/src/mocks/sampleLeads";
import {
  startDiscoveryRun,
  type DiscoveryDependencies,
} from "../../apps/api/src/orchestrators/discoveryRun";
import {
  compareExperimentVariants,
  getTelemetrySession,
  listExperimentVariantSummaries,
} from "../../apps/api/src/services/telemetryStore";
import { applyEnv, resetSmokeRunStore, waitForRunCompletion } from "./utils/orchestrationHarness";

const input = DEMO_PRESETS[0]?.input ?? {
  targetMarket: "Digital marketing",
  location: "London",
  companySize: "11-50",
  keywords: "B2B, SaaS, growth",
  decisionMakerRole: "Founder",
  maxResults: 2,
};

function createRunSnapshot(overrides: {
  runId: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  result?: unknown;
  error?: string | null;
}) {
  return {
    runId: overrides.runId,
    status: overrides.status,
    rawStatus:
      overrides.status === "completed"
        ? "COMPLETED"
        : overrides.status === "failed"
          ? "FAILED"
          : overrides.status === "cancelled"
            ? "CANCELLED"
            : "RUNNING",
    result: overrides.result ?? null,
    error: overrides.error ?? null,
    creditUsage: null,
    createdAt: null,
    startedAt: null,
    finishedAt: null,
    streamingUrl: null,
  };
}

function buildLiveDependencies(options: { failSecondInspection?: boolean } = {}): DiscoveryDependencies {
  const discovery = createMockDirectoryDiscovery({ ...input, maxResults: 2 });
  const firstCandidate = discovery.candidates[0]!;
  const secondCandidate = discovery.candidates[1]!;

  return {
    startTinyFishAutomationAsync: vi
      .fn()
      .mockResolvedValueOnce({ runId: "tf-directory" })
      .mockResolvedValueOnce({ runId: "tf-inspection-1" })
      .mockResolvedValueOnce({ runId: "tf-inspection-2" }),
    getTinyFishRunsByIds: vi
      .fn()
      .mockResolvedValueOnce({
        runs: [
          createRunSnapshot({
            runId: "tf-directory",
            status: "completed",
            result: discovery.candidates,
          }),
        ],
        notFound: [],
      })
      .mockResolvedValueOnce({
        runs: [
          createRunSnapshot({
            runId: "tf-inspection-1",
            status: "completed",
            result: createMockWebsiteInspection(firstCandidate, input, 0),
          }),
          options.failSecondInspection
            ? createRunSnapshot({
                runId: "tf-inspection-2",
                status: "failed",
                error: "Simulated TinyFish timeout.",
              })
            : createRunSnapshot({
                runId: "tf-inspection-2",
                status: "completed",
                result: createMockWebsiteInspection(secondCandidate, input, 1),
              }),
        ],
        notFound: [],
      }),
    sleep: vi.fn().mockResolvedValue(undefined),
    createMockDirectoryDiscovery,
    createMockWebsiteInspection,
  };
}

describe("telemetry smoke", () => {
  beforeEach(() => {
    resetSmokeRunStore();
  });

  it("captures session-level and TinyFish run telemetry for a successful live session", async () => {
    const restoreEnv = applyEnv({
      TINYFISH_API_KEY: "demo-key",
      TINYFISH_FORCE_MOCK: "false",
      TINYFISH_ENABLE_MOCK_FALLBACK: "false",
      TINYFISH_INSPECTION_CONCURRENCY: "2",
    });

    try {
      const run = startDiscoveryRun({ ...input, maxResults: 2 }, buildLiveDependencies(), {
        correlationId: "corr-telemetry-success",
        payloadSignature: "telemetry-success",
        experimentLabel: "telemetry_success_variant",
      });
      const completed = await waitForRunCompletion(run.id);
      const telemetry = getTelemetrySession(run.id);

      expect(telemetry).toBeDefined();
      expect(telemetry?.experimentLabel).toBe("telemetry_success_variant");
      expect(telemetry?.captureMode).toBe("live");
      expect(telemetry?.runStatus).toBe("completed");
      expect(telemetry?.totalCompaniesFound).toBe(2);
      expect(telemetry?.totalCompaniesInspected).toBe(2);
      expect(telemetry?.totalCompletedInspections).toBe(2);
      expect(telemetry?.totalFailedInspections).toBe(0);
      expect(telemetry?.totalQualifiedLeads).toBe(completed.summary.qualifiedLeadCount);
      expect(telemetry?.qualityMetrics.usableLeadCount).toBe(completed.summary.usableLeadCount);
      expect(telemetry?.costMetrics.runsPerSession).toBe(3);
      expect(telemetry?.tinyfishRuns).toHaveLength(3);
      expect(telemetry?.tinyfishRuns.some((runTelemetry) => runTelemetry.stage === "directory_discovery")).toBe(
        true,
      );
      expect(
        telemetry?.tinyfishRuns.filter((runTelemetry) => runTelemetry.stage === "website_inspection").length,
      ).toBe(2);
    } finally {
      restoreEnv();
    }
  });

  it("compares experiment variants across sessions", async () => {
    const restoreEnv = applyEnv({
      TINYFISH_API_KEY: "demo-key",
      TINYFISH_FORCE_MOCK: "false",
      TINYFISH_ENABLE_MOCK_FALLBACK: "false",
      TINYFISH_INSPECTION_CONCURRENCY: "2",
    });

    try {
      const healthyRun = startDiscoveryRun({ ...input, maxResults: 2 }, buildLiveDependencies(), {
        correlationId: "corr-compare-a",
        payloadSignature: "compare-a",
        experimentLabel: "concurrency_2__healthy",
      });
      await waitForRunCompletion(healthyRun.id);

      const degradedRun = startDiscoveryRun(
        { ...input, maxResults: 2 },
        buildLiveDependencies({ failSecondInspection: true }),
        {
          correlationId: "corr-compare-b",
          payloadSignature: "compare-b",
          experimentLabel: "concurrency_2__degraded",
        },
      );
      await waitForRunCompletion(degradedRun.id);

      const summaries = listExperimentVariantSummaries();
      expect(summaries.map((summary) => summary.experimentLabel)).toEqual([
        "concurrency_2__degraded",
        "concurrency_2__healthy",
      ]);

      const comparison = compareExperimentVariants("concurrency_2__healthy", "concurrency_2__degraded");
      expect(comparison).not.toBeNull();
      expect(comparison?.left.sessionCount).toBe(1);
      expect(comparison?.right.sessionCount).toBe(1);
      expect(comparison?.delta.partialOrFailedPercentage).toBeGreaterThan(0);
      expect(comparison?.delta.qualifiedLeadCount).toBeLessThanOrEqual(0);
    } finally {
      restoreEnv();
    }
  });
});
