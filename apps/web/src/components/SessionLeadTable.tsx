import { useState, useEffect } from "react";
import type { PersistedLeadRecord } from "@revon-tinyfish/contracts";
import { getEffectiveQualificationState } from "../lib/leadQualification";
import { updateLeadQualification } from "../lib/api";

interface SessionLeadTableProps {
  leads: PersistedLeadRecord[];
  selectedLeadId: string | null;
  selectedLeadIds: string[];
  onSelect: (leadId: string) => void;
  onToggleLeadSelection: (leadId: string) => void;
  onSelectLeads?: (leadIds: string[]) => void;
}

type SortKey = "score" | "confidence" | "qualification" | "sync";
type SortDir = "asc" | "desc";

const CONFIDENCE_ORDER = { high: 3, medium: 2, low: 1 } as const;
const QUAL_ORDER = { qualified: 3, review: 2, unqualified: 1 } as const;

function sortedLeads(
  leads: PersistedLeadRecord[],
  key: SortKey | null,
  dir: SortDir,
): PersistedLeadRecord[] {
  if (!key) return leads;
  return [...leads].sort((a, b) => {
    let av: number;
    let bv: number;
    if (key === "score") {
      av = a.score.totalScore;
      bv = b.score.totalScore;
    } else if (key === "confidence") {
      av = CONFIDENCE_ORDER[a.score.confidence as keyof typeof CONFIDENCE_ORDER] ?? 0;
      bv = CONFIDENCE_ORDER[b.score.confidence as keyof typeof CONFIDENCE_ORDER] ?? 0;
    } else if (key === "qualification") {
      const aq = getEffectiveQualificationState(a);
      const bq = getEffectiveQualificationState(b);
      av = QUAL_ORDER[aq as keyof typeof QUAL_ORDER] ?? 0;
      bv = QUAL_ORDER[bq as keyof typeof QUAL_ORDER] ?? 0;
    } else {
      av = a.revonStatusLabel === "Synced to CRM" ? 2 : a.revonStatusLabel === "Dry run" ? 1 : 0;
      bv = b.revonStatusLabel === "Synced to CRM" ? 2 : b.revonStatusLabel === "Dry run" ? 1 : 0;
    }
    return dir === "desc" ? bv - av : av - bv;
  });
}

function QualBadge({ state, isOverride }: { state: string; isOverride?: boolean }) {
  const cls =
    state === "qualified"
      ? "qual-qualified"
      : state === "review"
        ? "qual-review"
        : "qual-unqualified";
  const label =
    state === "qualified" ? "Qualified" : state === "review" ? "Review" : "Not qualified";
  return (
    <div className="qual-badge-container">
      <span className={`qual-badge ${cls}`}>{label}</span>
      {isOverride && <span className="override-badge">Manual</span>}
    </div>
  );
}

function ConfidencePill({ level }: { level: string }) {
  const cls =
    level === "high"
      ? "confidence-high"
      : level === "medium"
        ? "confidence-medium"
        : "confidence-low";
  return <span className={`confidence-pill ${cls}`}>{level}</span>;
}

function SyncBadge({ label }: { label: string }) {
  const cls =
    label === "Synced to CRM"
      ? "sync-synced"
      : label === "Dry run"
        ? "sync-dryrun"
        : label === "Push failed" || label === "Pending push"
          ? "sync-failed"
          : "sync-none";
  const short =
    label === "Synced to CRM"
      ? "Synced"
      : label === "Dry run"
        ? "Dry run"
        : label === "Push failed"
          ? "Failed"
          : label === "Pending push"
            ? "Pending"
            : "Not synced";
  return <span className={`sync-badge ${cls}`}>{short}</span>;
}

