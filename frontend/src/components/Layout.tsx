import { useEffect } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { SCREENS } from '../lib/commands';
import { useApp, useT } from '../lib/store';
import { CommandPalette, Toasts } from './CommandPalette';
import { Icon } from './Icon';
import { JudgeDrawer, Presenter } from './Presenter';
import { QuickBar, QuickLog } from './QuickBar';
import { StatusBadge, StatusGlyph } from './StatusGlyph';
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
      className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-accent bg-panel p-3 text-sm print:hidden"
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
  const step = 'flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-panel text-lg hover:border-accent disabled:opacity-40';
  return (
    <span className="flex items-center gap-1.5" data-testid="day-stepper">
      <button type="button" className={step} onClick={() => setDay(day - 1)} disabled={day <= 0} aria-label={t('header.prevDay')} data-testid="day-prev">
        <span aria-hidden="true">‹</span>
      </button>
      <span className="min-w-[6.5rem] text-center text-sm font-medium tabular-nums sm:min-w-[7.5rem]" data-testid="day-label">
        {t('common.day', { n: day })}
      </span>
      <button type="button" className={step} onClick={() => setDay(day + 1)} disabled={day >= max} aria-label={t('header.nextDay')} data-testid="day-next">
        <span aria-hidden="true">›</span>
      </button>
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
        {/* Phone: day and crew member on one row, the three buttons on the next. Wider: one row. */}
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-1 sm:justify-end" data-testid="header-controls">
          <DayStepper />
          <label className="flex min-w-0 flex-1 items-center gap-1.5 text-sm sm:flex-none">
            <span className="sr-only text-muted xl:not-sr-only">{t('header.signedIn')}</span>
            <select
              value={viewer}
              onChange={(e) => setViewer(e.target.value)}
              className="min-h-[40px] w-full min-w-0 rounded-lg border border-line bg-panel px-2 text-sm sm:w-auto"
              data-testid="viewer-select"
            >
              {bundle?.crew.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.role}
                </option>
              ))}
            </select>
          </label>
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
            <button
              type="button"
              className={chip}
              onClick={() => set({ night: !night })}
              aria-pressed={night}
              data-testid="night-toggle"
              aria-keyshortcuts="N"
              aria-label={t('action.night')}
            >
              {label('action.night', 'short.night')}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

function Nav() {
  const t = useT();
  return (
    <nav aria-label={t('nav.title')} className="print:hidden lg:w-52 lg:shrink-0">
      <ul className="relative flex gap-1 overflow-x-auto px-3 py-2 lg:sticky lg:top-2 lg:flex-col lg:overflow-visible lg:px-0 lg:py-0">
        {SCREENS.map((s) => (
          <li key={s.route} className="shrink-0">
            <NavLink
              to={s.route}
              end={s.route === '/'}
              data-nav={s.route}
              className={({ isActive }) =>
                `flex min-h-[44px] items-center gap-2.5 whitespace-nowrap rounded-lg border px-3 text-sm font-medium transition ${
                  isActive ? 'border-accent/70 bg-accent/10 text-ink' : 'border-transparent text-muted hover:bg-panel hover:text-ink'
                }`
              }
            >
              <Icon name={s.icon} size={18} />
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
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-accent focus:px-3 focus:py-2 focus:text-bg">
        {t('app.skip')}
      </a>
      <Header />
      <div className="mx-auto max-w-[1500px] lg:flex lg:gap-5 lg:px-5 lg:pt-4">
        <Nav />
        <main id="main" className="min-w-0 flex-1 px-3 pt-1 sm:px-5 lg:px-0 lg:pt-0">
          <ReceivedNotice />
          <Outlet />
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
