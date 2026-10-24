import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { LibraryEntry } from "../../shared/schema.ts";
import { KaneBadge } from "./KaneBadge.tsx";
import { api } from "./api.ts";
import { isImageModeration } from "../../shared/imageModeration.ts";

type Filter = "all" | "ready" | "building" | "failed";
const FILTERS: Filter[] = ["all", "ready", "building", "failed"];

const KANE_LABEL: Record<NonNullable<LibraryEntry["kane"]>, string> = {
  passed: "Kane passed every route",
  testing: "Kane is testing",
  repairing: "Being repaired",
  delayed: "Not yet verified",
};

const group = (e: LibraryEntry): Exclude<Filter, "all"> => (e.status === "ready" ? "ready" : e.status === "failed" ? "failed" : "building");

/** Every room ever generated, saved in the local database. */
export function Library() {
  const [entries, setEntries] = useState<LibraryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    api.library().then(setEntries).catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (entries ?? []).filter(
      (e) =>
        (filter === "all" || group(e) === filter) &&
        (!q || [e.title, e.theme, e.briefing, ...e.rooms].some((t) => t?.toLowerCase().includes(q))),
    );
  }, [entries, query, filter]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: 0, ready: 0, building: 0, failed: 0 };
    for (const e of entries ?? []) {
      c.all++;
      c[group(e)]++;
    }
    return c;
  }, [entries]);

  return (
    <div className="library-page">
      <header className="start-bar">
        <Link to="/" className="wordmark">
          Room for Error
        </Link>
        <KaneBadge />
      </header>

      <main className="library">
        <div className="library-head">
          <div>
            <h1>Library</h1>
            <p className="library-sub">Every room you've generated, saved on this machine.</p>
          </div>
          <Link to="/" className="btn-primary">
            Build a new room
          </Link>
        </div>

        <div className="library-tools">
          <label htmlFor="library-search" className="sr-only">
            Search rooms
          </label>
          <input
            id="library-search"
            type="search"
            className="library-search"
            placeholder="Search by title, theme or room…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="segmented" role="radiogroup" aria-label="Filter rooms">
            {FILTERS.map((f) => (
              <button key={f} type="button" role="radio" aria-checked={filter === f} onClick={() => setFilter(f)}>
                {f} <span className="count">{counts[f]}</span>
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        {!entries && !error && <p className="library-empty">Loading…</p>}
        {entries && shown.length === 0 && (
          <p className="library-empty">{entries.length ? "No rooms match." : "No rooms yet. Build one from the start screen."}</p>
        )}

        <ul className="library-grid">
          {shown.map((e) => (
            <li key={e.id} className="library-card">
              <Link to={e.status === "ready" ? `/play/${e.id}` : `/adventure/${e.id}`} className="library-cover" aria-label={`Open ${e.title ?? e.theme}`}>
                {e.coverUrl ? <img src={e.coverUrl} alt="" loading="lazy" /> : <span className="library-nocover">{group(e) === "failed" ? "Failed" : "Painting…"}</span>}
                {e.prepared && <span className="library-tag">Prepared</span>}
              </Link>
              <div className="library-body">
                <h2>{e.title ?? e.theme}</h2>
                <p className="library-theme">“{e.theme}”</p>
                {e.rooms.length > 0 && <p className="library-rooms">{e.rooms.join(" · ")}</p>}
                <p className="library-meta">
                  {e.status === "failed" ? (
                    <span className="library-status failed">{isImageModeration(e.error) ? "Image moderation" : e.error ? "Generation failed" : "Failed"}</span>
                  ) : e.kane ? (
                    <span className={`library-status ${e.kane}`}>{KANE_LABEL[e.kane]}</span>
                  ) : (
                    <span className="library-status">{e.status}</span>
                  )}
                  <span>
                    {e.plays} {e.plays === 1 ? "play" : "plays"} · {e.escapes} finished
                  </span>
                  <span>v{e.version}</span>
                  <time dateTime={e.createdAt}>{new Date(e.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</time>
                </p>
                <div className="library-actions">
                  {e.status === "ready" ? (
                    <>
                      <Link to={`/play/${e.id}`} className="btn-primary small">
                        Play
                      </Link>
                      <Link to={`/play/${e.id}?director=1`} className="text-btn">
                        Director View
                      </Link>
                    </>
                  ) : (
                    <Link to={`/adventure/${e.id}`} className="text-btn">
                      {group(e) === "failed" ? "See what happened" : "Watch it build"}
                    </Link>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
