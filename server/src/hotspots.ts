// Finds where each action's object sits in a scene image, so players can click the picture.
// Buttons stay the source of truth; hotspots are a shortcut layered on top.
import { readFileSync } from "node:fs";
import type { Hotspot, Room, Scenario } from "../../shared/schema.ts";
import { VISION_MODEL } from "./config.ts";
import { chatJson, llmEnabled } from "./llm.ts";

export const hotspotsEnabled = llmEnabled;

const SYSTEM = `You locate objects in illustrations for a point-and-click escape game.
For each target, find the single object or area in the image a player would click to do that action
(a door for "go to ..." actions, a desk for "search desk", a keypad or screen for codes, an item for "take ...").
Return JSON: {"hotspots":[{"id":"<target id>","object":"<2-4 word name of the object as drawn>","look":"<one sentence on how it looks>","box":[ymin,xmin,ymax,xmax]}]} with coordinates normalized to 0–1000.
Several targets may share one object; give them the same "object" name and box.
"look" describes only what is visible (material, condition, mood). Never mention codes, solutions, or what the player should do.
Use "box": null when nothing in the image clearly matches. Prefer tight boxes around the specific object. Never invent objects.`;

const MIN_SIZE = 0.04; // smallest hotspot edge, as a fraction of the image

export async function detectHotspots(scenario: Scenario, room: Room, imagePath: string): Promise<Hotspot[]> {
  const actions = scenario.actions.filter((a) => a.roomId === room.id);
  if (!actions.length) return [];
  const targets = actions.map((a) => ({ id: a.id, action: a.label }));
  const image = `data:image/jpeg;base64,${readFileSync(imagePath).toString("base64")}`;

  const raw = await chatJson(
    SYSTEM,
    [
      { type: "text", text: `Room: ${room.name}. ${room.description}\nTargets:\n${JSON.stringify(targets)}` },
      { type: "image_url", image_url: { url: image } },
    ],
    // Some vision models (e.g. Gemini) refuse to run with reasoning fully off.
    { model: VISION_MODEL, tag: "hotspots", reasoningEffort: "low" },
  );

  const ids = new Set(actions.map((a) => a.id));
  const list = Array.isArray(raw.hotspots) ? raw.hotspots : [];
  const out: Hotspot[] = [];
  for (const h of list as { id?: unknown; box?: unknown; object?: unknown; look?: unknown }[]) {
    if (typeof h.id !== "string" || !ids.has(h.id) || !Array.isArray(h.box) || h.box.length !== 4) continue;
    const [ymin, xmin, ymax, xmax] = h.box.map((n) => Math.min(1000, Math.max(0, Number(n))) / 1000);
    if (![ymin, xmin, ymax, xmax].every(Number.isFinite) || xmax <= xmin || ymax <= ymin) continue;
    const spot = grow({ actionId: h.id, x: xmin, y: ymin, w: xmax - xmin, h: ymax - ymin });
    if (typeof h.object === "string" && h.object.trim()) spot.object = h.object.trim().slice(0, 40);
    if (typeof h.look === "string" && h.look.trim()) spot.look = h.look.trim().slice(0, 160);
    out.push(spot);
  }
  return out;
}

/** Keeps tiny boxes clickable by growing them around their centre. */
function grow(h: Hotspot): Hotspot {
  const w = Math.max(h.w, MIN_SIZE);
  const hh = Math.max(h.h, MIN_SIZE * (16 / 9));
  const x = Math.min(Math.max(h.x + h.w / 2 - w / 2, 0), 1 - w);
  const y = Math.min(Math.max(h.y + h.h / 2 - hh / 2, 0), 1 - hh);
  return { actionId: h.actionId, x, y, w, h: hh };
}
