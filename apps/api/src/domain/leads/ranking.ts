import type { IcpInput, LeadPriority, LeadRecord } from "@revon-tinyfish/contracts";

function normalize(text: string): string {
  return text.toLowerCase();
}

function matches(text: string, term: string): boolean {
  return normalize(text).includes(normalize(term));
}

function splitKeywords(keywords: string): string[] {
  return keywords
    .split(/[,|]/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2);
}

function computePriority(fitScore: number, contactabilityScore: number): LeadPriority {
  const total = fitScore + contactabilityScore;
  if ((fitScore >= 70 && contactabilityScore >= 55) || total >= 145) {
    return "high";
  }
  if (total >= 90) {
    return "medium";
  }
  return "low";
}

export function rankLead(input: IcpInput, lead: LeadRecord): LeadRecord {
  const reasons: string[] = [];
  const qualityNotes = [...lead.qualityNotes];
  const keywordTerms = splitKeywords(input.keywords);
  const searchBlob = [
    lead.summary,
    lead.industry,
    lead.location,
    lead.services.join(" "),
    lead.positioningSignals.join(" "),
  ]
    .join(" ")
    .toLowerCase();

  let fitScore = 28;
  let contactabilityScore = 18;

  if (lead.matchReasons.length > 0) {
    reasons.push(...lead.matchReasons);
  }

  if (matches(searchBlob, input.targetMarket)) {
    fitScore += 26;
    reasons.push(`Service positioning matches ${input.targetMarket}.`);
  }

  const matchedKeywords = keywordTerms.filter((term) => matches(searchBlob, term));
  if (matchedKeywords.length > 0) {
    fitScore += Math.min(24, matchedKeywords.length * 8);
    reasons.push(`Keyword matches found: ${matchedKeywords.join(", ")}.`);
  }

  if (input.location && matches(searchBlob, input.location)) {
    fitScore += 8;
    reasons.push(`Location signals align with ${input.location}.`);
  }

  if (input.companySize !== "any" && matches(lead.companySize, input.companySize)) {
    fitScore += 12;
    reasons.push(`Company size matches the ICP range ${input.companySize}.`);
  }

  if (lead.services.length > 0) {
    fitScore += 6;
  }

  if (lead.contacts.some((contact) => contact.isDecisionMaker)) {
    contactabilityScore += 22;
    reasons.push("Decision-maker profiles were detected on the website.");
  }

  if (lead.contacts.some((contact) => Boolean(contact.email))) {
    contactabilityScore += 25;
    reasons.push("Public email coverage is available for outreach.");
  }

  if (lead.evidence.some((item) => item.kind === "contact_page")) {
    contactabilityScore += 15;
  }

  if (lead.evidence.length >= 3) {
    contactabilityScore += 10;
  }

  if (lead.companyDomain) {
    contactabilityScore += 5;
  }

  if (lead.contacts.some((contact) => matches(contact.role, input.decisionMakerRole))) {
    fitScore += 10;
    reasons.push(`Detected target persona signal for ${input.decisionMakerRole}.`);
  }

  if (lead.inspectionStatus === "partial") {
    fitScore = Math.max(0, fitScore - 10);
    contactabilityScore = Math.max(0, contactabilityScore - 12);
    qualityNotes.push("Website inspection was partial, so ranking confidence is reduced.");
  }

  if (lead.inspectionStatus === "failed") {
    fitScore = Math.max(0, fitScore - 18);
    contactabilityScore = Math.max(0, contactabilityScore - 25);
    qualityNotes.push("Website inspection failed, so this lead should not be presented as high-confidence.");
  }

  const cappedFit = Math.min(100, fitScore);
  const cappedContactability = Math.min(100, contactabilityScore);
  const confidence =
    lead.inspectionStatus === "completed" && lead.evidence.length >= 3
      ? "high"
      : lead.inspectionStatus === "failed"
        ? "low"
        : "medium";

  const score = {
    fitScore: cappedFit,
    contactabilityScore: cappedContactability,
    priority: computePriority(cappedFit, cappedContactability),
    reasons,
    confidence,
    qualityNotes,
  } as const;

  return {
    ...lead,
    score,
  };
}

export function rankLeads(input: IcpInput, leads: LeadRecord[]): LeadRecord[] {
  return leads
    .map((lead) => rankLead(input, lead))
    .sort((left, right) => {
      const leftTotal = left.score.fitScore + left.score.contactabilityScore;
      const rightTotal = right.score.fitScore + right.score.contactabilityScore;
      return rightTotal - leftTotal;
    });
}
