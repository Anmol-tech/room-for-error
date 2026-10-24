// Adventure lifecycle (plan → validate → render → ready) and player/preview sessions.
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { LibraryEntry,
  AdventureStatus,
  AdventureSummary,
  DirectorView,
  GameState,
  GenStage,
  GenStageKey,
  GenStageStatus,
  HintResult,
  LogEntry,
  Scenario,
  SessionView,
  ValidatorIssue,
} from "../../shared/schema.ts";
import { KANE_AUTO, MISSIONS_DIR } from "./config.ts";
import { db } from "./db.ts";
import { createScenario } from "./director.ts";
import { applyAction, initialState, meetsRequirements, nextStep, useItem, visibleActions, type UseResult } from "./engine.ts";
import { ensureOpeningHotspots, imageHotspots, imageRow, imageUrl, itemIconUrl, renderScenario } from "./flux.ts";
import { withNotes, withoutNotes } from "./notes.ts";
import { endingOpen, playerKaneState, rehearse } from "./rehearsal.ts";
import { validateScenario, validateShape } from "./validator.ts";

interface AdventureRow {
  id: string;
  theme: string;
  status: AdventureStatus;
  error: string | null;
  current_version: number | null;
  prepared: number;
  validator_issues: string;
  stages: string | null;
  created_at: string;
}

interface SessionRow {
  id: string;
  scenario_id: string;
  version: number;
  kind: "player" | "preview";
  state: string;
  message: string | null;
  message_kind: SessionView["messageKind"];
  moves: number;
  hints_used: number;
  hint_step: string | null;
  hint_level: number;
  log: string;
  found: string;
  started_at: string | null;
  ended_at: string | null;
  updated_at: string;
}

export class NotFound extends Error {}

const STAGE_KEYS: GenStageKey[] = ["writing", "checking", "painting", "placing", "entrance"];
const LOG_LIMIT = 60;

// ---- scenarios ----

export function getScenario(id: string, version?: number): Scenario {
  const row = (
    version === undefined
      ? db.prepare("SELECT json FROM scenarios WHERE id = ? ORDER BY version DESC LIMIT 1").get(id)
      : db.prepare("SELECT json FROM scenarios WHERE id = ? AND version = ?").get(id, version)
  ) as { json: string } | undefined;
  if (!row) throw new NotFound(`No scenario ${id}${version ? ` v${version}` : ""}`);
  return withNotes(JSON.parse(row.json));
}

/** Stores a new scenario version. Versions are immutable once stored. */
export function saveScenarioVersion(scenario: Scenario, issues: ValidatorIssue[]): void {
  db.prepare("INSERT OR REPLACE INTO scenarios (id, version, json) VALUES (?, ?, ?)").run(scenario.id, scenario.version, JSON.stringify(withoutNotes(scenario)));
  db.prepare("UPDATE adventures SET current_version = ?, validator_issues = ? WHERE id = ?").run(scenario.version, JSON.stringify(issues), scenario.id);
}

// ---- adventures ----

function getAdventureRow(id: string): AdventureRow {
  const row = db.prepare("SELECT * FROM adventures WHERE id = ?").get(id) as AdventureRow | undefined;
  if (!row) throw new NotFound(`No adventure ${id}`);
  return row;
}

function setStatus(id: string, status: AdventureStatus, error: string | null = null) {
  db.prepare("UPDATE adventures SET status = ?, error = ? WHERE id = ?").run(status, error, id);
}

function readStages(row: AdventureRow): GenStage[] {
  if (row.stages) return JSON.parse(row.stages);
  // Adventures made before stages were tracked: derive from the overall status.
  const done: GenStageStatus = row.status === "ready" ? "complete" : "pending";
  return STAGE_KEYS.map((key) => ({ key, status: done }));
}

function setStage(id: string, key: GenStageKey, status: GenStageStatus) {
  const stages = readStages(getAdventureRow(id)).map((s) => (s.key === key ? { ...s, status } : s));
  db.prepare("UPDATE adventures SET stages = ? WHERE id = ?").run(JSON.stringify(stages), id);
}

