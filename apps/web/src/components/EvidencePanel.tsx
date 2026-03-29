import type { LeadRecord } from "@revon-tinyfish/contracts";

interface EvidencePanelProps {
  lead: LeadRecord | null;
}

export function EvidencePanel({ lead }: EvidencePanelProps) {
  const topEvidence = lead?.evidence[0] ?? null;

  return (
    <section className="panel evidence-panel">
      <div className="panel-header compact">
        <p className="eyebrow">Evidence</p>
        <h2>Prospect evidence and contacts</h2>
      </div>

      {!lead ? (
        <p className="muted">Select a prospect to inspect the sites visited, qualification evidence, and extracted contacts.</p>
      ) : (
        <>
          <div className="evidence-section">
            <h3>{lead.companyName}</h3>
            <p>{lead.summary}</p>
            {topEvidence?.snippet ? (
              <blockquote className="evidence-snippet">"{topEvidence.snippet}"</blockquote>
            ) : null}
            <p className="muted">
              Capture mode: {lead.captureMode} | Inspection: {lead.inspectionStatus} | Confidence: {lead.score.confidence} | Qualification: {lead.score.qualificationState}
            </p>
            <p className="muted">
              Total {lead.score.totalScore} | Fit {lead.score.fitScore} | Contact {lead.score.contactabilityScore} |
              Quality {lead.score.qualityScore} | Decision-maker {lead.score.decisionMakerScore}
            </p>
          </div>

          <div className="evidence-section">
            <h4>Ranking rationale</h4>
            <ul className="stack-list">
              {lead.score.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>

          {lead.qualityNotes.length > 0 ? (
            <div className="evidence-section">
              <h4>Review flags</h4>
              <ul className="stack-list">
                {lead.qualityNotes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {lead.score.explanations && Object.keys(lead.score.explanations).length > 0 ? (
            <div className="evidence-section">
              <h4>Fit assessment</h4>
              <div className="score-cards">
                {Object.entries(lead.score.explanations).map(([category, explanation]) => (
                  <div className="score-card" key={category}>
                    <span className="score-card-label">{category}</span>
                    <span className="score-card-value">{explanation.score}</span>
                    <span className="score-card-sub">{explanation.summary}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="evidence-section">
            <h4>Pages reviewed</h4>
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

          <div className="evidence-section">
            <h4>Extracted contacts</h4>
            {lead.contacts.length === 0 ? (
              <p className="muted">No named contacts were extracted from the visited pages.</p>
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
            <h4>ICP signal checks</h4>
            {lead.fieldAssessments.length === 0 ? (
              <p className="muted">No ICP signal checks were captured for this prospect.</p>
            ) : (
              <ul className="stack-list">
                {lead.fieldAssessments.map((assessment) => (
                  <li key={`${assessment.field}-${assessment.status}`}>
                    <strong>{assessment.field}</strong> | {assessment.status} | {assessment.confidence}
                    {assessment.notes.length > 0 ? <p>{assessment.notes.join(" | ")}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="evidence-section">
            <details>
              <summary><h4 style={{ display: 'inline-block', margin: 0, cursor: 'pointer' }}>Raw data</h4></summary>
              <pre className="raw-block">{JSON.stringify(lead.rawExtraction, null, 2)}</pre>
            </details>
          </div>
        </>
      )}
    </section>
  );
}
