// The director: turns a theme into scenario data, and revises scenarios when checks fail.
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Scenario, ValidatorIssue } from "../../shared/schema.ts";
import { MISSIONS_DIR } from "./config.ts";
import { chatJson, llmEnabled } from "./llm.ts";
import { validateScenario, validateShape } from "./validator.ts";

export const directorEnabled = llmEnabled;

/** The museum mission with its planted defect removed, used as a format example. */
const EXAMPLE = (() => {
  const s = JSON.parse(readFileSync(path.join(MISSIONS_DIR, "museum.json"), "utf8"));
  delete s.notes;
  return JSON.stringify(s).replaceAll("4471", "4417");
})();

const RULES = `You design short escape-room adventures as JSON for a fixed game engine.

Return ONE JSON object with exactly the shape of the example. Rules:
- 3 rooms, 3–4 items, 2 puzzles, 2 endings (two different escape routes). Gameplay of 2–4 minutes.
- At least one puzzle is a code lock: an action with "input": {"kind":"code", ...}. Its clue must appear, word for word, in the "narrative" of an EARLIER action the player can take, and the clue's code must equal "input.answer" exactly.
- Every action needs a short, unique (within its room) button "label" in plain words, a "narrative" shown after success, and a "lockedMessage" if it has "requires".
- Use "once": true for one-time actions (searching, taking items, solving puzzles).
- Also give every room 1–2 "flavor" actions that are NOT part of any solution: examining a distinct object that appears in that room's first imagePrompt (a painting, a window, a strange machine). They have empty "effects" ({}), no "requires", no "once", and a short atmospheric or funny "narrative". Never put them in "intendedSolutions". Never use an object another action already uses, and never doors, hatches, ladders, windows, locks or keypads.
- Rooms connect with actions using "effects.moveTo". Let the player walk back when it makes sense.
- Use "requires" (items/flags) and "effects" (addItems, removeItems, setFlags, moveTo, sceneState, ending) only. Only remove items that are truly used up.
- Each room has 1–3 "sceneStates". The first is the default; add one only for a visible change (door opens, object taken, lights change). imagePrompt: a vivid visual description of the scene with no words or text in the image; later states describe only what changed.
- ids are short snake_case and unique. Every item has an "icon": one emoji that fits it.
- "intendedSolutions": one per ending, listing every action id in order from the very start, including each move between rooms. Play each route through in your head before answering: every step must be available in the room the player is in at that moment. "objective" is a plain-English instruction for a tester who only sees the screen: say which buttons to use, to read any clue and use it (never state the code itself), and end with: Verify the '<ending title>' ending is shown.
- Keep all text short. Match the theme closely; the theme must genuinely shape rooms, items, puzzles and endings.

Example (a different theme):
${EXAMPLE}`;

export async function createScenario(
  theme: string,
  id: string,
  onRetry?: () => void,
): Promise<{ scenario: Scenario; issues: ValidatorIssue[] }> {
  // Fast first draft; if the validator objects, revise, then try a fresh draft, then revise again.
  // Retries think a little harder (fast flash models often drop a step between rooms).
  const plan: ("draft" | "revise")[] = ["draft", "revise", "draft", "revise"];
  let last: { scenario: Scenario; issues: ValidatorIssue[] } | { issues: ValidatorIssue[] } | null = null;
  let previous: unknown = null;

  for (const [round, step] of plan.entries()) {
    const effort = round === 0 ? undefined : "low";
    if (round > 0) onRetry?.();
    const raw =
      step === "draft"
        ? await complete(RULES, `Theme: ${theme}`, effort)
        : await reviseScenario(previous as Scenario, last!.issues, { lockObjectives: false, effort });
    last = check({ ...raw, id, version: 1, theme });
    if ("scenario" in last && last.issues.length === 0) return last;
    previous = "scenario" in last ? last.scenario : raw;
    console.log(`[director] ${id}: round ${round + 1} (${step}) has ${last.issues.length} issue(s):`, last.issues.map((i) => i.message));
  }
  if (last && "scenario" in last) return last;
  throw new Error(`Director produced invalid data: ${last?.issues.map((i) => i.message).join("; ")}`);
}

/**
 * Asks the director to fix specific problems. With lockObjectives (any time tests have
 * already been written against the scenario), the intended solutions are restored
 * afterwards so a repair can never weaken a test.
 */
export async function reviseScenario(
  scenario: Scenario,
  problems: { message: string }[],
  opts: { lockObjectives: boolean; effort?: string },
): Promise<Scenario> {
  const instructions = `${RULES}

You are repairing an existing adventure. Change as little as possible to fix the listed problems. Every route must list every action from the very start, including each move between rooms (\"effects.moveTo\"), and every room must be reachable from the start room.${
    opts.lockObjectives ? ' Do NOT change "intendedSolutions"; fix the game so they work.' : ""
  } Return the full corrected JSON object.`;
  const fixed = await complete(
    instructions,
    `Problems:\n${problems.map((p) => `- ${p.message}`).join("\n")}\n\nCurrent adventure:\n${JSON.stringify(scenario)}`,
    opts.effort,
  );
  const merged: Record<string, unknown> = { ...fixed, id: scenario.id, version: scenario.version, theme: scenario.theme };
  if (opts.lockObjectives) merged.intendedSolutions = scenario.intendedSolutions;
  return merged as unknown as Scenario;
}

function check(data: unknown): { scenario: Scenario; issues: ValidatorIssue[] } | { issues: ValidatorIssue[] } {
  const shaped = validateShape(data);
  if ("issues" in shaped) return shaped;
  return { scenario: shaped.scenario, issues: validateScenario(shaped.scenario) };
}

function complete(system: string, user: string, effort?: string): Promise<Record<string, unknown>> {
  return chatJson(system, user, { tag: "director", reasoningEffort: effort });
}

/**
 * Adds 1–2 flavor actions per room to an existing scenario: clickable things that aren't part of
 * any solution. Only appends actions; nothing existing changes, so routes and objectives stay valid.
 */
export async function addFlavorActions(scenario: Scenario): Promise<Scenario> {
  const rooms = scenario.rooms.map((r) => ({
    roomId: r.id,
    scene: r.sceneStates[0].imagePrompt,
    existingActions: scenario.actions.filter((a) => a.roomId === r.id).map((a) => a.label),
  }));
  const raw = await chatJson(
    `You add optional "flavor" interactions to an escape-room adventure themed "${scenario.theme}".
For each room, invent 1–2 actions that examine a distinct object visible in that room's scene description and that is NOT the object of any existing action (check the existing labels), and is never a door, hatch, ladder, window, lock or keypad.
Return JSON {"actions":[{"id":"snake_case_unique","roomId":"...","label":"Short button text","narrative":"1–2 atmospheric or funny sentences"}]}.`,
    JSON.stringify(rooms),
    { tag: "flavor" },
  );
  const taken = new Set(scenario.actions.map((a) => a.id));
  const roomIds = new Set(scenario.rooms.map((r) => r.id));
  const added: Scenario["actions"] = [];
  for (const x of (Array.isArray(raw.actions) ? raw.actions : []) as Record<string, unknown>[]) {
    const id = String(x.id ?? "").replace(/[^a-z0-9_]/gi, "_").toLowerCase();
    if (!id || taken.has(id) || !roomIds.has(String(x.roomId)) || !x.label || !x.narrative) continue;
    taken.add(id);
    added.push({ id, roomId: String(x.roomId), label: String(x.label), narrative: String(x.narrative), effects: {} });
  }
  return { ...scenario, version: scenario.version + 1, actions: [...scenario.actions, ...added] };
}
