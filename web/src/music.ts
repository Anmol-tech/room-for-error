// Theme music, synthesized live with Web Audio (no audio files). A mood is picked from the room's
// theme. Every mood has its own instruments, rhythm and tune; layers join as the player goes deeper.

export type Mood = "haunted" | "industrial" | "scifi" | "sea" | "garden" | "mystery";

// First match wins: "a haunted pirate ship" is haunted before it is nautical.
const MOOD_RULES: [Mood, RegExp][] = [
  ["haunted", /haunt|ghost|spectr|crypt|tomb|grave|curse|skelet|witch|vampire|phantom|bone/],
  ["industrial", /power|factory|reactor|boiler|engine room|turbine|breaker|bunker|mine\b|clockwork|furnace|foundry/],
  ["scifi", /cyber|neon|space|moon|orbit|robot|android|hologra|laser|lab\b|laborator|future|alien|digital|terminal|memory|memories/],
  ["sea", /ship|pirate|\bsea\b|ocean|bottle|harbou?r|island|wreck|submarine|lighthouse|captain|sail|voyage/],
  ["garden", /garden|forest|meadow|grove|seed|flower|greenhouse|orchard|woods|farm|ivy/],
];

export function moodFor(...texts: (string | null | undefined)[]): Mood {
  const t = texts.filter(Boolean).join(" ").toLowerCase();
  return MOOD_RULES.find(([, re]) => re.test(t))?.[0] ?? "mystery";
}

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const PENTA = [0, 2, 4, 7, 9];

/** What one step of a mood's arrangement can play. */
interface Kit {
  t: number;
  /** Seconds per step. */
  step: number;
  level: number;
  rand: () => number;
  /** MIDI note of a scale degree (degrees past the scale wrap into higher octaves). */
  note: (deg: number, octave?: number) => number;
  tone: (midi: number, dur: number, o: ToneOpts) => void;
  noise: (dur: number, o: NoiseOpts) => void;
  kick: (gain: number) => void;
}

interface ToneOpts {
  type?: OscillatorType;
  gain: number;
  cutoff?: number;
  q?: number;
  attack?: number;
  wet?: number;
  vibrato?: number;
  detune?: number;
  /** Second detuned oscillator for a thicker, reedy sound (cents). */
  chorus?: number;
  /** Slide the pitch to this many semitones over the note. */
  glide?: number;
  at?: number;
}

interface NoiseOpts {
  filter: BiquadFilterType;
  freq: number;
  q?: number;
  gain: number;
  wet?: number;
  /** Rising swell instead of a hit. */
  swell?: boolean;
  at?: number;
}

interface Arrangement {
  /** Steps per minute. */
  spm: number;
  stepsPerBar: number;
  root: number;
  scale: number[];
  /** Chord root per bar, as scale degrees. */
  chords: number[];
  ambience: "wind" | "water" | "hum" | "whisper" | "air";
  play: (k: Kit, step: number, bar: number, chord: number) => void;
}

// Signature tunes as scale degrees per step (null = rest). Each mood's room 1 plays its own.
const SHANTY = [0, null, 2, 4, null, 4, 5, null, 4, 2, null, 0, 1, null, 2, 3, null, 2, 1, null, -1, 0, null, null];
const WALTZ = [7, null, 6, 4, null, null, 5, null, 4, 2, null, null, 3, 4, 3, 1, null, null, 2, null, 1, -1, null, null];
const FLUTE = [4, null, 5, 7, null, null, 9, 7, 5, null, 4, null, 2, null, 4, null, null, null, 7, null, 5, 4, 2, null, 0, null, null, null, null, null, null, null];

