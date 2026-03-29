import { describe, expect, it } from "vitest";
import { DEMO_PRESETS } from "../../apps/web/src/demoPresets";
import { createMockDirectoryDiscovery, createMockWebsiteInspection } from "../../apps/api/src/mocks/sampleLeads";
import { normalizeLeadCandidate } from "../../apps/api/src/domain/leads/mappers";
import { buildLeadScorerInput } from "../../apps/api/src/domain/leads/processing";
import { scoreLeadInput } from "../../apps/api/src/domain/leads/ranking";

const input = DEMO_PRESETS[0]?.input ?? {
  targetMarket: "Digital marketing",
  location: "London",
  companySize: "11-50",
  keywords: "B2B, SaaS, growth",
  decisionMakerRole: "Founder",
  maxResults: 1,
};

describe("scoring boundary smoke", () => {
  it("builds an explicit scorer input contract and scorer output contract", () => {
    const candidate = createMockDirectoryDiscovery({ ...input, maxResults: 1 }).candidates[0]!;
    const inspection = createMockWebsiteInspection(candidate, input, 0);

    const normalizedLead = normalizeLeadCandidate(candidate, inspection, {
      captureMode: "mock",
      agentContext: {
        agentSessionId: "agent-session-456",
        correlationId: "corr-456",
        directoryUrl: candidate.directoryUrl,
        directoryRunId: "dir-run-456",
        inspectionRunIds: ["site-run-456"],
        tinyfishRunIds: ["dir-run-456", "site-run-456"],
        runStartedAt: "2026-03-29T00:00:00.000Z",
      },
    });

    const scorerInput = buildLeadScorerInput(input, normalizedLead);
    const scorerOutput = scoreLeadInput(scorerInput);

    expect(scorerInput.session.agentSessionId).toBe("agent-session-456");
    expect(scorerInput.session.tinyfishRunIds).toEqual(["dir-run-456", "site-run-456"]);
    expect(scorerInput.fieldAssessments.length).toBeGreaterThan(0);
    expect(scorerOutput.totalScore).toBeGreaterThan(0);
    expect(scorerOutput.explanations.total.summary).toMatch(/Total score/i);
  });
});
