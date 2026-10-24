import { useState } from "react";
import type { SessionView } from "../../shared/schema.ts";

type Item = SessionView["inventory"][number];

interface Props {
  items: Item[];
  /** Items picked up by the last action; they glow briefly. */
  newItems: string[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  slots: number;
}

/** Floating hotbar: click an item to select it, then click an object in the room to use it. */
export function Inventory({ items, newItems, selected, onSelect, slots }: Props) {
  const [peek, setPeek] = useState<string | null>(null);
  const empty = Math.max(0, slots - items.length);
  const peeked = items.find((i) => i.id === peek);
  const chosen = items.find((i) => i.id === selected);

  return (
    <section className="dock" aria-label="Inventory">
      {chosen && (
        <p className="dock-banner" role="status">
          <strong>{chosen.name}</strong> selected · Choose an object to use it on
          <button type="button" className="text-btn" onClick={() => onSelect(null)}>
            Cancel
          </button>
        </p>
      )}
      <ul className="dock-slots">
        {items.map((i) => (
          <li key={i.id} className="dock-cell">
            <button
              type="button"
              data-item-id={i.id}
              className={`slot ${newItems.includes(i.id) ? "new" : ""} ${selected === i.id ? "selected" : ""}`}
              aria-pressed={selected === i.id}
              aria-label={`${i.name}. ${i.description}`}
              onClick={() => onSelect(selected === i.id ? null : i.id)}
              onMouseEnter={() => setPeek(i.id)}
              onMouseLeave={() => setPeek(null)}
              onFocus={() => setPeek(i.id)}
              onBlur={() => setPeek(null)}
            >
              {i.imageUrl ? <img src={i.imageUrl} alt="" /> : <span className="slot-glyph" aria-hidden>{i.icon ?? "◆"}</span>}
            </button>
            {peeked?.id === i.id && (
              <div className="slot-tip" aria-hidden>
                <strong>{i.name}</strong>
                <span>{i.description}</span>
              </div>
            )}
          </li>
        ))}
        {Array.from({ length: empty }, (_, n) => (
          <li key={`empty-${n}`} className="dock-cell" aria-hidden>
            <span className="slot empty" />
          </li>
        ))}
      </ul>
    </section>
  );
}
