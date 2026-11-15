import type { IconName } from '../components/Icon';
import type { Bundle } from './types';

/** Everything a key, a voice phrase or the command palette can ask the app to do. */
export type Command =
  | { type: 'open'; route: string }
  | { type: 'lens'; hazard: string }
  | { type: 'log_mood'; value: number }
  | { type: 'ok' }
  | { type: 'quick_log' }
  | { type: 'report' }
  | { type: 'toggle_lens' }
  | { type: 'toggle_night' }
  | { type: 'play'; on?: boolean }
  | { type: 'presenter' }
  | { type: 'judge' }
  | { type: 'zone'; zone: string }
  | { type: 'member'; member: string };

export interface PaletteItem {
  id: string;
  group: 'screen' | 'action' | 'hazard' | 'indicator' | 'zone' | 'crew';
  label: string;
  hint?: string;
  keywords: string;
  command: Command;
}

export const SCREENS: { route: string; key: string; icon: IconName; words: string }[] = [
  { route: '/', key: 'nav.dashboard', icon: 'cardiogram', words: 'dashboard home check-in vitals body scan' },
  { route: '/crew', key: 'nav.crew', icon: 'doctor', words: 'crew team medical officer' },
  { route: '/mission', key: 'nav.mission', icon: 'timeline', words: 'mission timeline environments mars' },
  { route: '/report', key: 'nav.report', icon: 'medical-report', words: 'report ground summary' },
  { route: '/calibrate', key: 'nav.calibrate', icon: 'measuring-tape', words: 'calibrate baseline pre-flight wizard' },
  { route: '/modules', key: 'nav.modules', icon: 'first-aid-kit', words: 'modules optional live data' },
];

export function buildPaletteItems(bundle: Bundle, t: (key: string) => string): PaletteItem[] {
  const items: PaletteItem[] = [];
  for (const s of SCREENS) {
    items.push({
      id: `screen:${s.route}`,
      group: 'screen',
      label: t(s.key),
      keywords: s.words,
      command: { type: 'open', route: s.route },
    });
  }
  const actions: [string, string, string, Command][] = [
    ['quick-log', 'action.quickLog', 'L', { type: 'quick_log' }],
    ['ok', 'action.ok', 'K', { type: 'ok' }],
    ['report', 'action.report', 'R', { type: 'report' }],
    ['lens', 'action.lens', 'H', { type: 'toggle_lens' }],
    ['night', 'action.night', 'N', { type: 'toggle_night' }],
    ['play', 'action.play', 'T', { type: 'play' }],
    ['presenter', 'action.presenter', 'P', { type: 'presenter' }],
    ['judge', 'action.judge', 'J', { type: 'judge' }],
  ];
  for (const [id, key, hint, command] of actions) {
    items.push({ id: `action:${id}`, group: 'action', label: t(key), hint, keywords: id, command });
  }
  bundle.hazards.forEach((h, i) =>
    items.push({
      id: `hazard:${h.id}`,
      group: 'hazard',
      label: `${h.short} · ${h.name}`,
      hint: `Shift+${i + 1}`,
      keywords: 'hazard lens',
      command: { type: 'lens', hazard: h.id },
    }),
  );
  for (const m of bundle.crew) {
    items.push({
      id: `crew:${m.id}`,
      group: 'crew',
      label: `${m.role} · ${m.name}`,
      keywords: 'crew member',
      command: { type: 'member', member: m.id },
    });
  }
  for (const i of bundle.indicators) {
    items.push({
      id: `indicator:${i.id}`,
      group: 'indicator',
      label: i.name,
      keywords: 'indicator reading',
      command: { type: 'open', route: `/?indicator=${i.id}` },
    });
  }
  for (const z of bundle.zones) {
    items.push({
      id: `zone:${z.id}`,
      group: 'zone',
      label: z.name,
      keywords: 'body zone scan',
      command: { type: 'zone', zone: z.id },
    });
  }
  return items;
}

/** Every query word must appear somewhere in the label or keywords. Label-prefix matches rank first. */
export function filterPalette(items: PaletteItem[], query: string, limit = 12): PaletteItem[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return items.filter((i) => i.group === 'screen' || i.group === 'action').slice(0, limit);
  const scored: [number, PaletteItem][] = [];
  for (const item of items) {
    const label = item.label.toLowerCase();
    const hay = `${label} ${item.keywords.toLowerCase()}`;
    if (!words.every((w) => hay.includes(w))) continue;
    const first = words[0] ?? '';
    const score = label.startsWith(first) ? 0 : label.includes(first) ? 1 : 2;
    scored.push([score, item]);
  }
  return scored
    .sort((a, b) => a[0] - b[0])
    .slice(0, limit)
    .map(([, item]) => item);
}

const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 };

/** Turn a spoken phrase into a command. Returns null for anything it does not understand. */
export function parseVoice(phrase: string, bundle: Bundle): Command | null {
  const text = phrase
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return null;

  const mood = text.match(/\b(?:log )?mood (?:is |to )?(\d|one|two|three|four|five)\b/);
  if (mood?.[1]) {
    const value = NUMBER_WORDS[mood[1]] ?? Number(mood[1]);
    return value >= 1 && value <= 5 ? { type: 'log_mood', value } : null;
  }
  if (/\b(im|i am) (ok|okay)\b/.test(text)) return { type: 'ok' };
  if (/\breport\b/.test(text)) return { type: 'report' };
  if (/\bnight\b/.test(text)) return { type: 'toggle_night' };
  if (/^(play|resume)( the)?( mission| timeline| story)*$/.test(text)) return { type: 'play', on: true };
  if (/^(pause|stop)( the)?( mission| timeline| story)*$/.test(text)) return { type: 'play', on: false };

  const verb = text.match(/^(?:show|open|go to|lens) (.+)$/);
  const target = verb?.[1] ?? text;
  const hazard = bundle.hazards.find((h) => {
    const names = [h.id, h.short.toLowerCase(), h.name.toLowerCase()];
    return names.some((n) => target.includes(n) || n.split(/[\s/]/)[0] === target);
  });
  if (hazard) return { type: 'lens', hazard: hazard.id };
  const screen = SCREENS.find((s) => s.route !== '/' && target.includes(s.route.slice(1)));
  if (screen) return { type: 'open', route: screen.route };
  if (/\b(dashboard|home)\b/.test(target)) return { type: 'open', route: '/' };
  if (/\blog\b/.test(text)) return { type: 'quick_log' };
  return null;
}
