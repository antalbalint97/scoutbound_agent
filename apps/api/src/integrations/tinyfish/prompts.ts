import type { IcpInput } from "@revon-tinyfish/contracts";

const LOCATION_PATH_MAP: Record<string, string> = {
  global: "",
  remote: "",
  europe: "",
  eu: "",
  usa: "/us",
  us: "/us",
  "united states": "/us",
  uk: "/uk",
  "united kingdom": "/uk",
  london: "/uk/london",
  germany: "/de",
  berlin: "/de/berlin",
  france: "/fr",
  paris: "/fr/paris",
  netherlands: "/nl",
  amsterdam: "/nl/amsterdam",
  hungary: "/hu",
  budapest: "/hu/budapest",
};

const MARKET_PATH_MAP: Record<string, string> = {
  "digital marketing": "/agencies/digital-marketing",
  seo: "/agencies/seo",
  ppc: "/agencies/ppc",
  branding: "/agencies/branding",
  "web development": "/developers/web",
  "software development": "/developers",
  "ai automation": "/developers/artificial-intelligence",
  "data engineering": "/developers/big-data",
};

export function buildDirectoryUrl(input: IcpInput): string {
  const locationPath = LOCATION_PATH_MAP[input.location.toLowerCase().trim()] ?? "";
  const marketPath = MARKET_PATH_MAP[input.targetMarket.toLowerCase().trim()] ?? "/agencies";
  return `https://clutch.co${locationPath}${marketPath}`;
}

function appendOperatorInstructions(goal: string, promptOverride?: string): string {
  const trimmed = promptOverride?.trim();
  if (!trimmed) {
    return goal;
  }

  return `${goal}

Operator-added instructions:
${trimmed}`;
}

export function buildDirectoryGoal(input: IcpInput, promptOverride = ""): string {
  return appendOperatorInstructions(`
Task: extract up to ${input.maxResults} factual company listings from the current directory page only.

Search context for later backend scoring:
- Target market: ${input.targetMarket}
- Geography: ${input.location}
- Preferred company size: ${input.companySize}
- Extra keywords: ${input.keywords || "none supplied"}

Rules:
- Use only information visible on the current page view.
- Do not paginate or click external websites.
- Do not score, rank, qualify, or decide whether a company is a good lead.
- Do not guess websites, ratings, company sizes, locations, or service categories.
- If a field is missing, return null for that field.
- Prefer fewer high-confidence results over broad uncertain output.
- If no suitable companies are visible, return [].

Return ONLY a JSON array. Each item must use these exact keys:
{
  "company_name": "Company display name or null",
  "website_url": "https://company-site.com or null",
  "directory_url": "https://directory-profile-url or null",
  "location": "City, Country or null",
  "short_description": "One sentence summary from visible listing text or null",
  "primary_service": "Main service category or null",
  "employee_range": "11-50 or null",
  "rating": 4.8 or null,
  "listing_facts": ["short visible fact 1", "short visible fact 2"],
  "evidence_snippet": "short visible listing text snippet or null",
  "quality_notes": ["note about missing or uncertain data"]
}
`.trim(), promptOverride);
}

export function buildWebsiteGoal(input: IcpInput, promptOverride = ""): string {
  return appendOperatorInstructions(`
Task: inspect this company website and return structured extraction for outbound sales prospecting.

Search context for later backend scoring:
- Target market: ${input.targetMarket}
- Geography: ${input.location}
- Preferred company size: ${input.companySize}
- Decision-maker titles to prioritise when visible: ${input.decisionMakerRole}
- Keywords worth preserving when explicitly visible: ${input.keywords || "none"}

Navigation instructions (follow in this order, all steps are mandatory):
1. Load the homepage. Scan every visible section — header, footer, hero, sidebar — for email addresses and mailto: links. Capture everything found.
2. Find and navigate to the contact page. Look for links labelled "Contact", "Contact us", "Get in touch", "Kontakt", "Kapcsolat", "Impressum", "Legal notice", or similar. This step is required — do not skip it. Capture all visible email addresses and phone numbers.
3. Find and navigate to the team, about, or people page if a link is visible. Capture each named person with their role, direct email (if visible), and LinkedIn profile URL (if visible).
4. If no contact or team page link is visible, check the footer for any mailto: link or plaintext email address.
5. Stop after these pages — do not follow further links.

Rules:
- Only include emails and LinkedIn URLs that are explicitly visible on the page — do not guess or construct them.
- Do not invent team members, titles, or contact details.
- Focus on factual extraction only; do not score, rank, or qualify the company.
- If a field is missing, use null or [] and record it in "missing_fields".
- If something looks likely but is not explicit, record it in "uncertain_fields" instead.

Return ONLY one JSON object with these exact keys:
{
  "summary": "one sentence company summary or null",
  "services": ["service 1", "service 2"],
  "emails": ["visible-email@company.com"],
  "contact_page_url": "https://company.com/contact or null",
  "about_page_url": "https://company.com/about or null",
  "team_page_url": "https://company.com/team or null",
  "team": [
    {
      "name": "Full Name",
      "role": "Explicit visible job title",
      "email": "name@company.com or null",
      "linkedin_url": "https://linkedin.com/in/handle or null"
    }
  ],
  "evidence": [
    {
      "kind": "homepage | contact_page | about_page | team_page | footer | other",
      "source_url": "https://...",
      "source_label": "homepage | contact page | team page",
      "title": "short evidence title",
      "summary": "what this evidence proves",
      "snippet": "short visible text snippet or null",
      "confidence": "high | medium | low",
      "quality_note": "null or short uncertainty note"
    }
  ],
  "page_findings": [
    {
      "kind": "homepage | contact_page | about_page | team_page | footer | other",
      "source_url": "https://...",
      "source_label": "homepage | contact page | team page",
      "findings": ["short factual finding 1", "short factual finding 2"],
      "missing_fields": ["emails"],
      "uncertain_fields": ["employee count"],
      "quality_notes": ["short note about ambiguity or limited visibility"]
    }
  ],
  "missing_fields": ["emails", "team"],
  "uncertain_fields": ["team page availability"],
  "quality_notes": ["short operational note about limits or ambiguity"]
}
`.trim(), promptOverride);
}
