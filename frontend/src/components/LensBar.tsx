import { emphasisedHazards, litIds } from '../lib/lens';
import { useApp, useT } from '../lib/store';
import { useFacts } from './Fact';

/**
 * Hazard lens: a filter for the dashboard. Selecting a hazard dims the vitals and body
 * zones that are not linked to it. Multi-select; Shift+1…5 from the keyboard.
 */
export function LensBar() {
  const t = useT();
  const bundle = useApp((s) => s.bundle);
  const lens = useApp((s) => s.lens);
  const day = useApp((s) => s.day);
  const toggle = useApp((s) => s.toggleLens);
  const setLens = useApp((s) => s.setLens);
  const facts = useFacts();
  if (!bundle) return null;
  const emphasised = emphasisedHazards(bundle, day);
  const selected = bundle.hazards.filter((h) => lens.includes(h.id));

  return (
    <div className="rounded-xl border border-line bg-panel/60 px-3 py-2" data-testid="lens">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t('lens.title')}>
        <span className="mr-1 text-xs font-semibold uppercase tracking-wider text-muted">{t('lens.title')}</span>
        {bundle.hazards.map((h, i) => {
          const on = lens.includes(h.id);
          return (
            <button
              key={h.id}
              type="button"
              data-lens-chip={h.id}
              aria-pressed={on}
              title={`${h.name} · Shift+${i + 1}`}
              onClick={() => toggle(h.id)}
              className={`relative min-h-[40px] rounded-full border px-3.5 text-sm font-medium transition ${
                on ? 'border-accent bg-accent text-bg' : 'border-line bg-panel text-ink hover:border-accent'
              }`}
            >
              {h.short}
              {emphasised.includes(h.id) && !on && (
                <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-accent" title={t('lens.emphasised')}>
                  <span className="sr-only">{t('lens.emphasised')}</span>
                </span>
              )}
            </button>
          );
        })}
        {lens.length > 0 && (
          <button type="button" onClick={() => setLens([])} className="min-h-[40px] px-2 text-sm text-muted underline underline-offset-2 hover:text-ink">
            {t('lens.clear')}
          </button>
        )}
      </div>
      {selected.length > 0 && (
        <div className="mt-2 space-y-1 text-sm" data-testid="lens-caption">
          {selected.map((h) => (
            <p key={h.id} className="text-muted">
              <span className="font-semibold text-accent">{h.name}.</span> {facts.get(h.fact_ids[0] ?? '')?.text}
            </p>
          ))}
          <p className="text-xs text-muted">
            {t('lens.counts', { indicators: litIds(bundle, 'indicators', lens).length, zones: litIds(bundle, 'zones', lens).length })}
          </p>
        </div>
      )}
    </div>
  );
}
