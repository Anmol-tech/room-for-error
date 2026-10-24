// Pure game rules. The engine owns game state; images only illustrate it.
import type { Action, GameState, Scenario } from "../../shared/schema.ts";

export function initialState(scenario: Scenario): GameState {
  return {
    roomId: scenario.startRoomId,
    inventory: [],
    flags: [],
    sceneStates: Object.fromEntries(scenario.rooms.map((r) => [r.id, r.sceneStates[0].id])),
    usedActions: [],
  };
}

export function meetsRequirements(action: Action, state: GameState): boolean {
  const items = action.requires?.items ?? [];
  const flags = action.requires?.flags ?? [];
  return items.every((i) => state.inventory.includes(i)) && flags.every((f) => state.flags.includes(f));
}

/** Actions the player can see in the current room (locked ones included, used `once` ones hidden). */
export function visibleActions(scenario: Scenario, state: GameState): Action[] {
  if (state.endingId) return [];
  return scenario.actions.filter((a) => a.roomId === state.roomId && !(a.once && state.usedActions.includes(a.id)));
}

export type ActionResult =
  | { ok: true; state: GameState; message: string }
  | { ok: false; state: GameState; message: string; reason: "unknown" | "locked" | "wrong_code" | "wrong_item" | "ended" };

export function applyAction(scenario: Scenario, state: GameState, actionId: string, input?: string): ActionResult {
  if (state.endingId) return { ok: false, state, message: "The adventure is over.", reason: "ended" };

  const action = visibleActions(scenario, state).find((a) => a.id === actionId);
  if (!action) return { ok: false, state, message: "You can't do that here.", reason: "unknown" };

  if (!meetsRequirements(action, state)) {
    return { ok: false, state, message: action.lockedMessage ?? "You can't do that yet.", reason: "locked" };
  }

  if (action.input && normalize(input) !== normalize(action.input.answer)) {
    return { ok: false, state, message: action.input.failMessage, reason: "wrong_code" };
  }

  return { ok: true, state: applyEffects(state, action), message: action.narrative };
}

/** Applies an action's effects without checking requirements or input. */
export function applyEffects(state: GameState, action: Action): GameState {
  const e = action.effects;
  const removed = new Set(e.removeItems ?? []);
  const inventory = [...state.inventory.filter((i) => !removed.has(i))];
  for (const i of e.addItems ?? []) if (!inventory.includes(i)) inventory.push(i);

  const flags = [...state.flags];
  for (const f of e.setFlags ?? []) if (!flags.includes(f)) flags.push(f);

  const roomId = e.moveTo ?? state.roomId;
  const sceneStates = e.sceneState ? { ...state.sceneStates, [roomId]: e.sceneState } : state.sceneStates;

  return {
    roomId,
    inventory,
    flags,
    sceneStates,
    usedActions: action.once ? [...state.usedActions, action.id] : state.usedActions,
    endingId: e.ending ?? state.endingId,
  };
}

/** Codes compare without case, spaces, dashes or dots, so "7-3-9" from a clue matches "739". */
function normalize(s: string | undefined): string {
  return (s ?? "").toLowerCase().replace(/[\s\-.]/g, "");
}

export type UseResult = ActionResult | { ok: false; state: GameState; message: string; reason: "needs_input"; actionId: string };

/**
 * Uses an inventory item on an object: picks the action at that object (one of `candidateIds`)
 * that needs this item and runs it. Code locks report back so the client can open the keypad.
 */
export function useItem(scenario: Scenario, state: GameState, itemId: string, candidateIds: string[], objectName?: string): UseResult {
  const item = scenario.items.find((i) => i.id === itemId);
  if (!item || !state.inventory.includes(itemId)) return { ok: false, state, message: "You don't have that.", reason: "unknown" };

  const here = visibleActions(scenario, state).filter((a) => candidateIds.includes(a.id));
  const action = here.find((a) => a.requires?.items?.includes(itemId));
  // Failures say what was observed without giving the answer away.
  const thing = item.name.toLowerCase();
  const target = objectName ? `the ${objectName.toLowerCase().replace(/^the\s+/, "")}` : "it";
  if (!action) {
    const wantsItem = here.some((a) => a.requires?.items?.length);
    const message = !here.length
      ? `There's nothing left to do with ${target}.`
      : wantsItem
        ? `The ${thing} doesn't fit ${target}. Something else might.`
        : `${capitalize(target)} doesn't need the ${thing}. Try examining it instead.`;
    return { ok: false, state, message, reason: "wrong_item" };
  }
  if (!meetsRequirements(action, state)) {
    return { ok: false, state, message: action.lockedMessage ?? `The ${thing} fits ${target}, but something else is still missing.`, reason: "locked" };
  }
  if (action.input) return { ok: false, state, message: action.input.prompt, reason: "needs_input", actionId: action.id };
  return applyAction(scenario, state, action.id);
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * First action on a shortest path from `state` to any ending (codes assumed known), or null.
 * Used for hints, which run on the server so solutions never reach the browser.
 */
export function nextStep(scenario: Scenario, state: GameState, maxStates = 5000): Action | null {
  if (state.endingId) return null;
  const key = (s: GameState) =>
    JSON.stringify([s.roomId, [...s.inventory].sort(), [...s.flags].sort(), [...s.usedActions].sort()]);
  const seen = new Set([key(state)]);
  const queue: { state: GameState; first: Action }[] = [];
  for (const a of visibleActions(scenario, state)) {
    if (!meetsRequirements(a, state)) continue;
    queue.push({ state: applyEffects(state, a), first: a });
  }
  while (queue.length && seen.size < maxStates) {
    const { state: s, first } = queue.shift()!;
    if (s.endingId) return first;
    const k = key(s);
    if (seen.has(k)) continue;
    seen.add(k);
    for (const a of visibleActions(scenario, s)) if (meetsRequirements(a, s)) queue.push({ state: applyEffects(s, a), first });
  }
  return null;
}
