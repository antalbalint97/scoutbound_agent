# Architecture Overview

Scoutbound is an autonomous outbound prospect sourcing application powered by TinyFish web agents.

## System Components

### Vercel Frontend
The frontend is a React/Vite application hosted on Vercel. It provides the operator console for launching sourcing workflows, inspecting results, and managing sessions. It communicates with the Backend API via REST.

### Railway Backend
The backend is a Node.js API hosted on Railway. It handles orchestration of the sourcing runs, manages session state, and integrates with external services like TinyFish and CRM systems.

### TinyFish Automation Layer
TinyFish provides the core web automation capabilities. The backend submits tasks to TinyFish (e.g., directory discovery, website inspection) which are executed by autonomous agents.

### Session Persistence Layer
The system maintains session state and telemetry for every sourcing run. This includes high-level run status, detailed step-by-step logs, and the extracted lead data.

## Request Flow

The following diagram illustrates the typical flow of a sourcing request:

```text
User → Frontend (Launch Sourcing)
        ↓
      Backend API (Start Discovery Run)
        ↓
      TinyFish (Async Automation: Discovery/Inspection)
        ↓
      Backend Polling (Monitor TinyFish Run Status)
        ↓
      Session Store (Update Lead Data & Telemetry)
        ↓
      Console UI (Live Progress & Final Results)
```