export function summarize(row: AdventureRow): AdventureSummary {
  let title: string | null = null;
  let briefing: string | null = null;
  let coverUrl: string | null = null;
  if (row.current_version !== null) {
    const s = getScenario(row.id, row.current_version);
    title = s.title;
    briefing = s.briefing;
    const start = s.rooms.find((r) => r.id === s.startRoomId);
    if (start) coverUrl = imageUrl(imageRow(s, start.id, start.sceneStates[0].id));
  }
  return {
    id: row.id,
    version: row.current_version ?? 0,
    theme: row.theme,
    title,
    briefing,
    status: row.status,
    error: row.error,
    prepared: row.prepared === 1,
    coverUrl,
    stages: readStages(row),
  };
}

/** The version new players get. */
export function getAdventureVersion(id: string): number {
  const v = getAdventureRow(id).current_version;
  if (v === null) throw new NotFound(`Adventure ${id} has no playable scenario yet`);
  return v;
}

export function getAdventure(id: string): AdventureSummary {
  return summarize(getAdventureRow(id));
}

export function listAdventures(): AdventureSummary[] {
  const rows = db.prepare("SELECT * FROM adventures ORDER BY prepared DESC, created_at DESC LIMIT 20").all() as AdventureRow[];
  return rows.map(summarize);
}

/** Every room ever generated, newest first, with play stats. Rooms live in SQLite and assets/, so they survive restarts. */
export function listLibrary(): LibraryEntry[] {
  const rows = db.prepare("SELECT * FROM adventures ORDER BY prepared DESC, created_at DESC").all() as AdventureRow[];
  const stats = db.prepare(
    "SELECT COUNT(*) AS plays, COUNT(ended_at) AS escapes FROM sessions WHERE scenario_id = ? AND kind = 'player' AND moves > 0",
  );
  return rows.map((row) => {
    const scenario = row.current_version !== null ? getScenario(row.id, row.current_version) : null;
    const { plays, escapes } = stats.get(row.id) as { plays: number; escapes: number };
    return {
      ...summarize(row),
      createdAt: `${row.created_at.replace(" ", "T")}Z`, // SQLite stores UTC without a zone
      rooms: scenario?.rooms.map((r) => r.name) ?? [],
      plays,
      escapes,
      kane: scenario ? (playerKaneState(scenario)?.state ?? null) : null,
    };
  });
}

export function startAdventure(theme: string): AdventureSummary {
  const slug = theme.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) || "adventure";
  const id = `${slug}-${randomUUID().slice(0, 6)}`;
  const stages = STAGE_KEYS.map((key, i) => ({ key, status: i === 0 ? "active" : "pending" }));
  db.prepare("INSERT INTO adventures (id, theme, status, stages) VALUES (?, ?, 'planning', ?)").run(id, theme, JSON.stringify(stages));
  void build(id, theme);
  return getAdventure(id);
}

async function build(id: string, theme: string): Promise<void> {
  let stage: GenStageKey = "writing";
  try {
    const { scenario, issues } = await createScenario(theme, id, () => setStage(id, "writing", "retrying"));
    setStage(id, "writing", "complete");

    stage = "checking";
    setStage(id, stage, "active");
    saveScenarioVersion(scenario, issues);
    if (issues.length) throw new Error(`Validator found ${issues.length} problem(s) the director couldn't fix`);
    setStage(id, stage, "complete");

    stage = "painting";
    setStage(id, stage, "active");
    setStatus(id, "rendering");
    await renderScenario(scenario);
    setStage(id, stage, "complete");

    stage = "placing";
    setStage(id, stage, "active");
    await ensureOpeningHotspots(scenario);
    setStage(id, stage, "complete");

    stage = "entrance";
    setStage(id, stage, "active");
    setStatus(id, "ready");
    setStage(id, stage, "complete");
    // Kane starts playing every route while the player explores the first room.
    if (KANE_AUTO) rehearse(id);
  } catch (err) {
    setStage(id, stage, "failed");
    setStatus(id, "failed", err instanceof Error ? err.message : String(err));
  }
}

