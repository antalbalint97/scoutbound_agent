import type { LeadRecord } from "@revon-tinyfish/contracts";

export interface ZohoLead {
  Last_Name: string;
  First_Name?: string;
  Company: string;
  Email?: string;
  Title?: string;
  Website?: string;
  Lead_Source?: string;
  Description?: string;
  [key: string]: unknown;
}

function splitName(fullName: string): { First_Name?: string; Last_Name: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) {
    return { Last_Name: parts[0]! };
  }
  const last = parts.pop()!;
  return { First_Name: parts.join(" "), Last_Name: last };
}

function buildSharedFields(lead: LeadRecord): Pick<ZohoLead, "Company" | "Website" | "Lead_Source" | "Description"> {
  const description = [
    lead.summary,
    lead.score.reasons.length > 0 ? `Qualification reasons: ${lead.score.reasons.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  const result: Pick<ZohoLead, "Company" | "Website" | "Lead_Source" | "Description"> = {
    Company: lead.companyName || lead.companyDomain || "Unknown Company",
    Lead_Source: "Scoutbound",
  };

  if (lead.websiteUrl) {
    result.Website = lead.websiteUrl;
  }

  if (description) {
    result.Description = description;
  }

  return result;
}

export function mapLeadToZohoRecords(lead: LeadRecord): ZohoLead[] {
  const shared = buildSharedFields(lead);

  if (lead.contacts.length === 0) {
    return [
      {
        Last_Name: lead.companyName || lead.companyDomain || "Unknown",
        ...shared,
      },
    ];
  }

  return lead.contacts.map((contact) => {
    const nameParts = contact.name ? splitName(contact.name) : { Last_Name: lead.companyName || "Unknown" };
    const record: ZohoLead = { ...nameParts, ...shared };

    if (contact.email) {
      record.Email = contact.email;
    }
    if (contact.role) {
      record.Title = contact.role;
    }

    return record;
  });
}
