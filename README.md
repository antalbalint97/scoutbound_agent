# Revon TinyFish Demo

Isolated hackathon prototype for autonomous lead acquisition with TinyFish.

## What is public here

- Demo frontend
- Orchestration API
- TinyFish prompts and adapters
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

## Local development

1. Copy `.env.example` to `.env`
2. Fill `TINYFISH_API_KEY` for live browsing
3. Optionally configure `REVON_IMPORT_URL` and `REVON_API_TOKEN`
4. Run `npm install`
5. Run `npm run dev`

The web app defaults to `http://localhost:5173` and proxies API calls to `http://localhost:8787`.

If TinyFish is not configured, the API falls back to deterministic mock data so the demo still runs end to end.

