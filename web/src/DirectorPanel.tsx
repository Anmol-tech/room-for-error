import { useEffect, useState } from "react";
import type { DirectorView as DirectorData, KaneRun, KaneView, Repair, RouteReadiness } from "../../shared/schema.ts";
import { api } from "./api.ts";
import { useEscape } from "./Overlays.tsx";

interface Props {
  adventureId: string;
  sessionVersion: number;
  onClose: () => void;
}

const READINESS_TEXT: Record<RouteReadiness, string> = {
  untested: "Not tested yet",
  testing: "Kane is playing it",
  repairing: "Failed · repairing",
  passed: "Passed",
  withheld: "Withheld",
};

const RUN_TEXT: Record<KaneRun["status"], string> = {
  queued: "Queued",
  running: "Running",
  passed: "Passed",
  failed: "Failed",
  off_route: "Took another exit · replaying",
  infra_error: "Kane couldn't run",
  cancelled: "Cancelled",
};

const statusClass = (s: KaneRun["status"] | RouteReadiness) =>
  s === "passed" ? "passed" : s === "failed" || s === "repairing" || s === "withheld" ? "failed" : s === "running" || s === "testing" ? "running" : "queued";

const clock = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }) : "");
const secs = (s: number | null) => (s === null ? "" : s >= 60 ? `${Math.floor(s / 60)}m ${Math.round(s % 60)}s` : `${Math.round(s)}s`);

interface TimelineEvent {
  at: string;
  kind: "kane" | "director" | "fail" | "pass" | "infra";
  title: string;
  evidence?: string;
}

/** Every Kane run and repair as a readable, time-ordered list. */
function timeline(kane: KaneView, routeLabel: (id: string) => string): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  for (const r of kane.runs) {
    if (r.startedAt) events.push({ at: r.startedAt, kind: "kane", title: `Kane started ${routeLabel(r.routeId)} on version ${r.scenarioVersion}` });
    if (!r.finishedAt) continue;
    const failed = r.steps.find((s) => s.status === "failed");
    if (r.status === "passed") events.push({ at: r.finishedAt, kind: "pass", title: `${routeLabel(r.routeId)} passed on version ${r.scenarioVersion}`, evidence: r.summary ?? undefined });
    else if (r.status === "failed")
      events.push({
        at: r.finishedAt,
        kind: "fail",
        title: `${routeLabel(r.routeId)} failed on version ${r.scenarioVersion}${failed ? ` at step ${failed.step}` : ""}`,
        evidence: [failed?.remark, r.summary].filter(Boolean).join(" · ") || undefined,
      });
    else if (r.status === "off_route")
      events.push({ at: r.finishedAt, kind: "kane", title: `Kane took another exit on ${routeLabel(r.routeId)}; replaying (game unchanged)`, evidence: r.reason ?? undefined });
    else events.push({ at: r.finishedAt, kind: "infra", title: `Kane couldn't finish a run (not a game problem)`, evidence: r.reason ?? undefined });
  }
  for (const p of kane.repairs) {
    events.push({ at: p.createdAt, kind: "director", title: `Director started repairing version ${p.fromVersion}` });
    // Repairs record one time; nudge the outcome a moment later so it sorts after the start.
    const after = new Date(Date.parse(p.createdAt) + 1).toISOString();
    if (p.status === "repaired" && p.toVersion) events.push({ at: after, kind: "director", title: `Director saved version ${p.toVersion}; validator passed` });
    if (p.status === "gave_up") events.push({ at: after, kind: "fail", title: `Repair stopped: ${p.note ?? "no fix found"}` });
  }
  return events.sort((a, b) => b.at.localeCompare(a.at));
}

/**
 * Director View: how the game is being checked and repaired. Version, validator, routes,
 * Kane runs, repairs and scene assets all come from the server. Anything that could reveal a
 * clue or solution waits behind an explicit reveal.
 */
