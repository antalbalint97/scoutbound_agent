ALTER TABLE discovery_leads
  ADD COLUMN revon_imported_to_revon INTEGER NOT NULL DEFAULT 0;

ALTER TABLE discovery_leads
  ADD COLUMN revon_push_status TEXT NOT NULL DEFAULT 'idle';

ALTER TABLE discovery_leads
  ADD COLUMN revon_last_attempted_at TEXT;

ALTER TABLE discovery_leads
  ADD COLUMN revon_last_succeeded_at TEXT;

ALTER TABLE discovery_leads
  ADD COLUMN revon_last_request_id TEXT;

ALTER TABLE discovery_leads
  ADD COLUMN revon_last_error TEXT;

CREATE INDEX IF NOT EXISTS idx_discovery_leads_session_revon_status
  ON discovery_leads(session_id, revon_push_status);