/** Loads hand-written missions from missions/*.json as prepared adventures. */
export function seedPreparedMissions(): void {
  for (const file of readdirSync(MISSIONS_DIR).filter((f) => f.endsWith(".json"))) {
    const shaped = validateShape(JSON.parse(readFileSync(path.join(MISSIONS_DIR, file), "utf8")));
    if ("issues" in shaped) {
      console.error(`Skipping ${file}:`, shaped.issues.map((i) => i.message).join("; "));
      continue;
    }
    const scenario = shaped.scenario;
    const complete = JSON.stringify(STAGE_KEYS.map((key) => ({ key, status: "complete" })));
    db.prepare(
      "INSERT INTO adventures (id, theme, status, prepared, stages) VALUES (?, ?, 'rendering', 1, ?) ON CONFLICT (id) DO UPDATE SET theme = excluded.theme, prepared = 1, stages = excluded.stages",
    ).run(scenario.id, scenario.theme, complete);
    // Never move an adventure backwards: a Kane repair may already have made a newer version.
    const current = getAdventureRow(scenario.id).current_version;
    if (current === null || current <= scenario.version) {
      saveScenarioVersion(scenario, validateScenario(scenario));
      void renderScenario(scenario).then(() => setStatus(scenario.id, "ready"));
    } else {
      void renderScenario(getScenario(scenario.id, current)).then(() => setStatus(scenario.id, "ready"));
    }
  }
}

/** Finishes or retries scene images for every stored adventure (finished images are skipped). */
export function resumeRendering(): void {
  const rows = db.prepare("SELECT id, current_version FROM adventures WHERE current_version IS NOT NULL AND prepared = 0").all() as {
    id: string;
    current_version: number;
  }[];
  for (const row of rows) void renderScenario(getScenario(row.id, row.current_version));
}

export function directorView(id: string): DirectorView {
  const row = getAdventureRow(id);
  const adventure = summarize(row);
  if (row.current_version === null) {
    return { adventure, validatorIssues: [], notes: null, routes: [], images: [] };
  }
  const scenario = getScenario(id, row.current_version);
  return {
    adventure,
    validatorIssues: JSON.parse(row.validator_issues),
    notes: scenario.notes ?? null,
    routes: scenario.intendedSolutions.map(({ routeId, endingId, objective }) => ({ routeId, endingId, objective })),
    images: scenario.rooms.flatMap((room) =>
      room.sceneStates.map((s) => {
        const img = imageRow(scenario, room.id, s.id);
        return { roomId: room.id, sceneStateId: s.id, status: img?.status ?? "pending", url: imageUrl(img), error: img?.error ?? null };
      }),
    ),
  };
}

// ---- sessions ----

