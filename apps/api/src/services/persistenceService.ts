import {
  demoRunSchema,
  leadRecordSchema,
  persistedLeadRecordSchema,
  persistedLeadPushStatusSchema,
  persistedSessionCsvColumns,
  persistedSessionCsvRowSchema,
  persistedSessionDetailSchema,
  persistedSessionLifecycleStatusSchema,
  persistedSessionJsonExportSchema,
  persistedSessionSummarySchema,
  revonImportPayloadSchema,
  sessionTelemetrySchema,
  type DemoRun,
  type LeadRecord,
  type PersistedLeadRecord,
  type PersistedLeadPushStatus,
  type PersistedLeadRevonState,
  type PersistedSessionCsvRow,
  type PersistedSessionDetail,
  type PersistedSessionJsonExport,
  type PersistedSessionLifecycleStatus,
  type PersistedSessionSummary,
  type RunPushState,
  type SessionTelemetry,
} from "@revon-tinyfish/contracts";
import { mapLeadToRevonRecords } from "../integrations/revon/mapper.js";
import { getEffectiveQualificationState } from "../domain/leads/effectiveQualification.js";
import { getDatabase, runMigrations } from "../db/database.js";

function toJsonString(value: unknown): string {
  return JSON.stringify(value);
}

function ensurePersistenceReady(): void {
  runMigrations();
}

function fromJsonString<T>(value: string): T {
  return JSON.parse(value) as T;
}

function asNullableString(value: unknown): string | null {
  return value === null || value === undefined || value === "" ? null : String(value);
}

function asBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === "1";
}

function normalizePersistedLeadPushStatus(value: unknown): PersistedLeadPushStatus {
  if (value === "idle") {
    return "not_attempted";
  }
  if (value === "dry-run") {
    return "dry_run";
  }
  if (value === "imported") {
    return "succeeded";
  }

  return persistedLeadPushStatusSchema.parse(value ?? "not_attempted");
}

function deriveRevonStatusLabel(
  pushStatus: PersistedLeadPushStatus,
  importedToRevon: boolean,
): string {
  if (pushStatus === "pending") {
    return "Pending push";
  }
  if (pushStatus === "dry_run") {
    return "Dry run";
  }
  if (pushStatus === "failed") {
    return "Push failed";
  }
  if (pushStatus === "succeeded") {
    return importedToRevon ? "Synced to CRM" : "Push succeeded";
  }

  return importedToRevon ? "Synced to CRM" : "Not attempted";
}

function derivePersistedSessionLifecycleStatus(params: {
  status: DemoRun["status"];
  completedAt: string | null;
  leadCount: number;
  qualifiedLeadCount: number;
  importStatus: RunPushState["status"];
  importPushedAt: string | null;
  pushedLeadCount: number;
}): PersistedSessionLifecycleStatus {
  if (params.status === "failed") {
    return "failed";
  }

  if (params.importPushedAt && params.qualifiedLeadCount > 0) {
    if (params.importStatus === "error" && params.pushedLeadCount === 0) {
      return "failed";
    }

    if (params.pushedLeadCount >= params.qualifiedLeadCount) {
      return "pushed_complete";
    }

    if (params.pushedLeadCount > 0 || params.importStatus === "error") {
      return "pushed_partial";
    }
  }

  if (params.status === "running") {
    return params.leadCount === 0 && !params.completedAt ? "created" : "running";
  }

  if (params.completedAt || params.status === "completed" || params.status === "partial") {
    return "completed";
  }

  return persistedSessionLifecycleStatusSchema.parse("running");
}

function getMaxExportBytes(): number | null {
  const configured = Number.parseFloat(process.env.MAX_EXPORT_MB ?? "");
  if (!Number.isFinite(configured) || configured <= 0) {
    return null;
  }

  return Math.floor(configured * 1024 * 1024);
}

function exceedsExportLimit(content: string): boolean {
  const maxBytes = getMaxExportBytes();
  if (maxBytes === null) {
    return false;
  }

  return Buffer.byteLength(content, "utf8") > maxBytes;
}

