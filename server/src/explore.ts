// Kane explores an adventure with no script (`kane-cli explore`). Every visit to the stable entry
// page /explore/<scenarioId> opens a fresh preview session tagged with the exploration, so coverage
// (rooms entered, actions tried, items found, endings reached) is measured from our own game data.
import { spawn, type ChildProcess } from "node:child_process";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { ExplorationStatus, ExplorationView, ExploreCoverage, GameState, LogEntry, Scenario } from "../../shared/schema.ts";
import { getAdventureVersion, getScenario, newPreviewSession } from "./adventures.ts";
import { KANE_APP_URL, KANE_HEADLESS } from "./config.ts";
import { db } from "./db.ts";
import { RUNS_DIR } from "./kane.ts";
import { browserBusy, exploreEnded, exploreStarted, onBrowserFree } from "./kaneLock.ts";

/** Pieces of explorer work per run: enough to walk three rooms, small enough to keep credits in check. */
const MAX_LEASES = Number(process.env.KANE_EXPLORE_LEASES || 20);
const FEED_LIMIT = 80;
const VIEW_PORT = 7420;

db.exec(`
  CREATE TABLE IF NOT EXISTS explorations (
    id TEXT PRIMARY KEY,
    scenario_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    status TEXT NOT NULL,
    kane_exploration_id TEXT,
    kane_run_id TEXT,
    remark TEXT,
    plan TEXT,
    visited INTEGER NOT NULL DEFAULT 0,
    frontier INTEGER NOT NULL DEFAULT 0,
    feed TEXT NOT NULL DEFAULT '[]',
    exit_code INTEGER,
    created_at TEXT NOT NULL,
    started_at TEXT,
    finished_at TEXT
  );
  -- One Kane project per adventure: Kane allows one exploration (of one URL) per project.
  CREATE TABLE IF NOT EXISTS explore_projects (
    scenario_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL
  );
`);
const sessionCols = db.prepare("PRAGMA table_info(sessions)").all() as { name: string }[];
if (!sessionCols.some((c) => c.name === "explore_id")) db.exec("ALTER TABLE sessions ADD COLUMN explore_id TEXT");

