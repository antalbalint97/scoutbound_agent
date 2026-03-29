const SESSION_ID_KEY = "scoutbound.activeSessionId";
const EXECUTION_ID_KEY = "scoutbound.activeExecutionId";
const STARTED_AT_KEY = "scoutbound.activeStartedAt";

export interface ActiveExecution {
  sessionId: string;
  executionId?: string;
  startedAt: string;
}

export function saveActiveExecution(execution: ActiveExecution): void {
  sessionStorage.setItem(SESSION_ID_KEY, execution.sessionId);
  if (execution.executionId) {
    sessionStorage.setItem(EXECUTION_ID_KEY, execution.executionId);
  } else {
    sessionStorage.removeItem(EXECUTION_ID_KEY);
  }
  sessionStorage.setItem(STARTED_AT_KEY, execution.startedAt);
  console.log(`[ActiveExecution] Saved active session: ${execution.sessionId}`);
}

export function getActiveExecution(): ActiveExecution | null {
  const sessionId = sessionStorage.getItem(SESSION_ID_KEY);
  const executionId = sessionStorage.getItem(EXECUTION_ID_KEY) || undefined;
  const startedAt = sessionStorage.getItem(STARTED_AT_KEY);

  if (!sessionId || !startedAt) {
    return null;
  }

  return {
    sessionId,
    executionId,
    startedAt,
  };
}

export function clearActiveExecution(): void {
  sessionStorage.removeItem(SESSION_ID_KEY);
  sessionStorage.removeItem(EXECUTION_ID_KEY);
  sessionStorage.removeItem(STARTED_AT_KEY);
  console.log("[ActiveExecution] Cleared active session");
}
