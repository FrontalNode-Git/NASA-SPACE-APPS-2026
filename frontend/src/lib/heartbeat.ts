/**
 * The beat of the heart on the body scan. It only repeats the resting heart rate that is on
 * screen: the figure's heart pulses that many times a minute. It adds no number of its own.
 */

/** Slowest and fastest beat that is drawn. A reading outside this still shows as a number; the
 *  pulse is kept within a rate that is comfortable to look at (never faster than 2.5 a second). */
export const BEAT_MIN_BPM = 30;
export const BEAT_MAX_BPM = 150;

/** Beats per second for a reading, or null when there is none (then the heart does not pulse). */
export function beatRate(bpm: number | null | undefined): number | null {
  if (bpm === null || bpm === undefined || !Number.isFinite(bpm) || bpm <= 0) return null;
  return Math.min(BEAT_MAX_BPM, Math.max(BEAT_MIN_BPM, bpm)) / 60;
}

/**
 * How strong the pulse is at a point in time: 0 at rest, 1 at the peak of the first of the two
 * beats ("lub-dub"). `phase` counts beats, so 2.5 is half way through the third.
 */
export function beatAt(phase: number): number {
  const p = phase - Math.floor(phase);
  const lub = Math.exp(-(((p - 0.04) / 0.05) ** 2));
  const dub = 0.6 * Math.exp(-(((p - 0.27) / 0.06) ** 2));
  return Math.min(1, lub + dub);
}
