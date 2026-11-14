import { describe, expect, it } from 'vitest';
import { emphasisedHazards, isLit, litIds, toggleHazard } from '../lib/lens';
import { bundle } from './fixture';

describe('hazard lens filtering', () => {
  it('dims nothing while no hazard is selected', () => {
    expect(isLit([], [])).toBe(true);
    expect(isLit(undefined, [])).toBe(true);
    expect(litIds(bundle, 'risks', [])).toEqual(['bone', 'sleep']);
  });

  it('keeps only items linked to the selected hazard', () => {
    expect(litIds(bundle, 'risks', ['gravity'])).toEqual(['bone']);
    expect(litIds(bundle, 'studies', ['gravity'])).toEqual(['zero-t2']);
    expect(litIds(bundle, 'indicators', ['gravity'])).toEqual(['heart_rate']);
    expect(litIds(bundle, 'zones', ['gravity'])).toEqual(['heart', 'bones']);
  });

  it('dims items with no hazard link whenever a lens is on', () => {
    expect(isLit([], ['gravity'])).toBe(false);
    expect(isLit(undefined, ['gravity'])).toBe(false);
    expect(litIds(bundle, 'zones', ['radiation'])).toEqual([]);
  });

  it('multi-select lights the union', () => {
    expect(litIds(bundle, 'studies', ['gravity', 'isolation'])).toEqual(['zero-t2', 'space-gardening']);
    expect(litIds(bundle, 'indicators', ['gravity', 'distance'])).toEqual(['heart_rate', 'mood']);
  });

  it('toggles a hazard on and off without mutating the lens', () => {
    const lens = ['gravity'];
    expect(toggleHazard(lens, 'radiation')).toEqual(['gravity', 'radiation']);
    expect(toggleHazard(lens, 'gravity')).toEqual([]);
    expect(lens).toEqual(['gravity']);
  });

  it('emphasises the hazards of the mission phase for a day', () => {
    expect(emphasisedHazards(bundle, 0)).toEqual([]);
    expect(emphasisedHazards(bundle, 20)).toEqual(['radiation', 'isolation', 'distance']);
    expect(emphasisedHazards(bundle, 183)).toEqual(['distance', 'gravity']);
  });
});
