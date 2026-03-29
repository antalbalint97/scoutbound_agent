# TinyFish Integration

The Revon-TinyFish backend integrates with the TinyFish API to execute autonomous web agents for company directory discovery and deep website inspection. The integration logic lives in `apps/api/src/integrations/tinyfish/`.

## Endpoints Used

| Endpoint | Env var | Default | Usage |
|---|---|---|---|
| `POST /v1/automation/run-sse` | `TINYFISH_BASE_URL` | `https://agent.tinyfish.ai/v1/automation/run-sse` | Synchronous SSE streaming (single blocking call) |
| `POST /v1/automation/run-async` | `TINYFISH_ASYNC_URL` | `https://agent.tinyfish.ai/v1/automation/run-async` | Async fire-and-forget submission; returns `run_id` |
| `POST /v1/runs/batch` | `TINYFISH_RUNS_BATCH_URL` | `https://agent.tinyfish.ai/v1/runs/batch` | Batch status poll for multiple active run IDs |

Authentication is via the `X-API-Key` header, populated from `TINYFISH_API_KEY`.

## Execution Modes

### SSE Mode (`runTinyFishAutomation`)
Used by directory discovery (single sequential call). Posts `{ url, goal }` to `run-sse` and reads the response as a Server-Sent Events stream. The stream is parsed by `readTinyFishStream()`, which:

- Decodes chunks incrementally using a `TextDecoder` with a rolling `buffer`
- Splits on `\r?\n\r?\n` to isolate individual SSE event blocks
- Extracts `data:` lines and parses as JSON
- Handles `PROGRESS`, `COMPLETE`, `ERROR`, and `FAILED` event types
- Resolves with the `result` or `resultJson` payload from the `COMPLETE` event
- Enforces a `timeoutMs` ceiling (default: `180_000 ms`)

### Async Mode (`startTinyFishAutomationAsync`)
Used for all website inspection tasks. Posts `{ url, goal }` to `run-async` and expects a JSON response containing `run_id`. The run ID is stored in the session store and entered into the polling loop. This mode allows many runs to execute concurrently without holding open HTTP connections.

### Batch Polling (`getTinyFishRunsByIds`)
Posts `{ run_ids: string[] }` to `runs/batch`. Returns `{ data: TinyFishRunResponse[], not_found: string[] }`. Each response item is normalized into a `TinyFishRunSnapshot`:

```typescript
interface TinyFishRunSnapshot {
  runId: string;
  status: TinyFishAsyncRunStatus;   // normalized enum
  rawStatus: string;                 // original string from API
  result: unknown;
  error: string | null;
  creditUsage: number | null;
  createdAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  streamingUrl: string | null;
}
```

## Status Normalization

`normalizeTinyFishRunStatus()` maps raw API status strings (case-insensitive) to the internal `TinyFishAsyncRunStatus` enum:

| Raw API value | Normalized |
|---|---|
| `COMPLETED` | `completed` |
| `FAILED`, `ERROR` | `failed` |
| `CANCELLED`, `CANCELED` | `cancelled` |
| `QUEUED`, `PENDING`, `STARTED` | `queued` |
| anything else | `running` |

## Credit Usage Extraction

`extractCreditUsage()` attempts to read credit usage from multiple possible response shapes in order: `credit_usage`, `creditUsage`, `usage.credit_usage`, `usage.credits_used`, `usage.total_credits`, `metadata.credit_usage`, `metadata.credits_used`, `metadata.total_credits`. This handles API response format variations across TinyFish versions.

## Agent Prompts

Prompts are generated in `apps/api/src/integrations/tinyfish/prompts.ts`.

### Directory Discovery Goal (`buildDirectoryGoal`)
Instructs the agent to extract up to N company listings from a single Clutch.co directory page. Key constraints baked into the prompt:

- Use only information visible on the current page; do not paginate
- Do not click through to external company websites
- Do not score, rank, or qualify leads
- Return null for any missing fields
- Output: a JSON array with exact keys (`company_name`, `website_url`, `directory_url`, `location`, `short_description`, `primary_service`, `employee_range`, `rating`, `listing_facts`, `evidence_snippet`, `quality_notes`)

