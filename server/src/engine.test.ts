import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ScenarioSchema, type Scenario } from "../../shared/schema.ts";
import { applyAction, initialState, nextStep, useItem } from "./engine.ts";
import { validateScenario } from "./validator.ts";

const museum: Scenario = ScenarioSchema.parse(
  JSON.parse(readFileSync(new URL("../../missions/museum.json", import.meta.url), "utf8")),
);

function play(steps: [string, string?][]) {
  let state = initialState(museum);
  const results = [];
  for (const [id, input] of steps) {
    const r = applyAction(museum, state, id, input);
    results.push(r);
    state = r.state;
  }
  return { state, results };
}

test("rooftop route reaches its ending with the correct code", () => {
  const { state } = play([["search_desk"], ["go_archive"], ["inspect_terminal", "4417"], ["go_collection"], ["take_core"], ["escape_rooftop"]]);
  assert.equal(state.endingId, "rooftop");
  assert.ok(state.inventory.includes("badge"));
});

test("service route consumes the fuse", () => {
  const { state } = play([["search_desk"], ["go_archive"], ["take_fuse"], ["inspect_terminal", "4417"], ["go_collection"], ["take_core"], ["escape_service"]]);
  assert.equal(state.endingId, "service");
  assert.ok(!state.inventory.includes("fuse"));
});

test("following the planted clue (4471) fails at the terminal", () => {
  const { state, results } = play([["search_desk"], ["go_archive"], ["inspect_terminal", "4471"]]);
  assert.equal(results.at(-1)!.ok, false);
  assert.ok(!state.flags.includes("vault_open"));
});

test("codes match regardless of dashes and spaces", () => {
  const { state } = play([["search_desk"], ["go_archive"], ["inspect_terminal", " 44-1 7 "]]);
  assert.ok(state.flags.includes("vault_open"));
});

test("security door is locked without the badge", () => {
  const { state, results } = play([["go_archive"]]);
  assert.equal(results[0].ok, false);
  assert.equal(state.roomId, "lobby");
});

test("scene state changes with the world", () => {
  const { state } = play([["search_desk"], ["go_archive"], ["inspect_terminal", "4417"]]);
  assert.equal(state.sceneStates.lobby, "desk_searched");
  assert.equal(state.sceneStates.archive, "vault_open");
});

test("validator passes the museum: the clue mismatch is invisible to it", () => {
  assert.deepEqual(validateScenario(museum), []);
});

test("validator catches a badge consumed before the rooftop needs it", () => {
  const broken = structuredClone(museum);
  broken.actions.find((a) => a.id === "go_archive")!.effects.removeItems = ["badge"];
  const issues = validateScenario(broken);
  assert.ok(issues.some((i) => i.kind === "consumed_needed_item"), JSON.stringify(issues));
  assert.ok(issues.some((i) => i.kind === "unreachable_ending" && i.refs.includes("rooftop")));
});

test("validator catches dangling references", () => {
  const broken = structuredClone(museum);
  broken.actions[0].effects.addItems = ["ghost_item"];
  assert.ok(validateScenario(broken).some((i) => i.kind === "missing_reference"));
});

test("using the badge on the door works; using it on the desk does nothing", () => {
  const state = play([["search_desk"]]).state;
  const miss = useItem(museum, state, "badge", ["search_desk"]);
  assert.equal(miss.ok, false);
  const hit = useItem(museum, state, "badge", ["go_archive"]);
  assert.equal(hit.ok, true);
  assert.equal(hit.state.roomId, "archive");
});

test("next step heads toward an ending", () => {
  assert.equal(nextStep(museum, initialState(museum))?.id, "search_desk");
  const { state } = play([["search_desk"], ["go_archive"]]);
  assert.equal(nextStep(museum, state)?.id, "inspect_terminal");
});

test("revealing a code gives the player a note with the clue", async () => {
  const { withNotes, withoutNotes } = await import("./notes.ts");
  const fixed = structuredClone(museum);
  fixed.actions.find((a) => a.id === "search_desk")!.narrative = fixed.actions.find((a) => a.id === "search_desk")!.narrative.replace("4471", "4417");
  const s = withNotes(fixed);
  const note = s.items.find((i) => i.id === "note_inspect_terminal");
  assert.ok(note, "note item exists");
  assert.match(note!.description, /4417/);
  const state = applyAction(s, initialState(s), "search_desk").state;
  assert.ok(state.inventory.includes("note_inspect_terminal"));
  // Stripping restores the stored shape.
  assert.deepEqual(withoutNotes(s), fixed);
});

test("a clue whose code is wrong still becomes a note (Kane catches the mismatch)", async () => {
  const { withNotes } = await import("./notes.ts");
  const note = withNotes(museum).items.find((i) => i.id === "note_inspect_terminal");
  assert.match(note!.description, /4471/);
});

test("action labels name the object to paint into a scene", async () => {
  const { objectOf } = await import("./flux.ts");
  assert.equal(objectOf("Search the helm"), "helm");
  assert.equal(objectOf("Go to the hold"), "hold");
  assert.equal(objectOf("Look at the brass porthole"), "brass porthole");
});
