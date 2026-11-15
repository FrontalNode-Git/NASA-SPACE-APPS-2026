import { create } from 'zustand';
import { api } from './api';
import type { Command } from './commands';
import { toggleHazard } from './lens';
import { addPending, deliver, loadOutbox, newId, saveOutbox, type PendingItem } from './outbox';
import { translate } from './strings';
import type { AppConfig, Bundle, CrewNotice, CrewTile, Dashboard, LogEntry } from './types';

export interface Toast {
  id: number;
  text: string;
  tone: 'ok' | 'error';
}

/** The only things remembered between visits: display preferences. */
interface Persisted {
  night: boolean;
  view2d: boolean;
}

const STORAGE_KEY = 'vita-l';
const DEFAULT_MEMBER = 'engineer';

function loadPersisted(): Persisted {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<Persisted>;
    return { night: saved.night === true, view2d: saved.view2d === true };
  } catch {
    return { night: false, view2d: false };
  }
}

function persist(state: Persisted) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ night: state.night, view2d: state.view2d }));
  } catch {
    // Storage can be unavailable (private mode); the app works without it.
  }
}

export interface AppState extends Persisted {
  /** Opened from a link with ?tour or ?demo: the header then offers Presenter mode and the Judge drawer. */
  demo: boolean;
  bundle: Bundle | null;
  config: AppConfig | null;
  loadError: string | null;
  viewer: string;
  member: string;
  day: number;
  seed: string;
  dash: Dashboard | null;
  crew: CrewTile[] | null;
  /** Crew reports the viewer sent (medical officer) or received (Commander). */
  notices: CrewNotice[];
  lens: string[];
  selectedZone: string | null;
  toasts: Toast[];
  /** How many entries are waiting in the browser because the server was not reached. */
  pending: number;
  paletteOpen: boolean;
  quickLogOpen: boolean;
  judgeOpen: boolean;
  presenter: { active: boolean; step: number; auto: boolean };
  /** The mission timeline is playing: the day moves forward by itself. */
  playing: boolean;
  /** Mission days per step (a step is half a second): 1, 4 or 16. */
  playSpeed: 1 | 4 | 16;
  navigate: (route: string) => void;

  init: () => Promise<void>;
  refresh: () => Promise<void>;
  setNavigator: (fn: (route: string) => void) => void;
  setDay: (day: number) => void;
  togglePlay: () => void;
  stopPlay: () => void;
  cycleSpeed: () => void;
  setSeed: (seed: string) => void;
  setMember: (member: string) => void;
  setViewer: (viewer: string) => void;
  toggleLens: (hazard: string) => void;
  setLens: (lens: string[]) => void;
  selectZone: (zone: string | null) => void;
  toast: (text: string, tone?: Toast['tone']) => void;
  dismissToast: (id: number) => void;
  set: (patch: Partial<AppState>) => void;
  log: (kind: LogEntry['kind'], extra?: { value?: number; text?: string }) => void;
  logQuick: (quick: { mood: number | null; entries: string[]; note: string }) => void;
  /** Several entries saved together (the quick log): one confirmation for the whole batch. */
  logMany: (entries: { kind: LogEntry['kind']; value?: number; text?: string; entries?: string[] }[]) => void;
  enqueue: (items: PendingItem | PendingItem[]) => void;
  flushOutbox: (opts?: { manual?: boolean }) => Promise<void>;
  run: (command: Command) => void;
  resetDemo: () => Promise<void>;
  t: (key: string, params?: Record<string, string | number>) => string;
}

/** The address the app was opened with decides it once; moving between screens keeps it. */
function demoLink(): boolean {
  try {
    return /[?&](tour|demo)\b/.test(window.location.search + window.location.hash);
  } catch {
    return false;
  }
}

/** Zone names shown on screen where the team prefers wording other than the server's. */
const ZONE_NAMES: Record<string, string> = { inner_ear: 'Ear canal' };

/** The bundle as the screens should see it: same data, with the team's zone names. */
function withZoneNames(bundle: Bundle): Bundle {
  return { ...bundle, zones: bundle.zones.map((z) => (ZONE_NAMES[z.id] ? { ...z, name: ZONE_NAMES[z.id] as string } : z)) };
}

/** Half a second per step: slow enough to follow, and at most two refreshes a second. */
const PLAY_STEP_MS = 500;
let playTimer: ReturnType<typeof setInterval> | null = null;
function clearPlayTimer() {
  if (playTimer !== null) {
    clearInterval(playTimer);
    playTimer = null;
  }
}

