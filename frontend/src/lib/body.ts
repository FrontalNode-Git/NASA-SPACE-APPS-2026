/**
 * The body figure, once, for both views of the body scan.
 *
 * The figure is a set of simple volumes (ellipsoids and tapered limbs) blended into one
 * skin. The particle view places points on that skin in horizontal slices, like a scanner,
 * and adds a faint skeleton and a few organs inside. The flat view traces the outline of
 * the same figure. It is an illustration: nothing here is a health statement or a measure.
 */
import type { Bundle, Dashboard, Status, Zone } from './types';

type V3 = [number, number, number];

interface Ellipsoid {
  kind: 'ellipsoid';
  c: V3;
  r: V3;
}
interface Limb {
  kind: 'limb';
  a: V3;
  b: V3;
  ra: number;
  rb: number;
}
type Part = Ellipsoid | Limb;

const ell = (c: V3, r: V3): Part => ({ kind: 'ellipsoid', c, r });
const limb = (a: V3, b: V3, ra: number, rb: number): Part => ({ kind: 'limb', a, b, ra, rb });

const side = (s: 1 | -1): Part[] => [
  ell([s * 0.215, 1.54, -0.01], [0.04, 0.075, 0.035]), // ear
  ell([s * 0.2, 1.16, -0.03], [0.2, 0.075, 0.11]), // slope from neck to shoulder
  ell([s * 0.45, 1.07, 0], [0.125, 0.135, 0.125]), // shoulder
  limb([s * 0.47, 1.04, 0], [s * 0.585, 0.57, -0.01], 0.1, 0.076), // upper arm
  limb([s * 0.585, 0.57, -0.01], [s * 0.682, 0.09, 0.052], 0.076, 0.048), // forearm, down into the hand
  ell([s * 0.7, -0.02, 0.065], [0.052, 0.13, 0.036]), // hand
  ell([s * 0.652, 0.025, 0.085], [0.028, 0.062, 0.028]), // thumb
  ell([s * 0.18, -0.02, -0.02], [0.18, 0.19, 0.18]), // hip
  limb([s * 0.185, -0.08, 0], [s * 0.2, -0.88, 0], 0.165, 0.1), // thigh
  ell([s * 0.2, -0.9, 0.02], [0.1, 0.1, 0.105]), // knee
  limb([s * 0.2, -0.94, 0], [s * 0.2, -1.66, -0.01], 0.092, 0.058), // shin
  ell([s * 0.205, -1.16, -0.04], [0.095, 0.2, 0.1]), // calf
  ell([s * 0.2, -1.765, 0.085], [0.08, 0.055, 0.17]), // foot
  ell([s * 0.2, -1.74, -0.03], [0.065, 0.07, 0.07]), // heel
];

/** Units: roughly metres x 2. Soles at -1.82, top of the head at 1.84, arms a little out. */
export const BODY_PARTS: Part[] = [
  ell([0, 1.58, 0], [0.2, 0.26, 0.225]), // skull
  ell([0, 1.44, 0.035], [0.15, 0.13, 0.16]), // jaw
  limb([0, 1.36, -0.02], [0, 1.16, -0.02], 0.095, 0.115), // neck
  ell([0, 0.98, 0], [0.39, 0.2, 0.19]), // upper chest
  ell([0, 0.78, 0], [0.345, 0.33, 0.2]), // ribcage
  ell([0, 0.42, 0], [0.285, 0.27, 0.165]), // waist
  ell([0, 0.08, 0], [0.335, 0.22, 0.19]), // pelvis
  ...side(1),
  ...side(-1),
];

/** How softly neighbouring volumes melt into each other. */
const BLEND = 0.06;

const smin = (a: number, b: number, k: number) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};

/** Signed distance to one volume: negative inside. */
function partDistance(p: Part, x: number, y: number, z: number): number {
  if (p.kind === 'ellipsoid') {
    const px = (x - p.c[0]) / p.r[0];
    const py = (y - p.c[1]) / p.r[1];
    const pz = (z - p.c[2]) / p.r[2];
    const k0 = Math.sqrt(px * px + py * py + pz * pz);
    if (k0 < 1e-6) return -Math.min(p.r[0], p.r[1], p.r[2]);
    const qx = px / p.r[0];
    const qy = py / p.r[1];
    const qz = pz / p.r[2];
    return (k0 * (k0 - 1)) / Math.sqrt(qx * qx + qy * qy + qz * qz);
  }
  const bx = p.b[0] - p.a[0];
  const by = p.b[1] - p.a[1];
  const bz = p.b[2] - p.a[2];
  const ax = x - p.a[0];
  const ay = y - p.a[1];
  const az = z - p.a[2];
  const t = Math.min(1, Math.max(0, (ax * bx + ay * by + az * bz) / (bx * bx + by * by + bz * bz)));
  const dx = ax - bx * t;
  const dy = ay - by * t;
  const dz = az - bz * t;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - (p.ra + (p.rb - p.ra) * t);
}

