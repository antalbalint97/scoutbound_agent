import type { IcpInput } from "@revon-tinyfish/contracts";

function formatCompanySize(value: IcpInput["companySize"]): string {
  return value === "any" ? "Any size" : value;
}

function appendPromptOverride(lines: string[], promptOverride?: string): string[] {
  const trimmed = promptOverride?.trim();
  if (!trimmed) {
    return lines;
  }

  return [
    ...lines,
    "",
    "Operator-added instructions",
    trimmed,
  ];
}

export function buildTinyFishPromptPreview(input: IcpInput, promptOverride = ""): {
  directory: string;
  website: string;
} {
  const keywords = input.keywords.trim() || "none supplied";

  return {
    directory: appendPromptOverride([
      "Directory discovery task",
      `- Find up to ${input.maxResults} factual company listings from the current directory page only.`,
      `- Target market: ${input.targetMarket}.`,
      `- Geography: ${input.location}.`,
      `- Company size: ${formatCompanySize(input.companySize)}.`,
      `- Preserve visible keywords: ${keywords}.`,
      "- Do not paginate, click external company websites, score, or qualify.",
      "- Return JSON only, and return null for missing fields.",
    ], promptOverride).join("\n"),
    website: appendPromptOverride([
      "Website inspection task",
      `- Inspect the homepage, contact page, about page, and team page when visible.`,
      `- Prioritise decision-maker titles such as ${input.decisionMakerRole}.`,
      `- Capture only explicitly visible emails, LinkedIn URLs, and team members.`,
      `- Record missing or uncertain fields instead of guessing.`,
      "- Return a single JSON object with evidence, page findings, emails, and quality notes.",
    ], promptOverride).join("\n"),
  };
}
