import { useEffect } from 'react';
import { useApp, useT } from '../lib/store';
import { MissionScrubber } from './MissionScrubber';
import { Button } from './ui';

interface Step {
  key: string;
  run: () => void;
}

const AUTO_MS = 12000;

function steps(): Step[] {
  const app = () => useApp.getState();
  const go = (route: string) => app().navigate(route);
  const me = () => {
    if (app().viewer !== 'engineer') app().setViewer('engineer');
    else if (app().member !== 'engineer') app().setMember('engineer');
  };
  const surface = () => app().bundle?.mission.phases.find((p) => p.id === 'mars-surface')?.start ?? 0;
  const demoDay = () => app().config?.demo_day ?? 20;

  return [
    { key: 'presenter.calibrate', run: () => { me(); app().setLens([]); app().setDay(0); go('/calibrate'); } },
    { key: 'presenter.checkin', run: () => { me(); app().setLens([]); app().selectZone(null); app().setDay(8); go('/'); } },
    { key: 'presenter.normal', run: () => { me(); app().setDay(8); go('/?indicator=spo2'); } },
    { key: 'presenter.drift', run: () => { me(); app().setDay(demoDay()); go('/?indicator=heart_rate'); } },
    { key: 'presenter.watch', run: () => { app().setDay(demoDay()); app().selectZone('heart'); go('/'); } },
    { key: 'presenter.ok', run: () => { app().selectZone(null); if (!app().dash?.acknowledged) app().log('ok'); go('/'); } },
    { key: 'presenter.report', run: () => go('/report') },
    { key: 'presenter.lens', run: () => { app().setLens(['gravity']); go('/'); } },
    { key: 'presenter.mars', run: () => { app().setLens(['gravity']); app().setDay(surface()); go('/mission'); } },
    { key: 'presenter.crew', run: () => { app().setLens([]); app().set({ day: demoDay() }); app().setViewer('cmo'); go('/crew'); } },
  ];
}

/** Scripted two-minute walkthrough: captions, Next, auto-play, reset. */
export function Presenter() {
  const t = useT();
  const { active, step, auto } = useApp((s) => s.presenter);
  const script = steps();
  const last = script.length - 1;

  useEffect(() => {
    if (active) script[step]?.run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, step]);

  useEffect(() => {
    if (!active || !auto) return;
    const id = setTimeout(() => {
      const p = useApp.getState().presenter;
      useApp.setState({ presenter: p.step >= last ? { ...p, auto: false } : { ...p, step: p.step + 1 } });
    }, AUTO_MS);
    return () => clearTimeout(id);
  }, [active, auto, step, last]);

  if (!active) return null;
  const setP = (patch: Partial<{ active: boolean; step: number; auto: boolean }>) =>
    useApp.setState({ presenter: { ...useApp.getState().presenter, ...patch } });
  const current = script[step];

  return (
    <div className="fixed inset-x-0 bottom-[68px] z-40 px-2 print:hidden" data-testid="presenter">
      <div className="mx-auto max-w-3xl rounded-2xl border border-accent bg-panel/95 p-4 shadow-2xl backdrop-blur">
        <div className="flex items-center justify-between gap-3 text-xs text-muted">
          <span className="font-semibold uppercase tracking-wider text-accent">{t('presenter.title')}</span>
          <span data-testid="presenter-step">
            {step + 1} / {script.length}
          </span>
        </div>
        <p className="mt-1 text-base leading-snug" aria-live="polite" data-testid="presenter-caption">
          {current ? t(current.key) : ''}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button onClick={() => setP({ step: Math.max(0, step - 1), auto: false })} disabled={step === 0}>
            {t('presenter.back')}
          </Button>
          <Button primary onClick={() => setP({ step: Math.min(last, step + 1) })} disabled={step === last} data-testid="presenter-next">
            {t('presenter.next')}
          </Button>
          <Button onClick={() => setP({ auto: !auto })} aria-pressed={auto}>
            {auto ? t('presenter.pause') : t('presenter.auto')}
          </Button>
          <span className="flex-1" />
          <Button onClick={() => void useApp.getState().resetDemo()} data-testid="reset-demo">
            {t('presenter.reset')}
          </Button>
          <Button onClick={() => setP({ active: false, auto: false })}>{t('common.close')}</Button>
        </div>
      </div>
    </div>
  );
}

/** Demo controls: jump to any mission day and switch between simulated scenarios. */
export function JudgeDrawer() {
  const t = useT();
  const open = useApp((s) => s.judgeOpen);
  const config = useApp((s) => s.config);
  const seed = useApp((s) => s.seed);
  const setSeed = useApp((s) => s.setSeed);
  if (!open) return null;

  return (
    <aside
      className="fixed inset-y-0 right-0 z-40 flex w-full max-w-sm flex-col border-l border-line bg-panel shadow-2xl print:hidden"
      aria-label={t('judge.title')}
      data-testid="judge-drawer"
    >
      <header className="flex items-center justify-between border-b border-line p-4">
        <h2 className="font-display text-lg font-semibold">{t('judge.title')}</h2>
        <Button onClick={() => useApp.setState({ judgeOpen: false })}>{t('common.close')}</Button>
      </header>
      <div className="flex-1 space-y-6 overflow-auto p-4 pb-24">
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">{t('judge.day')}</h3>
          <MissionScrubber compact />
        </section>
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">{t('judge.seed')}</h3>
          <div className="space-y-2">
            {config?.seeds.map((s) => (
              <label key={s.id} className="flex min-h-[44px] cursor-pointer items-start gap-2 rounded-lg border border-line p-2.5 text-sm">
                <input type="radio" name="seed" className="mt-1 accent-[rgb(var(--accent))]" checked={seed === s.id} onChange={() => setSeed(s.id)} />
                <span>
                  <span className="font-semibold">{s.id}</span>
                  <span className="block text-muted">{s.label}</span>
                </span>
              </label>
            ))}
          </div>
        </section>
        <section className="flex flex-wrap gap-2">
          <Button onClick={() => useApp.setState({ presenter: { active: true, step: 0, auto: false }, judgeOpen: false })}>
            {t('action.presenter')}
          </Button>
          <Button onClick={() => void useApp.getState().resetDemo()}>{t('presenter.reset')}</Button>
        </section>
      </div>
    </aside>
  );
}
