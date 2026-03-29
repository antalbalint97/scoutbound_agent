# Frontend Console

The operator console is the primary interface for managing sourcing runs, viewing results, and exporting leads. The frontend is a React/Vite/TypeScript app located in `apps/web/`.

All backend communication goes through the typed API client in `apps/web/src/lib/api.ts`.

## Operator Console Routes

Routing is defined in `apps/web/src/App.tsx` and `apps/web/src/lib/routes.ts`.

| Route | Component | Purpose |
|---|---|---|
| `/console` or `/console/runs` | `ConsoleRunsPage.tsx` | Live dashboard — launch runs and track active progress |
| `/console/sessions` | `ConsoleSessionsPage.tsx` | Paginated list of persisted historical sessions |
| `/console/session/:id` | `SavedSessionDetailPage.tsx` | Full detail view of a persisted session — leads, telemetry, export |
| `/demo` | `TinyFishDemoPage.tsx` | Standalone demo mode page for hackathon submission builds |

## Key Pages

### ConsoleRunsPage (`/console/runs`)
The primary workspace during a live run. Renders the ICP form, tracks the active run via polling (`GET /api/runs/:runId`), and displays the `RunTimeline` and `LeadTable` as results arrive. Polling continues until the run reaches a terminal status (`completed` or `partial`).

### ConsoleSessionsPage (`/console/sessions`)
Loads the paginated session list from `GET /api/sessions` (cursor-based pagination). Each item shows session metadata: status, mode, qualified lead count, created timestamp. Clicking a session navigates to its detail view.

### SavedSessionDetailPage (`/console/session/:id`)
Loads a full persisted session from `GET /api/sessions/:id`. Renders the complete lead table with scoring details, the evidence drawer for each lead, the telemetry panel, and the export and Revon sync surfaces.

## Components

| Component | File | Description |
|---|---|---|
| `ConsoleLayout` | `ConsoleLayout.tsx` | Top-level shell with navigation header and layout wrapper |
| `IcpForm` | `IcpForm.tsx` | Form for entering the Ideal Customer Profile: target market, location, company size, decision-maker role, keywords, max results. Includes demo presets from `demoPresets.ts` |
| `RunTimeline` | `RunTimeline.tsx` | Step-by-step progress visualization for the active run: discovery → inspection → aggregation → complete |
| `LeadTable` | `LeadTable.tsx` | Live lead results table during an active run, with score and qualification columns |
| `SessionLeadTable` | `SessionLeadTable.tsx` | Enriched lead table for persisted sessions, includes per-lead qualification override controls |
| `EvidencePanel` | `EvidencePanel.tsx` | Slide-out evidence drawer showing page-level findings and evidence items extracted by TinyFish for a selected lead |
| `ExportPanel` | `ExportPanel.tsx` | Export surface — triggers `GET /api/sessions/:id/export.csv` or `.json`, supports filtering by selected lead IDs |
| `PushToRevonButton` | `PushToRevonButton.tsx` | Triggers `POST /api/sessions/:id/push` for selected qualified leads; shows push status feedback |
| `TelemetryPanel` | `TelemetryPanel.tsx` | Displays per-run TinyFish telemetry: run IDs, durations, credit usage, status transitions |
| `SavedSessionList` | `SavedSessionList.tsx` | Session list row renderer used inside `ConsoleSessionsPage` |

## Key Features

### 1. Workflow Launch
The `IcpForm` component collects the ICP parameters and calls `POST /api/runs`. On 202 Accepted, the returned `runId` is stored in state (and optionally in `localStorage` via `persistedRun.ts`) so the run survives a browser refresh.

### 2. Live Progress Polling
`ConsoleRunsPage` polls `GET /api/runs/:runId` on a configurable interval while the run is active. Each poll updates the `RunTimeline` step statuses and appends any newly scored leads to `LeadTable`.

### 3. Lead Qualification Overrides
On the `SavedSessionDetailPage`, operators can manually override the system-assigned qualification state for any lead (`qualified`, `review`, or `unqualified`) via the `SessionLeadTable`. This calls `PATCH /api/sessions/:id/leads/:leadId/qualification` and updates the persisted session. The effective qualification state is resolved by `effectiveQualification.ts` (operator override takes precedence over the scorer's decision).

### 4. Evidence Drawer
Each lead row can expand an `EvidencePanel` that shows the raw structured findings from the TinyFish website inspection: per-page findings, evidence items with source URLs and confidence levels, missing fields, quality notes, and extracted team members.

### 5. Export Surface
The `ExportPanel` supports exporting the full session or a selection of leads as CSV or JSON. The JSON export can optionally include the raw telemetry payload (`includeTelemetry=true` query parameter). Exports are size-limited server-side (`MAX_EXPORT_MB` env var).

### 6. Revon Sync Panel
`PushToRevonButton` is visible in all builds but is **disabled in submission/standalone builds** (where `REVON_IMPORT_URL` is not configured) to maintain architectural visibility without triggering live external syncs. When enabled, the push creates a per-lead revon state record tracking `pushStatus` (pending → succeeded / failed / dry_run) and `lastSucceededAt`.

### 7. Demo Presets
`demoPresets.ts` provides pre-filled ICP examples that populate the `IcpForm` for demo or hackathon builds, reducing friction for evaluators.

## Frontend API Client (`apps/web/src/lib/api.ts`)

All API calls are routed through a typed `request<T>()` wrapper that:

- Resolves the base URL from `VITE_API_BASE_URL` (empty string = same-origin)
- Sets `Content-Type: application/json` automatically on POST bodies
- Forwards correlation IDs via the `X-Correlation-Id` header when available
- Throws structured `Error` objects for non-2xx responses, extracting the `error` field from the JSON body
- Validates responses against Zod schemas from `@revon-tinyfish/contracts`

## Reference Files

- `apps/web/src/App.tsx` — routing and top-level layout
- `apps/web/src/lib/routes.ts` — route constants
- `apps/web/src/lib/api.ts` — typed API client
- `apps/web/src/lib/persistedRun.ts` — localStorage run persistence across refreshes
- `apps/web/src/lib/leadQualification.ts` — effective qualification state helper
- `apps/web/src/demoPresets.ts` — ICP demo presets
- `apps/web/src/pages/ConsoleRunsPage.tsx`
- `apps/web/src/pages/ConsoleSessionsPage.tsx`
- `apps/web/src/pages/SavedSessionDetailPage.tsx`
- `apps/web/src/pages/TinyFishDemoPage.tsx`
