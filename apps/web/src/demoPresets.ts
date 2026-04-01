import type { IcpInput } from "@revon-tinyfish/contracts";

export interface DemoPreset {
  id: string;
  label: string;
  note: string;
  experimentLabel: string;
  recommended?: boolean;
  input: IcpInput;
}

export const DEMO_PRESETS: DemoPreset[] = [
  {
    id: "uk-digital-agencies",
    label: "UK B2B agencies",
    note: "Recommended live demo path",
    experimentLabel: "q2_uk_digital_agencies",
    recommended: true,
    input: {
      targetMarket: "B2B agencies",
      location: "United Kingdom",
      companySize: "any",
      keywords: "B2B, performance marketing, lead generation, growth",
      decisionMakerRole: "Founder",
      maxResults: 5,
    },
  },
  {
    id: "demo-mode",
    label: "Demo mode",
    note: "Broadest live showcase preset",
    experimentLabel: "demo_mode_broad_market",
    input: {
      targetMarket: "B2B agencies",
      location: "United Kingdom",
      companySize: "any",
      keywords: "B2B, agency, lead generation, growth, marketing",
      decisionMakerRole: "Founder",
      maxResults: 5,
    },
  },
  {
    id: "dach-b2b-saas-hiring",
    label: "DACH B2B SaaS - hiring sales",
    note: "Expansion-stage hiring signal",
    experimentLabel: "q2_dach_saas_sales_hiring",
    input: {
      targetMarket: "B2B SaaS",
      location: "DACH region",
      companySize: "51-200",
      keywords: "outbound sales, hiring SDR, pipeline growth",
      decisionMakerRole: "VP Sales",
      maxResults: 5,
    },
  },
  {
    id: "us-telehealth-expansion",
    label: "US telehealth expansion",
    note: "High-intent infrastructure spend",
    experimentLabel: "q2_us_telehealth_expansion",
    input: {
      targetMarket: "Healthcare providers",
      location: "United States",
      companySize: "51-200",
      keywords: "telehealth, patient portal, digital health expansion",
      decisionMakerRole: "CTO",
      maxResults: 4,
    },
  },
];

export const DEFAULT_DEMO_INPUT: IcpInput = DEMO_PRESETS[0]?.input ?? {
  targetMarket: "Digital marketing agencies",
  location: "United Kingdom",
  companySize: "11-50",
  keywords: "B2B clients, performance marketing, paid media",
  decisionMakerRole: "Marketing Director",
  maxResults: 5,
};
