// Clues become inventory notes: when an action's text reveals a code for a lock, that action
// also gives the player a note with the clue, so it can be re-read later. Derived from the
// scenario on every read, so repairs that change a clue change the note too.
import type { Action, Item, Scenario } from "../../shared/schema.ts";

const NOTE_PREFIX = "note_";
const compact = (s: string) => s.toLowerCase().replace(/[\s\-.]/g, "");

/** The clue text inside a narrative: the quoted part that holds the code, else its sentence. */
function clueText(narrative: string, code: string): string {
  for (const m of narrative.matchAll(/["“]([^"”]+)["”]/g)) {
    if (compact(m[1]).includes(code) || hasCodeLike(m[1], code.length)) return `“${m[1].trim()}”`;
  }
  const sentences = narrative.split(/(?<=[.!?])\s+/);
  return sentences.find((s) => compact(s).includes(code) || hasCodeLike(s, code.length))?.trim() ?? narrative;
}

/** A run of `length` digits (dashes or spaces allowed between them), as clues usually write codes. */
function hasCodeLike(text: string, length: number): boolean {
  return new RegExp(`(?<![\\d])\\d(?:[\\s-]?\\d){${length - 1}}(?![\\d])`).test(text);
}

/** The action whose text reveals the code for `lock`: it states the answer, or failing that a code of the same length. */
function clueAction(scenario: Scenario, lock: Action): Action | undefined {
  const input = lock.input!;
  const others = scenario.actions.filter((a) => a !== lock && !a.input);
  // Torn notes are their own clue; "on"/"off" appear in almost any text, so switch clues aren't guessed.
  if (input.kind === "order" || input.kind === "switches") return undefined;
  if (input.kind !== "code") {
    // A symbol or switch clue names every part of the answer, in order.
    const parts = input.answer.split(",").map((p) => p.trim().toLowerCase());
    return others.find((a) => {
      const text = a.narrative.toLowerCase();
      let at = 0;
      return parts.every((p) => (at = text.indexOf(p, at)) >= 0 && (at += p.length) > 0);
    });
  }
  const code = compact(input.answer);
  return (
    others.find((a) => compact(a.narrative).includes(code)) ??
    (/^\d+$/.test(code) ? others.find((a) => hasCodeLike(a.narrative, code.length)) : undefined)
  );
}

export const isNote = (id: string) => id.startsWith(NOTE_PREFIX);

/** The action that gives a note, in a scenario returned by withNotes. */
export const noteSource = (scenario: Scenario, noteId: string): Action | undefined =>
  scenario.actions.find((a) => a.effects.addItems?.includes(noteId));

export function withNotes(scenario: Scenario): Scenario {
  const locks = scenario.actions.filter((a) => a.input);
  if (!locks.length) return scenario;

  const items: Item[] = [...scenario.items];
  const actions = scenario.actions.map((a) => ({ ...a, effects: { ...a.effects } }));
  const many = locks.length > 1;

  locks.forEach((lock, i) => {
    const source = clueAction(scenario, lock);
    if (!source) return;
    const id = `${NOTE_PREFIX}${lock.id}`;
    if (items.some((it) => it.id === id)) return;
    items.push({
      id,
      name: many ? `Note ${i + 1}` : "Note",
      description: lock.input!.kind === "code" ? clueText(source.narrative, compact(lock.input!.answer)) : source.narrative,
      consumable: false,
      icon: "📝",
    });
    const giver = actions.find((a) => a.id === source.id)!;
    giver.effects.addItems = [...(giver.effects.addItems ?? []), id];
  });

  return { ...scenario, items, actions };
}

/** Removes derived notes, so stored scenarios (and repairs) never carry a stale copy of a clue. */
export function withoutNotes(scenario: Scenario): Scenario {
  return {
    ...scenario,
    items: scenario.items.filter((i) => !isNote(i.id)),
    actions: scenario.actions.map((a) => {
      if (!a.effects.addItems?.some(isNote)) return a;
      const addItems = a.effects.addItems.filter((i) => !isNote(i));
      const { addItems: _, ...rest } = a.effects;
      return { ...a, effects: addItems.length ? { ...rest, addItems } : rest };
    }),
  };
}
