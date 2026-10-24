import { test } from "node:test";
import assert from "node:assert/strict";
import { isReachable, layoutHotspots } from "../../shared/hotspotLayout.ts";

// The ghost ship's deck: "ride the ghost tide" covers most of the floor, including "enter hold".
const deck = [
  { actionId: "search_skeleton", x: 0.4, y: 0.31, w: 0.08, h: 0.25 },
  { actionId: "open_cabin_door", x: 0.17, y: 0.4, w: 0.1, h: 0.17 },
  { actionId: "enter_hold", x: 0.66, y: 0.53, w: 0.12, h: 0.23 },
  { actionId: "ride_ghost_tide", x: 0.11, y: 0.55, w: 0.74, h: 0.31 },
];

test("smaller hotspots are drawn above larger ones", () => {
  const placed = layoutHotspots(deck);
  const layer = (id: string) => placed.find((p) => p.actionIds.includes(id))!.layer;
  assert.ok(layer("enter_hold") > layer("ride_ghost_tide"));
});

test("every hotspot keeps a clickable marker", () => {
  const placed = layoutHotspots(deck);
  for (const p of placed) assert.ok(isReachable(p, placed), `${p.actionIds} is covered`);
});

test("a big area's marker moves off a small area it contains", () => {
  const placed = layoutHotspots([
    { actionId: "fire_cannon", x: 0.35, y: 0.27, w: 0.37, h: 0.59 },
    { actionId: "load_cannon", x: 0.45, y: 0.5, w: 0.13, h: 0.11 }, // sits on fire_cannon's centre
  ]);
  const fire = placed.find((p) => p.actionIds.includes("fire_cannon"))!;
  assert.ok(isReachable(fire, placed));
  assert.notDeepEqual([fire.markerX, fire.markerY], [0.5, 0.5]);
});

test("actions on the same object share one spot", () => {
  // The vision model gave "load" and "fire" the same box: both are the cannon.
  const placed = layoutHotspots([
    { actionId: "load_cannon", x: 0.3, y: 0.25, w: 0.31, h: 0.47 },
    { actionId: "fire_cannon", x: 0.3, y: 0.25, w: 0.31, h: 0.47 },
    { actionId: "stir_water", x: 0.02, y: 0.8, w: 0.8, h: 0.15 },
  ]);
  assert.equal(placed.length, 2);
  assert.deepEqual(placed.find((p) => p.actionIds.length === 2)?.actionIds, ["load_cannon", "fire_cannon"]);
});
