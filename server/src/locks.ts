// Mechanism locks (symbol wheels, switch panels, torn notes) on top of the plain code lock.
// Every kind is still one answer string, so the engine, validator, hints and repairs treat them alike.
import { createHash } from "node:crypto";
import type { Action, ActionView } from "../../shared/schema.ts";

const split = (s: string, sep: RegExp) => s.split(sep).map((p) => p.trim()).filter(Boolean);
export const answerParts = (input: NonNullable<Action["input"]>): string[] =>
  input.kind === "order" ? split(input.answer, /\s*\|\s*/) : input.kind === "code" ? [input.answer] : split(input.answer, /\s*,\s*/);

/** What's wrong with a lock's definition, or null. */
export function lockProblem(action: Action): string | null {
  const input = action.input;
  if (!input) return null;
  const parts = answerParts(input);
  const options = (input.options ?? []).map((o) => o.toLowerCase());
  switch (input.kind) {
    case "code":
      return input.answer.trim() ? null : "has an empty code";
    case "symbols":
      if (options.length < 3) return "needs at least 3 symbols in options";
      if (parts.length < 2 || parts.length > 5) return "needs 2–5 wheels (comma-separated answer)";
      return parts.every((p) => options.includes(p.toLowerCase())) ? null : "answer uses a symbol that isn't in options";
    case "switches":
      if (options.length < 2 || options.length > 6) return "needs 2–6 switches in options";
      if (parts.length !== options.length) return "answer needs one on/off per switch";
      if (!parts.every((p) => /^(on|off)$/i.test(p))) return 'answer must be "on" or "off" per switch';
      return parts.some((p) => /^on$/i.test(p)) ? null : "at least one switch must be on";
    case "order":
      if (parts.length < 3 || parts.length > 6) return 'needs 3–6 fragments joined by " | "';
      return new Set(parts.map((p) => p.toLowerCase())).size === parts.length ? null : "fragments must all differ";
  }
}

/** The control's details for the browser. Never includes the answer (order fragments are shuffled). */
export function lockView(action: Action): Pick<ActionView, "inputKind" | "inputOptions" | "inputSlots"> {
  const input = action.input;
  if (!input) return {};
  switch (input.kind) {
    case "code":
      return { inputKind: "code" };
    case "symbols":
      return { inputKind: "symbols", inputOptions: input.options ?? [], inputSlots: answerParts(input).length };
    case "switches":
      return { inputKind: "switches", inputOptions: input.options ?? [] };
    case "order":
      return { inputKind: "order", inputOptions: shuffled(answerParts(input), action.id) };
  }
}

/** A stable shuffle that never returns the solved order. */
function shuffled(parts: string[], seed: string): string[] {
  const keyed = parts.map((p) => ({ p, k: createHash("sha256").update(seed + p).digest("hex") }));
  const out = keyed.sort((a, b) => (a.k < b.k ? -1 : 1)).map((x) => x.p);
  return out.every((p, i) => p === parts[i]) ? [...out.slice(1), out[0]] : out;
}
