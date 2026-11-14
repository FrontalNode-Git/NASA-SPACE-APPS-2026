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
      <div className="mt-1 flex h-7 w-full overflow-hidden rounded-md border border-line text-[11px]">
        {mission_phases.map((p) => {
          const active = p.id === phase?.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setDay(Math.max(p.start, 1))}
              style={{ width: `${((p.end - Math.max(p.start, 1) + 1) / total) * 100}%` }}
              className={`truncate border-r border-line px-1 last:border-r-0 ${
                active ? 'bg-accent/25 font-semibold text-ink' : 'bg-bg/50 text-muted hover:text-ink'
              }`}
              title={`${p.name}: ${t('common.dayRange', { a: Math.max(p.start, 1), b: p.end })}`}
            >
              {p.name}
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
