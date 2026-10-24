import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "./api.ts";

/**
 * Entry point for `kane-cli explore`: /explore/<scenarioId> opens a fresh, isolated test session on
 * every visit (test mode: every option listed, instant narration, no transitions). Kane returns
 * here whenever it wants to start over, so each visit is a clean game. Players never land here.
 */
export function ExploreEntry() {
  const { scenarioId = "" } = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .exploreSession(scenarioId)
      .then((p) => navigate(`/play/${encodeURIComponent(p.scenarioId)}?s=${p.sessionId}&test=1`, { replace: true }))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [scenarioId, navigate]);

  return (
    <div className="center-page">
      {error ? (
        <p className="notice error" role="alert">
          {error}
        </p>
      ) : (
        <p className="muted">
          <span className="spinner" aria-hidden /> Opening a fresh game…
        </p>
      )}
    </div>
  );
}
