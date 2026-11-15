import { afterEach, describe, expect, it, vi } from 'vitest';
import { markTourHintSeen, tourHintSeen } from '../lib/tourHint';

describe('tour hint memory', () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('is not seen at first, and is remembered once marked', () => {
    expect(tourHintSeen()).toBe(false);
    markTourHintSeen();
    expect(tourHintSeen()).toBe(true);
  });

  it('copes with storage that refuses to work', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(tourHintSeen()).toBe(false);
    expect(() => markTourHintSeen()).not.toThrow();
  });
});