### Directory URL Construction (`buildDirectoryUrl`)
Maps ICP fields to a Clutch.co URL using two static path maps:

- `LOCATION_PATH_MAP`: e.g., `"budapest"` → `/hu/budapest`, `"us"` → `/us`, `"global"` → `""`
- `MARKET_PATH_MAP`: e.g., `"ai automation"` → `/developers/artificial-intelligence`, `"seo"` → `/agencies/seo`

Unmapped values fall back to `""` (location) or `"/agencies"` (market).

### Website Inspection Goal (`buildWebsiteGoal`)
Instructs the agent to inspect a company's website (homepage → contact → about → team pages) and return lean structured JSON. Key constraints:

- Factual extraction only; no lead qualification or scoring
- Do not invent team members, titles, or emails
- Only include emails explicitly visible on the page
- Uncertain data goes into `uncertain_fields`, not promoted to facts
- Output: a single JSON object with keys: `summary`, `services`, `emails`, `contact_page_url`, `about_page_url`, `team_page_url`, `team[]`, `evidence[]`, `page_findings[]`, `missing_fields`, `uncertain_fields`, `quality_notes`

## Result Parsing

`apps/api/src/integrations/tinyfish/parseResults.ts` handles the conversion of raw TinyFish result payloads into validated domain objects using Zod schemas from `@revon-tinyfish/contracts`:

- `parseDirectoryCandidates(raw)` → `{ candidates: DirectoryCandidate[], warnings: string[] }`
- `parseWebsiteInspection(raw, websiteUrl)` → `WebsiteInspection`

Parsing is lenient: individual field failures produce warnings rather than full errors, allowing partial results to propagate through the scoring pipeline.

## Mock Mode

When `TINYFISH_FORCE_MOCK=true` or `TINYFISH_API_KEY` is absent, all TinyFish calls are replaced by `createMockDirectoryDiscovery()` and `createMockWebsiteInspection()` from `apps/api/src/mocks/sampleLeads.ts`. These return deterministic pre-seeded data, making the full orchestration flow runnable without API credentials. The mock mode and its reason are recorded on the run object.

If `TINYFISH_ENABLE_MOCK_FALLBACK=true` (the default), a live run that fails due to API errors will attempt to continue with mock data rather than failing the entire run.

## Error Handling

- **Network errors**: Propagate as `Error` with HTTP status and status text
- **Stream failures**: `readTinyFishStream()` rejects with a descriptive message; timeout triggers `fail()` after `timeoutMs`
- **Run-level failures**: Async runs with `FAILED` status produce a `createFailedInspection()` placeholder; the run ultimately reaches `partial` rather than `failed`
- **Missing run IDs**: Reported in `TinyFishBatchRunSnapshotResult.notFound`; logged but non-fatal
- **Async submit without run_id**: `extractTinyFishErrorMessage()` extracts the most informative error message from `{ message, error, detail, code }` fields

## Trace Logging

All TinyFish client operations emit structured `logApiTrace()` events with a `correlationId`, `runId`, and `invocationKey`. The `invocationKey` is deterministically constructed from the run ID, operation suffix, and target URL, enabling deduplication in the telemetry store. Trace events include: `tinyfish.client.invoke`, `tinyfish.client.stream.attach`, `tinyfish.client.event.first`, `tinyfish.client.event`, `tinyfish.client.async.submit`, `tinyfish.client.async.poll`, `tinyfish.client.async.poll.response`.

## Reference Files

- `apps/api/src/integrations/tinyfish/client.ts` — HTTP client, SSE stream reader, batch poller
- `apps/api/src/integrations/tinyfish/discoverCompanies.ts` — directory discovery task builder and parser
- `apps/api/src/integrations/tinyfish/inspectWebsite.ts` — website inspection task builder and parser
- `apps/api/src/integrations/tinyfish/prompts.ts` — goal string generators and URL builders
- `apps/api/src/integrations/tinyfish/parseResults.ts` — raw payload to domain object conversion
- `apps/api/src/mocks/sampleLeads.ts` — mock data for offline / no-key operation
