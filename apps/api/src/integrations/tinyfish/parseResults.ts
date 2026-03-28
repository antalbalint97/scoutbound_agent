import {
  createEmptyWebsiteInspection,
  directoryCandidateSchema,
  inspectionEvidenceSchema,
  type DirectoryCandidate,
  type WebsiteInspection,
} from "../../domain/leads/schemas.js";

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function coerceString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function coerceNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const numeric = Number.parseFloat(value);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
  }
  return null;
}

function coerceUrl(value: unknown): string | null {
  const raw = coerceString(value);
  if (!raw) {
    return null;
  }

  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    return new URL(withProtocol).toString();
  } catch {
    return null;
  }
}

function coerceStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => coerceString(item))
    .filter(Boolean);
}

function stripCodeFences(text: string): string {
  return text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function extractBalancedJson(text: string): string | null {
  const startIndex = [...text].findIndex((character) => character === "{" || character === "[");
  if (startIndex < 0) {
    return null;
  }

  const opening = text[startIndex];
  const closing = opening === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaping = false;

  for (let index = startIndex; index < text.length; index += 1) {
    const character = text[index];

    if (escaping) {
      escaping = false;
      continue;
    }

    if (character === "\\") {
      escaping = true;
      continue;
    }

    if (character === "\"") {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (character === opening) {
      depth += 1;
    } else if (character === closing) {
      depth -= 1;
      if (depth === 0) {
        return text.slice(startIndex, index + 1);
      }
    }
  }

  return null;
}

function repairJsonText(text: string): { value: unknown; repairNotes: string[] } {
  const candidates = [
    { text: text.trim(), note: null },
    { text: stripCodeFences(text), note: "TinyFish returned fenced JSON. Fence repair was applied." },
    {
      text: extractBalancedJson(stripCodeFences(text)) ?? "",
      note: "TinyFish returned wrapped JSON. Embedded JSON was extracted.",
    },
  ];

  for (const candidate of candidates) {
    if (!candidate.text) {
      continue;
    }
    try {
      return {
        value: JSON.parse(candidate.text),
        repairNotes: candidate.note ? [candidate.note] : [],
      };
    } catch {
      // Continue to the next repair strategy.
    }
  }

  return {
    value: text,
    repairNotes: ["TinyFish returned non-JSON text that could not be repaired safely."],
  };
}

function normalizeRawResult(raw: unknown): { value: unknown; repairNotes: string[] } {
  if (typeof raw === "string") {
    return repairJsonText(raw);
  }
  return { value: raw, repairNotes: [] };
}

function findFirstArray(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  const objectValue = asObject(value);
  if (!objectValue) {
    return [];
  }

  if (Array.isArray(objectValue.results)) {
    return objectValue.results;
  }
  if (Array.isArray(objectValue.items)) {
    return objectValue.items;
  }
  if (Array.isArray(objectValue.companies)) {
    return objectValue.companies;
  }

  const firstArray = Object.values(objectValue).find((entry) => Array.isArray(entry));
  return Array.isArray(firstArray) ? firstArray : [];
}

function coerceEvidenceArray(value: unknown): Array<{
  kind: "directory_listing" | "homepage" | "contact_page" | "about_page" | "team_page" | "footer" | "other";
  sourceUrl: string;
  sourceLabel: string;
  title: string;
  summary: string;
  snippet: string | null;
  confidence: "high" | "medium" | "low";
  qualityNote: string | null;
}> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      const objectValue = asObject(entry);
      if (!objectValue) {
        return null;
      }

      const sourceUrl = coerceUrl(objectValue.source_url ?? objectValue.sourceUrl ?? objectValue.url);
      if (!sourceUrl) {
        return null;
      }

      const kindRaw = coerceString(objectValue.kind).toLowerCase();
      const kind = [
        "directory_listing",
        "homepage",
        "contact_page",
        "about_page",
        "team_page",
        "footer",
        "other",
      ].includes(kindRaw)
        ? (kindRaw as
            | "directory_listing"
            | "homepage"
            | "contact_page"
            | "about_page"
            | "team_page"
            | "footer"
            | "other")
        : "other";

      const confidenceRaw = coerceString(objectValue.confidence).toLowerCase();
      const confidence = ["high", "medium", "low"].includes(confidenceRaw)
        ? (confidenceRaw as "high" | "medium" | "low")
        : "medium";

      return inspectionEvidenceSchema.parse({
        kind,
        sourceUrl,
        sourceLabel: coerceString(objectValue.source_label ?? objectValue.sourceLabel),
        title: coerceString(objectValue.title) || "TinyFish evidence",
        summary: coerceString(objectValue.summary),
        snippet: coerceString(objectValue.snippet ?? objectValue.quote) || null,
        confidence,
        qualityNote: coerceString(objectValue.quality_note ?? objectValue.qualityNote) || null,
      });
    })
    .filter(
      (
        item,
      ): item is {
        kind: "directory_listing" | "homepage" | "contact_page" | "about_page" | "team_page" | "footer" | "other";
        sourceUrl: string;
        sourceLabel: string;
        title: string;
        summary: string;
        snippet: string | null;
        confidence: "high" | "medium" | "low";
        qualityNote: string | null;
      } => Boolean(item),
    );
}

export interface DirectoryParseResult {
  candidates: DirectoryCandidate[];
  warnings: string[];
}

