import { create } from 'zustand';
import { api } from './api';
import type { Command } from './commands';
import { toggleHazard } from './lens';
import { translate } from './strings';
import type { AppConfig, Bundle, CrewTile, Dashboard, LogEntry } from './types';

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
  bundle: Bundle | null;
  config: AppConfig | null;
  loadError: string | null;
  viewer: string;
  member: string;
  day: number;
  seed: string;
  dash: Dashboard | null;
  crew: CrewTile[] | null;
  lens: string[];
  selectedZone: string | null;
  toasts: Toast[];
  paletteOpen: boolean;
  quickLogOpen: boolean;
  judgeOpen: boolean;
  presenter: { active: boolean; step: number; auto: boolean };
  navigate: (route: string) => void;

  init: () => Promise<void>;
  refresh: () => Promise<void>;
  setNavigator: (fn: (route: string) => void) => void;
  setDay: (day: number) => void;
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
  run: (command: Command) => void;
  resetDemo: () => Promise<void>;
  t: (key: string, params?: Record<string, string | number>) => string;
}

let toastId = 0;
let requestId = 0;

export const useApp = create<AppState>((set, get) => ({
  ...loadPersisted(),
  bundle: null,
  config: null,
  loadError: null,
  viewer: DEFAULT_MEMBER,
  member: DEFAULT_MEMBER,
  day: 20,
  seed: 'demo',
  dash: null,
  crew: null,
  lens: [],
  selectedZone: null,
  toasts: [],
  paletteOpen: false,
  quickLogOpen: false,
  judgeOpen: false,
  presenter: { active: false, step: 0, auto: false },
  navigate: () => undefined,

  t: translate,

  init: async () => {
    try {
      const [bundle, config] = await Promise.all([api.bundle(), api.config()]);
      set({ bundle, config, day: config.demo_day, loadError: null });
      await get().refresh();
    } catch (err) {
      set({ loadError: err instanceof Error ? err.message : String(err) });
    }
  },

  refresh: async () => {
    const { member, viewer, day, seed } = get();
    const mine = ++requestId;
    try {
      const [dash, crew] = await Promise.all([api.dashboard(member, viewer, day, seed), api.crew(viewer, day, seed)]);
      if (mine === requestId) set({ dash, crew });
    } catch {
      if (mine === requestId) get().toast(get().t('toast.loadFailed'), 'error');
    }
  },

  setNavigator: (fn) => set({ navigate: fn }),
  setDay: (day) => {
    const max = get().config?.max_day ?? 1095;
    set({ day: Math.max(0, Math.min(max, Math.round(day))) });
    void get().refresh();
  },
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
    setTimeout(() => get().dismissToast(id), 2600);
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),

  set: (patch) => {
    set(patch);
    persist(get());
  },

  // Optimistic: the confirmation shows at once; the server call follows.
  log: (kind, extra) => {
    const { viewer, day, t } = get();
    get().toast(t(kind === 'ok' ? 'toast.ok' : 'toast.saved'));
    api
      .log(viewer, { kind, day, ...extra })
      .then(() => get().refresh())
      .catch(() => get().toast(t('toast.saveFailed'), 'error'));
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