export function createSession(scenarioId: string, kind: "player" | "preview", startState?: GameState): SessionView {
  const row = getAdventureRow(scenarioId);
  if (row.current_version === null) throw new NotFound(`Adventure ${scenarioId} has no playable scenario yet`);
  const scenario = getScenario(scenarioId, row.current_version);
  const state = startState ?? initialState(scenario);
  const room = scenario.rooms.find((r) => r.id === state.roomId)!;
  const arrival: LogEntry = { at: new Date().toISOString(), roomName: room.name, action: null, text: room.description, kind: "info", found: [] };
  const id = randomUUID();
  db.prepare(
    "INSERT INTO sessions (id, scenario_id, version, kind, state, log, started_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(id, scenarioId, scenario.version, kind, JSON.stringify(state), JSON.stringify([arrival]), arrival.at);
  return getSessionView(id);
}

/** The ending a session reached, or null if it hasn't finished. */
export function sessionEnding(sessionId: string): string | null {
  const row = db.prepare("SELECT state FROM sessions WHERE id = ?").get(sessionId) as { state: string } | undefined;
  return row ? ((JSON.parse(row.state) as GameState).endingId ?? null) : null;
}

/** A fresh session for an automated test run, never shared with a player. */
export function newPreviewSession(scenario: Scenario): string {
  const state = initialState(scenario);
  const room = scenario.rooms.find((r) => r.id === state.roomId)!;
  const arrival: LogEntry = { at: new Date().toISOString(), roomName: room.name, action: null, text: room.description, kind: "info", found: [] };
  const id = randomUUID();
  db.prepare("INSERT INTO sessions (id, scenario_id, version, kind, state, log, started_at) VALUES (?, ?, ?, 'preview', ?, ?, ?)").run(
    id,
    scenario.id,
    scenario.version,
    JSON.stringify(state),
    JSON.stringify([arrival]),
    arrival.at,
  );
  return id;
}

function getSessionRow(id: string): SessionRow {
  const row = db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as SessionRow | undefined;
  if (!row) throw new NotFound(`No session ${id}`);
  return row;
}

const firstSentence = (text: string) => text.match(/^.*?[.!?](\s|$)/)?.[0].trim() ?? text;

export function getSessionView(id: string): SessionView {
  const row = getSessionRow(id);
  const scenario = getScenario(row.scenario_id, row.version);
  const state: GameState = JSON.parse(row.state);
  const room = scenario.rooms.find((r) => r.id === state.roomId)!;
  const sceneStateId = state.sceneStates[room.id] ?? room.sceneStates[0].id;
  // Show the room's default scene until the edited one is ready.
  const stateRow = imageRow(scenario, room.id, sceneStateId);
  const updating = !imageUrl(stateRow);
  const shown = updating ? imageRow(scenario, room.id, room.sceneStates[0].id) : stateRow;
  const actions = visibleActions(scenario, state);
  const visibleIds = new Set(actions.map((a) => a.id));
  const found: string[] = JSON.parse(row.found);

  return {
    sessionId: row.id,
    scenarioId: scenario.id,
    scenarioVersion: scenario.version,
    title: scenario.title,
    roomId: room.id,
    roomName: room.name,
    roomDescription: room.description,
    roomTagline: firstSentence(room.description),
    roomIndex: scenario.rooms.indexOf(room),
    roomCount: scenario.rooms.length,
    imageUrl: imageUrl(shown),
    sceneUpdating: updating && sceneStateId !== room.sceneStates[0].id && !!imageUrl(shown),
    hotspots: imageHotspots(shown).filter((h) => visibleIds.has(h.actionId)),
    actions: actions.map((a) => ({
      id: a.id,
      label: a.label,
      locked: !meetsRequirements(a, state),
      ...(a.input ? { inputPrompt: a.input.prompt } : {}),
    })),
    inventory: state.inventory.map((i) => {
      const item = scenario.items.find((x) => x.id === i)!;
      return { id: item.id, name: item.name, description: item.description, icon: item.icon ?? null, imageUrl: itemIconUrl(scenario, item) };
    }),
    message: row.message,
    messageKind: row.message_kind,
    ending: state.endingId ? (scenario.endings.find((e) => e.id === state.endingId) ?? null) : null,
    endingCount: scenario.endings.length,
    stats: {
      moves: row.moves,
      hintsUsed: row.hints_used,
      startedAt: row.started_at ?? row.updated_at,
      endedAt: row.ended_at,
      itemsFound: found.length,
      itemsTotal: scenario.items.length,
    },
    log: JSON.parse(row.log),
    kane: row.kind === "player" ? playerKaneState(scenario) : null,
  };
}

/** Saves the outcome of an action (or item use) and appends it to the session's narration log. */
function record(row: SessionRow, scenario: Scenario, label: string, outcome: UseResult): void {
  const before: GameState = JSON.parse(row.state);
  let result = outcome;
  if (result.ok && result.state.endingId && row.kind === "player" && !endingOpen(scenario, result.state.endingId)) {
    const newer = getAdventureVersion(scenario.id) > scenario.version;
    result = {
      ok: false,
      state: before,
      reason: "locked",
      message: newer
        ? "This passage was repaired after you entered. Restart the mission from the menu to play the repaired room; your way out is ready there."
        : "This passage needs a little longer. Kane is still checking the way out; try again in a moment.",
    };
  }
  const kind = result.ok ? (result.state.endingId ? "success" : "info") : "error";
  const gained = result.state.inventory.filter((i) => !before.inventory.includes(i));
  const found: string[] = JSON.parse(row.found);
  for (const g of gained) if (!found.includes(g)) found.push(g);
  const room = scenario.rooms.find((r) => r.id === result.state.roomId)!;
  // Walking into a new room narrates the room as well as the step that got you there.
  const text = result.ok && result.state.roomId !== before.roomId ? `${result.message}\n\n${room.description}` : result.message;
  const entry: LogEntry = {
    at: new Date().toISOString(),
    roomName: scenario.rooms.find((r) => r.id === before.roomId)!.name,
    action: label,
    text,
    kind,
    found: gained.map((g) => scenario.items.find((i) => i.id === g)!.name),
  };
  const log = [...JSON.parse(row.log), entry].slice(-LOG_LIMIT);
  db.prepare(
    `UPDATE sessions SET state = ?, message = ?, message_kind = ?, moves = moves + 1, log = ?, found = ?,
       ended_at = CASE WHEN ? THEN COALESCE(ended_at, ?) ELSE ended_at END, updated_at = datetime('now') WHERE id = ?`,
  ).run(JSON.stringify(result.state), text, kind, JSON.stringify(log), JSON.stringify(found), result.state.endingId ? 1 : 0, entry.at, row.id);
}

export function act(sessionId: string, actionId: string, input?: string): SessionView {
  const row = getSessionRow(sessionId);
  const scenario = getScenario(row.scenario_id, row.version);
  const label = scenario.actions.find((a) => a.id === actionId)?.label ?? actionId;
  record(row, scenario, label, applyAction(scenario, JSON.parse(row.state), actionId, input));
  return getSessionView(sessionId);
}

/** Uses an item on the object at `actionIds` (one clickable spot). */
export function use(sessionId: string, itemId: string, actionIds: string[]): SessionView {
  const row = getSessionRow(sessionId);
  const scenario = getScenario(row.scenario_id, row.version);
  const result = useItem(scenario, JSON.parse(row.state), itemId, actionIds);
  if (!result.ok && result.reason === "needs_input") {
    // Nothing happened yet: the player still has to type the code.
    return { ...getSessionView(sessionId), openInputFor: result.actionId };
  }
  const itemName = scenario.items.find((i) => i.id === itemId)?.name ?? itemId;
  record(row, scenario, `Use ${itemName}`, result);
  return getSessionView(sessionId);
}

/**
 * Staged hints toward the next step on a shortest path to an ending:
 * 1 where to look, 2 what connects, 3 the explicit next step. Codes are never revealed.
 */
export function hint(sessionId: string): HintResult {
  const row = getSessionRow(sessionId);
  const scenario = getScenario(row.scenario_id, row.version);
  const state: GameState = JSON.parse(row.state);
  const step = nextStep(scenario, state);
  if (!step) return { level: 1, text: state.endingId ? "You're already out." : "Look around carefully; something here still matters." };

  const level = (step.id === row.hint_step ? Math.min(3, row.hint_level + 1) : 1) as 1 | 2 | 3;
  db.prepare("UPDATE sessions SET hint_step = ?, hint_level = ?, hints_used = hints_used + 1 WHERE id = ?").run(step.id, level, sessionId);

  const room = scenario.rooms.find((r) => r.id === state.roomId)!;
  const sceneStateId = state.sceneStates[room.id] ?? room.sceneStates[0].id;
  const spots = imageHotspots(imageRow(scenario, room.id, sceneStateId) ?? imageRow(scenario, room.id, room.sceneStates[0].id));
  const object = spots.find((h) => h.actionId === step.id)?.object?.toLowerCase();
  const target = object ? `the ${object.replace(/^the\s+/, "")}` : null;
  const items = (step.requires?.items ?? []).map((i) => scenario.items.find((x) => x.id === i)!.name.toLowerCase());

  if (level === 1) {
    if (step.effects.moveTo && !step.requires) return { level, text: `There may be nothing more for you in the ${room.name.toLowerCase()}. Where else could you go?` };
    return { level, text: target ? `Take a closer look at ${target}.` : `Look around the ${room.name.toLowerCase()} more carefully.` };
  }
  if (level === 2) {
    if (step.input) return { level, text: `A code is involved. Something you've already read may hold it.` };
    if (items.length) return { level, text: `Your ${items.join(" and ")} might be useful${target ? ` at ${target}` : " here"}.` };
    if (step.effects.moveTo) return { level, text: `The way forward is through ${target ?? "an exit in this room"}.` };
    return { level, text: target ? `Try interacting with ${target}.` : "Try interacting with something you haven't touched yet." };
  }
  return { level, text: `Next step: ${step.label}.` };
}
