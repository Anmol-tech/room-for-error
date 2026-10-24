import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { ActionView, HintResult, SessionView } from "../../shared/schema.ts";
import { KaneBadge } from "./KaneBadge.tsx";
import { api } from "./api.ts";
import { DirectorPanel } from "./DirectorPanel.tsx";
import { Ending } from "./Ending.tsx";
import { Inventory } from "./Inventory.tsx";
import { KaneWindow } from "./KaneWindow.tsx";
import { Keypad } from "./Keypad.tsx";
import { LOCK_TAG, Mechanism } from "./Mechanism.tsx";
import { LockCloseup, lockSkin } from "./lockSkin.tsx";
import { Narration } from "./Narration.tsx";
import { HistorySheet, NotebookSheet, PauseMenu, RoomTransition } from "./Overlays.tsx";
import { Scene } from "./Scene.tsx";
import { updateSettings, useSettings } from "./settings.ts";
import { moodFor, music, type Mood } from "./music.ts";
import { play, setSilenced } from "./sound.ts";
import { SoundOffIcon, SoundOnIcon } from "./Start.tsx";
import { useSound } from "./useSound.ts";
import { isImageModeration } from "../../shared/imageModeration.ts";
import { ModerationNotice } from "./ModerationNotice.tsx";

const HOTBAR_SLOTS = 6;