/** The same volume seen from the front: its shadow on the x/y plane. */
function partDistance2(p: Part, x: number, y: number): number {
  if (p.kind === 'ellipsoid') {
    const px = (x - p.c[0]) / p.r[0];
    const py = (y - p.c[1]) / p.r[1];
    const k0 = Math.sqrt(px * px + py * py);
    if (k0 < 1e-6) return -Math.min(p.r[0], p.r[1]);
    const qx = px / p.r[0];
    const qy = py / p.r[1];
    return (k0 * (k0 - 1)) / Math.sqrt(qx * qx + qy * qy);
  }
  const bx = p.b[0] - p.a[0];
  const by = p.b[1] - p.a[1];
  const ax = x - p.a[0];
  const ay = y - p.a[1];
  const t = Math.min(1, Math.max(0, (ax * bx + ay * by) / (bx * bx + by * by)));
  return Math.hypot(ax - bx * t, ay - by * t) - (p.ra + (p.rb - p.ra) * t);
}

/** Centre and reach of every volume, to skip the ones nowhere near a point. */
const BOUNDS = BODY_PARTS.map((p) => {
  if (p.kind === 'ellipsoid') return { x: p.c[0], y: p.c[1], z: p.c[2], reach: Math.max(p.r[0], p.r[1], p.r[2]) };
  const half = Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1], p.b[2] - p.a[2]) / 2;
  return {
    x: (p.a[0] + p.b[0]) / 2,
    y: (p.a[1] + p.b[1]) / 2,
    z: (p.a[2] + p.b[2]) / 2,
    reach: half + Math.max(p.ra, p.rb),
  };
});
const NEAR = 0.3;

/** Signed distance to the whole figure. Only meant for points close to the skin. */
function skin(x: number, y: number, z: number): number {
  let d = Infinity;
  for (let i = 0; i < BODY_PARTS.length; i++) {
    const b = BOUNDS[i]!;
    const ex = x - b.x;
    const ey = y - b.y;
    const ez = z - b.z;
    const far = b.reach + NEAR;
    if (ex * ex + ey * ey + ez * ez > far * far) continue;
    d = smin(d, partDistance(BODY_PARTS[i]!, x, y, z), BLEND);
  }
  return d;
}

/** Signed distance to the front outline of the figure, in body units. Negative inside. */
export function outlineDistance(x: number, y: number): number {
  let d = Infinity;
  for (const p of BODY_PARTS) d = smin(d, partDistance2(p, x, y), BLEND);
  return d;
}

/* ---------- particle view ---------- */

/** What a particle belongs to. */
export const SHELL = 0;
export const INSIDE = 1;
export const PAD = 2;

interface Points {
  position: number[];
  normal: number[];
  kind: number[];
  /** Zone id for a particle that is part of a named structure (bones, heart ...), else ''. */
  structure: string[];
}

const SLICE = 0.03; // distance between scan slices
const STEP = 0.019; // distance between particles along a slice
const GRAD = 0.002;

function push(out: Points, kind: number, structure: string, x: number, y: number, z: number, nx: number, ny: number, nz: number) {
  out.position.push(x, y, z);
  out.normal.push(nx, ny, nz);
  out.kind.push(kind);
  out.structure.push(structure);
}

/** Puts one candidate onto the blended skin and records it with its outward direction. */
function settle(out: Points, self: number, x: number, y: number, z: number) {
  for (let i = 0; i < BODY_PARTS.length; i++) {
    if (i !== self && partDistance(BODY_PARTS[i]!, x, y, z) < -0.002) return; // hidden inside a neighbour
  }
  let gx = 0;
  let gy = 0;
  let gz = 1;
  for (let step = 0; step < 3; step++) {
    const d = skin(x, y, z);
    gx = skin(x + GRAD, y, z) - skin(x - GRAD, y, z);
    gy = skin(x, y + GRAD, z) - skin(x, y - GRAD, z);
    gz = skin(x, y, z + GRAD) - skin(x, y, z - GRAD);
    const len = Math.hypot(gx, gy, gz) || 1;
    gx /= len;
    gy /= len;
    gz /= len;
    if (step === 2 || Math.abs(d) < 1e-4) break;
    const slope = len / (2 * GRAD) || 1;
    x -= (gx * d) / slope;
    y -= (gy * d) / slope;
    z -= (gz * d) / slope;
  }
  push(out, SHELL, '', x, y, z, gx, gy, gz);
}

