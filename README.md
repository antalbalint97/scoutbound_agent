# Scoutbound

Scoutbound is an autonomous outbound prospect sourcing application powered by TinyFish web agents. Scoutbound is designed as a sourcing module for the Revon outbound operations platform.

## What is public here

- Demo frontend
- Orchestration API
- TinyFish prompts, parsing, and adapters
- Shared contracts and schemas
- Narrow CRM push adapter (Revon-compatible)

## CRM integration and data privacy

- Auth and tenant logic
- Database models
- Internal queues and workers
- Proprietary scoring and enrichment internals
- CRM ingestion details beyond the adapter edge

## Repo layout

```text
apps/
  api/         Express orchestration service
  web/         Vite + React demo UI
packages/
  contracts/   Shared types and zod schemas
```

## Persistence layer

The demo now uses a thin SQLite persistence layer inside the API app. It stores:

- discovery sessions
- ranked leads
- extracted contacts
- telemetry snapshots
- scoring outputs
- evidence and raw extraction snapshots
- Revon import status

The database is file-backed, so completed sessions remain available after the in-memory run store expires.

## Live vs mock behavior

- `live`: TinyFish API key is configured and the app is attempting real browser automation
- `mock`: the run is explicitly using mock mode because `TINYFISH_FORCE_MOCK=true` or no API key is configured
- `degraded`: the run completed partially, or the live path degraded into mock fallback, or some inspections failed

The UI shows these states explicitly. Mock output is not presented as live output.

## Local development

1. Copy `.env.example` to `.env`
2. Set `TINYFISH_API_KEY` for live mode
3. Optionally configure `REVON_IMPORT_URL` and `REVON_API_TOKEN`
4. Run `npm install`
5. Run `npm run db:migrate`
6. Run `npm run dev`

The web app runs on `http://localhost:5173` and proxies `/api` to `http://localhost:8787` in Vite dev mode.

## Environment variables

- `NODE_ENV`
- `PORT`
- `WEB_ORIGIN`
- `VITE_API_BASE_URL`
- `DATABASE_URL`
- `TINYFISH_API_KEY`
- `TINYFISH_BASE_URL`
- `TINYFISH_ASYNC_URL`
- `TINYFISH_RUNS_BATCH_URL`
- `TINYFISH_FORCE_MOCK`
- `TINYFISH_ENABLE_MOCK_FALLBACK`
- `TINYFISH_POLL_INTERVAL_MS`
- `TINYFISH_ASYNC_RUN_TIMEOUT_MS`
- `TINYFISH_INSPECTION_CONCURRENCY`
- `TINYFISH_DISCOVERY_PROMPT_VARIANT`
- `TINYFISH_INSPECTION_DEPTH_LABEL`
- `SCORER_VARIANT_LABEL`
- `EXPERIMENT_LABEL`
- `TELEMETRY_MAX_SESSIONS`
- `MAX_EXPORT_MB`
- `REVON_IMPORT_URL`
- `REVON_API_TOKEN`
- `REVON_IMPORT_MODE`
- `REVON_DRY_RUN`

Example:

```env
NODE_ENV=development
WEB_ORIGIN=http://localhost:5173
VITE_API_BASE_URL=
DATABASE_URL=./data/revon-tinyfish-demo.sqlite
```

Notes:

- `WEB_ORIGIN` is a comma-separated allowlist for browser origins that may call the API cross-origin
- leave `VITE_API_BASE_URL` empty when the frontend and backend are served from the same origin or behind a reverse proxy
- set `VITE_API_BASE_URL=https://api.your-domain.com` when the frontend is hosted separately from the API
- `DATABASE_URL` may be an absolute path, a relative filesystem path, or `file:...`
- `MAX_EXPORT_MB` limits JSON or CSV export size in megabytes; when exceeded the API returns HTTP `413`

## Database setup

The API applies SQL migrations from `apps/api/db/migrations` into the SQLite file pointed to by `DATABASE_URL`.

Useful commands:

1. `npm run db:migrate`
2. `npm run dev`

The API also runs migrations automatically on startup, so a fresh local environment can come up with just `npm run dev` after dependencies are installed.

## Deployment

This repo is easiest to deploy as:

1. Static frontend on Vercel, Netlify, or Cloudflare Pages
2. Backend API on Render, Railway, or Fly.io
3. SQLite database file on a persistent disk attached to the backend service

### Deployment blockers that were fixed

- the backend database path used to depend on `process.cwd()`, which could break migrations and SQLite file resolution on hosts
- CORS used to fall open when `WEB_ORIGIN` was not set
- the frontend API base URL was implicit and not documented well enough for split frontend/backend hosting
- the repo did not have a clear root `npm start` path for backend deployment

### Required env vars

Backend:

- `NODE_ENV=production`
- `PORT`
- `WEB_ORIGIN`
- `DATABASE_URL`
- `TINYFISH_API_KEY`
- `TINYFISH_FORCE_MOCK=false`
- `TINYFISH_ENABLE_MOCK_FALLBACK=true` or `false`
- `REVON_DRY_RUN=true` unless you want real CRM sync
- `REVON_IMPORT_URL` and `REVON_API_TOKEN` for live CRM handoff

Frontend:

- `VITE_API_BASE_URL`

Recommended production examples:

```env
# Backend
NODE_ENV=production
PORT=8787
WEB_ORIGIN=https://tinyfish-demo.your-domain.com
DATABASE_URL=/data/revon.sqlite
TINYFISH_API_KEY=your_live_key
TINYFISH_FORCE_MOCK=false
TINYFISH_ENABLE_MOCK_FALLBACK=true
REVON_DRY_RUN=true
```

```env
# Frontend
VITE_API_BASE_URL=https://tinyfish-demo-api.your-domain.com
```

