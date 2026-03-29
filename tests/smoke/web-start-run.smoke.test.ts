import { afterEach, describe, expect, it, vi } from "vitest";
import { startRun } from "../../apps/web/src/lib/api";
import { DEFAULT_DEMO_INPUT } from "../../apps/web/src/demoPresets";

describe("web startRun smoke", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("preserves JSON content type when correlation headers are attached", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ runId: "run-123" }), {
        status: 202,
        headers: {
          "Content-Type": "application/json",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const runId = await startRun({
      input: DEFAULT_DEMO_INPUT,
      experimentLabel: "web-start-run-smoke",
    }, {
      correlationId: "web-test-correlation",
      payloadSignature: "demo-signature",
    });

    expect(runId).toBe("run-123");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const options = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    const headers = new Headers(options?.headers);

    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("X-Correlation-Id")).toBe("web-test-correlation");
  });
});
