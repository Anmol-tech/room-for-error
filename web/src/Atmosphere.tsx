import { useEffect, useRef } from "react";
import type { Mood } from "./music.ts";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  phase: number;
}

interface Style {
  count: number;
  spawn: () => Omit<Particle, "life" | "phase">;
  draw: (g: CanvasRenderingContext2D, p: Particle, w: number, h: number, t: number) => void;
  /** Steers a particle each frame (wandering, flicker); optional. */
  steer?: (p: Particle, t: number) => void;
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

function glow(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha: number) {
  const grad = g.createRadialGradient(x, y, 0, x, y, r);
  grad.addColorStop(0, color.replace("A", String(alpha)));
  grad.addColorStop(1, color.replace("A", "0"));
  g.fillStyle = grad;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}

// Positions are fractions of the canvas; sizes are in CSS pixels.
const STYLES: Record<Mood, Style> = {
  // Dust motes drifting in a beam of light.
  mystery: {
    count: 55,
    spawn: () => ({ x: rnd(0, 1), y: rnd(0, 1), vx: rnd(-0.004, 0.006), vy: rnd(-0.006, 0.004), r: rnd(0.6, 1.8) }),
    draw: (g, p, w, h, t) => glow(g, p.x * w, p.y * h, p.r * 3, "rgba(255,236,200,A)", 0.35 + 0.3 * Math.sin(t * 1.3 + p.phase)),
  },
  // Rain streaking down the glass.
  sea: {
    count: 120,
    spawn: () => ({ x: rnd(-0.1, 1), y: rnd(-0.2, 0), vx: rnd(0.06, 0.09), vy: rnd(0.75, 1.05), r: rnd(0.8, 1.5) }),
    draw: (g, p, w, h) => {
      g.strokeStyle = "rgba(200,222,240,0.5)";
      g.lineWidth = p.r;
      g.beginPath();
      g.moveTo(p.x * w, p.y * h);
      g.lineTo((p.x - p.vx * 0.035) * w, (p.y - p.vy * 0.035) * h);
      g.stroke();
    },
  },
  // Embers rising from the machines, with slow puffs of steam.
  industrial: {
    count: 45,
    spawn: () =>
      Math.random() < 0.75
        ? { x: rnd(0, 1), y: rnd(1, 1.15), vx: rnd(-0.02, 0.02), vy: rnd(-0.12, -0.05), r: rnd(0.8, 2) }
        : { x: rnd(0, 1), y: rnd(1, 1.2), vx: rnd(-0.01, 0.01), vy: rnd(-0.04, -0.02), r: rnd(30, 60) },
    draw: (g, p, w, h, t) =>
      p.r > 10
        ? glow(g, p.x * w, p.y * h, p.r, "rgba(220,225,230,A)", 0.07 * Math.min(1, p.life))
        : glow(g, p.x * w, p.y * h, p.r * 3, "rgba(255,150,60,A)", (0.55 + 0.4 * Math.sin(t * 9 + p.phase)) * Math.min(1, p.life)),
    steer: (p, t) => (p.vx += Math.sin(t * 2 + p.phase) * 0.0004),
  },
  // Floating data sparks.
  scifi: {
    count: 40,
    spawn: () => ({ x: rnd(0, 1), y: rnd(0, 1), vx: rnd(-0.01, 0.01), vy: rnd(-0.03, -0.008), r: rnd(0.6, 1.6) }),
    draw: (g, p, w, h, t) => {
      const a = 0.35 + 0.45 * Math.max(0, Math.sin(t * 2.2 + p.phase));
      glow(g, p.x * w, p.y * h, p.r * 4, "rgba(110,235,255,A)", a);
    },
  },
  // Drifting banks of mist.
  haunted: {
    count: 14,
    spawn: () => ({ x: rnd(-0.3, 1), y: rnd(0.45, 1.05), vx: rnd(0.006, 0.016), vy: rnd(-0.003, 0.003), r: rnd(80, 170) }),
    draw: (g, p, w, h, t) => glow(g, p.x * w, p.y * h, p.r, "rgba(205,215,235,A)", 0.07 + 0.04 * Math.sin(t * 0.4 + p.phase)),
  },
  // Fireflies wandering and pulsing.
  garden: {
    count: 26,
    spawn: () => ({ x: rnd(0, 1), y: rnd(0.25, 1), vx: rnd(-0.02, 0.02), vy: rnd(-0.02, 0.02), r: rnd(1, 2) }),
    draw: (g, p, w, h, t) => glow(g, p.x * w, p.y * h, p.r * 6, "rgba(220,255,130,A)", Math.max(0, Math.sin(t * 1.6 + p.phase)) * 0.75),
    steer: (p, t) => {
      p.vx += Math.cos(t * 0.7 + p.phase * 3) * 0.0006;
      p.vy += Math.sin(t * 0.9 + p.phase * 2) * 0.0006;
      p.vx = Math.max(-0.03, Math.min(0.03, p.vx));
      p.vy = Math.max(-0.03, Math.min(0.03, p.vy));
    },
  },
};

/** Mood particles over the room picture: dust, rain, embers, sparks, mist or fireflies. Never takes clicks. */
export function Atmosphere({ mood }: { mood: Mood }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const g = canvas?.getContext("2d");
    if (!canvas || !g) return;
    const style = STYLES[mood];
    const make = (fresh: boolean): Particle => {
      const p = { ...style.spawn(), life: rnd(4, 9), phase: rnd(0, Math.PI * 2) };
      // At start, scatter particles over the whole picture instead of all spawning at the edge.
      if (fresh) p.y = rnd(0, 1);
      return p;
    };
    let particles = Array.from({ length: style.count }, () => make(true));
    let raf = 0;
    let last = performance.now();
    let w = 0;
    let h = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = now / 1000;
      g.clearRect(0, 0, w, h);
      g.globalCompositeOperation = "lighter";
      particles = particles.map((p) => {
        style.steer?.(p, t);
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
        const out = p.x < -0.4 || p.x > 1.4 || p.y < -0.3 || p.y > 1.3;
        return out || p.life <= 0 ? make(false) : p;
      });
      for (const p of particles) style.draw(g, p, w, h, t);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [mood]);

  return <canvas ref={ref} className={`atmosphere atmosphere-${mood}`} aria-hidden />;
}