interface Row {
  id: string;
  scenario_id: string;
  version: number;
  status: ExplorationStatus;
  kane_exploration_id: string | null;
  kane_run_id: string | null;
  remark: string | null;
  plan: string | null;
  visited: number;
  frontier: number;
  feed: string;
  exit_code: number | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

const now = () => new Date().toISOString();
const kaneEnv = () => ({ ...process.env, KANE_CLI_USER_AGENT: "room-for-error" });
let active: { id: string; child: ChildProcess } | null = null;

/** Explorations cut off by a server restart can't finish; record that honestly. */
export function resetInterruptedExplorations(): void {
  db.prepare("UPDATE explorations SET status = 'stopped', remark = 'Server restarted before the exploration finished', finished_at = ? WHERE status IN ('queued', 'running')").run(now());
}

/** Queues a free exploration of the adventure's current version (one at a time per adventure). */
export function explore(scenarioId: string): string {
  const busy = db.prepare("SELECT id FROM explorations WHERE scenario_id = ? AND status IN ('queued', 'running')").get(scenarioId) as { id: string } | undefined;
  if (busy) return busy.id;
  const id = randomUUID();
  db.prepare("INSERT INTO explorations (id, scenario_id, version, status, created_at) VALUES (?, ?, ?, 'queued', ?)").run(id, scenarioId, getAdventureVersion(scenarioId), now());
  startNext();
  return id;
}

/** Asks Kane to stop the adventure's running exploration cleanly. */
export function stopExploration(scenarioId: string): void {
  const row = db.prepare("SELECT * FROM explorations WHERE scenario_id = ? AND status IN ('queued', 'running')").get(scenarioId) as Row | undefined;
  if (!row) return;
  if (row.status === "queued") {
    db.prepare("UPDATE explorations SET status = 'stopped', remark = 'Stopped before it started', finished_at = ? WHERE id = ?").run(now(), row.id);
    return;
  }
  if (row.kane_exploration_id) spawn("kane-cli", ["explore", "stop", row.kane_exploration_id, "--agent", "--no-wait"], { env: kaneEnv(), stdio: "ignore" });
}

onBrowserFree(startNext);

function startNext(): void {
  if (active || browserBusy()) return;
  const row = db.prepare("SELECT * FROM explorations WHERE status = 'queued' ORDER BY created_at LIMIT 1").get() as Row | undefined;
  if (!row) return;
  exploreStarted();
  db.prepare("UPDATE explorations SET status = 'running', started_at = ? WHERE id = ?").run(now(), row.id);
  void run(row).finally(() => {
    active = null;
    exploreEnded();
    startNext();
  });
}

async function run(row: Row): Promise<void> {
  const scenario = getScenario(row.scenario_id, row.version);
  const addFeed = (text: string, kind: ExplorationView["feed"][number]["kind"]) => {
    const current = JSON.parse((db.prepare("SELECT feed FROM explorations WHERE id = ?").get(row.id) as { feed: string }).feed);
    const last = current.at(-1);
    if (last && last.text === text) return; // Kane often repeats a line while it reasons
    db.prepare("UPDATE explorations SET feed = ? WHERE id = ?").run(JSON.stringify([...current, { at: now(), text, kind }].slice(-FEED_LIMIT)), row.id);
  };

  let project: string;
  try {
    project = await projectFor(scenario);
  } catch (err) {
    finish(row.id, "failed", `Couldn't set up a Kane project: ${err instanceof Error ? err.message : err}`, null);
    return;
  }

  const args = [
    "explore", "run", "--agent", "--local-orchestration", "--browser", "local",
    ...(KANE_HEADLESS ? ["--headless"] : []),
    "--project", project,
    "--url", `${KANE_APP_URL}/explore/${encodeURIComponent(scenario.id)}`,
    "--max-leases", String(MAX_LEASES), "--max-parallel", "1",
    // Only our own local game is reachable; pressing buttons there changes nothing real.
    "--policy", "mutating", "--no-context",
    // Stay in the game: never leave it or open the director's panel. Kane matches these loosely
    // ("Hints" vetoed "Search desk" and the scene's hotspots), so only controls that leave the game
    // are denied; hints, history and narration toggles are harmless in a throwaway preview game.
    ...["Director View", "Pause and menu", "Turn sound off", "Turn sound on", "Room for Error"].flatMap((d) => ["--deny", d]),
    "--prompt",
    `This is "${scenario.title}", a point-and-click escape-room game. Explore it like a curious player, with no fixed route: ` +
      "use the buttons listed under 'Things to explore', read the narration after every action, try every room you can reach, " +
      "pick up items and try them where they might fit, and use any codes the narration gives you. Note anything that seems broken or unreachable.",
  ];
  addFeed("Kane is opening a fresh browser to explore without a script.", "info");

  const evidence = createWriteStream(path.join(RUNS_DIR, `explore-${row.id}.ndjson`));
  const child = spawn("kane-cli", args, { env: kaneEnv(), stdio: ["ignore", "pipe", "pipe"] });
  active = { id: row.id, child };
  let stderr = "";
  let doneEvent: Record<string, unknown> | null = null;

  await new Promise<void>((resolve) => {
    let buffer = "";
    child.stdout!.on("data", (chunk: Buffer) => {
      evidence.write(chunk);
      buffer += chunk.toString();
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line.startsWith("{")) continue;
        let ev: Record<string, unknown>;
        try {
          ev = JSON.parse(line);
        } catch {
          continue;
        }
        handle(ev);
      }
    });
    child.stderr!.on("data", (c: Buffer) => (stderr = (stderr + c.toString()).slice(-3000)));
    child.on("error", (err) => {
      stderr += err.message;
      resolve();
    });
    child.on("close", (code) => {
      evidence.end();
      const state = String(doneEvent?.state ?? "");
      const remark = remarkText(doneEvent?.remark) ?? (code === 0 ? "completed" : stderr.trim().split("\n").at(-1) ?? `exit ${code}`);
      const status: ExplorationStatus = code === 0 ? "completed" : code === 3 || state === "stopped" ? "stopped" : "failed";
      finish(row.id, status, remark, code);
      resolve();
    });
  });

  function handle(ev: Record<string, unknown>) {
    switch (ev.type) {
      case "exploration_created":
      case "explore_run_started":
        db.prepare("UPDATE explorations SET kane_exploration_id = COALESCE(?, kane_exploration_id), kane_run_id = COALESCE(?, kane_run_id) WHERE id = ?").run(
          (ev.exploration_id as string) ?? null,
          (ev.run_id as string) ?? null,
          row.id,
        );
        break;
      case "progress":
        db.prepare("UPDATE explorations SET visited = ?, frontier = ? WHERE id = ?").run(Number(ev.visited ?? 0), Number(ev.frontier ?? 0), row.id);
        break;
      case "skill_updated":
        if (typeof ev.summary === "string") {
          db.prepare("UPDATE explorations SET plan = ? WHERE id = ?").run(ev.summary, row.id);
          addFeed(`Plan: ${ev.summary}`, "info");
        }
        break;
      case "lease_step":
        if (typeof ev.intent === "string" && ev.intent) addFeed(ev.intent, "intent");
        break;
      case "step_event":
        if (ev.event === "action" && typeof ev.detail === "string") addFeed(ev.detail, "action");
        break;
      case "done":
        doneEvent = ev;
        break;
      default:
        // Findings and anything new: keep the human-readable part.
        if (typeof ev.type === "string" && /finding/i.test(ev.type)) {
          const text = [ev.title, ev.summary, ev.message, ev.detail].find((x) => typeof x === "string") as string | undefined;
          if (text) addFeed(text, "finding");
        }
    }
  }
}

