import { useEffect, useState } from 'react';
import { Button, PageHeader, Panel, ProvisionalTag, SimulatedTag } from '../components/ui';
import { api } from '../lib/api';
import { useApp, useT } from '../lib/store';
import type { CalibrationValues, IndicatorView } from '../lib/types';

type Grid = Record<string, string[]>;

function toGrid(values: CalibrationValues, ids: string[], days: number): Grid {
  const grid: Grid = {};
  for (const id of ids) {
    grid[id] = Array.from({ length: days }, (_, i) => {
      const v = values[id]?.[i];
      return v === null || v === undefined ? '' : String(v);
    });
  }
  return grid;
}

/** "Your normal" as a band: mean ± SD with the seven pre-flight readings marked on it. */
function NormalBand({ view }: { view: IndicatorView }) {
  const base = view.baseline;
  if (!base) return null;
  const points = (view.preflight ?? []).flatMap((v) => (v === null ? [] : [v]));
  const lo = Math.min(...points, base.mean - 2.5 * base.sd);
  const hi = Math.max(...points, base.mean + 2.5 * base.sd);
  const x = (v: number) => ((v - lo) / (hi - lo || 1)) * 100;
  return (
    <svg viewBox="0 0 100 14" preserveAspectRatio="none" className="h-8 w-full" aria-hidden="true">
      <rect x="0" y="6" width="100" height="2" className="fill-line" />
      <rect x={x(base.mean - base.sd)} y="2" width={x(base.mean + base.sd) - x(base.mean - base.sd)} height="10" rx="1.5" className="fill-nominal/30" />
      <rect x={x(base.mean) - 0.3} y="1" width="0.6" height="12" className="fill-nominal" />
      {points.map((v, i) => (
        <circle key={i} cx={x(v)} cy="7" r="1.1" className="fill-ink" />
      ))}
    </svg>
  );
}

