import { describe, expect, it } from 'vitest';
import model from '../../../data/app/model.json';
import { buildCloud, INSIDE, insidePoints, outlineDistance, outlineLoops, PAD, SHELL, zoneAnchors } from '../lib/body';
import type { Zone } from '../lib/types';

const zones = model.zones as unknown as Zone[];

describe('body figure', () => {
  it('builds a particle cloud with a skin, a skeleton with organs, and a pad', () => {
    const started = performance.now();
    const cloud = buildCloud(zones);
    expect(performance.now() - started).toBeLessThan(3000);

    const kinds = Array.from(cloud.kinds);
    const skin = kinds.filter((k) => k === SHELL).length;
    expect(skin).toBeGreaterThan(9000);
    expect(kinds.filter((k) => k === INSIDE).length).toBeGreaterThan(1500);
    expect(kinds.filter((k) => k === PAD).length).toBeGreaterThan(100);
    expect(cloud.positions.every(Number.isFinite)).toBe(true);
    expect(cloud.normals.every(Number.isFinite)).toBe(true);

    // The figure stands between the pad and the top of the head, arms a little out.
    let top = -Infinity;
    let reach = 0;
    for (let i = 0; i < cloud.count; i++) {
      if (cloud.kinds[i] !== SHELL) continue;
      top = Math.max(top, cloud.positions[i * 3 + 1] ?? 0);
      reach = Math.max(reach, Math.abs(cloud.positions[i * 3] ?? 0));
    }
    expect(top).toBeGreaterThan(1.78);
    expect(top).toBeLessThan(1.9);
    expect(reach).toBeGreaterThan(0.7);
    expect(reach).toBeLessThan(0.82);
  });

  it('lights every zone that has a place on the body', () => {
    const cloud = buildCloud(zones);
    const lit = new Set(Array.from(cloud.zoneOf).filter((z) => z >= 0).map((z) => zones[z]?.id));
    for (const zone of zones) {
      if (zone.id !== 'whole_body') expect(lit, zone.id).toContain(zone.id);
    }
    // Structures inside the body belong to their zone outright.
    const inside = insidePoints();
    expect(Object.keys(inside).sort()).toEqual(['bones', 'brain', 'eyes', 'gut', 'heart']);
  });

  it('traces one closed outline, and every zone anchor sits on the figure', () => {
    const loops = outlineLoops(0);
    expect(loops).toHaveLength(1);
    const ys = (loops[0] ?? []).map(([, y]) => y);
    expect(Math.min(...ys)).toBeLessThan(-1.78);
    expect(Math.max(...ys)).toBeGreaterThan(1.8);
    for (const zone of zones) {
      for (const [x, y] of zoneAnchors(zone)) expect(outlineDistance(x, y), zone.id).toBeLessThan(0.01);
    }
  });
});
