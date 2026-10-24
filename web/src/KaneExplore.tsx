import { useEffect, useRef, useState } from "react";
import type { ExplorationView } from "../../shared/schema.ts";

interface Props {
  exploration: ExplorationView | null;
  busy: boolean;
  problem: string | null;
  onExplore: () => void;
  onStop: () => void;
  onMap: () => Promise<string | null>;
}

const STATUS_TEXT: Record<ExplorationView["status"], string> = {
  queued: "Waiting for the browser",
  running: "Exploring",
  completed: "Finished",
  stopped: "Stopped",
  failed: "Couldn't explore",
};

/**
 * Free exploration (`kane-cli explore`): Kane wanders the game with no script. Left of this panel
 * the stage shows the game Kane is in; here, what it's trying, and a map of what it reached
 * compared with everything the game contains.
 */
export function KaneExplore({ exploration: x, busy, problem, onExplore, onStop, onMap }: Props) {
  const feed = useRef<HTMLOListElement>(null);
  const [mapUrl, setMapUrl] = useState<string | null>(null);
  const [mapBusy, setMapBusy] = useState(false);
  const live = x?.status === "running" || x?.status === "queued";

  useEffect(() => {
    feed.current?.lastElementChild?.scrollIntoView({ block: "nearest" });
  }, [x?.feed.length]);

  async function openMap() {
    setMapBusy(true);
    try {
      const url = x?.mapUrl ?? (await onMap());
      setMapUrl(url);
      if (url) window.open(url, "_blank", "noopener");
    } finally {
      setMapBusy(false);
    }
  }

  const t = x?.coverage.totals;
  return (
    <div className="explore-panel">
      <p className="kane-screen-label">Free exploration · no script</p>
      {x ? (
        <>
          <div className="explore-stats">
            <div>
              <strong>{STATUS_TEXT[x.status]}</strong>
              <span>v{x.scenarioVersion}</span>
            </div>
            <div>
              <strong>{x.visited}</strong>
              <span>screens mapped</span>
            </div>
            <div>
              <strong>{x.frontier}</strong>
              <span>left to try</span>
            </div>
            <div>
              <strong>{x.sessions}</strong>
              <span>fresh games</span>
            </div>
          </div>
          {x.remark && !live && <p className="small muted">Kane: {x.remark}</p>}

          <ol className="explore-feed" ref={feed} aria-live="polite">
            {x.feed.map((f, i) => (
              <li key={i} className={f.kind}>
                <span className="explore-kind">{f.kind === "intent" ? "Trying" : f.kind === "action" ? "Did" : f.kind === "finding" ? "Found" : "Note"}</span>
                <span>{f.text}</span>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <p className="small muted">Kane hasn't explored this room yet. It will wander the game with no route to follow, and the map below shows what it reached.</p>
      )}

      <div className="explore-actions">
        {live ? (
          <button type="button" className="btn-ghost" onClick={onStop}>
            Stop exploring
          </button>
        ) : (
          <button type="button" className="btn-primary" onClick={onExplore} disabled={busy || !!problem}>
            {busy ? "Kane is busy…" : x ? "Explore again" : "Let Kane explore freely"}
          </button>
        )}
        {x && (
          <button type="button" className="btn-ghost" onClick={openMap} disabled={mapBusy}>
            {mapBusy ? "Opening…" : "Kane's map"}
          </button>
        )}
      </div>
      {mapUrl === null && !mapBusy && x && x.status !== "queued" && (
        <p className="small muted">Kane's map opens in a new tab, served by Kane on this computer.</p>
      )}

      {x && t && (
        <section className="coverage" aria-label="What Kane reached">
          <p className="kane-screen-label">
            What Kane reached · {t.roomsVisited}/{t.rooms} rooms · {t.actionsTried}/{t.actions} actions · {t.endingsReached}/{t.endings} endings
          </p>
          <div className="coverage-rooms">
            {x.coverage.rooms.map((r) => (
              <div key={r.id} className={`coverage-room ${r.visited ? "visited" : "unvisited"}`}>
                <h4>
                  {r.name} <span>{r.visited ? "visited" : "never reached"}</span>
                </h4>
                <ul>
                  {r.actions.map((a) => (
                    <li key={a.id} className={a.succeeded ? "ok" : a.tried ? "blocked" : "untried"} title={a.succeeded ? "Kane did this" : a.tried ? "Kane tried this but it didn't work yet" : "Kane never tried this"}>
                      <i aria-hidden>{a.succeeded ? "✓" : a.tried ? "!" : "·"}</i>
                      {a.label}
                      {a.onRoute && <em>route</em>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="coverage-endings">
            {x.coverage.endings.map((e) => (
              <span key={e.id} className={e.reached ? "ok" : "untried"}>
                {e.reached ? "✓" : "·"} {e.title}
              </span>
            ))}
            {x.coverage.items.map((i) => (
              <span key={i.id} className={i.found ? "ok" : "untried"}>
                {i.found ? "✓" : "·"} {i.name}
              </span>
            ))}
          </p>
        </section>
      )}
    </div>
  );
}
