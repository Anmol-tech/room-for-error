// Tiny synthesized sound effects (no audio files). Muted state persists per browser.
const KEY = "rfe-muted";

let ctx: AudioContext | null = null;
let muted = (() => {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
})();

export const isMuted = () => muted;

// Kane's test sessions are always silent, whatever the player's own setting.
let silenced = false;
export function setSilenced(value: boolean) {
  silenced = value;
}

export function setMuted(value: boolean) {
  muted = value;
  try {
    localStorage.setItem(KEY, value ? "1" : "0");
  } catch {
    // storage unavailable: keep the in-memory setting
  }
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = "sine", gain = 0.08) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t = ctx.currentTime + start;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

const SOUNDS = {
  click: () => tone(660, 0, 0.06, "triangle", 0.05),
  key: () => tone(880, 0, 0.05, "square", 0.025),
  success: () => [523, 659, 784].forEach((f, i) => tone(f, i * 0.07, 0.25, "triangle")),
  pickup: () => [784, 1175].forEach((f, i) => tone(f, i * 0.08, 0.3, "sine", 0.07)),
  error: () => [220, 165].forEach((f, i) => tone(f, i * 0.09, 0.18, "sawtooth", 0.04)),
  move: () => [330, 440, 554].forEach((f, i) => tone(f, i * 0.05, 0.35, "sine", 0.05)),
  win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.11, 0.5, "triangle", 0.07)),
};

export type Sound = keyof typeof SOUNDS;

export function play(sound: Sound) {
  if (muted || silenced) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    SOUNDS[sound]();
  } catch {
    // audio unavailable: play silently
  }
}
