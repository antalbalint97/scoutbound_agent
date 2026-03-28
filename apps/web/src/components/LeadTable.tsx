import type { LeadRecord } from "@revon-tinyfish/contracts";

interface LeadTableProps {
  leads: LeadRecord[];
  selectedLeadId: string | null;
  onSelect: (leadId: string) => void;
}

export function LeadTable({ leads, selectedLeadId, onSelect }: LeadTableProps) {
  if (leads.length === 0) {
    return (
      <section className="panel">
        <div className="panel-header compact">
          <p className="eyebrow">Ranked output</p>
          <h2>Lead shortlist</h2>
        </div>
        <p className="muted">
          Results will appear here once the TinyFish run finishes ranking candidate leads.
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
          return (
            <button
              className={`lead-card ${isSelected ? "selected" : ""}`}
              key={lead.id}
              onClick={() => onSelect(lead.id)}
              type="button"
            >
              <div className="lead-card-top">
                <div>
                  <h3>{lead.companyName}</h3>
                  <p>{lead.companyDomain}</p>
                </div>
                <span className={`priority-badge priority-${lead.score.priority}`}>
                  {lead.score.priority}
                </span>
              </div>

              <p className="lead-summary">{lead.summary || "No website summary captured."}</p>

              <div className="score-row">
                <span>Fit {lead.score.fitScore}</span>
                <span>Contact {lead.score.contactabilityScore}</span>
                <span>{lead.contacts.length} contacts</span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
