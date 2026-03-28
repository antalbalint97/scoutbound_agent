# Revon Autonomous Lead Discovery Agent

Focused TinyFish hackathon prototype for autonomous lead discovery. This repo is a public, reviewable demo slice of Revon, not the private full product.

## What is public here

- Demo frontend
- Orchestration API
- TinyFish prompts, parsing, and adapters
- Shared contracts and schemas
- Narrow Revon push adapter

## What stays private in Revon

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
5. Run `npm run dev`

The web app defaults to `http://localhost:5173` and proxies API calls to `http://localhost:8787`.

## Environment variables

- `PORT`
- `WEB_ORIGIN`
- `TINYFISH_API_KEY`
- `TINYFISH_BASE_URL`
- `TINYFISH_FORCE_MOCK`
- `TINYFISH_ENABLE_MOCK_FALLBACK`
- `REVON_IMPORT_URL`
- `REVON_API_TOKEN`
- `REVON_IMPORT_MODE`
- `REVON_DRY_RUN`

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
2. Decide whether Revon push should be `live` or `dry-run`
3. Start the app with `npm run dev`
4. Open the UI and confirm the Revon destination badge is what you expect
5. Use the recommended preset for the safest live path

During the demo:

1. Point out the mode badges before starting the run
2. Start the run and narrate the step timeline as TinyFish moves through directory discovery and website inspection
3. Open one or two leads and show the evidence panel
4. Call out the score reasons and any quality notes
5. Push the qualified leads to Revon and mention whether it is a live push or a dry-run

## Recovery notes

If TinyFish is slower than expected:

- Let the timeline run; it will show `running`, `partial`, or `failed` per step
- If the run degrades, say so explicitly and continue with the returned evidence-backed leads

If live discovery fails entirely:

- With `TINYFISH_ENABLE_MOCK_FALLBACK=true`, the run can degrade into explicit mock backup mode
- The UI will label that mode clearly
- Do not present that run as live TinyFish output

If Revon push is not configured:

- Leave `REVON_DRY_RUN=true`
- The push step will stay reviewable and explicit without touching private infrastructure

## Verification

- `npm run typecheck`
- `npm run build`