let toastId = 0;
let requestId = 0;
let outbox: PendingItem[] = loadOutbox();
let watching = false;

/** Try the waiting entries again when the browser comes back online, and every 15 seconds. */
function startOutboxWatch(get: () => AppState) {
  if (watching || typeof window === 'undefined') return;
  watching = true;
  const tick = () => void get().flushOutbox();
  window.addEventListener('online', tick);
  window.setInterval(tick, 15000);
  tick();
}
let flushing = false;

export const useApp = create<AppState>((set, get) => ({
  ...loadPersisted(),
  demo: demoLink(),
  bundle: null,
  config: null,
  loadError: null,
  viewer: DEFAULT_MEMBER,
  member: DEFAULT_MEMBER,
  day: 20,
  seed: 'demo',
  dash: null,
  crew: null,
  notices: [],
  lens: [],
  selectedZone: null,
  toasts: [],
  pending: outbox.length,
  paletteOpen: false,
  quickLogOpen: false,
  judgeOpen: false,
  presenter: { active: false, step: 0, auto: false },
  playing: false,
  playSpeed: 1,
  navigate: () => undefined,

  t: translate,

  init: async () => {
    try {
      const [bundle, config] = await Promise.all([api.bundle(), api.config()]);
      set({ bundle: withZoneNames(bundle), config, day: config.demo_day, loadError: null });
      await get().refresh();
      startOutboxWatch(get);
    } catch (err) {
      set({ loadError: err instanceof Error ? err.message : String(err) });
    }
  },

  refresh: async () => {
    const { member, viewer, day, seed } = get();
    const mine = ++requestId;
    try {
      const [dash, crew, notices] = await Promise.all([
        api.dashboard(member, viewer, day, seed),
        api.crew(viewer, day, seed),
        api.crewNotices(viewer).catch(() => [] as CrewNotice[]), // the dashboard matters more than the inbox
      ]);
      if (mine === requestId) set({ dash, crew, notices });
    } catch {
      if (mine === requestId) get().toast(get().t('toast.loadFailed'), 'error');
    }
  },

  setNavigator: (fn) => set({ navigate: fn }),
  setDay: (day) => {
    get().stopPlay(); // choosing a day by hand takes over from the timeline
    const max = get().config?.max_day ?? 1095;
    set({ day: Math.max(0, Math.min(max, Math.round(day))) });
    void get().refresh();
  },

  // Play the mission timeline: every step moves the day forward and the whole app follows
  // (the dashboard, the charts, the body scan, the background). It stops at the last day.
  togglePlay: () => {
    if (get().playing) {
      get().stopPlay();
      return;
    }
    const max = get().config?.max_day ?? 1095;
    if (get().day >= max) set({ day: 0 }); // at the end, play starts again from before launch
    set({ playing: true });
    const step = () => {
      const top = get().config?.max_day ?? 1095;
      const next = Math.min(top, get().day + get().playSpeed);
      set({ day: next });
      void get().refresh();
      if (next >= top) get().stopPlay();
    };
    clearPlayTimer();
    step();
    playTimer = setInterval(step, PLAY_STEP_MS);
  },
  stopPlay: () => {
    clearPlayTimer();
    if (get().playing) set({ playing: false });
  },
  cycleSpeed: () => set({ playSpeed: get().playSpeed === 1 ? 4 : get().playSpeed === 4 ? 16 : 1 }),
  setSeed: (seed) => {
    set({ seed });
    void get().refresh();
  },
  setMember: (member) => {
    set({ member, selectedZone: null });
    void get().refresh();
  },
  setViewer: (viewer) => {
    set({ viewer, member: viewer, selectedZone: null });
    void get().refresh();
  },

  toggleLens: (hazard) => set({ lens: toggleHazard(get().lens, hazard) }),
  setLens: (lens) => set({ lens }),
  selectZone: (zone) => set({ selectedZone: zone }),

  toast: (text, tone = 'ok') => {
    const id = ++toastId;
    set({ toasts: [...get().toasts.slice(-2), { id, text, tone }] });
    // Errors stay longer: they need to be read and acted on.
    setTimeout(() => get().dismissToast(id), tone === 'error' ? 6000 : 2600);
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),

  set: (patch) => {
    set(patch);
    persist(get());
  },

  log: (kind, extra) => get().logMany([{ kind, ...extra }]),

  /** The quick log: a mood, chosen entries and a note, saved as ONE entry on the record. */
  logQuick: ({ mood, entries, note }) => get().logMany([{ kind: 'quick', value: mood ?? undefined, entries, text: note || undefined }]),

  // One confirmation for the whole batch, and only after the server has accepted it. Anything
  // the server could not be reached for is kept in the browser and sent again later.
  logMany: (entries) => {
    const { viewer, day, t } = get();
    if (entries.length === 0) return;
    const items: PendingItem[] = entries.map((e) => ({ id: newId(), kind: 'log', member: viewer, body: { ...e, day } }));
    void (async () => {
      let sent = 0;
      let refused = 0;
      const waiting: PendingItem[] = [];
      for (const item of items) {
        // Keep the order: once something is waiting, everything after it waits too.
        if (outbox.length || waiting.length) {
          waiting.push(item);
          continue;
        }
        const result = await deliver(item);
        if (result === 'sent') sent += 1;
        else if (result === 'retry') waiting.push(item);
        else refused += 1;
      }
      if (waiting.length) get().enqueue(waiting);
      if (refused) get().toast(t('toast.saveFailed'), 'error');
      if (sent) {
        const onlyOk = entries.length === 1 && entries[0]?.kind === 'ok';
        if (!waiting.length && !refused) get().toast(t(onlyOk ? 'toast.ok' : 'toast.saved'));
        void get().refresh();
      }
    })();
  },

  enqueue: (items) => {
    for (const item of Array.isArray(items) ? items : [items]) outbox = addPending(outbox, item);
    saveOutbox(outbox);
    set({ pending: outbox.length });
    get().toast(get().t('toast.queued'), 'error');
    void get().flushOutbox();
  },

  flushOutbox: async ({ manual = false } = {}) => {
    if (flushing || outbox.length === 0) return;
    flushing = true;
    let sent = 0;
    try {
      for (let next = outbox[0]; next; next = outbox[0]) {
        const result = await deliver(next);
        if (result === 'retry') break;
        outbox = outbox.slice(1);
        if (result === 'sent') sent += 1;
        else get().toast(get().t('toast.saveFailed'), 'error');
      }
    } finally {
      flushing = false;
      saveOutbox(outbox);
      set({ pending: outbox.length });
    }
    if (sent) {
      get().toast(get().t('toast.sentWaiting', { n: sent }));
      await get().refresh();
    } else if (manual && outbox.length) {
      get().toast(get().t('toast.queued'), 'error');
    }
  },

  run: (command) => {
    const s = get();
    switch (command.type) {
      case 'open':
        s.navigate(command.route);
        break;
      case 'lens':
        s.toggleLens(command.hazard);
        s.navigate('/'); // the lens filters the dashboard, so show its effect there
        break;
      case 'log_mood':
        s.log('mood', { value: command.value });
        break;
      case 'ok':
        s.log('ok');
        break;
      case 'quick_log':
        set({ quickLogOpen: true });
        break;
      case 'report':
        s.navigate('/report');
        break;
      case 'toggle_lens': {
        // H: clear the lens if it is on, otherwise go to the dashboard and focus the chips.
        if (s.lens.length) {
          set({ lens: [] });
        } else {
          s.navigate('/');
          setTimeout(() => document.querySelector<HTMLElement>('[data-lens-chip]')?.focus(), 60);
        }
        break;
      }
      case 'toggle_night':
        s.set({ night: !s.night });
        break;
      case 'play':
        if (command.on === undefined || command.on !== s.playing) s.togglePlay();
        break;
      case 'presenter':
        set({ presenter: { active: !s.presenter.active, step: 0, auto: false } });
        break;
      case 'judge':
        set({ judgeOpen: !s.judgeOpen });
        break;
      case 'zone':
        set({ selectedZone: command.zone });
        s.navigate('/');
        break;
      case 'member':
        s.setMember(command.member);
        s.navigate('/');
        break;
    }
  },

  resetDemo: async () => {
    get().stopPlay();
    await api.resetDemo().catch(() => undefined);
    set({
      viewer: DEFAULT_MEMBER,
      member: DEFAULT_MEMBER,
      day: get().config?.demo_day ?? 20,
      seed: 'demo',
      lens: [],
      selectedZone: null,
      presenter: { active: false, step: 0, auto: false },
    });
    await get().refresh();
    get().toast(get().t('toast.reset'));
  },
}));

/** UI string lookup. Kept as a hook so every component reaches the string table the same way. */
export function useT() {
  return translate;
}
