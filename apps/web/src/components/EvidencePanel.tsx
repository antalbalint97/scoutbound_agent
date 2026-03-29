import type { LeadRecord } from "@revon-tinyfish/contracts";

interface EvidencePanelProps {
  lead: LeadRecord | null;
}

export function EvidencePanel({ lead }: EvidencePanelProps) {
  return (
    <section className="panel evidence-panel">
      <div className="panel-header compact">
        <p className="eyebrow">Proof layer</p>
        <h2>Evidence and contacts</h2>
      </div>

      {!lead ? (
        <p className="muted">Select a lead to inspect the sites TinyFish opened and what it found.</p>
      ) : (
        <>
          <div className="evidence-section">
            <h3>{lead.companyName}</h3>
            <p>{lead.summary}</p>
            <p className="muted">
              Capture mode: {lead.captureMode} | Inspection: {lead.inspectionStatus} | Score
              confidence: {lead.score.confidence} | Qualification: {lead.score.qualificationState}
            </p>
            <p className="muted">
              Total {lead.score.totalScore} | Fit {lead.score.fitScore} | Contact {lead.score.contactabilityScore} |
              Quality {lead.score.qualityScore} | Decision-maker {lead.score.decisionMakerScore}
            </p>
          </div>

          <div className="evidence-section">
            <h4>Why it ranked here</h4>
            <ul className="stack-list">
              {lead.score.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>

          <div className="evidence-section">
            <h4>Score breakdown</h4>
            <ul className="stack-list">
              <li>
                <strong>Fit</strong> | {lead.score.explanations.fit.score}
                <p>{lead.score.explanations.fit.summary}</p>
              </li>
              <li>
                <strong>Contactability</strong> | {lead.score.explanations.contactability.score}
                <p>{lead.score.explanations.contactability.summary}</p>
              </li>
              <li>
                <strong>Quality</strong> | {lead.score.explanations.quality.score}
                <p>{lead.score.explanations.quality.summary}</p>
              </li>
              <li>
                <strong>Decision-maker</strong> | {lead.score.explanations.decisionMaker.score}
                <p>{lead.score.explanations.decisionMaker.summary}</p>
              </li>
            </ul>
          </div>

          {lead.qualityNotes.length > 0 ? (
            <div className="evidence-section">
              <h4>Quality notes</h4>
              <ul className="stack-list">
                {lead.qualityNotes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="evidence-section">
            <h4>Detected contacts</h4>
            {lead.contacts.length === 0 ? (
              <p className="muted">No named contacts were extracted from the visible website pages.</p>
            ) : (
              <ul className="stack-list">
                {lead.contacts.map((contact) => (
                  <li key={contact.id}>
                    <strong>{contact.name}</strong> | {contact.role}
                    {contact.email ? ` | ${contact.email}` : ""}
                    {contact.isDecisionMaker ? " | decision-maker" : ""}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="evidence-section">
            <h4>Visited sources</h4>
            <ul className="stack-list">
              {lead.evidence.map((item) => (
                <li key={item.id}>
                  <a href={item.sourceUrl} rel="noreferrer" target="_blank">
                    {item.title}
                  </a>
                  <p className="muted">
                    {item.sourceLabel ? `${item.sourceLabel} | ` : ""}
                    {item.confidence} confidence
                  </p>
                  <p>{item.summary}</p>
                  {item.snippet ? <p className="muted">Snippet: {item.snippet}</p> : null}
                  {item.qualityNote ? <p className="muted">Note: {item.qualityNote}</p> : null}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </section>
  );
}