export function Game() {
  const { scenarioId = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const sessionId = params.get("s");
  const settings = useSettings();
  // ?hints=1 or 0 overrides the saved setting for this page (automated test runs use hints=1).
  const hintsParam = params.get("hints");
  // ?test=1 is the mode Kane plays in: every option listed, instant narration, no room transitions.
  const testMode = params.get("test") === "1";
  const hints = testMode || hintsParam === "1" ? true : hintsParam === "0" ? false : settings.hints;
  const [muted, toggleSound] = useSound();
  // One mood per adventure, from its theme, title and first room, so the music doesn't jump between rooms.
  const moodRef = useRef<{ id: string; mood: Mood } | null>(null);

  const [view, setView] = useState<SessionView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [moderated, setModerated] = useState(false);
  const [offline, setOffline] = useState(false);
  const [busy, setBusy] = useState(false);
  const [beat, setBeat] = useState(0);
  const [codeAction, setCodeAction] = useState<ActionView | null>(null);
  const [code, setCode] = useState("");
  const [rejected, setRejected] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [newItems, setNewItems] = useState<string[]>([]);
  const [toast, setToast] = useState<{ items: SessionView["inventory"]; key: number } | null>(null);
  const [transition, setTransition] = useState<{ index: number; name: string; tagline: string; key: number } | null>(null);
  const [hint, setHint] = useState<HintResult | null>(null);
  const [hintBusy, setHintBusy] = useState(false);
  const [paused, setPaused] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [notebookOpen, setNotebookOpen] = useState(false);
  const [notebookNew, setNotebookNew] = useState(false);
  const [pulse, setPulse] = useState<{ actionIds: string[]; ok: boolean; key: number; item?: { imageUrl: string | null; icon: string | null } } | null>(null);
  const [directorOpen, setDirectorOpen] = useState(() => params.get("director") === "1");
  const creating = useRef(false);

  // Later rooms render in the background. A provider rejection ends this adventure for players too.
  useEffect(() => {
    if (moderated) return;
    let stopped = false;
    const check = () => api.adventure(scenarioId).then((a) => {
      if (!stopped && isImageModeration(a.error)) setModerated(true);
    }).catch(() => {});
    void check();
    const timer = setInterval(check, 3000);
    return () => { stopped = true; clearInterval(timer); };
  }, [scenarioId, moderated]);

  // In test mode the address names the room (or ending) the game is in: Kane's explorer tells screens
  // apart by address, and every room otherwise shares one, so it would never see past the first.
  const navigate = useNavigate();
  const location = useLocation();
  const place = view ? (view.ending ? `ending-${view.ending.id}` : view.roomId) : null;
  const addressChecked = useRef(false);
  useEffect(() => {
    if (!testMode || !place) return;
    const path = `/play/${encodeURIComponent(scenarioId)}/${encodeURIComponent(place)}`;
    // On arrival, an address naming another room than the game is in is a saved address replayed
    // against a game that has moved on. Rooms can't be jumped to, so start over in a fresh game.
    if (!addressChecked.current) {
      addressChecked.current = true;
      const asked = location.pathname.split("/")[3];
      if (asked && decodeURIComponent(asked) !== place) {
        navigate(`/explore/${encodeURIComponent(scenarioId)}`, { replace: true });
        return;
      }
    }
    if (location.pathname !== path) navigate(`${path}${location.search}`, { replace: true });
  }, [testMode, place, scenarioId, location.pathname, location.search, navigate]);

  const announceRoom = (v: SessionView) => {
    if (!testMode) setTransition({ index: v.roomIndex, name: v.roomName, tagline: v.roomTagline, key: Date.now() });
  };

  // Start a new session when the URL has none; otherwise resume it (progress lives on the server).
  useEffect(() => {
    if (sessionId) {
      api
        .session(sessionId)
        .then((v) => {
          setView(v);
          if (!v.ending) announceRoom(v);
        })
        .catch((e) => setError(e.message));
      return;
    }
    if (creating.current) return;
    creating.current = true;
    api
      .createSession(scenarioId)
      .then((v) => {
        setView(v);
        announceRoom(v);
        setParams((p) => ({ ...Object.fromEntries(p), s: v.sessionId }), { replace: true });
      })
      .catch((e) => setError(e.message))
      .finally(() => (creating.current = false));
  }, [scenarioId, sessionId, setParams]);

  // Pick up scene images and object detection that finish after the room appears; notice lost connections.
  useEffect(() => {
    if (!view || view.ending || moderated) return;
    const t = setInterval(
      () =>
        api
          .session(view.sessionId)
          .then((v) => {
            setOffline(false);
            setView((cur) =>
              cur && cur.stats.moves === v.stats.moves
                ? { ...cur, imageUrl: v.imageUrl, hotspots: v.hotspots, solved: v.solved, sceneUpdating: v.sceneUpdating, inventory: v.inventory, notebook: v.notebook }
                : cur,
            );
          })
          .catch((err) => {
            if (isImageModeration(err instanceof Error ? err.message : String(err))) setModerated(true);
            else setOffline(true);
          }),
      3000,
    );
    return () => clearInterval(t);
  }, [view?.sessionId, view?.ending, moderated]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  // Theme music: off in Kane's test mode, when muted or switched off, and once the adventure ends.
  if (view && moodRef.current?.id !== view.scenarioId) {
    moodRef.current = { id: view.scenarioId, mood: moodFor(view.theme, view.title, view.roomName, view.roomDescription) };
  }
  const musicOn = !!view && !testMode && settings.music && !muted && !view.ending;
  useEffect(() => {
    setSilenced(testMode);
    return () => setSilenced(false);
  }, [testMode]);
  useEffect(() => {
    if (musicOn && moodRef.current && view) music.play(moodRef.current.mood, view.roomIndex, view.title);
    else music.stop();
  }, [musicOn, view?.scenarioId, view?.title]);
  useEffect(() => music.setLevel(view?.roomIndex ?? 0), [view?.roomIndex]);
  useEffect(() => {
    const unlock = () => music.unlock();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      music.stop(0.6);
    };
  }, []);

  /** Applies a new session view from any action, with sounds, toasts and room transitions. */
  const land = useCallback(
    (prev: SessionView, next: SessionView, fromKeypad: boolean) => {
      const before = new Set(prev.inventory.map((i) => i.id));
      const known = new Set(prev.notebook.map((n) => n.id));
      const clues = next.notebook.filter((n) => !known.has(n.id));
      if (clues.length) setNotebookNew(true);
      // New clues show in the "Found" toast next to items.
      const gained = [
        ...next.inventory.filter((i) => !before.has(i.id)),
        ...clues.map((n) => ({ id: n.id, name: "New clue in your notebook", description: n.text, icon: "📓", imageUrl: null })),
      ];
      const moved = next.roomId !== prev.roomId;
      setNewItems(gained.map((i) => i.id));
      setView(next);
      setBeat((b) => b + 1);
      setHint(null);
      setOffline(false);
      if (next.ending) {
        setCodeAction(null);
        setSelected(null);
        play("win");
      } else if (next.messageKind === "error") {
        play("error");
        if (fromKeypad) setRejected((r) => r + 1);
      } else {
        setCodeAction(null);
        if (gained.length) {
          play("pickup");
          setToast({ items: gained, key: Date.now() });
        } else play(moved ? "move" : "success");
      }
      if (moved && !next.ending) announceRoom(next);
      setCode("");
    },
    [],
  );

  const run = useCallback(
    async (actionId: string, input?: string) => {
      if (!view) return;
      setBusy(true);
      try {
        const next = await api.act(view.sessionId, actionId, input);
        land(view, next, input !== undefined);
        setPulse({ actionIds: [actionId], ok: next.messageKind !== "error", key: Date.now() });
      } catch {
        setOffline(true);
      } finally {
        setBusy(false);
      }
    },
    [view, land],
  );

  const onAction = useCallback(
    (a: ActionView) => {
      play("click");
      if (a.inputPrompt && !a.locked) {
        setCodeAction(a);
        setCode("");
        setRejected(0);
      } else run(a.id);
    },
    [run],
  );

  const onUse = useCallback(
    async (actionIds: string[], dropped?: string) => {
      const itemId = dropped ?? selected;
      if (!view || !itemId) return;
      const item = view.inventory.find((i) => i.id === itemId);
      play("click");
      setBusy(true);
      try {
        const next = await api.use(view.sessionId, itemId, actionIds);
        if (next.openInputFor) {
          const action = next.actions.find((a) => a.id === next.openInputFor);
          if (action) {
            setCodeAction(action);
            setRejected(0);
          }
          return;
        }
        land(view, next, false);
        setPulse({ actionIds, ok: next.messageKind !== "error", key: Date.now(), item: item && { imageUrl: item.imageUrl, icon: item.icon } });
        // Keep the item selected after a miss so the player can try it somewhere else.
        if (next.messageKind !== "error") setSelected(null);
        else if (dropped) setSelected(dropped);
      } catch {
        setOffline(true);
      } finally {
        setBusy(false);
      }
    },
    [view, selected, land],
  );

  const cancelUse = useCallback(() => setSelected(null), []);

  async function askHint() {
    if (!view) return;
    setHintBusy(true);
    try {
      setHint(await api.hint(view.sessionId));
      setView((v) => (v ? { ...v, stats: { ...v.stats, hintsUsed: v.stats.hintsUsed + 1 } } : v));
    } catch {
      setOffline(true);
    } finally {
      setHintBusy(false);
    }
  }

  // With hints off, the "Things to explore" list disappears; exits with no spot in the picture stay reachable.
  const spotted = useMemo(() => new Set(view?.hotspots.map((h) => h.actionId) ?? []), [view?.hotspots]);
  const unspotted = useMemo(() => view?.actions.filter((a) => !spotted.has(a.id)) ?? [], [view?.actions, spotted]);
  const exploreList = useMemo(() => (hints ? (view?.actions ?? []) : []), [hints, view?.actions]);

  // Number keys pick from the visible list.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!view || view.ending || codeAction || busy || paused || transition || e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.target as HTMLElement).closest("input, textarea")) return;
      const list = hints ? exploreList : unspotted;
      const n = Number(e.key);
      if (n >= 1 && n <= list.length) {
        e.preventDefault();
        onAction(list[n - 1]);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, codeAction, busy, paused, transition, hints, exploreList, unspotted, onAction]);

  function restart() {
    setPaused(false);
    setView(null);
    setSelected(null);
    setCodeAction(null);
    setParams({}, { replace: false });
  }

  if (moderated || isImageModeration(error)) return <ModerationNotice />;

  if (error && !view) {
    return (
      <div className="center-page">
        <p className="notice error" role="alert">
          {error}
        </p>
        <Link to="/" className="btn-ghost">
          Back to the start
        </Link>
      </div>
    );
  }
  if (!view) {
    return (
      <div className="center-page">
        <p className="muted">
          <span className="spinner" aria-hidden /> Opening the door…
        </p>
      </div>
    );
  }

  const topbar = (
    <TopBar view={view} hints={hints} muted={muted} onToggleSound={toggleSound} onPause={() => setPaused(true)} onDirector={() => setDirectorOpen(true)} />
  );
  const layers = (
    <>
      {paused && <PauseMenu stats={view.stats} muted={muted} onToggleSound={toggleSound} onResume={() => setPaused(false)} onRestart={restart} allowRestart={!testMode} />}
      {historyOpen && <HistorySheet log={view.log} onClose={() => setHistoryOpen(false)} />}
      {notebookOpen && <NotebookSheet entries={view.notebook} onClose={() => setNotebookOpen(false)} />}
      {directorOpen && <DirectorPanel adventureId={view.scenarioId} sessionVersion={view.scenarioVersion} onClose={() => setDirectorOpen(false)} />}
      {/* Kane at work, floating bottom-right while you play (not inside Kane's own test sessions). */}
      {!testMode && <KaneWindow adventureId={view.scenarioId} />}
    </>
  );

  if (view.ending) {
    return (
      <div className="game-page ended">
        {topbar}
        <Ending view={view} onTryOther={restart} testMode={testMode} />
        {layers}
      </div>
    );
  }

  const selectedItem = view.inventory.find((i) => i.id === selected) ?? null;
  const lockSpot = codeAction ? view.hotspots.find((h) => h.actionId === codeAction.id) : undefined;
  const lockName = codeAction ? (lockSpot?.object ?? codeAction.label) : "";
  const skin = codeAction ? lockSkin(lockSpot?.object, codeAction.label, codeAction.inputPrompt, view.roomName, view.roomDescription, view.title) : "plain";
  const closeup = lockSpot && view.imageUrl ? <LockCloseup url={view.imageUrl} spot={lockSpot} /> : null;

  return (
    <div className="game-page">
      {topbar}

      <main className="stage">
        <div className="play-area">
          <div className="canvas-wrap">
            <Scene
              url={view.imageUrl}
              alt={`${view.roomName}. ${view.roomDescription}`}
              hotspots={view.hotspots}
              actions={view.actions}
              solved={view.solved}
              disabled={busy || !!transition}
              showHints={hints}
              selectedItem={selectedItem}
              onAction={onAction}
              onUse={onUse}
              onCancelUse={cancelUse}
              pulse={pulse}
            >
              {view.sceneUpdating && (
                <p className="scene-updating" role="status">
                  <span className="spinner" aria-hidden /> Scene updating
                </p>
              )}
              {offline && (
                <p className="offline" role="alert">
                  Connection lost. Your progress is saved; retrying…
                </p>
              )}
              {toast && (
                <div key={toast.key} className="toast" role="status">
                  <span className="toast-label">Found</span>
                  {toast.items.map((i) => (
                    <span key={i.id} className="toast-item">
                      {i.imageUrl ? <img src={i.imageUrl} alt="" /> : <span aria-hidden>{i.icon ?? "◆"}</span>}
                      {i.name}
                    </span>
                  ))}
                </div>
              )}
              {transition && (
                <RoomTransition key={transition.key} index={transition.index} name={transition.name} tagline={transition.tagline} onDone={() => setTransition(null)} />
              )}
            </Scene>

          </div>

          {/* Narration and inventory live under the picture, so nothing in the room is ever covered. */}
          <div className="strip">
            <Narration instant={testMode} text={view.message ?? view.roomDescription} tone={view.messageKind} beat={beat} hint={hint} hintBusy={hintBusy} onHint={askHint} onHistory={() => setHistoryOpen(true)}>
              {(hints ? exploreList : unspotted).length > 0 && (
                <div className="choices-row" aria-label={hints ? "Things to explore" : "Other ways to go"}>
                  {hints && <span className="choices-label">Things to explore</span>}
                  {(hints ? exploreList : unspotted).map((a, i) => (
                    <button key={a.id} type="button" className={`exit-btn ${a.locked ? "locked" : ""}`} data-action-id={a.id} disabled={busy} onClick={() => onAction(a)}>
                      <kbd aria-hidden>{i + 1}</kbd>
                      {a.label}
                      {a.locked && <span className="tag-lock">Locked</span>}
                      {a.inputPrompt && !a.locked && <span className="tag-code">{LOCK_TAG[a.inputKind ?? "code"]}</span>}
                    </button>
                  ))}
                </div>
              )}
            </Narration>
            <Inventory
              items={view.inventory}
              newItems={newItems}
              selected={selected}
              onSelect={setSelected}
              slots={HOTBAR_SLOTS}
              notebookCount={view.notebook.length}
              notebookNew={notebookNew}
              onNotebook={() => {
                setNotebookNew(false);
                setNotebookOpen(true);
              }}
            />
          </div>
        </div>
      </main>

      {codeAction && codeAction.inputKind && codeAction.inputKind !== "code" && (
        <Mechanism
          key={codeAction.id}
          name={lockName}
          action={codeAction}
          onSubmit={(answer) => run(codeAction.id, answer)}
          onClose={() => setCodeAction(null)}
          busy={busy}
          rejected={rejected}
          status={view.messageKind === "error" ? view.message : null}
          notes={view.notebook}
          skin={skin}
          closeup={closeup}
        />
      )}
      {codeAction && (!codeAction.inputKind || codeAction.inputKind === "code") && (
        <Keypad
          name={lockName}
          prompt={codeAction.inputPrompt ?? "Enter the code"}
          value={code}
          onChange={setCode}
          onSubmit={() => run(codeAction.id, code)}
          onClose={() => setCodeAction(null)}
          busy={busy}
          rejected={rejected}
          status={view.messageKind === "error" ? view.message : null}
          notes={view.notebook}
          skin={skin}
          closeup={closeup}
        />
      )}
      {layers}
    </div>
  );
}

