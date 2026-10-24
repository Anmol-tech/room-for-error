// Scene images: FLUX when BFL_API_KEY is set, local SVG placeholders otherwise.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Action, Hotspot, ImageStatus, Item, Room, Scenario } from "../../shared/schema.ts";
import { ASSETS_DIR, BFL_API_KEY, BFL_MODEL, IMAGE_CONCURRENCY, IMAGE_HEIGHT, IMAGE_WIDTH, VISION_MODEL } from "./config.ts";
import { db } from "./db.ts";
import { detectHotspots, hotspotsEnabled } from "./hotspots.ts";

const IMAGES_DIR = path.join(ASSETS_DIR, "images");
mkdirSync(IMAGES_DIR, { recursive: true });

export const fluxEnabled = () => BFL_API_KEY !== "";

interface ImageRow {
  scenario_id: string;
  room_id: string;
  scene_state_id: string;
  prompt_hash: string;
  status: ImageStatus;
  path: string | null;
  error: string | null;
  /** JSON array of Hotspot, or null until detection has run. */
  hotspots: string | null;
  hotspots_sig: string | null;
}

export function promptFor(scenario: Scenario, room: Room, sceneStateId: string): string {
  const state = room.sceneStates.find((s) => s.id === sceneStateId) ?? room.sceneStates[0];
  const isDefault = state.id === room.sceneStates[0].id;
  return isDefault
    ? `Illustration for an escape-room adventure themed "${scenario.theme}". ${state.imagePrompt}. Cinematic, detailed, atmospheric, no text or lettering.`
    : `Edit this scene: ${state.imagePrompt}. Keep the same camera angle, layout, style and everything else unchanged.`;
}

const hash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);

/** Changes whenever a room gains, loses or relabels actions, so hotspots get re-detected. */
function hotspotSignature(scenario: Scenario, room: Room, version = "v3"): string {
  // "v2": detection also returns object names and descriptions. "v3": opening scenes missing an
  // object get one repaint. The model is part of it, so switching vision models re-detects.
  return hash(version + VISION_MODEL + JSON.stringify(scenario.actions.filter((a) => a.roomId === room.id).map((a) => [a.id, a.label])));
}

/** Actions a player must be able to find in a room's opening picture: those that don't wait on story flags. */
function mustBeVisible(scenario: Scenario, room: Room): Action[] {
  return scenario.actions.filter((a) => a.roomId === room.id && !a.requires?.flags?.length);
}

/** "Search the helm" -> "helm", "Go to the hold" -> "hold". */
export function objectOf(label: string): string {
  return label.replace(/^\s*\w+\s+/, "").replace(/^(?:(?:to|into|through|at|on|in|under|behind|inside|the|a|an)\s+)+/i, "").trim() || label;
}

export function imageRow(scenario: Scenario, roomId: string, sceneStateId: string): ImageRow | undefined {
  const room = scenario.rooms.find((r) => r.id === roomId);
  if (!room) return undefined;
  return db
    .prepare("SELECT * FROM images WHERE scenario_id = ? AND room_id = ? AND scene_state_id = ? AND prompt_hash = ?")
    .get(scenario.id, roomId, sceneStateId, hash(promptFor(scenario, room, sceneStateId))) as ImageRow | undefined;
}

export function imageHotspots(row: ImageRow | undefined): Hotspot[] {
  return row?.hotspots ? JSON.parse(row.hotspots) : [];
}

export function imageUrl(row: ImageRow | undefined): string | null {
  return row?.path && (row.status === "ready" || row.status === "placeholder") ? `/assets/images/${path.basename(row.path)}` : null;
}

/**
 * Renders every scene image for a scenario. Resolves when the opening room's default
 * scene is done; the rest keep rendering in the background.
 */