If you put the frontend and backend behind the same domain with a reverse proxy, keep:

```env
VITE_API_BASE_URL=
```

### Local run

1. `npm install`
2. `npm run db:migrate`
3. `npm run dev`

### Production run

Backend:

1. `npm install`
2. `npm run build`
3. `npm run db:deploy`
4. `npm start`

Frontend:

1. `npm install`
2. `npm run build`
3. Deploy `apps/web/dist` to your static host

You can locally sanity-check the production web build with:

1. `npm run build`
2. `npm run preview:web`

### Frontend hosting

For a separate frontend host:

- deploy `apps/web/dist`
- set `VITE_API_BASE_URL` to the public backend origin
- set backend `WEB_ORIGIN` to the public frontend origin

For same-origin hosting behind a reverse proxy:

- serve the built frontend as static files
- proxy `/api` to the backend service
- keep `VITE_API_BASE_URL` empty
- set `WEB_ORIGIN` to the public app origin

### Backend hosting

Recommended minimal backend requirements:

- Node 22+
- persistent disk for SQLite
- outbound network access for TinyFish and optional CRM webhook calls

If your host does not support a persistent disk, keep the same code and move to Postgres later. For this hackathon repo, SQLite plus a disk is the thinnest reliable setup.

### Reverse proxy example

Use a same-origin setup when possible:

```nginx
server {
  listen 80;
  server_name tinyfish-demo.example.com;

  location /api/ {
    proxy_pass http://127.0.0.1:8787/api/;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location / {
    root /var/www/revon-tinyfish-demo;
    try_files $uri /index.html;
  }
}
```

### SQLite persistent disk example

```env
DATABASE_URL=/data/revon.sqlite
```

Mount `/data` on a persistent volume in your host platform.

## Persisted session API

These routes expose completed saved sessions:

1. `GET /api/sessions`
2. `GET /api/sessions/:sessionId`
3. `GET /api/sessions/:sessionId/export`
4. `POST /api/sessions/:sessionId/push`
5. `POST /api/sessions/:sessionId/push-to-revon`

`GET /api/sessions` also supports:

- `limit`
- `cursor`

The response includes:

- `items`
- `nextCursor`
- `sessions` as a compatibility alias for `items`

## Export JSON schema contract

`GET /api/sessions/:id/export.json`

Root fields:

- `exportType`
- `export_version`
- `export_schema`
- `exportedAt`
- `session`
- `leads`

Current values:

- `export_version`: `v1`
- `export_schema`: `revon.discovery.session.export.v1`

By default telemetry is included. Use `?includeTelemetry=false` to exclude it.

## Export CSV column contract

`GET /api/sessions/:id/export.csv`

Review-friendly columns:

- session metadata: `session_id`, `experiment_label`, `session_status`, `session_mode`, `session_quality`
- lead identity: `lead_rank`, `lead_id`, `company_name`, `company_domain`, `website_url`, `directory_url`
- qualification and scores: `qualification_state`, `priority`, `confidence`, `inspection_status`, `total_score`, `fit_score`, `contactability_score`, `quality_score`, `decision_maker_score`
- review context: `ranking_reasons_joined`, `quality_notes`, `services`, `evidence_count`
- top evidence preview: `top_evidence_title`, `top_evidence_url`, `top_evidence_summary`
- contacts: `contact_name`, `contact_role`, `contact_email`, `contact_linkedin_url`, `contact_is_decision_maker`
- Revon handoff review: `revon_imported_to_revon`, `revon_push_status`, `revon_last_attempted_at`

The CSV includes a UTF-8 BOM for Excel compatibility.

## CRM sync payload structure

The CRM handoff stays narrow and agent-native:

- `source`
- `runId`
- `sentAt`
- `leads`

Each pushed lead preserves:

- company/contact fields
- `agent_session_id`
- `tinyfish_run_ids`
- `capture_mode`
- `inspection_status`
- `qualification_state`
- `raw_payload`

`raw_payload` keeps:

- evidence sources
- field confidence
- uncertainty
- raw extraction
- score data
- summary and services

## Recommended demo path

Use the preset:

- `London digital agencies`

Why this is the safest path:

- It maps to a known supported directory strategy in the current prototype
- It keeps the ICP simple and explainable to judges
- It usually yields a small list of service firms with visible websites, team pages, or contact paths

Recommended run settings:

- Target market: `Digital marketing`
- Location: `London`
- Company size: `11-50`
- Keywords: `B2B, SaaS, growth`
- Target role: `Founder`
- Max results: `5`

## Operator checklist

Before the demo:

1. Confirm `.env` is present and `TINYFISH_API_KEY` is set
2. Decide whether CRM sync should be `live` or `dry-run`
3. Start the app with `npm run dev`
4. Open the UI and confirm the CRM destination badge is what you expect
5. Use the recommended preset for the safest live path

During the demo:

1. Point out the mode badges before starting the run
2. Start the run and narrate the step timeline as TinyFish moves through directory discovery and website inspection
3. Open one or two leads and show the evidence panel
4. Call out the score reasons and any quality notes
5. Push the qualified leads to CRM and mention whether it is a live sync or a dry-run

## Recovery notes

If TinyFish is slower than expected:

- Let the timeline run; it will show `running`, `partial`, or `failed` per step
- If the run degrades, say so explicitly and continue with the returned evidence-backed leads

If live discovery fails entirely:

- With `TINYFISH_ENABLE_MOCK_FALLBACK=true`, the run can degrade into explicit mock backup mode
- The UI will label that mode clearly
- Do not present that run as live TinyFish output

If CRM sync is not configured:

- Leave `REVON_DRY_RUN=true`
- The sync step will stay reviewable and explicit without touching private infrastructure

## Verification

- `npm run typecheck`
- `npm run build`
