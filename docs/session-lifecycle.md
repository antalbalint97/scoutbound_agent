# Session Lifecycle

The end-to-end session lifecycle in Scoutbound describes the entire process from a user initiating a sourcing run to the completion of the orchestration.

## Session Lifecycle States

The lifecycle of a sourcing session follows these primary states:

1. `CREATED`: A new sourcing session is initialized with a user's Ideal Customer Profile (ICP).
2. `DISCOVERY_RUNNING`: The backend is executing a directory discovery task to find candidate companies.
3. `INSPECTION_RUNNING`: The backend is performing parallel website inspections for all discovered candidates.
4. `AGGREGATING_RESULTS`: The backend has finished all inspections and is scoring the extracted leads.
5. `COMPLETED`: The orchestration is finished, and the results are ready for inspection and export.

## Session Lifecycle Diagram

The following ASCII diagram illustrates the session lifecycle:

```text
    CREATED
       ↓
DISCOVERY_RUNNING
       ↓
INSPECTION_RUNNING
       ↓
AGGREGATING_RESULTS
       ↓
   COMPLETED
```

## Session Flow Details

### 1. Session Creation
A new session is created when a user submits an ICP via the frontend. The backend assigns a unique session ID and initializes the run state.

### 2. Run Submission
The backend submits the initial directory discovery task to TinyFish. This is an asynchronous task that returns a run ID for polling.

### 3. Polling Updates
The backend continuously polls for the status of the directory discovery run. Once complete, it parses the candidates and launches website inspection runs for each.

### 4. Lead Aggregation
As each website inspection run finishes, the backend processes and stores the results. Once all inspections are terminal, the backend performs a final scoring and ranking of the leads.

### 5. Export Readiness
The session is marked as `COMPLETED` once all orchestration steps are finished. The results are then available in the operator console for inspection and export.

### 6. Console Inspection Flow
Users can monitor the progress of a session in real-time, view detailed logs for each stage, and access the final extracted leads and evidence.
