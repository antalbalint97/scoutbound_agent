import { getRun, resetRunStore } from "../../../apps/api/src/services/runStore";
import { resetPersistenceStore } from "../../../apps/api/src/services/persistenceService";
import { resetDiscoverySessions } from "../../../apps/api/src/services/sessionStore";
import { resetTelemetryStore } from "../../../apps/api/src/services/telemetryStore";

export function applyEnv(overrides: Record<string, string | undefined>): () => void {
  const previous = new Map<string, string | undefined>();

  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  return () => {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };
}

export async function waitForRunCompletion(runId: string, timeoutMs: number = 3000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const run = getRun(runId);
    if (run && run.status !== "running") {
      return run;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  throw new Error(`Timed out waiting for run ${runId} to finish.`);
}

export function resetSmokeRunStore(): void {
  resetRunStore();
  resetDiscoverySessions();
  resetTelemetryStore();
  resetPersistenceStore();
}