function finish(id: string, status: ExplorationStatus, remark: string | null, exitCode: number | null) {
  db.prepare("UPDATE explorations SET status = ?, remark = ?, exit_code = ?, finished_at = ? WHERE id = ?").run(status, remark, exitCode, now(), id);
  console.log(`[explore] ${id}: ${status}${remark ? ` (${remark})` : ""}`);
}

function remarkText(remark: unknown): string | null {
  if (typeof remark === "string") return remark;
  if (remark && typeof remark === "object") {
    const r = remark as Record<string, unknown>;
    return [r.code, r.message].filter((x) => typeof x === "string").join(": ") || null;
  }
  return null;
}

/** Each adventure explores inside its own Kane project (one exploration per project). */
async function projectFor(scenario: Scenario): Promise<string> {
  const known = db.prepare("SELECT project_id FROM explore_projects WHERE scenario_id = ?").get(scenario.id) as { project_id: string } | undefined;
  if (known) return known.project_id;
  const out = await new Promise<string>((resolve, reject) => {
    const name = `Room for Error: ${scenario.title} (${scenario.id})`.slice(0, 120);
    const child = spawn("kane-cli", ["projects", "create", name, "--description", `Free exploration of ${scenario.theme}`, "--agent"], { env: kaneEnv() });
    let text = "";
    child.stdout.on("data", (c: Buffer) => (text += c.toString()));
    child.stderr.on("data", (c: Buffer) => (text += c.toString()));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve(text) : reject(new Error(text.trim().split("\n").at(-1) || `exit ${code}`))));
  });
  const created = out
    .split("\n")
    .filter((l) => l.startsWith("{"))
    .map((l) => JSON.parse(l) as Record<string, unknown>)
    .find((o) => typeof o.id === "string");
  if (!created) throw new Error(`no project id in: ${out.slice(0, 200)}`);
  db.prepare("INSERT INTO explore_projects (scenario_id, project_id) VALUES (?, ?)").run(scenario.id, created.id);
  return created.id as string;
}

// ---- the entry page Kane keeps returning to ----

/** A fresh test session for whoever opens /explore/<id>, tagged with the running exploration. */
export function exploreSession(scenarioId: string): { scenarioId: string; sessionId: string } {
  const scenario = getScenario(scenarioId, getAdventureVersion(scenarioId));
  const sessionId = newPreviewSession(scenario);
  const running = db.prepare("SELECT id FROM explorations WHERE scenario_id = ? AND status = 'running'").get(scenarioId) as { id: string } | undefined;
  if (running) db.prepare("UPDATE sessions SET explore_id = ? WHERE id = ?").run(running.id, sessionId);
  return { scenarioId, sessionId };
}

// ---- read side ----

export function latestExploration(scenarioId: string): ExplorationView | null {
  const row = db
    .prepare("SELECT * FROM explorations WHERE scenario_id = ? ORDER BY CASE status WHEN 'running' THEN 0 WHEN 'queued' THEN 1 ELSE 2 END, created_at DESC LIMIT 1")
    .get(scenarioId) as Row | undefined;
  if (!row) return null;
  const sessions = sessionsDuring(row);
  return {
    id: row.id,
    scenarioId: row.scenario_id,
    scenarioVersion: row.version,
    status: row.status,
    remark: row.remark,
    plan: row.plan,
    visited: row.visited,
    frontier: row.frontier,
    feed: JSON.parse(row.feed),
    sessions: sessions.length,
    coverage: coverage(getScenario(row.scenario_id, row.version), sessions),
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    mapUrl: viewer && viewer.explorationId === row.kane_exploration_id ? viewer.url : null,
  };
}

