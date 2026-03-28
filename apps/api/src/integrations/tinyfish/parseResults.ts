import {
  createEmptyWebsiteInspection,
  directoryCandidateSchema,
  type DirectoryCandidate,
  websiteInspectionSchema,
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

  const firstArray = Object.values(objectValue).find((entry) => Array.isArray(entry));
  return Array.isArray(firstArray) ? firstArray : [];
}

export function parseDirectoryCandidates(raw: unknown): DirectoryCandidate[] {
  return findFirstArray(raw)
    .map((entry) => {
      const objectValue = asObject(entry);
      if (!objectValue) {
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
      };

      if (!candidate.companyName || !candidate.websiteUrl) {
        return null;
      }

      return directoryCandidateSchema.parse(candidate);
    })
    .filter((item): item is DirectoryCandidate => Boolean(item));
}

export function parseWebsiteInspection(raw: unknown, websiteUrl: string): WebsiteInspection {
  const objectValue = asObject(raw) ?? asObject(findFirstArray(raw)[0]) ?? {};

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

  return websiteInspectionSchema.parse({
    ...createEmptyWebsiteInspection(websiteUrl),
    homepageUrl: coerceUrl(objectValue.homepage_url ?? objectValue.homepageUrl ?? websiteUrl) ?? websiteUrl,
    contactPageUrl: coerceUrl(objectValue.contact_page_url ?? objectValue.contactPageUrl),
    aboutPageUrl: coerceUrl(objectValue.about_page_url ?? objectValue.aboutPageUrl),
    teamPageUrl: coerceUrl(objectValue.team_page_url ?? objectValue.teamPageUrl),
    summary: coerceString(objectValue.summary ?? objectValue.description),
    services: coerceStringArray(objectValue.services),
    emails: coerceStringArray(objectValue.emails).filter((item) => /@/.test(item)),
    team,
    signals: coerceStringArray(objectValue.signals),
  });
}
