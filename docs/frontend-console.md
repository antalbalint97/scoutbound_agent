# Frontend Console

The operator console is the primary interface for managing sourcing runs, viewing results, and exporting leads.

The console is implemented in the `apps/web/src/pages/` directory.

## Operator Console Routes

- `/console` or `/console/runs`: The dashboard for viewing all active and previous sourcing runs.
- `/console/sessions`: The list of saved sourcing sessions for review.
- `/console/session/:id`: The detailed view of a specific sourcing session, including its full lifecycle and results.

## Key Features

### 1. Workflow Launch
The frontend provides a user interface for defining the Ideal Customer Profile (ICP) and launching new sourcing runs.

### 2. Session Inspection
Users can inspect the detailed progress of an active run, including real-time status updates for each orchestration stage.

### 3. Evidence Drawer
For each lead found, the console provides an evidence drawer where users can see the specific signals and data extracted by the TinyFish agents.

### 4. Export Surface
Qualified leads can be exported as a CSV or via integration with supported CRM systems.

### 5. CRM Sync Panel
A dedicated panel for syncing leads to a CRM for outreach. This feature is currently visible but disabled in 'submission' or 'standalone' builds to maintain architectural visibility while preventing live external sync.

## Reference
- `apps/web/src/pages/ConsoleRunsPage.tsx`
- `apps/web/src/pages/ConsoleSessionsPage.tsx`
- `apps/web/src/pages/SavedSessionDetailPage.tsx`
