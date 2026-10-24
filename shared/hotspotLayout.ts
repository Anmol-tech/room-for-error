// Arranges hotspots so every action stays clickable. Boxes that cover the same object are merged
// into one spot that offers a small menu; then smaller spots sit on top of larger ones, and each
// marker goes where no smaller spot covers it.
import type { Hotspot } from "./schema.ts";

export interface PlacedHotspot {
  /** One action, or several when they share an object (the spot then opens a menu). */
  actionIds: string[];
  /** Object name and look from the vision model, when known. */
  object?: string;
  look?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Stacking order: higher draws on top. Smaller areas get higher values. */
  layer: number;
  /** Marker position inside the spot, as fractions (0–1) of its own width and height. */
  markerX: number;
  markerY: number;
}

const GRID = 9;
/** Boxes overlapping at least this much (intersection over union) are treated as one object. */
const SAME_OBJECT = 0.6;

type Box = Pick<PlacedHotspot, "x" | "y" | "w" | "h">;

export function layoutHotspots(hotspots: Hotspot[]): PlacedHotspot[] {
  const groups = mergeSameObject(hotspots);
  const byAreaDesc = [...groups].sort((a, b) => b.w * b.h - a.w * a.h);
  return byAreaDesc.map((g, layer) => {
    const above = byAreaDesc.slice(layer + 1); // smaller spots drawn over this one
    const [markerX, markerY] = freeSpot(g, above);
    return { ...g, layer, markerX, markerY };
  });
}

function mergeSameObject(hotspots: Hotspot[]): Omit<PlacedHotspot, "layer" | "markerX" | "markerY">[] {
  const groups: { actionIds: string[]; box: Box; object?: string; look?: string }[] = [];
  const name = (s?: string) => s?.toLowerCase().replace(/^the\s+/, "").trim();
  for (const h of hotspots) {
    // Same object: boxes nearly coincide, or the vision model named the same overlapping object.
    const match = groups.find(
      (g) => iou(g.box, h) >= SAME_OBJECT || (!!h.object && name(g.object) === name(h.object) && iou(g.box, h) > 0),
    );
    if (match) {
      match.actionIds.push(h.actionId);
      match.box = union(match.box, h);
      match.object ??= h.object;
      match.look ??= h.look;
    } else {
      groups.push({ actionIds: [h.actionId], box: { x: h.x, y: h.y, w: h.w, h: h.h }, object: h.object, look: h.look });
    }
  }
  return groups.map((g) => ({ actionIds: g.actionIds, ...g.box, ...(g.object ? { object: g.object } : {}), ...(g.look ? { look: g.look } : {}) }));
}

function iou(a: Box, b: Box): number {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const inter = ix * iy;
  return inter / (a.w * a.h + b.w * b.h - inter);
}

function union(a: Box, b: Box): Box {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

/** The free point closest to the centre, sampled on a grid; the centre if nothing is free. */
function freeSpot(h: Box, above: Box[]): [number, number] {
  const covered = (px: number, py: number) => above.some((o) => px >= o.x && px <= o.x + o.w && py >= o.y && py <= o.y + o.h);
  let best: [number, number] = [0.5, 0.5];
  let bestDist = Infinity;
  for (let i = 0; i < GRID; i++) {
    for (let j = 0; j < GRID; j++) {
      const fx = (i + 0.5) / GRID;
      const fy = (j + 0.5) / GRID;
      if (covered(h.x + fx * h.w, h.y + fy * h.h)) continue;
      const d = (fx - 0.5) ** 2 + (fy - 0.5) ** 2;
      if (d < bestDist) {
        bestDist = d;
        best = [fx, fy];
      }
    }
  }
  return best;
}

/** True when the spot's marker can be clicked without hitting a spot drawn above it. */
export function isReachable(target: PlacedHotspot, all: PlacedHotspot[]): boolean {
  const above = all.filter((o) => o.layer > target.layer);
  const px = target.x + target.markerX * target.w;
  const py = target.y + target.markerY * target.h;
  return !above.some((o) => px >= o.x && px <= o.x + o.w && py >= o.y && py <= o.y + o.h);
}
