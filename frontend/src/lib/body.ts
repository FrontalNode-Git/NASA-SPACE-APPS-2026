import type { Bundle, Dashboard, Status, Zone } from './types';

type V3 = [number, number, number];

interface Ellipsoid {
  kind: 'ellipsoid';
  c: V3;
  r: V3;
  weight: number;
}
interface Capsule {
  kind: 'capsule';
  a: V3;
  b: V3;
  r: number;
  weight: number;
}
type Part = Ellipsoid | Capsule;

const side = (s: 1 | -1): Part[] => [
  { kind: 'capsule', a: [s * 0.5, 1.08, 0], b: [s * 0.6, 0.6, 0], r: 0.1, weight: 5 }, // upper arm
  { kind: 'capsule', a: [s * 0.6, 0.6, 0], b: [s * 0.68, 0.12, 0.05], r: 0.08, weight: 4 }, // forearm
  { kind: 'ellipsoid', c: [s * 0.7, -0.02, 0.06], r: [0.07, 0.11, 0.05], weight: 1.5 }, // hand
  { kind: 'capsule', a: [s * 0.2, -0.12, 0], b: [s * 0.22, -0.85, 0], r: 0.15, weight: 10 }, // thigh
  { kind: 'capsule', a: [s * 0.22, -0.85, 0], b: [s * 0.22, -1.66, 0], r: 0.105, weight: 7 }, // shin
  { kind: 'ellipsoid', c: [s * 0.22, -1.76, 0.09], r: [0.09, 0.06, 0.19], weight: 2 }, // foot
];

/** A stylised human figure out of simple volumes. Units: roughly metres x 2, feet at -1.8, head top at 1.85. */
export const BODY_PARTS: Part[] = [
  { kind: 'ellipsoid', c: [0, 1.55, 0], r: [0.23, 0.29, 0.25], weight: 8 }, // head
  { kind: 'capsule', a: [0, 1.2, 0], b: [0, 1.3, 0], r: 0.09, weight: 1 }, // neck
  { kind: 'ellipsoid', c: [0, 0.86, 0], r: [0.43, 0.37, 0.23], weight: 14 }, // chest
  { kind: 'ellipsoid', c: [0, 0.4, 0], r: [0.34, 0.33, 0.2], weight: 9 }, // abdomen
  { kind: 'ellipsoid', c: [0, 0.03, 0], r: [0.37, 0.24, 0.21], weight: 7 }, // pelvis
  ...side(1),
  ...side(-1),
];

/** How far around its anchor each zone claims particles. Mirrored zones exist on both sides. */
const ZONE_RADIUS: Record<string, number> = {
  eyes: 0.1,
  inner_ear: 0.1,
  brain: 0.22,
  heart: 0.17,
  gut: 0.2,
  skin: 0.14,
  muscles: 0.2,
  bones: 0.16,
};
const MIRRORED = new Set(['inner_ear', 'muscles', 'bones', 'skin']);
const PRIORITY = ['eyes', 'inner_ear', 'heart', 'brain', 'gut', 'skin', 'muscles', 'bones'];

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function samplePart(part: Part, rand: () => number): V3 {
  // Random direction, radius biased towards the surface so the figure reads as a shell.
  const u = rand() * 2 - 1;
  const phi = rand() * Math.PI * 2;
  const s = Math.sqrt(1 - u * u);
  const dir: V3 = [s * Math.cos(phi), u, s * Math.sin(phi)];
  const rad = Math.pow(rand(), 1 / 6);
  if (part.kind === 'ellipsoid') {
    return [part.c[0] + dir[0] * part.r[0] * rad, part.c[1] + dir[1] * part.r[1] * rad, part.c[2] + dir[2] * part.r[2] * rad];
  }
  const k = rand();
  return [
    part.a[0] + (part.b[0] - part.a[0]) * k + dir[0] * part.r * rad,
    part.a[1] + (part.b[1] - part.a[1]) * k + dir[1] * part.r * rad,
    part.a[2] + (part.b[2] - part.a[2]) * k + dir[2] * part.r * rad,
  ];
}

export interface BodyCloud {
  positions: Float32Array;
  /** Index into `zones` for each particle, or -1 when it belongs to no specific zone. */
  zoneOf: Int8Array;
  count: number;
}

export function zoneAnchors(zone: Zone): V3[] {
  const [x, y, z] = zone.anchor;
  return MIRRORED.has(zone.id) ? [zone.anchor, [-x, y, z]] : [zone.anchor];
}

export function buildCloud(zones: Zone[], count = 7000, seed = 7): BodyCloud {
  const rand = mulberry32(seed);
  const totalWeight = BODY_PARTS.reduce((sum, p) => sum + p.weight, 0);
  const positions = new Float32Array(count * 3);
  const zoneOf = new Int8Array(count).fill(-1);
  const ordered = PRIORITY.flatMap((id) => {
    const index = zones.findIndex((z) => z.id === id);
    const zone = zones[index];
    return zone ? [{ index, anchors: zoneAnchors(zone), radius: ZONE_RADIUS[id] ?? 0.15 }] : [];
  });

  for (let i = 0; i < count; i++) {
    let pick = rand() * totalWeight;
    let part = BODY_PARTS[0] as Part;
    for (const candidate of BODY_PARTS) {
      pick -= candidate.weight;
      if (pick <= 0) {
        part = candidate;
        break;
      }
    }
    const p = samplePart(part, rand);
    positions.set(p, i * 3);
    for (const zone of ordered) {
      const hit = zone.anchors.some(
        (a) => Math.hypot(p[0] - a[0], p[1] - a[1], p[2] - a[2]) <= zone.radius,
      );
      if (hit) {
        zoneOf[i] = zone.index;
        break;
      }
    }
  }
  return { positions, zoneOf, count };
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
