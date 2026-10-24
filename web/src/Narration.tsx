import { useEffect, useState } from "react";
import type { HintResult } from "../../shared/schema.ts";
import { CHAR_MS, useSettings } from "./settings.ts";

interface Props {
  text: string;
  tone: "info" | "success" | "error" | null;
  /** Changes on every new line so the typewriter restarts. */
  beat: number;
  hint: HintResult | null;
  hintBusy: boolean;
  onHint: () => void;
  onHistory: () => void;
  /** Extra controls under the text (e.g. exits that have no spot in the picture). */
  children?: React.ReactNode;
}

/** Translucent narration panel: typed-out text, click or Enter to reveal it all, history and hints. */
export function Narration({ text, tone, beat, hint, hintBusy, onHint, onHistory, children }: Props) {
  const { narration } = useSettings();
  const ms = CHAR_MS[narration];
  const [shown, setShown] = useState(ms ? 0 : text.length);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!ms) {
      setShown(text.length);
      return;
    }
    setShown(0);
    const t = setInterval(() => {
      setShown((n) => {
        if (n >= text.length) {
          clearInterval(t);
          return n;
        }
        return n + 1;
      });
    }, ms);
    return () => clearInterval(t);
  }, [text, beat, ms]);

  // Enter or Space reveals the whole line (when focus isn't on a control).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "Enter" || e.key === " ") && !(e.target as HTMLElement).closest("button, input, a, textarea")) {
        if (shown < text.length) {
          e.preventDefault();
          setShown(text.length);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shown, text]);

  return (
    <section className={`narration ${tone ?? ""} ${collapsed ? "collapsed" : ""}`} aria-label="Narration">
      {!collapsed && (
        <div className="narration-body">
          <p className="narration-text" onClick={() => setShown(text.length)}>
            <span aria-hidden>{text.slice(0, shown)}</span>
            {shown < text.length && <span className="caret" aria-hidden />}
          </p>
          {/* Screen readers get the whole line at once. */}
          <p className="sr-only" role="status">
            {text}
          </p>
          {hint && (
            <p className="hint-line" role="status">
              <span className="hint-level" aria-label={`Hint ${hint.level} of 3`}>
                {[1, 2, 3].map((n) => (
                  <i key={n} className={n <= hint.level ? "on" : ""} />
                ))}
              </span>
              {hint.text}
            </p>
          )}
          {children}
        </div>
      )}
      <div className="narration-tools">
        <button type="button" className="text-btn" onClick={onHistory}>
          History
        </button>
        <button type="button" className="text-btn" onClick={onHint} disabled={hintBusy}>
          {hint ? (hint.level < 3 ? "Another hint" : "Hint") : "Need a hint?"}
        </button>
        <button type="button" className="text-btn" onClick={() => setCollapsed((c) => !c)} aria-expanded={!collapsed}>
          {collapsed ? "Show narration" : "Hide"}
        </button>
      </div>
    </section>
  );
}
