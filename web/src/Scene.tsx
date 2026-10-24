import { useEffect, useRef, useState, type ReactNode, type Ref } from "react";
import { layoutHotspots, type PlacedHotspot } from "../../shared/hotspotLayout.ts";
import type { ActionView, Hotspot, SessionView } from "../../shared/schema.ts";
import { ITEM_DRAG_TYPE } from "./Inventory.tsx";
import { Atmosphere } from "./Atmosphere.tsx";
import { LOCK_TAG } from "./Mechanism.tsx";
import type { Mood } from "./music.ts";

type Item = SessionView["inventory"][number];

interface Props {
  url: string | null;
  alt: string;
  hotspots: Hotspot[];
  actions: ActionView[];
  /** Done one-time actions: their objects stay clickable to re-read what happened, marked solved. */
  solved: SessionView["solved"];
  disabled: boolean;
  /** Hints on: amber markers and outlines. Off: only cursor feedback and a name on hover. */
  showHints: boolean;
  selectedItem: Item | null;
  onAction: (action: ActionView) => void;
  /** Use an item (the selected one, or one dropped here) on the object at this spot. */
  onUse: (actionIds: string[], itemId?: string) => void;
  /** Drops the selected item (right click or Escape over the scene). */
  onCancelUse: () => void;
  /** The last action's object glows on success and shakes on failure; `key` replays it. */
  pulse: { actionIds: string[]; ok: boolean; key: number; item?: { imageUrl: string | null; icon: string | null } } | null;
  /** Mood for a living scene (camera drift and particles); null keeps the picture still, e.g. for Kane. */
  atmosphere: Mood | null;
  /** Overlays drawn on top of the picture: transitions, keypad, ending, toasts. */
  children?: ReactNode;
}

/**
 * The room canvas: the whole 16:9 illustration with clickable objects. Clicking an object opens
 * a small inspection panel beside it; with an item selected, clicking uses the item instead.
 * Objects are real buttons, so the room can be explored by keyboard too.
 */
