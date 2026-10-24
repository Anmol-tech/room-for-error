// Player preferences kept in this browser. Everything here is optional comfort, never game state.
import { useSyncExternalStore } from "react";

export type NarrationSpeed = "slow" | "normal" | "fast" | "instant";

export interface Settings {
  hints: boolean;
  narration: NarrationSpeed;
}

const KEY = "rfe-settings";
const reducedMotion = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const DEFAULTS: Settings = { hints: false, narration: reducedMotion ? "instant" : "normal" };

let current: Settings = (() => {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return DEFAULTS;
  }
})();
const listeners = new Set<() => void>();

export function updateSettings(patch: Partial<Settings>) {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // storage unavailable: keep the in-memory settings
  }
  listeners.forEach((l) => l());
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}

/** Milliseconds per character for the narration typewriter. */
export const CHAR_MS: Record<NarrationSpeed, number> = { slow: 38, normal: 20, fast: 9, instant: 0 };
