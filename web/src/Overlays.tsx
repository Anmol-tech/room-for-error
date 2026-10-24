// Full-canvas moments and sheets around the game: room transitions, pause menu, narration history.
import { useEffect } from "react";
import { Link } from "react-router-dom";
import type { LogEntry, SessionStats } from "../../shared/schema.ts";
import { updateSettings, useSettings, type NarrationSpeed } from "./settings.ts";

const NUMERALS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
const SPEEDS: NarrationSpeed[] = ["slow", "normal", "fast", "instant"];

export function useEscape(onEscape: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onEscape();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onEscape]);
}

/** Darkens the scene and reveals the room's number, name and first line. Click or any key skips. */
export function RoomTransition({ index, name, tagline, onDone }: { index: number; name: string; tagline: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2600);
    const onKey = () => onDone();
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [onDone]);

  return (
    <div className="transition" onClick={onDone} role="status">
      <span className="transition-numeral">{NUMERALS[index] ?? index + 1}</span>
      <strong className="transition-name">{name}</strong>
      <span className="transition-tagline">{tagline}</span>
      <button type="button" className="transition-skip text-btn" onClick={onDone}>
        Skip
      </button>
    </div>
  );
}

export function elapsed(stats: SessionStats, now = Date.now()): string {
  const end = stats.endedAt ? Date.parse(stats.endedAt) : now;
  const s = Math.max(0, Math.round((end - Date.parse(stats.startedAt)) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

interface PauseProps {
  stats: SessionStats;
  muted: boolean;
  onToggleSound: () => void;
  onResume: () => void;
  onRestart: () => void;
}

export function PauseMenu({ stats, muted, onToggleSound, onResume, onRestart }: PauseProps) {
  const settings = useSettings();
  useEscape(onResume);
  return (
    <div className="modal-scrim" onClick={(e) => e.target === e.currentTarget && onResume()}>
      <section className="modal pause" role="dialog" aria-modal="true" aria-labelledby="pause-title">
        <h2 id="pause-title">Paused</h2>
        <dl className="stat-row">
          <div>
            <dt>Time</dt>
            <dd>{elapsed(stats)}</dd>
          </div>
          <div>
            <dt>Moves</dt>
            <dd>{stats.moves}</dd>
          </div>
          <div>
            <dt>Hints</dt>
            <dd>{stats.hintsUsed}</dd>
          </div>
          <div>
            <dt>Items</dt>
            <dd>
              {stats.itemsFound}/{stats.itemsTotal}
            </dd>
          </div>
        </dl>
        <div className="settings-grid">
          <span id="p-hints">Hints</span>
          <button type="button" role="switch" aria-checked={settings.hints} aria-labelledby="p-hints" className="switch" onClick={() => updateSettings({ hints: !settings.hints })}>
            <span />
          </button>
          <span id="p-speed">Narration speed</span>
          <div className="segmented" role="radiogroup" aria-labelledby="p-speed">
            {SPEEDS.map((s) => (
              <button key={s} type="button" role="radio" aria-checked={settings.narration === s} onClick={() => updateSettings({ narration: s })}>
                {s}
              </button>
            ))}
          </div>
          <span id="p-sound">Sound</span>
          <button type="button" role="switch" aria-checked={!muted} aria-labelledby="p-sound" className="switch" onClick={onToggleSound}>
            <span />
          </button>
        </div>
        <div className="pause-actions">
          <button type="button" className="btn-primary" onClick={onResume} autoFocus>
            Resume
          </button>
          <button type="button" className="btn-ghost" onClick={onRestart}>
            Restart mission
          </button>
          <Link to="/" className="btn-ghost">
            Leave room
          </Link>
        </div>
      </section>
    </div>
  );
}

export function HistorySheet({ log, onClose }: { log: LogEntry[]; onClose: () => void }) {
  useEscape(onClose);
  return (
    <div className="sheet-scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="sheet history" role="dialog" aria-modal="true" aria-labelledby="history-title">
        <header className="sheet-head">
          <h2 id="history-title">History</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close history" autoFocus>
            ×
          </button>
        </header>
        <ol className="history-list">
          {[...log].reverse().map((e, i) => (
            <li key={i} className={e.kind}>
              <p className="history-meta">
                {e.roomName}
                {e.action && <span> · {e.action}</span>}
              </p>
              <p className="history-text">{e.text}</p>
              {e.found.length > 0 && <p className="history-found">Found: {e.found.join(", ")}</p>}
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}
