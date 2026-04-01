import { randomUUID } from "node:crypto";
import type { IcpInput } from "@revon-tinyfish/contracts";

const invocationCounts = new Map<string, number>();

export interface DiscoveryTraceContext {
  correlationId: string;
  payloadSignature?: string | undefined;
  runId?: string | undefined;
  experimentLabel?: string | undefined;
}

function nextCount(key: string): number {
  const next = (invocationCounts.get(key) ?? 0) + 1;
  invocationCounts.set(key, next);
  return next;
}

function formatDetails(details?: Record<string, unknown>): string {
  if (!details) {
    return "";
  }

  const entries = Object.entries(details).filter(([, value]) => typeof value !== "undefined");
  if (entries.length === 0) {
    return "";
  }

  return ` ${entries
    .map(([key, value]) => `${key}=${typeof value === "string" ? value : JSON.stringify(value)}`)
    .join(" ")}`;
}

export function buildIcpSignature(input: IcpInput, promptOverride = ""): string {
  return [
    input.targetMarket.trim().toLowerCase(),
    input.location.trim().toLowerCase(),
    input.companySize,
    input.keywords.trim().toLowerCase(),
    input.decisionMakerRole.trim().toLowerCase(),
    String(input.maxResults),
    promptOverride.trim().toLowerCase(),
  ].join("|");
}

export function getCorrelationId(value?: string | string[]): string {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (Array.isArray(value) && value[0]?.trim()) {
    return value[0].trim();
  }

  return `api-${randomUUID()}`;
}

export function withRunId(trace: DiscoveryTraceContext | undefined, runId: string): DiscoveryTraceContext {
  return {
    correlationId: trace?.correlationId ?? `run-${runId}`,
    payloadSignature: trace?.payloadSignature,
    runId,
    experimentLabel: trace?.experimentLabel,
  };
}

export function logApiTrace(
  component: string,
  options: {
    correlationId?: string | undefined;
    runId?: string | undefined;
    invocationKey?: string | undefined;
    details?: Record<string, unknown> | undefined;
  } = {},
): void {
  const timestamp = new Date().toISOString();
  const key = options.invocationKey ?? options.runId ?? options.correlationId ?? component;
  const count = nextCount(`${component}|${key}`);
  const invocation = count === 1 ? "fresh" : `repeat#${count}`;

  console.log(
    `[tinyfish-debug][api] ts=${timestamp} component=${component} invocation=${invocation} correlationId=${options.correlationId ?? "-"} runId=${options.runId ?? "-"}${formatDetails(options.details)}`,
  );
}
