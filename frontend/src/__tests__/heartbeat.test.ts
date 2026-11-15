import { describe, expect, it } from 'vitest';
import { BEAT_MAX_BPM, BEAT_MIN_BPM, beatAt, beatRate } from '../lib/heartbeat';

describe('heartbeat', () => {
  it('beats at the reading that is on screen, once a minute per bpm', () => {
    expect(beatRate(60)).toBeCloseTo(1, 6);
    expect(beatRate(63)).toBeCloseTo(1.05, 6);
    expect(beatRate(75)).toBeCloseTo(1.25, 6);
  });

  it('does not pulse without a reading', () => {
    for (const bad of [null, undefined, 0, -5, Number.NaN, Number.POSITIVE_INFINITY * 0]) expect(beatRate(bad)).toBeNull();
  });

  it('keeps the pulse to a rate that is comfortable to look at', () => {
    expect(beatRate(400)).toBeCloseTo(BEAT_MAX_BPM / 60, 6);
    expect(beatRate(400) ?? 0).toBeLessThanOrEqual(2.5);
    expect(beatRate(5)).toBeCloseTo(BEAT_MIN_BPM / 60, 6);
  });

  it('has a strong first beat, a softer second, and rests between', () => {
    const lub = beatAt(0.04);
    const dub = beatAt(0.27);
    expect(lub).toBeGreaterThan(0.95);
    expect(dub).toBeGreaterThan(0.5);
    expect(dub).toBeLessThan(lub);
    expect(beatAt(0.65)).toBeLessThan(0.01);
    expect(beatAt(0.95)).toBeLessThan(0.05);
  });

  it('repeats every beat and stays between 0 and 1', () => {
    for (let i = 0; i < 200; i++) {
      const phase = i / 37;
      expect(beatAt(phase)).toBeGreaterThanOrEqual(0);
      expect(beatAt(phase)).toBeLessThanOrEqual(1);
      expect(beatAt(phase + 3)).toBeCloseTo(beatAt(phase), 9);
    }
  });
});
