import { useEffect, useRef, useState } from 'react';
import { parseVoice } from '../lib/commands';
import { useApp, useT } from '../lib/store';
import { listenOnce, voiceSupported } from '../lib/voice';
import { Icon, type IconName } from './Icon';
import { Button } from './ui';

/** Persistent actions: every one is a single tap or key from any screen (min 52 px targets). */
export function QuickBar() {
  const t = useT();
  const run = useApp((s) => s.run);
  const set = useApp((s) => s.set);
  const lensOn = useApp((s) => s.lens.length > 0);
  const [listening, setListening] = useState(false);
  const stop = useRef<() => void>(() => undefined);
  const canListen = voiceSupported();

  useEffect(() => () => stop.current(), []);

  const voice = () => {
    if (listening) {
      stop.current();
      return;
    }
    setListening(true);
    stop.current = listenOnce({
      onPhrase: (phrase) => {
        const { bundle, toast, t: tr } = useApp.getState();
        const command = bundle ? parseVoice(phrase, bundle) : null;
        if (command) {
          run(command);
          if (command.type !== 'log_mood' && command.type !== 'ok') toast(tr('voice.heard', { phrase }));
        } else {
          toast(tr('voice.unknown', { phrase }), 'error');
        }
      },
      onError: () => useApp.getState().toast(useApp.getState().t('voice.error'), 'error'),
      onEnd: () => setListening(false),
    });
  };

  const actions: { id: string; icon: IconName; label: string; short: string; key: string; onClick: () => void; pressed?: boolean }[] = [
    { id: 'quick-log', icon: 'medical-record', label: t('action.quickLog'), short: t('short.quickLog'), key: 'L', onClick: () => run({ type: 'quick_log' }) },
    { id: 'ok', icon: 'chat', label: t('action.ok'), short: t('action.ok'), key: 'K', onClick: () => run({ type: 'ok' }) },
    { id: 'report', icon: 'medical-report', label: t('action.report'), short: t('short.report'), key: 'R', onClick: () => run({ type: 'report' }) },
    { id: 'lens', icon: 'sight', label: t('action.lens'), short: t('short.lens'), key: 'H', onClick: () => run({ type: 'toggle_lens' }), pressed: lensOn },
    { id: 'palette', icon: 'search', label: t('action.palette'), short: t('short.palette'), key: '/', onClick: () => set({ paletteOpen: true }) },
  ];

  return (
    <nav
      aria-label={t('quick.title')}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-panel/95 backdrop-blur print:hidden"
      data-testid="quick-bar"
    >
      <div className="mx-auto flex max-w-[1500px] items-stretch gap-1.5 px-2 py-1.5 sm:justify-center sm:gap-2">
        {actions.map((a) => (
          <button
            key={a.id}
            type="button"
            data-quick={a.id}
            aria-pressed={a.pressed}
            aria-keyshortcuts={a.key}
            aria-label={a.label}
            onClick={a.onClick}
            className={`flex min-h-[52px] min-w-[52px] flex-1 flex-col items-center justify-center gap-0.5 rounded-lg border px-1 text-[11px] font-semibold leading-tight transition sm:flex-none sm:flex-row sm:gap-2 sm:px-4 sm:text-sm ${
              a.id === 'ok'
                ? 'border-nominal/60 bg-nominal/10 text-nominal hover:bg-nominal/20'
                : a.pressed
                  ? 'border-accent bg-accent/15 text-accent'
                  : 'border-line bg-bg/50 text-ink hover:border-accent'
            }`}
          >
            <Icon name={a.icon} size={18} />
            <span className="sm:hidden">{a.short}</span>
            <span className="hidden sm:inline">{a.label}</span>
            <kbd className="hidden rounded border border-line px-1.5 text-xs font-normal text-muted sm:inline">{a.key}</kbd>
          </button>
        ))}
        <button
          type="button"
          data-quick="voice"
          onClick={voice}
          disabled={!canListen}
          aria-pressed={listening}
          title={canListen ? t('voice.hint') : t('voice.unsupported')}
          className={`flex min-h-[52px] min-w-[52px] flex-1 flex-col items-center justify-center gap-0.5 rounded-lg border px-1 text-[11px] font-semibold leading-tight transition disabled:opacity-40 sm:flex-none sm:flex-row sm:gap-2 sm:px-4 sm:text-sm ${
            listening ? 'border-accent bg-accent text-bg' : 'border-line bg-bg/50 text-ink hover:border-accent'
          }`}
        >
          <Icon name="mic" size={18} />
          <span>{listening ? t('voice.listening') : t('voice.button')}</span>
        </button>
      </div>
    </nav>
  );
}

const ENTRY_KEYS = ['entry.exercise', 'entry.sleptWell', 'entry.sleptPoorly', 'entry.ateWell', 'entry.tired', 'entry.energised'];

