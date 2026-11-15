import { useEffect, useRef } from 'react';
import { useApp } from '../lib/store';
import type { Status } from '../lib/types';
import { prefersReducedMotion } from './Chart';

/** Depth rows of the wave surface, nearest first, and how far away the last one is. */
const ROWS = 46;
const Z_NEAR = 1.5;
const Z_FAR = 8;
/** Half the width of the surface in world units: wide enough that the far rows span the screen. */
const HALF_WIDTH = 7.5;
const FRAME_MS = 1000 / 30; // plenty for a slow drift, and half the work of 60

/**
 * How the waves look for the status on screen. The status itself is always carried by the text,
 * shape and colour of the interface; this only gives the page a matching feel. Nothing flashes:
 * the fastest setting is under twice the calm speed, and changes ease in over a second or two.
 */
const MOODS: Record<Status, { name: 'calm' | 'ripple' | 'tense'; amp: number; speed: number; tint: number; cssVar: string | null }> = {
  nominal: { name: 'calm', amp: 1, speed: 1, tint: 0, cssVar: null },
  watch: { name: 'ripple', amp: 1.45, speed: 1.3, tint: 0.55, cssVar: '--watch' },
  call_ground: { name: 'tense', amp: 2, speed: 1.7, tint: 0.8, cssVar: '--call' },
};

type Rgb = [number, number, number];

/** "242 244 248" (a theme variable) as numbers. */
function cssRgb(name: string, fallback: Rgb): Rgb {
  const parts = getComputedStyle(document.documentElement).getPropertyValue(name).trim().split(/\s+/).map(Number);
  return parts.length === 3 && parts.every(Number.isFinite) ? (parts as Rgb) : fallback;
}