function mapLeadRevonState(row: Record<string, unknown>): PersistedLeadRevonState {
  return {
    importedToRevon: asBoolean(row.revon_imported_to_revon),
    pushStatus: normalizePersistedLeadPushStatus(row.revon_push_status ?? "not_attempted"),
    lastAttemptedAt: asNullableString(row.revon_last_attempted_at),
    lastSucceededAt: asNullableString(row.revon_last_succeeded_at),
    requestId: asNullableString(row.revon_last_request_id),
    error: asNullableString(row.revon_last_error),
  };
}

function readExistingLeadRevonStates(sessionId: string): Map<string, PersistedLeadRevonState> {
  const db = getDatabase();
  const rows = db
    .prepare(
      `
        SELECT
          id,
          revon_imported_to_revon,
          revon_push_status,
          revon_last_attempted_at,
          revon_last_succeeded_at,
          revon_last_request_id,
          revon_last_error,
          operator_qualification_state,
          operator_override_reason,
          operator_override_updated_at
        FROM discovery_leads
        WHERE session_id = ?
      `,
    )
    .all(sessionId) as Array<Record<string, unknown>>;

  return new Map(
    rows.map((row) => [
      String(row.id),
      mapLeadRevonState(row),
    ]),
  );
}

function countDecisionMakers(leads: LeadRecord[]): number {
  return leads.reduce(
    (total, lead) => total + lead.contacts.filter((contact) => contact.isDecisionMaker).length,
    0,
  );
}

function countPublicEmails(leads: LeadRecord[]): number {
  return new Set(
    leads.flatMap((lead) =>
      lead.contacts
        .map((contact) => contact.email?.toLowerCase() ?? null)
        .filter((email): email is string => Boolean(email)),
    ),
  ).size;
}

function escapeCsv(value: string): string {
  if (value.includes(",") || value.includes("\"") || value.includes("\n")) {
    return `"${value.replace(/"/g, "\"\"")}"`;
  }

  return value;
}

function selectPersistedLeads(
  session: PersistedSessionDetail,
  leadIds?: string[],
): PersistedLeadRecord[] {
  const selectedLeadIds = leadIds === undefined ? null : new Set(leadIds);
  return session.leads.filter((lead) => !selectedLeadIds || selectedLeadIds.has(lead.id));
}

function mapSessionSummary(row: Record<string, unknown>): PersistedSessionSummary {
  const status = demoRunSchema.shape.status.parse(row.status);
  const completedAt = asNullableString(row.completed_at);
  const leadCount = Number(row.lead_count ?? 0);
  const qualifiedLeadCount = Number(row.live_qualified_lead_count ?? row.qualified_lead_count ?? 0);
  const importStatus = demoRunSchema.shape.push.shape.status.parse(row.import_status);
  const importPushedAt = asNullableString(row.import_pushed_at);
  const pushedLeadCount = Number(row.pushed_lead_count ?? 0);

  return persistedSessionSummarySchema.parse({
    id: String(row.id),
    startedAt: String(row.started_at),
    completedAt,
    status,
    lifecycleStatus: derivePersistedSessionLifecycleStatus({
      status,
      completedAt,
      leadCount,
      qualifiedLeadCount,
      importStatus,
      importPushedAt,
      pushedLeadCount,
    }),
    mode: demoRunSchema.shape.mode.parse(row.mode),
    quality: demoRunSchema.shape.quality.parse(row.quality),
    experimentLabel: String(row.experiment_label),
    directoryUrl: asNullableString(row.directory_url),
    leadCount,
    qualifiedLeadCount,
    usableLeadCount: Number(row.usable_lead_count ?? 0),
    publicEmailCount: Number(row.public_email_count ?? 0),
    decisionMakerCount: Number(row.decision_maker_count ?? 0),
    importStatus,
    importDryRun: Boolean(row.import_dry_run),
    importDestination: asNullableString(row.import_destination),
    importRequestId: asNullableString(row.import_request_id),
    importMessage: asNullableString(row.import_message),
    importError: asNullableString(row.import_error),
    importPushedAt,
  });
}

