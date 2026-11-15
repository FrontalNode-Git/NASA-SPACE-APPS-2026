import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { SCREENS } from '../lib/commands';
import { useApp, useT } from '../lib/store';
import { CommandPalette, Toasts } from './CommandPalette';
import { Icon } from './Icon';
import { ParticleField } from './ParticleField';
import { JudgeDrawer, Presenter } from './Presenter';
import { QuickBar, QuickLog } from './QuickBar';
import { StatusBadge, StatusGlyph } from './StatusGlyph';
import { markTourHintSeen, tourHintSeen } from '../lib/tourHint';
import { SimulatedTag } from './ui';

/** Shown to whoever was sent a crew report, on every screen, until they open it. */
function ReceivedNotice() {
  const t = useT();
  const viewer = useApp((s) => s.viewer);
  const unread = useApp((s) => s.notices.find((n) => n.to.id === s.viewer && !n.read));
  const navigate = useApp((s) => s.navigate);
  if (!unread || unread.to.id !== viewer) return null;
  return (
    <div
      role="status"
      data-testid="crew-notice"
      className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 glass rounded-xl border border-accent p-3 text-sm print:hidden"
    >
      <StatusGlyph status={unread.overall} size={14} />
      <p className="min-w-0 flex-1 basis-56">
        {t('notice.crewReport', { from: `${unread.from.role} ${unread.from.name}`, n: unread.day })}{' '}
        <span className="text-muted">
          {t('report.crewOverall')}: {t(`status.${unread.overall}`)}
        </span>
      </p>
      <button
        type="button"
        data-testid="crew-notice-open"
        className="min-h-[44px] rounded-lg border border-accent bg-accent px-4 font-semibold text-bg hover:brightness-110"
        onClick={() => navigate('/report?received=1')}
      >
        {t('notice.open')}
      </button>
    </div>
  );
}

/**
 * How far through the mission the viewed day is, as a thin line under the day label, with the
 * phases drawn to scale. It moves as the mission timeline plays.
 */
function MissionTrack() {
  const t = useT();
  const day = useApp((s) => s.day);
  const playing = useApp((s) => s.playing);
  const mission = useApp((s) => s.bundle?.mission);
  const total = mission?.total_days ?? 1095;
  const percent = Math.min(100, Math.max(0, (day / total) * 100));
  const edges = (mission?.phases ?? []).filter((p) => p.end > 0 && p.end < total).map((p) => (p.end / total) * 100);
  return (
    <span
      role="progressbar"
      aria-label={t('progress.mission')}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={day}
      aria-valuetext={t('common.day', { n: day })}
      data-testid="mission-progress"
      className="pointer-events-none absolute inset-x-0.5 -bottom-1.5 block h-[3px] overflow-hidden rounded-full bg-line/60 print:hidden"
    >
      <span
        className="block h-full rounded-full bg-accent ease-linear motion-reduce:transition-none"
        style={{ width: `${percent}%`, transitionProperty: 'width', transitionDuration: playing ? '500ms' : '160ms' }}
      />
      {edges.map((edge) => (
        <span key={edge} className="absolute top-0 h-full w-px bg-bg" style={{ left: `${edge}%` }} />
      ))}
    </span>
  );
}

/**
 * Shown once to someone opening the plain link for the first time: there is a guided tour, and
 * one tap starts it. It never shows on a ?tour or ?demo link, or after the tour has been started
 * or turned away.
 */
function TourHint() {
  const t = useT();
  const demo = useApp((s) => s.demo);
  const touring = useApp((s) => s.presenter.active);
  const [seen, setSeen] = useState(tourHintSeen);

  // However the tour starts (this card, the P key, a ?tour link), the hint has done its job.
  useEffect(() => {
    if (touring && !seen) {
      markTourHintSeen();
      setSeen(true);
    }
  }, [touring, seen]);

  if (seen || demo || touring) return null;
  const close = () => {
    markTourHintSeen();
    setSeen(true);
  };
  return (
    <section
      aria-label={t('tour.title')}
      data-testid="tour-hint"
      className="glass mb-3 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border border-accent/60 p-3 sm:p-4 print:hidden"
    >
      <p className="min-w-0 flex-1 basis-64 text-sm">
        <span className="font-display font-semibold">{t('tour.title')}</span> <span className="text-muted">{t('tour.body')}</span>
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          data-testid="tour-start"
          className="min-h-[44px] rounded-lg border border-accent bg-accent px-4 text-sm font-semibold text-bg hover:brightness-110"
          onClick={() => {
            close();
            useApp.setState({ presenter: { active: true, step: 0, auto: false } });
          }}
        >
          {t('tour.start')}
        </button>
        <button
          type="button"
          data-testid="tour-dismiss"
          className="min-h-[44px] rounded-lg border border-line px-4 text-sm hover:border-accent"
          onClick={close}
        >
          {t('tour.dismiss')}
        </button>
      </div>
    </section>
  );
}

