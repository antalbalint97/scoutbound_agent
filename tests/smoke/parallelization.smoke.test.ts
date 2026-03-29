import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockDirectoryDiscovery, createMockWebsiteInspection } from "../../apps/api/src/mocks/sampleLeads";
import {
  startDiscoveryRun,
  type DiscoveryDependencies,
} from "../../apps/api/src/orchestrators/discoveryRun";
import { applyEnv, resetSmokeRunStore, waitForRunCompletion } from "./utils/orchestrationHarness";

const input = {
  targetMarket: "Digital marketing",
  location: "London",
  companySize: "11-50",
  keywords: "B2B, SaaS, growth",
  decisionMakerRole: "Founder",
  maxResults: 8,
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

describe("orchestration parallelization and capping smoke", () => {
  beforeEach(() => {
    resetSmokeRunStore();
  });

  it("respects TINYFISH_MAX_COMPANIES_TO_INSPECT cap", async () => {
    const restoreEnv = applyEnv({
      TINYFISH_API_KEY: "demo-key",
      TINYFISH_FORCE_MOCK: "false",
      TINYFISH_ENABLE_MOCK_FALLBACK: "false",
      TINYFISH_MAX_COMPANIES_TO_INSPECT: "3",
      TINYFISH_INSPECTION_CONCURRENCY: "5",
    });

    try {
      const discovery = createMockDirectoryDiscovery({ ...input, maxResults: 8 });
      // Discovery returns 8 candidates by default in mock discovery if input.maxResults is 8

      const submitMock = vi.fn().mockImplementation(async ({ url }) => {
        if (url.includes("clutch.co")) return { runId: "tf-directory" };
        return { runId: `tf-inspection-${url}` };
      });

      const pollMock = vi.fn().mockImplementation(async (apiKey, runIds) => {
        if (runIds.includes("tf-directory")) {
          const result = discovery.candidates.map(c => ({
              company_name: c.companyName,
              website_url: c.websiteUrl,
              directory_url: c.directoryUrl,
              location: c.location,
              short_description: c.shortDescription,
              primary_service: c.primaryService,
              employee_range: c.employeeRange,
              rating: c.rating,
              listing_facts: c.listingFacts,
              evidence_snippet: c.evidenceSnippet,
              quality_notes: c.qualityNotes
          }));
          return {
            runs: [createRunSnapshot({ runId: "tf-directory", status: "completed", result })],
            notFound: [],
          };
        }
        return {
          runs: runIds.map((id: string) => createRunSnapshot({ runId: id, status: "completed", result: { summary: "test" } })),
          notFound: [],
        };
      });

      const dependencies: DiscoveryDependencies = {
        startTinyFishAutomationAsync: submitMock,
        getTinyFishRunsByIds: pollMock,
        sleep: vi.fn().mockResolvedValue(undefined),
        createMockDirectoryDiscovery,
        createMockWebsiteInspection,
      };

      const run = startDiscoveryRun(input, dependencies);
      const completed = await waitForRunCompletion(run.id);

      expect(completed.summary.companiesFound).toBe(3);
      expect(completed.summary.inspectionsStarted).toBe(3);
      expect(submitMock).toHaveBeenCalledTimes(4); // 1 directory + 3 inspections
    } finally {
      restoreEnv();
    }
  });

  it("respects TINYFISH_INSPECTION_CONCURRENCY during polling", async () => {
    const restoreEnv = applyEnv({
      TINYFISH_API_KEY: "demo-key",
      TINYFISH_FORCE_MOCK: "false",
      TINYFISH_ENABLE_MOCK_FALLBACK: "false",
      TINYFISH_MAX_COMPANIES_TO_INSPECT: "10",
      TINYFISH_INSPECTION_CONCURRENCY: "3",
    });

    try {
      const discovery = createMockDirectoryDiscovery({ ...input, maxResults: 5 });

      const submitMock = vi.fn().mockImplementation(async ({ url }) => {
        if (url.includes("clutch.co")) return { runId: "tf-directory" };
        return { runId: `tf-inspection-${url}` };
      });

      const pollMock = vi.fn().mockImplementation(async (apiKey, runIds) => {
        if (runIds.includes("tf-directory")) {
          return {
            runs: [createRunSnapshot({ runId: "tf-directory", status: "completed", result: discovery.candidates.map(c => ({
                company_name: c.companyName,
                website_url: c.websiteUrl
            })) })],
            notFound: [],
          };
        }
        // Return running for all to keep them in activeJobs, except maybe one to progress
        return {
          runs: runIds.map((id: string, index: number) =>
            createRunSnapshot({
                runId: id,
                status: index === 0 ? "completed" : "running",
                result: index === 0 ? { summary: "test" } : null
            })
          ),
          notFound: [],
        };
      });

      const dependencies: DiscoveryDependencies = {
        startTinyFishAutomationAsync: submitMock,
        getTinyFishRunsByIds: pollMock,
        sleep: vi.fn().mockResolvedValue(undefined),
        createMockDirectoryDiscovery,
        createMockWebsiteInspection,
      };

      const run = startDiscoveryRun({ ...input, maxResults: 5 }, dependencies);
      await waitForRunCompletion(run.id);

      // Verify that getTinyFishRunsByIds was never called with more than 3 inspection runIds
      for (const call of pollMock.mock.calls) {
        const runIds = call[1] as string[];
        if (runIds.length === 1 && runIds[0] === "tf-directory") continue;
        expect(runIds.length).toBeLessThanOrEqual(3);
      }
    } finally {
      restoreEnv();
    }
  });
});
