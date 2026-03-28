import { randomUUID } from "node:crypto";
import { demoRunSchema, type DemoRun, type IcpInput, type LeadRecord, type RunPushState, type RunStep, type RunStepKey, type RunSummary } from "@revon-tinyfish/contracts";

const RUN_TTL_MS = 15 * 60 * 1000;
const runs = new Map<string, DemoRun>();

const STEP_BLUEPRINT: Array<{ key: RunStepKey; label: string }> = [
  { key: "discovering_companies", label: "Finding candidate companies" },
  { key: "visiting_websites", label: "Opening live company websites" },
  { key: "extracting_contacts", label: "Extracting contacts and buyer signals" },
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

export function createRun(input: IcpInput): DemoRun {
  const run = demoRunSchema.parse({
    id: randomUUID(),
    status: "running",
    startedAt: new Date().toISOString(),
    input,
    steps: buildSteps(),
    summary: {},
    leads: [],
    push: {},
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

export function activateStep(runId: string, key: RunStepKey, detail?: string): DemoRun | undefined {
  return mutateRun(runId, (run) => {
    const step = findStep(run, key);
    if (!step) {
      return;
    }
    step.status = "active";
    step.detail = detail;
  });
}

export function completeStep(runId: string, key: RunStepKey, detail?: string): DemoRun | undefined {
  return mutateRun(runId, (run) => {
    const step = findStep(run, key);
    if (!step) {
      return;
    }
    step.status = "done";
    step.detail = detail;
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

export function finishRun(runId: string, leads: LeadRecord[]): DemoRun | undefined {
  return mutateRun(runId, (run) => {
    run.leads = leads;
    run.status = "completed";
    run.completedAt = new Date().toISOString();
  });
}

export function failRun(runId: string, message: string, stepKey?: RunStepKey): DemoRun | undefined {
  return mutateRun(runId, (run) => {
    if (stepKey) {
      const step = findStep(run, stepKey);
      if (step) {
        step.status = "error";
        step.detail = message;
      }
    }
    run.status = "error";
    run.error = message;
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