export async function persistDiscoveryRun(
  run: DemoRun,
  telemetry?: SessionTelemetry | null,
): Promise<PersistedSessionDetail> {
  ensurePersistenceReady();
  const db = getDatabase();
  const nowIso = new Date().toISOString();
  const existingLeadRevonStates = readExistingLeadRevonStates(run.id);

  db.exec("BEGIN");
  try {
    db.prepare(
      `
        INSERT INTO discovery_sessions (
          id, created_at, updated_at, started_at, completed_at, status, mode, quality,
          experiment_label, correlation_id, mode_reason, error, directory_url, input_json,
          steps_json, summary_json, notes_json, telemetry_json, import_status, import_dry_run,
          import_destination, import_request_id, import_message, import_error, import_pushed_at,
          lead_count, qualified_lead_count, usable_lead_count, public_email_count, decision_maker_count
        ) VALUES (
          @id, @createdAt, @updatedAt, @startedAt, @completedAt, @status, @mode, @quality,
          @experimentLabel, @correlationId, @modeReason, @error, @directoryUrl, @inputJson,
          @stepsJson, @summaryJson, @notesJson, @telemetryJson, @importStatus, @importDryRun,
          @importDestination, @importRequestId, @importMessage, @importError, @importPushedAt,
          @leadCount, @qualifiedLeadCount, @usableLeadCount, @publicEmailCount, @decisionMakerCount
        )
        ON CONFLICT(id) DO UPDATE SET
          updated_at = excluded.updated_at,
          started_at = excluded.started_at,
          completed_at = excluded.completed_at,
          status = excluded.status,
          mode = excluded.mode,
          quality = excluded.quality,
          experiment_label = excluded.experiment_label,
          correlation_id = excluded.correlation_id,
          mode_reason = excluded.mode_reason,
          error = excluded.error,
          directory_url = excluded.directory_url,
          input_json = excluded.input_json,
          steps_json = excluded.steps_json,
          summary_json = excluded.summary_json,
          notes_json = excluded.notes_json,
          telemetry_json = excluded.telemetry_json,
          import_status = excluded.import_status,
          import_dry_run = excluded.import_dry_run,
          import_destination = excluded.import_destination,
          import_request_id = excluded.import_request_id,
          import_message = excluded.import_message,
          import_error = excluded.import_error,
          import_pushed_at = excluded.import_pushed_at,
          lead_count = excluded.lead_count,
          qualified_lead_count = excluded.qualified_lead_count,
          usable_lead_count = excluded.usable_lead_count,
          public_email_count = excluded.public_email_count,
          decision_maker_count = excluded.decision_maker_count
      `,
    ).run({
      id: run.id,
      createdAt: run.startedAt,
      updatedAt: nowIso,
      startedAt: run.startedAt,
      completedAt: run.completedAt ?? null,
      status: run.status,
      mode: run.mode,
      quality: run.quality,
      experimentLabel: run.experimentLabel,
      correlationId: telemetry?.correlationId ?? null,
      modeReason: run.modeReason ?? null,
      error: run.error ?? null,
      directoryUrl: run.summary.directoryUrl ?? null,
      inputJson: toJsonString(run.input),
      stepsJson: toJsonString(run.steps),
      summaryJson: toJsonString(run.summary),
      notesJson: toJsonString(run.notes),
      telemetryJson: telemetry ? toJsonString(telemetry) : null,
      importStatus: run.push.status,
      importDryRun: run.push.dryRun ? 1 : 0,
      importDestination: run.push.destination || null,
      importRequestId: run.push.requestId ?? null,
      importMessage: run.push.message ?? null,
      importError: run.push.error ?? null,
      importPushedAt: run.push.pushedAt ?? null,
      leadCount: run.leads.length,
      qualifiedLeadCount: run.leads.filter(
        (lead) => (lead.operatorQualificationState ?? lead.score.qualificationState) === "qualified",
      ).length,
      usableLeadCount: run.leads.filter((lead) => lead.inspectionStatus !== "failed").length,
      publicEmailCount: countPublicEmails(run.leads),
      decisionMakerCount: countDecisionMakers(run.leads),
    });

    db.prepare("DELETE FROM discovery_leads WHERE session_id = ?").run(run.id);

    const insertLead = db.prepare(
      `
        INSERT INTO discovery_leads (
          id, session_id, rank_order, created_at, updated_at, company_name, company_domain,
          website_url, directory_url, capture_mode, inspection_status, qualification_state,
          priority, confidence, fit_score, contactability_score, quality_score,
          decision_maker_score, total_score, summary, industry, location, company_size,
          services_json, match_reasons_json, quality_notes_json, evidence_json,
          field_assessments_json, raw_extraction_json, score_explanations_json,
          agent_context_json, lead_snapshot_json, revon_imported_to_revon, revon_push_status,
          revon_last_attempted_at, revon_last_succeeded_at, revon_last_request_id,
          revon_last_error, operator_qualification_state, operator_override_reason,
          operator_override_updated_at
        ) VALUES (
          @id, @sessionId, @rankOrder, @createdAt, @updatedAt, @companyName, @companyDomain,
          @websiteUrl, @directoryUrl, @captureMode, @inspectionStatus, @qualificationState,
          @priority, @confidence, @fitScore, @contactabilityScore, @qualityScore,
          @decisionMakerScore, @totalScore, @summary, @industry, @location, @companySize,
          @servicesJson, @matchReasonsJson, @qualityNotesJson, @evidenceJson,
          @fieldAssessmentsJson, @rawExtractionJson, @scoreExplanationsJson,
          @agentContextJson, @leadSnapshotJson, @revonImportedToRevon, @revonPushStatus,
          @revonLastAttemptedAt, @revonLastSucceededAt, @revonLastRequestId,
          @revonLastError, @operatorQualificationState, @operatorOverrideReason,
          @operatorOverrideUpdatedAt
        )
      `,
    );

    const insertContact = db.prepare(
      `
        INSERT INTO discovery_contacts (
          id, lead_id, created_at, updated_at, name, role, email, linkedin_url,
          is_decision_maker, contact_snapshot_json
        ) VALUES (
          @id, @leadId, @createdAt, @updatedAt, @name, @role, @email, @linkedinUrl,
          @isDecisionMaker, @contactSnapshotJson
        )
      `,
    );

    run.leads.forEach((lead, index) => {
      const existingRevonState = existingLeadRevonStates.get(lead.id) ?? {
        importedToRevon: false,
        pushStatus: "not_attempted",
        lastAttemptedAt: null,
        lastSucceededAt: null,
        requestId: null,
        error: null,
      };

      insertLead.run({
        id: lead.id,
        sessionId: run.id,
        rankOrder: index,
        createdAt: nowIso,
        updatedAt: nowIso,
        companyName: lead.companyName,
        companyDomain: lead.companyDomain,
        websiteUrl: lead.websiteUrl,
        directoryUrl: lead.directoryUrl ?? null,
        captureMode: lead.captureMode,
        inspectionStatus: lead.inspectionStatus,
        qualificationState: lead.score.qualificationState,
        priority: lead.score.priority,
        confidence: lead.score.confidence,
        fitScore: lead.score.fitScore,
        contactabilityScore: lead.score.contactabilityScore,
        qualityScore: lead.score.qualityScore,
        decisionMakerScore: lead.score.decisionMakerScore,
        totalScore: lead.score.totalScore,
        summary: lead.summary,
        industry: lead.industry,
        location: lead.location,
        companySize: lead.companySize,
        servicesJson: toJsonString(lead.services),
        matchReasonsJson: toJsonString(lead.matchReasons),
        qualityNotesJson: toJsonString(lead.qualityNotes),
        evidenceJson: toJsonString(lead.evidence),
        fieldAssessmentsJson: toJsonString(lead.fieldAssessments),
        rawExtractionJson: toJsonString(lead.rawExtraction),
        scoreExplanationsJson: toJsonString(lead.score.explanations),
        agentContextJson: toJsonString(lead.agentContext),
        leadSnapshotJson: toJsonString(lead),
        revonImportedToRevon: existingRevonState.importedToRevon ? 1 : 0,
        revonPushStatus: normalizePersistedLeadPushStatus(existingRevonState.pushStatus),
        revonLastAttemptedAt: existingRevonState.lastAttemptedAt,
        revonLastSucceededAt: existingRevonState.lastSucceededAt,
        revonLastRequestId: existingRevonState.requestId,
        revonLastError: existingRevonState.error,
        operatorQualificationState: lead.operatorQualificationState ?? null,
        operatorOverrideReason: lead.operatorOverrideReason ?? null,
        operatorOverrideUpdatedAt: lead.operatorOverrideUpdatedAt ?? null,
      });

      lead.contacts.forEach((contact) => {
        insertContact.run({
          id: contact.id,
          leadId: lead.id,
          createdAt: nowIso,
          updatedAt: nowIso,
          name: contact.name,
          role: contact.role,
          email: contact.email ?? null,
          linkedinUrl: contact.linkedinUrl ?? null,
          isDecisionMaker: contact.isDecisionMaker ? 1 : 0,
          contactSnapshotJson: toJsonString(contact),
        });
      });
    });

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  const detail = await getPersistedSession(run.id);
  if (!detail) {
    throw new Error(`Persisted session ${run.id} could not be reloaded after save.`);
  }

  return detail;
}

function encodeSessionCursor(summary: PersistedSessionSummary): string {
  return `${summary.startedAt}::${summary.id}`;
}

function decodeSessionCursor(cursor?: string): { startedAt: string; id: string } | null {
  if (!cursor) {
    return null;
  }

  const separatorIndex = cursor.indexOf("::");
  if (separatorIndex <= 0) {
    return null;
  }

  return {
    startedAt: cursor.slice(0, separatorIndex),
    id: cursor.slice(separatorIndex + 2),
  };
}

export async function listPersistedSessions(
  limit: number = 25,
  cursor?: string,
): Promise<{ items: PersistedSessionSummary[]; nextCursor: string | null }> {
  ensurePersistenceReady();
  const db = getDatabase();
  const safeLimit = Math.max(1, Math.min(limit, 100));
  const parsedCursor = decodeSessionCursor(cursor);
  const rows = (
    parsedCursor
      ? db
          .prepare(
            `
              SELECT
                discovery_sessions.*,
                (
                  SELECT COUNT(*)
                  FROM discovery_leads
                  WHERE
                    discovery_leads.session_id = discovery_sessions.id
                    AND discovery_leads.revon_push_status IN ('dry_run', 'succeeded', 'dry-run', 'imported')
                ) AS pushed_lead_count,
                (
                  SELECT COUNT(*)
                  FROM discovery_leads
                  WHERE
                    discovery_leads.session_id = discovery_sessions.id
                    AND COALESCE(discovery_leads.operator_qualification_state, discovery_leads.qualification_state) = 'qualified'
                ) AS live_qualified_lead_count
              FROM discovery_sessions
              WHERE
                started_at < @startedAt
                OR (started_at = @startedAt AND id < @id)
              ORDER BY started_at DESC, id DESC
              LIMIT @limit
            `,
          )
          .all({
            startedAt: parsedCursor.startedAt,
            id: parsedCursor.id,
            limit: safeLimit + 1,
          })
      : db
          .prepare(
            `
              SELECT
                discovery_sessions.*,
                (
                  SELECT COUNT(*)
                  FROM discovery_leads
                  WHERE
                    discovery_leads.session_id = discovery_sessions.id
                    AND discovery_leads.revon_push_status IN ('dry_run', 'succeeded', 'dry-run', 'imported')
                ) AS pushed_lead_count,
                (
                  SELECT COUNT(*)
                  FROM discovery_leads
                  WHERE
                    discovery_leads.session_id = discovery_sessions.id
                    AND COALESCE(discovery_leads.operator_qualification_state, discovery_leads.qualification_state) = 'qualified'
                ) AS live_qualified_lead_count
              FROM discovery_sessions
              ORDER BY started_at DESC, id DESC
              LIMIT ?
            `,
          )
          .all(safeLimit + 1)
  ) as Array<Record<string, unknown>>;

  const hasMore = rows.length > safeLimit;
  const items = rows.slice(0, safeLimit).map(mapSessionSummary);

  return {
    items,
    nextCursor: hasMore && items.length > 0 ? encodeSessionCursor(items[items.length - 1]!) : null,
  };
}

export async function getPersistedSession(sessionId: string): Promise<PersistedSessionDetail | null> {
  ensurePersistenceReady();
  const db = getDatabase();
  const session = db
    .prepare(
      `
        SELECT
          discovery_sessions.*,
          (
            SELECT COUNT(*)
            FROM discovery_leads
            WHERE
              discovery_leads.session_id = discovery_sessions.id
              AND discovery_leads.revon_push_status IN ('dry_run', 'succeeded', 'dry-run', 'imported')
          ) AS pushed_lead_count
        FROM discovery_sessions
        WHERE id = ? LIMIT 1
      `,
    )
    .get(sessionId) as Record<string, unknown> | undefined;

  if (!session) {
    return null;
  }

  const leadRows = db
    .prepare(
      `
        SELECT
          lead_snapshot_json,
          revon_imported_to_revon,
          revon_push_status,
          revon_last_attempted_at,
          revon_last_succeeded_at,
          revon_last_request_id,
          revon_last_error,
          operator_qualification_state,
          operator_override_reason,
          operator_override_updated_at
        FROM discovery_leads
        WHERE session_id = ?
        ORDER BY rank_order ASC
      `,
    )
    .all(sessionId) as Array<Record<string, unknown>>;

  const leads = leadRows.map((row) =>
    (() => {
      const baseLead = leadRecordSchema.parse(fromJsonString(String(row.lead_snapshot_json)));
      const revon = mapLeadRevonState(row);

      return persistedLeadRecordSchema.parse({
        ...baseLead,
        revon,
        revonStatusLabel: deriveRevonStatusLabel(revon.pushStatus, revon.importedToRevon),
        operatorQualificationState: asNullableString(row.operator_qualification_state),
        operatorOverrideReason: asNullableString(row.operator_override_reason),
        operatorOverrideUpdatedAt: asNullableString(row.operator_override_updated_at),
      });
    })(),
  );
  const summary = mapSessionSummary(session);

  return persistedSessionDetailSchema.parse({
    ...summary,
    correlationId: asNullableString(session.correlation_id),
    modeReason: asNullableString(session.mode_reason),
    error: asNullableString(session.error),
    input: demoRunSchema.shape.input.parse(fromJsonString(String(session.input_json))),
    steps: demoRunSchema.shape.steps.parse(fromJsonString(String(session.steps_json))),
    summary: demoRunSchema.shape.summary.parse(fromJsonString(String(session.summary_json))),
    notes: demoRunSchema.shape.notes.parse(fromJsonString(String(session.notes_json))),
    telemetry: session.telemetry_json
      ? sessionTelemetrySchema.parse(fromJsonString(String(session.telemetry_json)))
      : null,
    leads,
  });
}

export async function buildPersistedRevonExport(
  sessionId: string,
  leadIds?: string[],
) {
  const session = await getPersistedSession(sessionId);
  if (!session) {
    return null;
  }

  const allowedLeadIds = leadIds === undefined ? null : new Set(leadIds);
  const leads = session.leads.filter(
    (lead) =>
      getEffectiveQualificationState(lead) === "qualified" &&
      (!allowedLeadIds || allowedLeadIds.has(lead.id)),
  );

  return revonImportPayloadSchema.parse({
    source: "tinyfish-demo",
    runId: session.id,
    sentAt: new Date().toISOString(),
    leads: leads.flatMap((lead) => mapLeadToRevonRecords(lead)),
  });
}

export async function buildPersistedSessionJsonExport(
  sessionId: string,
  leadIds?: string[],
  options?: {
    includeTelemetry?: boolean;
  },
): Promise<PersistedSessionJsonExport | null> {
  const session = await getPersistedSession(sessionId);
  if (!session) {
    return null;
  }

  const selectedLeads = selectPersistedLeads(session, leadIds);

  return persistedSessionJsonExportSchema.parse({
    exportType: "tinyfish-session-json",
    export_version: "v1",
    export_schema: "revon.discovery.session.export.v1",
    exportedAt: new Date().toISOString(),
    session: {
      ...session,
      telemetry: options?.includeTelemetry === false ? null : session.telemetry,
      selectedLeadCount: selectedLeads.length,
    },
    leads: selectedLeads.map((lead, rank) => ({
      ...lead,
      rank,
    })),
  });
}

function buildPersistedSessionCsvRows(
  session: PersistedSessionDetail,
  leadIds?: string[],
): PersistedSessionCsvRow[] {
  const selectedLeads = selectPersistedLeads(session, leadIds);
  const rows: PersistedSessionCsvRow[] = [];

  selectedLeads.forEach((lead, rank) => {
    const contacts = lead.contacts.length > 0 ? lead.contacts : [null];
    const topEvidence = lead.evidence[0] ?? null;

    contacts.forEach((contact) => {
      rows.push(
        persistedSessionCsvRowSchema.parse({
          session_id: session.id,
          experiment_label: session.experimentLabel,
          session_status: session.status,
          session_mode: session.mode,
          session_quality: session.quality,
          session_started_at: session.startedAt,
          session_completed_at: session.completedAt ?? "",
          lead_rank: String(rank + 1),
          lead_id: lead.id,
          company_name: lead.companyName,
          company_domain: lead.companyDomain,
          website_url: lead.websiteUrl,
          directory_url: lead.directoryUrl ?? "",
          location: lead.location,
          company_size: lead.companySize,
          industry: lead.industry,
          qualification_state: getEffectiveQualificationState(lead),
          priority: lead.score.priority,
          confidence: lead.score.confidence,
          inspection_status: lead.inspectionStatus,
          total_score: String(lead.score.totalScore),
          fit_score: String(lead.score.fitScore),
          contactability_score: String(lead.score.contactabilityScore),
          quality_score: String(lead.score.qualityScore),
          decision_maker_score: String(lead.score.decisionMakerScore),
          ranking_reasons_joined: lead.score.reasons.join(" | "),
          quality_notes: lead.qualityNotes.join(" | "),
          services: lead.services.join(" | "),
          evidence_count: String(lead.evidence.length),
          top_evidence_title: topEvidence?.title ?? "",
          top_evidence_url: topEvidence?.sourceUrl ?? "",
          top_evidence_summary: topEvidence?.summary ?? "",
          contact_name: contact?.name ?? "",
          contact_role: contact?.role ?? "",
          contact_email: contact?.email ?? "",
          contact_linkedin_url: contact?.linkedinUrl ?? "",
          contact_is_decision_maker: contact?.isDecisionMaker ? "true" : "false",
          revon_imported_to_revon: lead.revon.importedToRevon ? "true" : "false",
          revon_push_status: lead.revon.pushStatus,
          revon_last_attempted_at: lead.revon.lastAttemptedAt ?? "",
        }),
      );
    });
  });

  return rows;
}

export async function buildPersistedSessionCsvExport(
  sessionId: string,
  leadIds?: string[],
): Promise<{ filename: string; content: string } | null> {
  const session = await getPersistedSession(sessionId);
  if (!session) {
    return null;
  }

  const rows = buildPersistedSessionCsvRows(session, leadIds);
  const header = [...persistedSessionCsvColumns];
  const csv = [
    header.join(","),
    ...rows.map((row) =>
      header
        .map((column) => escapeCsv(row[column]))
        .join(","),
    ),
  ].join("\n");

  return {
    filename: `${session.id}-export.csv`,
    content: `\uFEFF${csv}`,
  };
}

export function serializePersistedSessionJsonExport(payload: PersistedSessionJsonExport): string {
  return JSON.stringify(payload, null, 2);
}

export function isExportPayloadTooLarge(content: string): boolean {
  return exceedsExportLimit(content);
}

export async function updatePersistedImportState(
  sessionId: string,
  pushState: Partial<RunPushState>,
): Promise<void> {
  ensurePersistenceReady();
  const db = getDatabase();
  const assignments: string[] = ["updated_at = @updatedAt"];
  const params: Record<string, string | number | null> = {
    updatedAt: new Date().toISOString(),
    id: sessionId,
  };

  if (pushState.status !== undefined) {
    assignments.push("import_status = @importStatus");
    params.importStatus = pushState.status;
  }
  if (pushState.dryRun !== undefined) {
    assignments.push("import_dry_run = @importDryRun");
    params.importDryRun = pushState.dryRun ? 1 : 0;
  }
  if (pushState.destination !== undefined) {
    assignments.push("import_destination = @importDestination");
    params.importDestination = pushState.destination;
  }
  if (pushState.requestId !== undefined) {
    assignments.push("import_request_id = @importRequestId");
    params.importRequestId = pushState.requestId;
  }
  if (pushState.message !== undefined) {
    assignments.push("import_message = @importMessage");
    params.importMessage = pushState.message;
  }
  if (pushState.error !== undefined) {
    assignments.push("import_error = @importError");
    params.importError = pushState.error;
  }
  if (pushState.pushedAt !== undefined) {
    assignments.push("import_pushed_at = @importPushedAt");
    params.importPushedAt = pushState.pushedAt;
  }

  db.prepare(
    `UPDATE discovery_sessions SET ${assignments.join(", ")} WHERE id = @id`,
  ).run(params);
}

export async function updatePersistedLeadQualification(
  sessionId: string,
  leadId: string,
  update: {
    operatorQualificationState: "qualified" | "review" | "unqualified" | null;
    reason?: string | null;
  },
): Promise<void> {
  ensurePersistenceReady();
  const db = getDatabase();
  const updatedAt = new Date().toISOString();

  db.prepare(
    `
      UPDATE discovery_leads
      SET
        updated_at = @updatedAt,
        operator_qualification_state = @operatorQualificationState,
        operator_override_reason = @operatorOverrideReason,
        operator_override_updated_at = @operatorOverrideUpdatedAt
      WHERE session_id = @sessionId AND id = @leadId
    `,
  ).run({
    updatedAt,
    sessionId,
    leadId,
    operatorQualificationState: update.operatorQualificationState,
    operatorOverrideReason: update.reason ?? null,
    operatorOverrideUpdatedAt: updatedAt,
  });

  db.prepare(
    `
      UPDATE discovery_sessions
      SET qualified_lead_count = (
        SELECT COUNT(*)
        FROM discovery_leads
        WHERE session_id = ? AND COALESCE(operator_qualification_state, qualification_state) = 'qualified'
      )
      WHERE id = ?
    `,
  ).run(sessionId, sessionId);
}

export async function updatePersistedLeadRevonStates(
  sessionId: string,
  updates: Array<{
    leadId: string;
    state: PersistedLeadRevonState;
  }>,
): Promise<void> {
  if (updates.length === 0) {
    return;
  }

  ensurePersistenceReady();
  const db = getDatabase();
  const existingStates = readExistingLeadRevonStates(sessionId);
  const statement = db.prepare(
    `
      UPDATE discovery_leads
      SET
        updated_at = @updatedAt,
        revon_imported_to_revon = @importedToRevon,
        revon_push_status = @pushStatus,
        revon_last_attempted_at = @lastAttemptedAt,
        revon_last_succeeded_at = @lastSucceededAt,
        revon_last_request_id = @requestId,
        revon_last_error = @error
      WHERE session_id = @sessionId AND id = @leadId
    `,
  );

  const updatedAt = new Date().toISOString();
  db.exec("BEGIN");
  try {
    updates.forEach(({ leadId, state }) => {
      const previousState = existingStates.get(leadId);
      const normalizedState = persistedLeadRecordSchema.shape.revon.parse({
        importedToRevon: state.importedToRevon,
        pushStatus: normalizePersistedLeadPushStatus(state.pushStatus),
        lastAttemptedAt: state.lastAttemptedAt,
        lastSucceededAt: state.lastSucceededAt,
        requestId: state.requestId,
        error: state.error ?? previousState?.error ?? null,
      });

      statement.run({
        updatedAt,
        sessionId,
        leadId,
        importedToRevon: normalizedState.importedToRevon ? 1 : 0,
        pushStatus: normalizedState.pushStatus,
        lastAttemptedAt: normalizedState.lastAttemptedAt,
        lastSucceededAt: normalizedState.lastSucceededAt,
        requestId: normalizedState.requestId,
        error: normalizedState.error,
      });
    });
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function resetPersistenceStore(): void {
  ensurePersistenceReady();
  const db = getDatabase();
  db.exec("DELETE FROM discovery_contacts;");
  db.exec("DELETE FROM discovery_leads;");
  db.exec("DELETE FROM discovery_sessions;");
}
