import { useEffect, useState } from "react";
import { parseRouteFromHash, navigateToLauncher, navigateToSavedSession, type AppRoute } from "./lib/routes";
import { SavedSessionDetailPage } from "./pages/SavedSessionDetailPage";
import { TinyFishDemoPage } from "./pages/TinyFishDemoPage";

export default function App() {
  const [route, setRoute] = useState<AppRoute>(() => parseRouteFromHash(window.location.hash));

  useEffect(() => {
    function handleHashChange() {
      setRoute(parseRouteFromHash(window.location.hash));
    }

    window.addEventListener("hashchange", handleHashChange);
    return () => {
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, []);

  if (route.name === "saved-session") {
    return (
      <SavedSessionDetailPage
        onBack={navigateToLauncher}
        sessionId={route.sessionId}
      />
    );
  }

  return <TinyFishDemoPage onOpenSavedSession={navigateToSavedSession} />;
}
