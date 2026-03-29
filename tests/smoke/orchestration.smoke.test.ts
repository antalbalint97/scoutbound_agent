import { beforeEach, describe, expect, it, vi } from "vitest";
import { demoRunSchema } from "@revon-tinyfish/contracts";
import { DEMO_PRESETS } from "../../apps/web/src/demoPresets";
import { createMockDirectoryDiscovery, createMockWebsiteInspection } from "../../apps/api/src/mocks/sampleLeads";
import {
  startDiscoveryRun,
  type DiscoveryDependencies,
} from "../../apps/api/src/orchestrators/discoveryRun";
import {
  directoryReplayRaw,
  websiteReplaySuccessRaw,
} from "./fixtures/sourceFixtures";
import { applyEnv, resetSmokeRunStore, waitForRunCompletion } from "./utils/orchestrationHarness";

const input = DEMO_PRESETS[0]?.input ?? {
  targetMarket: "Digital marketing",
  location: "London",
  companySize: "11-50",
  keywords: "B2B, SaaS, growth",
  decisionMakerRole: "Founder",
  maxResults: 5,
};

function createRunSnapshot(overrides: {
  runId: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  rawStatus?: string;
  result?: unknown;
  error?: string | null;
}) {
  return {
    runId: overrides.runId,
    status: overrides.status,
    rawStatus:
      overrides.rawStatus ??
      (overrides.status === "completed"
        ? "COMPLETED"
        : overrides.status === "failed"
          ? "FAILED"
          : overrides.status === "cancelled"
            ? "CANCELLED"
            : "RUNNING"),
    result: overrides.result ?? null,
    error: overrides.error ?? null,
    createdAt: null,
    startedAt: null,
    finishedAt: null,
    streamingUrl: null,
  };
}

