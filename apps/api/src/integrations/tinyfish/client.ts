const DEFAULT_TINYFISH_URL = "https://agent.tinyfish.ai/v1/automation/run-sse";

interface TinyFishCompleteEvent {
  type: string;
  status?: string;
  resultJson?: unknown;
  error?: string;
}

export interface RunTinyFishAutomationInput {
  apiKey: string;
  url: string;
  goal: string;
  timeoutMs?: number;
}

async function readTinyFishStream(response: Response, timeoutMs: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`TinyFish timed out after ${timeoutMs}ms.`));
    }, timeoutMs);

    const reader = response.body?.getReader();
    if (!reader) {
      clearTimeout(timer);
      reject(new Error("TinyFish response body is not readable."));
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";

    const pump = async (): Promise<void> => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data:")) {
              continue;
            }

            const raw = line.slice(5).trim();
            if (!raw) {
              continue;
            }

            try {
              const event = JSON.parse(raw) as TinyFishCompleteEvent;
              if (event.type === "COMPLETE") {
                clearTimeout(timer);
                reader.cancel().catch(() => undefined);

                if (event.status === "COMPLETED") {
                  resolve(event.resultJson ?? null);
                } else {
                  reject(new Error(event.error ?? `TinyFish failed with status ${event.status ?? "UNKNOWN"}.`));
                }
                return;
              }
            } catch {
              // Skip partial or non-JSON events.
            }
          }
        }

        clearTimeout(timer);
        reject(new Error("TinyFish stream ended before a COMPLETE event was received."));
      } catch (error) {
        clearTimeout(timer);
        reject(error);
      }
    };

    void pump();
  });
}

export async function runTinyFishAutomation({
  apiKey,
  url,
  goal,
  timeoutMs = 90_000,
}: RunTinyFishAutomationInput): Promise<unknown> {
  const endpoint = process.env.TINYFISH_BASE_URL?.trim() || DEFAULT_TINYFISH_URL;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify({
      url,
      goal,
      proxy_config: { enabled: false },
    }),
  });

  if (!response.ok) {
    throw new Error(`TinyFish returned HTTP ${response.status} ${response.statusText}.`);
  }

  return readTinyFishStream(response, timeoutMs);
}
