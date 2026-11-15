import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useApp, useT } from '../lib/store';
import type { CrewMember, Dashboard, IndicatorView } from '../lib/types';
import { Icon, indicatorIcon } from './Icon';
import { Panel, Tag } from './ui';

interface Row {
  member: CrewMember;
  view: IndicatorView & { baseline: { mean: number; sd: number; n: number } };
}

const clamp = (n: number) => Math.min(100, Math.max(0, n));

/**
 * One reading, laid on each crew member's own normal. The same number can be unremarkable for
 * one person and far from normal for another: the idea of the whole app, in one picture.
 *
 * It only restates the personal baselines the dashboards already carry. Distance is counted in
 * that person's own spreads (standard deviations), and no verdict or threshold is added here.
 */
export function SameReading() {
  const t = useT();
  const viewer = useApp((s) => s.viewer);
  const day = useApp((s) => s.day);
  const seed = useApp((s) => s.seed);
  const crew = useApp((s) => s.bundle?.crew);
  const refreshed = useApp((s) => s.crew); // changes whenever the day, a scenario or an entry changes
  const [boards, setBoards] = useState<{ member: CrewMember; dash: Dashboard }[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [vital, setVital] = useState('heart_rate');
  const [override, setOverride] = useState<number | null>(null);

  useEffect(() => {
    if (!crew) return;
    let live = true;
    setFailed(false);
    Promise.all(crew.map((member) => api.dashboard(member.id, viewer, day, seed).then((dash) => ({ member, dash }))))
      .then((all) => live && setBoards(all))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [crew, viewer, day, seed, refreshed]);

  // A new choice of vital, person, day or scenario starts again from the person's own reading.
  useEffect(() => setOverride(null), [vital, viewer, day, seed]);

  // The vitals everyone can see: not the private ones (mood), and only those with a baseline.
  const vitals = useMemo(() => {
    const first = boards?.[0]?.dash.indicators ?? [];
    return first.filter((i) => !i.private && !i.locked && i.baseline);
  }, [boards]);

  const rows: Row[] = useMemo(
    () =>
      (boards ?? []).flatMap(({ member, dash }) => {
        const view = dash.indicators.find((i) => i.id === vital && !i.locked && i.baseline);
        return view?.baseline ? [{ member, view: view as Row['view'] }] : [];
      }),
    [boards, vital],
  );
  const meta = vitals.find((v) => v.id === vital) ?? vitals[0];

  if (failed) return null;
  if (!boards || !meta || rows.length === 0) {
    return (
      <Panel className="mt-4" title={t('same.title')}>
        <p className="text-sm text-muted" role="status">
          {t('app.loading')}
        </p>
      </Panel>
    );
  }

  const step = 1 / 10 ** meta.decimals;
  const lo = Math.min(...rows.map((r) => r.view.baseline.mean - 4 * r.view.baseline.sd));
  const hi = Math.max(...rows.map((r) => r.view.baseline.mean + 4 * r.view.baseline.sd));
  const own = rows.find((r) => r.member.id === viewer)?.view.latest;
  const mean = rows.reduce((sum, r) => sum + r.view.baseline.mean, 0) / rows.length;
  const value = override ?? own ?? mean;
  const at = (v: number) => clamp(((v - lo) / (hi - lo)) * 100);
  const fmt = (v: number) => v.toFixed(meta.decimals);

  return (
    <Panel className="mt-4" title={t('same.title')} action={<Tag>{t('tag.simulatedShort')}</Tag>}>
      <div data-testid="same-reading">
        <p className="max-w-3xl text-sm text-muted">{t('same.lead')}</p>

        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={t('same.pick')}>
          {vitals.map((v) => (
            <button
              key={v.id}
              type="button"
              data-vital={v.id}
              aria-pressed={v.id === meta.id}
              onClick={() => setVital(v.id)}
              className={`flex min-h-[44px] items-center gap-2 rounded-full border px-3.5 text-sm font-medium ${
                v.id === meta.id ? 'border-accent bg-accent/15 text-ink' : 'border-line text-muted hover:text-ink'
              }`}
            >
              <Icon name={indicatorIcon(v.id)} size={16} />
              {v.name}
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          <label className="flex items-baseline gap-2 text-sm font-medium" htmlFor="same-value">
            {t('same.reading')}
            <input
              id="same-value"
              type="number"
              inputMode="decimal"
              step={step}
              value={fmt(value)}
              onChange={(e) => {
                const next = Number(e.target.value);
                if (e.target.value !== '' && Number.isFinite(next)) setOverride(next);
              }}
              data-testid="same-value"
              className="h-11 w-28 rounded-md border border-line bg-bg px-2 font-display text-xl font-bold tabular-nums"
            />
            <span className="text-sm font-normal text-muted">{meta.unit}</span>
          </label>
          <input
            type="range"
            min={lo}
            max={hi}
            step={step}
            value={Math.min(hi, Math.max(lo, value))}
            onChange={(e) => setOverride(Number(e.target.value))}
            aria-label={t('same.slider', { name: meta.name })}
            data-testid="same-slider"
            className="min-w-[180px] flex-1 accent-[rgb(var(--accent))]"
          />
          {override !== null && (
            <button
              type="button"
              onClick={() => setOverride(null)}
              data-testid="same-reset"
              className="min-h-[44px] rounded-lg border border-line px-3 text-sm hover:border-accent"
            >
              {t('same.reset')}
            </button>
          )}
        </div>

        <ul className="mt-4 space-y-3" aria-label={t('same.rows')}>
          {rows.map(({ member, view }) => {
            const { mean: m, sd } = view.baseline;
            const z = (value - m) / sd;
            const whose = t(member.id === viewer ? 'same.your' : 'same.their');
            const words =
              Math.abs(z) < 0.05
                ? t('same.at', { whose })
                : t(z > 0 ? 'same.above' : 'same.below', { n: Math.abs(z).toFixed(1), whose });
            return (
              <li key={member.id} data-member={member.id} className="grid gap-x-4 gap-y-1 sm:grid-cols-[11rem_minmax(0,1fr)_14rem] sm:items-center">
                <p className="text-sm">
                  <span className="text-muted">{member.role}</span>
                  <br />
                  <span className="font-medium">{member.name}</span>
                  {member.id === viewer && <span className="ml-2 align-middle"><Tag>{t('crew.you')}</Tag></span>}
                </p>
                <div className="relative h-8" aria-hidden="true">
                  <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line" />
                  <div
                    className="absolute top-1/2 h-4 -translate-y-1/2 rounded-sm bg-nominal/15"
                    style={{ left: `${at(m - 2 * sd)}%`, width: `${at(m + 2 * sd) - at(m - 2 * sd)}%` }}
                  />
                  <div
                    className="absolute top-1/2 h-4 -translate-y-1/2 rounded-sm bg-nominal/35"
                    style={{ left: `${at(m - sd)}%`, width: `${at(m + sd) - at(m - sd)}%` }}
                  />
                  <div className="absolute top-1/2 h-4 w-px -translate-y-1/2 bg-muted" style={{ left: `${at(m)}%` }} />
                  <div
                    className="absolute top-0 h-8 w-0.5 -translate-x-1/2 rounded bg-accent transition-[left] duration-200 motion-reduce:transition-none"
                    style={{ left: `${at(value)}%` }}
                    data-testid="same-marker"
                  />
                </div>
                <p className="text-sm tabular-nums" data-testid="same-spreads" data-z={z.toFixed(2)}>
                  {words}
                </p>
              </li>
            );
          })}
        </ul>

        <div className="mt-2 hidden justify-between text-xs tabular-nums text-muted sm:flex sm:pl-[11.75rem] sm:pr-[14.75rem]" aria-hidden="true">
          <span>
            {fmt(lo)} {meta.unit}
          </span>
          <span>{t('same.legend')}</span>
          <span>
            {fmt(hi)} {meta.unit}
          </span>
        </div>
        <p className="mt-3 text-xs text-muted sm:hidden">{t('same.legend')}</p>
      </div>
    </Panel>
  );
}
