import type { Hotspot } from "../../shared/schema.ts";

/** How a lock looks, chosen from what it is and where it is. */
export type LockSkin = "terminal" | "industrial" | "stone" | "brass" | "wood" | "plain";

// First match wins, so the lock's own name decides before the room around it.
const RULES: [LockSkin, RegExp][] = [
  ["terminal", /terminal|console|screen|monitor|computer|hologra|digital|scanner|airlock|cyber|neon|laser|android|robot|starship|spaceship|moon|orbit|data/],
  ["industrial", /breaker|switch|fuse|valve|pump|generator|boiler|pipe|power|turbine|electric|factory|bunker|reactor|control panel|substation|engine room/],
  ["stone", /stone|sundial|tomb|crypt|altar|temple|statue|carv|rune|obelisk|pyramid|ruin|cave|marble|grave|idol|shrine/],
  ["brass", /brass|ship|clock|gear|steam|safe|vault|compass|sextant|lighthouse|submarine|telescope|observatory|bottle|pirate|captain|helm|bell/],
  ["wood", /chest|shed|cabin|crate|drawer|desk|wood|barn|garden|attic|trunk|box|journal|library|book|cottage|cupboard|cabinet|seed/],
];

/** Picks a skin from the lock's object name, then its prompt, then the room. */
export function lockSkin(...texts: (string | null | undefined)[]): LockSkin {
  for (const text of texts) {
    const t = (text ?? "").toLowerCase();
    if (!t) continue;
    for (const [skin, re] of RULES) if (re.test(t)) return skin;
  }
  return "plain";
}

const RATIO = 2.2; // close-up width : height, so tall objects don't push the controls off screen

/**
 * A close-up of the lock cut from the room's own picture: the object's box, widened to a strip and
 * zoomed with background sizing, so the dialog feels like stepping up to that object.
 */
export function LockCloseup({ url, spot }: { url: string; spot: Hotspot }) {
  // Work in image units (16 × 9) so the crop keeps the picture's proportions.
  let pw = spot.w * 16 * 1.3;
  let ph = spot.h * 9 * 1.3;
  if (pw / ph < RATIO) pw = ph * RATIO;
  else ph = pw / RATIO;
  if (pw > 16) [pw, ph] = [16, 16 / RATIO];
  if (ph > 9) [pw, ph] = [9 * RATIO, 9];
  const w = pw / 16;
  const h = ph / 9;
  const cx = spot.x + spot.w / 2;
  const cy = spot.y + spot.h / 2;
  const x = Math.min(Math.max(cx - w / 2, 0), 1 - w);
  const y = Math.min(Math.max(cy - h / 2, 0), 1 - h);
  return (
    <div
      className="lock-closeup"
      aria-hidden
      style={{
        aspectRatio: `${pw / ph}`,
        backgroundImage: `url(${url})`,
        backgroundSize: `${100 / w}% ${100 / h}%`,
        backgroundPosition: `${w < 1 ? (x / (1 - w)) * 100 : 0}% ${h < 1 ? (y / (1 - h)) * 100 : 0}%`,
      }}
    />
  );
}
