import { useEffect, useRef, useState, type ReactNode, type Ref } from "react";
import { layoutHotspots, type PlacedHotspot } from "../../shared/hotspotLayout.ts";
import type { ActionView, Hotspot, SessionView } from "../../shared/schema.ts";

type Item = SessionView["inventory"][number];

interface Props {
  url: string | null;
  alt: string;
  hotspots: Hotspot[];
  actions: ActionView[];
  disabled: boolean;
  /** Hints on: amber markers and outlines. Off: only cursor feedback and a name on hover. */
  showHints: boolean;
  selectedItem: Item | null;
  onAction: (action: ActionView) => void;
  /** Use the selected item on the object at this spot. */
  onUse: (actionIds: string[]) => void;
  /** Overlays drawn on top of the picture: transitions, keypad, ending, toasts. */
  children?: ReactNode;
}

/**
 * The room canvas: the whole 16:9 illustration with clickable objects. Clicking an object opens
 * a small inspection panel beside it; with an item selected, clicking uses the item instead.
 * Objects are real buttons, so the room can be explored by keyboard too.
 */
export function Scene({ url, alt, hotspots, actions, disabled, showHints, selectedItem, onAction, onUse, children }: Props) {
  const [layers, setLayers] = useState<{ url: string; key: number }[]>([]);
  const [inspecting, setInspecting] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

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
  const current = layers.at(-1)?.url;
  const spots = current === url ? layoutHotspots(hotspots) : [];
  const keyOf = (s: PlacedHotspot) => s.actionIds.join();
  const open = spots.find((s) => keyOf(s) === inspecting) ?? null;

  function pick(spot: PlacedHotspot) {
    if (selectedItem) onUse(spot.actionIds);
    else setInspecting((cur) => (cur === keyOf(spot) ? null : keyOf(spot)));
  }

  return (
    <figure className="canvas" onClick={(e) => e.target === e.currentTarget && setInspecting(null)}>
      {layers.length === 0 && (
        <div className="canvas-wait">
          <span className="spinner" aria-hidden /> Painting the scene…
        </div>
      )}
      {layers.map((l, i) => (
        <img key={l.key} src={l.url} alt={i === layers.length - 1 ? alt : ""} className={i === layers.length - 1 ? "front" : "back"} />
      ))}
      <div className="canvas-vignette" aria-hidden />

      <div className={`spots ${showHints ? "hinted" : ""} ${selectedItem ? "using" : ""}`}>
        {spots.map((spot) => {
          const spotActions = spot.actionIds.map((id) => byId.get(id)).filter((a): a is ActionView => !!a);
          if (!spotActions.length) return null;
          const name = spot.object ?? spotActions[0].label;
          const label = selectedItem ? `Use ${selectedItem.name} on ${name.toLowerCase()}` : name;
          return (
            <button
              key={keyOf(spot)}
              type="button"
              className={`spot ${inspecting === keyOf(spot) ? "active" : ""}`}
              style={{ left: `${spot.x * 100}%`, top: `${spot.y * 100}%`, width: `${spot.w * 100}%`, height: `${spot.h * 100}%`, zIndex: 1 + spot.layer }}
              aria-label={label}
              disabled={disabled}
              onClick={() => pick(spot)}
            >
              {showHints && <span className="spot-mark" style={{ left: `${spot.markerX * 100}%`, top: `${spot.markerY * 100}%` }} aria-hidden />}
              <span className={`spot-name ${spot.y < 0.15 ? "below" : ""}`} style={{ left: `${spot.markerX * 100}%` }} aria-hidden>
                {label}
              </span>
            </button>
          );
        })}
      </div>

      {open && (
        <InspectPanel
          ref={panelRef}
          spot={open}
          actions={open.actionIds.map((id) => byId.get(id)).filter((a): a is ActionView => !!a)}
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
  showHints: boolean;
  disabled: boolean;
  onAction: (a: ActionView) => void;
  onClose: () => void;
  ref: Ref<HTMLDivElement>;
}

/** Small panel anchored beside the object, flipped and clamped to stay inside the canvas. */
function InspectPanel({ spot, actions, showHints, disabled, onAction, onClose, ref }: PanelProps) {
  const mx = spot.x + spot.markerX * spot.w;
  const my = spot.y + spot.markerY * spot.h;
  const flip = mx > 0.55;
  const top = Math.min(Math.max(my - 0.12, 0.05), 0.5);
  const title = spot.object ?? actions[0].label;

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
      <div className="inspect-actions">
        {actions.map((a) => (
          <button key={a.id} type="button" data-action-id={a.id} disabled={disabled} onClick={() => onAction(a)}>
            <span>{a.label}</span>
            {showHints && a.locked && <span className="tag-lock">Locked</span>}
            {a.inputPrompt && !a.locked && <span className="tag-code">Code</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
