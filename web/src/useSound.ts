import { useState } from "react";
import { isMuted, setMuted } from "./sound.ts";

/** Sound on/off shared by every screen (the setting itself lives in sound.ts). */
export function useSound(): [boolean, () => void] {
  const [muted, set] = useState(isMuted);
  return [
    muted,
    () => {
      setMuted(!muted);
      set(!muted);
    },
  ];
}