/** Pre-flight calibration wizard: simulate or enter seven days, get a personal baseline. */
export function Calibrate() {
  const t = useT();
  const bundle = useApp((s) => s.bundle);
  const config = useApp((s) => s.config);
  const viewer = useApp((s) => s.viewer);
  const seed = useApp((s) => s.seed);
  const dash = useApp((s) => s.dash);
  const member = useApp((s) => s.member);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [grid, setGrid] = useState<Grid>({});
  const [simulated, setSimulated] = useState<CalibrationValues | null>(null);
  const [error, setError] = useState<string | null>(null);
  const days = config?.preflight_days ?? 7;
  const ids = bundle?.indicators.map((i) => i.id) ?? [];

  useEffect(() => {
    let live = true;
    api
      .calibration(viewer, seed)
      .then((c) => live && setSimulated(c.simulated))
      .catch(() => live && setSimulated(null));
    return () => {
      live = false;
    };
  }, [viewer, seed]);

  if (!bundle) return null;
  const me = bundle.crew.find((m) => m.id === viewer);
  const own = dash && member === viewer ? dash : null;

  const start = (mode: 'simulate' | 'enter') => {
    setError(null);
    setGrid(toGrid(mode === 'simulate' && simulated ? simulated : {}, ids, days));
    setStep(2);
  };
  const filled = (id: string) => (grid[id] ?? []).filter((v) => v.trim() !== '' && Number.isFinite(Number(v))).length;
  const ready = ids.some((id) => filled(id) > 0) && ids.every((id) => filled(id) === 0 || filled(id) >= 3);

  const save = async () => {
    const values: CalibrationValues = {};
    for (const id of ids) {
      if (filled(id) === 0) continue; // untouched indicators keep their simulated baseline
      values[id] = (grid[id] ?? []).map((v) => (v.trim() === '' || !Number.isFinite(Number(v)) ? null : Number(v)));
    }
    try {
      await api.saveCalibration(viewer, values);
      const app = useApp.getState();
      if (app.member !== viewer) app.setMember(viewer);
      await app.refresh();
      app.toast(t('cal.saved'));
      setError(null);
      setStep(3);
    } catch {
      setError(t('toast.saveFailed'));
    }
  };
  const reset = async () => {
    await api.clearCalibration(viewer).catch(() => undefined);
    await useApp.getState().refresh();
    useApp.getState().toast(t('cal.resetDone'));
    setStep(1);
  };

  return (
    <div data-testid="calibrate">
      <PageHeader title={t('cal.title')} lead={t('cal.lead', { n: days })}>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
          <SimulatedTag />
          <ProvisionalTag />
          <span>{me ? `${me.role} ${me.name}` : ''}</span>
        </div>
      </PageHeader>

      {/* Progress, not buttons: done steps are ticked, the current one is filled, the rest wait. */}
      <ol className="mb-4 flex max-w-2xl items-center gap-2 text-sm" aria-label={t('cal.steps')} data-testid="cal-steps">
        {[1, 2, 3].map((n) => {
          const state = n < step ? 'done' : n === step ? 'current' : 'todo';
          const dot =
            state === 'done'
              ? 'border-nominal bg-nominal/15 text-nominal'
              : state === 'current'
                ? 'border-accent bg-accent text-bg'
                : 'border-line text-muted';
          return (
            <li key={n} aria-current={state === 'current' ? 'step' : undefined} data-state={state} className="flex min-w-0 flex-1 items-center gap-2 last:flex-none">
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${dot}`} aria-hidden="true">
                {state === 'done' ? '✓' : n}
              </span>
              <span className={`whitespace-nowrap ${state === 'current' ? 'font-semibold text-ink' : 'hidden text-muted sm:inline'}`}>
                <span className="sr-only">{n}. </span>
                {t(`cal.step${n}`)}
              </span>
              {n < 3 && <span aria-hidden="true" className={`h-px min-w-[12px] flex-1 ${n < step ? 'bg-nominal' : 'bg-line'}`} />}
            </li>
          );
        })}
      </ol>

      {step === 1 && (
        <Panel title={t('cal.step1')}>
          <p className="max-w-2xl text-sm text-muted">{t('cal.intro')}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button primary onClick={() => start('simulate')} disabled={!simulated} data-testid="cal-simulate">
              {t('cal.simulate', { n: days })}
            </Button>
            <Button onClick={() => start('enter')} data-testid="cal-enter">
              {t('cal.enter')}
            </Button>
            {own?.indicators.some((i) => i.calibrated_by_member) && <Button onClick={() => void reset()}>{t('cal.reset')}</Button>}
          </div>
        </Panel>
      )}

      {step === 2 && (
        <Panel title={t('cal.step2')}>
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm" data-testid="cal-grid">
              <caption className="sr-only">{t('cal.step2')}</caption>
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th scope="col" className="py-1 pr-2 font-medium">{t('report.indicator')}</th>
                  {Array.from({ length: days }, (_, i) => (
                    <th key={i} scope="col" className="px-1 py-1 text-center font-medium">
                      {t('cal.dayN', { n: i + 1 })}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bundle.indicators.map((ind) => (
                  <tr key={ind.id} className="border-t border-line/60">
                    <th scope="row" className="py-1.5 pr-2 text-left font-normal">
                      {ind.name} <span className="text-xs text-muted">({ind.unit})</span>
                    </th>
                    {Array.from({ length: days }, (_, i) => (
                      <td key={i} className="px-1 py-1.5">
                        <input
                          type="number"
                          inputMode="decimal"
                          step="any"
                          aria-label={`${ind.name}, ${t('cal.dayN', { n: i + 1 })}`}
                          value={grid[ind.id]?.[i] ?? ''}
                          onChange={(e) => {
                            const row = [...(grid[ind.id] ?? [])];
                            row[i] = e.target.value;
                            setGrid({ ...grid, [ind.id]: row });
                          }}
                          className="h-10 w-full min-w-[56px] rounded border border-line bg-bg px-1.5 text-center tabular-nums"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted">{t('cal.rule')}</p>
          {error && <p className="mt-2 text-sm text-call" role="alert">{error}</p>}
          <div className="mt-4 flex flex-wrap gap-3">
            <Button onClick={() => setStep(1)}>{t('presenter.back')}</Button>
            <Button primary disabled={!ready} onClick={() => void save()} data-testid="cal-save">
              {t('cal.save')}
            </Button>
          </div>
        </Panel>
      )}

      {(step === 3 || step === 1) && own && (
        <Panel className="mt-4" title={step === 3 ? t('cal.step3') : t('cal.current')}>
          <ul className="grid gap-4 md:grid-cols-2" data-testid="cal-result">
            {own.indicators.map((view) => (
              <li key={view.id} className="rounded-lg border border-line p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium">{view.name}</span>
                  {view.baseline && (
                    <span className="tabular-nums text-sm">
                      {view.baseline.mean.toFixed(view.decimals + 1)} ± {view.baseline.sd.toFixed(view.decimals + 1)} {view.unit}
                    </span>
                  )}
                </div>
                <NormalBand view={view} />
                <p className="text-xs text-muted">
                  {t('cal.basedOn', { n: view.baseline?.n ?? 0 })}
                  {view.calibrated_by_member ? ` · ${t('ind.calibrated')}` : ` · ${t('tag.simulatedShort')}`}
                </p>
              </li>
            ))}
          </ul>
          {step === 3 && (
            <div className="mt-4 flex flex-wrap gap-3">
              <Button primary onClick={() => useApp.getState().navigate('/')}>{t('cal.toDashboard')}</Button>
              <Button onClick={() => void reset()}>{t('cal.reset')}</Button>
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}
