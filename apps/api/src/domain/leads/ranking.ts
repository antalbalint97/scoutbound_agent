import {
  leadRecordSchema,
  leadScorerOutputSchema,
  type LeadPriority,
  type LeadQualificationState,
  type LeadRecord,
  type LeadScorerInput,
  type LeadScorerOutput,
  type NormalizedLeadRecord,
} from "@revon-tinyfish/contracts";

function normalize(text: string): string {
  return text.toLowerCase();
}

function matches(text: string, term: string): boolean {
  return normalize(text).includes(normalize(term));
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function computePriority(totalScore: number, qualificationState: LeadQualificationState): LeadPriority {
  if (qualificationState === "qualified" && totalScore >= 72) {
    return "high";
  }
  if (qualificationState !== "unqualified" && totalScore >= 50) {
    return "medium";
  }
  return "low";
}

function computeConfidence(input: LeadScorerInput, qualityScore: number): "high" | "medium" | "low" {
  if (input.inspectionStatus === "failed") {
    return "low";
  }
  if (input.inspectionStatus === "completed" && qualityScore >= 70) {
    return "high";
  }
  return "medium";
}

export function scoreLeadInput(input: LeadScorerInput): LeadScorerOutput {
  const fitReasons: string[] = [];
  const contactReasons: string[] = [];
  const qualityReasons: string[] = [];
  const decisionReasons: string[] = [];
  const qualityNotes = [...input.company.qualityNotes];
  const searchBlob = input.scoringSignals.searchText.toLowerCase();

  let fitScore = 24;
  let contactabilityScore = 12;
  let qualityScore = 28;
  let decisionMakerScore = 10;

  if (input.company.industry && matches(searchBlob, input.icp.targetMarket)) {
    fitScore += 24;
    fitReasons.push(`Service and site language align with ${input.icp.targetMarket}.`);
  }

  const matchedKeywords = input.scoringSignals.keywordTerms.filter((term) => matches(searchBlob, term));
  if (matchedKeywords.length > 0) {
    fitScore += Math.min(22, matchedKeywords.length * 7);
    fitReasons.push(`Visible keyword matches: ${matchedKeywords.join(", ")}.`);
  }

  if (input.icp.location && matches(searchBlob, input.icp.location)) {
    fitScore += 10;
    fitReasons.push(`Location evidence aligns with ${input.icp.location}.`);
  }

  if (input.icp.companySize !== "any" && matches(input.company.companySize, input.icp.companySize)) {
    fitScore += 12;
    fitReasons.push(`Company size matches the ICP range ${input.icp.companySize}.`);
  }

  if (input.company.services.length > 0) {
    fitScore += 8;
    qualityScore += 10;
    qualityReasons.push("Structured service data was captured from the site.");
  }

  if (input.company.summary) {
    qualityScore += 10;
    qualityReasons.push("A normalized company summary is available for review.");
  }

  if (input.scoringSignals.counts.evidenceCount >= 3) {
    qualityScore += 15;
    qualityReasons.push("Multiple source-backed findings were preserved from the website crawl.");
  } else if (input.scoringSignals.counts.evidenceCount > 0) {
    qualityScore += 8;
    qualityReasons.push("At least one reviewable evidence source was preserved.");
  }

  if (input.scoringSignals.counts.pageFindingCount > 0) {
    qualityScore += 12;
    qualityReasons.push("Page-level structured findings were captured for backend scoring.");
  }

  if (input.scoringSignals.counts.decisionMakerCount > 0) {
    contactabilityScore += 18;
    decisionMakerScore += 28;
    decisionReasons.push("Named decision-maker profiles were extracted from the site.");
    contactReasons.push("Named leadership coverage improves outreach readiness.");
  }

  if (input.scoringSignals.counts.publicEmailCount > 0) {
    contactabilityScore += 28;
    contactReasons.push("A public outreach email was captured from visible pages.");
  }

  if (input.evidenceSources.some((item) => item.kind === "contact_page")) {
    contactabilityScore += 14;
    contactReasons.push("A contact page was visited and preserved as evidence.");
  }

  if (input.company.companyDomain) {
    contactabilityScore += 6;
  }

  if (input.contacts.some((contact) => matches(contact.role, input.icp.decisionMakerRole))) {
    fitScore += 10;
    decisionMakerScore += 18;
    decisionReasons.push(`Detected a target title related to ${input.icp.decisionMakerRole}.`);
    fitReasons.push(`Observed a role aligned with ${input.icp.decisionMakerRole}.`);
  }

  if (input.scoringSignals.missingFields.length > 0) {
    qualityScore -= Math.min(24, input.scoringSignals.missingFields.length * 4);
    qualityNotes.push(`Missing extraction fields: ${input.scoringSignals.missingFields.join(", ")}.`);
  }

  if (input.scoringSignals.uncertainFields.length > 0) {
    qualityScore -= Math.min(18, input.scoringSignals.uncertainFields.length * 6);
    qualityNotes.push(
      `Scoring confidence reduced by uncertain fields: ${input.scoringSignals.uncertainFields.join(", ")}.`,
    );
  }

  if (input.inspectionStatus === "partial") {
    fitScore -= 10;
    contactabilityScore -= 12;
    qualityScore -= 18;
    decisionMakerScore -= 8;
    qualityNotes.push("Website inspection was partial, so ranking confidence is reduced.");
  }

  if (input.inspectionStatus === "failed") {
    fitScore -= 18;
    contactabilityScore -= 22;
    qualityScore -= 28;
    decisionMakerScore -= 12;
    qualityNotes.push("Website inspection failed, so this lead should not be presented as high-confidence.");
  }

  const cappedFit = clampScore(fitScore);
  const cappedContactability = clampScore(contactabilityScore);
  const cappedQuality = clampScore(qualityScore);
  const cappedDecisionMaker = clampScore(decisionMakerScore);
  const totalScore = clampScore(
    cappedFit * 0.38 +
      cappedContactability * 0.24 +
      cappedQuality * 0.23 +
      cappedDecisionMaker * 0.15,
  );

  const qualificationState: LeadQualificationState =
    input.inspectionStatus === "failed"
      ? "unqualified"
      : totalScore >= 68 && cappedFit >= 55 && cappedQuality >= 50
        ? "qualified"
        : totalScore >= 45
          ? "review"
          : "unqualified";

  const priority = computePriority(totalScore, qualificationState);
  const reasons = [...fitReasons, ...contactReasons, ...qualityReasons, ...decisionReasons];

  return leadScorerOutputSchema.parse({
    fitScore: cappedFit,
    contactabilityScore: cappedContactability,
    qualityScore: cappedQuality,
    decisionMakerScore: cappedDecisionMaker,
    totalScore,
    priority,
    qualificationState,
    reasons,
    confidence: computeConfidence(input, cappedQuality),
    qualityNotes,
    explanations: {
      fit: {
        score: cappedFit,
        summary: `ICP fit score ${cappedFit}/100 based on market, location, size, and role alignment.`,
        reasons: fitReasons,
        notes: input.scoringSignals.missingFields.filter((field) =>
          ["summary", "services", "location", "company_size"].includes(field),
        ),
      },
      contactability: {
        score: cappedContactability,
        summary: `Contactability score ${cappedContactability}/100 based on public contact coverage and contact-page evidence.`,
        reasons: contactReasons,
        notes: input.scoringSignals.missingFields.filter((field) => ["emails", "team"].includes(field)),
      },
      quality: {
        score: cappedQuality,
        summary: `Quality score ${cappedQuality}/100 based on evidence coverage, page findings, and extraction completeness.`,
        reasons: qualityReasons,
        notes: qualityNotes,
      },
      decisionMaker: {
        score: cappedDecisionMaker,
        summary: `Decision-maker score ${cappedDecisionMaker}/100 based on named leadership and target-role coverage.`,
        reasons: decisionReasons,
        notes: input.scoringSignals.uncertainFields.filter((field) =>
          field.toLowerCase().includes("decision"),
        ),
      },
      total: {
        score: totalScore,
        summary: `Total score ${totalScore}/100 with qualification state ${qualificationState}.`,
        reasons,
        notes: qualityNotes,
      },
    },
  });
}

export function applyScoreToLead(lead: NormalizedLeadRecord, score: LeadScorerOutput): LeadRecord {
  return leadRecordSchema.parse({
    ...lead,
    matchReasons: score.reasons.slice(0, 3),
    score,
  });
}

export function sortLeadRecords(leads: LeadRecord[]): LeadRecord[] {
  return [...leads].sort((left, right) => {
    if (right.score.totalScore !== left.score.totalScore) {
      return right.score.totalScore - left.score.totalScore;
    }

    const leftTotal = left.score.fitScore + left.score.contactabilityScore;
    const rightTotal = right.score.fitScore + right.score.contactabilityScore;
    return rightTotal - leftTotal;
  });
}