export function DirectorPanel({ adventureId, sessionVersion, onClose }: Props) {
  const [data, setData] = useState<DirectorData | null>(null);
  const [kane, setKane] = useState<KaneView | null>(null);
  const [spoilers, setSpoilers] = useState(false);
  const [openEvent, setOpenEvent] = useState<number | null>(null);
  const [openRun, setOpenRun] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  useEscape(onClose);

  useEffect(() => {
    let stop = false;
    const load = () => {
      api.director(adventureId).then((d) => !stop && setData(d)).catch(() => {});
      api.kane(adventureId).then((k) => !stop && setKane(k)).catch(() => {});
    };
    load();
    const t = setInterval(load, 2500);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [adventureId]);

  async function runChecks() {
    setStarting(true);
    try {
      await api.rehearse(adventureId);
      setKane(await api.kane(adventureId));
    } finally {
      setStarting(false);
    }
  }

  const issues = data?.validatorIssues.length ?? 0;
  const scenesReady = data?.images.filter((i) => i.status === "ready" || i.status === "placeholder").length ?? 0;
  const routeLabel = (id: string) => kane?.routes.find((r) => r.routeId === id)?.label ?? id;
  const latestRepair: Repair | undefined = kane?.repairs.find((r) => r.status === "repaired");
  const busy = kane?.runs.some((r) => r.status === "queued" || r.status === "running");
  const events = kane ? timeline(kane, routeLabel) : [];

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
            <strong>Spoilers ahead.</strong> Kane's steps, repairs and route objectives can reveal clues and solutions.
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
              {data && sessionVersion !== data.adventure.version && <span className="muted"> (you're on v{sessionVersion})</span>}
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
            <dd>{latestRepair ? `${clock(latestRepair.createdAt)} · v${latestRepair.fromVersion}→v${latestRepair.toVersion}` : "None"}</dd>
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

      {/* B. Routes on the current version */}
      <section className="dsec">
        <h3>Escape routes · v{kane?.currentVersion ?? "…"}</h3>
        {kane?.problem && <p className="notice error">{kane.problem}</p>}
        <ul className="routes">
          {kane?.routes.map((r) => (
            <li key={r.routeId} className={`route ${statusClass(r.readiness)}`}>
              <div className="route-row">
                <strong>{r.label}</strong>
                <span className={`status ${statusClass(r.readiness)}`}>
                  <i aria-hidden /> {READINESS_TEXT[r.readiness]}
                </span>
              </div>
            </li>
          ))}
        </ul>
        <button type="button" className="btn-ghost" onClick={runChecks} disabled={starting || busy || !kane?.enabled}>
          {busy ? "Kane is running…" : starting ? "Starting…" : "Run Kane on every route"}
        </button>
        {spoilers && data && (
          <details className="objectives">
            <summary>Route objectives Kane follows</summary>
            {data.routes.map((r) => (
              <p key={r.routeId}>{r.objective}</p>
            ))}
          </details>
        )}
      </section>

      {/* C. Kane runs */}
      <section className="dsec">
        <h3>Kane runs</h3>
        {!kane?.runs.length ? (
          <p className="muted">No Kane runs yet.</p>
        ) : (
          <ul className="routes">
            {kane.runs.map((r) => {
              const outdated = r.scenarioVersion < kane.currentVersion && r.status !== "queued" && r.status !== "running";
              const failed = r.steps.find((s) => s.status === "failed");
              const done = r.steps.filter((s) => s.status !== "running").length;
              return (
                <li key={r.id} className={`route ${outdated ? "outdated" : ""}`}>
                  <div className="route-row">
                    <strong>
                      {routeLabel(r.routeId)} · v{r.scenarioVersion}
                    </strong>
                    <span className={`status ${statusClass(r.status)}`}>
                      <i aria-hidden /> {outdated ? `${RUN_TEXT[r.status]} · outdated` : RUN_TEXT[r.status]}
                    </span>
                  </div>
                  <p className="route-note">
                    {r.status === "running" ? `${done} step${done === 1 ? "" : "s"} so far` : (r.oneLiner ?? r.reason ?? "Waiting for a free Kane slot")}
                    {r.durationS !== null && ` · ${secs(r.durationS)}`}
                    {r.credits !== null && ` · ${Math.round(r.credits)} credits`}
                    {r.prior && <span className="sample-tag">Prior run</span>}
                  </p>
                  {failed && !spoilers && <p className="route-note">Failed at step {failed.step}. Reveal spoilers to read why.</p>}
                  <div className="run-links">
                    {r.steps.length > 0 && (
                      <button type="button" className="text-btn" onClick={() => setOpenRun(openRun === r.id ? null : r.id)} aria-expanded={openRun === r.id}>
                        {openRun === r.id ? "Hide steps" : "Show steps"}
                      </button>
                    )}
                    {r.testUrl && (
                      <a className="text-btn" href={r.testUrl} target="_blank" rel="noreferrer">
                        Open in Test Manager
                      </a>
                    )}
                  </div>
                  {openRun === r.id && (
                    <ol className="run-steps">
                      {r.steps.map((s, i) => (
                        <li key={i} className={s.status}>
                          {spoilers ? s.remark : s.status === "failed" ? "Failed step (spoiler hidden)" : `Step ${s.step}`}
                        </li>
                      ))}
                    </ol>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* D. Timeline */}
      {events.length > 0 && (
        <section className="dsec">
          <h3>Live activity</h3>
          <ol className="timeline">
            {events.map((e, i) => (
              <li key={i} className={e.kind === "infra" ? "fail" : e.kind}>
                <span className="tl-time">{clock(e.at)}</span>
                <div className="tl-body">
                  {e.evidence ? (
                    <button type="button" className="tl-title" aria-expanded={openEvent === i} onClick={() => setOpenEvent(openEvent === i ? null : i)}>
                      {e.title}
                    </button>
                  ) : (
                    <span className="tl-title">{e.title}</span>
                  )}
                  {openEvent === i && e.evidence && <p className="tl-evidence">{spoilers ? e.evidence : "Evidence hidden. Reveal spoilers to read it."}</p>}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* E. Repairs */}
      {kane && kane.repairs.length > 0 && (
        <section className="dsec">
          <h3>Failure and repair</h3>
          {kane.repairs.map((p) => (
            <div key={p.id} className="repair-block">
              <p className="route-note">
                {routeLabel(p.routeId)} · v{p.fromVersion}
                {p.toVersion ? ` → v${p.toVersion}` : ""} ·{" "}
                {p.status === "repaired" ? "Repaired; Kane replays every route on the new version" : p.status === "repairing" ? "Repairing…" : `Stopped: ${p.note ?? ""}`}
              </p>
              {spoilers && p.changes.length > 0 && (
                <table className="repair">
                  <thead>
                    <tr>
                      <th scope="col">Field</th>
                      <th scope="col">Before</th>
                      <th scope="col">After</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.changes.map((c, n) => (
                      <tr key={n}>
                        <th scope="row">{c.field}</th>
                        <td className="changed-from">{c.before}</td>
                        <td className="changed-to">{c.after}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {!spoilers && p.changes.length > 0 && <p className="muted small">{p.changes.length} change(s). Reveal spoilers to compare.</p>}
            </div>
          ))}
        </section>
      )}

      {/* F. Scene assets */}
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
      </section>
    </aside>
  );
}