/** The foot of every screen: what the data is, and the way back to a clean start. */
function PageFooter() {
  const t = useT();
  const link = 'min-h-[44px] px-2 text-sm underline decoration-line underline-offset-4 hover:text-ink hover:decoration-accent';
  return (
    <footer className="mt-8 flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-t border-line/60 pt-3 text-xs text-muted print:hidden" data-testid="page-footer">
      <p>{t('footer.simulated')}</p>
      <p className="flex flex-wrap items-center">
        <button type="button" className={link} data-testid="footer-replay" onClick={() => useApp.setState({ presenter: { active: true, step: 0, auto: false } })}>
          {t('footer.replay')}
        </button>
        <button type="button" className={link} data-testid="footer-reset" onClick={() => void useApp.getState().resetDemo()}>
          {t('footer.reset')}
        </button>
      </p>
    </footer>
  );
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/** Global shortcuts: L, K, R, H, /, N, P, J, Shift+1…5, Escape. Ignored while typing. */
function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useApp.getState();
      if (e.key === 'Escape') {
        if (s.paletteOpen || s.quickLogOpen || s.judgeOpen) {
          useApp.setState({ paletteOpen: false, quickLogOpen: false, judgeOpen: false });
        } else if (s.selectedZone) {
          s.selectZone(null);
        }
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target) || s.paletteOpen || s.quickLogOpen) return;
      if (e.shiftKey && /^Digit[1-5]$/.test(e.code)) {
        const hazard = s.bundle?.hazards[Number(e.code.slice(5)) - 1];
        if (hazard) {
          e.preventDefault();
          s.run({ type: 'lens', hazard: hazard.id });
        }
        return;
      }
      if (e.shiftKey && e.key !== '?') return;
      const key = e.key.toLowerCase();
      const map: Record<string, () => void> = {
        l: () => s.run({ type: 'quick_log' }),
        k: () => s.run({ type: 'ok' }),
        r: () => s.run({ type: 'report' }),
        h: () => s.run({ type: 'toggle_lens' }),
        n: () => s.run({ type: 'toggle_night' }),
        t: () => s.run({ type: 'play' }),
        p: () => s.run({ type: 'presenter' }),
        j: () => s.run({ type: 'judge' }),
        '/': () => useApp.setState({ paletteOpen: true }),
      };
      const action = map[key];
      if (action) {
        e.preventDefault();
        action();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

/** Step through mission days to review, or backfill, any day's check-in. */
function DayStepper() {
  const t = useT();
  const day = useApp((s) => s.day);
  const max = useApp((s) => s.config?.max_day ?? 1095);
  const setDay = useApp((s) => s.setDay);
  const playing = useApp((s) => s.playing);
  const speed = useApp((s) => s.playSpeed);
  const run = useApp((s) => s.run);
  const cycleSpeed = useApp((s) => s.cycleSpeed);
  const step = 'flex h-10 w-9 items-center justify-center rounded-lg border border-line bg-panel text-lg hover:border-accent disabled:opacity-40 sm:w-10';
  return (
    <span className="flex items-center gap-1.5" data-testid="day-stepper">
      <button type="button" className={step} onClick={() => setDay(day - 1)} disabled={day <= 0} aria-label={t('header.prevDay')} data-testid="day-prev">
        <span aria-hidden="true">‹</span>
      </button>
      <span className="relative block min-w-[5.25rem] text-center text-sm font-medium tabular-nums sm:min-w-[7.5rem]" data-testid="day-label">
        {t('common.day', { n: day })}
        <MissionTrack />
      </span>
      <button type="button" className={step} onClick={() => setDay(day + 1)} disabled={day >= max} aria-label={t('header.nextDay')} data-testid="day-next">
        <span aria-hidden="true">›</span>
      </button>
      {/* Play moves the mission day forward by itself. Icon only: a triangle, or two bars while it runs. */}
      <button
        type="button"
        className={`${step} ${playing ? 'border-accent text-accent' : ''}`}
        onClick={() => run({ type: 'play' })}
        aria-pressed={playing}
        aria-label={t(playing ? 'header.pause' : 'header.play')}
        aria-keyshortcuts="T"
        title={t(playing ? 'header.pause' : 'header.play')}
        data-testid="play-toggle"
        data-state={playing ? 'playing' : 'paused'}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          {playing ? (
            <>
              <rect x="3.5" y="2.5" width="3" height="11" rx="0.8" />
              <rect x="9.5" y="2.5" width="3" height="11" rx="0.8" />
            </>
          ) : (
            <path d="M4.5 2.7v10.6a.5.5 0 0 0 .77.42l8.2-5.3a.5.5 0 0 0 0-.84l-8.2-5.3a.5.5 0 0 0-.77.42Z" />
          )}
        </svg>
      </button>
      {playing && (
        <button
          type="button"
          className="flex h-10 w-9 items-center justify-center rounded-lg border border-line bg-panel text-xs font-semibold tabular-nums hover:border-accent sm:w-10"
          onClick={cycleSpeed}
          aria-label={t('header.speed', { n: speed })}
          data-testid="play-speed"
          data-speed={speed}
        >
          ×{speed}
        </button>
      )}
    </span>
  );
}

function Header() {
  const t = useT();
  const bundle = useApp((s) => s.bundle);
  const viewer = useApp((s) => s.viewer);
  const setViewer = useApp((s) => s.setViewer);
  const dash = useApp((s) => s.dash);
  const night = useApp((s) => s.night);
  const set = useApp((s) => s.set);
  const demo = useApp((s) => s.demo);
  const run = useApp((s) => s.run);
  const chip = 'min-h-[40px] flex-1 whitespace-nowrap rounded-lg border border-line bg-panel px-3 text-sm hover:border-accent sm:flex-none';
  // The full label from 1280 px up and a short one below, so the header stays on one row on
  // a laptop. The accessible name is always the full label.
  const label = (full: string, short: string) => (
    <>
      <span className="xl:hidden">{t(short)}</span>
      <span className="hidden xl:inline">{t(full)}</span>
    </>
  );

  // Icon only: a moon while the day theme is on (tap for night), a sun while night is on.
  const nightButton = (
    <button
      type="button"
      className={`flex min-h-[40px] w-11 shrink-0 items-center justify-center rounded-lg border border-line bg-panel hover:border-accent ${
        demo ? '' : 'sm:order-last'
      }`}
      onClick={() => set({ night: !night })}
      aria-pressed={night}
      data-testid="night-toggle"
      data-icon={night ? 'sun' : 'moon'}
      aria-keyshortcuts="N"
      aria-label={t('action.night')}
      title={t('action.night')}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {night ? (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" />
          </>
        ) : (
          <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a7 7 0 1 0 10.5 10.5Z" />
        )}
      </svg>
    </button>
  );

  return (
    <header className="border-b border-line bg-panel/70 print:hidden">
      <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5 sm:px-5">
        <NavLink to="/" className="flex items-baseline gap-2">
          <span className="font-display text-xl font-bold tracking-tight">
            VITA<span className="text-accent">L</span>
          </span>
          <span className="hidden text-sm text-muted 2xl:inline">{t('app.tagline')}</span>
        </NavLink>
        {dash && (
          <span className="ml-auto flex items-center gap-2 text-sm sm:ml-0" data-testid="header-status">
            <StatusBadge status={dash.overall} size="sm" />
            <SimulatedTag />
          </span>
        )}
        {/* On a plain link the night toggle sits in the top row on a phone and at the far right on
            a laptop. On a demo link it joins the two demo buttons instead. */}
        {!demo && nightButton}
        {/* Phone: day and crew member on one row (demo buttons on the next). Wider: one row. */}
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-1 sm:justify-end" data-testid="header-controls">
          <DayStepper />
          <label className="flex min-w-0 flex-1 items-center gap-1.5 text-sm sm:flex-none">
            <span className="sr-only text-muted xl:not-sr-only">{t('header.signedIn')}</span>
            <select
              value={viewer}
              onChange={(e) => setViewer(e.target.value)}
              className="min-h-[40px] w-full min-w-0 rounded-lg border border-line bg-panel px-1.5 text-[13px] sm:w-auto sm:px-2 sm:text-sm"
              data-testid="viewer-select"
            >
              {bundle?.crew.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.role}
                </option>
              ))}
            </select>
          </label>
          {/* Presenter mode and the Judge drawer are for demos, so their buttons show on a ?tour or
              ?demo link only. Keys P and J, and Find, still reach them from a plain link. */}
          {demo && (
            <div className="flex w-full gap-2 sm:w-auto">
              <button
                type="button"
                className={chip}
                onClick={() => run({ type: 'presenter' })}
                data-testid="presenter-toggle"
                aria-keyshortcuts="P"
                aria-label={t('action.presenter')}
              >
                {label('action.presenter', 'short.presenter')}
              </button>
              <button
                type="button"
                className={chip}
                onClick={() => run({ type: 'judge' })}
                data-testid="judge-toggle"
                aria-keyshortcuts="J"
                aria-label={t('action.judge')}
              >
                {label('action.judge', 'short.judge')}
              </button>
              {nightButton}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function Nav() {
  const t = useT();
  return (
    <nav aria-label={t('nav.title')} className="print:hidden lg:w-52 lg:shrink-0">
      <ul className="grid grid-cols-3 gap-1 px-3 py-2 lg:sticky lg:top-2 lg:flex lg:flex-col lg:px-0 lg:py-0">
        {SCREENS.map((s) => (
          <li key={s.route}>
            <NavLink
              to={s.route}
              end={s.route === '/'}
              data-nav={s.route}
              className={({ isActive }) =>
                `flex min-h-[44px] items-center gap-2 rounded-lg border px-2 text-[13px] font-medium leading-tight transition lg:gap-2.5 lg:whitespace-nowrap lg:px-3 lg:text-sm ${
                  isActive ? 'border-accent/70 bg-accent/10 text-ink' : 'border-transparent text-muted hover:bg-panel hover:text-ink'
                }`
              }
            >
              <Icon name={s.icon} size={18} className="shrink-0" />
              {t(s.key)}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function Layout() {
  const t = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const bundle = useApp((s) => s.bundle);
  const loadError = useApp((s) => s.loadError);
  const night = useApp((s) => s.night);
  useShortcuts();

  useEffect(() => {
    useApp.getState().setNavigator((route) => navigate(route));
  }, [navigate]);
  useEffect(() => {
    // A link ending in ?tour opens straight into the guided walkthrough, for anyone who is
    // sent the app without someone there to present it.
    const tour = new URLSearchParams(window.location.search).has('tour') || /[?&]tour\b/.test(window.location.hash);
    void useApp
      .getState()
      .init()
      .then(() => {
        if (tour && useApp.getState().bundle) useApp.setState({ presenter: { active: true, step: 0, auto: false } });
      });
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = night ? 'night' : 'day';
  }, [night]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  if (loadError) {
    return (
      <div className="mx-auto max-w-lg p-8" role="alert">
        <h1 className="font-display text-2xl font-bold">VITAL</h1>
        <p className="mt-3 text-call">{t('app.loadError')}</p>
        <p className="mt-1 text-sm text-muted">{loadError}</p>
        <button type="button" className="mt-4 min-h-[44px] rounded-lg border border-line px-4" onClick={() => void useApp.getState().init()}>
          {t('common.retry')}
        </button>
      </div>
    );
  }
  if (!bundle) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted" role="status">
        {t('app.loading')}
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-28">
      <ParticleField />
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-accent focus:px-3 focus:py-2 focus:text-bg">
        {t('app.skip')}
      </a>
      <Header />
      <div className="mx-auto max-w-[1500px] lg:flex lg:gap-5 lg:px-5 lg:pt-4">
        <Nav />
        <main id="main" className="min-w-0 flex-1 px-3 pt-1 sm:px-5 lg:px-0 lg:pt-0">
          <TourHint />
          <ReceivedNotice />
          <Outlet />
          <PageFooter />
        </main>
      </div>
      <QuickBar />
      <QuickLog />
      <CommandPalette />
      <Presenter />
      <JudgeDrawer />
      <Toasts />
    </div>
  );
}
