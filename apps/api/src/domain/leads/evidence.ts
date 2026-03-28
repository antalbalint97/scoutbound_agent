import { randomUUID } from "node:crypto";
import type { LeadEvidence } from "@revon-tinyfish/contracts";

export function createEvidence(input: Omit<LeadEvidence, "id">): LeadEvidence {
  return {
    id: randomUUID(),
    ...input,
  };
}

export function dedupeEvidence(evidence: LeadEvidence[]): LeadEvidence[] {
  const seen = new Set<string>();
  return evidence.filter((item) => {
    const key = `${item.kind}:${item.sourceUrl}:${item.title}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
