import { useEffect, useRef, type FormEvent } from "react";
import { play } from "./sound.ts";

interface Props {
  /** The lock or terminal, e.g. "Glowing terminal". */
  name: string;
  prompt: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
  busy: boolean;
  /** Bumps when a code is rejected, to replay the shake. */
  rejected: number;
  /** Message for the last rejected code. */
  status: string | null;
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"];

/** Focused keypad dialog. Validation happens on the server; the field stays typeable. */
export function Keypad({ name, prompt, value, onChange, onSubmit, onClose, busy, rejected, status }: Props) {
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
  }, [rejected]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function press(k: string) {
    play("key");
    if (k === "clear") onChange("");
    else if (k === "back") onChange(value.slice(0, -1));
    else onChange((value + k).slice(0, 12));
    input.current?.focus();
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    onSubmit();
  }

  return (
    <div className="modal-scrim keypad-scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form key={rejected} className={`keypad ${rejected ? "rejected" : ""}`} onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="keypad-name">
        <h2 id="keypad-name">{name}</h2>
        <label htmlFor="code" className="keypad-prompt">
          {prompt}
        </label>
        <input
          ref={input}
          id="code"
          className="keypad-display"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          inputMode="numeric"
          required
        />
        <p className="keypad-status" role="alert">
          {rejected > 0 && status ? status : " "}
        </p>
        <div className="keypad-grid">
          {KEYS.map((k) => (
            <button
              key={k}
              type="button"
              tabIndex={-1}
              className={k.length > 1 ? "keypad-fn" : ""}
              onClick={() => press(k)}
              disabled={busy}
              aria-label={k === "back" ? "Delete last digit" : k === "clear" ? "Clear" : k}
            >
              {k === "back" ? "⌫" : k === "clear" ? "Clear" : k}
            </button>
          ))}
        </div>
        <div className="keypad-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Step back
          </button>
          <button type="submit" className="btn-primary" disabled={busy || !value}>
            Submit code
          </button>
        </div>
      </form>
    </div>
  );
}