const ARRANGEMENTS: Record<Mood, Arrangement> = {
  // Slow piano broken chords over a cello drone; a melody, then a ticking clock.
  mystery: {
    spm: 132,
    stepsPerBar: 8,
    root: 57,
    scale: MINOR,
    chords: [0, 5, 3, 4],
    ambience: "air",
    play(k, s, _bar, c) {
      const piano = (m: number, g = 0.1) => {
        k.tone(m, 2.6, { type: "triangle", gain: g, cutoff: 2600, attack: 0.004, wet: 0.5 });
        k.tone(m + 12, 1.2, { type: "sine", gain: g * 0.35, attack: 0.004, wet: 0.5 });
      };
      if (s === 0) k.tone(k.note(c, -2), k.step * 8.5, { type: "sawtooth", gain: 0.05, cutoff: 420, attack: 1.2, wet: 0.4, vibrato: 4 });
      if (s === 0) piano(k.note(c, -1), 0.09);
      if (s === 2 || s === 4 || s === 6) piano(k.note(c + [2, 4, 7][s / 2 - 1]), 0.075);
      if (k.level >= 1 && (s === 1 || s === 5) && k.rand() < 0.7) piano(k.note(c + [4, 5, 7, 9][Math.floor(k.rand() * 4)], 1), 0.045);
      if (k.level >= 2 && s % 2 === 0) k.noise(0.03, { filter: "highpass", freq: s % 4 === 0 ? 5200 : 7000, gain: 0.05, wet: 0.2 });
    },
  },
  // A fast filtered arpeggiator and sub bass; a glassy bell melody; then drums and data blips.
  scifi: {
    spm: 440,
    stepsPerBar: 16,
    root: 50,
    scale: DORIAN,
    chords: [0, 0, 5, 3],
    ambience: "air",
    play(k, s, bar, c) {
      const sweep = 700 + 1900 * (0.5 + 0.5 * Math.sin(((bar * 16 + s) / 64) * Math.PI * 2));
      const arp = [0, 2, 4, 7, 9, 7, 4, 2][s % 8];
      k.tone(k.note(c + arp, 0), k.step * 0.9, { type: "sawtooth", gain: 0.045, cutoff: sweep, q: 9, attack: 0.003, wet: 0.25 });
      if (s % 4 === 0) k.tone(k.note(c, -2), k.step * 3.5, { type: "sine", gain: 0.05, attack: 0.005, wet: 0 });
      if (k.level >= 1 && (s === 0 || s === 6 || s === 10) && k.rand() < 0.75) {
        const m = k.note(c + [4, 7, 9, 11][Math.floor(k.rand() * 4)], 1);
        k.tone(m, 1.6, { type: "sine", gain: 0.05, attack: 0.002, wet: 0.6 });
        k.tone(m + 19, 0.5, { type: "sine", gain: 0.02, attack: 0.002, wet: 0.6 });
      }
      if (k.level >= 2) {
        if (s % 4 === 0) k.kick(0.16);
        if (s % 4 === 2) k.noise(0.04, { filter: "highpass", freq: 8000, gain: 0.06 });
        if (k.rand() < 0.06) k.tone(96 + Math.floor(k.rand() * 12), 0.05, { type: "square", gain: 0.02, wet: 0.3 });
      }
    },
  },
  // An accordion shanty in 6/8 over the waves; oom-pah-pah; then a hand drum and creaking timbers.
  sea: {
    spm: 210,
    stepsPerBar: 6,
    root: 50,
    scale: DORIAN,
    chords: [0, 0, 6, 4],
    ambience: "water",
    play(k, s, bar, c) {
      const motif = SHANTY[(bar % 4) * 6 + s];
      if (motif !== null && motif !== undefined) {
        k.tone(k.note(motif, 1), k.step * 1.7, { type: "square", gain: 0.022, cutoff: 1900, attack: 0.03, wet: 0.3, vibrato: 5.5, chorus: 11 });
      }
      if (k.level >= 1) {
        if (s === 0 || s === 3) k.tone(k.note(c + (s === 3 ? 4 : 0), -2), k.step * 1.6, { type: "triangle", gain: 0.09, cutoff: 700, attack: 0.005, wet: 0.15 });
        if (s === 1 || s === 2 || s === 4 || s === 5) for (const d of [2, 4]) k.tone(k.note(c + d, 0), k.step * 0.7, { type: "square", gain: 0.012, cutoff: 1400, attack: 0.01, wet: 0.2 });
      }
      if (k.level >= 2) {
        if (s === 0 || s === 3) k.noise(0.12, { filter: "bandpass", freq: 180, q: 2, gain: 0.18, wet: 0.2 });
        if (s === 5 && k.rand() < 0.15) k.tone(40, 0.6, { type: "sawtooth", gain: 0.03, cutoff: 300, glide: 3, attack: 0.2, wet: 0.4 });
      }
      if (s === 0 && k.rand() < 0.08) k.tone(91, 0.35, { type: "sine", gain: 0.025, glide: -7, attack: 0.02, wet: 0.7 }); // a gull
    },
  },
  // An out-of-tune music box waltz over a dissonant drone; a ghostly choir; then a heartbeat.
  haunted: {
    spm: 120,
    stepsPerBar: 6,
    root: 52,
    scale: MINOR,
    chords: [0, 3, 5, 4],
    ambience: "whisper",
    play(k, s, bar, c) {
      const motif = WALTZ[(bar % 4) * 6 + s];
      if (motif !== null && motif !== undefined) {
        const m = k.note(motif, 2);
        const wobble = (k.rand() - 0.5) * 40; // a worn music box drifts out of tune
        k.tone(m, 1.4, { type: "sine", gain: 0.13, attack: 0.002, wet: 0.65, detune: wobble });
        k.tone(m + 12, 0.4, { type: "sine", gain: 0.03, attack: 0.002, wet: 0.65, detune: wobble });
      }
      if (s === 0 && bar % 2 === 0) {
        k.tone(k.note(0, -2), k.step * 12.5, { type: "triangle", gain: 0.07, attack: 2, wet: 0.5, detune: -6 });
        k.tone(k.note(0, -2) + 6, k.step * 12.5, { type: "triangle", gain: 0.03, attack: 3, wet: 0.6, detune: 5 }); // the tritone
      }
      if (k.level >= 1 && s === 0) for (const d of [0, 2, 4]) k.tone(k.note(c + d, 0), k.step * 6.5, { type: "sawtooth", gain: 0.018, cutoff: 850, q: 6, attack: 1.4, wet: 0.8, vibrato: 4.5 });
      if (k.level >= 2) {
        if (s === 0) {
          k.tone(31, 0.28, { type: "sine", gain: 0.22, attack: 0.005, wet: 0 });
          k.tone(30, 0.28, { type: "sine", gain: 0.16, attack: 0.005, wet: 0, at: 0.3 });
        }
        if (s === 3 && bar % 4 === 3) k.noise(1.6, { filter: "bandpass", freq: 900, q: 1, gain: 0.07, wet: 0.7, swell: true });
      }
    },
  },
  // A machine loop of thumps, steam and a chugging bass; anvil clangs; then fast ticking.
  industrial: {
    spm: 416,
    stepsPerBar: 16,
    root: 45,
    scale: MINOR,
    chords: [0, 0, 5, 6],
    ambience: "hum",
    play(k, s, _bar, c) {
      if (s === 0 || s === 8 || s === 11) k.kick(0.2);
      if (s === 6 || s === 14) k.noise(0.22, { filter: "highpass", freq: 3500, gain: 0.06, wet: 0.2 });
      const riff = [0, 0, 7, 0, 0, 3, 0, 5][s % 8];
      if (s % 2 === 0) k.tone(k.note(c, -2) + riff, k.step * 1.6, { type: "square", gain: 0.028, cutoff: 380, attack: 0.004, wet: 0.05 });
      if (k.level >= 1 && (s === 4 || s === 12)) {
        for (const r of [1, 2.76, 5.4]) k.tone(k.note(c, 1) + 12 * Math.log2(r), 0.5, { type: "square", gain: 0.012, cutoff: 6000, attack: 0.001, wet: 0.5 });
      }
      if (k.level >= 2) k.noise(0.02, { filter: "highpass", freq: 9000, gain: s % 4 === 2 ? 0.05 : 0.025 });
    },
  },
  // Kalimba arpeggios and birdsong; a breathy flute; then a shaker and soft bass.
  garden: {
    spm: 184,
    stepsPerBar: 8,
    root: 60,
    scale: PENTA,
    chords: [0, 3, 1, 2],
    ambience: "wind",
    play(k, s, bar, c) {
      const arp = [0, 1, 2, 3, 4, 3, 2, 1][s];
      const m = k.note(c + arp, 0);
      k.tone(m, 0.9, { type: "triangle", gain: 0.05, attack: 0.002, wet: 0.35 });
      k.tone(m + 12, 0.3, { type: "sine", gain: 0.02, attack: 0.002, wet: 0.35 });
      if (s === 0 && k.rand() < 0.45) {
        const at = k.rand() * k.step * 6;
        for (let i = 0; i < 2 + Math.floor(k.rand() * 3); i++) k.tone(98 + Math.floor(k.rand() * 5), 0.08, { type: "sine", gain: 0.018, glide: 4, attack: 0.005, wet: 0.5, at: at + i * 0.11 });
      }
      if (k.level >= 1) {
        const f = FLUTE[(bar % 4) * 8 + s];
        if (f !== null && f !== undefined) {
          k.tone(k.note(f, 1), k.step * 1.9, { type: "sine", gain: 0.045, attack: 0.08, wet: 0.45, vibrato: 5 });
          k.noise(0.12, { filter: "bandpass", freq: 3000, q: 1.5, gain: 0.008, wet: 0.3 });
        }
      }
      if (k.level >= 2) {
        k.noise(0.05, { filter: "highpass", freq: 6500, gain: s % 2 === 1 ? 0.035 : 0.018 });
        if (s === 0 || s === 4) k.tone(k.note(c, -2), k.step * 3, { type: "sine", gain: 0.09, attack: 0.01, wet: 0.1 });
      }
    },
  },
};

