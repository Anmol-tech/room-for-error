// Live view of Kane at work: the run in progress plus a copy of the game session it is playing,
// read straight from the preview session on this server (Kane's own stream has no screenshots).
import type { KaneLive } from "../../shared/schema.ts";
import { getAdventureVersion, getScenario, getSessionView } from "./adventures.ts";
import { db } from "./db.ts";
import { latestExploration } from "./explore.ts";
import { getRun, kaneView, routeReadiness } from "./rehearsal.ts";

export async function kaneLive(scenarioId: string): Promise<KaneLive> {
  const version = getAdventureVersion(scenarioId);
  const routes = routeReadiness(getScenario(scenarioId, version));
  // Prefer the run in progress; otherwise show the most recent one so the window isn't empty.
  const row = (db
    .prepare(
      `SELECT id FROM kane_runs WHERE scenario_id = ?
       ORDER BY CASE status WHEN 'running' THEN 0 ELSE 1 END, COALESCE(started_at, created_at) DESC LIMIT 1`,
    )
    .get(scenarioId) ?? null) as { id: string } | null;
  const run = row ? getRun(row.id) : null;
  const queued = (db.prepare("SELECT COUNT(*) AS n FROM kane_runs WHERE scenario_id = ? AND status = 'queued'").get(scenarioId) as { n: number }).n;

  let session: KaneLive["session"] = null;
  if (run && run.status !== "queued") {
    try {
      session = getSessionView(run.sessionId);
    } catch {
      session = null;
    }
  }
  const routeLabel = run ? (routeReadiness(getScenario(scenarioId, run.scenarioVersion)).find((r) => r.routeId === run.routeId)?.label ?? run.routeId) : null;
  const { problem } = await kaneView(scenarioId);
  const { sessionId: _omit, ...publicRun } = run ?? ({} as NonNullable<typeof run>);

  const exploration = latestExploration(scenarioId);
  // While Kane explores freely, "what Kane sees" is the game it's exploring right now.
  if (exploration?.status === "running") {
    // Any explored session: Kane may go back to a game an earlier exploration started.
    const latest = db.prepare("SELECT id FROM sessions WHERE scenario_id = ? AND explore_id IS NOT NULL ORDER BY updated_at DESC LIMIT 1").get(scenarioId) as { id: string } | undefined;
    if (latest) session = getSessionView(latest.id);
  }

  return { run: run ? publicRun : null, routeLabel, session, queued, currentVersion: version, routes, problem, exploration };
}
