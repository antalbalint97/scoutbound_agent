import type { LeadRecord, RevonWebhookLead } from "@revon-tinyfish/contracts";

export function mapLeadToRevonRecords(lead: LeadRecord): RevonWebhookLead[] {
  if (lead.contacts.length === 0) {
    return [
      {
        company: lead.companyName,
        company_domain: lead.companyDomain,
        website: lead.websiteUrl,
        source_ref: `tinyfish:${lead.id}`,
        raw_payload: {
          summary: lead.summary,
          services: lead.services,
          evidence: lead.evidence,
          score: lead.score,
        },
      },
    ];
  }

  return lead.contacts.map((contact) => ({
    ...(contact.email ? { email: contact.email } : {}),
    full_name: contact.name,
    job_title: contact.role,
    company: lead.companyName,
    company_domain: lead.companyDomain,
    website: lead.websiteUrl,
    source_ref: `tinyfish:${lead.id}:${contact.id}`,
    raw_payload: {
      summary: lead.summary,
      services: lead.services,
      evidence: lead.evidence,
      score: lead.score,
      is_decision_maker: contact.isDecisionMaker,
    },
  }));
}
