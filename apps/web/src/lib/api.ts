import {
  demoRunSchema,
  revonAdapterStatusSchema,
  startRunResponseSchema,
  type DemoRun,
  type IcpInput,
  type RevonAdapterStatus,
} from "@revon-tinyfish/contracts";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    let message = `Request failed with HTTP ${response.status}.`;
    try {
      const data = (await response.json()) as { error?: string };
      if (data.error) {
        message = data.error;
      }
    } catch {
      // Ignore JSON parse failures.
    }
    throw new Error(message);
  }

  return (await response.json()) as T;
}

export async function startRun(input: IcpInput): Promise<string> {
  const data = await request<unknown>("/api/runs", {
    method: "POST",
    body: JSON.stringify(input),
  });

  return startRunResponseSchema.parse(data).runId;
}

export async function getRun(runId: string): Promise<DemoRun> {
  const data = await request<unknown>(`/api/runs/${runId}`);
  return demoRunSchema.parse(data);
}

export async function pushQualifiedLeads(runId: string, leadIds?: string[]): Promise<DemoRun> {
  const data = await request<unknown>(`/api/runs/${runId}/push`, {
    method: "POST",
    body: JSON.stringify(leadIds ? { leadIds } : {}),
  });

  return demoRunSchema.parse(data);
}

export async function getRevonStatus(): Promise<RevonAdapterStatus> {
  const data = await request<unknown>("/api/revon/status");
  return revonAdapterStatusSchema.parse(data);
}
