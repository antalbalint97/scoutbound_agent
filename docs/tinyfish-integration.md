# TinyFish Integration

The Scoutbound backend integrates with the TinyFish API to execute autonomous web agents for company discovery and website inspection.

The integration logic is located in `apps/api/src/integrations/tinyfish/`.

## TinyFish Endpoint Usage

The backend communicates with the TinyFish API via two primary modes:

### 1. `run-async` Usage
The backend uses the `run-async` endpoint to submit long-running automation tasks without keeping a synchronous HTTP connection open. This is particularly useful for parallelizing multiple website inspections.

### 2. Inspection Workflow Execution
The backend uses TinyFish to perform deep website inspections. Each inspection task specifies a target URL and a goal for the agent to achieve (e.g., extract company info and contact signals).

### 3. Polling Model
The backend implements a polling model to check the status of asynchronous TinyFish runs. It uses the `batch` endpoint to efficiently query the status of multiple active runs in a single request.

### 4. Evidence Extraction Usage
The backend parses the `result` payload from completed TinyFish runs to extract structured lead data and associated evidence.

## Lifecycle States

Each TinyFish run follows a standard lifecycle:

- `PENDING`: The task is queued for execution.
- `RUNNING`: The TinyFish agent is actively navigating the target website.
- `COMPLETED`: The agent has successfully achieved the goal and returned a result.
- `FAILED`: The agent encountered an error or was unable to achieve the goal.

## Reference
- `apps/api/src/integrations/tinyfish/client.ts`
- `apps/api/src/integrations/tinyfish/discoverCompanies.ts`
- `apps/api/src/integrations/tinyfish/inspectWebsite.ts`