class Music {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private reverb: ConvolverNode | null = null;
  private ambience: { stop: () => void } | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private arr: Arrangement | null = null;
  private seed = 1;
  private level = 0;
  private stepIndex = 0;
  private nextAt = 0;
  private key = "";

  /** Starts (or switches to) a mood. `level` 0–2 adds layers; the same seed always plays the same tune. */
  play(mood: Mood, level: number, seedText: string) {
    this.level = level;
    const key = `${mood}|${seedText}`;
    if (key === this.key && this.timer) return;
    this.stop(0.8);
    this.key = key;
    try {
      this.ctx ??= new AudioContext();
    } catch {
      return; // audio unavailable
    }
    const ctx = this.ctx;
    if (ctx.state === "suspended") void ctx.resume();
    this.arr = ARRANGEMENTS[mood];
    this.seed = [...seedText].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) || 1;
    this.stepIndex = 0;

    const master = ctx.createGain();
    master.gain.setValueAtTime(0, ctx.currentTime);
    master.gain.linearRampToValueAtTime(0.6, ctx.currentTime + 3);
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);
    this.master = master;
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = impulse(ctx, 3.2);
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    this.reverb.connect(wet).connect(master);

    this.ambience = startAmbience(ctx, master, this.arr.ambience);
    this.nextAt = ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.tick(), 40);
  }

  setLevel(level: number) {
    this.level = level;
  }

  /** Resumes audio after the first user gesture (browsers block autoplay until then). */
  unlock() {
    if (this.ctx?.state === "suspended") void this.ctx.resume();
  }

  stop(fade = 1.5) {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.key = "";
    const { ctx, master, ambience } = this;
    if (!ctx || !master) return;
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
    master.gain.linearRampToValueAtTime(0, ctx.currentTime + fade);
    setTimeout(() => {
      ambience?.stop();
      master.disconnect();
    }, fade * 1000 + 100);
    this.master = null;
    this.ambience = null;
  }

  private rand = () => {
    // Deterministic, so a room always plays the same tune.
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 2 ** 32;
  };

  private tick() {
    const { ctx, arr } = this;
    if (!ctx || !arr || !this.master) return;
    const step = 60 / arr.spm;
    // Hidden tabs run timers about once a second, so schedule further ahead there to avoid gaps.
    const ahead = typeof document !== "undefined" && document.hidden ? 1.5 : 0.2;
    while (this.nextAt < ctx.currentTime + ahead) {
      const s = this.stepIndex % arr.stepsPerBar;
      const bar = Math.floor(this.stepIndex / arr.stepsPerBar);
      arr.play(this.kit(this.nextAt, step), s, bar, arr.chords[bar % arr.chords.length]);
      this.stepIndex++;
      this.nextAt += step;
    }
  }

  private kit(t: number, step: number): Kit {
    const arr = this.arr!;
    const n = arr.scale.length;
    return {
      t,
      step,
      level: this.level,
      rand: this.rand,
      note: (deg, octave = 0) => arr.root + arr.scale[((deg % n) + n) % n] + 12 * (octave + Math.floor(deg / n)),
      tone: (midi, dur, o) => this.tone(t + (o.at ?? 0), midi, dur, o),
      noise: (dur, o) => this.noise(t + (o.at ?? 0), dur, o),
      kick: (gain) => this.kick(t, gain),
    };
  }

  private out(node: AudioNode, wet: number) {
    const ctx = this.ctx!;
    const dry = ctx.createGain();
    dry.gain.value = 1 - wet;
    node.connect(dry).connect(this.master!);
    if (wet > 0) {
      const send = ctx.createGain();
      send.gain.value = wet;
      node.connect(send).connect(this.reverb!);
    }
  }

  private tone(t: number, midi: number, dur: number, o: ToneOpts) {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    const attack = o.attack ?? 0.01;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(o.gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(dur, attack + 0.02));
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = o.cutoff ?? 12000;
    filter.Q.value = o.q ?? 0.7;
    filter.connect(g);
    const oscs = [0, ...(o.chorus ? [o.chorus] : [])].map((cents) => {
      const osc = ctx.createOscillator();
      osc.type = o.type ?? "sine";
      osc.frequency.setValueAtTime(hz(midi), t);
      if (o.glide) osc.frequency.exponentialRampToValueAtTime(hz(midi + o.glide), t + dur);
      osc.detune.value = (o.detune ?? 0) + cents;
      osc.connect(filter);
      return osc;
    });
    if (o.vibrato) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = o.vibrato;
      const depth = ctx.createGain();
      depth.gain.value = 14; // cents
      lfo.connect(depth);
      oscs.forEach((osc) => depth.connect(osc.detune));
      lfo.start(t);
      lfo.stop(t + dur + 0.1);
    }
    this.out(g, o.wet ?? 0.3);
    oscs.forEach((osc) => {
      osc.start(t);
      osc.stop(t + dur + 0.1);
    });
  }

  private noise(t: number, dur: number, o: NoiseOpts) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = o.filter;
    filter.frequency.value = o.freq;
    filter.Q.value = o.q ?? 1;
    const g = ctx.createGain();
    if (o.swell) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(o.gain, t + dur * 0.9);
      g.gain.linearRampToValueAtTime(0, t + dur);
    } else {
      g.gain.setValueAtTime(o.gain, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    }
    src.connect(filter).connect(g);
    this.out(g, o.wet ?? 0.15);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  /** A drum thump: a sine whose pitch drops fast. */
  private kick(t: number, gain: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(130, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    osc.connect(g);
    this.out(g, 0.05);
    osc.start(t);
    osc.stop(t + 0.35);
  }
}

let noiseCache: AudioBuffer | null = null;
function noiseBuffer(ctx: AudioContext): AudioBuffer {
  if (noiseCache?.sampleRate === ctx.sampleRate) return noiseCache;
  const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return (noiseCache = buf);
}

/** A synthetic room reverb: decaying stereo noise. */
function impulse(ctx: AudioContext, seconds: number): AudioBuffer {
  const len = ctx.sampleRate * seconds;
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2.6;
  }
  return buf;
}