export function Scene({ url, alt, hotspots, actions, solved, atmosphere, disabled, showHints, selectedItem, onAction, onUse, onCancelUse, pulse, children }: Props) {
  const [layers, setLayers] = useState<{ url: string; key: number }[]>([]);
  const [inspecting, setInspecting] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // Where the selected item follows the pointer, as fractions of the canvas.
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!selectedItem) return setPointer(null);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancelUse();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedItem, onCancelUse]);

  useEffect(() => {
    if (!url) return;
    setLayers((prev) => (prev.at(-1)?.url === url ? prev : [...prev.slice(-1), { url, key: Date.now() }]));
  }, [url]);

  // Drop the old layer once the new one has faded in.
  useEffect(() => {
    if (layers.length < 2) return;
    const t = setTimeout(() => setLayers((prev) => prev.slice(-1)), 700);
    return () => clearTimeout(t);
  }, [layers]);

  // A changed room or set of actions closes the inspection panel.
  useEffect(() => setInspecting(null), [url, actions]);

  useEffect(() => {
    if (!inspecting) return;
    panelRef.current?.querySelector("button")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setInspecting(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [inspecting]);

  const byId = new Map(actions.map((a) => [a.id, a]));
  const doneById = new Map(solved.map((d) => [d.actionId, d]));
  const current = layers.at(-1)?.url;
  const spots = current === url ? layoutHotspots(hotspots) : [];
  const keyOf = (s: PlacedHotspot) => s.actionIds.join();
  const open = spots.find((s) => keyOf(s) === inspecting) ?? null;
  // The spotlit object: a drop target, the one under the pointer or keyboard focus, else the one being inspected.
  const lit = spots.find((s) => keyOf(s) === dropTarget) ?? spots.find((s) => keyOf(s) === hovered) ?? open;

  function pick(spot: PlacedHotspot) {
    if (selectedItem) onUse(spot.actionIds);
    else setInspecting((cur) => (cur === keyOf(spot) ? null : keyOf(spot)));
  }

  return (
    <figure
      className={`canvas ${selectedItem ? "using" : ""}`}
      onClick={(e) => e.target === e.currentTarget && setInspecting(null)}
      onPointerMove={(e) => {
        if (!selectedItem || e.pointerType !== "mouse") return;
        const r = e.currentTarget.getBoundingClientRect();
        setPointer({ x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height });
      }}
      onPointerLeave={() => setPointer(null)}
      onContextMenu={(e) => {
        if (!selectedItem) return;
        e.preventDefault();
        onCancelUse();
      }}
    >
      {layers.length === 0 && (
        <div className="canvas-wait">
          <span className="spinner" aria-hidden /> Painting the scene…
        </div>
      )}
      {/* The picture, spotlight and objects drift together, so hotspots stay on their objects. */}
      <div className={`scene-stage ${atmosphere ? "" : "still"}`}>
      {layers.map((l, i) => (
        <img key={l.key} src={l.url} alt={i === layers.length - 1 ? alt : ""} className={i === layers.length - 1 ? "front" : "back"} />
      ))}
      <div className="canvas-vignette" aria-hidden />

      {/* Spotlight: dims the scene around the hovered object (an SVG mask with a cut-out). */}
      <svg className={`spotlight ${lit ? "on" : ""}`} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        <defs>
          <mask id="spotlight-mask">
            <rect width="100" height="100" fill="white" />
            {lit && <rect x={lit.x * 100} y={lit.y * 100} width={lit.w * 100} height={lit.h * 100} rx="1.2" fill="black" />}
          </mask>
        </defs>
        <rect width="100" height="100" fill="rgba(8, 8, 10, 0.55)" mask="url(#spotlight-mask)" />
      </svg>

      <div className={`spots ${showHints ? "hinted" : ""} ${selectedItem ? "using" : ""}`}>
        {spots.map((spot) => {
          const spotActions = spot.actionIds.map((id) => byId.get(id)).filter((a): a is ActionView => !!a);
          const spotDone = spot.actionIds.filter((id) => doneById.has(id));
          if (!spotActions.length && !spotDone.length) return null;
          const isDone = !spotActions.length;
          const name = spot.object ?? spotActions[0]?.label ?? doneById.get(spotDone[0])!.label;
          const label = selectedItem ? `Use ${selectedItem.name} on ${name.toLowerCase()}` : isDone ? `${name} (solved)` : name;
          const pulsed = pulse && spot.actionIds.some((id) => pulse.actionIds.includes(id));
          return (
            <button
              key={pulsed ? `${keyOf(spot)}#${pulse.key}` : keyOf(spot)}
              type="button"
              className={`spot ${isDone ? "done" : ""} ${dropTarget === keyOf(spot) ? "drop" : ""} ${inspecting === keyOf(spot) ? "active" : ""} ${pulsed ? (pulse.ok ? "pulse-ok" : "pulse-fail") : ""}`}
              style={{ left: `${spot.x * 100}%`, top: `${spot.y * 100}%`, width: `${spot.w * 100}%`, height: `${spot.h * 100}%`, zIndex: 1 + spot.layer }}
              aria-label={label}
              disabled={disabled}
              onClick={() => pick(spot)}
              onDragOver={(e) => {
                if (!e.dataTransfer.types.includes(ITEM_DRAG_TYPE)) return;
                e.preventDefault();
                setDropTarget(keyOf(spot));
              }}
              onDragLeave={() => setDropTarget((d) => (d === keyOf(spot) ? null : d))}
              onDrop={(e) => {
                const itemId = e.dataTransfer.getData(ITEM_DRAG_TYPE);
                setDropTarget(null);
                if (!itemId) return;
                e.preventDefault();
                onUse(spot.actionIds, itemId);
              }}
              onMouseEnter={() => setHovered(keyOf(spot))}
              onMouseLeave={() => setHovered((h) => (h === keyOf(spot) ? null : h))}
              onFocus={() => setHovered(keyOf(spot))}
              onBlur={() => setHovered((h) => (h === keyOf(spot) ? null : h))}
            >
              {pulsed && pulse.ok && pulse.item && (
                <span className="place-item" aria-hidden>
                  {pulse.item.imageUrl ? <img src={pulse.item.imageUrl} alt="" /> : <span>{pulse.item.icon ?? "◆"}</span>}
                </span>
              )}
              {showHints && <span className="spot-mark" style={{ left: `${spot.markerX * 100}%`, top: `${spot.markerY * 100}%` }} aria-hidden />}
              <span className={`spot-name ${spot.y < 0.15 ? "below" : ""}`} style={{ left: `${spot.markerX * 100}%` }} aria-hidden>
                {label}
              </span>
            </button>
          );
        })}
      </div>

      </div>
      {atmosphere && current && <Atmosphere mood={atmosphere} />}

      {selectedItem && pointer && (
        <div className="cursor-item" style={{ left: `${pointer.x * 100}%`, top: `${pointer.y * 100}%` }} aria-hidden>
          {selectedItem.imageUrl ? <img src={selectedItem.imageUrl} alt="" /> : <span>{selectedItem.icon ?? "◆"}</span>}
          <em>
            {lit ? `Use ${selectedItem.name} on ${(lit.object ?? byId.get(lit.actionIds[0])?.label ?? "this").toLowerCase()}` : `Use ${selectedItem.name} on…`}
          </em>
        </div>
      )}

      {open && (
        <InspectPanel
          ref={panelRef}
          spot={open}
          actions={open.actionIds.map((id) => byId.get(id)).filter((a): a is ActionView => !!a)}
          done={open.actionIds.map((id) => doneById.get(id)).filter((d): d is SessionView["solved"][number] => !!d)}
          showHints={showHints}
          disabled={disabled}
          onAction={(a) => {
            setInspecting(null);
            onAction(a);
          }}
          onClose={() => setInspecting(null)}
        />
      )}

      {children}
    </figure>
  );
}

interface PanelProps {
  spot: PlacedHotspot;
  actions: ActionView[];
  done: SessionView["solved"];
  showHints: boolean;
  disabled: boolean;
  onAction: (a: ActionView) => void;
  onClose: () => void;
  ref: Ref<HTMLDivElement>;
}

/** Small panel anchored beside the object, flipped and clamped to stay inside the canvas. */
function InspectPanel({ spot, actions, done, showHints, disabled, onAction, onClose, ref }: PanelProps) {
  const mx = spot.x + spot.markerX * spot.w;
  const my = spot.y + spot.markerY * spot.h;
  const flip = mx > 0.55;
  const top = Math.min(Math.max(my - 0.12, 0.05), 0.5);
  const title = spot.object ?? actions[0]?.label ?? done[0]?.label ?? "";

  return (
    <div
      ref={ref}
      className={`inspect ${flip ? "flip" : ""}`}
      style={{ top: `${top * 100}%`, ...(flip ? { right: `${(1 - mx) * 100 + 2}%` } : { left: `${mx * 100 + 2}%` }) }}
      role="dialog"
      aria-label={title}
    >
      <div className="inspect-head">
        <h3>{title}</h3>
        <button type="button" className="inspect-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      {spot.look && <p className="inspect-look">{spot.look}</p>}
      {done.map((d) => (
        <div key={d.actionId} className="inspect-done">
          <p className="inspect-done-label">✓ {d.label}</p>
          <p className="inspect-done-text">{d.narrative}</p>
        </div>
      ))}
      <div className="inspect-actions">
        {actions.map((a) => (
          <button key={a.id} type="button" data-action-id={a.id} disabled={disabled} onClick={() => onAction(a)}>
            <span>{a.label}</span>
            {showHints && a.locked && <span className="tag-lock">Locked</span>}
            {a.inputPrompt && !a.locked && <span className="tag-code">{LOCK_TAG[a.inputKind ?? "code"]}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
