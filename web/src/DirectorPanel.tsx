import { useEffect, useState } from "react";
import type { DirectorView as DirectorData } from "../../shared/schema.ts";
import { api } from "./api.ts";
import { kaneSample, type RouteState } from "./kaneSample.ts";
import { useEscape } from "./Overlays.tsx";

interface Props {
  adventureId: string;
  sessionVersion: number;
  onClose: () => void;
}

const ROUTE_TEXT: Record<RouteState, string> = {
  passed: "Passed",
  failed: "Failed",
  running: "Rerun in progress",
  outdated: "Outdated",
  queued: "Queued",
};

/**
 * Director View: how the game is being checked and repaired. Real data (version, validator,
 * routes, scenes) comes from the server; Kane activity is a labelled sample until event day.
 * Anything that could reveal a clue or solution waits behind an explicit reveal.
 */
export function DirectorPanel({ adventureId, sessionVersion, onClose }: Props) {
  const [data, setData] = useState<DirectorData | null>(null);
  const [spoilers, setSpoilers] = useState(false);
  const [openEvent, setOpenEvent] = useState<number | null>(null);
  const kane = kaneSample(adventureId);
  useEscape(onClose);

  useEffect(() => {
    let stop = false;
    const load = () => api.director(adventureId).then((d) => !stop && setData(d)).catch(() => {});
    load();
    const t = setInterval(load, 3000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [adventureId]);

  const issues = data?.validatorIssues.length ?? 0;
  const scenesReady = data?.images.filter((i) => i.status === "ready" || i.status === "placeholder").length ?? 0;

  return (
    <aside className="director" role="dialog" aria-labelledby="director-title">
      <header className="director-head">
        <div>
          <h2 id="director-title">Director View</h2>
          <p>Live generation, testing, and repair</p>
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close Director View">
          ×
        </button>
      </header>

      {!spoilers ? (
        <div className="spoiler-gate">
          <p>
            <strong>Spoilers ahead.</strong> Evidence, repairs and route objectives can reveal clues and solutions.
          </p>
          <button type="button" className="btn-ghost" onClick={() => setSpoilers(true)}>
            Reveal spoilers
          </button>
        </div>
      ) : (
        <p className="spoiler-on">
          Spoilers visible.{" "}
          <button type="button" className="text-btn" onClick={() => setSpoilers(false)}>
            Hide
          </button>
        </p>
      )}

      {/* A. Current version */}
      <section className="dsec">
        <h3>Current game version</h3>
        <dl className="kv">
          <div>
            <dt>Version</dt>
            <dd>
              v{data?.adventure.version ?? "…"}
              {data && sessionVersion !== data.adventure.version && <span className="muted"> (you're playing v{sessionVersion})</span>}
            </dd>
          </div>
          <div>
            <dt>Validator</dt>
            <dd className={issues ? "bad" : "good"}>{data ? (issues ? `${issues} issue${issues > 1 ? "s" : ""}` : "Passed") : "…"}</dd>
          </div>
          <div>
            <dt>Scenes</dt>
            <dd>
              {scenesReady}/{data?.images.length ?? "…"} painted
            </dd>
          </div>
          <div>
            <dt>Latest repair</dt>
            <dd>{kane ? <>{kane.latestRepair} <span className="sample-tag">Sample</span></> : "None yet"}</dd>
          </div>
        </dl>
        {spoilers && data && issues > 0 && (
          <ul className="issues">
            {data.validatorIssues.map((i, n) => (
              <li key={n}>{i.message}</li>
            ))}
          </ul>
        )}
      </section>

      {/* B. Routes */}
      <section className="dsec">
        <h3>
          Escape routes {kane && <span className="sample-tag">Sample</span>}
        </h3>
        {kane ? (
          <ul className="routes">
            {kane.routes.map((r, i) => (
              <li key={i} className={`route ${r.state}`}>
                <div className="route-row">
                  <strong>{r.label}</strong>
                  <span className={`status ${r.state}`}>
                    <i aria-hidden /> {ROUTE_TEXT[r.state]} · Version {r.version}
                  </span>
                </div>
                <p className="route-note">{r.state === "outdated" ? `${r.note}. Superseded by the repair.` : r.note}</p>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="routes">
            {data?.routes.map((r, i) => (
              <li key={r.routeId} className="route queued">
                <div className="route-row">
                  <strong>
                    Route {String.fromCharCode(65 + i)} · {i === 0 ? "Main exit" : "Alternate exit"}
                  </strong>
                  <span className="status queued">
                    <i aria-hidden /> Not tested yet
                  </span>
                </div>
                {spoilers && <p className="route-note">{r.objective}</p>}
              </li>
            ))}
          </ul>
        )}
        {kane && spoilers && data && (
          <details className="objectives">
            <summary>Route objectives Kane follows</summary>
            {data.routes.map((r) => (
              <p key={r.routeId}>{r.objective}</p>
            ))}
          </details>
        )}
      </section>

      {/* C. Timeline */}
      <section className="dsec">
        <h3>
          Live activity {kane && <span className="sample-tag">Sample</span>}
        </h3>
        {kane ? (
          <ol className="timeline">
            {kane.timeline.map((e, i) => (
              <li key={i} className={e.kind}>
                <span className="tl-time">{e.at}</span>
                <div className="tl-body">
                  {e.evidence ? (
                    <button type="button" className="tl-title" aria-expanded={openEvent === i} onClick={() => setOpenEvent(openEvent === i ? null : i)}>
                      {e.title}
                    </button>
                  ) : (
                    <span className="tl-title">{e.title}</span>
                  )}
                  {openEvent === i && e.evidence && (
                    <p className="tl-evidence">{spoilers ? e.evidence : "Evidence hidden. Reveal spoilers to read it."}</p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="muted">No Kane activity yet. Kane checks connect on event day.</p>
        )}
      </section>

      {/* D. Repair */}
      {kane && (
        <section className="dsec">
          <h3>
            Failure and repair <span className="sample-tag">Sample</span>
          </h3>
          {spoilers ? (
            <table className="repair">
              <thead>
                <tr>
                  <th scope="col">Field</th>
                  <th scope="col">Before</th>
                  <th scope="col">After</th>
                </tr>
              </thead>
              <tbody>
                {kane.repair.map((r) => (
                  <tr key={r.field}>
                    <th scope="row">{r.field}</th>
                    <td className={r.before === r.after ? "" : "changed-from"}>{r.before}</td>
                    <td className={r.before === r.after ? "" : "changed-to"}>{r.after}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="muted">A clue and its lock disagreed. Reveal spoilers to compare before and after.</p>
          )}
          <p className="sample-note">
            Sample data showing how a real check will appear. The playable version still contains the planted defect, so Kane has something real to
            catch on event day.
          </p>
        </section>
      )}

      {/* E. Evidence */}
      <section className="dsec">
        <h3>Scene assets</h3>
        <ul className="assets">
          {data?.images.map((i) => (
            <li key={`${i.roomId}/${i.sceneStateId}`} title={i.error ?? undefined}>
              {i.url ? <img src={i.url} alt={`${i.roomId}, ${i.sceneStateId}`} /> : <span className="asset-empty" />}
              <span className={`status ${i.status === "ready" ? "passed" : i.status === "failed" ? "failed" : "queued"}`}>
                <i aria-hidden /> {i.roomId.replaceAll("_", " ")} · {i.sceneStateId.replaceAll("_", " ")}
              </span>
            </li>
          ))}
        </ul>
        <p className="muted small">Kane screenshots and action traces appear here once real runs exist.</p>
      </section>
    </aside>
  );
}