interface TopBarProps {
  view: SessionView;
  hints: boolean;
  muted: boolean;
  onToggleSound: () => void;
  onPause: () => void;
  onDirector: () => void;
}

const KANE_COPY: Record<NonNullable<SessionView["kane"]>["state"], string> = {
  testing: "Checking the route ahead",
  repairing: "Preparing the next passage",
  passed: "Route ready",
  delayed: "This passage needs a little longer",
};

function TopBar({ view, hints, muted, onToggleSound, onPause, onDirector }: TopBarProps) {
  const kane = view.kane;
  return (
    <header className="topbar">
      <div className="topbar-left">
        <Link to="/" className="wordmark">
          Room for Error
        </Link>
        <span className="mission">{view.title}</span>
        <KaneBadge />
      </div>
      <div className="topbar-center">
        <span className="room-title" data-testid="room-name">
          {view.ending ? "Escaped" : view.roomName}
        </span>
        {!view.ending && (
          <span className="room-progress">
            Room {view.roomIndex + 1} / {view.roomCount}
          </span>
        )}
      </div>
      <div className="topbar-right">
        {kane && (
          <span className={`kane-chip ${kane.state}`} title="Kane test-plays every escape route before it opens">
            <i aria-hidden /> Kane · {kane.newerVersion && kane.state !== "passed" ? "A repaired version is ready (restart)" : KANE_COPY[kane.state]}
          </span>
        )}
        <button
          type="button"
          role="switch"
          aria-checked={hints}
          className={`hint-toggle ${hints ? "on" : ""}`}
          onClick={() => {
            play("click");
            updateSettings({ hints: !hints });
          }}
        >
          <span className="switch small" aria-hidden>
            <span />
          </span>
          Hints
        </button>
        <button type="button" className="icon-btn" onClick={onToggleSound} aria-label={muted ? "Turn sound on" : "Turn sound off"} aria-pressed={!muted}>
          {muted ? <SoundOffIcon /> : <SoundOnIcon />}
        </button>
        <button type="button" className="icon-btn" onClick={onPause} aria-label="Pause and menu">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <path d="M5 7h14M5 12h14M5 17h14" />
          </svg>
        </button>
        <button type="button" className="director-btn" onClick={onDirector}>
          <i className={kane && kane.state !== "passed" ? "live" : ""} aria-hidden /> Director View
        </button>
      </div>
    </header>
  );
}
