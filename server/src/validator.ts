import { lockProblem } from "./locks.ts";
// Static checks that run before anything is shown to a player or to Kane.
// They catch rule errors only; prose (like a clue's wording) is Kane's job.
import { ScenarioSchema, type GameState, type Scenario, type ValidatorIssue } from "../../shared/schema.ts";
import { applyEffects, initialState, meetsRequirements, visibleActions } from "./engine.ts";

const MAX_STATES = 5000;

export function validateShape(data: unknown): { scenario: Scenario } | { issues: ValidatorIssue[] } {
  const parsed = ScenarioSchema.safeParse(data);
  if (parsed.success) return { scenario: parsed.data };
  return {
    issues: parsed.error.issues.slice(0, 10).map((i) => ({
      kind: "invalid_shape" as const,
      message: `${i.path.join(".") || "(root)"}: ${i.message}`,
      refs: [],
    })),
  };
}

export function validateScenario(scenario: Scenario): ValidatorIssue[] {
  const issues = [...checkReferences(scenario)];
  if (issues.length) return issues; // graph checks are meaningless with dangling references
  issues.push(...checkLocks(scenario));
  issues.push(...checkSolutions(scenario));
  issues.push(...checkReachableEndings(scenario));
  return issues;
}

function checkReferences(s: Scenario): ValidatorIssue[] {
  const issues: ValidatorIssue[] = [];
  const dup = (kind: string, ids: string[]) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) issues.push({ kind: "duplicate_id", message: `Duplicate ${kind} id "${id}"`, refs: [id] });
      seen.add(id);
    }
  };
  dup("room", s.rooms.map((r) => r.id));
  dup("item", s.items.map((i) => i.id));
  dup("action", s.actions.map((a) => a.id));
  dup("ending", s.endings.map((e) => e.id));

  const rooms = new Map(s.rooms.map((r) => [r.id, r]));
  const items = new Set(s.items.map((i) => i.id));
  const endings = new Set(s.endings.map((e) => e.id));
  const actions = new Set(s.actions.map((a) => a.id));
  const missing = (what: string, id: string, owner: string) =>
    issues.push({ kind: "missing_reference", message: `${owner} refers to unknown ${what} "${id}"`, refs: [owner, id] });

  if (!rooms.has(s.startRoomId)) missing("room", s.startRoomId, "startRoomId");

  for (const a of s.actions) {
    if (!rooms.has(a.roomId)) missing("room", a.roomId, a.id);
    for (const i of [...(a.requires?.items ?? []), ...(a.effects.addItems ?? []), ...(a.effects.removeItems ?? [])]) {
      if (!items.has(i)) missing("item", i, a.id);
    }
    if (a.effects.moveTo && !rooms.has(a.effects.moveTo)) missing("room", a.effects.moveTo, a.id);
    if (a.effects.ending && !endings.has(a.effects.ending)) missing("ending", a.effects.ending, a.id);
    const targetRoom = rooms.get(a.effects.moveTo ?? a.roomId);
    if (a.effects.sceneState && targetRoom && !targetRoom.sceneStates.some((x) => x.id === a.effects.sceneState)) {
      missing("scene state", a.effects.sceneState, a.id);
    }
  }

  for (const sol of s.intendedSolutions) {
    if (!endings.has(sol.endingId)) missing("ending", sol.endingId, `route ${sol.routeId}`);
    for (const step of sol.steps) if (!actions.has(step)) missing("action", step, `route ${sol.routeId}`);
  }
  return issues;
}

/** Plays each intended solution with correct answers and checks it reaches its ending. */
function checkSolutions(s: Scenario): ValidatorIssue[] {
  const issues: ValidatorIssue[] = [];
  const byId = new Map(s.actions.map((a) => [a.id, a]));

  for (const sol of s.intendedSolutions) {
    let state = initialState(s);
    for (const [n, stepId] of sol.steps.entries()) {
      const action = byId.get(stepId)!;
      const visible = visibleActions(s, state).some((a) => a.id === stepId);
      if (!visible || !meetsRequirements(action, state)) {
        const needed = (action.requires?.items ?? []).filter((i) => !state.inventory.includes(i));
        const consumed = needed.filter((i) => s.actions.some((a) => sol.steps.slice(0, n).includes(a.id) && a.effects.removeItems?.includes(i)));
        issues.push(
          consumed.length
            ? {
                kind: "consumed_needed_item",
                message: `Route "${sol.routeId}": step ${n + 1} "${stepId}" needs ${consumed.join(", ")}, which an earlier step removed`,
                refs: [sol.routeId, stepId, ...consumed],
              }
            : {
                kind: "broken_solution",
                message: `Route "${sol.routeId}": step ${n + 1} "${stepId}" can't be taken (${!visible ? `not available in room "${state.roomId}"` : "requirements not met"})`,
                refs: [sol.routeId, stepId],
              },
        );
        break;
      }
      state = applyEffects(state, action);
    }
    if (!issues.some((i) => i.refs[0] === sol.routeId) && state.endingId !== sol.endingId) {
      issues.push({
        kind: "broken_solution",
        message: `Route "${sol.routeId}" ends at "${state.endingId ?? "no ending"}" instead of "${sol.endingId}"`,
        refs: [sol.routeId],
      });
    }
  }
  return issues;
}

/** Breadth-first search over game states (correct answers assumed) to find reachable endings. */
function checkReachableEndings(s: Scenario): ValidatorIssue[] {
  const reached = new Set<string>();
  const seen = new Set<string>();
  const queue: GameState[] = [initialState(s)];

  while (queue.length && seen.size < MAX_STATES) {
    const state = queue.shift()!;
    const key = stateKey(state);
    if (seen.has(key)) continue;
    seen.add(key);
    if (state.endingId) {
      reached.add(state.endingId);
      continue;
    }
    for (const a of visibleActions(s, state)) if (meetsRequirements(a, state)) queue.push(applyEffects(state, a));
  }

  return s.endings
    .filter((e) => !reached.has(e.id))
    .map((e) => ({ kind: "unreachable_ending" as const, message: `Ending "${e.id}" can never be reached`, refs: [e.id] }));
}

function stateKey(st: GameState): string {
  return JSON.stringify([st.roomId, [...st.inventory].sort(), [...st.flags].sort(), [...st.usedActions].sort(), st.endingId ?? ""]);
}

/** Mechanism locks must be well formed: matching wheels and symbols, one setting per switch, real fragments. */
function checkLocks(s: Scenario): ValidatorIssue[] {
  return s.actions.flatMap((a) => {
    const problem = lockProblem(a);
    return problem ? [{ kind: "invalid_shape" as const, message: `Lock "${a.id}" (${a.input!.kind}) ${problem}`, refs: [a.id] }] : [];
  });
}
