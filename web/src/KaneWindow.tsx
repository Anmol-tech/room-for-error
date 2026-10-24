import { useEffect, useRef, useState } from "react";
import type { KaneLive, KaneRunStatus, KaneStep } from "../../shared/schema.ts";
import { api } from "./api.ts";
import { KaneExplore } from "./KaneExplore.tsx";
import { useEscape } from "./Overlays.tsx";

const STATUS: Record<KaneRunStatus, { text: string; tone: "live" | "good" | "bad" | "idle" }> = {
  queued: { text: "Waiting to start", tone: "idle" },
  running: { text: "Playing the route", tone: "live" },
  passed: { text: "Route passed", tone: "good" },
  failed: { text: "Found a problem", tone: "bad" },
  off_route: { text: "Took another exit", tone: "idle" },
  infra_error: { text: "Couldn't run", tone: "bad" },
  cancelled: { text: "Cancelled", tone: "idle" },
};

/** Kane's steps can contain the codes it typed. Hide them unless spoilers are on. */
function maskCodes(text: string, show: boolean): string {
  return show ? text : text.replace(/(["'“”])(\s*[\w-]{3,12}\s*)\1|(["“])([\w-]{3,12})(["”])/g, (m) => (/\d/.test(m) ? "“••••”" : m));
}

function cleanRemark(remark: string): string {
  // While a step is in progress Kane only reports "Step N".
  if (/^step \d+$/i.test(remark.trim())) return "Thinking…";
  // Kane's planner remarks look like "click: PRIMARY: Search desk button; role=button; …".
  const head = remark.replace(/^\w+:\s*/, "").replace(/^PRIMARY:\s*/, "").split(/\s*[;|]\s*/)[0];
  return head.length > 140 ? `${head.slice(0, 137)}…` : head;
}

function elapsed(from: string | null, to: string | null, now: number): string {
  if (!from) return "0:00";
  const s = Math.max(0, Math.round(((to ? Date.parse(to) : now) - Date.parse(from)) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * "Kane at work": a small live window in the bottom-right corner while you play. It mirrors the
 * game session Kane is testing (read from our server) and Kane's step-by-step progress.
 * Click it to watch full screen.
 */
export function KaneWindow({ adventureId }: { adventureId: string }) {
  const [live, setLive] = useState<KaneLive | null>(null);
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [spoilers, setSpoilers] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [starting, setStarting] = useState(false);

  const exploring = live?.exploration?.status === "running" || live?.exploration?.status === "queued";
  const running = live?.run?.status === "running" || (live?.queued ?? 0) > 0 || exploring;

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const next = await api.kaneLive(adventureId);
        if (!stop) setLive(next);
      } catch {
        // keep the last view; the next poll retries
      }
      if (!stop) timer = setTimeout(load, running || open ? 1500 : 5000);
    };
    load();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [adventureId, running, open]);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);

  async function rehearse() {
    setStarting(true);
    try {
      await api.rehearse(adventureId);
      setLive(await api.kaneLive(adventureId));
    } finally {
      setStarting(false);
    }
  }

  async function startExplore() {
    setStarting(true);
    try {
      await api.explore(adventureId);
      setLive(await api.kaneLive(adventureId));
    } finally {
      setStarting(false);
    }
  }

  async function stopExplore() {
    await api.stopExplore(adventureId);
    setLive(await api.kaneLive(adventureId));
  }

  if (!live) return null;
  const run = live.run;
  const status = run ? STATUS[run.status] : null;
  const x = live.exploration;
  const tone = live.problem ? "bad" : exploring ? "live" : (status?.tone ?? "idle");
  const label = live.problem
    ? "Offline"
    : exploring
      ? x!.status === "queued"
        ? "Exploration queued"
        : "Exploring freely"
      : run
        ? live.queued && run.status !== "running"
          ? "Queued"
          : status!.text
        : "Not run yet";
  const lastStep = run?.steps.at(-1);
  const lastFeed = x?.feed.at(-1);

  if (minimized && !open) {
    return (
      <button type="button" className={`kane-pill ${tone}`} onClick={() => setMinimized(false)} aria-label={`Kane: ${label}. Show Kane window`}>
        <i aria-hidden /> Kane · {label}
      </button>
    );
  }

  return (
    <>
      {!open && (
        <div className={`kane-mini ${tone}`}>
          <header>
            <span className="kane-mini-title">
              <i aria-hidden /> Kane <span>· {label}</span>
            </span>
            <button type="button" className="kane-mini-min" onClick={() => setMinimized(true)} aria-label="Minimize Kane window">
              –
            </button>
          </header>
          <button type="button" className="kane-mini-body" onClick={() => setOpen(true)} aria-label="Watch Kane full screen">
            {live.session?.imageUrl ? <img src={live.session.imageUrl} alt="" /> : <span className="kane-mini-empty">{live.problem ?? "Kane hasn't tested this room yet"}</span>}
            {live.session && (
              <span className="kane-mini-room">
                {live.session.ending ? `Ending · ${live.session.ending.title}` : live.session.roomName}
              </span>
            )}
            {exploring && lastFeed ? (
              <span className="kane-mini-step">
                <b>{lastFeed.kind === "intent" ? "Trying" : "›"}</b> {maskCodes(lastFeed.text, false)}
              </span>
            ) : (
              lastStep && (
                <span className="kane-mini-step">
                  <b>{lastStep.step}</b> {maskCodes(cleanRemark(lastStep.remark), false)}
                </span>
              )
            )}
            <span className="kane-mini-expand" aria-hidden>
              ⤢
            </span>
          </button>
          {exploring && x ? (
            <footer>
              Free exploration · v{x.scenarioVersion} · {x.visited} screens · {x.frontier} to try · {elapsed(x.startedAt, null, now)}
            </footer>
          ) : (
            run && (
              <footer>
                {live.routeLabel} · v{run.scenarioVersion} · {elapsed(run.startedAt, run.finishedAt, now)}
                {live.queued > 0 && ` · ${live.queued} queued`}
              </footer>
            )
          )}
        </div>
      )}
      {open && (
        <KaneStage
          live={live}
          now={now}
          spoilers={spoilers}
          onSpoilers={() => setSpoilers((s) => !s)}
          onClose={() => setOpen(false)}
          onRehearse={rehearse}
          onExplore={startExplore}
          onStopExplore={stopExplore}
          onMap={async () => (await api.exploreMap(adventureId)).url}
          exploring={exploring}
          starting={starting}
          label={label}
          tone={tone}
        />
      )}
    </>
  );
}

interface StageProps {
  live: KaneLive;
  now: number;
  spoilers: boolean;
  onSpoilers: () => void;
  onClose: () => void;
  onRehearse: () => void;
  onExplore: () => void;
  onStopExplore: () => void;
  onMap: () => Promise<string | null>;
  exploring: boolean;
  starting: boolean;
  label: string;
  tone: string;
}

/** Full-screen view: Kane's screen on the left, its live step feed on the right. */
function KaneStage({ live, now, spoilers, onSpoilers, onClose, onRehearse, onExplore, onStopExplore, onMap, exploring, starting, label, tone }: StageProps) {
  const [tab, setTab] = useState<"routes" | "explore">(exploring ? "explore" : "routes");
  const run = live.run;
  const session = live.session;
  const feed = useRef<HTMLOListElement>(null);
  useEscape(onClose);

  // Keep the newest step in view while Kane is playing.
  useEffect(() => {
    feed.current?.lastElementChild?.scrollIntoView({ block: "nearest" });
  }, [run?.steps.length]);

  const busy = run?.status === "running" || live.queued > 0 || exploring;
  const x = live.exploration;

  return (
    <div className="modal-scrim kane-stage-scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section className={`kane-stage ${tone}`} role="dialog" aria-modal="true" aria-labelledby="kane-stage-title">
        <header className="kane-stage-head">
          <div>
            <h2 id="kane-stage-title">Kane at work</h2>
            <p>
              <span className={`kane-badge ${tone}`}>
                <i aria-hidden /> {label}
              </span>
              {tab === "explore" && x ? (
                <>
                  {" "}
                  Free exploration · version {x.scenarioVersion} · {elapsed(x.startedAt, x.finishedAt, now)}
                </>
              ) : run && (
                <>
                  {" "}
                  {live.routeLabel} · version {run.scenarioVersion}
                  {run.scenarioVersion !== live.currentVersion && <span className="muted"> (current is v{live.currentVersion})</span>} · {elapsed(run.startedAt, run.finishedAt, now)}
                </>
              )}
            </p>
          </div>
          <div className="segmented kane-tabs" role="tablist" aria-label="What Kane is doing">
            <button type="button" role="tab" aria-selected={tab === "routes"} aria-checked={tab === "routes"} onClick={() => setTab("routes")}>
              Route tests
            </button>
            <button type="button" role="tab" aria-selected={tab === "explore"} aria-checked={tab === "explore"} onClick={() => setTab("explore")}>
              Free exploration{exploring ? " ●" : ""}
            </button>
          </div>
          <div className="kane-stage-tools">
            <button type="button" className="text-btn" onClick={onSpoilers} aria-pressed={spoilers}>
              {spoilers ? "Hide codes" : "Show codes"}
            </button>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close" autoFocus>
              ×
            </button>
          </div>
        </header>

        <div className="kane-stage-body">
          <div className="kane-screen">
            <p className="kane-screen-label">What Kane sees</p>
            <figure className="kane-screen-frame">
              {session?.imageUrl ? <img src={session.imageUrl} alt={`${session.roomName}, as Kane sees it`} /> : <div className="kane-screen-empty">{live.problem ?? "No test session yet"}</div>}
              {session && <span className="kane-screen-room">{session.roomName}</span>}
              {session?.ending && (
                <div className="kane-screen-ending">
                  <span>Ending reached</span>
                  <strong>{session.ending.title}</strong>
                </div>
              )}
              {(run?.status === "running" || x?.status === "running") && <span className="kane-live-tag">● Live</span>}
            </figure>
            {session && (
              <div className="kane-screen-state">
                <p className={`kane-screen-msg ${session.messageKind ?? ""}`}>{maskCodes(session.message ?? session.roomDescription, spoilers)}</p>
                <div className="kane-screen-inv">
                  <span>Kane's inventory</span>
                  {session.inventory.length ? (
                    session.inventory.map((i) => (
                      <span key={i.id} className="kane-item">
                        {i.imageUrl ? <img src={i.imageUrl} alt="" /> : <span aria-hidden>{i.icon ?? "◆"}</span>}
                        {i.name}
                      </span>
                    ))
                  ) : (
                    <em>empty</em>
                  )}
                </div>
              </div>
            )}
          </div>

          {tab === "explore" ? (
            <div className="kane-feed explore-col">
              <KaneExplore exploration={x} busy={busy && !exploring} problem={live.problem} onExplore={onExplore} onStop={onStopExplore} onMap={onMap} />
            </div>
          ) : (
          <div className="kane-feed">
            <p className="kane-screen-label">Kane's steps</p>
            {run?.steps.length ? (
              <ol ref={feed}>
                {run.steps.map((s: KaneStep) => (
                  <li key={`${s.step}-${s.status}`} className={s.status}>
                    <span className="kane-step-n">{s.step}</span>
                    <span className="kane-step-icon" aria-label={s.status}>
                      {s.status === "running" ? <span className="spinner" /> : s.status === "done" ? "✓" : "✕"}
                    </span>
                    <span className="kane-step-text">{maskCodes(cleanRemark(s.remark), spoilers)}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="muted small">{busy ? "Kane is starting its browser…" : "No steps yet."}</p>
            )}

            {run && run.status !== "running" && run.status !== "queued" && (
              <div className={`kane-result ${tone}`}>
                <strong>{STATUS[run.status].text}</strong>
                {(run.oneLiner || run.reason) && <p>{maskCodes(run.oneLiner ?? run.reason ?? "", spoilers)}</p>}
                <p className="small muted">
                  {run.durationS != null && `${Math.round(run.durationS)} s`}
                  {run.credits != null && ` · ${run.credits.toFixed(1)} credits`}
                  {run.testUrl && (
                    <>
                      {" · "}
                      <a href={run.testUrl} target="_blank" rel="noreferrer">
                        Kane report
                      </a>
                    </>
                  )}
                </p>
              </div>
            )}

            <div className="kane-routes">
              <p className="kane-screen-label">Routes on version {live.currentVersion}</p>
              <ul>
                {live.routes.map((r) => (
                  <li key={r.routeId}>
                    <span>{r.label}</span>
                    <span className={`status ${r.readiness === "passed" ? "passed" : r.readiness === "withheld" ? "failed" : r.readiness === "testing" || r.readiness === "repairing" ? "running" : "queued"}`}>
                      <i aria-hidden /> {r.readiness}
                    </span>
                  </li>
                ))}
              </ul>
              <button type="button" className="btn-ghost" onClick={onRehearse} disabled={busy || starting || !!live.problem}>
                {busy ? "Kane is busy…" : starting ? "Starting…" : "Run Kane on every route"}
              </button>
            </div>
          </div>
          )}
        </div>
      </section>
    </div>
  );
}