export async function renderScenario(scenario: Scenario): Promise<void> {
  const start = scenario.rooms.find((r) => r.id === scenario.startRoomId)!;
  await renderOne(scenario, start, start.sceneStates[0].id);
  // One worker per room at a time: a room's edits must wait for its default scene.
  const ordered = [start, ...scenario.rooms.filter((r) => r !== start)];
  void runPool(ordered, IMAGE_CONCURRENCY, async (room) => {
    for (const s of room.sceneStates) await renderOne(scenario, room, s.id);
  }).then(() => runPool(scenario.items, IMAGE_CONCURRENCY, (item) => renderItem(scenario, item)));
}

// ---- inventory item pictures ----

const ITEM_SIZE = 512;

function itemPrompt(scenario: Scenario, item: Item): string {
  return `Game inventory icon: ${item.name}. ${item.description}. One single object, centered, filling most of the frame, on a plain very dark background. Painterly adventure-game item art for a world themed "${scenario.theme}", soft rim light. No text, no border.`;
}

export function itemIconUrl(scenario: Scenario, item: Item): string | null {
  const row = db
    .prepare("SELECT status, path FROM item_icons WHERE scenario_id = ? AND item_id = ? AND prompt_hash = ?")
    .get(scenario.id, item.id, hash(itemPrompt(scenario, item))) as { status: ImageStatus; path: string | null } | undefined;
  return row?.status === "ready" && row.path ? `/assets/images/${path.basename(row.path)}` : null;
}

async function renderItem(scenario: Scenario, item: Item): Promise<void> {
  if (!fluxEnabled()) return; // the emoji icon is the fallback
  const prompt = itemPrompt(scenario, item);
  const key = [scenario.id, item.id, hash(prompt)];
  const existing = db.prepare("SELECT status FROM item_icons WHERE scenario_id = ? AND item_id = ? AND prompt_hash = ?").get(...key) as
    | { status: ImageStatus }
    | undefined;
  if (existing && existing.status !== "failed") return;

  const upsert = db.prepare(`INSERT INTO item_icons (scenario_id, item_id, prompt_hash, status, path, error) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (scenario_id, item_id, prompt_hash) DO UPDATE SET status = excluded.status, path = excluded.path, error = excluded.error`);
  upsert.run(...key, "rendering", null, null);
  try {
    const bytes = await fluxGenerate(prompt, undefined, { width: ITEM_SIZE, height: ITEM_SIZE });
    const file = path.join(IMAGES_DIR, `item_${key.join("_")}.jpg`);
    writeFileSync(file, bytes);
    upsert.run(...key, "ready", file, null);
  } catch (err) {
    upsert.run(...key, "failed", null, String(err instanceof Error ? err.message : err));
  }
}

async function renderOne(scenario: Scenario, room: Room, stateId: string): Promise<void> {
  const prompt = promptFor(scenario, room, stateId);
  const key = [scenario.id, room.id, stateId, hash(prompt)];
  const existing = imageRow(scenario, room.id, stateId);
  if (existing?.status === "ready") {
    if (existing.path && existing.hotspots_sig !== hotspotSignature(scenario, room)) await annotateFor(scenario, room, stateId, existing.path, key);
    return;
  }
  if (existing?.status === "rendering") return;
  if (existing?.status === "placeholder" && !fluxEnabled()) return;

  const upsert = db.prepare(`INSERT INTO images (scenario_id, room_id, scene_state_id, prompt_hash, status, path, error)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (scenario_id, room_id, scene_state_id, prompt_hash) DO UPDATE SET status = excluded.status, path = excluded.path, error = excluded.error`);

  if (!fluxEnabled()) {
    const file = path.join(IMAGES_DIR, `${key.join("_")}.svg`);
    writeFileSync(file, placeholderSvg(room, stateId));
    upsert.run(...key, "placeholder", file, null);
    return;
  }

  upsert.run(...key, "rendering", null, null);
  try {
    const isDefault = stateId === room.sceneStates[0].id;
    let reference: string | undefined;
    if (!isDefault) {
      // Edits start from the room's default scene so the layout stays consistent.
      const base = imageRow(scenario, room.id, room.sceneStates[0].id);
      if (base?.path && base.status === "ready") reference = readFileSync(base.path).toString("base64");
    }
    const bytes = await fluxGenerate(prompt, reference);
    const file = path.join(IMAGES_DIR, `${key.join("_")}.jpg`);
    writeFileSync(file, bytes);
    upsert.run(...key, "ready", file, null);
    await annotateFor(scenario, room, stateId, file, key);
  } catch (err) {
    upsert.run(...key, "failed", null, String(err instanceof Error ? err.message : err));
  }
}

