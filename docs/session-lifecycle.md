# Session Lifecycle

The end-to-end session lifecycle in Revon-TinyFish describes the entire process from a user initiating a sourcing run to the results being durably stored and ready for export. The system maintains two parallel representations of a session: an **in-memory run** (live orchestration) and a **persisted session** (durable SQLite record).

## State Stores

| Store | File | Scope | Purpose |
|---|---|---|---|
| `runStore` | `services/runStore.ts` | In-memory | Live orchestration state, step statuses, scored leads |
| `sessionStore` | `services/sessionStore.ts` | In-memory | TinyFish job tracking per candidate (inspection job IDs, submission times) |
| `telemetryStore` | `services/telemetryStore.ts` | In-memory | Per-run TinyFish metrics: durations, credit usage, status history |
| `persistenceService` | `services/persistenceService.ts` | SQLite | Durable session records written at run completion |

## In-Memory Run Lifecycle States

The `runStore` tracks the following status values on each `DemoRun` object:

| Status | Description |
|---|---|
| `created` | Run object initialized; orchestration not yet started |
| `discovery_running` | Directory discovery task submitted to TinyFish; polling active |
| `inspection_running` | Website inspection tasks submitted for all candidates; polling active |
| `aggregating_results` | All inspections terminal; scoring and ranking in progress |
| `completed` | All steps finished successfully; leads are ready |
| `partial` | Finished, but one or more inspections failed or timed out |
| `failed` | Fatal error during orchestration (discovery failure, unrecoverable exception) |

```text
    created
       ↓
discovery_running
       ↓
inspection_running
       ↓
aggregating_results
       ↓
  completed / partial
```

Step-level status is tracked separately for each orchestration stage via `setStepStatus()`, allowing the frontend `RunTimeline` component to show granular progress within a run.

## Session Lifecycle — Step by Step

### 1. Session Creation
`POST /api/runs` validates the ICP input (via Zod schemas from `@revon-tinyfish/contracts`), generates a UUID `runId`, and calls `startDiscoveryRun()`. The in-memory run is created with status `created`. A `TelemetrySession` is initialized in `telemetryStore`. The API responds immediately with HTTP 202 and `{ runId }`.

### 2. Directory Discovery Submission
`discoveryRun.ts` calls `createDirectoryDiscoveryTask()` to build the Clutch.co URL and extraction goal, then submits it to TinyFish via `startTinyFishAutomationAsync()`. The returned `runId` from TinyFish is stored in `sessionStore` via `setDirectorySessionJob()`. Run status transitions to `discovery_running`.

### 3. Discovery Polling
The polling loop calls `getTinyFishRunsByIds()` (batch endpoint) on each tick (`pollIntervalMs`). On `COMPLETED`, `parseDirectoryDiscoveryResult()` extracts the `DirectoryCandidate[]` array. On `FAILED`, the run transitions to `failed`. Telemetry is updated on each poll cycle via `updateTinyFishRunTelemetry()`.

### 4. Inspection Submission
Candidates (capped at `maxCompaniesToInspect`) are fanned out to parallel `startTinyFishAutomationAsync()` calls, respecting `inspectionConcurrency`. Each active job is registered in `sessionStore` via `upsertInspectionSessionJob()`. Run status transitions to `inspection_running`.

### 5. Inspection Polling
The polling loop runs again, now tracking multiple concurrent run IDs. As each inspection completes, `parseWebsiteInspectionResult()` converts the raw payload into a `WebsiteInspection`. Timed-out runs produce a `createFailedInspection()` placeholder. Progress is reflected in the run store via `updateInspectionSessionJob()`.

### 6. Lead Aggregation
Once all inspections are terminal, `processLeadCandidates()` pipelines each `InspectedCandidate` through the TypeScript scorer. Scored leads are written to the run store via `updateRunLeads()`. `updateSummary()` computes aggregate metrics: `qualifiedLeadCount`, `usableLeadCount`, `decisionMakersFound`, `partialLeadCount`. Status transitions to `aggregating_results` then `completed` (or `partial`).

### 7. Session Persistence
`persistRunSnapshotSafely()` serializes the completed run to SQLite:

- **`discovery_sessions`** table — top-level session record with status, mode, summary counts, ICP input JSON, step progress JSON, import state
- **`discovery_leads`** table — one row per scored lead, with all score fields as columns plus JSON blobs for evidence, field assessments, raw extraction, and score explanations
- **`discovery_contacts`** table — one row per team member extracted from a lead's website inspection

Indexes on `started_at`, `experiment_label`, `status`, `session_id + rank_order`, and `company_domain` support efficient querying.

### 8. Export Readiness
Once persisted, the session is accessible at `GET /api/sessions/:id` and its leads can be exported via `GET /api/sessions/:id/export.csv` or `.json`. Exports can be scoped to a subset of lead IDs via `?leadIds=` query parameter.

## Lead Qualification State Machine

Each lead carries a `qualificationState` set by the scorer, which can be overridden by the operator:

| State | Set by | Meaning |
|---|---|---|
| `qualified` | Scorer or operator | Lead meets ICP threshold; eligible for Revon push |
| `review` | Scorer or operator | Borderline lead; requires manual inspection |
| `unqualified` | Scorer or operator | Lead does not meet threshold; excluded from push |

The effective state (used by export and push filtering) is resolved by `effectiveQualificationState()` in `domain/leads/effectiveQualification.ts`: operator override takes precedence, falling back to the scorer's decision.

## Revon Push State Machine

After session completion, qualified leads can be pushed to Revon. Push state is tracked on the persisted session:

| `pushStatus` | Meaning |
|---|---|
| `idle` | No push attempted yet |
| `running` | Push in progress |
| `succeeded` | All selected leads pushed successfully |
| `dry_run` | Push simulated (`REVON_DRY_RUN=true`); no data written to Revon |
| `failed` | Push encountered an error |

Per-lead Revon state is tracked separately in `discovery_leads` via the migration in `002_add_revon_handoff_to_leads.sql`, including `importedToRevon`, `pushStatus`, `lastAttemptedAt`, `lastSucceededAt`, `requestId`, and `error`.

## Database Schema Overview

Schema is applied via sequential migrations in `apps/api/db/migrations/`:

| Migration | Change |
|---|---|
| `001_init.sql` | Creates `discovery_sessions`, `discovery_leads`, `discovery_contacts`, `schema_migrations` |
| `002_add_revon_handoff_to_leads.sql` | Adds per-lead Revon push tracking columns |
| `003_normalize_revon_push_statuses.sql` | Normalizes Revon push status values |
| `004_add_lead_qualification_overrides.sql` | Adds `operatorQualificationState` and `qualificationOverrideReason` columns |

## Console Inspection Flow

1. Operator launches run via `IcpForm` on `/console/runs`
2. Frontend receives `runId`, begins polling `GET /api/runs/:runId`
3. `RunTimeline` reflects step transitions in near-real time
4. On completion, run is automatically persisted to SQLite
5. Operator navigates to `/console/sessions` → `/console/session/:id`
6. `SavedSessionDetailPage` loads the persisted detail, evidence drawer, telemetry, and export panel

## Reference Files

- `apps/api/src/services/runStore.ts`
- `apps/api/src/services/sessionStore.ts`
- `apps/api/src/services/telemetryStore.ts`
- `apps/api/src/services/persistenceService.ts`
- `apps/api/src/domain/leads/effectiveQualification.ts`
- `apps/api/db/migrations/`
