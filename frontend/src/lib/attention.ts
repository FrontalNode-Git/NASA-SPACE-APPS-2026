/**
 * "What needs attention": the readings that are not Nominal, most urgent first, each with
 * the reason in words. The reason only restates what the server already decided (status,
 * side of the baseline, drift); no thresholds live here.
 */
import type { Dashboard, IndicatorView, Status } from './types';

export type Translate = (key: string, params?: Record<string, string | number>) => string;

export interface AttentionItem {
  id: string;
  name: string;
  status: Status;
  /** Null when the details are private to the crew member and the viewer is someone else. */
  reason: string | null;
}

const URGENCY: Record<Status, number> = { call_ground: 0, watch: 1, nominal: 2 };

export function driftText(t: Translate, view: IndicatorView): string | null {
  if (!view.drift?.flag || !view.drift.direction) return null;
  return t(view.drift.direction === 'above' ? 'drift.above' : 'drift.below', { n: view.drift.days });
}

function reason(t: Translate, view: IndicatorView): string | null {
  if (view.locked) return null;
  const parts: string[] = [];
  const drift = driftText(t, view);
  const z = view.z ?? 0;
  // Call ground always comes from today's reading. A Watch with no drift does too.
  if (z !== 0 && (view.status === 'call_ground' || !drift)) {
    const far = view.status === 'call_ground' ? 'Far' : '';
    parts.push(t(`attention.${z > 0 ? 'above' : 'below'}${far}`));
  }
  if (drift) parts.push(drift);
  return parts.length ? parts.join(' · ') : null;
}

export function attentionItems(dash: Dashboard, t: Translate): AttentionItem[] {
  return dash.indicators
    .filter((view) => view.status !== 'nominal')
    .map((view) => ({ id: view.id, name: view.name, status: view.status, reason: reason(t, view) }))
    .sort((a, b) => URGENCY[a.status] - URGENCY[b.status]);
}
