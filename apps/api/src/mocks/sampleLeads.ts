import type { IcpInput } from "@revon-tinyfish/contracts";
import type { DirectoryCandidate, WebsiteInspection } from "../domain/leads/schemas.js";
import { directoryCandidateSchema, websiteInspectionSchema } from "../domain/leads/schemas.js";

const MOCK_NAMES = [
  "Northwind Growth Studio",
  "Harbor Signal Labs",
  "Summit Thread Digital",
  "Forgepath Collective",
  "Meridian Launch Partners",
  "Brightline Systems",
];

const MOCK_DOMAINS = [
  "northwindgrowth.example",
  "harborsignal.example",
  "summitthread.example",
  "forgepath.example",
  "meridianlaunch.example",
  "brightlinesystems.example",
];

export function createMockDirectoryDiscovery(input: IcpInput): {
  directoryUrl: string;
  candidates: DirectoryCandidate[];
  warnings: string[];
} {
  const candidates = Array.from({ length: input.maxResults }, (_, index) => {
    const name = MOCK_NAMES[index % MOCK_NAMES.length] ?? `Demo Company ${index + 1}`;
    const domain = MOCK_DOMAINS[index % MOCK_DOMAINS.length] ?? `demo-company-${index + 1}.example`;

    return directoryCandidateSchema.parse({
      companyName: name,
      websiteUrl: `https://${domain}`,
      directoryUrl: `https://clutch.co/profile/${domain.replace(/\./g, "-")}`,
      location: input.location,
      shortDescription: `${name} helps ${input.targetMarket} teams build pipeline systems and conversion experiments.`,
      primaryService: input.targetMarket,
      employeeRange: input.companySize === "any" ? "11-50" : input.companySize,
      rating: 4.7,
    });
  });

  return {
    directoryUrl: "https://clutch.co/agencies",
    candidates,
    warnings: [],
  };
}

export function createMockWebsiteInspection(
  candidate: DirectoryCandidate,
  input: IcpInput,
  index: number,
): WebsiteInspection {
  const domain = candidate.websiteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return websiteInspectionSchema.parse({
    homepageUrl: candidate.websiteUrl,
    contactPageUrl: `${candidate.websiteUrl}/contact`,
    aboutPageUrl: `${candidate.websiteUrl}/about`,
    teamPageUrl: `${candidate.websiteUrl}/team`,
    summary: `${candidate.companyName} delivers ${input.targetMarket} programs for ${input.location} teams that need faster lead flow.`,
    services: [input.targetMarket, "Revenue ops", "Outbound experiments"],
    emails: [`hello@${domain}`, `founder@${domain}`],
    team: [
      { name: `Alex Mercer ${index + 1}`, role: "Founder" },
      { name: `Jordan Blake ${index + 1}`, role: input.decisionMakerRole },
    ],
    signals: [
      `${input.targetMarket} offer is positioned on the homepage`,
      "Dedicated contact page and named leadership team available",
      input.keywords || "Fast-moving B2B growth programs highlighted",
    ],
  });
}