/** The opening scene is awaited (a missing object gets painted in before the room's edits start from it); others run in the background. */
function annotateFor(scenario: Scenario, room: Room, stateId: string, file: string, key: string[]): Promise<void> {
  const job = annotate(scenario, room, file, key);
  return stateId === room.sceneStates[0].id ? job : Promise.resolve();
}

const annotating = new Map<string, Promise<void>>();

/** Finds clickable objects in a finished image. Failures leave the image playable by buttons. */
function annotate(scenario: Scenario, room: Room, file: string, key: string[]): Promise<void> {
  const id = key.join("/");
  if (!hotspotsEnabled()) return Promise.resolve();
  const running = annotating.get(id);
  if (running) return running;
  const job = detectAndStore(scenario, room, file, key, id);
  annotating.set(id, job);
  return job;
}

/** Waits until the opening scene has its clickable objects, so players enter a playable room. */
export async function ensureOpeningHotspots(scenario: Scenario): Promise<void> {
  const room = scenario.rooms.find((r) => r.id === scenario.startRoomId)!;
  const stateId = room.sceneStates[0].id;
  const row = imageRow(scenario, room.id, stateId);
  if (row?.status !== "ready" || !row.path || row.hotspots_sig === hotspotSignature(scenario, room)) return;
  await annotate(scenario, room, row.path, [scenario.id, room.id, stateId, row.prompt_hash]);
}

async function detectAndStore(scenario: Scenario, room: Room, file: string, key: string[], id: string): Promise<void> {
  const sig = hotspotSignature(scenario, room);
  const where = "WHERE scenario_id = ? AND room_id = ? AND scene_state_id = ? AND prompt_hash = ?";
  const prior = db.prepare(`SELECT hotspots, hotspots_sig FROM images ${where}`).get(...key) as Pick<ImageRow, "hotspots" | "hotspots_sig"> | undefined;
  let hotspots: Hotspot[] = [];
  try {
    // Scenes detected under v2 keep their hotspots; only the missing-object check is new.
    hotspots =
      prior?.hotspots && prior.hotspots !== "[]" && prior.hotspots_sig === hotspotSignature(scenario, room, "v2")
        ? JSON.parse(prior.hotspots)
        : await detectHotspots(scenario, room, file);
    if (key[2] === room.sceneStates[0].id) {
      const fixed = await paintMissing(scenario, room, file, key, hotspots);
      if (fixed) ({ file, hotspots } = fixed);
    }
  } catch (err) {
    console.error(`[hotspots] ${id}:`, err instanceof Error ? err.message : err);
  } finally {
    annotating.delete(id);
  }
  db.prepare(`UPDATE images SET path = ?, hotspots = ?, hotspots_sig = ? ${where}`).run(file, JSON.stringify(hotspots), sig, ...key);
}

/**
 * When an opening scene doesn't show an object one of its actions needs (the director forgot it in
 * the prompt, or FLUX left it out), paints it in with one FLUX edit and detects again. One attempt;
 * whatever is still missing stays reachable through its button.
 */