function SortTh({
  children,
  sortKey,
  activeKey,
  dir,
  onSort,
}: {
  children: React.ReactNode;
  sortKey: SortKey;
  activeKey: SortKey | null;
  dir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const isActive = activeKey === sortKey;
  const icon = isActive ? (dir === "desc" ? " ↓" : " ↑") : " ↕";
  return (
    <th className="th-sort" onClick={() => onSort(sortKey)}>
      {children}
      <span className={`sort-icon${isActive ? " active" : ""}`}>{icon}</span>
    </th>
  );
}

export function SessionLeadTable({
  leads,
  selectedLeadId,
  selectedLeadIds,
  onSelect,
  onToggleLeadSelection,
  onSelectLeads,
}: SessionLeadTableProps) {
  const [sortKey, setSortKey] = useState<SortKey | null>("qualification");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const [localLeads, setLocalLeads] = useState<PersistedLeadRecord[]>(leads);

  useEffect(() => {
    setLocalLeads(leads);
  }, [leads]);

  const effectiveLeads = localLeads;

  const qualifiedLeads = effectiveLeads.filter(
    (l) => getEffectiveQualificationState(l) === "qualified",
  );
  const displayed = sortedLeads(effectiveLeads, sortKey, sortDir);

  async function handleOverride(
    leadId: string,
    state: "qualified" | "review" | "unqualified" | null,
  ) {
    // Find the session ID from the first lead
    const firstLead = effectiveLeads[0];
    if (!firstLead) return;
    const sessionId = firstLead.agentContext.agentSessionId;

    // Optimistic UI update
    setLocalLeads((current) =>
      current.map((l) =>
        l.id === leadId
          ? {
              ...l,
              operatorQualificationState: state,
              operatorOverrideUpdatedAt: new Date().toISOString(),
            }
          : l,
      ),
    );

    try {
      await updateLeadQualification(sessionId, leadId, { operatorQualificationState: state });
    } catch (error) {
      console.error("Failed to update lead qualification:", error);
      // Revert on error? For now just log.
    }
  }

  function handleSelectAllQualified() {
    if (onSelectLeads) {
      onSelectLeads(qualifiedLeads.map((l) => l.id));
    }
  }

  if (leads.length === 0) {
    return (
      <section className="panel">
        <div className="panel-header compact">
          <p className="eyebrow">Prospects</p>
          <h2>Qualified prospect shortlist</h2>
        </div>
        <div className="empty-state">
          <p className="empty-state-title">No prospects in this execution</p>
          <p>The workflow did not return any prospects for this run.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="panel-header compact">
        <p className="eyebrow">Prospects</p>
        <h2>Qualified prospect shortlist</h2>
      </div>

      <div className="table-header-bar">
        <div className="count-chips">
          <span className="count-chip count-chip-total">{leads.length} total</span>
          <span className="count-chip count-chip-qualified">
            {qualifiedLeads.length} qualified
          </span>
          {selectedLeadIds.length > 0 ? (
            <span className="count-chip count-chip-selected">
              {selectedLeadIds.length} selected
            </span>
          ) : null}
        </div>
        {onSelectLeads && qualifiedLeads.length > 0 ? (
          <button className="secondary-button" onClick={handleSelectAllQualified} type="button">
            Select all qualified
          </button>
        ) : null}
      </div>

      <div className="table-scroll">
        <table className="console-table lead-table-operator">
          <thead>
            <tr>
              <th />
              <th>#</th>
              <th>Company</th>
              <th>Domain</th>
              <SortTh sortKey="qualification" activeKey={sortKey} dir={sortDir} onSort={handleSort}>
                Qualification
              </SortTh>
              <SortTh sortKey="confidence" activeKey={sortKey} dir={sortDir} onSort={handleSort}>
                Confidence
              </SortTh>
              <SortTh sortKey="score" activeKey={sortKey} dir={sortDir} onSort={handleSort}>
                Score
              </SortTh>
              <th>Inspection</th>
              <th>Contacts</th>
              <SortTh sortKey="sync" activeKey={sortKey} dir={sortDir} onSort={handleSort}>
                CRM sync (disabled)
              </SortTh>
            </tr>
          </thead>
          <tbody>
            {displayed.map((lead, index) => {
              const checked = selectedLeadIds.includes(lead.id);
              const isActive = selectedLeadId === lead.id;
              const effectiveQual = getEffectiveQualificationState(lead);
              const isOverride = lead.operatorQualificationState !== null;

              return (
                <tr
                  className={isActive ? "active" : ""}
                  key={lead.id}
                  onClick={() => onSelect(lead.id)}
                >
                  <td>
                    <input
                      checked={checked}
                      onChange={() => onToggleLeadSelection(lead.id)}
                      onClick={(event) => event.stopPropagation()}
                      type="checkbox"
                    />
                  </td>
                  <td>{index + 1}</td>
                  <td>{lead.companyName}</td>
                  <td>{lead.companyDomain}</td>
                  <td>
                    <div className="qual-cell">
                      <QualBadge isOverride={isOverride} state={effectiveQual} />
                      <select
                        className="qual-override-select"
                        onClick={(e) => e.stopPropagation()}
                        value={lead.operatorQualificationState ?? ""}
                        onChange={(e) =>
                          handleOverride(
                            lead.id,
                            (e.target.value as any) || null,
                          )
                        }
                      >
                        <option value="">Auto</option>
                        <option value="qualified">Qualified</option>
                        <option value="review">Review</option>
                        <option value="unqualified">Unqualified</option>
                      </select>
                    </div>
                  </td>
                  <td>
                    <ConfidencePill level={lead.score.confidence} />
                  </td>
                  <td>{lead.score.totalScore}</td>
                  <td>{lead.inspectionStatus}</td>
                  <td>{lead.contacts.length}</td>
                  <td>
                    <SyncBadge label={lead.revonStatusLabel} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
