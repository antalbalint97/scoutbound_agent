import type { LeadContact } from "@revon-tinyfish/contracts";

export interface RankedContact extends LeadContact {
  recommendationScore: number;
  recommendationReasons: string[];
}

function normalize(value: string): string {
  return value.toLowerCase().trim();
}

function isGenericRole(role: string): boolean {
  return /^(company inbox|contact|general enquiry|general inquiry|team|office|sales|support|info|hello|mail|contact us)$/i.test(
    normalize(role),
  );
}

function isDecisionMakerTitle(role: string): boolean {
  return /founder|ceo|chief|director|vp|head|partner|owner|president|managing director|lead/i.test(role);
}

export function scoreContactRecommendation(contact: LeadContact): RankedContact {
  const reasons: string[] = [];
  let score = 0;

  if (contact.email) {
    score += 45;
    reasons.push("Has a public email address");
  }

  if (contact.isDecisionMaker) {
    score += 30;
    reasons.push("Marked as a decision maker");
  }

  if (isDecisionMakerTitle(contact.role)) {
    score += 18;
    reasons.push("Title matches leadership / decision-maker language");
  }

  if (contact.linkedinUrl) {
    score += 12;
    reasons.push("LinkedIn profile was captured");
  }

  if (contact.name.trim().split(/\s+/).length >= 2) {
    score += 5;
    reasons.push("Full name was captured");
  }

  if (contact.role.trim().length > 0 && !isGenericRole(contact.role)) {
    score += 8;
    reasons.push("Role is specific enough for outreach");
  }

  if (isGenericRole(contact.role)) {
    score -= 18;
    reasons.push("Generic inbox-style role");
  }

  return {
    ...contact,
    recommendationScore: score,
    recommendationReasons: reasons,
  };
}

export function rankContactsForPush(contacts: LeadContact[]): RankedContact[] {
  return [...contacts]
    .map(scoreContactRecommendation)
    .sort((left, right) => {
      if (right.recommendationScore !== left.recommendationScore) {
        return right.recommendationScore - left.recommendationScore;
      }

      if (right.isDecisionMaker !== left.isDecisionMaker) {
        return right.isDecisionMaker ? 1 : -1;
      }

      if (Boolean(right.email) !== Boolean(left.email)) {
        return right.email ? 1 : -1;
      }

      return left.name.localeCompare(right.name);
    });
}

