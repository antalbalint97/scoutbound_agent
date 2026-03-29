import { DEMO_PRESETS } from "../../../apps/web/src/demoPresets";

const recommendedPreset = DEMO_PRESETS.find((preset) => preset.recommended) ?? DEMO_PRESETS[0];

export const directoryReplayRaw = `
Agent output:
\`\`\`json
[
  {
    "company_name": "Northbridge Growth",
    "website_url": "https://www.northbridgegrowth.co.uk",
    "directory_url": "https://clutch.co/profile/northbridge-growth",
    "location": "London, UK",
    "short_description": "B2B SaaS growth marketing agency for revenue teams.",
    "primary_service": "Digital marketing",
    "employee_range": "11-50",
    "rating": 4.9,
    "listing_facts": ["Mentions B2B SaaS growth", "London-based agency"],
    "evidence_snippet": "B2B SaaS growth marketing for ambitious revenue teams",
    "quality_notes": []
  },
  {
    "company_name": "Harbor Loop Studio",
    "website_url": "harborloop.io",
    "directory_url": "https://clutch.co/profile/harbor-loop-studio",
    "location": "London, UK",
    "short_description": "SEO and content partner for B2B software brands.",
    "primary_service": "Digital marketing",
    "employee_range": "11-50",
    "rating": 4.7,
    "listing_facts": ["Visible SEO and B2B wording", "London location visible"],
    "evidence_snippet": "SEO and content programs for B2B software brands",
    "quality_notes": ["Website URL was normalized from a bare domain string."]
  }
]
\`\`\`
`;

export const websiteReplaySuccessRaw = {
  summary: "Northbridge Growth is a London agency focused on B2B SaaS demand generation.",
  services: ["Demand generation", "Paid social", "Lifecycle marketing"],
  emails: ["hello@northbridgegrowth.co.uk"],
  contact_page_url: "https://www.northbridgegrowth.co.uk/contact",
  about_page_url: "https://www.northbridgegrowth.co.uk/about",
  team_page_url: "https://www.northbridgegrowth.co.uk/team",
  team: [
    { name: "Maya Ellis", role: "Founder" },
    { name: "Sam Rowe", role: "Growth Director" }
  ],
  evidence: [
    {
      kind: "homepage",
      source_url: "https://www.northbridgegrowth.co.uk",
      source_label: "homepage",
      title: "Homepage positioning",
      summary: "Homepage positions the agency around B2B SaaS demand generation.",
      snippet: "Demand generation for B2B SaaS teams",
      confidence: "high",
      quality_note: null
    },
    {
      kind: "contact_page",
      source_url: "https://www.northbridgegrowth.co.uk/contact",
      source_label: "contact page",
      title: "Visible contact email",
      summary: "A public email address is visible on the contact page.",
      snippet: "hello@northbridgegrowth.co.uk",
      confidence: "high",
      quality_note: null
    }
  ],
  page_findings: [
    {
      kind: "homepage",
      source_url: "https://www.northbridgegrowth.co.uk",
      source_label: "homepage",
      findings: ["B2B SaaS specialist", "Offers demand generation programs"],
      missing_fields: [],
      uncertain_fields: [],
      quality_notes: []
    }
  ],
  missing_fields: [],
  uncertain_fields: [],
  quality_notes: []
};

export const websiteReplayPartialRaw = `
The page review completed. JSON result below.
{
  "summary": "Harbor Loop Studio is a London digital agency serving B2B software brands.",
  "services": ["SEO", "Content strategy"],
  "emails": [],
  "contact_page_url": "https://harborloop.io/contact",
  "about_page_url": null,
  "team_page_url": null,
  "team": [
    { "name": "Jordan Vale", "role": "Managing Director" }
  ],
  "evidence": [
    {
      "kind": "homepage",
      "source_url": "https://harborloop.io",
      "source_label": "homepage",
      "title": "Homepage positioning",
      "summary": "Homepage references B2B software growth work.",
      "snippet": "SEO and content programs for B2B software brands",
      "confidence": "medium",
      "quality_note": "No explicit email was visible."
    }
  ],
  "page_findings": [
    {
      "kind": "homepage",
      "source_url": "https://harborloop.io",
      "source_label": "homepage",
      "findings": ["Mentions B2B software growth programs"],
      "missing_fields": [],
      "uncertain_fields": ["decision-maker relevance"],
      "quality_notes": []
    }
  ],
  "missing_fields": ["emails", "about_page_url", "team_page_url"],
  "uncertain_fields": ["decision-maker relevance"],
  "quality_notes": ["Only one leadership profile was visible on the site."]
}
`;

export const websiteReplayFailedRaw = "I could not access the site and do not have structured results.";

export const sampleRunReplayFixture = {
  id: "recommended-live-replay",
  presetId: recommendedPreset.id,
  input: recommendedPreset.input,
  mode: "live",
  directoryRaw: directoryReplayRaw,
  websiteRaws: [websiteReplaySuccessRaw, websiteReplayPartialRaw],
  expectations: {
    expectedLeadCount: 2,
    minimumQualifiedLeads: 1,
    expectedPartialLeadCount: 1,
  },
};

export const smokeFixtureMap = {
  "directory-replay.json": { raw: directoryReplayRaw },
  "website-live-success.json": { raw: websiteReplaySuccessRaw },
  "website-live-partial.json": { raw: websiteReplayPartialRaw },
  "website-live-failed.json": { raw: websiteReplayFailedRaw },
  "sample-run-replay.json": sampleRunReplayFixture,
};
