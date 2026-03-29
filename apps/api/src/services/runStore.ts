import { randomUUID } from "node:crypto";
import {
  demoRunSchema,
  type DemoRun,
  type IcpInput,
  type LeadRecord,
  type RunMode,
  type RunPushState,
  type RunQuality,
  type RunStatus,
  type RunStep,
  type RunStepKey,
  type RunStepStatus,
  type RunSummary,
} from "@revon-tinyfish/contracts";

const RUN_TTL_MS = 15 * 60 * 1000;
const runs = new Map<string, DemoRun>();

const STEP_BLUEPRINT: Array<{ key: RunStepKey; label: string }> = [
  { key: "discovering_companies", label: "Finding candidate companies" },
  { key: "visiting_websites", label: "Opening live company websites" },
  { key: "extracting_contacts", label: "Extracting contacts and structured findings" },
  { key: "ranking_leads", label: "Ranking leads for outreach" },
  { key: "ready_for_revon", label: "Preparing Revon handoff" },
];

function buildSteps(): RunStep[] {
  return STEP_BLUEPRINT.map((step) => ({
    ...step,
    status: "pending",
  }));
}

function cloneRun(run: DemoRun): DemoRun {
  return structuredClone(run);
}

function getRunInternal(runId: string): DemoRun | undefined {
  return runs.get(runId);
}

function findStep(run: DemoRun, key: RunStepKey): RunStep | undefined {
  return run.steps.find((step) => step.key === key);
}

function mergeNotes(existing: string[], incoming?: string[]): string[] {
  return [...new Set([...(existing ?? []), ...(incoming ?? [])].filter(Boolean))];
}

export function createRun(
  input: IcpInput,
  options: {
    mode: RunMode;
    modeReason?: string;
    experimentLabel?: string;
  },
): DemoRun {
  const run = demoRunSchema.parse({
    id: randomUUID(),
    status: "running",
    mode: options.mode,
    quality: "healthy",
    experimentLabel: options.experimentLabel ?? "default",
    startedAt: new Date().toISOString(),
    input,
    steps: buildSteps(),
    summary: {},
    leads: [],
    push: {},
    notes: options.modeReason ? [options.modeReason] : [],
    ...(options.modeReason ? { modeReason: options.modeReason } : {}),
  });

  runs.set(run.id, run);
  setTimeout(() => {
    runs.delete(run.id);
  }, RUN_TTL_MS);

  return cloneRun(run);
}

export function getRun(runId: string): DemoRun | undefined {
  const run = getRunInternal(runId);
  return run ? cloneRun(run) : undefined;
}

export function mutateRun(runId: string, mutate: (run: DemoRun) => void): DemoRun | undefined {
  const run = getRunInternal(runId);
  if (!run) {
    return undefined;
  }

  mutate(run);
  return cloneRun(run);
}

export function setStepStatus(
  runId: string,
  key: RunStepKey,
  status: RunStepStatus,
  detail?: string,
): DemoRun | undefined {
  return mutateRun(runId, (run) => {
    const step = findStep(run, key);
    if (!step) {
      return;
    }
    step.status = status;
    if (detail) {
      step.detail = detail;
    }
  });
}

export function updateSummary(runId: string, patch: Partial<RunSummary>): DemoRun | undefined {
  return mutateRun(runId, (run) => {
    run.summary = {
      ...run.summary,
      ...patch,
    };
  });
}

export function updateRunLeads(runId: string, leads: LeadRecord[]): DemoRun | undefined {
  return mutateRun(runId, (run) => {
    run.leads = leads;
  });
}

export function appendRunNote(runId: string, note: string): DemoRun | undefined {
  return mutateRun(runId, (run) => {
    run.notes = mergeNotes(run.notes, [note]);
  });
}

export function updateRunState(
  runId: string,
  patch: Partial<Pick<DemoRun, "mode" | "quality" | "status" | "modeReason" | "error">> & {
    notes?: string[];
  },
): DemoRun | undefined {
  return mutateRun(runId, (run) => {
    if (patch.mode) {
      run.mode = patch.mode;
    }
    if (patch.quality) {
      run.quality = patch.quality;
    }
    if (patch.status) {
      run.status = patch.status;
    }
    if (patch.modeReason) {
      run.modeReason = patch.modeReason;
    }
    if (patch.error) {
      run.error = patch.error;
    }
    if (patch.notes && patch.notes.length > 0) {
      run.notes = mergeNotes(run.notes, patch.notes);
    }
  });
}

export function finishRun(
  runId: string,
  options: {
    leads: LeadRecord[];
    status: Extract<RunStatus, "completed" | "partial">;
    quality: RunQuality;
    notes?: string[];
    error?: string;
  },
): DemoRun | undefined {
  return mutateRun(runId, (run) => {
    run.leads = options.leads;
    run.status = options.status;
    run.quality = options.quality;
    run.completedAt = new Date().toISOString();
    run.notes = mergeNotes(run.notes, options.notes);
    if (options.error) {
      run.error = options.error;
    }
  });
}

export function failRun(
  runId: string,
  message: string,
  stepKey?: RunStepKey,
  notes?: string[],
): DemoRun | undefined {
  return mutateRun(runId, (run) => {
    if (stepKey) {
      const step = findStep(run, stepKey);
      if (step) {
        step.status = "failed";
        step.detail = message;
      }
    }
    for (const step of run.steps) {
      if (step.status === "pending") {
        step.status = "skipped";
        step.detail = "Skipped after an earlier run failure.";
      }
    }
    run.status = "failed";
    run.quality = "degraded";
    run.error = message;
    run.completedAt = new Date().toISOString();
    run.notes = mergeNotes(run.notes, notes);
  });
}

export function updatePushState(runId: string, patch: Partial<RunPushState>): DemoRun | undefined {
  return mutateRun(runId, (run) => {
    run.push = {
      ...run.push,
      ...patch,
    };
  });
}

export function resetRunStore(): void {
  runs.clear();
}
