import { Check, ListPlus, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { LeadRecord, PushLeadContactSelection } from "@revon-tinyfish/contracts";
import { rankContactsForPush } from "../lib/contactRanking";

interface ZohoContactPickerModalProps {
  open: boolean;
  leads: LeadRecord[];
  selectedLeadIds: string[];
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: (selections: PushLeadContactSelection[]) => Promise<void> | void;
}

function buildInitialSelection(leads: LeadRecord[]): Record<string, string[]> {
  return Object.fromEntries(
    leads.flatMap((lead) => {
      if (lead.contacts.length === 0) {
        return [];
      }

      const ranked = rankContactsForPush(lead.contacts);
      const recommended = ranked[0]?.id ?? lead.contacts[0]?.id;
      return recommended ? [[lead.id, [recommended]]] : [];
    }),
  );
}

export function ZohoContactPickerModal({
  open,
  leads,
  selectedLeadIds,
  isSubmitting,
  onCancel,
  onConfirm,
}: ZohoContactPickerModalProps) {
  const selectedLeads = useMemo(
    () => leads.filter((lead) => selectedLeadIds.includes(lead.id)),
    [leads, selectedLeadIds],
  );
  const [selectedByLead, setSelectedByLead] = useState<Record<string, string[]>>({});

  useEffect(() => {
    if (!open) {
      return;
    }

    setSelectedByLead(buildInitialSelection(selectedLeads));
  }, [open, selectedLeads]);

  if (!open) {
    return null;
  }

  const totalSelectedContacts = selectedLeads.reduce(
    (total, lead) => total + (selectedByLead[lead.id]?.length ?? 0),
    0,
  );
  const estimatedRecords = selectedLeads.reduce((total, lead) => {
    if (lead.contacts.length === 0) {
      return total + 1;
    }
    return total + Math.max(selectedByLead[lead.id]?.length ?? 0, 1);
  }, 0);
  const invalidLeads = selectedLeads.filter((lead) => lead.contacts.length > 0 && (selectedByLead[lead.id]?.length ?? 0) === 0);

  function toggleContact(leadId: string, contactId: string) {
    setSelectedByLead((current) => {
      const existing = new Set(current[leadId] ?? []);
      if (existing.has(contactId)) {
        existing.delete(contactId);
      } else {
        existing.add(contactId);
      }
      return {
        ...current,
        [leadId]: [...existing],
      };
    });
  }

  function selectRecommended(lead: LeadRecord) {
    const ranked = rankContactsForPush(lead.contacts);
    const recommended = ranked[0]?.id ?? lead.contacts[0]?.id;
    if (!recommended) {
      return;
    }
    setSelectedByLead((current) => ({
      ...current,
      [lead.id]: [recommended],
    }));
  }

  function selectAll(lead: LeadRecord) {
    setSelectedByLead((current) => ({
      ...current,
      [lead.id]: lead.contacts.map((contact) => contact.id),
    }));
  }

  function clearSelection(leadId: string) {
    setSelectedByLead((current) => ({
      ...current,
      [leadId]: [],
    }));
  }

  async function handleConfirm() {
    const selections: PushLeadContactSelection[] = selectedLeads
      .filter((lead) => lead.contacts.length > 0)
      .map((lead) => ({
        leadId: lead.id,
        contactIds: selectedByLead[lead.id] ?? [],
      }));

    await onConfirm(selections);
  }

  return (
    <div className="zoho-picker-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="zoho-picker-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="zoho-contact-picker-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="zoho-picker-header">
          <div>
            <p className="eyebrow">CRM sync review</p>
            <h3 id="zoho-contact-picker-title">Choose which contacts go to Zoho</h3>
            <p className="muted">
              We preselect the strongest contact on each company, but you can add or remove people before sync.
            </p>
          </div>
          <button className="icon-button" type="button" onClick={onCancel} aria-label="Close contact picker">
            <X size={18} />
          </button>
        </div>

        <div className="zoho-picker-summary">
          <div>
            <span className="summary-card-label">Selected leads</span>
            <strong>{selectedLeads.length}</strong>
          </div>
          <div>
            <span className="summary-card-label">Selected contacts</span>
            <strong>{totalSelectedContacts}</strong>
          </div>
          <div>
            <span className="summary-card-label">Estimated CRM records</span>
            <strong>{estimatedRecords}</strong>
          </div>
        </div>

        <div className="zoho-picker-body">
          {selectedLeads.map((lead) => {
            const rankedContacts = rankContactsForPush(lead.contacts);
            const selectedIds = new Set(selectedByLead[lead.id] ?? []);
            const hasContacts = lead.contacts.length > 0;
            const selectedCount = selectedIds.size;
            const recommendedId = rankedContacts[0]?.id ?? null;

            return (
              <section className="zoho-picker-lead" key={lead.id}>
                <div className="zoho-picker-lead-header">
                  <div>
                    <h4>{lead.companyName}</h4>
                    <p>{lead.companyDomain}</p>
                  </div>
                  <div className="zoho-picker-lead-actions">
                    {hasContacts ? (
                      <>
                        <button className="secondary-button tiny" type="button" onClick={() => selectRecommended(lead)}>
                          <Sparkles size={14} />
                          Suggested
                        </button>
                        <button className="secondary-button tiny" type="button" onClick={() => selectAll(lead)}>
                          <ListPlus size={14} />
                          All
                        </button>
                        <button className="secondary-button tiny" type="button" onClick={() => clearSelection(lead.id)}>
                          Clear
                        </button>
                      </>
                    ) : (
                      <span className="status-pill" style={{ background: "var(--bg-muted)", color: "var(--text-secondary)" }}>
                        No contacts found
                      </span>
                    )}
                  </div>
                </div>

                {hasContacts ? (
                  <>
                    <div className="zoho-picker-lead-meta">
                      <span className="count-chip count-chip-selected">
                        {selectedCount} of {lead.contacts.length} selected
                      </span>
                      {invalidLeads.some((item) => item.id === lead.id) ? (
                        <span className="status-pill" style={{ background: "rgba(255, 170, 0, 0.12)", color: "var(--warning)" }}>
                          Pick at least one contact
                        </span>
                      ) : null}
                    </div>

                    <div className="zoho-picker-contacts">
                      {rankedContacts.map((contact) => {
                        const selected = selectedIds.has(contact.id);
                        const recommended = recommendedId === contact.id;

                        return (
                          <button
                            key={contact.id}
                            className={`zoho-contact-row ${selected ? "selected" : ""}`}
                            type="button"
                            onClick={() => toggleContact(lead.id, contact.id)}
                          >
                            <div className="zoho-contact-row-main">
                              <span className={`zoho-contact-checkbox ${selected ? "selected" : ""}`}>
                                {selected ? <Check size={12} /> : null}
                              </span>
                              <div>
                                <div className="zoho-contact-name">
                                  {contact.name}
                                  {recommended ? (
                                    <span className="status-pill" style={{ marginLeft: 8, background: "rgba(23, 92, 255, 0.12)", color: "var(--brand-primary)" }}>
                                      Recommended
                                    </span>
                                  ) : null}
                                  {contact.isDecisionMaker ? (
                                    <span className="status-pill" style={{ marginLeft: 8, background: "rgba(14, 172, 105, 0.12)", color: "var(--success)" }}>
                                      Decision maker
                                    </span>
                                  ) : null}
                                </div>
                                <p className="zoho-contact-role">
                                  {contact.role || "No role captured"}
                                </p>
                              </div>
                            </div>

                            <div className="zoho-contact-row-meta">
                              {contact.email ? <span className="count-chip count-chip-qualified">Email</span> : null}
                              {contact.linkedinUrl ? <span className="count-chip count-chip-total">LinkedIn</span> : null}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <div className="empty-state compact-empty">
                    <p className="empty-state-title">No direct contact data captured</p>
                    <p>This company will still sync as a company-level lead record.</p>
                  </div>
                )}
              </section>
            );
          })}
        </div>

        <div className="zoho-picker-footer">
          <div className="muted">
            {invalidLeads.length > 0
              ? "Every company with contacts needs at least one selected contact."
              : "Confirmed contacts will be sent to Zoho as lead records."}
          </div>
          <div className="zoho-picker-footer-actions">
            <button className="secondary-button" type="button" onClick={onCancel} disabled={isSubmitting}>
              Cancel
            </button>
            <button className="primary-button" type="button" onClick={() => void handleConfirm()} disabled={isSubmitting || invalidLeads.length > 0}>
              {isSubmitting ? "Syncing..." : `Push ${estimatedRecords} CRM record${estimatedRecords !== 1 ? "s" : ""}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

