import type { Bundle, HazardLinkKind } from './types';

/** An empty lens dims nothing. Otherwise an item stays lit if it is linked to any selected hazard. */
export function isLit(linkedHazards: readonly string[] | undefined, lens: readonly string[]): boolean {
  if (lens.length === 0) return true;
  return (linkedHazards ?? []).some((h) => lens.includes(h));
}

export function toggleHazard(lens: readonly string[], hazard: string): string[] {
  return lens.includes(hazard) ? lens.filter((h) => h !== hazard) : [...lens, hazard];
}

export function litIds(bundle: Bundle, kind: HazardLinkKind, lens: readonly string[]): string[] {
  return Object.entries(bundle.hazard_links[kind])
    .filter(([, hazards]) => isLit(hazards, lens))
    .map(([id]) => id);
}

/** Hazards emphasised on a mission day: those linked to the facts of that phase's environment. */
export function emphasisedHazards(bundle: Bundle, day: number): string[] {
  const phase = bundle.mission.phases.find((p) => day >= p.start && day <= p.end);
  if (!phase?.environment) return [];
  return bundle.hazard_links.environments[phase.environment] ?? [];
}
