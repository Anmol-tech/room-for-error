import type { ReactNode } from "react";
import type { LockSkin } from "./lockSkin.tsx";
import { useEffect, useState, type FormEvent } from "react";
import type { ActionView } from "../../shared/schema.ts";
import type { LockKind } from "../../shared/schema.ts";
import { play } from "./sound.ts";

/** Short tag shown on a lock's button. */
export const LOCK_TAG: Record<LockKind, string> = { code: "Code", symbols: "Wheels", switches: "Switches", order: "Torn note" };

interface Props {
  /** The lock as drawn, e.g. "Stone sundial lock". */
  name: string;
  action: ActionView;
  onSubmit: (answer: string) => void;
  onClose: () => void;
  busy: boolean;
  /** Bumps when an attempt is rejected, to replay the shake. */
  rejected: number;
  status: string | null;
  notes: { id: string; title: string; text: string }[];
  /** Look matched to the object and room (terminal, brass, stone...). */
  skin: LockSkin;
  /** Close-up of the object cut from the room picture. */
  closeup: ReactNode;
}

/**
 * Symbol wheels, switch panels and torn notes. Every control is a labeled button, so players can
 * use the keyboard and Kane can operate it. The answer is checked on the server.
 */
export function Mechanism({ name, action, onSubmit, onClose, busy, rejected, status, notes, skin, closeup }: Props) {
  const options = action.inputOptions ?? [];
  const [wheels, setWheels] = useState<number[]>(() => Array.from({ length: action.inputSlots ?? 3 }, () => 0));
  const [switches, setSwitches] = useState<boolean[]>(() => options.map(() => false));
  const [pieces, setPieces] = useState<string[]>(options);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const turn = (w: number, by: number) => {
    play("key");
    setWheels((cur) => cur.map((v, i) => (i === w ? (v + by + options.length) % options.length : v)));
  };
  const flip = (i: number) => {
    play("key");
    setSwitches((cur) => cur.map((v, n) => (n === i ? !v : v)));
  };
  const move = (i: number, by: number) => {
    const j = i + by;
    if (j < 0 || j >= pieces.length) return;
    play("key");
    setPieces((cur) => {
      const next = [...cur];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  function submit(e: FormEvent) {
    e.preventDefault();
    const answer =
      action.inputKind === "symbols"
        ? wheels.map((v) => options[v]).join(",")
        : action.inputKind === "switches"
          ? switches.map((on) => (on ? "on" : "off")).join(",")
          : pieces.join(" | ");
    onSubmit(answer);
  }

  const submitLabel = action.inputKind === "symbols" ? "Try the lock" : action.inputKind === "switches" ? "Activate the panel" : "Check the note";

  return (
    <div className="modal-scrim keypad-scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form key={rejected} data-skin={skin} className={`keypad mechanism ${rejected ? "rejected" : ""}`} onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="mech-name">
        {closeup}
        <h2 id="mech-name">{name}</h2>
        <p className="keypad-prompt">{action.inputPrompt}</p>

        {action.inputKind === "symbols" && (
          <div className="wheels">
            {wheels.map((v, w) => (
              <div key={w} className="wheel">
                <button type="button" onClick={() => turn(w, -1)} disabled={busy} aria-label={`Wheel ${w + 1}: previous symbol`}>
                  ▲
                </button>
                <output className="wheel-face" aria-live="polite" aria-label={`Wheel ${w + 1} shows ${options[v]}`}>
                  {options[v]}
                </output>
                <button type="button" onClick={() => turn(w, 1)} disabled={busy} aria-label={`Wheel ${w + 1}: next symbol`}>
                  ▼
                </button>
              </div>
            ))}
          </div>
        )}

        {action.inputKind === "switches" && (
          <div className="switch-panel">
            {options.map((label, i) => (
              <button
                key={label}
                type="button"
                role="switch"
                aria-checked={switches[i]}
                className={`panel-switch ${switches[i] ? "on" : ""}`}
                onClick={() => flip(i)}
                disabled={busy}
              >
                <span className="panel-lever" aria-hidden />
                <span className="panel-label">{label}</span>
                <span className="panel-state">{switches[i] ? "On" : "Off"}</span>
              </button>
            ))}
          </div>
        )}

        {action.inputKind === "order" && (
          <ol className="pieces">
            {pieces.map((p, i) => (
              <li key={p} className="piece">
                <span className="piece-text">{p}</span>
                <span className="piece-moves">
                  <button type="button" onClick={() => move(i, -1)} disabled={busy || i === 0} aria-label={`Move "${p}" up`}>
                    ↑
                  </button>
                  <button type="button" onClick={() => move(i, 1)} disabled={busy || i === pieces.length - 1} aria-label={`Move "${p}" down`}>
                    ↓
                  </button>
                </span>
              </li>
            ))}
          </ol>
        )}

        <p className="keypad-status" role="alert">
          {rejected > 0 && status ? status : " "}
        </p>
        {notes.length > 0 && (
          <aside className="keypad-notes" aria-label="Your notebook">
            <p className="keypad-notes-head">Your notebook</p>
            {notes.map((n) => (
              <p key={n.id}>
                <strong>{n.title}:</strong> {n.text}
              </p>
            ))}
          </aside>
        )}
        <div className="keypad-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Step back
          </button>
          <button type="submit" className="btn-primary" disabled={busy}>
            {submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
