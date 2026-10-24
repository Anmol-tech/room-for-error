import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { AdventureSummary, GenStageKey, GenStageStatus } from "../../shared/schema.ts";
import { api } from "./api.ts";

const LABELS: Record<GenStageKey, string> = {
  writing: "Writing the mystery",
  checking: "Checking the escape paths",
  painting: "Painting the rooms",
  placing: "Placing interactive objects",
  entrance: "Preparing your entrance",
};

const STATUS_TEXT: Record<GenStageStatus, string> = {
  pending: "Waiting",
  active: "In progress",
  complete: "Done",
  retrying: "Retrying",
  failed: "Failed",
};

/** Arrival screen: real generation stages while the opening room develops behind them. */
export function Creating() {
  const { id = "" } = useParams();
  const [adventure, setAdventure] = useState<AdventureSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stop = false;
    async function poll() {
      try {
        const a = await api.adventure(id);
        if (stop) return;
        setAdventure(a);
        if (a.status !== "ready" && a.status !== "failed") setTimeout(poll, 1000);
      } catch (err) {
        if (!stop) setError(err instanceof Error ? err.message : String(err));
      }
    }
    poll();
    return () => {
      stop = true;
    };
  }, [id]);

  const stages = adventure?.stages ?? [];
  const placed = stages.find((s) => s.key === "placing")?.status === "complete";
  const failed = adventure?.status === "failed";

  return (
    <div className="arrival-page">
      {adventure?.coverUrl && (
        <div className={`arrival-scene ${placed ? "developed" : ""}`} style={{ backgroundImage: `url(${adventure.coverUrl})` }} aria-hidden />
      )}
      <header className="start-bar">
        <Link to="/" className="wordmark">
          Room for Error
        </Link>
      </header>

      <main className="arrival">
        <p className="arrival-theme">{adventure ? `“${adventure.theme}”` : "…"}</p>
        <h1>{failed ? "This room didn't hold together." : "Your room is taking shape."}</h1>
        {adventure?.title && !failed && <p className="arrival-mission">{adventure.title}</p>}

        <ol className="stages" aria-live="polite">
          {stages.map((s) => (
            <li key={s.key} className={`gen-stage ${s.status}`}>
              <span className="stage-dot" aria-hidden>
                {s.status === "complete" ? "✓" : s.status === "failed" ? "!" : s.status === "retrying" ? "↻" : ""}
              </span>
              <span className="stage-label">{LABELS[s.key]}</span>
              <span className="stage-status">{STATUS_TEXT[s.status]}</span>
            </li>
          ))}
        </ol>

        {adventure?.status === "ready" && (
          <Link to={`/play/${id}`} className="btn-primary enter-btn" autoFocus>
            Enter room
          </Link>
        )}
        {!failed && (
          <p className="kane-line">
            <span className="kane-dot" aria-hidden /> Kane path checks connect on event day.
          </p>
        )}

        {(adventure?.error || error) && (
          <p className="notice error" role="alert">
            {adventure?.error ?? error}
          </p>
        )}
        {failed && (
          <Link to="/" className="btn-ghost">
            Try another theme
          </Link>
        )}
      </main>
    </div>
  );
}
