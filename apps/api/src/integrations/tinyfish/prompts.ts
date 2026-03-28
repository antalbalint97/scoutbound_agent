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

export function buildDirectoryGoal(input: IcpInput): string {
  return `
Open this public directory page and extract up to ${input.maxResults} company listings that best match:
- Target market: ${input.targetMarket}
- Geography: ${input.location}
- Size preference: ${input.companySize}
- Additional lead cues: ${input.keywords || "none supplied"}

Return a JSON array. Each item must use these exact keys:
{
  "company_name": "Company display name",
  "website_url": "https://company-site.com",
  "directory_url": "https://directory-profile-url",
  "location": "City, Country",
  "short_description": "One sentence summary of what they do",
  "primary_service": "Main service category",
  "employee_range": "11-50",
  "rating": 4.8
}

Only use listings visible in the current directory page view.
Do not paginate.
Return only the JSON array.
`.trim();
}

export function buildWebsiteGoal(input: IcpInput): string {
  return `
Visit this company website and gather outreach-ready lead intelligence for Revon.

Prioritize finding a likely buyer persona for: ${input.decisionMakerRole}
Target market context: ${input.targetMarket}
Extra keywords to look for: ${input.keywords || "none"}

Return a JSON object with these exact keys:
{
  "summary": "one sentence company summary",
  "services": ["service 1", "service 2"],
  "emails": ["name@company.com"],
  "contact_page_url": "https://company.com/contact" or null,
  "about_page_url": "https://company.com/about" or null,
  "team_page_url": "https://company.com/team" or null,
  "team": [
    { "name": "Full Name", "role": "Job Title" }
  ],
  "signals": [
    "notable client or industry signal",
    "technology or delivery capability"
  ]
}

Check the homepage, footer, contact page, about page, and team page when available.
Return only the JSON object.
`.trim();
}