export function parseDirectoryCandidates(raw: unknown): DirectoryParseResult {
  const normalized = normalizeRawResult(raw);
  const entries = findFirstArray(normalized.value);
  let droppedEntries = 0;

  const candidates = entries
    .map((entry) => {
      const objectValue = asObject(entry);
      if (!objectValue) {
        droppedEntries += 1;
        return null;
      }

      const candidate = {
        companyName: coerceString(objectValue.company_name ?? objectValue.companyName ?? objectValue.name),
        websiteUrl: coerceUrl(objectValue.website_url ?? objectValue.websiteUrl ?? objectValue.site_url),
        directoryUrl: coerceUrl(
          objectValue.directory_url ?? objectValue.directoryUrl ?? objectValue.profile_url ?? objectValue.profileUrl,
        ),
        location: coerceString(objectValue.location),
        shortDescription: coerceString(
          objectValue.short_description ?? objectValue.shortDescription ?? objectValue.description,
        ),
        primaryService: coerceString(
          objectValue.primary_service ?? objectValue.primaryService ?? objectValue.service,
        ),
        employeeRange: coerceString(
          objectValue.employee_range ?? objectValue.employeeRange ?? objectValue.company_size,
        ),
        rating: coerceNumber(objectValue.rating),
        matchReasons: coerceStringArray(
          objectValue.match_reasons ?? objectValue.matchReasons ?? objectValue.why_match,
        ),
        evidenceSnippet:
          coerceString(objectValue.evidence_snippet ?? objectValue.evidenceSnippet ?? objectValue.snippet) || null,
        qualityNotes: coerceStringArray(objectValue.quality_notes ?? objectValue.qualityNotes),
      };

      if (!candidate.companyName || !candidate.websiteUrl) {
        droppedEntries += 1;
        return null;
      }

      return directoryCandidateSchema.parse(candidate);
    })
    .filter((item): item is DirectoryCandidate => Boolean(item));

  const warnings = [...normalized.repairNotes];
  if (entries.length === 0) {
    warnings.push("TinyFish did not return a parseable company list.");
  }
  if (droppedEntries > 0) {
    warnings.push(`Dropped ${droppedEntries} candidate item(s) because required fields were missing.`);
  }

  return {
    candidates,
    warnings,
  };
}

export function parseWebsiteInspection(raw: unknown, websiteUrl: string): WebsiteInspection {
  const normalized = normalizeRawResult(raw);
  const objectValue = asObject(normalized.value) ?? asObject(findFirstArray(normalized.value)[0]);

  if (!objectValue) {
    return createEmptyWebsiteInspection(websiteUrl, {
      qualityNotes: [
        ...normalized.repairNotes,
        "TinyFish returned no parseable website inspection object.",
      ],
    });
  }

  const team = Array.isArray(objectValue.team)
    ? objectValue.team
        .map((member) => {
          const teamMember = asObject(member);
          if (!teamMember) {
            return null;
          }

          const name = coerceString(teamMember.name);
          const role = coerceString(teamMember.role);
          if (!name || !role) {
            return null;
          }

          return { name, role };
        })
        .filter((member): member is { name: string; role: string } => Boolean(member))
    : [];

  const summary = coerceString(objectValue.summary ?? objectValue.company_summary ?? objectValue.description);
  const services = coerceStringArray(objectValue.services);
  const emails = coerceStringArray(objectValue.emails).filter((item) => /@/.test(item));
  const signals = coerceStringArray(objectValue.signals ?? objectValue.buyer_signals);
  const evidence = coerceEvidenceArray(objectValue.evidence);
  const missingFields = coerceStringArray(objectValue.missing_fields ?? objectValue.missingFields);
  const uncertainFields = coerceStringArray(objectValue.uncertain_fields ?? objectValue.uncertainFields);
  const qualityNotes = [
    ...normalized.repairNotes,
    ...coerceStringArray(objectValue.quality_notes ?? objectValue.qualityNotes),
  ];

  if (!summary) {
    missingFields.push("summary");
  }
  if (emails.length === 0) {
    missingFields.push("emails");
  }
  if (team.length === 0) {
    missingFields.push("team");
  }
  if (signals.length === 0) {
    missingFields.push("signals");
  }

  const uniqueMissingFields = [...new Set(missingFields)];
  const uniqueUncertainFields = [...new Set(uncertainFields)];
  const uniqueQualityNotes = [...new Set(qualityNotes)];

  const hasAnyStructuredData =
    Boolean(summary) ||
    services.length > 0 ||
    emails.length > 0 ||
    team.length > 0 ||
    signals.length > 0 ||
    evidence.length > 0;

  const inspectionStatus = !hasAnyStructuredData
    ? "failed"
    : uniqueMissingFields.length >= 2 || uniqueUncertainFields.length > 0 || normalized.repairNotes.length > 0
      ? "partial"
      : "completed";

  return createEmptyWebsiteInspection(websiteUrl, {
    homepageUrl: coerceUrl(objectValue.homepage_url ?? objectValue.homepageUrl ?? websiteUrl) ?? websiteUrl,
    contactPageUrl: coerceUrl(objectValue.contact_page_url ?? objectValue.contactPageUrl),
    aboutPageUrl: coerceUrl(objectValue.about_page_url ?? objectValue.aboutPageUrl),
    teamPageUrl: coerceUrl(objectValue.team_page_url ?? objectValue.teamPageUrl),
    summary,
    services,
    emails,
    team,
    signals,
    evidence,
    inspectionStatus,
    missingFields: uniqueMissingFields,
    uncertainFields: uniqueUncertainFields,
    qualityNotes: uniqueQualityNotes,
  });
}
