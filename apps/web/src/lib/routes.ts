export type AppRoute =
  | { name: "launcher" }
  | { name: "saved-session"; sessionId: string };

export function parseRouteFromHash(hash: string): AppRoute {
  const normalized = hash.replace(/^#/, "").replace(/\/+$/, "");
  if (!normalized || normalized === "/") {
    return { name: "launcher" };
  }

  const savedSessionMatch = normalized.match(/^\/sessions\/([^/]+)$/);
  if (savedSessionMatch?.[1]) {
    return {
      name: "saved-session",
      sessionId: decodeURIComponent(savedSessionMatch[1]),
    };
  }

  return { name: "launcher" };
}

export function navigateToLauncher(): void {
  window.location.hash = "/";
}

export function navigateToSavedSession(sessionId: string): void {
  window.location.hash = `/sessions/${encodeURIComponent(sessionId)}`;
}