/** Horizontal slices through every volume: the rings a scanner would draw. */
function shell(out: Points) {
  BODY_PARTS.forEach((p, self) => {
    const low = p.kind === 'ellipsoid' ? p.c[1] - p.r[1] : Math.min(p.a[1], p.b[1]);
    const high = p.kind === 'ellipsoid' ? p.c[1] + p.r[1] : Math.max(p.a[1], p.b[1]);
    for (let k = Math.ceil(low / SLICE); k * SLICE <= high; k++) {
      const y = k * SLICE;
      let cx: number;
      let cz: number;
      let rx: number;
      let rz: number;
      if (p.kind === 'ellipsoid') {
        const s = Math.sqrt(Math.max(0, 1 - ((y - p.c[1]) / p.r[1]) ** 2));
        [cx, cz, rx, rz] = [p.c[0], p.c[2], p.r[0] * s, p.r[2] * s];
      } else {
        const t = (y - p.a[1]) / (p.b[1] - p.a[1]);
        const r = p.ra + (p.rb - p.ra) * t;
        [cx, cz, rx, rz] = [p.a[0] + (p.b[0] - p.a[0]) * t, p.a[2] + (p.b[2] - p.a[2]) * t, r, r];
      }
      if (Math.max(rx, rz) < 0.006) continue;
      const n = Math.max(6, Math.round((2 * Math.PI * Math.sqrt((rx * rx + rz * rz) / 2)) / STEP));
      const phase = (k % 2) * (Math.PI / n);
      for (let i = 0; i < n; i++) {
        const angle = phase + (i / n) * Math.PI * 2;
        settle(out, self, cx + rx * Math.cos(angle), y, cz + rz * Math.sin(angle));
      }
    }
  });
}

/** A ring of particles in the horizontal plane, optionally tilted and wavy. */
function ring(
  out: Points,
  kind: number,
  structure: string,
  c: V3,
  rx: number,
  rz: number,
  step: number,
  opts: { from?: number; to?: number; drop?: number; wave?: number } = {},
) {
  const from = opts.from ?? 0;
  const to = opts.to ?? Math.PI * 2;
  const n = Math.max(4, Math.round(((to - from) * Math.sqrt((rx * rx + rz * rz) / 2)) / step));
  for (let i = 0; i < n; i++) {
    const angle = from + ((to - from) * i) / n;
    const wobble = 1 + (opts.wave ?? 0) * Math.sin(angle * 7);
    const x = rx * wobble * Math.cos(angle);
    const z = rz * wobble * Math.sin(angle);
    // `drop` lowers the front of the ring, the way ribs slope down from the spine.
    push(out, kind, structure, c[0] + x, c[1] - (opts.drop ?? 0) * (z / rz + 1) * 0.5, c[2] + z, x, 0, z);
  }
}

/** A thin tube of particles from a to b: a long bone. */
function bone(out: Points, a: V3, b: V3, radius: number) {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const n = Math.max(2, Math.round(length / 0.026));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    // A little wider at both ends, like the head of a bone.
    const r = radius * (1 + 0.9 * Math.max(0, Math.abs(t - 0.5) * 2 - 0.72) / 0.28);
    ring(out, INSIDE, 'bones', [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t], r, r, 0.022, {
      from: i % 2 ? 0.5 : 0,
      to: Math.PI * 2 + (i % 2 ? 0.5 : 0),
    });
  }
}

/** A small volume of particles in stacked rings: an organ. */
function organ(out: Points, structure: string, c: V3, r: V3, slice: number, step: number, wave = 0) {
  for (let y = -r[1] + slice / 2; y < r[1]; y += slice) {
    const s = Math.sqrt(Math.max(0, 1 - (y / r[1]) ** 2));
    if (r[0] * s < 0.008) continue;
    ring(out, INSIDE, structure, [c[0], c[1] + y, c[2]], r[0] * s, r[2] * s, step, { wave });
  }
}

