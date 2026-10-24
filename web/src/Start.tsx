import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { AdventureSummary } from "../../shared/schema.ts";
import { api } from "./api.ts";
import { updateSettings, useSettings, type NarrationSpeed } from "./settings.ts";
import { useSound } from "./useSound.ts";

const EXAMPLES = ["A pirate ship trapped inside a bottle", "A forgotten laboratory beneath the city", "A moon hotel with one missing guest"];
const SPEEDS: NarrationSpeed[] = ["slow", "normal", "fast", "instant"];

export function Start() {
  const navigate = useNavigate();
  const settings = useSettings();
  const [muted, toggleSound] = useSound();
  const [theme, setTheme] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [directorOn, setDirectorOn] = useState<boolean | null>(null);
  const [adventures, setAdventures] = useState<AdventureSummary[]>([]);
  const [howOpen, setHowOpen] = useState(false);

  useEffect(() => {
    api.health().then((h) => setDirectorOn(h.director)).catch(() => setDirectorOn(false));
    api.adventures().then(setAdventures).catch(() => {});
  }, []);

  useEffect(() => {
    if (!howOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setHowOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [howOpen]);

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const adventure = await api.createAdventure(theme);
      navigate(`/adventure/${adventure.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  const ready = adventures.filter((a) => a.status === "ready" && a.coverUrl);
  const backdrop = (ready.find((a) => a.prepared) ?? ready[0])?.coverUrl;

  return (
    <div className="start-page">
      {backdrop && <div className="start-backdrop" style={{ backgroundImage: `url(${backdrop})` }} aria-hidden />}

      <header className="start-bar">
        <span className="wordmark">Room for Error</span>
        <div className="start-bar-actions">
          <button type="button" className="text-btn" onClick={() => setHowOpen(true)}>
            How it works
          </button>
          <button type="button" className="icon-btn" onClick={toggleSound} aria-label={muted ? "Turn sound on" : "Turn sound off"} aria-pressed={!muted}>
            {muted ? <SoundOffIcon /> : <SoundOnIcon />}
          </button>
        </div>
      </header>

      <main className="start">
        <h1 className="start-title">Every room has a way out.</h1>
        <p className="start-sub">Describe a world. Step inside. Find yours.</p>

        <form className="theme-field" onSubmit={create}>
          <label htmlFor="theme" className="sr-only">
            Describe the world of your escape room
          </label>
          <input
            id="theme"
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            placeholder="A flooded observatory where the stars are disappearing…"
            minLength={3}
            maxLength={200}
            required
            autoComplete="off"
          />
          <button type="submit" className="btn-primary" disabled={busy || directorOn === false}>
            {busy && <span className="spinner" aria-hidden />}
            Build my escape
          </button>
        </form>

        <div className="chips" aria-label="Example themes">
          {EXAMPLES.map((ex) => (
            <button key={ex} type="button" className="chip" onClick={() => setTheme(ex)}>
              {ex}
            </button>
          ))}
        </div>
        <p className="start-meta">Three rooms · Two puzzles · Two possible endings</p>

        {directorOn === false && <p className="notice">New rooms need a story model key on the server. The ready rooms below still play.</p>}
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}

        <details className="mission-settings">
          <summary>Mission settings</summary>
          <div className="settings-grid">
            <span id="set-hints">Hints</span>
            <button
              type="button"
              role="switch"
              aria-checked={settings.hints}
              aria-labelledby="set-hints"
              className="switch"
              onClick={() => updateSettings({ hints: !settings.hints })}
            >
              <span />
            </button>
            <span id="set-speed">Narration speed</span>
            <div className="segmented" role="radiogroup" aria-labelledby="set-speed">
              {SPEEDS.map((s) => (
                <button key={s} type="button" role="radio" aria-checked={settings.narration === s} onClick={() => updateSettings({ narration: s })}>
                  {s}
                </button>
              ))}
            </div>
            <span id="set-sound">Sound</span>
            <button type="button" role="switch" aria-checked={!muted} aria-labelledby="set-sound" className="switch" onClick={toggleSound}>
              <span />
            </button>
          </div>
        </details>

        {ready.length > 0 && (
          <section className="ready-rooms" aria-label="Ready rooms">
            <h2>Or step into a ready room</h2>
            <div className="ready-row">
              {ready.slice(0, 5).map((a) => (
                <Link key={a.id} to={`/play/${a.id}`} className="ready-card">
                  <img src={a.coverUrl!} alt="" loading="lazy" />
                  <span>{a.title}</span>
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>

      {howOpen && (
        <div className="modal-scrim" onClick={(e) => e.target === e.currentTarget && setHowOpen(false)}>
          <section className="modal how-modal" role="dialog" aria-modal="true" aria-labelledby="how-title">
            <h2 id="how-title">How it works</h2>
            <ol>
              <li>
                <strong>You describe a world.</strong> A story model writes three rooms, two puzzles and two ways out.
              </li>
              <li>
                <strong>The rooms are painted.</strong> Every object you can touch is found in the artwork, so you play by exploring the picture.
              </li>
              <li>
                <strong>Kane plays ahead of you.</strong> An automated tester walks each escape route and gets broken puzzles repaired before you reach
                them. Open the Director View in game to watch.
              </li>
            </ol>
            <button type="button" className="btn-primary" onClick={() => setHowOpen(false)} autoFocus>
              Got it
            </button>
          </section>
        </div>
      )}
    </div>
  );
}

export function SoundOnIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
      <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />
    </svg>
  );
}

export function SoundOffIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
      <path d="M16 9.5l5 5M21 9.5l-5 5" />
    </svg>
  );
}