/** Choosing one of these takes the other off: they cannot both be true. */
const OPPOSITES: Record<string, string> = {
  'entry.sleptWell': 'entry.sleptPoorly',
  'entry.sleptPoorly': 'entry.sleptWell',
  'entry.tired': 'entry.energised',
  'entry.energised': 'entry.tired',
};

const Tick = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 8.5l3.2 3.2L13 4.8" />
  </svg>
);

/**
 * Quick log: open (1 tap or L), choose a mood, any number of entries and an optional note,
 * then Save sends them together. Tapping a choice again takes it off.
 */
export function QuickLog() {
  const t = useT();
  const open = useApp((s) => s.quickLogOpen);
  const viewer = useApp((s) => s.viewer);
  const crew = useApp((s) => s.bundle?.crew);
  const day = useApp((s) => s.day);
  const [mood, setMood] = useState<number | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const first = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) {
      first.current?.focus();
    } else {
      setMood(null);
      setPicked([]);
      setNote('');
    }
  }, [open]);

  if (!open) return null;
  const close = () => useApp.setState({ quickLogOpen: false });
  const toggle = (key: string) =>
    setPicked(picked.includes(key) ? picked.filter((k) => k !== key) : [...picked.filter((k) => k !== OPPOSITES[key]), key]);
  const count = (mood === null ? 0 : 1) + picked.length + (note.trim() ? 1 : 0);
  const save = () => {
    if (count === 0) return;
    useApp.getState().logMany([
      ...(mood === null ? [] : [{ kind: 'mood' as const, value: mood }]),
      // In the order they are shown, not the order they were tapped.
      ...ENTRY_KEYS.filter((key) => picked.includes(key)).map((key) => ({ kind: 'entry' as const, text: t(key) })),
      ...(note.trim() ? [{ kind: 'note' as const, text: note.trim() }] : []),
    ]);
    close();
  };
  const me = crew?.find((m) => m.id === viewer);
  const choice = (on: boolean) =>
    on ? 'border-accent bg-accent/15 text-accent' : 'border-line bg-bg/50 hover:border-accent';

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 p-3 sm:items-center" onClick={close}>
      <form
        role="dialog"
        aria-modal="true"
        aria-label={t('quicklog.title')}
        className="max-h-full w-full max-w-md overflow-y-auto rounded-2xl border border-line bg-panel p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        data-testid="quick-log"
      >
        <h2 className="font-display text-lg font-semibold">{t('quicklog.title')}</h2>
        <p className="text-sm text-muted">
          {me ? `${me.role} ${me.name}` : ''} · {t('common.day', { n: day })}
        </p>

        <h3 className="mt-4 text-sm font-semibold">{t('quicklog.mood')}</h3>
        <div className="mt-2 grid grid-cols-5 gap-2">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              ref={value === 1 ? first : undefined}
              type="button"
              data-mood={value}
              aria-pressed={mood === value}
              onClick={() => setMood(mood === value ? null : value)}
              aria-label={t('quicklog.moodValue', { n: value })}
              className={`min-h-[52px] rounded-lg border font-display text-xl font-bold ${
                mood === value ? 'border-accent bg-accent text-bg' : 'border-line bg-bg/50 hover:border-accent hover:text-accent'
              }`}
            >
              {value}
            </button>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-xs text-muted">
          <span>{t('quicklog.low')}</span>
          <span>{t('quicklog.high')}</span>
        </div>

        <h3 className="mt-4 text-sm font-semibold">{t('quicklog.entries')}</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          {ENTRY_KEYS.map((key) => {
            const on = picked.includes(key);
            return (
              <button
                key={key}
                type="button"
                data-entry={key.slice('entry.'.length)}
                aria-pressed={on}
                onClick={() => toggle(key)}
                className={`flex min-h-[52px] items-center gap-1.5 rounded-lg border px-3 text-sm ${choice(on)}`}
              >
                {on && <Tick />}
                {t(key)}
              </button>
            );
          })}
        </div>

        <label className="sr-only" htmlFor="quick-note">
          {t('quicklog.note')}
        </label>
        <input
          id="quick-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={280}
          placeholder={t('quicklog.note')}
          className="mt-4 min-h-[44px] w-full rounded-lg border border-line bg-bg px-3 text-sm placeholder:text-muted"
        />
        <p className="mt-3 text-xs text-muted">{count === 0 ? t('quicklog.pickSomething') : t('privacy.own')}</p>
        <div className="mt-3 flex items-center justify-end gap-2">
          <button type="button" onClick={close} className="min-h-[52px] px-3 text-sm text-muted underline underline-offset-2">
            {t('common.close')}
          </button>
          <Button primary className="min-h-[52px] min-w-[8rem]" disabled={count === 0} onClick={save} data-testid="quick-log-save">
            {count > 1 ? t('quicklog.saveCount', { n: count }) : t('quicklog.save')}
          </Button>
        </div>
      </form>
    </div>
  );
}
