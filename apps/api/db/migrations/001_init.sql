PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS discovery_sessions (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  status TEXT NOT NULL,
  mode TEXT NOT NULL,
  quality TEXT NOT NULL,
  experiment_label TEXT NOT NULL,
  correlation_id TEXT,
  mode_reason TEXT,
  error TEXT,
  directory_url TEXT,
  input_json TEXT NOT NULL,
  steps_json TEXT NOT NULL,
  summary_json TEXT NOT NULL,
  notes_json TEXT NOT NULL,
  telemetry_json TEXT,
  import_status TEXT NOT NULL DEFAULT 'idle',
  import_dry_run INTEGER NOT NULL DEFAULT 1,
  import_destination TEXT,
  import_request_id TEXT,
  import_message TEXT,
  import_error TEXT,
  import_pushed_at TEXT,
  lead_count INTEGER NOT NULL DEFAULT 0,
  qualified_lead_count INTEGER NOT NULL DEFAULT 0,
  usable_lead_count INTEGER NOT NULL DEFAULT 0,
  public_email_count INTEGER NOT NULL DEFAULT 0,
  decision_maker_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_discovery_sessions_started_at
  ON discovery_sessions(started_at DESC);

CREATE INDEX IF NOT EXISTS idx_discovery_sessions_experiment_label
  ON discovery_sessions(experiment_label);

CREATE INDEX IF NOT EXISTS idx_discovery_sessions_status
  ON discovery_sessions(status);

CREATE TABLE IF NOT EXISTS discovery_leads (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  rank_order INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  company_name TEXT NOT NULL,
  company_domain TEXT NOT NULL,
  website_url TEXT NOT NULL,
  directory_url TEXT,
  capture_mode TEXT NOT NULL,
  inspection_status TEXT NOT NULL,
  qualification_state TEXT NOT NULL,
  priority TEXT NOT NULL,
  confidence TEXT NOT NULL,
  fit_score REAL NOT NULL,
  contactability_score REAL NOT NULL,
  quality_score REAL NOT NULL,
  decision_maker_score REAL NOT NULL,
  total_score REAL NOT NULL,
  summary TEXT NOT NULL,
  industry TEXT NOT NULL,
  location TEXT NOT NULL,
  company_size TEXT NOT NULL,
  services_json TEXT NOT NULL,
  match_reasons_json TEXT NOT NULL,
  quality_notes_json TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  field_assessments_json TEXT NOT NULL,
  raw_extraction_json TEXT NOT NULL,
  score_explanations_json TEXT NOT NULL,
  agent_context_json TEXT NOT NULL,
  lead_snapshot_json TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES discovery_sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_discovery_leads_session_rank
  ON discovery_leads(session_id, rank_order);

CREATE INDEX IF NOT EXISTS idx_discovery_leads_session_qualification
  ON discovery_leads(session_id, qualification_state);

CREATE INDEX IF NOT EXISTS idx_discovery_leads_company_domain
  ON discovery_leads(company_domain);

CREATE TABLE IF NOT EXISTS discovery_contacts (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  email TEXT,
  linkedin_url TEXT,
  is_decision_maker INTEGER NOT NULL DEFAULT 0,
  contact_snapshot_json TEXT NOT NULL,
  FOREIGN KEY (lead_id) REFERENCES discovery_leads(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_discovery_contacts_lead_id
  ON discovery_contacts(lead_id);

CREATE INDEX IF NOT EXISTS idx_discovery_contacts_email
  ON discovery_contacts(email);
