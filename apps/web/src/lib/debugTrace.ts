import type { IcpInput } from "@revon-tinyfish/contracts";

const invocationCounts = new Map<string, number>();

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

export function createCorrelationId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `web-${crypto.randomUUID()}`;
  }

  return `web-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function buildIcpSignature(input: IcpInput): string {
  return [
    input.targetMarket.trim().toLowerCase(),
    input.location.trim().toLowerCase(),
    input.companySize,
    input.keywords.trim().toLowerCase(),
    input.decisionMakerRole.trim().toLowerCase(),
    String(input.maxResults),
  ].join("|");
}

export function logWebTrace(
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
    `[tinyfish-debug][web] ts=${timestamp} component=${component} invocation=${invocation} correlationId=${options.correlationId ?? "-"} runId=${options.runId ?? "-"}${formatDetails(options.details)}`,
  );
}