/** A continuous bed under the music: wind, waves, machine hum, whispers or soft air. */
function startAmbience(ctx: AudioContext, out: AudioNode, kind: Arrangement["ambience"]): { stop: () => void } {
  const nodes: AudioScheduledSourceNode[] = [];
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.loop = true;
  const filter = ctx.createBiquadFilter();
  const g = ctx.createGain();
  const lfo = ctx.createOscillator();
  const lfoDepth = ctx.createGain();
  const s = {
    wind: { type: "bandpass", freq: 500, q: 0.8, gain: 0.05, lfo: 0.09, depth: 300, swell: 0 },
    water: { type: "lowpass", freq: 600, q: 1, gain: 0.06, lfo: 0.12, depth: 350, swell: 0.045 },
    hum: { type: "lowpass", freq: 180, q: 6, gain: 0.04, lfo: 0.05, depth: 40, swell: 0 },
    whisper: { type: "bandpass", freq: 2600, q: 3, gain: 0.03, lfo: 0.15, depth: 1200, swell: 0.02 },
    air: { type: "lowpass", freq: 900, q: 0.5, gain: 0.02, lfo: 0.07, depth: 200, swell: 0 },
  }[kind];
  filter.type = s.type as BiquadFilterType;
  filter.frequency.value = s.freq;
  filter.Q.value = s.q;
  g.gain.value = s.gain;
  lfo.frequency.value = s.lfo;
  lfoDepth.gain.value = s.depth;
  lfo.connect(lfoDepth).connect(filter.frequency);
  if (s.swell) {
    // Waves and moans rise and fall in volume as well as tone.
    const swellDepth = ctx.createGain();
    swellDepth.gain.value = s.swell;
    lfo.connect(swellDepth).connect(g.gain);
  }
  src.connect(filter).connect(g).connect(out);
  src.start();
  lfo.start();
  nodes.push(src, lfo);
  if (kind === "hum") {
    for (const [f, v] of [
      [55, 0.008],
      [110, 0.004],
    ]) {
      const o = ctx.createOscillator();
      o.frequency.value = f;
      const og = ctx.createGain();
      og.gain.value = v;
      o.connect(og).connect(out);
      o.start();
      nodes.push(o);
    }
  }
  return { stop: () => nodes.forEach((n) => n.stop()) };
}

export const music = new Music();
