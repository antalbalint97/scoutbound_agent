import type { ZohoAdapterStatus, ZohoConnectionTestResult } from "@revon-tinyfish/contracts";
import type { ZohoPushSummary } from "../lib/api";

interface PushToZohoButtonProps {
  zohoStatus: ZohoAdapterStatus | null;
  isSubmitting: boolean;
  isTestingConnection: boolean;
  qualifiedCount: number;
  onPush: () => Promise<void>;
  onTestConnection: () => Promise<void>;
  selectedLeadIds?: string[] | undefined;
  connectionTest?: ZohoConnectionTestResult | undefined;
  summary?: ZohoPushSummary | undefined;
}

export function PushToZohoButton({
  zohoStatus,
  isSubmitting,
  isTestingConnection,
  qualifiedCount,
  onPush,
  onTestConnection,
  selectedLeadIds,
  connectionTest,
  summary,
}: PushToZohoButtonProps) {
  const canPush = qualifiedCount > 0 && !isSubmitting;
  const isConfigured = zohoStatus?.configured ?? false;
  const isDryRun = zohoStatus?.dryRun ?? true;

  return (
    <section className="panel panel-push">
      <div className="panel-header compact">
        <p className="eyebrow">CRM sync — Zoho CRM</p>
        <h2>Sync shortlist to Zoho CRM</h2>
      </div>

      <div className="summary-cards" style={{ gridTemplateColumns: "repeat(3, 1fr)", marginBottom: 20 }}>
        <div className="summary-card">
          <span className="summary-card-label">Status</span>
          <span className="summary-card-value" style={{ fontSize: "0.95rem" }}>
            {isConfigured ? (isDryRun ? "Dry-run mode" : "Live") : "Not configured"}
          </span>
        </div>
        <div className="summary-card">
          <span className="summary-card-label">Destination</span>
          <span className="summary-card-value" style={{ fontSize: "0.75rem", fontWeight: 500, wordBreak: "break-all" }}>
            {zohoStatus?.module ?? "Leads"} module
          </span>
        </div>
        <div className="summary-card">
          <span className="summary-card-label">Selected</span>
          <span className="summary-card-value">{selectedLeadIds?.length ?? qualifiedCount}</span>
          <span className="summary-card-sub">qualified prospects</span>
        </div>
      </div>

      {!isConfigured && (
        <p className="muted" style={{ marginBottom: 16 }}>
          Zoho credentials are not configured. Set{" "}
          <code>ZOHO_CLIENT_ID</code>, <code>ZOHO_CLIENT_SECRET</code>, and{" "}
          <code>ZOHO_REFRESH_TOKEN</code> in your environment to enable live sync.
        </p>
      )}

      {isConfigured && isDryRun && (
        <p className="muted" style={{ marginBottom: 16 }}>
          Dry-run mode is active. Set <code>ZOHO_DRY_RUN=false</code> to push leads to Zoho CRM.
        </p>
      )}

      <div className="button-row" style={{ marginBottom: 16 }}>
        <button
          className="secondary-button"
          disabled={isTestingConnection}
          onClick={() => void onTestConnection()}
          type="button"
        >
          {isTestingConnection ? "Testing connection..." : "Test connection"}
        </button>
      </div>

      {connectionTest && (
        <p className="muted" style={{ marginBottom: 16 }}>
          {connectionTest.message}
        </p>
      )}

      <button
        className="primary-button"
        disabled={!canPush}
        onClick={() => void onPush()}
        type="button"
      >
        {isSubmitting
          ? "Syncing to Zoho…"
          : isDryRun
          ? `Dry-run sync (${qualifiedCount} prospect${qualifiedCount !== 1 ? "s" : ""})`
          : `Push ${qualifiedCount} prospect${qualifiedCount !== 1 ? "s" : ""} to Zoho CRM`}
      </button>

      {summary && (
        <ul className="stack-list compact-list" style={{ marginTop: 16 }}>
          <li>
            Attempted {summary.attempted} · Pushed {summary.pushedCount}
            {summary.failedCount > 0 ? ` · Failed ${summary.failedCount}` : ""}
          </li>
          <li>
            {summary.dryRun ? "Dry-run" : "Live sync"} → {summary.module} module
          </li>
          {summary.message && <li>{summary.message}</li>}
        </ul>
      )}
    </section>
  );
}
