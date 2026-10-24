// Kane rehearses every escape route in an isolated preview session. A game failure goes to the
// director for a repair (scenario data only, never the objectives), which makes a new version that
// Kane plays again. A route counts as ready only after a pass on the exact version being played.
import { randomUUID } from "node:crypto";
import type { KaneRun, KaneStep, KaneView, Repair, RouteReadiness, Scenario } from "../../shared/schema.ts";
import { getAdventureVersion, getScenario, newPreviewSession, saveScenarioVersion, sessionEnding } from "./adventures.ts";
import { KANE_APP_URL, KANE_CONCURRENCY, KANE_MAX_REPAIRS } from "./config.ts";
import { db } from "./db.ts";
import { reviseScenario } from "./director.ts";
import { renderScenario } from "./flux.ts";
import { kaneReady, runKane } from "./kane.ts";
import { exploringNow, onBrowserFree, routeRunEnded, routeRunStarted } from "./kaneLock.ts";
import { validateScenario, validateShape } from "./validator.ts";

interface RunRow {
  id: string;
  scenario_id: string;
  version: number;
  route_id: string;
  ending_id: string;
  session_id: string;
  objective: string;
  status: KaneRun["status"];
  exit_code: number | null;
  one_liner: string | null;
  summary: string | null;
  reason: string | null;
  steps: string;
  credits: number | null;
  duration_s: number | null;
  test_url: string | null;
  prior: number;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

interface RepairRow {
  id: string;
  scenario_id: string;
  route_id: string;
  run_id: string;
  from_version: number;
  to_version: number | null;
  status: Repair["status"];
  changes: string;
  note: string | null;
  created_at: string;
}

const now = () => new Date().toISOString();
/** Replays allowed per route and version after Kane takes another exit. */
const KANE_MAX_OFF_ROUTE = 2;

const toRun = (r: RunRow): KaneRun => ({
  id: r.id,
  scenarioId: r.scenario_id,
  scenarioVersion: r.version,
  routeId: r.route_id,
  endingId: r.ending_id,
  objective: r.objective,
  status: r.status,
  exitCode: r.exit_code,
  oneLiner: r.one_liner,
  summary: r.summary,
  reason: r.reason,
  steps: JSON.parse(r.steps),
  credits: r.credits,
  durationS: r.duration_s,
  testUrl: r.test_url,
  createdAt: r.created_at,
  startedAt: r.started_at,
  finishedAt: r.finished_at,
  prior: r.prior === 1,
});

const toRepair = (r: RepairRow): Repair => ({
  id: r.id,
  scenarioId: r.scenario_id,
  routeId: r.route_id,
  runId: r.run_id,
  fromVersion: r.from_version,
  toVersion: r.to_version,
  status: r.status,
  changes: JSON.parse(r.changes),
  note: r.note,
  createdAt: r.created_at,
});

export function getRun(id: string): (KaneRun & { sessionId: string }) | null {
  const row = db.prepare("SELECT * FROM kane_runs WHERE id = ?").get(id) as RunRow | undefined;
  return row ? { ...toRun(row), sessionId: row.session_id } : null;
}

/**
 * The objective Kane follows: where to start, how this game is played, then the route's own
 * objective (written by the director, read-only to repairs).
 */
function objectiveFor(runId: string, routeObjective: string, endingTitle: string): string {
  return [
    `Go to ${KANE_APP_URL}/preview/${runId}.`,
    "This is an escape-room game. Act only with the labelled buttons listed under 'Things to explore' below the picture; ignore the picture itself.",
    "Read the narration text after every action: it contains clues.",
    "To enter a code, type it into the keypad's text field exactly as the clue gives it and press 'Submit code'.",
    `Your goal is the '${endingTitle}' ending. The room has other exits: never use any exit or ending other than the one that leads to '${endingTitle}', and never restart the game.`,
    routeObjective,
  ].join(" ");
}

// ---- queue ----

/** Runs that were queued or running when the server stopped can't finish; record that honestly. */
export function resetInterruptedRuns(): void {
  db.prepare("UPDATE kane_runs SET status = 'infra_error', reason = 'Server restarted before the run finished', finished_at = ? WHERE status IN ('queued', 'running')").run(now());
  db.prepare("UPDATE repairs SET status = 'gave_up', note = 'Server restarted during the repair' WHERE status = 'repairing'").run();
}

const queue: string[] = [];
let running = 0;

function pump() {
  // A free exploration holds the browser; route runs wait their turn (see kaneLock.ts).
  while (running < KANE_CONCURRENCY && queue.length && !exploringNow()) {
    const id = queue.shift()!;
    running++;
    routeRunStarted();
    void execute(id).finally(() => {
      running--;
      routeRunEnded();
      pump();
    });
  }
}
onBrowserFree(pump);

/** Queues a Kane run for one route of one scenario version. */
function enqueue(scenario: Scenario, routeId: string): string {
  const route = scenario.intendedSolutions.find((r) => r.routeId === routeId)!;
  const id = randomUUID();
  const sessionId = newPreviewSession(scenario);
  db.prepare(
    "INSERT INTO kane_runs (id, scenario_id, version, route_id, ending_id, session_id, objective, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'queued', ?)",
  ).run(
    id,
    scenario.id,
    scenario.version,
    routeId,
    route.endingId,
    sessionId,
    objectiveFor(id, route.objective, scenario.endings.find((e) => e.id === route.endingId)?.title ?? route.endingId),
    now(),
  );
  queue.push(id);
  pump();
  return id;
}

/** Rehearses every route of the adventure's current version, skipping routes already queued or running. */
export function rehearse(scenarioId: string): string[] {
  const scenario = getScenario(scenarioId, getAdventureVersion(scenarioId));
  const busy = db
    .prepare("SELECT route_id FROM kane_runs WHERE scenario_id = ? AND version = ? AND status IN ('queued', 'running')")
    .all(scenario.id, scenario.version) as { route_id: string }[];
  return scenario.intendedSolutions.filter((r) => !busy.some((b) => b.route_id === r.routeId)).map((r) => enqueue(scenario, r.routeId));
}

async function execute(runId: string): Promise<void> {
  const row = db.prepare("SELECT * FROM kane_runs WHERE id = ?").get(runId) as RunRow;
  db.prepare("UPDATE kane_runs SET status = 'running', started_at = ? WHERE id = ?").run(now(), runId);
  const result = await runKane({
    runId,
    url: `${KANE_APP_URL}/preview/${runId}`,
    objective: row.objective,
    onStep: (steps: KaneStep[]) => db.prepare("UPDATE kane_runs SET steps = ? WHERE id = ?").run(JSON.stringify(steps), runId),
  });
  // A pass must reach this route's ending in the test session. Reaching a different, valid
  // ending means Kane took another exit: the game is fine, so replay instead of repairing.
  const scenario = getScenario(row.scenario_id, row.version);
  const reached = sessionEnding(row.session_id);
  let status: KaneRun["status"] = result.outcome;
  let reason = result.reason;
  if (result.outcome !== "infra_error" && reached !== row.ending_id && (reached || result.outcome === "passed")) {
    const title = (id: string | null) => scenario.endings.find((e) => e.id === id)?.title ?? "no ending";
    status = "off_route";
    reason = reached
      ? `Kane finished through '${title(reached)}' instead of '${title(row.ending_id)}'. The game works; the route is played again.`
      : `Kane reported a pass but the test session never reached '${title(row.ending_id)}'. The route is played again.`;
  }
  db.prepare(
    `UPDATE kane_runs SET status = ?, exit_code = ?, one_liner = ?, summary = ?, reason = ?, steps = ?, credits = ?, duration_s = ?,
       test_url = ?, evidence_path = ?, finished_at = ? WHERE id = ?`,
  ).run(
    status,
    result.exitCode,
    result.oneLiner,
    result.summary,
    reason,
    JSON.stringify(result.steps),
    result.credits,
    result.durationS,
    result.testUrl,
    `runs/${runId}.ndjson`,
    now(),
    runId,
  );
  console.log(`[kane] ${row.scenario_id} v${row.version} ${row.route_id}: ${status}${reason ? ` (${reason})` : ""}`);
  if (status === "off_route") {
    const tries = (
      db.prepare("SELECT COUNT(*) AS n FROM kane_runs WHERE scenario_id = ? AND version = ? AND route_id = ? AND status = 'off_route'").get(row.scenario_id, row.version, row.route_id) as { n: number }
    ).n;
    if (tries <= KANE_MAX_OFF_ROUTE && row.version === getAdventureVersion(row.scenario_id)) enqueue(scenario, row.route_id);
    return;
  }
  // Only game failures go to the director. Infrastructure problems are recorded and left alone.
  if (status === "failed") await repair(toRun(db.prepare("SELECT * FROM kane_runs WHERE id = ?").get(runId) as RunRow));
}

// ---- repair ----

async function repair(run: KaneRun): Promise<void> {
  const scenario = getScenario(run.scenarioId, run.scenarioVersion);
  // Only repair the version players get now; an older version's failure is history.
  if (scenario.version !== getAdventureVersion(scenario.id)) return;

  // One repair per version: when two routes fail on the same version, the first repair's new
  // version is replayed on every route anyway. (Checked before any await, so it can't race.)
  const underway = db
    .prepare("SELECT 1 FROM repairs WHERE scenario_id = ? AND from_version = ? AND status IN ('repairing', 'repaired')")
    .get(scenario.id, scenario.version);
  if (underway) return;

  const id = randomUUID();
  const earlier =(db.prepare("SELECT COUNT(*) AS n FROM repairs WHERE scenario_id = ? AND route_id = ?").get(scenario.id, run.routeId) as { n: number }).n;
  if (earlier >= KANE_MAX_REPAIRS) {
    db.prepare("INSERT INTO repairs (id, scenario_id, route_id, run_id, from_version, status, note, created_at) VALUES (?, ?, ?, ?, ?, 'gave_up', ?, ?)").run(
      id,
      scenario.id,
      run.routeId,
      run.id,
      scenario.version,
      `Route withheld after ${KANE_MAX_REPAIRS} repairs`,
      now(),
    );
    return;
  }
  db.prepare("INSERT INTO repairs (id, scenario_id, route_id, run_id, from_version, status, created_at) VALUES (?, ?, ?, ?, ?, 'repairing', ?)").run(
    id,
    scenario.id,
    run.routeId,
    run.id,
    scenario.version,
    now(),
  );

  const failedStep = run.steps.find((s) => s.status === "failed");
  const evidence = [
    `An automated player (Kane) followed route "${run.routeId}" and failed.`,
    failedStep ? `It got stuck at step ${failedStep.step}: ${failedStep.remark}` : null,
    run.summary ? `Its summary: ${run.summary}` : null,
    run.reason ? `Reason given: ${run.reason}` : null,
    "Find the inconsistency in the game data that makes this route impossible for a player who follows the on-screen text (for example a clue that disagrees with the lock it opens, or a step that is not available), and fix the game data so the route works exactly as its objective describes.",
  ].filter((x): x is string => !!x);

  try {
    const revised = await reviseScenario(scenario, evidence.map((message) => ({ message })), { lockObjectives: true, effort: "low" });
    const shaped = validateShape({ ...revised, version: scenario.version + 1 });
    if ("issues" in shaped) throw new Error(shaped.issues.map((i) => i.message).join("; "));
    const issues = validateScenario(shaped.scenario);
    if (issues.length) throw new Error(`Repaired version failed validation: ${issues.map((i) => i.message).join("; ")}`);

    const next = shaped.scenario;
    saveScenarioVersion(next, issues);
    db.prepare("UPDATE repairs SET to_version = ?, status = 'repaired', changes = ? WHERE id = ?").run(next.version, JSON.stringify(diff(scenario, next)), id);
    console.log(`[kane] repaired ${scenario.id}: v${scenario.version} -> v${next.version}`);
    await renderScenario(next); // unchanged scenes are reused; changed ones repaint
    // A pass belongs to one version, so every route is played again on the new one.
    rehearse(next.id);
  } catch (err) {
    db.prepare("UPDATE repairs SET status = 'gave_up', note = ? WHERE id = ?").run(err instanceof Error ? err.message : String(err), id);
  }
}

/** Plain-language differences between two versions, for the Director View (spoilers). */
function diff(a: Scenario, b: Scenario): Repair["changes"] {
  const out: Repair["changes"] = [];
  const clip = (s: string) => (s.length > 160 ? `${s.slice(0, 157)}…` : s);
  for (const after of b.actions) {
    const before = a.actions.find((x) => x.id === after.id);
    if (!before) {
      out.push({ field: `New action "${after.label}"`, before: "—", after: clip(after.narrative) });
      continue;
    }
    if (before.narrative !== after.narrative) out.push({ field: `"${after.label}" text`, before: clip(before.narrative), after: clip(after.narrative) });
    if (before.label !== after.label) out.push({ field: `Action label (${after.id})`, before: before.label, after: after.label });
    if (before.input?.answer !== after.input?.answer) out.push({ field: `"${after.label}" code`, before: before.input?.answer ?? "—", after: after.input?.answer ?? "—" });
    if (JSON.stringify(before.requires ?? {}) !== JSON.stringify(after.requires ?? {}))
      out.push({ field: `"${after.label}" needs`, before: JSON.stringify(before.requires ?? {}), after: JSON.stringify(after.requires ?? {}) });
    if (JSON.stringify(before.effects) !== JSON.stringify(after.effects))
      out.push({ field: `"${after.label}" effects`, before: JSON.stringify(before.effects), after: JSON.stringify(after.effects) });
  }
  for (const r of b.rooms) {
    const before = a.rooms.find((x) => x.id === r.id);
    if (before && before.description !== r.description) out.push({ field: `${r.name} description`, before: clip(before.description), after: clip(r.description) });
  }
  return out;
}

// ---- read side ----

/** Readiness of each route on the given version. */
export function routeReadiness(scenario: Scenario): KaneView["routes"] {
  return scenario.intendedSolutions.map((route, i) => {
    const runs = (
      db.prepare("SELECT * FROM kane_runs WHERE scenario_id = ? AND version = ? AND route_id = ? ORDER BY created_at DESC").all(scenario.id, scenario.version, route.routeId) as RunRow[]
    ).map(toRun);
    const repairing = db
      .prepare("SELECT 1 FROM repairs WHERE scenario_id = ? AND route_id = ? AND from_version = ? AND status = 'repairing'")
      .get(scenario.id, route.routeId, scenario.version);
    const gaveUp = db
      .prepare("SELECT 1 FROM repairs WHERE scenario_id = ? AND route_id = ? AND from_version = ? AND status = 'gave_up'")
      .get(scenario.id, route.routeId, scenario.version);
    const latest = runs[0];
    let readiness: RouteReadiness = "untested";
    if (runs.some((r) => r.status === "passed")) readiness = "passed";
    else if (repairing) readiness = "repairing";
    else if (latest && (latest.status === "queued" || latest.status === "running")) readiness = "testing";
    else if (gaveUp) readiness = "withheld";
    else if (latest?.status === "failed") readiness = "repairing";
    else if (latest?.status === "off_route") readiness = "untested";
    const ending = scenario.endings.find((e) => e.id === route.endingId);
    return {
      routeId: route.routeId,
      endingId: route.endingId,
      label: `Route ${String.fromCharCode(65 + i)} · ${ending?.title ?? route.routeId}`,
      readiness,
      latestRunId: latest?.id ?? null,
    };
  });
}

export async function kaneView(scenarioId: string): Promise<KaneView> {
  const version = getAdventureVersion(scenarioId);
  const runs = (db.prepare("SELECT * FROM kane_runs WHERE scenario_id = ? ORDER BY created_at DESC LIMIT 40").all(scenarioId) as RunRow[]).map(toRun);
  const repairs = (db.prepare("SELECT * FROM repairs WHERE scenario_id = ? ORDER BY created_at DESC").all(scenarioId) as RepairRow[]).map(toRepair);
  const problem = await kaneReadyCached();
  return { enabled: !problem, problem, currentVersion: version, routes: routeReadiness(getScenario(scenarioId, version)), runs, repairs };
}

let readyCache: { at: number; value: string | null } | null = null;
async function kaneReadyCached(): Promise<string | null> {
  if (readyCache && Date.now() - readyCache.at < 60_000) return readyCache.value;
  readyCache = { at: Date.now(), value: await kaneReady() };
  return readyCache.value;
}

/** Player-facing Kane state for a session's version; null when the adventure has no routes to test. */
export function playerKaneState(scenario: Scenario): { state: "testing" | "repairing" | "passed" | "delayed"; newerVersion: boolean } | null {
  const routes = routeReadiness(scenario);
  if (!routes.length) return null;
  const newerVersion = getAdventureVersion(scenario.id) > scenario.version;
  const state = routes.every((r) => r.readiness === "passed")
    ? "passed"
    : routes.some((r) => r.readiness === "repairing")
      ? "repairing"
      : routes.some((r) => r.readiness === "testing")
        ? "testing"
        : "delayed";
  return { state, newerVersion };
}

/**
 * Whether a player may finish through this ending on this version: only once Kane has passed a
 * route to it on this exact version. A version Kane never tested stays locked too.
 */
export function endingOpen(scenario: Scenario, endingId: string): boolean {
  const routes = routeReadiness(scenario).filter((r) => r.endingId === endingId);
  if (!routes.length) return true;
  return routes.some((r) => r.readiness === "passed");
}

