import { useApp, useT } from '../lib/store';

/** Mission-day slider over the fictional mission, with its phases drawn to scale. */
export function MissionScrubber({ compact = false }: { compact?: boolean }) {
  const t = useT();
  const mission = useApp((s) => s.bundle?.mission);
  const day = useApp((s) => s.day);
  const setDay = useApp((s) => s.setDay);
  if (!mission) return null;
  const total = mission.total_days;
  const phase = mission.phases.find((p) => day >= p.start && day <= p.end) ?? mission.phases[0];
  const mission_phases = mission.phases.filter((p) => p.end > 0);
  const first = (start: number) => Math.max(start, 1);

  return (
    <div data-testid="mission-scrubber">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <label htmlFor={compact ? 'scrub-compact' : 'scrub'} className="font-display font-semibold">
          {t('common.day', { n: day })} <span className="font-sans text-sm font-normal text-muted">/ {total}</span>
        </label>
        <span className="text-sm text-accent" data-testid="phase-name">
          {phase?.name}
        </span>
      </div>
      <input
        id={compact ? 'scrub-compact' : 'scrub'}
        type="range"
        min={0}
        max={total}
        value={day}
        onChange={(e) => setDay(Number(e.target.value))}
        className="mt-2 w-full accent-[rgb(var(--accent))]"
        aria-valuetext={`${t('common.day', { n: day })}, ${phase?.name ?? ''}`}
      />
      {/* The bar shows how long each phase is, to scale. The names sit under it, where they fit. */}
      <div className="mt-1 flex h-2.5 w-full overflow-hidden rounded-full border border-line" aria-hidden="true">
        {mission_phases.map((p) => (
          <span
            key={p.id}
            style={{ width: `${((p.end - first(p.start) + 1) / total) * 100}%` }}
            className={`border-r border-line last:border-r-0 ${p.id === phase?.id ? 'bg-accent' : 'bg-bg/50'}`}
          />
        ))}
      </div>
      <div
        className="mt-1.5 grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${mission_phases.length}, minmax(0, 1fr))` }}
        data-testid="phase-list"
      >
        {mission_phases.map((p) => {
          const active = p.id === phase?.id;
          return (
            <button
              key={p.id}
              type="button"
              data-phase={p.id}
              aria-current={active ? 'step' : undefined}
              onClick={() => setDay(first(p.start))}
              className={`min-h-[44px] rounded-md border px-2 py-1 text-left text-xs leading-tight ${
                active ? 'border-accent bg-accent/15 text-ink' : 'border-line text-muted hover:text-ink'
              }`}
            >
              <span className="block font-semibold">{p.name}</span>
              <span className="block">{t('common.dayRange', { a: first(p.start), b: p.end })}</span>
            </button>
          );
        })}
      </div>
      {!compact && (
        <div className="mt-2 flex flex-wrap gap-2">
          {[0, 8, 20, 183, 600, 913, total].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDay(d)}
              className={`min-h-[36px] rounded-md border px-2.5 text-xs ${d === day ? 'border-accent text-accent' : 'border-line text-muted hover:text-ink'}`}
            >
              {d === 0 ? t('mission.preflight') : t('common.day', { n: d })}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