describe("orchestration lifecycle smoke", () => {
  beforeEach(() => {
    resetSmokeRunStore();
  });

  it("completes the lifecycle in explicit mock mode when no TinyFish key exists", async () => {
    const restoreEnv = applyEnv({
      TINYFISH_API_KEY: undefined,
      TINYFISH_FORCE_MOCK: "false",
      TINYFISH_ENABLE_MOCK_FALLBACK: "true",
    });

    try {
      const run = startDiscoveryRun(input);
      const completed = await waitForRunCompletion(run.id);

      expect(() => demoRunSchema.parse(completed)).not.toThrow();
      expect(completed.mode).toBe("mock");
      expect(completed.status).toBe("completed");
      expect(completed.quality).toBe("healthy");
      expect(completed.steps.every((step) => step.status === "completed")).toBe(true);
      expect(completed.leads.length).toBeGreaterThan(0);
    } finally {
      restoreEnv();
    }
  });

  it("marks live async runs as partial and degraded when one website inspection fails", async () => {
    const restoreEnv = applyEnv({
      TINYFISH_API_KEY: "demo-key",
      TINYFISH_FORCE_MOCK: "false",
      TINYFISH_ENABLE_MOCK_FALLBACK: "false",
      TINYFISH_INSPECTION_CONCURRENCY: "2",
    });

    try {
      const submitMock = vi
        .fn()
        .mockResolvedValueOnce({ runId: "tf-directory-1" })
        .mockResolvedValueOnce({ runId: "tf-inspection-1" })
        .mockResolvedValueOnce({ runId: "tf-inspection-2" });

      const pollMock = vi
        .fn()
        .mockResolvedValueOnce({
          runs: [
            createRunSnapshot({
              runId: "tf-directory-1",
              status: "completed",
              result: directoryReplayRaw,
            }),
          ],
          notFound: [],
        })
        .mockResolvedValueOnce({
          runs: [
            createRunSnapshot({
              runId: "tf-inspection-1",
              status: "completed",
              result: websiteReplaySuccessRaw,
            }),
            createRunSnapshot({
              runId: "tf-inspection-2",
              status: "failed",
              error: "Simulated website timeout.",
            }),
          ],
          notFound: [],
        });

      const dependencies: DiscoveryDependencies = {
        startTinyFishAutomationAsync: submitMock,
        getTinyFishRunsByIds: pollMock,
        sleep: vi.fn().mockResolvedValue(undefined),
        createMockDirectoryDiscovery,
        createMockWebsiteInspection,
      };

      const run = startDiscoveryRun({ ...input, maxResults: 2 }, dependencies);
      const completed = await waitForRunCompletion(run.id);

      expect(completed.mode).toBe("live");
      expect(completed.status).toBe("partial");
      expect(completed.quality).toBe("degraded");
      expect(completed.summary.companiesFound).toBe(2);
      expect(completed.summary.inspectionsStarted).toBe(2);
      expect(completed.summary.inspectionsCompleted).toBe(1);
      expect(completed.summary.inspectionsFailed).toBe(1);
      expect(completed.summary.websiteFailures).toBe(1);
      expect(completed.summary.partialLeadCount).toBeGreaterThanOrEqual(1);
      expect(completed.steps.find((step) => step.key === "visiting_websites")?.status).toBe("partial");
    } finally {
      restoreEnv();
    }
  });

  it("submits inspection runs with bounded concurrency instead of one-by-one", async () => {
    const restoreEnv = applyEnv({
      TINYFISH_API_KEY: "demo-key",
      TINYFISH_FORCE_MOCK: "false",
      TINYFISH_ENABLE_MOCK_FALLBACK: "false",
      TINYFISH_INSPECTION_CONCURRENCY: "2",
    });

    try {
      const discovery = createMockDirectoryDiscovery({ ...input, maxResults: 3 });
      const submitMock = vi
        .fn()
        .mockResolvedValueOnce({ runId: "tf-directory-batch" })
        .mockResolvedValueOnce({ runId: "tf-inspection-a" })
        .mockResolvedValueOnce({ runId: "tf-inspection-b" })
        .mockResolvedValueOnce({ runId: "tf-inspection-c" });

      const pollMock = vi
        .fn()
        .mockResolvedValueOnce({
          runs: [
            createRunSnapshot({
              runId: "tf-directory-batch",
              status: "completed",
              result: discovery.candidates,
            }),
          ],
          notFound: [],
        })
        .mockResolvedValueOnce({
          runs: [
            createRunSnapshot({
              runId: "tf-inspection-a",
              status: "completed",
              result: createMockWebsiteInspection(discovery.candidates[0]!, input, 0),
            }),
            createRunSnapshot({
              runId: "tf-inspection-b",
              status: "completed",
              result: createMockWebsiteInspection(discovery.candidates[1]!, input, 1),
            }),
          ],
          notFound: [],
        })
        .mockResolvedValueOnce({
          runs: [
            createRunSnapshot({
              runId: "tf-inspection-c",
              status: "completed",
              result: createMockWebsiteInspection(discovery.candidates[2]!, input, 2),
            }),
          ],
          notFound: [],
        });

      const dependencies: DiscoveryDependencies = {
        startTinyFishAutomationAsync: submitMock,
        getTinyFishRunsByIds: pollMock,
        sleep: vi.fn().mockResolvedValue(undefined),
        createMockDirectoryDiscovery,
        createMockWebsiteInspection,
      };

      const run = startDiscoveryRun({ ...input, maxResults: 3 }, dependencies);
      const completed = await waitForRunCompletion(run.id);

      expect(completed.status).toBe("completed");
      expect(completed.summary.totalCompanies).toBe(3);
      expect(completed.summary.inspectionsStarted).toBe(3);
      expect(completed.summary.inspectionsCompleted).toBe(3);
      expect(completed.summary.inspectionsFailed).toBe(0);
      expect((pollMock.mock.calls[1]?.[1] as string[] | undefined)?.length).toBe(2);
      expect((pollMock.mock.calls[2]?.[1] as string[] | undefined)?.length).toBe(1);
    } finally {
      restoreEnv();
    }
  });

  it("degrades into explicit mock fallback when live async directory submission fails", async () => {
    const restoreEnv = applyEnv({
      TINYFISH_API_KEY: "demo-key",
      TINYFISH_FORCE_MOCK: "false",
      TINYFISH_ENABLE_MOCK_FALLBACK: "true",
    });

    try {
      const dependencies: DiscoveryDependencies = {
        startTinyFishAutomationAsync: vi.fn().mockRejectedValue(new Error("Simulated TinyFish outage")),
        getTinyFishRunsByIds: vi.fn(),
        sleep: vi.fn().mockResolvedValue(undefined),
        createMockDirectoryDiscovery,
        createMockWebsiteInspection,
      };

      const run = startDiscoveryRun(input, dependencies);
      const completed = await waitForRunCompletion(run.id);

      expect(completed.mode).toBe("mock");
      expect(completed.status).toBe("partial");
      expect(completed.quality).toBe("degraded");
      expect(completed.notes.join(" ")).toMatch(/mock fallback/i);
    } finally {
      restoreEnv();
    }
  });
});