/** A single file of particles along a smooth curve through `points`: a vessel, a rib tip, a finger. */
function strand(out: Points, structure: string, points: V3[], step = 0.018) {
  const at = (i: number): V3 => points[Math.max(0, Math.min(points.length - 1, i))]!;
  for (let seg = 0; seg < points.length - 1; seg++) {
    const [p0, p1, p2, p3] = [at(seg - 1), at(seg), at(seg + 1), at(seg + 2)];
    const n = Math.max(1, Math.round(Math.hypot(p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]) / step));
    for (let i = 0; i < n; i++) {
      const t = i / n;
      // Catmull-Rom: passes through every point and bends gently between them.
      const c = (k: 0 | 1 | 2) =>
        0.5 * (2 * p1[k] + (p2[k] - p0[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t * t + (3 * p1[k] - p0[k] - 3 * p2[k] + p3[k]) * t * t * t);
      push(out, INSIDE, structure, c(0), c(1), c(2), 0, 0, 1);
    }
  }
  const last = at(points.length - 1);
  push(out, INSIDE, structure, last[0], last[1], last[2], 0, 0, 1);
}

/** The skeleton: spine, ribcage, skull, girdles, the long bones in pairs, hands and feet. */
function skeleton(out: Points) {
  // Spine: a gentle S from the base of the skull to the pelvis. Each vertebra is a ring with
  // a short spur pointing back; the gaps between them are the discs.
  for (let y = 1.34; y >= 0.02; y -= 0.043) {
    const z = -0.085 + 0.03 * Math.sin((y - 0.1) * 3.4);
    const wide = y > 1.12 ? 0.026 : 0.036; // the neck is slimmer
    ring(out, INSIDE, 'bones', [0, y, z], wide, wide * 0.85, 0.02);
    for (let k = 1; k <= 3; k++) push(out, INSIDE, 'bones', 0, y - k * 0.006, z - wide - k * 0.014, 0, 0, -1);
  }
  // Twelve pairs of ribs: open at the front below the breastbone, sloping down from the spine.
  for (let i = 0; i < 12; i++) {
    const y = 1.08 - i * 0.047;
    const width = 0.19 + 0.12 * Math.sin(((i + 1.4) / 12.6) * Math.PI);
    const gap = i < 7 ? 0.12 : i < 10 ? 0.34 + (i - 7) * 0.2 : 1.25 + (i - 10) * 0.3; // the last two float free
    ring(out, INSIDE, 'bones', [0, y, -0.005], width, 0.145, 0.018, { from: Math.PI / 2 + gap, to: Math.PI * 2.5 - gap, drop: 0.075 });
  }
  for (let y = 1.03; y >= 0.7; y -= 0.022) {
    for (const x of [-0.012, 0.012]) push(out, INSIDE, 'bones', x, y - 0.07, 0.14, 0, 0, 1); // breastbone
  }

  // Skull: the dome in thin slices, the eye sockets, the cheekbones and the jaw.
  for (let y = 1.6; y <= 1.8; y += 0.05) {
    const s = Math.sqrt(Math.max(0, 1 - ((y - 1.6) / 0.225) ** 2));
    ring(out, INSIDE, 'bones', [0, y, -0.005], 0.175 * s, 0.2 * s, 0.03);
  }
  ring(out, INSIDE, 'bones', [0, 1.53, 0], 0.172, 0.195, 0.03, { from: Math.PI * 0.72, to: Math.PI * 2.28 }); // back of the head
  for (const s of [1, -1] as const) {
    // Eye socket: a circle facing forward.
    const socket = Array.from({ length: 11 }, (_, k): V3 => {
      const a = (k / 10) * Math.PI * 2;
      return [s * 0.075 + 0.046 * Math.cos(a), 1.555 + 0.042 * Math.sin(a), 0.172];
    });
    strand(out, 'bones', socket, 0.016);
    strand(out, 'bones', [[s * 0.05, 1.5, 0.19], [s * 0.12, 1.49, 0.16], [s * 0.17, 1.5, 0.07]], 0.02); // cheekbone
    strand(out, 'bones', [[s * 0.17, 1.5, 0.02], [s * 0.15, 1.39, 0.03], [s * 0.1, 1.345, 0.11], [0, 1.325, 0.16]], 0.019); // jaw
  }
  strand(out, 'bones', [[-0.07, 1.4, 0.17], [0, 1.395, 0.185], [0.07, 1.4, 0.17]], 0.014); // teeth line

  for (const s of [1, -1] as const) {
    // Shoulder girdle: collarbone, and the shoulder blade as a triangle on the back.
    bone(out, [s * 0.04, 1.13, 0.1], [s * 0.42, 1.12, 0.02], 0.014);
    const blade: V3[] = [[s * 0.42, 1.1, -0.1], [s * 0.15, 1.06, -0.15], [s * 0.2, 0.74, -0.16], [s * 0.42, 1.1, -0.1]];
    strand(out, 'bones', blade, 0.02);
    strand(out, 'bones', [[s * 0.4, 1.04, -0.12], [s * 0.2, 0.98, -0.16]], 0.02); // its ridge
    organ(out, 'bones', [s * 0.45, 1.07, 0], [0.04, 0.04, 0.04], 0.024, 0.022); // ball of the shoulder

    // Arm: one bone above the elbow, two below, then the wrist and the hand.
    bone(out, [s * 0.45, 1.04, 0], [s * 0.58, 0.6, -0.01], 0.022);
    organ(out, 'bones', [s * 0.585, 0.57, -0.01], [0.032, 0.03, 0.032], 0.02, 0.02); // elbow
    bone(out, [s * 0.575, 0.54, 0.005], [s * 0.655, 0.15, 0.06], 0.011);
    bone(out, [s * 0.6, 0.54, -0.025], [s * 0.69, 0.15, 0.035], 0.011);
    ring(out, INSIDE, 'bones', [s * 0.682, 0.115, 0.05], 0.034, 0.018, 0.014); // wrist
    for (let f = 0; f < 4; f++) {
      const z = 0.035 + f * 0.018;
      strand(out, 'bones', [[s * 0.688, 0.09, z + 0.01], [s * 0.7, 0.0, z + 0.016], [s * 0.705, -0.075 - (f === 1 ? 0.012 : 0) + (f === 3 ? 0.022 : 0), z + 0.012]], 0.015);
    }
    strand(out, 'bones', [[s * 0.672, 0.09, 0.07], [s * 0.655, 0.035, 0.085], [s * 0.648, -0.02, 0.09]], 0.015); // thumb

    // Leg: the hip joint, thigh bone, kneecap, shin and the thinner bone beside it, the foot.
    organ(out, 'bones', [s * 0.17, -0.02, 0], [0.045, 0.045, 0.045], 0.024, 0.022); // head of the thigh bone
    bone(out, [s * 0.17, -0.05, 0], [s * 0.2, -0.86, 0], 0.03);
    organ(out, 'bones', [s * 0.2, -0.9, 0.035], [0.045, 0.045, 0.04], 0.024, 0.022); // kneecap
    bone(out, [s * 0.19, -0.95, 0.01], [s * 0.19, -1.66, 0], 0.022);
    bone(out, [s * 0.235, -0.97, -0.02], [s * 0.225, -1.66, -0.02], 0.01);
    organ(out, 'bones', [s * 0.2, -1.73, -0.03], [0.04, 0.04, 0.045], 0.022, 0.02); // heel
    for (let f = 0; f < 5; f++) {
      const x = s * (0.15 + f * 0.024);
      strand(out, 'bones', [[s * 0.2, -1.715, 0.01], [x, -1.755, 0.1], [x, -1.775, 0.2 - f * 0.012]], 0.016);
    }

    // Pelvis: the wing on each side, curving round to the back.
    strand(out, 'bones', [[s * 0.03, 0.02, -0.11], [s * 0.2, 0.17, -0.1], [s * 0.3, 0.2, -0.01], [s * 0.26, 0.12, 0.1], [s * 0.16, 0.02, 0.1], [s * 0.03, -0.07, 0.11]], 0.018);
    strand(out, 'bones', [[s * 0.06, -0.08, 0.09], [s * 0.13, -0.16, 0.03], [s * 0.08, -0.2, -0.04], [s * 0.03, -0.1, -0.06]], 0.018); // sitting bone
  }
  ring(out, INSIDE, 'bones', [0, 0.16, -0.02], 0.25, 0.13, 0.019, { drop: 0.1 });
  ring(out, INSIDE, 'bones', [0, 0.02, -0.01], 0.17, 0.1, 0.019, { drop: 0.05 });
  for (let y = 0.0; y >= -0.14; y -= 0.022) ring(out, INSIDE, 'bones', [0, y, -0.1 + (0 - y) * 0.15], 0.05 + y * 0.25, 0.02, 0.02); // sacrum, tapering to the tailbone
}

/**
 * The heart and blood vessels: one zone in the app, so they light together. Arteries run from
 * the arch above the heart; a vein follows each one a little apart. Illustration only.
 */
function vessels(out: Points) {
  organ(out, 'heart', [0.06, 0.93, 0.05], [0.085, 0.1, 0.07], 0.022, 0.018);
  /** An artery on side `s` and the vein that follows it, `apart` further out. */
  const both = (s: 1 | -1, artery: V3[], apart: V3 = [0.022, 0, -0.02]) => {
    strand(out, 'heart', artery);
    strand(out, 'heart', artery.map(([x, y, z]) => [x + s * apart[0], y + apart[1], z + apart[2]] as V3), 0.024);
  };

  // The arch over the heart, then the trunk down the front of the spine.
  strand(out, 'heart', [[0.05, 1.0, 0.04], [0.03, 1.09, 0.02], [-0.03, 1.1, -0.02], [-0.035, 1.0, -0.045], [-0.03, 0.6, -0.04], [-0.025, 0.2, -0.045]]);
  strand(out, 'heart', [[0.045, 0.2, -0.04], [0.05, 0.6, -0.03], [0.075, 0.86, 0.0], [0.08, 1.0, 0.02], [0.07, 1.12, 0.02]], 0.024); // the great vein beside it
  // To each lung: a short tree of branches.
  for (const s of [1, -1] as const) {
    const root: V3 = [s * 0.06, 0.97, 0.03];
    for (const [dx, dy, dz] of [[0.19, 0.1, 0.0], [0.23, 0.0, 0.02], [0.2, -0.11, 0.0], [0.13, -0.19, 0.03]] as const) {
      strand(out, 'heart', [root, [s * (0.06 + dx * 0.55), 0.97 + dy * 0.45, 0.03 + dz], [s * (0.06 + dx), 0.97 + dy, 0.03 + dz]], 0.02);
    }
  }
  // Branches in the belly: to the kidneys and the gut.
  for (const s of [1, -1] as const) {
    strand(out, 'heart', [[-0.03, 0.5, -0.04], [s * 0.1, 0.49, -0.06], [s * 0.17, 0.52, -0.07]], 0.02);
    strand(out, 'heart', [[-0.03, 0.4, -0.04], [s * 0.06, 0.34, 0.03], [s * 0.13, 0.28, 0.06]], 0.02);
  }

  for (const s of [1, -1] as const) {
    // Neck and head: up beside the windpipe, then over the temple and across the scalp.
    both(s, [[s * 0.02, 1.1, 0.0], [s * 0.06, 1.2, 0.02], [s * 0.07, 1.36, 0.03], [s * 0.11, 1.47, 0.07], [s * 0.15, 1.58, 0.09], [s * 0.13, 1.72, 0.06], [s * 0.06, 1.8, 0.0]]);
    strand(out, 'heart', [[s * 0.11, 1.47, 0.07], [s * 0.09, 1.52, 0.17], [s * 0.04, 1.6, 0.2]], 0.02); // to the face
    strand(out, 'heart', [[s * 0.15, 1.58, 0.09], [s * 0.17, 1.62, -0.04], [s * 0.12, 1.66, -0.15]], 0.02); // behind the ear

    // Arm: under the collarbone, down the inside of the arm, forking at the elbow, into the palm.
    both(s, [[s * 0.03, 1.09, 0.0], [s * 0.2, 1.1, 0.03], [s * 0.4, 1.04, 0.03], [s * 0.5, 0.82, 0.03], [s * 0.565, 0.58, 0.035]]);
    both(s, [[s * 0.565, 0.58, 0.035], [s * 0.6, 0.4, 0.05], [s * 0.645, 0.15, 0.085], [s * 0.675, 0.05, 0.09]], [0.016, 0, -0.012]);
    strand(out, 'heart', [[s * 0.565, 0.58, 0.035], [s * 0.63, 0.4, 0.02], [s * 0.69, 0.15, 0.03], [s * 0.705, 0.05, 0.05]], 0.02);
    strand(out, 'heart', [[s * 0.675, 0.05, 0.09], [s * 0.69, 0.01, 0.075], [s * 0.705, 0.05, 0.05]], 0.016); // arch in the palm
    for (let f = 0; f < 4; f++) strand(out, 'heart', [[s * 0.692, 0.012, 0.05 + f * 0.016], [s * 0.708, -0.07, 0.048 + f * 0.017]], 0.018);

    // Leg: out over the pelvis, down the thigh, behind the knee, forking to the foot.
    both(s, [[-0.025, 0.2, -0.045], [s * 0.08, 0.1, -0.02], [s * 0.15, -0.04, 0.05], [s * 0.16, -0.4, 0.06], [s * 0.18, -0.75, 0.0], [s * 0.2, -0.93, -0.06]]);
    both(s, [[s * 0.2, -0.93, -0.06], [s * 0.21, -1.15, -0.05], [s * 0.2, -1.5, -0.03], [s * 0.19, -1.7, -0.02]], [0.016, 0, 0.016]);
    strand(out, 'heart', [[s * 0.2, -0.98, -0.05], [s * 0.18, -1.2, 0.04], [s * 0.185, -1.55, 0.045], [s * 0.19, -1.72, 0.07], [s * 0.19, -1.76, 0.18]], 0.02);
    strand(out, 'heart', [[s * 0.16, -0.12, 0.05], [s * 0.26, -0.3, 0.04], [s * 0.27, -0.5, 0.0]], 0.02); // branch round the thigh
    strand(out, 'heart', [[s * 0.15, -1.75, 0.15], [s * 0.19, -1.74, 0.17], [s * 0.24, -1.755, 0.14]], 0.016); // arch over the foot
  }
}

function inside(out: Points) {
  skeleton(out);
  vessels(out);
  organ(out, 'brain', [0, 1.63, -0.01], [0.14, 0.125, 0.165], 0.03, 0.022, 0.05);
  for (const s of [1, -1]) organ(out, 'eyes', [s * 0.075, 1.555, 0.165], [0.03, 0.03, 0.03], 0.015, 0.016);
  organ(out, 'gut', [0, 0.31, 0.035], [0.17, 0.16, 0.09], 0.036, 0.019, 0.09);
}

/** The pad the figure stands on: three rings under the feet. */
function pad(out: Points) {
  for (const [radius, step] of [[0.52, 0.03], [0.8, 0.045], [1.08, 0.06]] as const) {
    ring(out, PAD, '', [0, -1.84, 0.04], radius, radius, step);
  }
}

let figure: Points | null = null;
function buildFigure(): Points {
  if (!figure) {
    figure = { position: [], normal: [], kind: [], structure: [] };
    shell(figure);
    inside(figure);
    pad(figure);
  }
  return figure;
}

/** How far around its anchor each zone lights the skin. Mirrored zones exist on both sides. */
const ZONE_RADIUS: Record<string, number> = {
  eyes: 0.1,
  inner_ear: 0.11,
  brain: 0.24,
  heart: 0.19,
  gut: 0.22,
  skin: 0.16,
  muscles: 0.23,
  bones: 0.18,
};
const MIRRORED = new Set(['inner_ear', 'muscles', 'bones', 'skin']);
const PRIORITY = ['eyes', 'inner_ear', 'heart', 'brain', 'gut', 'skin', 'muscles', 'bones'];

export interface BodyCloud {
  positions: Float32Array;
  normals: Float32Array;
  /** SHELL, INSIDE or PAD for each particle. */
  kinds: Float32Array;
  /** Index into `zones` for each particle, or -1 when it belongs to no specific zone. */
  zoneOf: Int8Array;
  /** How strongly the particle takes its zone's colour: 1 at the anchor, fading to 0 at the edge. */
  zoneWeight: Float32Array;
  count: number;
}

export function zoneAnchors(zone: Zone): V3[] {
  const [x, y, z] = zone.anchor;
  return MIRRORED.has(zone.id) ? [zone.anchor, [-x, y, z]] : [zone.anchor];
}

export function buildCloud(zones: Zone[]): BodyCloud {
  const fig = buildFigure();
  const count = fig.kind.length;
  const zoneOf = new Int8Array(count).fill(-1);
  const zoneWeight = new Float32Array(count);
  const indexOf = new Map(zones.map((z, i) => [z.id, i] as const));
  const ordered = PRIORITY.flatMap((id) => {
    const index = indexOf.get(id);
    const zone = index === undefined ? undefined : zones[index];
    return zone && index !== undefined ? [{ index, anchors: zoneAnchors(zone), radius: ZONE_RADIUS[id] ?? 0.15 }] : [];
  });

  for (let i = 0; i < count; i++) {
    const named = fig.structure[i];
    if (named) {
      zoneOf[i] = indexOf.get(named) ?? -1;
      zoneWeight[i] = 1;
      continue;
    }
    if (fig.kind[i] !== SHELL) continue;
    const x = fig.position[i * 3]!;
    const y = fig.position[i * 3 + 1]!;
    const z = fig.position[i * 3 + 2]!;
    for (const zone of ordered) {
      let nearest = Infinity;
      for (const a of zone.anchors) nearest = Math.min(nearest, Math.hypot(x - a[0], y - a[1], z - a[2]));
      if (nearest <= zone.radius) {
        zoneOf[i] = zone.index;
        zoneWeight[i] = Math.min(1, (1 - nearest / zone.radius) * 2.2); // solid core, soft edge
        break;
      }
    }
  }
  return {
    positions: Float32Array.from(fig.position),
    normals: Float32Array.from(fig.normal),
    kinds: Float32Array.from(fig.kind),
    zoneOf,
    zoneWeight,
    count,
  };
}

/* ---------- flat view ---------- */

/**
 * Closed outlines of the figure seen from the front, in body units, at `level` inside the
 * skin (0 = the outline itself, 0.05 = a line 0.05 units inside it). Marching squares.
 */
export function outlineLoops(level = 0, cell = 0.02): [number, number][][] {
  const x0 = -0.96;
  const y0 = -1.96;
  const nx = Math.round(1.92 / cell);
  const ny = Math.round(3.92 / cell);
  const w = nx + 1;
  const value = new Float32Array(w * (ny + 1));
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) value[j * w + i] = outlineDistance(x0 + i * cell, y0 + j * cell) + level;
  }
  const at = (i: number, j: number) => value[j * w + i]!;
  // Every grid edge the outline crosses gets one point; a cell links the points on its edges.
  const horizontal = (i: number, j: number) => (j * w + i) * 2;
  const vertical = (i: number, j: number) => (j * w + i) * 2 + 1;
  const links = new Map<number, number[]>();
  const link = (a: number, b: number) => {
    links.set(a, [...(links.get(a) ?? []), b]);
    links.set(b, [...(links.get(b) ?? []), a]);
  };
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const code = (at(i, j) < 0 ? 1 : 0) | (at(i + 1, j) < 0 ? 2 : 0) | (at(i + 1, j + 1) < 0 ? 4 : 0) | (at(i, j + 1) < 0 ? 8 : 0);
      if (code === 0 || code === 15) continue;
      const B = horizontal(i, j);
      const R = vertical(i + 1, j);
      const T = horizontal(i, j + 1);
      const L = vertical(i, j);
      if (code === 1 || code === 14) link(L, B);
      else if (code === 2 || code === 13) link(B, R);
      else if (code === 3 || code === 12) link(L, R);
      else if (code === 4 || code === 11) link(R, T);
      else if (code === 6 || code === 9) link(B, T);
      else if (code === 7 || code === 8) link(L, T);
      else if (code === 5) {
        link(L, B);
        link(R, T);
      } else {
        link(B, R); // code 10
        link(T, L);
      }
    }
  }
  const point = (edge: number): [number, number] => {
    const index = edge >> 1;
    const i = index % w;
    const j = (index - i) / w;
    const a = at(i, j);
    if (edge % 2 === 0) return [x0 + (i + a / (a - at(i + 1, j))) * cell, y0 + j * cell];
    return [x0 + i * cell, y0 + (j + a / (a - at(i, j + 1))) * cell];
  };
  const seen = new Set<number>();
  const loops: [number, number][][] = [];
  for (const start of links.keys()) {
    if (seen.has(start)) continue;
    const loop: [number, number][] = [];
    let previous = -1;
    let current = start;
    while (!seen.has(current)) {
      seen.add(current);
      loop.push(point(current));
      const next = (links.get(current) ?? []).find((e) => e !== previous && !seen.has(e));
      if (next === undefined) break;
      previous = current;
      current = next;
    }
    if (loop.length > 8) loops.push(loop);
  }
  return loops;
}

/** The skeleton and organs of the particle view, flattened to x/y, grouped by zone id. */
export function insidePoints(): Record<string, [number, number][]> {
  const fig = buildFigure();
  const out: Record<string, [number, number][]> = {};
  for (let i = 0; i < fig.kind.length; i++) {
    const zone = fig.structure[i];
    if (!zone) continue;
    (out[zone] ??= []).push([fig.position[i * 3]!, fig.position[i * 3 + 1]!]);
  }
  return out;
}

const RANK: Record<Status, number> = { nominal: 0, watch: 1, call_ground: 2 };

/** A zone takes the most urgent status of the indicators mapped to it. */
export function zoneStatuses(bundle: Bundle, dash: Dashboard | null): Record<string, Status> {
  const out: Record<string, Status> = {};
  for (const zone of bundle.zones) out[zone.id] = 'nominal';
  for (const view of dash?.indicators ?? []) {
    const def = bundle.indicators.find((i) => i.id === view.id);
    for (const zone of def?.zones ?? []) {
      const current = out[zone] ?? 'nominal';
      if (RANK[view.status] > RANK[current]) out[zone] = view.status;
    }
  }
  return out;
}

export function webglAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}
