import { useEffect, useRef } from 'react';
import { useApp } from '../lib/store';
import { prefersReducedMotion } from './Chart';

/** Depth rows of the wave surface, nearest first, and how far away the last one is. */
const ROWS = 46;
const Z_NEAR = 1.5;
const Z_FAR = 8;
/** Half the width of the surface in world units: wide enough that the far rows span the screen. */
const HALF_WIDTH = 7.5;
const FRAME_MS = 1000 / 30; // plenty for a slow drift, and half the work of 60

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
 */
export function ParticleField() {
  const ref = useRef<HTMLCanvasElement>(null);
  const night = useApp((s) => s.night);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const rgb = getComputedStyle(document.documentElement).getPropertyValue('--text').trim().replace(/\s+/g, ', ') || '242, 244, 248';
    const still = prefersReducedMotion();
    let width = 0;
    let height = 0;
    let frame = 0;
    let last = -Infinity;

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    const draw = (ms: number) => {
      const t = ms / 1000;
      ctx.clearRect(0, 0, width, height);
      const focal = Math.max(width, 700) * 0.6;
      const centre = width / 2;
      const horizon = height * 0.5;
      const cols = Math.round(Math.min(150, Math.max(56, width / 9)));

      // Stars: a sparse sheet above the horizon, drifting slowly and twinkling a little.
      const stars = Math.round(Math.min(110, width / 9));
      for (let i = 0; i < stars; i += 1) {
        const x = (hash(i) * width + t * (2 + 6 * hash(i + 500))) % width;
        const y = hash(i + 1000) ** 1.6 * horizon * 0.95;
        const twinkle = 0.55 + 0.45 * Math.sin(t * (0.4 + hash(i + 2000)) + i);
        const far = 1 - y / horizon; // higher on screen reads as nearer: larger and brighter
        ctx.fillStyle = `rgba(${rgb}, ${(0.12 + 0.5 * far) * twinkle})`;
        const size = 0.8 + 1.3 * far;
        ctx.fillRect(x, y, size, size);
      }

      // The wave surface, far rows first so near dots draw on top.
      for (let r = ROWS - 1; r >= 0; r -= 1) {
        const z = Z_NEAR + ((Z_FAR - Z_NEAR) * r) / (ROWS - 1);
        const scale = focal / z;
        const depth = r / (ROWS - 1);
        const alpha = 0.16 + 0.84 * (1 - depth) ** 1.3;
        const size = Math.max(0.9, Math.min(3, (4.2 / z) * (focal / 760)));
        ctx.fillStyle = `rgba(${rgb}, ${alpha})`;
        for (let c = 0; c < cols; c += 1) {
          const x = -HALF_WIDTH + (2 * HALF_WIDTH * c) / (cols - 1);
          const sx = centre + x * scale;
          if (sx < -4 || sx > width + 4) continue;
          const wave =
            0.27 * Math.sin(x * 0.8 + t * 0.55) * Math.cos(z * 0.75 + t * 0.35) +
            0.15 * Math.sin(x * 0.33 - z * 1.1 + t * 0.22) +
            0.05 * Math.sin(x * 2.1 + z * 0.5 - t * 0.7);
          // The eye is only just above the surface, so the waves are seen almost edge-on.
          const sy = horizon + (0.13 - wave) * scale;
          if (sy > height + 4) continue;
          ctx.fillRect(sx, sy, size, size);
        }
      }
    };

    const tick = (ms: number) => {
      frame = requestAnimationFrame(tick);
      if (ms - last < FRAME_MS) return;
      last = ms;
      draw(ms);
    };
    const start = () => {
      cancelAnimationFrame(frame);
      if (still || document.hidden) draw(still ? 0 : performance.now());
      else frame = requestAnimationFrame(tick);
    };
    const onResize = () => {
      resize();
      if (still) draw(0);
    };

    resize();
    start();
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', start);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', start);
    };
  }, [night]);

  return <canvas ref={ref} aria-hidden="true" data-testid="particle-field" className="pointer-events-none fixed inset-0 -z-10 h-full w-full opacity-80 print:hidden" />;
}
