import { describe, expect, it, beforeAll } from "vitest";
import { generateSmokeFixtures } from "./utils/fixtureGenerator";
import { loadGeneratedFixture, replaySampleRunFixture, type ReplayFixture } from "./utils/replayValidator";

describe("sample-run replay smoke", () => {
  beforeAll(async () => {
    await generateSmokeFixtures();
  });

  it("replays a canonical run fixture through parser, mapping, and ranking", async () => {
    const fixture = await loadGeneratedFixture<ReplayFixture>("sample-run-replay.json");
    const result = replaySampleRunFixture(fixture);

    expect(result.leads).toHaveLength(fixture.expectations.expectedLeadCount);
    expect(result.partialLeadCount).toBe(fixture.expectations.expectedPartialLeadCount);
    expect(result.qualifiedLeadCount).toBeGreaterThanOrEqual(
      fixture.expectations.minimumQualifiedLeads,
    );
    expect(result.leads[0]?.score.fitScore).toBeGreaterThanOrEqual(result.leads[1]?.score.fitScore ?? 0);
    expect(result.leads[0]?.score.reasons.length).toBeGreaterThan(0);
    expect(result.leads[0]?.rawExtraction.directory.listingFacts.length).toBeGreaterThan(0);
  });
});