/**
 * The game sessions Kane played during this exploration, trimmed to the moves it made then.
 * Kane's project remembers addresses from earlier explorations, session id included, so it can
 * go back to a game an earlier exploration started: the session's tag says which exploration
 * created it, not which one played it. So every explored session of the adventure counts, by time.
 */
function sessionsDuring(row: Row): { state: string; log: string }[] {
  if (!row.started_at) return [];
  const from = row.started_at;
  const to = row.finished_at ?? new Date().toISOString();
  const all = db.prepare("SELECT state, log FROM sessions WHERE scenario_id = ? AND explore_id IS NOT NULL").all(row.scenario_id) as { state: string; log: string }[];
  return all.flatMap((s) => {
    const log = (JSON.parse(s.log) as LogEntry[]).filter((e) => e.at >= from && e.at <= to);
    return log.length ? [{ state: s.state, log: JSON.stringify(log) }] : [];
  });
}

/** Rooms, actions, items and endings Kane reached, from the game sessions it played. */
export function coverage(scenario: Scenario, sessions: { state: string; log: string }[]): ExploreCoverage {
  const onRoute = new Set(scenario.intendedSolutions.flatMap((r) => r.steps));
  const visitedRooms = new Set<string>();
  const tried = new Set<string>();
  const succeeded = new Set<string>();
  const found = new Set<string>();
  const endings = new Set<string>();
  for (const s of sessions) {
    const state: GameState = JSON.parse(s.state);
    if (state.endingId) endings.add(state.endingId);
    for (const e of JSON.parse(s.log) as LogEntry[]) {
      visitedRooms.add(e.roomName);
      for (const name of e.found) found.add(name);
      if (!e.action) continue;
      // Log entries name the room the action was taken in and the button's label.
      const room = scenario.rooms.find((r) => r.name === e.roomName);
      const action = scenario.actions.find((a) => a.roomId === room?.id && a.label === e.action);
      if (!action) continue;
      tried.add(action.id);
      if (e.kind !== "error") succeeded.add(action.id);
    }
    // Arriving in a room counts as visiting it even if Kane did nothing there.
    visitedRooms.add(scenario.rooms.find((r) => r.id === state.roomId)?.name ?? "");
  }
  const rooms = scenario.rooms.map((r) => ({
    id: r.id,
    name: r.name,
    visited: visitedRooms.has(r.name),
    actions: scenario.actions
      .filter((a) => a.roomId === r.id)
      .map((a) => ({ id: a.id, label: a.label, tried: tried.has(a.id), succeeded: succeeded.has(a.id), onRoute: onRoute.has(a.id) })),
  }));
  const allActions = rooms.flatMap((r) => r.actions);
  return {
    rooms,
    endings: scenario.endings.map((e) => ({ id: e.id, title: e.title, reached: endings.has(e.id) })),
    items: scenario.items.map((i) => ({ id: i.id, name: i.name, found: found.has(i.name) })),
    totals: {
      rooms: rooms.length,
      roomsVisited: rooms.filter((r) => r.visited).length,
      actions: allActions.length,
      actionsTried: allActions.filter((a) => a.tried).length,
      endings: scenario.endings.length,
      endingsReached: endings.size,
    },
  };
}

// ---- Kane's own interactive map ----

let viewer: { explorationId: string; url: string; child: ChildProcess } | null = null;

/** Starts `kane-cli explore view` for the adventure's latest exploration and returns its local URL. */
export async function openMap(scenarioId: string): Promise<string | null> {
  const row = db.prepare("SELECT kane_exploration_id FROM explorations WHERE scenario_id = ? AND kane_exploration_id IS NOT NULL ORDER BY created_at DESC LIMIT 1").get(scenarioId) as
    | { kane_exploration_id: string }
    | undefined;
  if (!row) return null;
  if (viewer?.explorationId === row.kane_exploration_id) return viewer.url;
  viewer?.child.kill("SIGTERM");
  const child = spawn("kane-cli", ["explore", "view", "--exploration-id", row.kane_exploration_id, "--port", String(VIEW_PORT)], { env: kaneEnv(), stdio: "ignore" });
  const url = `http://127.0.0.1:${VIEW_PORT}`;
  viewer = { explorationId: row.kane_exploration_id, url, child };
  child.on("close", () => {
    if (viewer?.child === child) viewer = null;
  });
  await new Promise((r) => setTimeout(r, 1500));
  return viewer ? url : null;
}