/** A repeatable 0..1 value for index `i`, so the stars do not jump between renders. */
function hash(i: number): number {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * The page background: a surface of dots rolling in slow waves, seen in perspective, under a
 * sparse field of stars. It is decoration only: drawn behind everything, ignored by pointers
 * and screen readers, tinted from the theme so night mode stays red, and still when the
 * system asks for reduced motion or the tab is hidden.
 *
 * It follows the status of the person on screen: calm when everything is Nominal, rippling
 * and amber-tinted on Watch, taller, faster and red-tinted on Call ground.
 */
export function ParticleField() {
  const ref = useRef<HTMLCanvasElement>(null);
  const night = useApp((s) => s.night);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const text = cssRgb('--text', [242, 244, 248]);
    const still = prefersReducedMotion();
    let width = 0;
    let height = 0;
    let frame = 0;
    let lastDraw = -Infinity;
    let lastTick = 0;
    let phase = 0; // time as the waves see it: it runs faster when the mood is tense, without jumping

    // Where the mood is heading, and where it is now (easing towards it).
    const goal = { amp: 1, speed: 1, tint: 0, rgb: text };
    const now = { amp: 1, speed: 1, tint: 0, rgb: [...text] as Rgb };
    const setMood = (status: Status | undefined) => {
      const mood = MOODS[status ?? 'nominal'];
      canvas.dataset.mood = mood.name;
      goal.amp = mood.amp;
      goal.speed = mood.speed;
      goal.tint = mood.tint;
      goal.rgb = mood.cssVar ? cssRgb(mood.cssVar, text) : text;
      if (still) {
        now.amp = goal.amp;
        now.speed = goal.speed;
        now.tint = goal.tint;
        now.rgb = [...goal.rgb] as Rgb;
        draw();
      }
    };

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    function draw() {
      const t = phase;
      ctx!.clearRect(0, 0, width, height);
      const focal = Math.max(width, 700) * 0.6;
      const centre = width / 2;
      const horizon = height * 0.5;
      const cols = Math.round(Math.min(150, Math.max(56, width / 9)));
      const starRgb = text.join(', ');
      const wave = now.rgb.map((c, i) => Math.round(text[i]! + (c - text[i]!) * now.tint * 1)).join(', ');

      // Stars: a sparse sheet above the horizon, drifting slowly and twinkling a little.
      const stars = Math.round(Math.min(110, width / 9));
      for (let i = 0; i < stars; i += 1) {
        const x = (hash(i) * width + t * (2 + 6 * hash(i + 500))) % width;
        const y = hash(i + 1000) ** 1.6 * horizon * 0.95;
        const twinkle = 0.55 + 0.45 * Math.sin(t * (0.4 + hash(i + 2000)) + i);
        const far = 1 - y / horizon; // higher on screen reads as nearer: larger and brighter
        ctx!.fillStyle = `rgba(${starRgb}, ${(0.12 + 0.5 * far) * twinkle})`;
        const size = 0.8 + 1.3 * far;
        ctx!.fillRect(x, y, size, size);
      }

      // The wave surface, far rows first so near dots draw on top.
      for (let r = ROWS - 1; r >= 0; r -= 1) {
        const z = Z_NEAR + ((Z_FAR - Z_NEAR) * r) / (ROWS - 1);
        const scale = focal / z;
        const depth = r / (ROWS - 1);
        const alpha = Math.min(1, (0.16 + 0.84 * (1 - depth) ** 1.3) * (1 + 0.25 * now.tint));
        const size = Math.max(0.9, Math.min(3, (4.2 / z) * (focal / 760)));
        ctx!.fillStyle = `rgba(${wave}, ${alpha})`;
        for (let c = 0; c < cols; c += 1) {
          const x = -HALF_WIDTH + (2 * HALF_WIDTH * c) / (cols - 1);
          const sx = centre + x * scale;
          if (sx < -4 || sx > width + 4) continue;
          const swell =
            (0.27 * Math.sin(x * 0.8 + t * 0.55) * Math.cos(z * 0.75 + t * 0.35) +
              0.15 * Math.sin(x * 0.33 - z * 1.1 + t * 0.22) +
              0.05 * Math.sin(x * 2.1 + z * 0.5 - t * 0.7)) *
            now.amp;
          // The eye is only just above the surface, so the waves are seen almost edge-on.
          const sy = horizon + (0.13 - swell) * scale;
          if (sy > height + 4) continue;
          ctx!.fillRect(sx, sy, size, size);
        }
      }
    }

    const tick = (ms: number) => {
      frame = requestAnimationFrame(tick);
      if (ms - lastDraw < FRAME_MS) return;
      const dt = Math.min(0.1, (ms - (lastTick || ms)) / 1000);
      lastTick = ms;
      lastDraw = ms;
      // Ease towards the mood (about a second to settle) and let time run at its speed.
      const k = 1 - Math.exp(-dt * 2.2);
      now.amp += (goal.amp - now.amp) * k;
      now.speed += (goal.speed - now.speed) * k;
      now.tint += (goal.tint - now.tint) * k;
      for (let i = 0; i < 3; i += 1) now.rgb[i] = now.rgb[i]! + (goal.rgb[i]! - now.rgb[i]!) * k;
      phase += dt * now.speed;
      draw();
    };
    const start = () => {
      cancelAnimationFrame(frame);
      lastTick = 0;
      if (still || document.hidden) draw();
      else frame = requestAnimationFrame(tick);
    };
    const onResize = () => {
      resize();
      if (still) draw();
    };

    resize();
    // Follow the status of the person on screen, whenever it changes.
    let shown: Status | undefined = useApp.getState().dash?.overall;
    setMood(shown);
    const unsubscribe = useApp.subscribe((state) => {
      const next = state.dash?.overall;
      if (next !== shown) {
        shown = next;
        setMood(next);
      }
    });
    start();
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', start);
    return () => {
      cancelAnimationFrame(frame);
      unsubscribe();
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', start);
    };
  }, [night]);

  return <canvas ref={ref} aria-hidden="true" data-testid="particle-field" className="pointer-events-none fixed inset-0 -z-10 h-full w-full opacity-80 print:hidden" />;
}
