import type { LeadRecord } from "@revon-tinyfish/contracts";

interface LeadTableProps {
  leads: Array<LeadRecord & { revonStatusLabel?: string }>;
  selectedLeadId: string | null;
  onSelect: (leadId: string) => void;
  selectedLeadIds?: string[] | undefined;
  onToggleLeadSelection?: ((leadId: string) => void) | undefined;
}

export function LeadTable({
  leads,
  selectedLeadId,
  onSelect,
  selectedLeadIds,
  onToggleLeadSelection,
}: LeadTableProps) {
  if (leads.length === 0) {
    return (
      <section className="panel">
        <div className="panel-header compact">
          <p className="eyebrow">Ranked output</p>
          <h2>Lead shortlist</h2>
        </div>
        <p className="muted">
          Results will appear here incrementally as TinyFish inspection jobs complete and Revon reranks the shortlist.
        </p>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="panel-header compact">
        <p className="eyebrow">Ranked output</p>
        <h2>Lead shortlist</h2>
      </div>

      <div className="lead-list">
        {leads.map((lead) => {
          const isSelected = selectedLeadId === lead.id;
          const isChecked = selectedLeadIds?.includes(lead.id) ?? false;
          return (
            <button
              className={`lead-card ${isSelected ? "selected" : ""}`}
              key={lead.id}
              onClick={() => onSelect(lead.id)}
              type="button"
            >
              <div className="lead-card-top">
                <div>
                  {onToggleLeadSelection ? (
                    <label
                      className="lead-checkbox"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <input
                        checked={isChecked}
                        onChange={() => onToggleLeadSelection(lead.id)}
                        type="checkbox"
                      />
                      <span>Select</span>
                    </label>
                  ) : null}
                  <h3>{lead.companyName}</h3>
                  <p>{lead.companyDomain}</p>
                </div>
                <span className={`priority-badge priority-${lead.score.priority}`}>
                  {lead.score.priority}
                </span>
              </div>

              <p className="lead-summary">{lead.summary || "No website summary captured."}</p>

              <div className="meta-row">
                <span>{lead.captureMode === "live" ? "live" : "mock"}</span>
                <span>{lead.inspectionStatus}</span>
                <span>{lead.score.qualificationState}</span>
                <span>{lead.score.confidence} confidence</span>
                {lead.revonStatusLabel ? <span>{lead.revonStatusLabel}</span> : null}
              </div>

              <div className="score-row">
                <span>Fit {lead.score.fitScore}</span>
                <span>Contact {lead.score.contactabilityScore}</span>
                <span>Quality {lead.score.qualityScore}</span>
                <span>{lead.contacts.length} contacts</span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
