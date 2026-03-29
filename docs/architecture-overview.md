# Architecture Overview

Revon-TinyFish is an autonomous outbound prospect sourcing application that leverages web agents to navigate live company websites, score fit, and extract contact signals.

## System Components

### Vercel Frontend
The frontend is a React/Vite application hosted on Vercel. It provides the operator console for launching sourcing workflows, inspecting results, and managing sessions. It communicates with the Backend API via REST. The frontend source lives in `apps/web/`.

### Railway Backend
The backend is a Node.js/Express API hosted on Railway. It handles orchestration of the sourcing runs, manages in-memory run state, persists sessions to SQLite, and integrates with external services (TinyFish and Revon). The backend source lives in `apps/api/`.

### TinyFish Automation Layer
TinyFish provides the core web automation capabilities. The backend submits tasks to TinyFish (directory discovery, website inspection) which are executed by autonomous agents. The integration supports two execution modes:

- **SSE mode** (`run-sse`): synchronous streaming via Server-Sent Events, used for single blocking calls
- **Async mode** (`run-async`): fire-and-forget submission with a polling loop, used for parallelized website inspections

### Session Persistence Layer
The system maintains two parallel state stores:

- **In-memory run store** (`runStore.ts`): holds live run state during active orchestration, including step-level status and lead results
- **SQLite persistence** (`persistenceService.ts`): durably stores completed sessions (schema defined in `db/migrations/`) for historical review and export. Tables: `discovery_sessions`, `discovery_leads`, `discovery_contacts`

Telemetry is tracked separately in `telemetryStore.ts` and joined at persistence time.

### Revon Integration
Completed and qualified leads can be pushed to Revon (the parent lead scoring platform) via a configurable webhook. This is handled by `apps/api/src/integrations/revon/`. The push supports a **dry-run mode** (`REVON_DRY_RUN=true`) that simulates the push without writing to Revon.

## API Surface

The Express app exposes the following route groups (defined in `apps/api/src/app.ts`):

| Route prefix | Description |
|---|---|
| `GET /api/health` | Health check — returns service name and current timestamp |
| `POST /api/runs` | Start a new discovery run (accepts ICP payload, responds 202 with `runId`) |
| `GET /api/runs/:runId` | Poll live in-memory run status |
| `POST /api/runs/:runId/push` | Push qualified leads from an active run to Revon |
| `GET /api/sessions` | List persisted sessions (paginated, cursor-based) |
| `GET /api/sessions/:sessionId` | Get persisted session detail |
| `GET /api/sessions/:sessionId/export.csv` | Export session leads as CSV |
| `GET /api/sessions/:sessionId/export.json` | Export session leads as JSON |
| `POST /api/sessions/:sessionId/push` | Push qualified leads from a persisted session to Revon |
| `PATCH /api/sessions/:sessionId/leads/:leadId/qualification` | Override lead qualification state |
| `GET /api/telemetry` | Query telemetry sessions and experiment variant summaries |
| `GET /api/revon/status` | Check Revon adapter configuration status |

## Run Modes

The system supports **live** and **mock** execution modes, resolved at runtime by `resolveLiveMode()` in `discoveryRun.ts`:

- **Live**: requires a valid `TINYFISH_API_KEY`; agents navigate real websites
- **Mock**: activated by `TINYFISH_FORCE_MOCK=true` or by omitting `TINYFISH_API_KEY`; uses pre-seeded sample data from `mocks/sampleLeads.ts`
- **Mock fallback** (`TINYFISH_ENABLE_MOCK_FALLBACK=true`): allows graceful degradation to mock if live runs fail

The active mode is recorded on each run and persisted with the session for experiment tracking purposes.

## Experiment Tracking

Every run is tagged with an `experimentLabel` (auto-composed or operator-supplied) that encodes the active configuration variants: discovery prompt version, inspection depth label, concurrency setting, and scorer variant. This label is indexed in the database and surfaced in the telemetry API.

## Request Flow

```text
User → Frontend (ICP form submit)
        ↓
      POST /api/runs  (202 Accepted → runId)
        ↓
      discoveryRun.ts orchestrator (async, fire-and-forget)
        ├── TinyFish run-async: Directory Discovery (Clutch.co)
        │       ↓ polling loop (batch endpoint)
        ├── Parse candidates → up to N company URLs
        │       ↓
        ├── TinyFish run-async × N: Website Inspections (parallel, concurrency-limited)
        │       ↓ polling loop
        ├── Score & rank all leads (ranking.ts)
        │       ↓
        └── Persist to SQLite (persistenceService.ts)
                ↓
      Frontend polls GET /api/runs/:runId → live progress
      Frontend reads GET /api/sessions/:id → final results
```