async function paintMissing(
  scenario: Scenario,
  room: Room,
  file: string,
  key: string[],
  hotspots: Hotspot[],
): Promise<{ file: string; hotspots: Hotspot[] } | null> {
  if (!fluxEnabled() || !file.endsWith(".jpg")) return null;
  const found = new Set(hotspots.map((h) => h.actionId));
  const missing = mustBeVisible(scenario, room).filter((a) => !found.has(a.id));
  if (!missing.length) return null;
  // Exits name their destination ("Climb to deck"), so paint the way there, not the place.
  const thing = (a: Action) => (a.effects.moveTo ? `way out (a door, ladder or hatch) leading to the ${objectOf(a.label)}` : objectOf(a.label));
  const objects = [...new Set(missing.map(thing))];
  console.log(`[hotspots] ${key.join("/")}: not in the picture: ${objects.join(", ")}; painting them in`);
  const prompt = `Edit this scene: add ${objects.map((o) => `a clearly visible ${o}`).join(", ")}, each placed naturally where a player would notice it, fitting the scene. Keep the same camera angle, layout, style and everything else unchanged. No text or lettering.`;
  const bytes = await fluxGenerate(prompt, readFileSync(file).toString("base64"));
  const next = file.replace(/\.jpg$/, "_fix.jpg");
  writeFileSync(next, bytes);
  const redetected = await detectHotspots(scenario, room, next);
  const still = mustBeVisible(scenario, room).filter((a) => !redetected.some((h) => h.actionId === a.id));
  if (still.length) console.log(`[hotspots] ${key.join("/")}: still not in the picture: ${still.map((a) => a.label).join(", ")}`);
  // Keep the repaint only if it found at least as many objects as before.
  return redetected.length >= hotspots.length ? { file: next, hotspots: redetected } : null;
}

const FLUX_FAILED = new Set(["Error", "Failed", "Content Moderated", "Request Moderated", "Task not found"]);

/** Clears renders that were interrupted by a server restart so they can run again. */
export function resetInterruptedRenders(): void {
  db.prepare("DELETE FROM images WHERE status = 'rendering'").run();
  db.prepare("DELETE FROM item_icons WHERE status = 'rendering'").run();
}

async function fluxGenerate(
  prompt: string,
  referenceBase64?: string,
  size: { width: number; height: number } = { width: IMAGE_WIDTH, height: IMAGE_HEIGHT },
): Promise<Buffer> {
  const res = await fetch(`https://api.bfl.ai/v1/${BFL_MODEL}`, {
    method: "POST",
    headers: { "x-key": BFL_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      width: size.width,
      height: size.height,
      ...(referenceBase64 ? { images: [referenceBase64] } : {}),
    }),
  });
  if (!res.ok) throw new Error(`FLUX submit ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const { polling_url } = (await res.json()) as { polling_url: string };

  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 500));
    const poll = await fetch(polling_url, { headers: { "x-key": BFL_API_KEY } });
    if (!poll.ok) throw new Error(`FLUX poll ${poll.status}`);
    const body = (await poll.json()) as { status: string; result?: { sample?: string } };
    if (body.status === "Ready" && body.result?.sample) {
      // Result URLs expire, so download right away and serve our own copy.
      const img = await fetch(body.result.sample);
      if (!img.ok) throw new Error(`FLUX download ${img.status}`);
      return Buffer.from(await img.arrayBuffer());
    }
    // In-progress statuses vary ("Pending", "Generating", ...), so only stop on known failures.
    if (FLUX_FAILED.has(body.status)) throw new Error(`FLUX status: ${body.status}`);
  }
  throw new Error("FLUX timed out after 90 s");
}

async function runPool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: Math.min(limit, queue.length) }, async () => {
      while (queue.length) await fn(queue.shift()!);
    }),
  );
}

function placeholderSvg(room: Room, stateId: string): string {
  const hue = parseInt(hash(room.id).slice(0, 4), 16) % 360;
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  const label = stateId === room.sceneStates[0].id ? "" : stateId.replaceAll("_", " ");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${IMAGE_WIDTH}" height="${IMAGE_HEIGHT}" viewBox="0 0 ${IMAGE_WIDTH} ${IMAGE_HEIGHT}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="hsl(${hue} 60% 18%)"/><stop offset="1" stop-color="hsl(${(hue + 60) % 360} 70% 8%)"/>
  </linearGradient></defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <text x="50%" y="46%" text-anchor="middle" font-family="system-ui, sans-serif" font-size="56" fill="hsl(${hue} 80% 80%)">${esc(room.name)}</text>
  <text x="50%" y="58%" text-anchor="middle" font-family="system-ui, sans-serif" font-size="26" fill="hsl(${hue} 50% 65%)">${esc(label || "placeholder scene")}</text>
</svg>`;
}
