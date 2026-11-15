/**
 * Whether this browser has already been shown the "take the tour" hint. It is shown once, to
 * someone opening the plain link for the first time, and never again after they start the
 * tour or turn it away. Storage can be unavailable (private mode): then the hint simply shows
 * on each visit, which is harmless.
 */
const KEY = 'vital-tour-seen';

export function tourHintSeen(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function markTourHintSeen(): void {
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    // nothing to do: the hint will show again next time
  }
}
