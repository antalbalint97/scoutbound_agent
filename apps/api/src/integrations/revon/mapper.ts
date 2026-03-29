import {
  revonLeadRawPayloadSchema,
  type LeadRecord,
  type RevonWebhookLead,
} from "@revon-tinyfish/contracts";

function buildRawPayload(lead: LeadRecord, isDecisionMaker?: boolean) {
  return revonLeadRawPayloadSchema.parse({
    agent_session_id: lead.agentContext.agentSessionId,
    correlation_id: lead.agentContext.correlationId,
    tinyfish_run_ids: lead.agentContext.tinyfishRunIds,
    capture_mode: lead.captureMode,
    inspection_status: lead.inspectionStatus,
    qualification_state: lead.score.qualificationState,
    qualification_reasons: lead.score.reasons,
    evidence_sources: lead.evidence.map((item) => ({
      kind: item.kind,
      source_url: item.sourceUrl,
      source_label: item.sourceLabel,
      title: item.title,
      confidence: item.confidence,
    })),
    field_confidence: lead.fieldAssessments.map((assessment) => ({
      field: assessment.field,
      status: assessment.status,
      confidence: assessment.confidence,
      source_urls: assessment.sourceUrls,
      notes: assessment.notes,
    })),
    uncertainty: {
      missing_fields: lead.rawExtraction.website.missingFields,
      uncertain_fields: lead.rawExtraction.website.uncertainFields,
      quality_notes: lead.qualityNotes,
    },
    raw_extraction: lead.rawExtraction,
    score: lead.score,
    summary: lead.summary,
    services: lead.services,
    ...(typeof isDecisionMaker === "boolean" ? { is_decision_maker: isDecisionMaker } : {}),
  });
}

export function mapLeadToRevonRecords(lead: LeadRecord): RevonWebhookLead[] {
  if (lead.contacts.length === 0) {
    return [
      {
        company: lead.companyName,
        company_domain: lead.companyDomain,
        website: lead.websiteUrl,
        source_ref: `tinyfish:${lead.id}`,
        agent_session_id: lead.agentContext.agentSessionId,
        tinyfish_run_ids: lead.agentContext.tinyfishRunIds,
        capture_mode: lead.captureMode,
        inspection_status: lead.inspectionStatus,
        qualification_state: lead.score.qualificationState,
        raw_payload: buildRawPayload(lead),
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
    agent_session_id: lead.agentContext.agentSessionId,
    tinyfish_run_ids: lead.agentContext.tinyfishRunIds,
    capture_mode: lead.captureMode,
    inspection_status: lead.inspectionStatus,
    qualification_state: lead.score.qualificationState,
    raw_payload: buildRawPayload(lead, contact.isDecisionMaker),
  }));
}
