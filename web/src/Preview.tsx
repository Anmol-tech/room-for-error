import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "./api.ts";

/**
 * Entry point for Kane: /preview/<runId> opens that run's own isolated session in test mode
 * (every option listed, instant narration, no room transitions). Players never land here.
 */
export function Preview() {
  const { runId = "" } = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .preview(runId)
      .then((p) => navigate(`/play/${encodeURIComponent(p.scenarioId)}?s=${p.sessionId}&test=1`, { replace: true }))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [runId, navigate]);

  return (
    <div className="center-page">
      {error ? (
        <p className="notice error" role="alert">
          {error}
        </p>
      ) : (
        <p className="muted">
          <span className="spinner" aria-hidden /> Opening test session…
        </p>
      )}
    </div>
  );
}
