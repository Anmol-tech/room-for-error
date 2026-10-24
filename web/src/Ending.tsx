import { useState } from "react";
import { Link } from "react-router-dom";
import type { SessionView } from "../../shared/schema.ts";
import { kaneSample } from "./kaneSample.ts";
import { elapsed } from "./Overlays.tsx";

interface Props {
  view: SessionView;
  onTryOther: () => void;
}

/** Full-width ending: the final scene, the outcome, stats, and an optional recap of the run. */
export function Ending({ view, onTryOther }: Props) {
  const [recap, setRecap] = useState(false);
  const ending = view.ending!;
  const kane = kaneSample(view.scenarioId);
  // Rooms visited in order, with what was found and the main choices (not dead ends or wrong codes).
  const steps = view.log.filter((e) => e.action && e.kind !== "error");

  return (
    <div className="ending">
      {view.imageUrl && <div className="ending-art" style={{ backgroundImage: `url(${view.imageUrl})` }} aria-hidden />}
      <section className="ending-body" data-testid="ending">
        <p className="ending-kicker">Ending reached</p>
        <h2>{ending.title}</h2>
        <p className="ending-text">{ending.text}</p>

        <dl className="stat-row">
          <div>
            <dt>Escape</dt>
            <dd>{ending.title}</dd>
          </div>
          <div>
            <dt>Time</dt>
            <dd>{elapsed(view.stats)}</dd>
          </div>
          <div>
            <dt>Moves</dt>
            <dd>{view.stats.moves}</dd>
          </div>
          <div>
            <dt>Hints used</dt>
            <dd>{view.stats.hintsUsed}</dd>
          </div>
          <div>
            <dt>Items discovered</dt>
            <dd>
              {view.stats.itemsFound}/{view.stats.itemsTotal}
            </dd>
          </div>
        </dl>

        <div className="ending-actions">
          <Link to="/" className="btn-primary">
            Create another room
          </Link>
          <button type="button" className="btn-ghost" onClick={() => setRecap((r) => !r)} aria-expanded={recap}>
            {recap ? "Hide mission recap" : "View mission recap"}
          </button>
          {view.endingCount > 1 && (
            <button type="button" className="btn-ghost" onClick={onTryOther}>
              Try the other route
            </button>
          )}
        </div>

        {recap && (
          <div className="recap">
            <ol>
              {steps.map((e, i) => (
                <li key={i}>
                  <span className="recap-room">{e.roomName}</span> {e.action}
                  {e.found.length > 0 && <span className="recap-found"> · found {e.found.join(", ")}</span>}
                </li>
              ))}
            </ol>
            <details className="kane-recap">
              <summary>Kane's technical recap</summary>
              {kane ? (
                <p>
                  <span className="sample-tag">Sample</span> In the sample run, Kane tested both routes, caught a clue that didn't match its lock, and verified the
                  repair on version {kane.testedVersion}. Open the Director View for the full timeline.
                </p>
              ) : (
                <p>No Kane runs for this room yet. Kane checks connect on event day.</p>
              )}
            </details>
          </div>
        )}
      </section>
    </div>
  );
}
